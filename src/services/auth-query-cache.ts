import type { QueryClient } from '@tanstack/react-query';
import { CACHE_KEYS } from '@/services/cache-policy';

export async function clearUserScopedQueries(queryClient: QueryClient, userIds: number[]): Promise<void> {
    const queryKeys = [...new Set(userIds)].flatMap((userId) => [
        CACHE_KEYS.planAccess(userId),
        CACHE_KEYS.currentPlan(userId),
        CACHE_KEYS.walletOverview(userId),
        CACHE_KEYS.walletPendingTopUp(userId),
        CACHE_KEYS.pendingSubscriptionOrder(userId),
        CACHE_KEYS.financialHistoryPrefix(userId),
        CACHE_KEYS.notificationInboxPrefix(userId),
        CACHE_KEYS.notificationCounts(userId),
    ]);

    const cancellationResults = await Promise.allSettled(
        queryKeys.map((queryKey) => queryClient.cancelQueries({ queryKey })),
    );
    queryKeys.forEach((queryKey) => queryClient.removeQueries({ queryKey }));
    const cancellationErrors = cancellationResults
        .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
        .map((result) => result.reason);
    if (cancellationErrors.length > 0) {
        throw new AggregateError(cancellationErrors, 'لغو پرس‌وجوهای حساب ناموفق بود.');
    }
}

export async function runSignOutCleanup(
    clearLocally: () => Promise<void>,
    revoke: () => Promise<void>,
): Promise<void> {
    let cleanupError: unknown;
    let revocationError: unknown;
    let hasCleanupError = false;
    let hasRevocationError = false;

    try {
        await clearLocally();
    } catch (error) {
        hasCleanupError = true;
        cleanupError = error;
    }

    try {
        await revoke();
    } catch (error) {
        hasRevocationError = true;
        revocationError = error;
    }

    if (hasCleanupError && hasRevocationError) {
        throw new AggregateError([cleanupError, revocationError], 'خروج محلی انجام شد، اما پاک‌سازی یا لغو نشست ناموفق بود.');
    }
    if (hasRevocationError) throw revocationError;
    if (hasCleanupError) throw cleanupError;
}
