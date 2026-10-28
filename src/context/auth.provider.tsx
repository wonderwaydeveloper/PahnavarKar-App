import React, { useCallback, useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AuthApiError, changePhone as changePhoneRequest, deleteAccount as deleteAccountRequest, deleteProfilePhoto as deleteProfilePhotoRequest, fetchCurrentUser, fetchDevices, getCachedAuthenticatedUser, getDeviceId, getStoredAuthToken, isTemporaryApiFailure, removeStoredAuthToken, revokeAllSessions, revokeCurrentSession, revokeDevice, storeAuthToken, storeCachedAuthenticatedUser, updateInactivityDeletion as updateInactivityDeletionRequest, updateProfile as updateProfileRequest, uploadProfilePhoto as uploadProfilePhotoRequest, verifyOtp, verifyTwoFactorLogin as verifyTwoFactorLoginRequest, type AuthenticatedUser, type AuthDevice } from '@/services/auth-api';
import { clearCachedPlanAccess } from '@/services/plan-access-cache';
import { getUserFacingErrorMessage } from '@/services/user-facing-error';
import { useAuthSessionStore } from '@/stores/auth-session.store';
import { AuthContext, type AuthContextType } from './auth.context';

interface AuthProviderProps {
    children: React.ReactNode;
}

function errorMessage(error: unknown): string {
    return getUserFacingErrorMessage(error, 'خطای نامشخص در احراز هویت رخ داد.');
}

export function AuthProvider({ children }: AuthProviderProps) {
    const queryClient = useQueryClient();
    const user = useAuthSessionStore((state) => state.user);
    const token = useAuthSessionStore((state) => state.token);
    const isLoading = useAuthSessionStore((state) => state.isLoading);
    const sessionError = useAuthSessionStore((state) => state.sessionError);
    const setUser = useAuthSessionStore((state) => state.setUser);
    const setToken = useAuthSessionStore((state) => state.setToken);
    const setIsLoading = useAuthSessionStore((state) => state.setLoading);
    const setSessionError = useAuthSessionStore((state) => state.setSessionError);
    const clearSession = useAuthSessionStore((state) => state.clearSession);

    const clearPlanAccessQueries = useCallback(async () => {
        await queryClient.cancelQueries({ queryKey: ['plan-access'] });
        queryClient.removeQueries({ queryKey: ['plan-access'] });
    }, [queryClient]);

    const withActiveSession = useCallback(async <T,>(request: Promise<T>): Promise<T> => {
        try {
            return await request;
        } catch (error) {
            if (error instanceof AuthApiError && error.status === 401) {
                clearSession();
                await removeStoredAuthToken();
                await clearCachedPlanAccess();
                await clearPlanAccessQueries();
            }
            throw error;
        }
    }, [clearPlanAccessQueries, clearSession]);

    const refreshUser = useCallback(async () => {
        const savedToken = token ?? await getStoredAuthToken();
        if (!savedToken) {
            clearSession();
            setSessionError(null);
            return;
        }

        try {
            const currentUser = await fetchCurrentUser(savedToken);
            setToken(savedToken);
            setUser(currentUser);
            setSessionError(null);
            await storeCachedAuthenticatedUser(currentUser, savedToken);
        } catch (error) {
            if (error instanceof AuthApiError && (error.status === 401 || error.status === 403)) {
                await removeStoredAuthToken();
                await clearCachedPlanAccess();
                await clearPlanAccessQueries();
                clearSession();
                setSessionError(null);
            } else {
                if (isTemporaryApiFailure(error)) {
                    const cachedUser = await getCachedAuthenticatedUser(savedToken);
                    if (cachedUser) {
                        setToken(savedToken);
                        setUser(cachedUser);
                    }
                }
                setSessionError(errorMessage(error));
            }
            throw error;
        }
    }, [clearPlanAccessQueries, clearSession, setSessionError, setToken, setUser, token]);

    useEffect(() => {
        let isMounted = true;

        const restoreSession = async () => {
            try {
                const savedToken = await getStoredAuthToken();
                if (savedToken) {
                    const currentUser = await fetchCurrentUser(savedToken);
                    if (isMounted) {
                        setToken(savedToken);
                        setUser(currentUser);
                        setSessionError(null);
                        await storeCachedAuthenticatedUser(currentUser, savedToken);
                    }
                }
            } catch (error) {
                if (error instanceof AuthApiError && (error.status === 401 || error.status === 403)) {
                    await removeStoredAuthToken();
                    await clearCachedPlanAccess();
                    await clearPlanAccessQueries();
                    clearSession();
                    setSessionError(null);
                } else if (isTemporaryApiFailure(error)) {
                    const savedToken = await getStoredAuthToken();
                    let cachedUser: AuthenticatedUser | null = null;
                    try {
                        cachedUser = savedToken ? await getCachedAuthenticatedUser(savedToken) : null;
                    } catch (cacheError) {
                        console.error('بازیابی هویت آفلاین از حافظهٔ امن ناموفق بود.', cacheError);
                    }
                    if (isMounted && savedToken && cachedUser) {
                        setToken(savedToken);
                        setUser(cachedUser);
                    }
                }
                if (isMounted) {
                    setSessionError(errorMessage(error));
                }
            } finally {
                if (isMounted) {
                    setIsLoading(false);
                }
            }
        };

        void restoreSession();

        return () => {
            isMounted = false;
        };
    }, [clearPlanAccessQueries, clearSession, setIsLoading, setSessionError, setToken, setUser]);

    const signInWithOtp = useCallback<AuthContextType['signInWithOtp']>(async (input) => {
        const result = await verifyOtp(input);
        if (result.status === 'profile_required') {
            return 'profile_required';
        }
        if (result.status === 'two_factor_required') {
            return { status: result.status, challengeToken: result.challenge_token };
        }

        const session = result;

        try {
            await storeAuthToken(session.token, session.user);
        } catch (storageError) {
            try {
                await revokeCurrentSession(session.token);
            } catch (revokeError) {
                throw new AggregateError(
                    [storageError, revokeError],
                    'نشست ایجاد شد، اما ذخیرهٔ امن توکن و لغو نشست ناموفق بود.',
                );
            }
            throw storageError;
        }

        await clearPlanAccessQueries();
        setToken(session.token);
        setUser(session.user);
        setSessionError(null);
        return 'authenticated';
    }, [clearPlanAccessQueries, setSessionError, setToken, setUser]);

    const verifyTwoFactorLogin = useCallback(async (challengeToken: string, code: string) => {
        const session = await verifyTwoFactorLoginRequest(challengeToken, code);
        try {
            await storeAuthToken(session.token, session.user);
        } catch (storageError) {
            try {
                await revokeCurrentSession(session.token);
            } catch (revokeError) {
                throw new AggregateError(
                    [storageError, revokeError],
                    'نشست ایجاد شد، اما ذخیرهٔ امن توکن و لغو نشست ناموفق بود.',
                );
            }
            throw storageError;
        }

        await clearPlanAccessQueries();
        setToken(session.token);
        setUser(session.user);
        setSessionError(null);
    }, [clearPlanAccessQueries, setSessionError, setToken, setUser]);

    const uploadProfilePhoto = useCallback(async (uri: string) => {
        const activeToken = token ?? await getStoredAuthToken();
        if (!activeToken) {
            throw new Error('برای بارگذاری تصویر ابتدا وارد حساب شوید.');
        }

        const updatedUser = await withActiveSession(uploadProfilePhotoRequest(activeToken, uri));
        setToken(activeToken);
        setUser(updatedUser);
    }, [setToken, setUser, token, withActiveSession]);

    const updateProfile = useCallback(async (input: { name: string }) => {
        const activeToken = token ?? await getStoredAuthToken();
        if (!activeToken) {
            throw new Error('برای ویرایش پروفایل ابتدا وارد حساب شوید.');
        }

        const updatedUser = await withActiveSession(updateProfileRequest(activeToken, input));
        setToken(activeToken);
        setUser(updatedUser);
    }, [setToken, setUser, token, withActiveSession]);

    const updateInactivityDeletion = useCallback(async (periodMonths: 6 | 12 | 18 | null) => {
        const activeToken = token ?? await getStoredAuthToken();
        if (!activeToken) {
            throw new Error('برای تغییر تنظیم حذف خودکار ابتدا وارد حساب شوید.');
        }

        const updatedUser = await withActiveSession(updateInactivityDeletionRequest(activeToken, periodMonths));
        setToken(activeToken);
        setUser(updatedUser);
    }, [setToken, setUser, token, withActiveSession]);

    const removeProfilePhoto = useCallback(async () => {
        const activeToken = token ?? await getStoredAuthToken();
        if (!activeToken) {
            throw new Error('برای ویرایش پروفایل ابتدا وارد حساب شوید.');
        }

        const updatedUser = await withActiveSession(deleteProfilePhotoRequest(activeToken));
        setToken(activeToken);
        setUser(updatedUser);
    }, [setToken, setUser, token, withActiveSession]);

    const changePhone = useCallback(async (phone: string, code: string) => {
        const activeToken = token ?? await getStoredAuthToken();
        if (!activeToken) {
            throw new Error('برای تغییر شماره ابتدا وارد حساب شوید.');
        }

        const updatedUser = await withActiveSession(changePhoneRequest(activeToken, phone, code));
        setToken(activeToken);
        setUser(updatedUser);
    }, [setToken, setUser, token, withActiveSession]);

    const deleteAccount = useCallback(async (code: string) => {
        const activeToken = token ?? await getStoredAuthToken();
        if (!activeToken) {
            throw new Error('برای حذف حساب ابتدا وارد شوید.');
        }

        await withActiveSession(deleteAccountRequest(activeToken, code));
        clearSession();
        await removeStoredAuthToken();
        await clearCachedPlanAccess();
        await clearPlanAccessQueries();
    }, [clearPlanAccessQueries, clearSession, token, withActiveSession]);

    const signOut = useCallback(async () => {
        const activeToken = token ?? await getStoredAuthToken();
        if (activeToken) {
            try {
                await revokeCurrentSession(activeToken);
            } catch (error) {
                if (!(error instanceof AuthApiError && error.status === 401)) {
                    throw error;
                }
            }
        }

        clearSession();
        await removeStoredAuthToken();
        await clearCachedPlanAccess();
        await clearPlanAccessQueries();
    }, [clearPlanAccessQueries, clearSession, token]);

    const signOutAll = useCallback(async () => {
        const activeToken = token ?? await getStoredAuthToken();
        if (activeToken) {
            try {
                await revokeAllSessions(activeToken);
            } catch (error) {
                if (!(error instanceof AuthApiError && error.status === 401)) {
                    throw error;
                }
            }
        }

        clearSession();
        await removeStoredAuthToken();
        await clearCachedPlanAccess();
        await clearPlanAccessQueries();
    }, [clearPlanAccessQueries, clearSession, token]);

    const getDevices = useCallback(async (): Promise<AuthDevice[]> => {
        const activeToken = token ?? await getStoredAuthToken();
        if (!activeToken) {
            throw new Error('برای مشاهدهٔ دستگاه‌ها ابتدا وارد حساب شوید.');
        }

        return withActiveSession(fetchDevices(activeToken));
    }, [token, withActiveSession]);

    const revokeUserDevice = useCallback(async (deviceId: number) => {
        const activeToken = token ?? await getStoredAuthToken();
        if (!activeToken) {
            throw new Error('برای مدیریت دستگاه‌ها ابتدا وارد حساب شوید.');
        }

        await withActiveSession((async () => {
            const currentDeviceId = await getDeviceId();
            const activeDevices = await fetchDevices(activeToken);
            const deviceToRevoke = activeDevices.find((device) => device.id === deviceId);
            await revokeDevice(activeToken, deviceId);
            if (deviceToRevoke?.device_id === currentDeviceId) {
                clearSession();
                await removeStoredAuthToken();
                await clearCachedPlanAccess();
                await clearPlanAccessQueries();
            }
        })());
    }, [clearPlanAccessQueries, clearSession, token, withActiveSession]);

    const value = useMemo<AuthContextType>(() => ({
        user,
        isLoading,
        sessionError,
        refreshUser,
        signInWithOtp,
        verifyTwoFactorLogin,
        uploadProfilePhoto,
        removeProfilePhoto,
        updateProfile,
        updateInactivityDeletion,
        changePhone,
        deleteAccount,
        signOut,
        signOutAll,
        getDevices,
        revokeUserDevice,
    }), [changePhone, deleteAccount, getDevices, isLoading, refreshUser, removeProfilePhoto, revokeUserDevice, sessionError, signInWithOtp, signOut, signOutAll, updateInactivityDeletion, updateProfile, uploadProfilePhoto, user, verifyTwoFactorLogin]);

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
