import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import * as SecureStore from 'expo-secure-store';
import { getCachedPlanAccess } from '@/services/plan-access-cache';
import { CACHE_POLICY } from '@/services/cache-policy';

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
    digestStringAsync: jest.fn(async (_algorithm: string, value: string) => `hash:${value}`),
}));

describe('authenticated plan access session binding', () => {
    beforeEach(() => {
        mockSecureStore.clear();
        jest.clearAllMocks();
    });

    it('rejects and removes legacy cached entitlement records without a token hash', async () => {
        const verifiedAt = Date.now();
        mockSecureStore.set('pahnavarkar.plan-access.cache', JSON.stringify({
            userId: 7,
            plan: { key: 'basic', name: 'Basic', features: {} },
            verifiedAt,
            validUntil: verifiedAt + CACHE_POLICY.access.gracePeriodMs,
        }));

        await expect(getCachedPlanAccess(7, 'current-session-token')).resolves.toBeNull();
        expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('pahnavarkar.plan-access.cache');
        expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
    });
});
