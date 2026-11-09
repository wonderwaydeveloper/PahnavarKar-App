import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ComponentProps, ReactNode } from 'react';

import { useAppContext } from '@/hooks/use-app-context';
import { useAppFeedback } from '@/hooks/use-app-feedback';
import { useAuth } from '@/hooks/use-auth';
import { useTheme } from '@/hooks/use-theme';
import {
    fetchCurrentPlan,
    fetchPlanCatalog,
    fetchWalletOverview,
    getStoredAuthToken,
    updateAutoRenew,
} from '@/services/auth-api';
import PurchasedPlansScreen from '@/app/(tabs)/account/purchased-plans';
import { getOfflinePageNotices } from '@/services/offline-page-status';

jest.mock('expo-router', () => ({
    usePathname: () => '/account/purchased-plans',
    useFocusEffect: jest.fn(),
    useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: () => null }));
jest.mock('react-native-reanimated', () => {
    const React = jest.requireActual<typeof import('react')>('react');
    const { View } = jest.requireActual<typeof import('react-native')>('react-native');
    const AnimatedView = (props: ComponentProps<typeof View>) => React.createElement(View, props);

    return {
        __esModule: true,
        default: { createAnimatedComponent: () => AnimatedView, View: AnimatedView },
        Easing: { cubic: jest.fn(), out: () => jest.fn() },
        ReduceMotion: { System: 'system' },
        useAnimatedProps: (callback: () => object) => callback(),
        useAnimatedStyle: (callback: () => object) => callback(),
        useSharedValue: (value: number) => ({ value }),
        withTiming: (value: number) => value,
    };
});
jest.mock('@/hooks/use-auth', () => ({ useAuth: jest.fn() }));
jest.mock('@/hooks/use-app-context', () => ({ useAppContext: jest.fn() }));
jest.mock('@/hooks/use-app-feedback', () => ({ useAppFeedback: jest.fn() }));
jest.mock('@/hooks/use-plan-access', () => ({
    usePlanAccess: () => ({ refresh: jest.fn(async () => true) }),
}));
jest.mock('@/hooks/use-theme', () => ({ useTheme: jest.fn() }));
jest.mock('@/services/auth-api', () => ({
    AuthApiError: class AuthApiError extends Error {
        readonly code = null;
        readonly capability = null;
        readonly reason = null;
        readonly restrictedUntil = null;
    },
    cancelScheduledSubscription: jest.fn(),
    fetchCurrentPlan: jest.fn(),
    fetchPlanCatalog: jest.fn(),
    fetchWalletOverview: jest.fn(),
    getStoredAuthToken: jest.fn(),
    updateAutoRenew: jest.fn(),
}));
jest.mock('@/services/account-offline-cache', () => {
    const cachedValues = new Map<string, unknown>();

    return {
        ACCOUNT_OFFLINE_CACHE: {
            currentPlan: { namespace: 'subscription-account-v1', key: 'current-plan', maxAgeMs: 2592000000 },
            planCatalog: { namespace: 'subscription-catalog-v1', key: 'catalog', maxAgeMs: 2592000000 },
            wallet: { namespace: 'account-wallet-v1', key: 'overview', maxAgeMs: 2592000000 },
        },
        fetchWithOfflineFallback: jest.fn(async (
            _userId: number,
            cache: { namespace: string; key: string },
            fetcher: () => Promise<unknown>,
            _isValid: (value: unknown) => boolean,
            options: { isOnline?: boolean } = {},
        ) => {
            const cacheKey = `${cache.namespace}:${cache.key}`;
            try {
                const value = await fetcher();
                cachedValues.set(cacheKey, value);
                return options.isOnline === false
                    ? { value, offlineCacheSavedAt: 1234 }
                    : { value };
            } catch (error) {
                const cachedValue = cachedValues.get(cacheKey);
                if (error instanceof TypeError && options.isOnline !== false && cachedValue !== undefined) {
                    return { value: cachedValue, offlineCacheSavedAt: 1234 };
                }
                throw error;
            }
        }),
        isCurrentPlanCacheValue: jest.fn(() => true),
        isPlanCatalogCacheValue: jest.fn(() => true),
        isWalletOverviewCacheValue: jest.fn(() => true),
        withOfflineCacheMetadata: jest.fn((result: { value: object; offlineCacheSavedAt?: number }) => (
            result.offlineCacheSavedAt === undefined
                ? result.value
                : { ...result.value, offlineCacheSavedAt: result.offlineCacheSavedAt }
        )),
    };
});
jest.mock('@/constants/theme', () => ({
    Radius: { sm: 8, md: 12, lg: 16, xl: 24 },
    Spacing: { half: 2, one: 4, two: 8, three: 16, four: 24, five: 32, six: 64 },
}));
jest.mock('@/components/confirmation-modal', () => ({ ConfirmationModal: () => null }));
jest.mock('@/components/error-notice-card', () => {
    const React = jest.requireActual<typeof import('react')>('react');
    const { Text, View } = jest.requireActual<typeof import('react-native')>('react-native');

    return {
        ErrorNoticeCard: ({ message }: { message: string }) => React.createElement(
            View,
            null,
            React.createElement(Text, { accessibilityRole: 'alert' }, message),
        ),
    };
});
jest.mock('@/components/themed-text', () => {
    const React = jest.requireActual<typeof import('react')>('react');
    const { Text } = jest.requireActual<typeof import('react-native')>('react-native');

    return {
        ThemedText: ({ children, type: _type, ...props }: ComponentProps<typeof Text> & { type?: string }) => (
            React.createElement(Text, props, children)
        ),
    };
});
jest.mock('@/components/themed-view', () => {
    const React = jest.requireActual<typeof import('react')>('react');
    const { View } = jest.requireActual<typeof import('react-native')>('react-native');

    return { ThemedView: (props: ComponentProps<typeof View>) => React.createElement(View, props) };
});
jest.mock('react-native-paper', () => {
    const React = jest.requireActual<typeof import('react')>('react');
    const { View } = jest.requireActual<typeof import('react-native')>('react-native');

    return { Snackbar: ({ children }: { children: ReactNode }) => React.createElement(View, null, children) };
});
jest.mock('react-native-tab-view', () => {
    const React = jest.requireActual<typeof import('react')>('react');
    const { View } = jest.requireActual<typeof import('react-native')>('react-native');

    return {
        TabView: ({ navigationState, onIndexChange, renderScene, renderTabBar }: {
            navigationState: { index: number; routes: { key: string; title: string }[] };
            onIndexChange: (index: number) => void;
            renderScene: (input: { route: { key: string; title: string } }) => ReactNode;
            renderTabBar: (input: {
                navigationState: { index: number; routes: { key: string; title: string }[] };
                jumpTo: (key: string) => void;
            }) => ReactNode;
        }) => {
            const jumpTo = (key: string) => {
                const nextIndex = navigationState.routes.findIndex((route) => route.key === key);
                if (nextIndex < 0) return;
                onIndexChange(nextIndex);
            };
            return React.createElement(
                View,
                null,
                renderTabBar({ navigationState, jumpTo }),
                renderScene({ route: navigationState.routes[navigationState.index]! }),
            );
        },
    };
});

const lightThemeColors = {
    text: '#102A39',
    textSecondary: '#4B6275',
    textMuted: '#536B79',
    background: '#EFF8FA',
    surface: '#FFFFFF',
    surfaceVariant: '#D9EFF2',
    surfaceElevated: '#F5FBFC',
    border: '#BBD9DE',
    borderStrong: '#698D94',
    primary: '#26C6DA',
    primaryText: '#006B78',
    onPrimary: '#00363F',
    primaryContainer: '#D2F1F4',
    onPrimaryContainer: '#004F58',
    secondary: '#2F6D8A',
    onSecondary: '#FFFFFF',
    success: '#18794E',
    warning: '#8A5700',
    warningFill: '#8A5700',
    onWarning: '#FFFFFF',
    error: '#B42318',
    info: '#175CD3',
    overlay: 'transparent',
};
const darkThemeColors = {
    ...lightThemeColors,
    primaryContainer: '#004F58',
    onPrimaryContainer: '#D2F1F4',
    success: '#4ADE80',
    info: '#0096C7',
};

const user = {
    id: 7,
    name: 'Test User',
    phone: '09120000000',
    profile_photo_path: null,
    phone_verified_at: null,
    last_active_at: null,
    inactivity_deletion_period_months: null,
    inactivity_deletion_scheduled_at: null,
};
const subscription = {
    id: 12,
    plan_key: 'bronze_month',
    type: 'purchase',
    status: 'active',
    starts_at: '2025-01-01T00:00:00.000Z',
    ends_at: '2035-01-01T00:00:00.000Z',
    cancelled_at: null,
    cancellation_scheduled: false,
    auto_renew: false,
    auto_renew_failed_at: null,
    auto_renew_failure_reason: null,
    is_active: true,
};
const currentPlan = {
    plan: { key: 'bronze', name: 'برنزی', features: {} },
    subscription,
    subscriptions: [subscription],
    scheduled_subscription: null,
    last_subscription: null,
};
const catalog = {
    tiers: [
        { key: 'bronze', name: 'برنزی', features: {} },
        { key: 'silver', name: 'نقره‌ای', features: {} },
    ],
    durations: [],
    offers: [],
    feature_catalog: {},
};

async function renderScreen() {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });

    return render(
        <QueryClientProvider client={queryClient}>
            <PurchasedPlansScreen />
        </QueryClientProvider>,
    );
}

beforeEach(() => {
    jest.clearAllMocks();
    onlineManager.setOnline(false);
    jest.mocked(useAppContext).mockReturnValue({ theme: 'light' } as ReturnType<typeof useAppContext>);
    jest.mocked(useTheme).mockReturnValue(lightThemeColors as ReturnType<typeof useTheme>);
    jest.mocked(useAuth).mockReturnValue({ user, isLoading: false } as ReturnType<typeof useAuth>);
    jest.mocked(useAppFeedback).mockReturnValue({
        showFeedback: jest.fn(),
        dismissFeedback: jest.fn(),
        showError: jest.fn(),
    });
    jest.mocked(getStoredAuthToken).mockResolvedValue('test-token');
    jest.mocked(fetchCurrentPlan).mockResolvedValue(currentPlan);
    jest.mocked(fetchPlanCatalog).mockResolvedValue(catalog);
    jest.mocked(fetchWalletOverview).mockResolvedValue({
        balance: 50000,
        currency: 'IRR',
        unit: 'toman',
        bank_account_iban_masked: null,
        top_up_min_amount: 10000,
        top_up_max_amount: 100000000,
        withdrawals: { enabled: false, max_per_request: 0, max_per_day: 0 },
    });
});

afterEach(() => {
    cleanup();
    onlineManager.setOnline(true);
});

describe('PurchasedPlansScreen', () => {
    it('does not stay loading when the current-plan request fails', async () => {
        jest.mocked(fetchCurrentPlan).mockRejectedValue(new Error('Current plan unavailable'));

        const view = await renderScreen();

        expect(await view.findByText('دریافت پلن‌های خریداری‌شده ناموفق بود.')).toBeTruthy();
        expect(view.queryByText('در حال دریافت پلن‌ها…')).toBeNull();
    });

    it('shows cached plans offline and disables subscription changes', async () => {
        const view = await renderScreen();

        await waitFor(() => {
            expect(getOfflinePageNotices().filter((notice) => (
                notice.pathname === '/account/purchased-plans'
            ))).toHaveLength(1);
            expect(getOfflinePageNotices().some((notice) => (
                notice.pathname === '/account/purchased-plans'
                && notice.message === 'اطلاعات ذخیره‌شدهٔ اشتراک ممکن است به‌روز نباشد.'
            ))).toBe(true);
        });
        expect(view.getByText('پایان دسترسی پلن فعلی')).toBeTruthy();
        expect(view.getByText('روز مانده')).toBeTruthy();
        expect(view.getByTestId('remaining-days-badge').props.style).toEqual(
            expect.arrayContaining([expect.objectContaining({ backgroundColor: lightThemeColors.primary })]),
        );
        expect(view.getByTestId('remaining-days-count').props.style).toEqual(
            expect.objectContaining({ color: lightThemeColors.onPrimary }),
        );
        expect(view.getByText('روز مانده').props.style).toEqual(
            expect.objectContaining({ color: lightThemeColors.onPrimary }),
        );
        expect(view.getByTestId('current-plan-icon').props.style).toEqual(
            expect.arrayContaining([expect.objectContaining({ backgroundColor: '#915B27' })]),
        );
        expect(view.getByTestId('remaining-validity-progress').props.style).toEqual(
            expect.arrayContaining([expect.objectContaining({ backgroundColor: lightThemeColors.primary })]),
        );
        expect(view.getByRole('progressbar', { name: /پایان دوره/ })).toBeTruthy();
        expect(view.queryByLabelText(/پیش‌نمایش رنگ/)).toBeNull();
        fireEvent.press(await view.findByRole('button', { name: /برنزی/ }));

        const autoRenewSwitch = await view.findByLabelText('تمدید خودکار با کیف پول');
        expect(autoRenewSwitch.props.disabled).toBe(true);
        await act(async () => {
            fireEvent(autoRenewSwitch, 'valueChange', true);
        });
        expect(updateAutoRenew).not.toHaveBeenCalled();
    });

    it('uses theme colors for validity progress and remaining days in the dark theme', async () => {
        jest.mocked(useAppContext).mockReturnValue({ theme: 'dark' } as ReturnType<typeof useAppContext>);
        jest.mocked(useTheme).mockReturnValue(darkThemeColors as ReturnType<typeof useTheme>);

        const view = await renderScreen();

        await waitFor(() => {
            expect(getOfflinePageNotices().some((notice) => notice.pathname === '/account/purchased-plans')).toBe(true);
        });
        expect(view.getByTestId('remaining-validity-progress').props.style).toEqual(
            expect.arrayContaining([expect.objectContaining({ backgroundColor: darkThemeColors.primary })]),
        );
        expect(view.getByTestId('remaining-days-badge').props.style).toEqual(
            expect.arrayContaining([expect.objectContaining({ backgroundColor: darkThemeColors.primary })]),
        );
        expect(view.getByTestId('remaining-days-count').props.style).toEqual(
            expect.objectContaining({ color: darkThemeColors.onPrimary }),
        );
        expect(view.queryByLabelText(/پیش‌نمایش رنگ/)).toBeNull();
    });

    it('uses live plan data when the server is available', async () => {
        onlineManager.setOnline(true);

        const view = await renderScreen();

        await waitFor(() => expect(fetchCurrentPlan).toHaveBeenCalled());
        await waitFor(() => expect(view.getByText('برنزی')).toBeTruthy());
        fireEvent.press(view.getByText('برنزی'));
        const autoRenewSwitch = await view.findByLabelText('تمدید خودکار با کیف پول');
        expect(autoRenewSwitch.props.disabled).toBe(false);
    });

    it('shows offline status immediately when the server disconnects from live plan data', async () => {
        onlineManager.setOnline(true);

        const view = await renderScreen();
        await waitFor(() => expect(view.getByText('برنزی')).toBeTruthy());
        fireEvent.press(view.getByText('برنزی'));
        const autoRenewSwitch = await view.findByLabelText('تمدید خودکار با کیف پول');
        expect(autoRenewSwitch.props.disabled).toBe(false);

        await act(async () => {
            onlineManager.setOnline(false);
        });
        await waitFor(() => {
            expect(getOfflinePageNotices().some((notice) => (
                notice.pathname === '/account/purchased-plans'
            ))).toBe(true);
            expect(view.getByLabelText('تمدید خودکار با کیف پول').props.disabled).toBe(true);
        });
    });

    it('keeps offline notice and subscription actions pending until live plan data is refreshed', async () => {
        const view = await renderScreen();
        await waitFor(() => {
            expect(getOfflinePageNotices().some((notice) => (
                notice.pathname === '/account/purchased-plans'
                && notice.hasSavedData
            ))).toBe(true);
        });
        fireEvent.press(view.getByText('برنزی'));
        const autoRenewSwitch = await view.findByLabelText('تمدید خودکار با کیف پول');
        expect(autoRenewSwitch.props.disabled).toBe(true);

        let resolveCurrentPlan: ((value: Awaited<ReturnType<typeof fetchCurrentPlan>>) => void) | undefined;
        let resolveCatalog: ((value: Awaited<ReturnType<typeof fetchPlanCatalog>>) => void) | undefined;
        jest.mocked(fetchCurrentPlan).mockImplementationOnce(() => new Promise((resolve) => {
            resolveCurrentPlan = resolve;
        }));
        jest.mocked(fetchPlanCatalog).mockImplementationOnce(() => new Promise((resolve) => {
            resolveCatalog = resolve;
        }));

        await act(async () => {
            onlineManager.setOnline(true);
        });
        await waitFor(() => {
            expect(fetchCurrentPlan).toHaveBeenCalledTimes(2);
            expect(fetchPlanCatalog).toHaveBeenCalledTimes(2);
        });
        expect(autoRenewSwitch.props.disabled).toBe(true);
        expect(getOfflinePageNotices().some((notice) => notice.pathname === '/account/purchased-plans')).toBe(true);

        await act(async () => {
            resolveCurrentPlan?.(currentPlan);
        });
        await waitFor(() => {
            expect(fetchCurrentPlan).toHaveBeenCalledTimes(2);
        });
        expect(getOfflinePageNotices().some((notice) => notice.pathname === '/account/purchased-plans')).toBe(true);

        await act(async () => {
            resolveCatalog?.(catalog);
        });
        await waitFor(() => {
            expect(getOfflinePageNotices().some((notice) => notice.pathname === '/account/purchased-plans')).toBe(false);
            expect(view.getByLabelText('تمدید خودکار با کیف پول').props.disabled).toBe(false);
        });
    });

    it('keeps the offline notice when reconnect still falls back to saved plan data', async () => {
        const view = await renderScreen();
        await waitFor(() => {
            expect(getOfflinePageNotices().some((notice) => (
                notice.pathname === '/account/purchased-plans'
                && notice.hasSavedData
            ))).toBe(true);
        });
        fireEvent.press(view.getByText('برنزی'));
        const autoRenewSwitch = await view.findByLabelText('تمدید خودکار با کیف پول');
        jest.mocked(fetchCurrentPlan).mockRejectedValueOnce(new TypeError('Server unavailable'));

        await act(async () => {
            onlineManager.setOnline(true);
        });
        await waitFor(() => {
            expect(fetchCurrentPlan).toHaveBeenCalledTimes(2);
            expect(getOfflinePageNotices().some((notice) => (
                notice.pathname === '/account/purchased-plans'
                && notice.hasSavedData
            ))).toBe(true);
            expect(view.getByLabelText('تمدید خودکار با کیف پول').props.disabled).toBe(true);
        });
        expect(autoRenewSwitch.props.disabled).toBe(true);
    });

    it('reports catalog errors without keeping the main screen loading', async () => {
        jest.mocked(fetchPlanCatalog).mockRejectedValue(new Error('Catalog unavailable'));

        const view = await renderScreen();

        expect(await view.findByText('دریافت نام پلن‌ها ناموفق بود.')).toBeTruthy();
        expect(view.queryByText('در حال دریافت پلن‌ها…')).toBeNull();
    });

    it('uses the theme primary color for the reserved activation countdown', async () => {
        const now = Date.now();
        const dayMs = 24 * 60 * 60 * 1000;
        const scheduledSubscription = {
            ...subscription,
            id: 13,
            plan_key: 'silver_month',
            starts_at: new Date(now + 20 * dayMs).toISOString(),
            ends_at: new Date(now + 50 * dayMs).toISOString(),
            is_active: false,
            reservation_created_at: new Date(now - 10 * dayMs).toISOString(),
            refundable_amount: 120000,
        };
        jest.mocked(fetchCurrentPlan).mockResolvedValue({
            ...currentPlan,
            subscriptions: [subscription, scheduledSubscription],
            scheduled_subscription: scheduledSubscription,
        });

        const view = await renderScreen();
        fireEvent.press(await view.findByRole('tab', { name: /رزروشده/ }));

        expect(await view.findByText('زمان باقی‌مانده تا فعال‌سازی')).toBeTruthy();
        expect(view.getByTestId('scheduled-activation-progress').props.style).toEqual(
            expect.arrayContaining([expect.objectContaining({ backgroundColor: lightThemeColors.primary })]),
        );
        expect(view.getByTestId('scheduled-plan-icon').props.style).toEqual(
            expect.arrayContaining([expect.objectContaining({ backgroundColor: '#6D6D6D' })]),
        );
        const progressBar = view.getByRole('progressbar', { name: /۲۰ روز/ });
        expect(progressBar.props.accessibilityValue.now).toBeGreaterThanOrEqual(66);
        expect(progressBar.props.accessibilityValue.now).toBeLessThanOrEqual(67);
    });

    it('shows the reserved plan as the next step from the current plan and opens its details', async () => {
        const now = Date.now();
        const scheduledSubscription = {
            ...subscription,
            id: 13,
            plan_key: 'silver_month',
            starts_at: new Date(now + 20 * 24 * 60 * 60 * 1000).toISOString(),
            ends_at: new Date(now + 50 * 24 * 60 * 60 * 1000).toISOString(),
            is_active: false,
            reservation_created_at: new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString(),
            refundable_amount: 120000,
        };
        jest.mocked(fetchCurrentPlan).mockResolvedValue({
            ...currentPlan,
            subscriptions: [subscription, scheduledSubscription],
            scheduled_subscription: scheduledSubscription,
        });

        const view = await renderScreen();

        const nextStep = await view.findByRole('button', { name: /جزئیات پلن رزروشدهٔ نقره‌ای/ });
        expect(view.getByText('مرحلهٔ بعدی اشتراک')).toBeTruthy();
        expect(view.getByTestId('scheduled-plan-preview-icon').props.style).toEqual(
            expect.arrayContaining([expect.objectContaining({ backgroundColor: '#6D6D6D' })]),
        );
        expect(view.getByText(/پس از پایان پلن فعلی · شروع/)).toBeTruthy();
        expect(view.getByText(/این رزرو فقط برای مشاهده است و به‌تنهایی دسترسی یا مجوز آفلاین ایجاد نمی‌کند/)).toBeTruthy();

        fireEvent.press(nextStep);

        expect(await view.findByText('زمان باقی‌مانده تا فعال‌سازی')).toBeTruthy();
    });

    it('preserves the selected silver icon background in the dark theme', async () => {
        jest.mocked(useAppContext).mockReturnValue({ theme: 'dark' } as ReturnType<typeof useAppContext>);
        jest.mocked(useTheme).mockReturnValue(darkThemeColors as ReturnType<typeof useTheme>);
        const now = Date.now();
        const scheduledSubscription = {
            ...subscription,
            id: 13,
            plan_key: 'silver_month',
            starts_at: new Date(now + 20 * 24 * 60 * 60 * 1000).toISOString(),
            ends_at: new Date(now + 50 * 24 * 60 * 60 * 1000).toISOString(),
            is_active: false,
            reservation_created_at: new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString(),
            refundable_amount: 120000,
        };
        jest.mocked(fetchCurrentPlan).mockResolvedValue({
            ...currentPlan,
            subscriptions: [subscription, scheduledSubscription],
            scheduled_subscription: scheduledSubscription,
        });

        const view = await renderScreen();
        fireEvent.press(await view.findByRole('tab', { name: /رزروشده/ }));

        expect(await view.findByText('زمان باقی‌مانده تا فعال‌سازی')).toBeTruthy();
        expect(view.getByTestId('scheduled-activation-progress').props.style).toEqual(
            expect.arrayContaining([expect.objectContaining({ backgroundColor: darkThemeColors.primary })]),
        );
        expect(view.getByTestId('scheduled-plan-icon').props.style).toEqual(
            expect.arrayContaining([expect.objectContaining({ backgroundColor: '#C4C4C4' })]),
        );
    });
});
