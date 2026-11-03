import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

const OFFLINE_CACHE_DATABASE_NAME = 'pahnavarkar-offline-cache.db';

let databasePromise: Promise<SQLiteDatabase> | null = null;
let operationQueue: Promise<void> = Promise.resolve();

export async function getOfflineCacheDatabase(): Promise<SQLiteDatabase> {
    if (!databasePromise) {
        databasePromise = openDatabaseAsync(OFFLINE_CACHE_DATABASE_NAME)
            .then(async (database) => {
                await database.execAsync('PRAGMA busy_timeout = 5000;');
                await database.execAsync(`CREATE TABLE IF NOT EXISTS offline_cache_entries (
                    user_id INTEGER NOT NULL,
                    namespace TEXT NOT NULL,
                    cache_key TEXT NOT NULL,
                    ciphertext TEXT NOT NULL,
                    initialization_vector TEXT NOT NULL,
                    updated_at INTEGER NOT NULL,
                    PRIMARY KEY (user_id, namespace, cache_key)
                );`);
                await database.execAsync(`CREATE INDEX IF NOT EXISTS offline_cache_entries_user_namespace_index
                    ON offline_cache_entries (user_id, namespace);`);
                return database;
            })
            .catch((error: unknown) => {
                databasePromise = null;
                throw error;
            });
    }

    return databasePromise;
}

export async function withOfflineCacheDatabaseLock<T>(
    operation: (database: SQLiteDatabase) => Promise<T>,
): Promise<T> {
    const previous = operationQueue;
    let release: (() => void) | undefined;
    const current = new Promise<void>((resolve) => {
        release = resolve;
    });

    operationQueue = previous.then(() => current);
    await previous;

    try {
        return await operation(await getOfflineCacheDatabase());
    } finally {
        release?.();
    }
}
