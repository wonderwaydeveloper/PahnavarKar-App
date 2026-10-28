import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AppState } from 'react-native';
import { useAuth } from '@/hooks/use-auth';
import { AuthApiError, fetchCurrentPlan, fetchPlanCatalog, getStoredAuthToken, isTemporaryApiFailure, shouldRetryApiQuery, type PlanAccess } from '@/services/auth-api';
import { clearCachedPlanAccess, getCachedPlanAccess, saveCachedPlanAccess } from '@/services/plan-access-cache';
import { getUserFacingErrorMessage } from '@/services/user-facing-error';
import { PlanAccessContext } from './plan-access.context';

interface PlanAccessProviderProps {
    children: ReactNode;
}

interface PlanAccessResult {
    plan: PlanAccess;
    validUntil: number | null;
}

const ACCESS_EXPIRED_MESSAGE = 'اعتبار دسترسی تأییدشده به پایان رسیده است. برای بررسی دوباره به اینترنت متصل شوید.';

async function loadPlanAccess(user: ReturnType<typeof useAuth>['user']): Promise<PlanAccessResult> {
    const token = user ? await getStoredAuthToken() : null;
    if (user && !token) {
        throw new Error('نشست کاربری برای دریافت سطح دسترسی در دسترس نیست. دوباره وارد شوید.');
    }

    if (user && token) {
        try {
            const response = await fetchCurrentPlan(token);
            const cached = await saveCachedPlanAccess(user.id, token, response.plan, response.subscription?.ends_at ?? null);
            return { plan: response.plan, validUntil: cached.validUntil };
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
                return { plan: cached.plan, validUntil: cached.validUntil };
            }

            throw new Error('برای بررسی دسترسی پلن به اینترنت متصل شوید و دوباره تلاش کنید.');
        }
    }

    const catalog = await fetchPlanCatalog();
    const freeTier = catalog.tiers.find((tier) => tier.key === 'free');
    if (!freeTier) {
        throw new Error('اطلاعات پلن رایگان از سرور دریافت نشد.');
    }

    return { plan: freeTier, validUntil: null };
}

export function PlanAccessProvider({ children }: PlanAccessProviderProps) {
    const { user, isLoading: authLoading } = useAuth();
    const [now, setNow] = useState(Date.now);
    const { refetch, ...query } = useQuery({
        queryKey: ['plan-access', user?.id ?? 'guest'],
        queryFn: () => loadPlanAccess(user),
        enabled: !authLoading,
        networkMode: 'always',
        staleTime: 0,
        retry: (failureCount, error) => failureCount < 1 && shouldRetryApiQuery(error),
        retryOnMount: false,
        refetchOnMount: (query) => !(query.state.error instanceof AuthApiError && query.state.error.status === 429),
        refetchOnReconnect: (query) => !(query.state.error instanceof AuthApiError && query.state.error.status === 429),
        refetchOnWindowFocus: (query) => !(query.state.error instanceof AuthApiError && query.state.error.status === 429),
    });

    const validUntil = query.data?.validUntil ?? null;
    const accessExpired = user !== null
        && validUntil !== null
        && validUntil <= now;

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
        await refetch();
    }, [refetch]);

    return (
        <PlanAccessContext.Provider value={{
            planAccess: !authLoading && !query.error && !accessExpired ? query.data?.plan ?? null : null,
            isLoading: authLoading || query.isPending || (accessExpired && query.isFetching),
            error: query.error
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
