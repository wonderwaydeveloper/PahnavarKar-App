import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AuthApiError, changePhone as changePhoneRequest, deleteAccount as deleteAccountRequest, deleteProfilePhoto as deleteProfilePhotoRequest, fetchCurrentUser, fetchDevices, getDeviceId, getStoredAuthToken, removeStoredAuthToken, revokeAllSessions, revokeCurrentSession, revokeDevice, sendEmailVerificationCode as sendEmailVerificationCodeRequest, storeAuthToken, updateInactivityDeletion as updateInactivityDeletionRequest, updateProfile as updateProfileRequest, uploadProfilePhoto as uploadProfilePhotoRequest, verifyEmail as verifyEmailRequest, verifyOtp, type AuthDevice, type AuthenticatedUser } from '@/services/auth-api';
import { AuthContext, type AuthContextType } from './auth.context';

interface AuthProviderProps {
    children: React.ReactNode;
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'خطای نامشخص در احراز هویت رخ داد.';
}

export function AuthProvider({ children }: AuthProviderProps) {
    const [user, setUser] = useState<AuthenticatedUser | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [sessionError, setSessionError] = useState<string | null>(null);

    const withActiveSession = useCallback(async <T,>(request: Promise<T>): Promise<T> => {
        try {
            return await request;
        } catch (error) {
            if (error instanceof AuthApiError && error.status === 401) {
                setUser(null);
                setToken(null);
                setSessionError(null);
                await removeStoredAuthToken();
            }
            throw error;
        }
    }, []);

    const refreshUser = useCallback(async () => {
        const savedToken = token ?? await getStoredAuthToken();
        if (!savedToken) {
            setUser(null);
            setToken(null);
            setSessionError(null);
            return;
        }

        try {
            const currentUser = await fetchCurrentUser(savedToken);
            setToken(savedToken);
            setUser(currentUser);
            setSessionError(null);
        } catch (error) {
            if (error instanceof AuthApiError && error.status === 401) {
                await removeStoredAuthToken();
                setToken(null);
                setUser(null);
            }
            throw error;
        }
    }, [token]);

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
                    }
                }
            } catch (error) {
                if (error instanceof AuthApiError && error.status === 401) {
                    await removeStoredAuthToken();
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
    }, []);

    const signInWithOtp = useCallback<AuthContextType['signInWithOtp']>(async (input) => {
        const result = await verifyOtp(input);
        if (result.status === 'profile_required') {
            return 'profile_required';
        }

        const session = result;

        try {
            await storeAuthToken(session.token);
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

        setToken(session.token);
        setUser(session.user);
        setSessionError(null);
        return 'authenticated';
    }, []);

    const uploadProfilePhoto = useCallback(async (uri: string) => {
        const activeToken = token ?? await getStoredAuthToken();
        if (!activeToken) {
            throw new Error('برای بارگذاری تصویر ابتدا وارد حساب شوید.');
        }

        const updatedUser = await withActiveSession(uploadProfilePhotoRequest(activeToken, uri));
        setToken(activeToken);
        setUser(updatedUser);
    }, [token, withActiveSession]);

    const updateProfile = useCallback(async (input: { name: string; email: string | null }) => {
        const activeToken = token ?? await getStoredAuthToken();
        if (!activeToken) {
            throw new Error('برای ویرایش پروفایل ابتدا وارد حساب شوید.');
        }

        const updatedUser = await withActiveSession(updateProfileRequest(activeToken, input));
        setToken(activeToken);
        setUser(updatedUser);
    }, [token, withActiveSession]);

    const updateInactivityDeletion = useCallback(async (periodMonths: 6 | 12 | 18 | null) => {
        const activeToken = token ?? await getStoredAuthToken();
        if (!activeToken) {
            throw new Error('برای تغییر تنظیم حذف خودکار ابتدا وارد حساب شوید.');
        }

        const updatedUser = await withActiveSession(updateInactivityDeletionRequest(activeToken, periodMonths));
        setToken(activeToken);
        setUser(updatedUser);
    }, [token, withActiveSession]);

    const removeProfilePhoto = useCallback(async () => {
        const activeToken = token ?? await getStoredAuthToken();
        if (!activeToken) {
            throw new Error('برای ویرایش پروفایل ابتدا وارد حساب شوید.');
        }

        const updatedUser = await withActiveSession(deleteProfilePhotoRequest(activeToken));
        setToken(activeToken);
        setUser(updatedUser);
    }, [token, withActiveSession]);

    const sendEmailVerificationCode = useCallback(async () => {
        const activeToken = token ?? await getStoredAuthToken();
        if (!activeToken) {
            throw new Error('برای تأیید ایمیل ابتدا وارد حساب شوید.');
        }

        const response = await withActiveSession(sendEmailVerificationCodeRequest(activeToken));
        return { resend_after: response.resend_after };
    }, [token, withActiveSession]);

    const verifyEmail = useCallback(async (code: string) => {
        const activeToken = token ?? await getStoredAuthToken();
        if (!activeToken) {
            throw new Error('برای تأیید ایمیل ابتدا وارد حساب شوید.');
        }

        const updatedUser = await withActiveSession(verifyEmailRequest(activeToken, code));
        setToken(activeToken);
        setUser(updatedUser);
    }, [token, withActiveSession]);

    const changePhone = useCallback(async (phone: string, code: string) => {
        const activeToken = token ?? await getStoredAuthToken();
        if (!activeToken) {
            throw new Error('برای تغییر شماره ابتدا وارد حساب شوید.');
        }

        const updatedUser = await withActiveSession(changePhoneRequest(activeToken, phone, code));
        setToken(activeToken);
        setUser(updatedUser);
    }, [token, withActiveSession]);

    const deleteAccount = useCallback(async (code: string) => {
        const activeToken = token ?? await getStoredAuthToken();
        if (!activeToken) {
            throw new Error('برای حذف حساب ابتدا وارد شوید.');
        }

        await withActiveSession(deleteAccountRequest(activeToken, code));
        setUser(null);
        setToken(null);
        await removeStoredAuthToken();
    }, [token, withActiveSession]);

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

        setUser(null);
        setToken(null);
        await removeStoredAuthToken();
    }, [token]);

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

        setUser(null);
        setToken(null);
        await removeStoredAuthToken();
    }, [token]);

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
                setUser(null);
                setToken(null);
                await removeStoredAuthToken();
            }
        })());
    }, [token, withActiveSession]);

    const value = useMemo<AuthContextType>(() => ({
        user,
        isLoading,
        sessionError,
        refreshUser,
        signInWithOtp,
        uploadProfilePhoto,
        removeProfilePhoto,
        updateProfile,
        updateInactivityDeletion,
        sendEmailVerificationCode,
        verifyEmail,
        changePhone,
        deleteAccount,
        signOut,
        signOutAll,
        getDevices,
        revokeUserDevice,
    }), [changePhone, deleteAccount, getDevices, isLoading, refreshUser, removeProfilePhoto, revokeUserDevice, sendEmailVerificationCode, sessionError, signInWithOtp, signOut, signOutAll, updateInactivityDeletion, updateProfile, uploadProfilePhoto, user, verifyEmail]);

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
