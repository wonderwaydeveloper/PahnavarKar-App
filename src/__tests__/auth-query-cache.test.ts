import { describe, expect, it, jest } from '@jest/globals';
import { QueryClient } from '@tanstack/react-query';

import { clearUserScopedQueries, runSignOutCleanup } from '@/services/auth-query-cache';
import { CACHE_KEYS } from '@/services/cache-policy';

describe('authenticated query cleanup', () => {
    it('removes user-scoped server queries while retaining guest and public queries', async () => {
        const queryClient = new QueryClient();
        const userId = 42;
        const userKeys = [
            CACHE_KEYS.planAccess(userId),
            CACHE_KEYS.currentPlan(userId),
            CACHE_KEYS.walletOverview(userId),
            CACHE_KEYS.walletPendingTopUp(userId),
            CACHE_KEYS.pendingSubscriptionOrder(userId),
            CACHE_KEYS.financialHistory(userId, 'payments', null, null),
            CACHE_KEYS.notificationInbox(userId, 'all'),
            CACHE_KEYS.notificationCounts(userId),
        ];
        const preservedKeys = [
            CACHE_KEYS.planAccess('guest'),
            CACHE_KEYS.planCatalog,
        ];

        [...userKeys, ...preservedKeys].forEach((key) => queryClient.setQueryData(key, { value: key[0] }));
        await clearUserScopedQueries(queryClient, [userId]);

        userKeys.forEach((key) => expect(queryClient.getQueryData(key)).toBeUndefined());
        preservedKeys.forEach((key) => expect(queryClient.getQueryData(key)).toBeDefined());
        queryClient.clear();
    });
});

describe('offline sign-out cleanup', () => {
    it('clears local session before attempting revocation and preserves the revocation error', async () => {
        let locallySignedIn = true;
        const networkError = new Error('offline');
        const revoke = jest.fn(async () => {
            expect(locallySignedIn).toBe(false);
            throw networkError;
        });

        await expect(runSignOutCleanup(async () => {
            locallySignedIn = false;
        }, revoke)).rejects.toBe(networkError);

        expect(locallySignedIn).toBe(false);
        expect(revoke).toHaveBeenCalledTimes(1);
    });
});
