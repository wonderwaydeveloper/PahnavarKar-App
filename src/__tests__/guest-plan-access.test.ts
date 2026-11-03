import AsyncStorage from '@react-native-async-storage/async-storage';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fetchPlanCatalog, isTemporaryApiFailure, type PlanAccess, type PlanCatalog } from '@/services/auth-api';
import { GUEST_PLAN_ACCESS_CACHE_MAX_AGE_MS, getCachedGuestPlanAccess, loadGuestPlanAccess } from '@/services/guest-plan-access';

const mockStorage = new Map<string, string>();

jest.mock('@react-native-async-storage/async-storage', () => ({
    __esModule: true,
    default: {
        getItem: async (key: string) => mockStorage.get(key) ?? null,
        setItem: async (key: string, value: string) => {
            mockStorage.set(key, value);
        },
        removeItem: async (key: string) => {
            mockStorage.delete(key);
        },
        clear: async () => {
            mockStorage.clear();
        },
    },
}));

jest.mock('@/services/auth-api', () => ({
    fetchPlanCatalog: jest.fn(),
    isTemporaryApiFailure: jest.fn(),
}));

const freePlan: PlanAccess = {
    key: 'free',
    name: 'رایگان',
    features: {
        'base-salary': true,
        'group-calculation': false,
    },
};

const catalog: PlanCatalog = {
    tiers: [freePlan],
    durations: [],
    offers: [],
    feature_catalog: {},
};

const fetchPlanCatalogMock = jest.mocked(fetchPlanCatalog);
const isTemporaryApiFailureMock = jest.mocked(isTemporaryApiFailure);

describe('guest plan access offline cache', () => {
    beforeEach(async () => {
        await AsyncStorage.clear();
        fetchPlanCatalogMock.mockReset();
        isTemporaryApiFailureMock.mockReset();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('saves the server free tier for a bounded offline fallback', async () => {
        const now = 1_800_000_000_000;
        jest.spyOn(Date, 'now').mockReturnValue(now);
        fetchPlanCatalogMock.mockResolvedValue(catalog);

        await expect(loadGuestPlanAccess()).resolves.toEqual({
            plan: freePlan,
            validUntil: now + GUEST_PLAN_ACCESS_CACHE_MAX_AGE_MS,
        });
        await expect(getCachedGuestPlanAccess()).resolves.toEqual({
            plan: freePlan,
            validUntil: now + GUEST_PLAN_ACCESS_CACHE_MAX_AGE_MS,
        });
    });

    it('uses the cached free tier after a temporary network failure', async () => {
        fetchPlanCatalogMock.mockResolvedValue(catalog);
        await loadGuestPlanAccess();

        const networkError = new TypeError('Network request failed');
        fetchPlanCatalogMock.mockRejectedValue(networkError);
        isTemporaryApiFailureMock.mockReturnValue(true);

        await expect(loadGuestPlanAccess()).resolves.toMatchObject({ plan: freePlan });
    });

    it('fails closed when no valid cached free tier exists', async () => {
        fetchPlanCatalogMock.mockRejectedValue(new TypeError('Network request failed'));
        isTemporaryApiFailureMock.mockReturnValue(true);

        await expect(loadGuestPlanAccess()).rejects.toThrow('دسترسی آفلاین معتبری در دستگاه ذخیره نشده است');
    });

    it('expires the cached free tier after 24 hours', async () => {
        const now = 1_800_000_000_000;
        jest.spyOn(Date, 'now').mockReturnValue(now);
        fetchPlanCatalogMock.mockResolvedValue(catalog);
        await loadGuestPlanAccess();

        jest.spyOn(Date, 'now').mockReturnValue(now + GUEST_PLAN_ACCESS_CACHE_MAX_AGE_MS);
        await expect(getCachedGuestPlanAccess()).resolves.toBeNull();
    });

    it('does not use a cache to bypass a non-temporary API rejection', async () => {
        fetchPlanCatalogMock.mockResolvedValue(catalog);
        await loadGuestPlanAccess();

        const rejection = new Error('Rejected');
        fetchPlanCatalogMock.mockRejectedValue(rejection);
        isTemporaryApiFailureMock.mockReturnValue(false);

        await expect(loadGuestPlanAccess()).rejects.toBe(rejection);
    });

    it('keeps a successful online access result when local cache storage fails', async () => {
        fetchPlanCatalogMock.mockResolvedValue(catalog);
        jest.spyOn(AsyncStorage, 'setItem').mockRejectedValue(new Error('Storage unavailable'));
        jest.spyOn(console, 'warn').mockImplementation(() => {});

        const access = await loadGuestPlanAccess();

        expect(access.plan).toEqual(freePlan);
        expect(access.validUntil).toBeGreaterThan(Date.now());
        expect(access.validUntil).toBeLessThanOrEqual(Date.now() + GUEST_PLAN_ACCESS_CACHE_MAX_AGE_MS);
    });
});
