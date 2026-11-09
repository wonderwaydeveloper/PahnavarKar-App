import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AppState } from 'react-native';
import { useAuth } from '@/hooks/use-auth';
import { useServerConnectivityStatus } from '@/hooks/use-online-status';
import { AuthApiError, fetchCurrentPlan, getStoredAuthToken, isTemporaryApiFailure, type PlanAccess } from '@/services/auth-api';
import { getCachedGuestPlanAccess, loadGuestPlanAccess } from '@/services/guest-plan-access';
import { clearCachedPlanAccess, getCachedPlanAccess, getPlanAccessValidUntil, saveCachedPlanAccess } from '@/services/plan-access-cache';
import { CACHE_KEYS, CACHE_POLICY } from '@/services/cache-policy';
import { getServerConnectivityStatus } from '@/services/server-connectivity';
import { getUserFacingErrorMessage } from '@/services/user-facing-error';
import { PlanAccessContext } from './plan-access.context';

interface PlanAccessProviderProps {
    children: ReactNode;
}

interface PlanAccessResult {
    plan: PlanAccess;
    validUntil: number | null;
    isOffline: boolean;
}

const ACCESS_EXPIRED_MESSAGE = 'اعتبار دسترسی تأییدشده به پایان رسیده است. برای بررسی دوباره به سرور متصل شوید.';

async function loadPlanAccess(user: ReturnType<typeof useAuth>['user']): Promise<PlanAccessResult> {
    const serverStatus = getServerConnectivityStatus();
    const token = user ? await getStoredAuthToken() : null;
    if (user && !token) {
        throw new Error('نشست کاربری برای دریافت سطح دسترسی در دسترس نیست. دوباره وارد شوید.');
    }

    if (user && token) {
        if (serverStatus !== 'connected') {
            const cached = await getCachedPlanAccess(user.id, token);
            if (cached && cached.validUntil > Date.now()) {
                return { plan: cached.plan, validUntil: cached.validUntil, isOffline: true };
            }

            throw new AuthApiError(
                serverStatus === 'connecting'
                    ? 'در حال بررسی اتصال به سرور هستیم.'
                    : 'سرور در دسترس نیست و دسترسی آفلاین معتبری در دستگاه ذخیره نشده است.',
                0,
            );
        }

        let response: Awaited<ReturnType<typeof fetchCurrentPlan>>;
        try {
            response = await fetchCurrentPlan(token);
        } catch (error) {
            if (error instanceof AuthApiError && (error.status === 401 || error.status === 403)) {
                await clearCachedPlanAccess();
                throw error;
            }

            if (!isTemporaryApiFailure(error)) {
                throw error;
            }

            const cached = await getCachedPlanAccess(user.id, token);
            if (cached && cached.validUntil > Date.now()) {
                return { plan: cached.plan, validUntil: cached.validUntil, isOffline: true };
            }

            throw new AuthApiError('برای بررسی دسترسی پلن به سرور متصل شوید و دوباره تلاش کنید.', 0);
        }

        const subscriptionEndsAt = response.subscription?.ends_at ?? null;
        const validUntil = getPlanAccessValidUntil(subscriptionEndsAt);
        try {
            const cached = await saveCachedPlanAccess(user.id, token, response.plan, subscriptionEndsAt);
            return { plan: response.plan, validUntil: cached.validUntil, isOffline: false };
        } catch (error) {
            console.warn('ذخیرهٔ دسترسی تأییدشدهٔ پلن برای حالت آفلاین ناموفق بود.', error);
            return { plan: response.plan, validUntil, isOffline: false };
        }
    }

    if (serverStatus !== 'connected') {
        const cached = await getCachedGuestPlanAccess();
        if (cached) {
            return { ...cached, isOffline: true };
        }

        throw new AuthApiError(
            serverStatus === 'connecting'
                ? 'در حال بررسی اتصال به سرور هستیم.'
                : 'سرور در دسترس نیست و دسترسی آفلاین معتبری در دستگاه ذخیره نشده است.',
            0,
        );
    }

    const guestAccess = await loadGuestPlanAccess();
    return guestAccess;
}

export function PlanAccessProvider({ children }: PlanAccessProviderProps) {
    const { user, isLoading: authLoading } = useAuth();
    const serverStatus = useServerConnectivityStatus();
    const [now, setNow] = useState(Date.now);
    const { refetch, ...query } = useQuery({
        queryKey: CACHE_KEYS.planAccess(user?.id ?? 'guest'),
        queryFn: () => loadPlanAccess(user),
        enabled: !authLoading,
        networkMode: 'always',
        staleTime: CACHE_POLICY.query.resources.planAccess.staleTimeMs,
        retryOnMount: false,
        refetchOnMount: (query) => !(query.state.error instanceof AuthApiError && query.state.error.status === 429),
        refetchOnReconnect: (query) => !(query.state.error instanceof AuthApiError && query.state.error.status === 429),
        refetchOnWindowFocus: (query) => !(query.state.error instanceof AuthApiError && query.state.error.status === 429),
    });

    const validUntil = query.data?.validUntil ?? null;
    const accessExpired = validUntil !== null && validUntil <= now;
    const canUseVerifiedMemoryCache = query.error !== null
        && isTemporaryApiFailure(query.error)
        && query.data !== undefined
        && query.data.validUntil !== null
        && query.data.validUntil > now;
    const isUsingOfflineData = query.data !== undefined
        && (query.data.isOffline
            || serverStatus !== 'connected'
            || (query.error !== null && isTemporaryApiFailure(query.error)));
    const waitingForServer = isTemporaryApiFailure(query.error)
        && (serverStatus === 'connecting' || query.isFetching);

    useEffect(() => {
        const updateNow = () => setNow(Date.now());
        const subscription = AppState.addEventListener('change', updateNow);

        if (validUntil === null) {
            return () => subscription.remove();
        }

        const remaining = validUntil - Date.now();
        if (remaining <= 0) {
            updateNow();
            void refetch();
            return () => subscription.remove();
        }

        const timer = setTimeout(() => {
            updateNow();
            void refetch();
        }, remaining);

        return () => {
            clearTimeout(timer);
            subscription.remove();
        };
    }, [refetch, validUntil]);

    const refresh = useCallback(async () => {
        const result = await refetch();
        return result.isSuccess && result.data !== undefined && !result.data.isOffline;
    }, [refetch]);

    return (
        <PlanAccessContext.Provider value={{
            planAccess: !authLoading && (!query.error || canUseVerifiedMemoryCache) && !accessExpired ? query.data?.plan ?? null : null,
            isUsingOfflineData,
            isLoading: authLoading || query.isPending || (accessExpired && query.isFetching) || waitingForServer,
            error: query.error && !canUseVerifiedMemoryCache && !waitingForServer
                ? getUserFacingErrorMessage(query.error, 'دریافت دسترسی پلن ناموفق بود.')
                : accessExpired
                    ? ACCESS_EXPIRED_MESSAGE
                    : null,
            refresh,
        }}>
            {children}
        </PlanAccessContext.Provider>
    );
}
