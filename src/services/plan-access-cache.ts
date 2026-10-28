import { isRunningInExpoGo } from 'expo';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { OFFLINE_ACCESS_GRACE_PERIOD_MS, type PlanAccess } from '@/services/auth-api';

const PLAN_ACCESS_CACHE_KEY = 'pahnavarkar.plan-access.cache';
const EXPIRY_NOTIFICATION_KEY = 'pahnavarkar.plan-access.expiry-notification';

export interface CachedPlanAccess {
    userId: number;
    tokenHash: string;
    plan: PlanAccess;
    verifiedAt: number;
    validUntil: number;
}

function isPlanAccess(value: unknown): value is PlanAccess {
    if (!value || typeof value !== 'object') {
        return false;
    }

    const plan = value as Partial<PlanAccess>;
    return typeof plan.key === 'string'
        && typeof plan.name === 'string'
        && Boolean(plan.features)
        && typeof plan.features === 'object';
}

export async function getCachedPlanAccess(userId: number, token: string): Promise<CachedPlanAccess | null> {
    if (Platform.OS === 'web') {
        return null;
    }

    const tokenHash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, token);
    const raw = await SecureStore.getItemAsync(PLAN_ACCESS_CACHE_KEY);
    if (!raw) {
        return null;
    }

    let cached: unknown;
    try {
        cached = JSON.parse(raw);
    } catch {
        await SecureStore.deleteItemAsync(PLAN_ACCESS_CACHE_KEY);
        return null;
    }

    if (
        !cached
        || typeof cached !== 'object'
        || !('userId' in cached)
        || !('plan' in cached)
        || !('verifiedAt' in cached)
        || !('validUntil' in cached)
    ) {
        await SecureStore.deleteItemAsync(PLAN_ACCESS_CACHE_KEY);
        return null;
    }

    const now = Date.now();
    let value = cached as CachedPlanAccess;
    if (
        value.userId !== userId
        || !isPlanAccess(value.plan)
        || !Number.isFinite(value.verifiedAt)
        || !Number.isFinite(value.validUntil)
        || value.verifiedAt > now
        || value.validUntil <= value.verifiedAt
        || value.validUntil > value.verifiedAt + OFFLINE_ACCESS_GRACE_PERIOD_MS
    ) {
        return null;
    }

    if (value.tokenHash === undefined) {
        value = { ...value, tokenHash };
        await SecureStore.setItemAsync(PLAN_ACCESS_CACHE_KEY, JSON.stringify(value));
    } else if (typeof value.tokenHash !== 'string' || value.tokenHash !== tokenHash) {
        return null;
    }

    return value;
}

export async function saveCachedPlanAccess(
    userId: number,
    token: string,
    plan: PlanAccess,
    subscriptionEndsAt: string | null,
): Promise<CachedPlanAccess> {
    const verifiedAt = Date.now();
    let validUntil = verifiedAt + OFFLINE_ACCESS_GRACE_PERIOD_MS;

    if (subscriptionEndsAt !== null) {
        const subscriptionEnd = Date.parse(subscriptionEndsAt);
        if (!Number.isFinite(subscriptionEnd)) {
            throw new Error('زمان پایان اشتراک از سرور معتبر نیست؛ دسترسی آفلاین ذخیره نشد.');
        }
        validUntil = Math.min(validUntil, subscriptionEnd);
    }

    const tokenHash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, token);
    const cached: CachedPlanAccess = { userId, tokenHash, plan, verifiedAt, validUntil };
    if (Platform.OS !== 'web') {
        await SecureStore.setItemAsync(PLAN_ACCESS_CACHE_KEY, JSON.stringify(cached));
        try {
            await scheduleExpiryNotification(validUntil);
        } catch (error) {
            console.error('زمان‌بندی اعلان پایان اعتبار دسترسی ناموفق بود.', error);
        }
    }

    return cached;
}

export async function clearCachedPlanAccess(): Promise<void> {
    if (Platform.OS === 'web') {
        return;
    }

    await SecureStore.deleteItemAsync(PLAN_ACCESS_CACHE_KEY);
    const notificationId = await SecureStore.getItemAsync(EXPIRY_NOTIFICATION_KEY);
    if (notificationId) {
        try {
            if (!isRunningInExpoGo()) {
                const Notifications = await import('expo-notifications');
                await Notifications.cancelScheduledNotificationAsync(notificationId);
            }
        } catch (error) {
            console.error('لغو اعلان پایان اعتبار دسترسی ناموفق بود.', error);
        } finally {
            await SecureStore.deleteItemAsync(EXPIRY_NOTIFICATION_KEY);
        }
    }
}

async function scheduleExpiryNotification(validUntil: number): Promise<void> {
    if (isRunningInExpoGo()) {
        return;
    }

    const Notifications = await import('expo-notifications');
    const previousId = await SecureStore.getItemAsync(EXPIRY_NOTIFICATION_KEY);
    if (previousId) {
        await Notifications.cancelScheduledNotificationAsync(previousId);
        await SecureStore.deleteItemAsync(EXPIRY_NOTIFICATION_KEY);
    }

    if (validUntil <= Date.now()) {
        return;
    }

    const permission = await Notifications.getPermissionsAsync();
    if (permission.status !== 'granted') {
        return;
    }

    const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
            title: 'نیاز به اتصال اینترنت',
            body: 'برای بررسی دوبارهٔ دسترسی ابزارها، به اینترنت متصل شوید.',
        },
        trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: new Date(validUntil),
        },
    });
    await SecureStore.setItemAsync(EXPIRY_NOTIFICATION_KEY, notificationId);
}
