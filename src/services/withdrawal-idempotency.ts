import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

const WITHDRAWAL_IDEMPOTENCY_KEY_PREFIX = 'pahnavarkar.withdrawal-idempotency.v1.';
const WITHDRAWAL_IDEMPOTENCY_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface PendingWithdrawalIdempotency {
    idempotencyKey: string;
    requestFingerprint: string;
    createdAt: number;
}

export interface WithdrawalRequestFingerprintInput {
    amount: number;
    payoutMethod: 'iban' | 'card';
    cardNumber?: string;
}

export async function createWithdrawalRequestFingerprint(
    input: WithdrawalRequestFingerprintInput,
): Promise<string> {
    return Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        JSON.stringify(input),
    );
}

export async function getPendingWithdrawalIdempotency(
    userId: number,
): Promise<PendingWithdrawalIdempotency | null> {
    validateUserId(userId);
    const storageKey = getStorageKey(userId);
    const raw = await SecureStore.getItemAsync(storageKey);
    if (!raw) return null;

    try {
        const value: unknown = JSON.parse(raw);
        if (!isPendingWithdrawalIdempotency(value)) {
            throw new TypeError('ذخیرهٔ کلید درخواست برداشت معتبر نیست.');
        }
        const age = Date.now() - value.createdAt;
        if (age < 0 || age >= WITHDRAWAL_IDEMPOTENCY_MAX_AGE_MS) {
            await SecureStore.deleteItemAsync(storageKey);
            return null;
        }
        return value;
    } catch (error) {
        console.warn('بازیابی کلید درخواست برداشت ناموفق بود؛ دادهٔ محلی حذف می‌شود.', error);
        await SecureStore.deleteItemAsync(storageKey);
        return null;
    }
}

export async function savePendingWithdrawalIdempotency(
    userId: number,
    value: PendingWithdrawalIdempotency,
): Promise<void> {
    validateUserId(userId);
    if (!isPendingWithdrawalIdempotency(value) || Date.now() - value.createdAt < 0) {
        throw new TypeError('ذخیرهٔ کلید درخواست برداشت معتبر نیست.');
    }
    await SecureStore.setItemAsync(getStorageKey(userId), JSON.stringify(value));
}

export async function clearPendingWithdrawalIdempotency(userId: number): Promise<void> {
    validateUserId(userId);
    await SecureStore.deleteItemAsync(getStorageKey(userId));
}

function isPendingWithdrawalIdempotency(value: unknown): value is PendingWithdrawalIdempotency {
    if (!value || typeof value !== 'object') return false;
    const attempt = value as Partial<PendingWithdrawalIdempotency>;
    return typeof attempt.idempotencyKey === 'string'
        && attempt.idempotencyKey.length > 0
        && typeof attempt.requestFingerprint === 'string'
        && /^[a-f0-9]{64}$/i.test(attempt.requestFingerprint)
        && typeof attempt.createdAt === 'number'
        && Number.isSafeInteger(attempt.createdAt);
}

function validateUserId(userId: number): void {
    if (!Number.isSafeInteger(userId) || userId < 1) {
        throw new TypeError('شناسهٔ کاربر برای کلید درخواست برداشت معتبر نیست.');
    }
}

function getStorageKey(userId: number): string {
    return `${WITHDRAWAL_IDEMPOTENCY_KEY_PREFIX}${userId}`;
}
