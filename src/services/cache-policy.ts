const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const OFFLINE_ACCESS_GRACE_PERIOD = 48 * HOUR;

export const CACHE_POLICY = {
    query: {
        defaults: {
            staleTimeMs: 30 * SECOND,
            gcTimeMs: 10 * MINUTE,
        },
        resources: {
            planAccess: { staleTimeMs: 0 },
            walletOverview: { staleTimeMs: MINUTE },
            walletPendingTopUp: { staleTimeMs: MINUTE },
            planCatalog: { staleTimeMs: 5 * MINUTE },
            pendingSubscriptionOrder: { staleTimeMs: 10 * SECOND },
            currentPlan: { staleTimeMs: MINUTE },
            financialHistory: { staleTimeMs: MINUTE },
            notificationInbox: { staleTimeMs: MINUTE },
            notificationCounts: { staleTimeMs: 30 * SECOND },
        },
    },
    offline: {
        defaults: {
            maxAgeMs: 30 * DAY,
        },
        entries: {
            walletOverview: {
                namespace: 'account-wallet-v1',
                key: 'overview',
                maxAgeMs: DAY,
            },
            walletPendingTopUp: {
                namespace: 'account-wallet-v1',
                key: 'pending-top-up',
                maxAgeMs: DAY,
            },
            planCatalog: {
                namespace: 'subscription-catalog-v1',
                key: 'catalog',
                maxAgeMs: 30 * DAY,
            },
            currentPlan: {
                namespace: 'subscription-account-v1',
                key: 'current-plan',
                maxAgeMs: DAY,
            },
            pendingSubscriptionOrder: {
                namespace: 'subscription-catalog-v1',
                key: 'pending-order',
                maxAgeMs: DAY,
            },
            financialHistory: {
                namespace: 'financial-history-v1',
                maxAgeMs: 30 * DAY,
            },
        },
    },
    storage: {
        guestPlanAccess: {
            key: '@pahnavarkar/guest-plan-access-v1',
            maxAgeMs: DAY,
        },
        authenticatedPlanAccess: {
            key: 'pahnavarkar.plan-access.cache',
        },
        authenticatedUser: {
            key: 'pahnavarkar.auth.user-cache',
        },
    },
    access: {
        gracePeriodMs: OFFLINE_ACCESS_GRACE_PERIOD,
    },
} as const;

export const CACHE_KEYS = {
    planAccessPrefix: ['plan-access'] as const,
    planAccess: (userId: number | 'guest') => ['plan-access', userId] as const,
    planCatalog: ['plan-catalog'] as const,
    currentPlan: (userId: number) => ['current-plan', userId] as const,
    walletOverview: (userId: number) => ['wallet-overview', userId] as const,
    walletPendingTopUp: (userId: number) => ['wallet-pending-top-up', userId] as const,
    pendingSubscriptionOrder: (userId: number) => ['pending-subscription-order', userId] as const,
    financialHistoryPrefix: (userId: number) => ['financial-history', userId] as const,
    financialHistory: (
        userId: number,
        tab: 'transactions' | 'payments' | 'withdrawals',
        from: string | null,
        to: string | null,
    ) => ['financial-history', userId, tab, from, to] as const,
    notificationInboxPrefix: (userId: number) => ['notification-inbox', userId] as const,
    notificationInbox: (userId: number, filter: string) => ['notification-inbox', userId, filter] as const,
    notificationCounts: (userId: number) => ['notification-counts', userId] as const,
} as const;

export const DEFAULT_QUERY_CACHE_OPTIONS = {
    staleTime: CACHE_POLICY.query.defaults.staleTimeMs,
    gcTime: CACHE_POLICY.query.defaults.gcTimeMs,
} as const;
