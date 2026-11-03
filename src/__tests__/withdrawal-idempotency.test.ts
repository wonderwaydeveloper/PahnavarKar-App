import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import {
    clearPendingWithdrawalIdempotency,
    createWithdrawalRequestFingerprint,
    getPendingWithdrawalIdempotency,
    savePendingWithdrawalIdempotency,
} from '@/services/withdrawal-idempotency';

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

jest.mock('expo-crypto', () => ({
    CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
    digestStringAsync: jest.fn(async (_algorithm: string, value: string) => {
        let hash = 0;
        for (const character of value) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
        return hash.toString(16).padStart(8, '0').repeat(8);
    }),
}));

describe('withdrawal idempotency storage', () => {
    beforeEach(() => {
        mockSecureStore.clear();
        jest.clearAllMocks();
    });

    it('persists user-scoped keys and request fingerprints without payment-card data', async () => {
        const cardNumber = '4111111111111111';
        const requestFingerprint = await createWithdrawalRequestFingerprint({
            amount: 12500,
            payoutMethod: 'card',
            cardNumber,
        });
        const attempt = {
            idempotencyKey: 'stable-idempotency-key',
            requestFingerprint,
            createdAt: Date.now(),
        };

        await savePendingWithdrawalIdempotency(7, attempt);

        const storedValue = [...mockSecureStore.values()][0];
        expect(storedValue).not.toContain(cardNumber);
        await expect(getPendingWithdrawalIdempotency(7)).resolves.toEqual(attempt);
        await expect(getPendingWithdrawalIdempotency(8)).resolves.toBeNull();
    });

    it('removes expired attempts and clears only the selected account', async () => {
        const now = Date.now();
        const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(now);
        const fingerprint = await createWithdrawalRequestFingerprint({
            amount: 10000,
            payoutMethod: 'iban',
        });
        const attempt = {
            idempotencyKey: 'expired-key',
            requestFingerprint: fingerprint,
            createdAt: now,
        };
        await savePendingWithdrawalIdempotency(7, attempt);
        await savePendingWithdrawalIdempotency(8, { ...attempt, idempotencyKey: 'other-user-key' });

        nowSpy.mockReturnValue(now + 24 * 60 * 60 * 1000);
        await expect(getPendingWithdrawalIdempotency(7)).resolves.toBeNull();
        await clearPendingWithdrawalIdempotency(8);
        expect(mockSecureStore.size).toBe(0);
        nowSpy.mockRestore();
    });
});
