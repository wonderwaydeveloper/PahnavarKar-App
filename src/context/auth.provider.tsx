import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { AppState } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { AuthApiError, changePhone as changePhoneRequest, deleteAccount as deleteAccountRequest, deleteProfilePhoto as deleteProfilePhotoRequest, fetchCurrentUser, fetchDevices, getCachedAuthenticatedUser, getDeviceId, getStoredAuthToken, isTemporaryApiFailure, removeStoredAuthToken, revokeAllSessions, revokeCurrentSession, revokeDevice, storeAuthToken, storeCachedAuthenticatedUser, updateInactivityDeletion as updateInactivityDeletionRequest, updateProfile as updateProfileRequest, uploadProfilePhoto as uploadProfilePhotoRequest, verifyOtp, verifyTwoFactorLogin as verifyTwoFactorLoginRequest, type AuthenticatedUser, type AuthDevice } from '@/services/auth-api';
import { clearCachedPlanAccess } from '@/services/plan-access-cache';
import { clearOfflineCacheForUser } from '@/services/offline-cache';
import { CACHE_KEYS } from '@/services/cache-policy';
import { getUserFacingErrorMessage } from '@/services/user-facing-error';
import { useAuthSessionStore } from '@/stores/auth-session.store';
import { AuthContext, type AuthContextType } from './auth.context';

interface AuthProviderProps {
    children: React.ReactNode;
}

function errorMessage(error: unknown): string {
    return getUserFacingErrorMessage(error, 'خطای نامشخص در احراز هویت رخ داد.');
}

async function clearUserOfflineCacheSafely(userId: number | undefined): Promise<void> {
    if (userId === undefined) return;
    try {
        await clearOfflineCacheForUser(userId);
    } catch (error) {
        console.error('پاک‌کردن داده‌های آفلاین کاربر ناموفق بود.', error);
    }
}

export function AuthProvider({ children }: AuthProviderProps) {
    const queryClient = useQueryClient();
    const user = useAuthSessionStore((state) => state.user);
    const token = useAuthSessionStore((state) => state.token);
    const isLoading = useAuthSessionStore((state) => state.isLoading);
    const sessionError = useAuthSessionStore((state) => state.sessionError);
    const accountSuspension = useAuthSessionStore((state) => state.accountSuspension);
    const setUser = useAuthSessionStore((state) => state.setUser);
    const setToken = useAuthSessionStore((state) => state.setToken);
    const setIsLoading = useAuthSessionStore((state) => state.setLoading);
    const setSessionError = useAuthSessionStore((state) => state.setSessionError);
    const setAccountSuspension = useAuthSessionStore((state) => state.setAccountSuspension);
    const clearSession = useAuthSessionStore((state) => state.clearSession);
    const previousAuthenticatedUserId = useRef(user?.id ?? null);

    useEffect(() => {
        const nextUserId = user?.id ?? null;
        const previousUserId = previousAuthenticatedUserId.current;
        if (previousUserId !== null && nextUserId !== null && previousUserId !== nextUserId) {
            void clearUserOfflineCacheSafely(previousUserId);
        }
        previousAuthenticatedUserId.current = nextUserId;
    }, [user?.id]);

    const clearPlanAccessQueries = useCallback(async () => {
        await queryClient.cancelQueries({ queryKey: CACHE_KEYS.planAccessPrefix });
        queryClient.removeQueries({ queryKey: CACHE_KEYS.planAccessPrefix });
    }, [queryClient]);

    const withActiveSession = useCallback(async <T,>(request: Promise<T>): Promise<T> => {
        try {
            return await request;
        } catch (error) {
            if (error instanceof AuthApiError && error.code === 'account_disabled') {
                const activeToken = token ?? await getStoredAuthToken();
                let cachedUser: AuthenticatedUser | null = null;
                try {
                    cachedUser = activeToken ? await getCachedAuthenticatedUser(activeToken) : null;
                } catch (cacheError) {
                    console.error('بازیابی اطلاعات حساب معلق از حافظهٔ امن ناموفق بود.', cacheError);
                }
                if (activeToken) setToken(activeToken);
                if (cachedUser) setUser(cachedUser);
                setAccountSuspension({ reason: error.reason, until: error.restrictedUntil });
                setSessionError(null);
            } else if (
                error instanceof AuthApiError
                && error.code === 'account_capability_restricted'
            ) {
                const currentUser = useAuthSessionStore.getState().user;
                const capability = error.capability;
                if (
                    currentUser
                    && (capability === 'financial' || capability === 'profile' || capability === 'security')
                ) {
                    const capabilities = new Set<NonNullable<AuthenticatedUser['restricted_capabilities']>[number]>(
                        currentUser.restricted_capabilities ?? [],
                    );
                    capabilities.add(capability);
                    const updatedUser: AuthenticatedUser = {
                        ...currentUser,
                        restricted_capabilities: [...capabilities],
                        restriction_reason: error.reason,
                        restricted_until: error.restrictedUntil,
                    };
                    setUser(updatedUser);
                    const activeToken = token ?? await getStoredAuthToken();
                    if (activeToken) {
                        try {
                            await storeCachedAuthenticatedUser(updatedUser, activeToken);
                        } catch (cacheError) {
                            console.error('ذخیرهٔ وضعیت محدودیت حساب در حافظهٔ امن ناموفق بود.', cacheError);
                        }
                    }
                }
            } else if (error instanceof AuthApiError && error.status === 401) {
                await clearUserOfflineCacheSafely(useAuthSessionStore.getState().user?.id);
                clearSession();
                await removeStoredAuthToken();
                await clearCachedPlanAccess();
                await clearPlanAccessQueries();
            }
            throw error;
        }
    }, [clearPlanAccessQueries, clearSession, setAccountSuspension, setSessionError, setToken, setUser, token]);

    const refreshUser = useCallback(async () => {
        const savedToken = token ?? await getStoredAuthToken();
        if (!savedToken) {
            await clearUserOfflineCacheSafely(useAuthSessionStore.getState().user?.id);
            clearSession();
            setSessionError(null);
            return;
        }

        try {
            const currentUser = await fetchCurrentUser(savedToken);
            setToken(savedToken);
            setUser(currentUser);
            setAccountSuspension(null);
            setSessionError(null);
            await storeCachedAuthenticatedUser(currentUser, savedToken);
        } catch (error) {
            if (error instanceof AuthApiError && error.code === 'account_disabled') {
                const cachedUser = await getCachedAuthenticatedUser(savedToken);
                setToken(savedToken);
                if (cachedUser) setUser(cachedUser);
                setAccountSuspension({ reason: error.reason, until: error.restrictedUntil });
                setSessionError(null);
            } else if (error instanceof AuthApiError && (error.status === 401 || error.status === 403)) {
                await clearUserOfflineCacheSafely(useAuthSessionStore.getState().user?.id);
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
    }, [clearPlanAccessQueries, clearSession, setAccountSuspension, setSessionError, setToken, setUser, token]);

    useEffect(() => {
        if (!token) return;

        const subscription = AppState.addEventListener('change', (state) => {
            if (state === 'active') {
                void refreshUser().catch((error: unknown) => {
                    if (!(error instanceof AuthApiError && error.code === 'account_disabled')) {
                        console.warn('همگام‌سازی وضعیت حساب پس از بازگشت به برنامه ناموفق بود.', error);
                    }
                });
            }
        });

        return () => subscription.remove();
    }, [refreshUser, token]);

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
                        setAccountSuspension(null);
                        setSessionError(null);
                        await storeCachedAuthenticatedUser(currentUser, savedToken);
                    }
                }
            } catch (error) {
                if (error instanceof AuthApiError && error.code === 'account_disabled') {
                    const savedToken = await getStoredAuthToken();
                    let cachedUser: AuthenticatedUser | null = null;
                    try {
                        cachedUser = savedToken ? await getCachedAuthenticatedUser(savedToken) : null;
                    } catch (cacheError) {
                        console.error('بازیابی اطلاعات حساب معلق از حافظهٔ امن ناموفق بود.', cacheError);
                    }
                    if (isMounted && savedToken) {
                        setToken(savedToken);
                        if (cachedUser) setUser(cachedUser);
                        setAccountSuspension({ reason: error.reason, until: error.restrictedUntil });
                        setSessionError(null);
                    }
                } else if (error instanceof AuthApiError && (error.status === 401 || error.status === 403)) {
                    await clearUserOfflineCacheSafely(useAuthSessionStore.getState().user?.id);
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
                if (isMounted && !(error instanceof AuthApiError && error.code === 'account_disabled')) {
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
    }, [clearPlanAccessQueries, clearSession, setAccountSuspension, setIsLoading, setSessionError, setToken, setUser]);

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

        const previousUserId = useAuthSessionStore.getState().user?.id;
        if (previousUserId !== undefined && previousUserId !== session.user.id) {
            await clearUserOfflineCacheSafely(previousUserId);
        }
        await clearPlanAccessQueries();
        setToken(session.token);
        setUser(session.user);
        setAccountSuspension(null);
        setSessionError(null);
        return 'authenticated';
    }, [clearPlanAccessQueries, setAccountSuspension, setSessionError, setToken, setUser]);

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

        const previousUserId = useAuthSessionStore.getState().user?.id;
        if (previousUserId !== undefined && previousUserId !== session.user.id) {
            await clearUserOfflineCacheSafely(previousUserId);
        }
        await clearPlanAccessQueries();
        setToken(session.token);
        setUser(session.user);
        setAccountSuspension(null);
        setSessionError(null);
    }, [clearPlanAccessQueries, setAccountSuspension, setSessionError, setToken, setUser]);

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
        await clearUserOfflineCacheSafely(useAuthSessionStore.getState().user?.id);
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

        await clearUserOfflineCacheSafely(useAuthSessionStore.getState().user?.id);
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

        await clearUserOfflineCacheSafely(useAuthSessionStore.getState().user?.id);
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
                await clearUserOfflineCacheSafely(useAuthSessionStore.getState().user?.id);
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
        accountSuspension,
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
    }), [accountSuspension, changePhone, deleteAccount, getDevices, isLoading, refreshUser, removeProfilePhoto, revokeUserDevice, sessionError, signInWithOtp, signOut, signOutAll, updateInactivityDeletion, updateProfile, uploadProfilePhoto, user, verifyTwoFactorLogin]);

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
