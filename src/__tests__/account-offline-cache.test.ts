import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { AuthApiError } from '@/services/auth-api';
import {
    fetchWithOfflineFallback,
    isCurrentPlanCacheValue,
    type OfflineQueryResult,
} from '@/services/account-offline-cache';
import { getOfflineCacheEntry, setOfflineCacheEntry } from '@/services/offline-cache';

jest.mock('@/services/offline-cache', () => ({
    getOfflineCacheEntry: jest.fn(),
    setOfflineCacheEntry: jest.fn(),
}));

type Value = { balance: number };
const cache = { namespace: 'account-wallet-v1', key: 'overview', maxAgeMs: 1000 };
const isValue = (value: unknown): value is Value => (
    Boolean(value && typeof value === 'object' && typeof (value as Value).balance === 'number')
);

describe('account offline cache fallback', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.mocked(setOfflineCacheEntry).mockResolvedValue(1);
        jest.mocked(getOfflineCacheEntry).mockResolvedValue(null);
    });

    it('saves successful server data and returns it as live data', async () => {
        const value = { balance: 2500 };
        const result = await fetchWithOfflineFallback(7, cache, async () => value, isValue);

        expect(result).toEqual({ value });
        expect(setOfflineCacheEntry).toHaveBeenCalledWith(7, cache.namespace, cache.key, value);
        expect(getOfflineCacheEntry).not.toHaveBeenCalled();
    });

    it('uses a fresh valid cache only for temporary server failures', async () => {
        const value = { balance: 1200 };
        const error = new AuthApiError('Unavailable', 503);
        jest.mocked(getOfflineCacheEntry).mockResolvedValue({ value, updatedAt: 1234 });

        const result: OfflineQueryResult<Value> = await fetchWithOfflineFallback(
            7,
            cache,
            async () => { throw error; },
            isValue,
        );

        expect(result).toEqual({ value, offlineCacheSavedAt: 1234 });
    });

    it('serves a valid cache immediately without a network request when offline', async () => {
        const value = { balance: 1800 };
        const fetcher = jest.fn<() => Promise<Value>>();
        jest.mocked(getOfflineCacheEntry).mockResolvedValue({ value, updatedAt: 1234 });

        const result = await fetchWithOfflineFallback(
            7,
            cache,
            fetcher,
            isValue,
            { isOnline: false },
        );

        expect(result).toEqual({ value, offlineCacheSavedAt: 1234 });
        expect(fetcher).not.toHaveBeenCalled();
    });

    it('fails immediately offline when no valid cached value exists', async () => {
        const fetcher = jest.fn<() => Promise<Value>>();

        await expect(fetchWithOfflineFallback(
            7,
            cache,
            fetcher,
            isValue,
            { isOnline: false },
        )).rejects.toThrow('اتصال اینترنت در دسترس نیست');
        expect(fetcher).not.toHaveBeenCalled();
    });

    it('preserves non-temporary server errors without reading the cache', async () => {
        const error = new AuthApiError('Forbidden', 403);

        await expect(fetchWithOfflineFallback(
            7,
            cache,
            async () => { throw error; },
            isValue,
        )).rejects.toBe(error);
        expect(getOfflineCacheEntry).not.toHaveBeenCalled();
    });

    it('preserves the server error when cache access fails', async () => {
        const requestError = new AuthApiError('Unavailable', 503);
        jest.mocked(getOfflineCacheEntry).mockRejectedValue(new Error('SQLite unavailable'));

        await expect(fetchWithOfflineFallback(
            7,
            cache,
            async () => { throw requestError; },
            isValue,
        )).rejects.toBe(requestError);
    });

    it('accepts a structurally valid current-plan response for offline display', () => {
        const currentPlan = {
            plan: { key: 'bronze', name: 'برنزی', features: { calculator: true } },
            subscription: {
                id: 12,
                plan_key: 'bronze_month',
                status: 'active',
                starts_at: '2030-01-01T00:00:00.000Z',
                ends_at: '2030-02-01T00:00:00.000Z',
                reservation_created_at: '2029-12-01T00:00:00.000Z',
                is_active: true,
            },
            subscriptions: [],
            scheduled_subscription: null,
            last_subscription: null,
        };

        expect(isCurrentPlanCacheValue(currentPlan)).toBe(true);
        expect(isCurrentPlanCacheValue({ ...currentPlan, subscriptions: {} })).toBe(false);
        expect(isCurrentPlanCacheValue({
            ...currentPlan,
            subscription: { ...currentPlan.subscription, id: '12' },
        })).toBe(false);
        expect(isCurrentPlanCacheValue({
            ...currentPlan,
            subscription: { ...currentPlan.subscription, reservation_created_at: 123 },
        })).toBe(false);
    });
});
