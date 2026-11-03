import { AESKeySize, AESEncryptionKey, AESSealedData, aesDecryptAsync, aesEncryptAsync } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import type { SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';

import { withOfflineCacheDatabaseLock } from './connection';
import { CACHE_POLICY } from '@/services/cache-policy';

const ENCRYPTION_KEY_STORAGE_KEY = 'pahnavarkar.offline-cache.encryption-key.v1';
const AUTHENTICATION_TAG_LENGTH = 16;

export interface OfflineCacheEntry<T> {
    value: T;
    updatedAt: number;
}

export interface OfflineCacheOptions {
    maxAgeMs?: number;
}

export type OfflineCacheUpdater<T> = (currentValue: T | null) => T;

let encryptionKeyPromise: Promise<AESEncryptionKey> | null = null;

export async function getOfflineCacheEntry<T>(
    userId: number,
    namespace: string,
    cacheKey: string,
    options: OfflineCacheOptions = {},
): Promise<OfflineCacheEntry<T> | null> {
    validateCacheAddress(userId, namespace, cacheKey);
    if (Platform.OS === 'web') return null;

    return withOfflineCacheDatabaseLock(async (database) => {
        return readEntry<T>(database, userId, namespace, cacheKey, options.maxAgeMs);
    });
}

export async function setOfflineCacheEntry<T>(
    userId: number,
    namespace: string,
    cacheKey: string,
    value: T,
): Promise<number | null> {
    validateCacheAddress(userId, namespace, cacheKey);
    if (Platform.OS === 'web') return null;

    return withOfflineCacheDatabaseLock((database) => (
        writeEntry(database, userId, namespace, cacheKey, value)
    ));
}

export async function updateOfflineCacheEntry<T>(
    userId: number,
    namespace: string,
    cacheKey: string,
    updater: OfflineCacheUpdater<T>,
    options: OfflineCacheOptions = {},
): Promise<number | null> {
    validateCacheAddress(userId, namespace, cacheKey);
    if (Platform.OS === 'web') return null;

    return withOfflineCacheDatabaseLock(async (database) => {
        const currentEntry = await readEntry<T>(database, userId, namespace, cacheKey, options.maxAgeMs);
        const nextValue = updater(currentEntry?.value ?? null);
        return writeEntry(database, userId, namespace, cacheKey, nextValue);
    });
}

export async function removeOfflineCacheEntry(
    userId: number,
    namespace: string,
    cacheKey: string,
): Promise<void> {
    validateCacheAddress(userId, namespace, cacheKey);
    if (Platform.OS === 'web') return;

    await withOfflineCacheDatabaseLock((database) => deleteEntry(database, userId, namespace, cacheKey));
}

export async function clearOfflineCacheForUser(userId: number): Promise<void> {
    if (!Number.isSafeInteger(userId) || userId < 1) {
        throw new TypeError('شناسهٔ کاربر برای پاک‌کردن داده‌های آفلاین معتبر نیست.');
    }
    if (Platform.OS === 'web') return;

    await withOfflineCacheDatabaseLock(async (database) => {
        await database.runAsync('DELETE FROM offline_cache_entries WHERE user_id = ?;', [userId]);
    });
}

export async function clearOfflineCache(): Promise<void> {
    if (Platform.OS === 'web') return;

    await withOfflineCacheDatabaseLock(async (database) => {
        await database.runAsync('DELETE FROM offline_cache_entries;');
    });
    encryptionKeyPromise = null;
    await SecureStore.deleteItemAsync(ENCRYPTION_KEY_STORAGE_KEY);
}

function validateCacheAddress(userId: number, namespace: string, cacheKey: string): void {
    if (!Number.isSafeInteger(userId) || userId < 1) {
        throw new TypeError('شناسهٔ کاربر برای ذخیرهٔ دادهٔ آفلاین معتبر نیست.');
    }
    if (!namespace.trim() || namespace.length > 128) {
        throw new TypeError('فضای نام دادهٔ آفلاین معتبر نیست.');
    }
    if (!cacheKey || cacheKey.length > 1024) {
        throw new TypeError('کلید دادهٔ آفلاین معتبر نیست.');
    }
}

async function getEncryptionKey(): Promise<AESEncryptionKey> {
    if (!encryptionKeyPromise) {
        encryptionKeyPromise = (async () => {
            const storedKey = await SecureStore.getItemAsync(ENCRYPTION_KEY_STORAGE_KEY);
            if (storedKey) {
                return AESEncryptionKey.import(storedKey, 'base64');
            }

            const generatedKey = await AESEncryptionKey.generate(AESKeySize.AES256);
            await SecureStore.setItemAsync(
                ENCRYPTION_KEY_STORAGE_KEY,
                await generatedKey.encoded('base64'),
            );
            return generatedKey;
        })().catch((error: unknown) => {
            encryptionKeyPromise = null;
            throw error;
        });
    }

    return encryptionKeyPromise;
}

function getAdditionalData(userId: number, namespace: string, cacheKey: string): Uint8Array {
    return new TextEncoder().encode(`offline-cache:v1:${userId}:${namespace}:${cacheKey}`);
}

async function deleteEntry(
    database: SQLiteDatabase,
    userId: number,
    namespace: string,
    cacheKey: string,
): Promise<void> {
    await database.runAsync(
        'DELETE FROM offline_cache_entries WHERE user_id = ? AND namespace = ? AND cache_key = ?;',
        [userId, namespace, cacheKey],
    );
}

async function readEntry<T>(
    database: SQLiteDatabase,
    userId: number,
    namespace: string,
    cacheKey: string,
    maxAgeMs = CACHE_POLICY.offline.defaults.maxAgeMs,
): Promise<OfflineCacheEntry<T> | null> {
    const row = await database.getFirstAsync<{
        ciphertext: string;
        initialization_vector: string;
        updated_at: number;
    }>(
        `SELECT ciphertext, initialization_vector, updated_at
         FROM offline_cache_entries
         WHERE user_id = ? AND namespace = ? AND cache_key = ?;`,
        [userId, namespace, cacheKey],
    );
    if (!row) return null;

    const updatedAt = Number(row.updated_at);
    const now = Date.now();
    if (!Number.isFinite(updatedAt) || updatedAt > now || now - updatedAt > maxAgeMs) {
        await deleteEntry(database, userId, namespace, cacheKey);
        return null;
    }

    const key = await getEncryptionKey();
    try {
        const sealedData = AESSealedData.fromParts(
            row.initialization_vector,
            row.ciphertext,
            AUTHENTICATION_TAG_LENGTH,
        );
        const decrypted = await aesDecryptAsync(sealedData, key, {
            additionalData: getAdditionalData(userId, namespace, cacheKey),
        });
        const json = new TextDecoder().decode(decrypted);
        return { value: JSON.parse(json) as T, updatedAt };
    } catch (error) {
        console.warn('رمزگشایی دادهٔ آفلاین ناموفق بود؛ ورودی محلی حذف می‌شود.', error);
        await deleteEntry(database, userId, namespace, cacheKey);
        return null;
    }
}

async function writeEntry<T>(
    database: SQLiteDatabase,
    userId: number,
    namespace: string,
    cacheKey: string,
    value: T,
): Promise<number> {
    const json = JSON.stringify(value);
    if (json === undefined) {
        throw new TypeError('دادهٔ آفلاین باید به JSON قابل تبدیل باشد.');
    }
    const key = await getEncryptionKey();
    const sealedData = await aesEncryptAsync(
        new TextEncoder().encode(json),
        key,
        { additionalData: getAdditionalData(userId, namespace, cacheKey) },
    );
    const ciphertext = await sealedData.ciphertext({ includeTag: true, encoding: 'base64' });
    const initializationVector = await sealedData.iv('base64');
    const updatedAt = Date.now();

    await database.runAsync(
        `INSERT OR REPLACE INTO offline_cache_entries
         (user_id, namespace, cache_key, ciphertext, initialization_vector, updated_at)
         VALUES (?, ?, ?, ?, ?, ?);`,
        [userId, namespace, cacheKey, ciphertext, initializationVector, updatedAt],
    );
    await database.runAsync(
        'DELETE FROM offline_cache_entries WHERE updated_at < ?;',
        [updatedAt - CACHE_POLICY.offline.defaults.maxAgeMs],
    );
    return updatedAt;
}
