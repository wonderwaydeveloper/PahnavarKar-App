import AsyncStorage from '@react-native-async-storage/async-storage';
import { CACHE_POLICY } from '@/services/cache-policy';
import { fetchPlanCatalog, isTemporaryApiFailure, type PlanAccess } from '@/services/auth-api';

const GUEST_PLAN_ACCESS_CACHE_KEY = CACHE_POLICY.storage.guestPlanAccess.key;
export const GUEST_PLAN_ACCESS_CACHE_MAX_AGE_MS = CACHE_POLICY.storage.guestPlanAccess.maxAgeMs;

interface CachedGuestPlanAccess {
    plan: PlanAccess;
    cachedAt: number;
}

export interface GuestPlanAccessLease {
    plan: PlanAccess;
    validUntil: number;
}

function isPlanAccess(value: unknown): value is PlanAccess {
    if (!value || typeof value !== 'object') {
        return false;
    }

    const plan = value as Partial<PlanAccess>;
    return plan.key === 'free'
        && typeof plan.name === 'string'
        && Boolean(plan.features)
        && typeof plan.features === 'object'
        && !Array.isArray(plan.features)
        && Object.values(plan.features).every((feature) => typeof feature === 'boolean');
}

export async function getCachedGuestPlanAccess(): Promise<GuestPlanAccessLease | null> {
    const raw = await AsyncStorage.getItem(GUEST_PLAN_ACCESS_CACHE_KEY);
    if (!raw) {
        return null;
    }

    let cached: unknown;
    try {
        cached = JSON.parse(raw);
    } catch {
        await AsyncStorage.removeItem(GUEST_PLAN_ACCESS_CACHE_KEY);
        return null;
    }

    if (!cached || typeof cached !== 'object' || !('plan' in cached) || !('cachedAt' in cached)) {
        await AsyncStorage.removeItem(GUEST_PLAN_ACCESS_CACHE_KEY);
        return null;
    }

    const value = cached as CachedGuestPlanAccess;
    const now = Date.now();
    if (
        !isPlanAccess(value.plan)
        || !Number.isFinite(value.cachedAt)
        || value.cachedAt > now
        || now - value.cachedAt >= GUEST_PLAN_ACCESS_CACHE_MAX_AGE_MS
    ) {
        await AsyncStorage.removeItem(GUEST_PLAN_ACCESS_CACHE_KEY);
        return null;
    }

    return {
        plan: value.plan,
        validUntil: value.cachedAt + GUEST_PLAN_ACCESS_CACHE_MAX_AGE_MS,
    };
}

async function storeGuestPlanAccess(plan: PlanAccess): Promise<GuestPlanAccessLease> {
    if (!isPlanAccess(plan)) {
        throw new Error('اطلاعات پلن رایگان از سرور معتبر نیست و ذخیره نشد.');
    }

    const cachedAt = Date.now();
    await AsyncStorage.setItem(GUEST_PLAN_ACCESS_CACHE_KEY, JSON.stringify({
        plan,
        cachedAt,
    } satisfies CachedGuestPlanAccess));
    return {
        plan,
        validUntil: cachedAt + GUEST_PLAN_ACCESS_CACHE_MAX_AGE_MS,
    };
}

export async function loadGuestPlanAccess(): Promise<GuestPlanAccessLease> {
    let catalog;
    try {
        catalog = await fetchPlanCatalog();
    } catch (error) {
        if (!isTemporaryApiFailure(error)) {
            throw error;
        }

        const cachedPlan = await getCachedGuestPlanAccess();
        if (cachedPlan) {
            return cachedPlan;
        }

        throw new Error('دسترسی آفلاین معتبری در دستگاه ذخیره نشده است. برای دریافت دسترسی، به اینترنت وصل شوید و دوباره تلاش کنید.');
    }

    const freePlan = catalog.tiers.find((tier) => tier.key === 'free');
    if (!freePlan || !isPlanAccess(freePlan)) {
        throw new Error('اطلاعات پلن رایگان از سرور معتبر نیست.');
    }

    try {
        return await storeGuestPlanAccess(freePlan);
    } catch (error) {
        console.warn('ذخیرهٔ دسترسی عمومی برای استفادهٔ آفلاین ناموفق بود.', error);
        return {
            plan: freePlan,
            validUntil: Date.now() + GUEST_PLAN_ACCESS_CACHE_MAX_AGE_MS,
        };
    }
}
