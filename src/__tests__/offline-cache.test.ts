import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
    clearOfflineCacheForUser,
    getOfflineCacheEntry,
    setOfflineCacheEntry,
    updateOfflineCacheEntry,
} from '@/services/offline-cache';

const mockRows = new Map<string, {
    userId: number;
    namespace: string;
    cacheKey: string;
    ciphertext: string;
    initializationVector: string;
    updatedAt: number;
}>();
let mockStoredKey: string | null = null;

jest.mock('expo-sqlite', () => ({
    openDatabaseAsync: jest.fn(async () => ({
        execAsync: jest.fn(async () => undefined),
        getFirstAsync: jest.fn(async (_sql: string, params: [number, string, string]) => {
            const [userId, namespace, cacheKey] = params;
            const row = mockRows.get(`${userId}:${namespace}:${cacheKey}`);
            return row ? {
                ciphertext: row.ciphertext,
                initialization_vector: row.initializationVector,
                updated_at: row.updatedAt,
            } : null;
        }),
        runAsync: jest.fn(async (sql: string, params?: (string | number)[]) => {
            if (sql.includes('INSERT OR REPLACE')) {
                const [userId, namespace, cacheKey, ciphertext, initializationVector, updatedAt] = params as [
                    number,
                    string,
                    string,
                    string,
                    string,
                    number,
                ];
                mockRows.set(`${userId}:${namespace}:${cacheKey}`, {
                    userId,
                    namespace,
                    cacheKey,
                    ciphertext,
                    initializationVector,
                    updatedAt,
                });
            } else if (sql.includes('DELETE FROM offline_cache_entries WHERE user_id = ? AND namespace = ? AND cache_key = ?')) {
                const [userId, namespace, cacheKey] = params as [number, string, string];
                mockRows.delete(`${userId}:${namespace}:${cacheKey}`);
            } else if (sql.includes('DELETE FROM offline_cache_entries WHERE user_id = ?')) {
                const [userId] = params as [number];
                for (const [key, row] of mockRows) {
                    if (row.userId === userId) mockRows.delete(key);
                }
            } else if (sql.includes('DELETE FROM offline_cache_entries WHERE updated_at < ?')) {
                const [cutoff] = params as [number];
                for (const [key, row] of mockRows) {
                    if (row.updatedAt < cutoff) mockRows.delete(key);
                }
            } else if (sql.includes('DELETE FROM offline_cache_entries;')) {
                mockRows.clear();
            }
            return { changes: 1 };
        }),
    })),
}));

jest.mock('expo-secure-store', () => ({
    getItemAsync: jest.fn(async () => mockStoredKey),
    setItemAsync: jest.fn(async (_key: string, value: string) => {
        mockStoredKey = value;
    }),
    deleteItemAsync: jest.fn(async () => {
        mockStoredKey = null;
    }),
}));

jest.mock('expo-crypto', () => ({
    AESKeySize: { AES256: 256 },
    AESEncryptionKey: {
        generate: jest.fn(async () => ({ encoded: async () => 'secure-test-key' })),
        import: jest.fn(async () => ({ key: 'secure-test-key' })),
    },
    AESSealedData: {
        fromParts: jest.fn((iv: string, ciphertext: string) => ({ iv, ciphertext })),
    },
    aesEncryptAsync: jest.fn(async (plaintext: Uint8Array) => {
        const ciphertext = Array.from(plaintext).join(',');
        return {
            ciphertext: async () => `${ciphertext}.authenticated`,
            iv: async () => 'test-initialization-vector',
        };
    }),
    aesDecryptAsync: jest.fn(async (sealedData: { ciphertext: string }) => {
        const encoded = sealedData.ciphertext.replace(/\.authenticated$/, '');
        return new Uint8Array(encoded.split(',').map(Number));
    }),
}));

describe('offline cache', () => {
    beforeEach(() => {
        mockRows.clear();
        mockStoredKey = null;
        jest.clearAllMocks();
    });

    it('stores and restores values through the encryption adapter within their user and namespace scope', async () => {
        const value = { rows: [{ id: 'transaction-1', amount: 12500 }] };

        await setOfflineCacheEntry(7, 'financial-history-v1', 'transactions:all:1', value);

        const row = mockRows.get('7:financial-history-v1:transactions:all:1');
        expect(row?.ciphertext).not.toContain('transaction-1');
        expect(row?.ciphertext).toContain('.authenticated');
        await expect(getOfflineCacheEntry(7, 'financial-history-v1', 'transactions:all:1'))
            .resolves.toMatchObject({ value });
        await expect(getOfflineCacheEntry(8, 'financial-history-v1', 'transactions:all:1'))
            .resolves.toBeNull();
        expect(mockStoredKey).toBe('secure-test-key');
    });

    it('clears only the requested user data', async () => {
        await setOfflineCacheEntry(7, 'financial-history-v1', 'history', { count: 1 });
        await setOfflineCacheEntry(8, 'financial-history-v1', 'history', { count: 2 });

        await clearOfflineCacheForUser(7);

        await expect(getOfflineCacheEntry(7, 'financial-history-v1', 'history')).resolves.toBeNull();
        await expect(getOfflineCacheEntry(8, 'financial-history-v1', 'history'))
            .resolves.toMatchObject({ value: { count: 2 } });
    });

    it('deletes entries after their maximum age', async () => {
        const now = Date.now();
        const dateNow = jest.spyOn(Date, 'now').mockReturnValue(now);
        await setOfflineCacheEntry(7, 'financial-history-v1', 'history', { count: 1 });

        dateNow.mockReturnValue(now + 31 * 24 * 60 * 60 * 1000);
        await expect(getOfflineCacheEntry(7, 'financial-history-v1', 'history'))
            .resolves.toBeNull();
        expect(mockRows.has('7:financial-history-v1:history')).toBe(false);
        dateNow.mockRestore();
    });

    it('applies concurrent updates without losing a write', async () => {
        await Promise.all([
            updateOfflineCacheEntry<{ pages: number[] }>(7, 'financial-history-v1', 'history', (current) => ({
                pages: [...(current?.pages ?? []), 1],
            })),
            updateOfflineCacheEntry<{ pages: number[] }>(7, 'financial-history-v1', 'history', (current) => ({
                pages: [...(current?.pages ?? []), 2],
            })),
        ]);

        await expect(getOfflineCacheEntry(7, 'financial-history-v1', 'history'))
            .resolves.toMatchObject({ value: { pages: [1, 2] } });
    });

    it('rejects invalid cache addresses instead of silently storing them', async () => {
        await expect(setOfflineCacheEntry(0, 'financial-history-v1', 'history', {}))
            .rejects.toThrow('شناسهٔ کاربر');
        await expect(setOfflineCacheEntry(7, '', 'history', {}))
            .rejects.toThrow('فضای نام');
    });
});
