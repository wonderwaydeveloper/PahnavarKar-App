import {
    isTemporaryApiFailure,
    type NotificationCounts,
    type PlanCatalog,
    type WalletOverview,
} from '@/services/auth-api';
import { CACHE_POLICY } from '@/services/cache-policy';
import { getOfflineCacheEntry, setOfflineCacheEntry } from '@/services/offline-cache';

export const ACCOUNT_OFFLINE_CACHE = {
    wallet: CACHE_POLICY.offline.entries.walletOverview,
    pendingTopUp: CACHE_POLICY.offline.entries.walletPendingTopUp,
    planCatalog: CACHE_POLICY.offline.entries.planCatalog,
    currentPlan: CACHE_POLICY.offline.entries.currentPlan,
    pendingSubscriptionOrder: CACHE_POLICY.offline.entries.pendingSubscriptionOrder,
} as const;

export function isPlanCatalogCacheValue(value: unknown): value is PlanCatalog {
    if (!value || typeof value !== 'object') return false;
    const catalog = value as Partial<PlanCatalog>;
    return Array.isArray(catalog.tiers)
        && Array.isArray(catalog.durations)
        && Array.isArray(catalog.offers)
        && Boolean(catalog.feature_catalog && typeof catalog.feature_catalog === 'object');
}

export function isWalletOverviewCacheValue(value: unknown): value is WalletOverview {
    if (!value || typeof value !== 'object') return false;
    const wallet = value as Partial<WalletOverview>;
    return typeof wallet.balance === 'number'
        && typeof wallet.currency === 'string'
        && typeof wallet.unit === 'string'
        && (typeof wallet.bank_account_iban_masked === 'string' || wallet.bank_account_iban_masked === null)
        && typeof wallet.top_up_min_amount === 'number'
        && typeof wallet.top_up_max_amount === 'number'
        && Boolean(wallet.withdrawals && typeof wallet.withdrawals === 'object')
        && typeof wallet.withdrawals?.enabled === 'boolean'
        && typeof wallet.withdrawals?.max_per_request === 'number'
        && typeof wallet.withdrawals?.max_per_day === 'number';
}

export function isNotificationCountsCacheValue(value: unknown): value is NotificationCounts {
    if (!value || typeof value !== 'object') return false;
    const counts = value as Partial<NotificationCounts>;
    return Number.isSafeInteger(counts.unread_count)
        && (counts.unread_count ?? -1) >= 0
        && Number.isSafeInteger(counts.read_count)
        && (counts.read_count ?? -1) >= 0;
}

export function isPendingSubscriptionOrderCacheValue(
    value: unknown,
): value is Awaited<ReturnType<typeof import('@/services/auth-api').fetchPendingSubscriptionOrder>> {
    if (!value || typeof value !== 'object') return false;
    const result = value as { order?: unknown; payments?: unknown };
    return (result.order === null || typeof result.order === 'object')
        && Array.isArray(result.payments);
}

export function isCurrentPlanCacheValue(
    value: unknown,
): value is Awaited<ReturnType<typeof import('@/services/auth-api').fetchCurrentPlan>> {
    if (!value || typeof value !== 'object') return false;
    const response = value as Partial<Awaited<ReturnType<typeof import('@/services/auth-api').fetchCurrentPlan>>>;
    const isSubscription = (subscription: unknown): boolean => {
        if (!subscription || typeof subscription !== 'object') return false;
        const record = subscription as Record<string, unknown>;
        return Number.isSafeInteger(record.id)
            && typeof record.plan_key === 'string'
            && typeof record.status === 'string'
            && typeof record.starts_at === 'string'
            && typeof record.ends_at === 'string'
            && (record.reservation_created_at === undefined || typeof record.reservation_created_at === 'string')
            && typeof record.is_active === 'boolean';
    };

    return Boolean(
        response.plan
        && typeof response.plan === 'object'
        && typeof response.plan.key === 'string'
        && typeof response.plan.name === 'string'
        && response.plan.features
        && typeof response.plan.features === 'object'
        && !Array.isArray(response.plan.features),
    )
        && (response.subscription === null || isSubscription(response.subscription))
        && Array.isArray(response.subscriptions)
        && response.subscriptions.every(isSubscription)
        && (response.scheduled_subscription === null
            || Boolean(response.scheduled_subscription && typeof response.scheduled_subscription === 'object'))
        && (response.last_subscription === null
            || Boolean(response.last_subscription && typeof response.last_subscription === 'object'));
}

export interface OfflineQueryResult<T> {
    value: T;
    offlineCacheSavedAt?: number;
}

export type OfflineAware<T extends object> = T & { offlineCacheSavedAt?: number };

export function withOfflineCacheMetadata<T extends object>(
    result: OfflineQueryResult<T>,
): OfflineAware<T> {
    return result.offlineCacheSavedAt === undefined
        ? result.value
        : { ...result.value, offlineCacheSavedAt: result.offlineCacheSavedAt };
}

export async function saveOfflineCacheValue<T>(
    userId: number,
    cache: { namespace: string; key: string },
    value: T,
): Promise<void> {
    try {
        await setOfflineCacheEntry(userId, cache.namespace, cache.key, value);
    } catch (error) {
        console.error(`ذخیرهٔ ${cache.namespace} برای استفادهٔ آفلاین ناموفق بود.`, error);
    }
}

export async function fetchWithOfflineFallback<T>(
    userId: number,
    cache: { namespace: string; key: string; maxAgeMs: number },
    fetcher: () => Promise<T>,
    isValid: (value: unknown) => value is T,
    options: { isOnline?: boolean } = {},
): Promise<OfflineQueryResult<T>> {
    if (options.isOnline === false) {
        let cachedEntry;
        try {
            cachedEntry = await getOfflineCacheEntry<unknown>(
                userId,
                cache.namespace,
                cache.key,
                { maxAgeMs: cache.maxAgeMs },
            );
        } catch (cacheError) {
            console.error(`خواندن ${cache.namespace} از کش آفلاین ناموفق بود.`, cacheError);
            throw cacheError;
        }

        if (cachedEntry && isValid(cachedEntry.value)) {
            return {
                value: cachedEntry.value,
                offlineCacheSavedAt: cachedEntry.updatedAt,
            };
        }

        throw new TypeError('اتصال اینترنت در دسترس نیست و دادهٔ معتبر آفلاینی ذخیره نشده است.');
    }

    try {
        const value = await fetcher();
        await saveOfflineCacheValue(userId, cache, value);
        return { value };
    } catch (requestError) {
        if (!isTemporaryApiFailure(requestError)) throw requestError;

        let cachedEntry;
        try {
            cachedEntry = await getOfflineCacheEntry<unknown>(
                userId,
                cache.namespace,
                cache.key,
                { maxAgeMs: cache.maxAgeMs },
            );
        } catch (cacheError) {
            console.error(`خواندن ${cache.namespace} از کش آفلاین ناموفق بود.`, cacheError);
            throw requestError;
        }
        if (!cachedEntry || !isValid(cachedEntry.value)) throw requestError;

        return {
            value: cachedEntry.value,
            offlineCacheSavedAt: cachedEntry.updatedAt,
        };
    }
}
