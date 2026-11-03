import { describe, expect, it } from '@jest/globals';

import { CACHE_KEYS, CACHE_POLICY, DEFAULT_QUERY_CACHE_OPTIONS } from '@/services/cache-policy';

describe('central cache policy', () => {
    it('sets the app-wide React Query defaults centrally', () => {
        expect(DEFAULT_QUERY_CACHE_OPTIONS).toEqual({
            staleTime: 30_000,
            gcTime: 600_000,
        });
    });

    it('defines a distinct stale time for each resource class', () => {
        expect(CACHE_POLICY.query.resources).toEqual({
            planAccess: { staleTimeMs: 0 },
            walletOverview: { staleTimeMs: 60_000 },
            walletPendingTopUp: { staleTimeMs: 60_000 },
            planCatalog: { staleTimeMs: 300_000 },
            pendingSubscriptionOrder: { staleTimeMs: 10_000 },
            currentPlan: { staleTimeMs: 60_000 },
            financialHistory: { staleTimeMs: 60_000 },
            notificationInbox: { staleTimeMs: 60_000 },
            notificationCounts: { staleTimeMs: 30_000 },
        });
    });

    it('uses consistent query key factories for shared resources', () => {
        expect(CACHE_KEYS.walletOverview(42)).toEqual(['wallet-overview', 42]);
        expect(CACHE_KEYS.planAccess(42)).toEqual(['plan-access', 42]);
        expect(CACHE_KEYS.financialHistory(42, 'payments', null, '2026-01-01'))
            .toEqual(['financial-history', 42, 'payments', null, '2026-01-01']);
    });

    it('keeps bounded, resource-specific offline retention policies', () => {
        expect(CACHE_POLICY.offline.defaults.maxAgeMs).toBe(30 * 24 * 60 * 60 * 1000);
        expect(CACHE_POLICY.offline.entries.walletOverview.maxAgeMs).toBe(24 * 60 * 60 * 1000);
        expect(CACHE_POLICY.offline.entries.pendingSubscriptionOrder.maxAgeMs).toBe(24 * 60 * 60 * 1000);
        expect(CACHE_POLICY.access.gracePeriodMs).toBe(48 * 60 * 60 * 1000);
    });
});
