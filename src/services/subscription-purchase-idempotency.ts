import * as SecureStore from 'expo-secure-store';

import type { SubscriptionPurchaseInput } from '@/services/auth-api';

const STORAGE_KEY_PREFIX = 'pahnavarkar.subscription-purchase.v1.';

export interface PendingSubscriptionPurchaseAttempt {
    idempotencyKey: string;
    input: SubscriptionPurchaseInput;
    createdAt: number;
}

export async function getPendingSubscriptionPurchaseAttempt(
    userId: number,
): Promise<PendingSubscriptionPurchaseAttempt | null> {
    const storageKey = getStorageKey(userId);
    const raw = await SecureStore.getItemAsync(storageKey);
    if (!raw) return null;

    let value: unknown;
    try {
        value = JSON.parse(raw);
    } catch (error) {
        console.error('ذخیرهٔ تلاش خرید اشتراک قابل‌خواندن نیست؛ خرید جدید مسدود می‌ماند.', error);
        throw new TypeError('وضعیت تلاش قبلی خرید قابل‌بازیابی نیست.');
    }

    if (!isPendingSubscriptionPurchaseAttempt(value)) {
        throw new TypeError('وضعیت تلاش قبلی خرید معتبر نیست.');
    }

    if (Date.now() - value.createdAt < 0) {
        throw new TypeError('زمان تلاش قبلی خرید معتبر نیست.');
    }
    return value;
}

export async function savePendingSubscriptionPurchaseAttempt(
    userId: number,
    attempt: PendingSubscriptionPurchaseAttempt,
): Promise<void> {
    if (!isPendingSubscriptionPurchaseAttempt(attempt) || Date.now() - attempt.createdAt < 0) {
        throw new TypeError('ذخیرهٔ تلاش خرید اشتراک معتبر نیست.');
    }
    await SecureStore.setItemAsync(getStorageKey(userId), JSON.stringify(attempt));
}

export async function clearPendingSubscriptionPurchaseAttempt(userId: number): Promise<void> {
    await SecureStore.deleteItemAsync(getStorageKey(userId));
}

function isPendingSubscriptionPurchaseAttempt(
    value: unknown,
): value is PendingSubscriptionPurchaseAttempt {
    if (!value || typeof value !== 'object') return false;
    const attempt = value as Partial<PendingSubscriptionPurchaseAttempt>;
    return typeof attempt.idempotencyKey === 'string'
        && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(attempt.idempotencyKey)
        && isSubscriptionPurchaseInput(attempt.input)
        && typeof attempt.createdAt === 'number'
        && Number.isSafeInteger(attempt.createdAt);
}

function isSubscriptionPurchaseInput(value: unknown): value is SubscriptionPurchaseInput {
    if (!value || typeof value !== 'object') return false;
    const input = value as Partial<SubscriptionPurchaseInput>;
    const expectedQuote = input.expected_quote;
    if (!expectedQuote || typeof expectedQuote !== 'object') return false;

    return typeof input.plan_key === 'string'
        && input.plan_key.length > 0
        && (input.discount_code === undefined || typeof input.discount_code === 'string')
        && (input.payment_method === 'wallet' || input.payment_method === 'combined' || input.payment_method === 'gateway')
        && typeof input.app_return_url === 'string'
        && input.app_return_url.length > 0
        && isNonNegativeSafeInteger(expectedQuote.gross_amount)
        && isNonNegativeSafeInteger(expectedQuote.credit_amount)
        && isNonNegativeSafeInteger(expectedQuote.discount_amount)
        && isNonNegativeSafeInteger(expectedQuote.payable_amount)
        && isNonNegativeSafeInteger(expectedQuote.wallet_amount)
        && isNonNegativeSafeInteger(expectedQuote.gateway_amount)
        && Number.isSafeInteger(expectedQuote.duration_days)
        && expectedQuote.duration_days > 0
        && (expectedQuote.change_type === 'purchase' || expectedQuote.change_type === 'upgrade' || expectedQuote.change_type === 'scheduled')
        && (expectedQuote.source_subscription_id === null || Number.isSafeInteger(expectedQuote.source_subscription_id))
        && (expectedQuote.source_plan_key === null || typeof expectedQuote.source_plan_key === 'string');
}

function isNonNegativeSafeInteger(value: unknown): value is number {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function getStorageKey(userId: number): string {
    if (!Number.isSafeInteger(userId) || userId < 1) {
        throw new TypeError('شناسهٔ کاربر برای تلاش خرید اشتراک معتبر نیست.');
    }
    return `${STORAGE_KEY_PREFIX}${userId}`;
}
