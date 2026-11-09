import { act, cleanup, render, waitFor } from '@testing-library/react-native';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ComponentProps } from 'react';

import PaymentReturnScreen from '@/app/payment-return';
import { useAuth } from '@/hooks/use-auth';
import { fetchPaymentOrder, getStoredAuthToken } from '@/services/auth-api';
import { ACCOUNT_OFFLINE_CACHE, saveOfflineCacheValue } from '@/services/account-offline-cache';
import { getOfflinePageNotices } from '@/services/offline-page-status';

jest.mock('expo-router', () => ({
    useLocalSearchParams: () => ({ orderId: '42' }),
    usePathname: () => '/payment-return',
    useRouter: () => ({ replace: jest.fn() }),
}));

jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: () => null }));
jest.mock('@/hooks/use-auth', () => ({ useAuth: jest.fn() }));
jest.mock('@/hooks/use-theme', () => ({
    useTheme: () => ({
        primary: '#26C6DA',
        primaryText: '#006B78',
        onPrimary: '#00363F',
        success: '#18794E',
        error: '#B42318',
        surface: '#FFFFFF',
        border: '#BBD9DE',
    }),
}));
jest.mock('@/services/auth-api', () => ({
    fetchPaymentOrder: jest.fn(),
    getStoredAuthToken: jest.fn(),
    isTemporaryApiFailure: (error: unknown) => error instanceof TypeError,
}));
jest.mock('@/services/account-offline-cache', () => ({
    ACCOUNT_OFFLINE_CACHE: {
        pendingSubscriptionOrder: {
            namespace: 'subscription-catalog-v1',
            key: 'pending-order',
            maxAgeMs: 2592000000,
        },
    },
    saveOfflineCacheValue: jest.fn(async () => {}),
}));
jest.mock('@/services/user-facing-error', () => ({
    getUserFacingErrorMessage: (error: unknown) => error instanceof Error ? error.message : 'Payment failed',
}));
jest.mock('@/components/themed-text', () => {
    const React = jest.requireActual<typeof import('react')>('react');
    const { Text } = jest.requireActual<typeof import('react-native')>('react-native');

    return {
        ThemedText: ({ children, type: _type, themeColor: _themeColor, ...props }: ComponentProps<typeof Text> & {
            type?: string;
            themeColor?: string;
        }) => React.createElement(Text, props, children),
    };
});
jest.mock('@/components/themed-view', () => {
    const React = jest.requireActual<typeof import('react')>('react');
    const { View } = jest.requireActual<typeof import('react-native')>('react-native');

    return { ThemedView: (props: ComponentProps<typeof View>) => React.createElement(View, props) };
});
jest.mock('@/constants/theme', () => ({
    Radius: { md: 12, lg: 16 },
    Spacing: { two: 8, three: 16, four: 24, five: 32 },
}));
jest.mock('@/constants/typography', () => ({
    Typography: { lineHeight: { comfortable: 24 } },
}));

const user = {
    id: 7,
    name: 'Test User',
    phone: '09120000000',
    profile_photo_path: null,
    phone_verified_at: null,
    last_active_at: null,
    inactivity_deletion_period_months: null,
    inactivity_deletion_scheduled_at: null,
};

beforeEach(() => {
    jest.clearAllMocks();
    onlineManager.setOnline(true);
    jest.mocked(useAuth).mockReturnValue({ user, isLoading: false } as ReturnType<typeof useAuth>);
    jest.mocked(getStoredAuthToken).mockResolvedValue('test-token');
});

afterEach(() => {
    cleanup();
    onlineManager.setOnline(true);
});

describe('payment return screen', () => {
    it.each(['succeeded', 'failed'] as const)(
        'clears the durable pending-order snapshot after a %s payment result',
        async (status) => {
            jest.mocked(fetchPaymentOrder).mockResolvedValue({
                order: {
                    id: 42,
                    reference: 'test-order',
                    kind: 'subscription',
                    subscription_change_type: 'purchase',
                    plan_key: 'bronze_1_month',
                    plan_name: null,
                    status,
                    failure_code: status === 'failed' ? 'payment_failed' : null,
                    gross_amount: 120000,
                    discount_amount: 20000,
                    plan_credit_amount: 0,
                    wallet_amount: 0,
                    gateway_amount: 100000,
                    refunded_amount: 0,
                    currency: 'IRR',
                    expires_at: '2030-01-31T00:00:00.000Z',
                    completed_at: null,
                },
                payments: [],
                refund_transactions: [],
                subscription: null,
            });
            const queryClient = new QueryClient({
                defaultOptions: { queries: { retry: false, gcTime: 10000 } },
            });
            queryClient.setQueryData(['current-plan', user.id], { plan: { key: 'free' } });
            queryClient.setQueryData(['wallet-overview', user.id], { balance: 0 });
            queryClient.setQueryData(['pending-subscription-order', user.id], {
                order: { id: 42, status: 'pending' },
                payments: [],
            });
            queryClient.setQueryData(['plan-catalog'], { tiers: [] });

            const view = await render(
                <QueryClientProvider client={queryClient}>
                    <PaymentReturnScreen />
                </QueryClientProvider>,
            );

            await waitFor(() => {
                expect(saveOfflineCacheValue).toHaveBeenCalledWith(
                    user.id,
                    ACCOUNT_OFFLINE_CACHE.pendingSubscriptionOrder,
                    { order: null, payments: [] },
                );
                expect(queryClient.getQueryData(['pending-subscription-order', user.id])).toEqual({
                    order: null,
                    payments: [],
                });
            });
            if (status === 'succeeded') {
                expect(await view.findByText('پرداخت با موفقیت تأیید شد')).toBeTruthy();
                expect(queryClient.getQueryState(['current-plan', user.id])?.isInvalidated).toBe(true);
                expect(queryClient.getQueryState(['wallet-overview', user.id])?.isInvalidated).toBe(true);
                expect(queryClient.getQueryState(['pending-subscription-order', user.id])?.isInvalidated).toBe(true);
                expect(queryClient.getQueryState(['plan-catalog'])?.isInvalidated).toBe(true);
            } else {
                expect(await view.findByText('پرداخت تکمیل نشد')).toBeTruthy();
                expect(queryClient.getQueryState(['wallet-overview', user.id])?.isInvalidated).toBe(true);
            }
            await act(async () => queryClient.clear());
        },
    );

    it('does not request payment status while offline and rechecks immediately after reconnect', async () => {
        onlineManager.setOnline(false);
        jest.mocked(fetchPaymentOrder).mockResolvedValue({
            order: {
                id: 42,
                reference: 'test-order',
                kind: 'subscription',
                subscription_change_type: 'purchase',
                plan_key: 'bronze_1_month',
                plan_name: null,
                status: 'pending',
                failure_code: null,
                gross_amount: 120000,
                discount_amount: 20000,
                plan_credit_amount: 0,
                wallet_amount: 0,
                gateway_amount: 100000,
                refunded_amount: 0,
                currency: 'IRR',
                expires_at: '2030-01-31T00:00:00.000Z',
                completed_at: null,
            },
            payments: [],
            refund_transactions: [],
            subscription: null,
        });
        const queryClient = new QueryClient({
            defaultOptions: { queries: { retry: false, gcTime: 10000 } },
        });
        const view = await render(
            <QueryClientProvider client={queryClient}>
                <PaymentReturnScreen />
            </QueryClientProvider>,
        );

        expect(await view.findByText('نتیجهٔ پرداخت هنوز قطعی نیست')).toBeTruthy();
        expect(fetchPaymentOrder).not.toHaveBeenCalled();
        expect(getOfflinePageNotices().some((notice) => (
            notice.pathname === '/payment-return'
            && notice.hasSavedData === false
        ))).toBe(true);

        await act(async () => {
            onlineManager.setOnline(true);
        });
        await waitFor(() => {
            expect(fetchPaymentOrder).toHaveBeenCalledTimes(1);
            expect(getOfflinePageNotices().some((notice) => notice.pathname === '/payment-return')).toBe(false);
        });
        await act(async () => queryClient.clear());
    });

    it('keeps the last confirmed pending status marked offline until a live terminal response arrives', async () => {
        jest.mocked(fetchPaymentOrder)
            .mockResolvedValueOnce({
                order: {
                    id: 42,
                    reference: 'test-order',
                    kind: 'subscription',
                    subscription_change_type: 'purchase',
                    plan_key: 'bronze_1_month',
                    plan_name: null,
                    status: 'pending',
                    failure_code: null,
                    gross_amount: 120000,
                    discount_amount: 20000,
                    plan_credit_amount: 0,
                    wallet_amount: 0,
                    gateway_amount: 100000,
                    refunded_amount: 0,
                    currency: 'IRR',
                    expires_at: '2030-01-31T00:00:00.000Z',
                    completed_at: null,
                },
                payments: [],
                refund_transactions: [],
                subscription: null,
            })
            .mockResolvedValueOnce({
                order: {
                    id: 42,
                    reference: 'test-order',
                    kind: 'subscription',
                    subscription_change_type: 'purchase',
                    plan_key: 'bronze_1_month',
                    plan_name: null,
                    status: 'succeeded',
                    failure_code: null,
                    gross_amount: 120000,
                    discount_amount: 20000,
                    plan_credit_amount: 0,
                    wallet_amount: 0,
                    gateway_amount: 100000,
                    refunded_amount: 0,
                    currency: 'IRR',
                    expires_at: '2030-01-31T00:00:00.000Z',
                    completed_at: '2030-01-31T00:00:00.000Z',
                },
                payments: [],
                refund_transactions: [],
                subscription: null,
            });
        const queryClient = new QueryClient({
            defaultOptions: { queries: { retry: false, gcTime: 10000 } },
        });
        const view = await render(
            <QueryClientProvider client={queryClient}>
                <PaymentReturnScreen />
            </QueryClientProvider>,
        );
        await waitFor(() => expect(fetchPaymentOrder).toHaveBeenCalledTimes(1));
        await act(async () => {
            onlineManager.setOnline(false);
        });
        await waitFor(() => {
            expect(getOfflinePageNotices().some((notice) => (
                notice.pathname === '/payment-return'
                && notice.hasSavedData === true
            ))).toBe(true);
        });

        await act(async () => {
            onlineManager.setOnline(true);
        });
        await waitFor(() => {
            expect(fetchPaymentOrder).toHaveBeenCalledTimes(2);
            expect(view.getByText('پرداخت با موفقیت تأیید شد')).toBeTruthy();
            expect(getOfflinePageNotices().some((notice) => notice.pathname === '/payment-return')).toBe(false);
        });
        await act(async () => queryClient.clear());
    });
});
