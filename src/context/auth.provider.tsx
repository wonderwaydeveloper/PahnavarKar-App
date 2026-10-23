import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AuthApiError, fetchCurrentUser, fetchDevices, getDeviceId, getStoredAuthToken, removeStoredAuthToken, revokeAllSessions, revokeCurrentSession, revokeDevice, storeAuthToken, verifyOtp, type AuthDevice, type AuthenticatedUser } from '@/services/auth-api';
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
        const session = await verifyOtp(input);

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
    }, []);

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

        return fetchDevices(activeToken);
    }, [token]);

    const revokeUserDevice = useCallback(async (deviceId: number) => {
        const activeToken = token ?? await getStoredAuthToken();
        if (!activeToken) {
            throw new Error('برای مدیریت دستگاه‌ها ابتدا وارد حساب شوید.');
        }

        const currentDeviceId = await getDeviceId();
        const activeDevices = await fetchDevices(activeToken);
        const deviceToRevoke = activeDevices.find((device) => device.id === deviceId);
        await revokeDevice(activeToken, deviceId);
        if (deviceToRevoke?.device_id === currentDeviceId) {
            setUser(null);
            setToken(null);
            await removeStoredAuthToken();
        }
    }, [token]);

    const value = useMemo<AuthContextType>(() => ({
        user,
        isLoading,
        sessionError,
        refreshUser,
        signInWithOtp,
        signOut,
        signOutAll,
        getDevices,
        revokeUserDevice,
    }), [getDevices, isLoading, refreshUser, revokeUserDevice, sessionError, signInWithOtp, signOut, signOutAll, user]);

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
