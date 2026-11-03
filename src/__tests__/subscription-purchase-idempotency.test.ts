import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import {
    clearPendingSubscriptionPurchaseAttempt,
    getPendingSubscriptionPurchaseAttempt,
    savePendingSubscriptionPurchaseAttempt,
} from '@/services/subscription-purchase-idempotency';
import type { PendingSubscriptionPurchaseAttempt } from '@/services/subscription-purchase-idempotency';

const mockSecureStore = new Map<string, string>();

jest.mock('expo-secure-store', () => ({
    getItemAsync: jest.fn(async (key: string) => mockSecureStore.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => {
        mockSecureStore.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
        mockSecureStore.delete(key);
    }),
}));

const attempt: PendingSubscriptionPurchaseAttempt = {
    idempotencyKey: '11111111-1111-4111-8111-111111111111',
    input: {
        plan_key: 'bronze_1_month',
        discount_code: 'SAVE20',
        payment_method: 'gateway',
        app_return_url: 'pahnavarkar://payment-return',
        expected_quote: {
            gross_amount: 120000,
            credit_amount: 0,
            discount_amount: 20000,
            payable_amount: 100000,
            wallet_amount: 0,
            gateway_amount: 100000,
            duration_days: 30,
            change_type: 'purchase',
            source_subscription_id: null,
            source_plan_key: null,
        },
    },
    createdAt: Date.now(),
};

describe('subscription purchase idempotency storage', () => {
    beforeEach(() => {
        mockSecureStore.clear();
        jest.clearAllMocks();
    });

    it('persists the exact retry input separately for each account', async () => {
        await savePendingSubscriptionPurchaseAttempt(7, attempt);

        await expect(getPendingSubscriptionPurchaseAttempt(7)).resolves.toEqual(attempt);
        await expect(getPendingSubscriptionPurchaseAttempt(8)).resolves.toBeNull();
    });

    it('keeps unresolved attempts beyond the order lifetime and clears only the selected account', async () => {
        const now = Date.now();
        const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(now);
        await savePendingSubscriptionPurchaseAttempt(7, { ...attempt, createdAt: now });
        await savePendingSubscriptionPurchaseAttempt(8, { ...attempt, idempotencyKey: '22222222-2222-4222-8222-222222222222', createdAt: now });

        nowSpy.mockReturnValue(now + 24 * 60 * 60 * 1000);
        await expect(getPendingSubscriptionPurchaseAttempt(7)).resolves.toEqual({ ...attempt, createdAt: now });
        await clearPendingSubscriptionPurchaseAttempt(8);
        expect(mockSecureStore.size).toBe(1);
        expect(mockSecureStore.has('pahnavarkar.subscription-purchase.v1.7')).toBe(true);
        nowSpy.mockRestore();
    });

    it('does not silently discard a malformed attempt that could hide an unresolved charge', async () => {
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        mockSecureStore.set('pahnavarkar.subscription-purchase.v1.7', '{invalid');

        await expect(getPendingSubscriptionPurchaseAttempt(7)).rejects.toThrow(
            'وضعیت تلاش قبلی خرید قابل‌بازیابی نیست.',
        );
        expect(mockSecureStore.has('pahnavarkar.subscription-purchase.v1.7')).toBe(true);
        consoleErrorSpy.mockRestore();
    });
});
