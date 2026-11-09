import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ComponentProps, ReactNode } from 'react';

import type { AppContextType } from '@/context/app.context';
import type { AuthContextType } from '@/context/auth.context';
import type { PlanAccessContextType } from '@/context/plan-access.context';
import { useAppContext } from '@/hooks/use-app-context';
import { useAppFeedback } from '@/hooks/use-app-feedback';
import { useAuth } from '@/hooks/use-auth';
import { usePlanAccess } from '@/hooks/use-plan-access';
import {
    fetchPaymentOrder,
    fetchPendingSubscriptionOrder,
    fetchPlanCatalog,
    fetchWalletOverview,
    getStoredAuthToken,
    purchaseSubscription,
    quoteSubscription,
    type PlanCatalog,
    type SubscriptionQuote,
    type WalletOverview,
} from '@/services/auth-api';
import { ACCOUNT_OFFLINE_CACHE, saveOfflineCacheValue } from '@/services/account-offline-cache';
import PlanCatalogScreen from '@/app/(tabs)/account/plan-catalog';
import { getOfflinePageNotices } from '@/services/offline-page-status';

let mockIsOnline = true;
let mockServerStatus: 'connecting' | 'connected' | 'server-unavailable' = 'connected';

jest.mock('expo-router', () => ({
    usePathname: () => '/account/plan-catalog',
    useFocusEffect: jest.fn(),
    useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('@/hooks/use-online-status', () => ({
    useOnlineStatus: () => mockIsOnline,
    useServerConnectivityStatus: () => mockServerStatus,
}));

jest.mock('expo-crypto', () => ({
    randomUUID: () => '11111111-1111-4111-8111-111111111111',
}));

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

jest.mock('expo-linking', () => ({
    createURL: (path: string) => `pahnavarkar://${path}`,
}));

jest.mock('@/services/account-offline-cache', () => ({
    ACCOUNT_OFFLINE_CACHE: {
        wallet: { namespace: 'account-wallet-v1', key: 'overview', maxAgeMs: 2592000000 },
        planCatalog: { namespace: 'subscription-catalog-v1', key: 'catalog', maxAgeMs: 2592000000 },
        pendingSubscriptionOrder: {
            namespace: 'subscription-catalog-v1',
            key: 'pending-order',
            maxAgeMs: 2592000000,
        },
    },
    fetchWithOfflineFallback: jest.fn(async (_userId: number, _cache: unknown, fetcher: () => Promise<unknown>) => ({
        value: await fetcher(),
    })),
    withOfflineCacheMetadata: jest.fn((result: { value: object; offlineCacheSavedAt?: number }) => (
        result.offlineCacheSavedAt === undefined
            ? result.value
            : { ...result.value, offlineCacheSavedAt: result.offlineCacheSavedAt }
    )),
    saveOfflineCacheValue: jest.fn(async () => {}),
}));

jest.mock('@expo/vector-icons', () => ({
    MaterialCommunityIcons: () => null,
}));

jest.mock('react-native-safe-area-context', () => ({
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

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
        }) => React.createElement(
            View,
            null,
            renderTabBar({
                navigationState,
                jumpTo: (key) => {
                    const index = navigationState.routes.findIndex((route) => route.key === key);
                    if (index >= 0) onIndexChange(index);
                },
            }),
            renderScene({ route: navigationState.routes[navigationState.index] }),
        ),
    };
});

jest.mock('@/components/app-text', () => {
    const React = jest.requireActual<typeof import('react')>('react');
    const { TextInput } = jest.requireActual<typeof import('react-native')>('react-native');

    return {
        AppTextInput: (props: ComponentProps<typeof TextInput>) => React.createElement(TextInput, props),
    };
});

jest.mock('@/components/themed-text', () => {
    const React = jest.requireActual<typeof import('react')>('react');
    const { Text } = jest.requireActual<typeof import('react-native')>('react-native');

    return {
        ThemedText: ({ children, type: _type, themeColor: _themeColor, ...props }: ComponentProps<typeof Text> & {
            type?: string;
            themeColor?: string;
        }) => React.createElement(Text, props, children),
    };
});

jest.mock('@/components/themed-view', () => {
    const React = jest.requireActual<typeof import('react')>('react');
    const { View } = jest.requireActual<typeof import('react-native')>('react-native');

    return {
        ThemedView: (props: ComponentProps<typeof View>) => React.createElement(View, props),
    };
});

jest.mock('@/hooks/use-app-context', () => ({ useAppContext: jest.fn() }));
jest.mock('@/hooks/use-app-feedback', () => ({ useAppFeedback: jest.fn() }));
jest.mock('@/hooks/use-auth', () => ({ useAuth: jest.fn() }));
jest.mock('@/hooks/use-plan-access', () => ({ usePlanAccess: jest.fn() }));
jest.mock('@/hooks/use-theme', () => ({
    useTheme: () => ({
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
        secondary: '#2F6D8A',
        onSecondary: '#FFFFFF',
        success: '#18794E',
        warning: '#8A5700',
        error: '#B42318',
        info: '#175CD3',
        successFill: '#18794E',
        onSuccess: '#FFFFFF',
        warningFill: '#8A5700',
        onWarning: '#FFFFFF',
        errorFill: '#B42318',
        onError: '#FFFFFF',
        infoFill: '#175CD3',
        onInfo: '#FFFFFF',
        onStatus: '#FFFFFF',
        overlay: 'transparent',
        backgroundElement: '#D9EFF2',
        backgroundSelected: '#C5E7EB',
    }),
}));

jest.mock('@/services/auth-api', () => ({
    AuthApiError: class AuthApiError extends Error {
        readonly code = null;
        readonly capability = null;
        readonly reason = null;
        readonly restrictedUntil = null;
    },
    fetchPaymentOrder: jest.fn(),
    fetchPendingSubscriptionOrder: jest.fn(),
    fetchPlanCatalog: jest.fn(),
    fetchWalletOverview: jest.fn(),
    getStoredAuthToken: jest.fn(),
    isTemporaryApiFailure: (error: unknown) => error instanceof TypeError,
    purchaseSubscription: jest.fn(),
    quoteSubscription: jest.fn(),
}));

jest.mock('@/constants/theme', () => ({
    Radius: { sm: 8, md: 12, lg: 16, xl: 24 },
    Spacing: { half: 2, one: 4, two: 8, three: 16, four: 24, five: 32, six: 64 },
}));

const user: NonNullable<AuthContextType['user']> = {
    id: 7,
    name: 'Test User',
    phone: '09120000000',
    profile_photo_path: null,
    phone_verified_at: null,
    last_active_at: null,
    inactivity_deletion_period_months: null,
    inactivity_deletion_scheduled_at: null,
};

const authContext: AuthContextType = {
    user,
    isLoading: false,
    sessionError: null,
    accountSuspension: null,
    refreshUser: async () => {},
    signInWithOtp: async () => 'authenticated',
    verifyTwoFactorLogin: async () => {},
    uploadProfilePhoto: async () => {},
    removeProfilePhoto: async () => {},
    updateProfile: async () => {},
    updateInactivityDeletion: async () => {},
    changePhone: async () => {},
    deleteAccount: async () => {},
    signOut: async () => {},
    signOutAll: async () => {},
    signOutOtherDevices: async () => {},
    getDevices: async () => [],
    revokeUserDevice: async () => {},
};

const appContext: AppContextType = {
    theme: 'light',
    themePreference: 'light',
    colorPalette: 'default',
    colorPaletteTone: null,
    fontPreference: 'system',
    fontSizePreference: 'standard',
    fontError: null,
    currencyPreference: 'toman',
    currencyError: null,
    calculationSound: 'off',
    calculationSoundError: null,
    calculationFeedbackSequence: 0,
    themeReady: true,
    colors: {} as AppContextType['colors'],
    isRTL: true,
    setTheme: async () => {},
    setColorPalette: async () => {},
    setFontPreference: async () => {},
    setFontSizePreference: async () => {},
    setCurrencyPreference: async () => {},
    setCalculationSound: async () => {},
    notifyCalculationCompleted: () => {},
    clearFontError: () => {},
    clearCurrencyError: () => {},
    clearCalculationSoundError: () => {},
};

const planAccessContext: PlanAccessContextType = {
    planAccess: null,
    isUsingOfflineData: false,
    isLoading: false,
    error: null,
    refresh: async () => true,
};

const catalog: PlanCatalog = {
    tiers: [
        { key: 'bronze', name: 'برنزی', features: { 'base-salary': true, 'entitled-seniority': true } },
        { key: 'silver', name: 'نقره‌ای', features: {} },
    ],
    durations: [{ key: '1_month', name: 'یک ماه', duration_days: 30 }],
    offers: [
        { key: 'bronze_1_month', tier: 'bronze', duration: '1_month', duration_days: 30, price: 120000, is_available: true },
        { key: 'silver_1_month', tier: 'silver', duration: '1_month', duration_days: 30, price: 240000, is_available: true },
    ],
    feature_catalog: {
        'base-salary': {
            label: 'حقوق پایه',
            description: 'محاسبه حقوق پایه و نمایش جزئیات آن',
            group: 'اقلام مزدی مستمر',
        },
        'entitled-seniority': {
            label: 'پایه سنوات استحقاقی',
            description: 'محاسبه پایه سنوات بر اساس تاریخ استخدام.',
            group: 'اقلام مزدی مستمر',
        },
    },
};

const wallet: WalletOverview = {
    balance: 0,
    currency: 'IRR',
    unit: 'toman',
    bank_account_iban_masked: null,
    top_up_min_amount: 10000,
    top_up_max_amount: 0,
    withdrawals: { enabled: false, max_per_request: 0, max_per_day: 0 },
};

const makeQuote = (overrides: Partial<SubscriptionQuote> = {}): SubscriptionQuote => ({
    plan_key: 'bronze_1_month',
    tier: 'bronze',
    duration: '1_month',
    duration_days: 30,
    change_type: 'purchase',
    source_subscription_id: null,
    source_plan_key: null,
    payment_method: 'gateway',
    gross_amount: 120000,
    credit_amount: 0,
    discount_amount: 20000,
    payable_amount: 100000,
    wallet_amount: 0,
    gateway_amount: 100000,
    starts_at: '2030-01-01T00:00:00.000Z',
    ends_at: '2030-01-31T00:00:00.000Z',
    ...overrides,
});

const showFeedback = jest.fn();

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((resolvePromise) => {
        resolve = resolvePromise;
    });
    return { promise, resolve };
}

async function renderScreen(offlineSavedAt: {
    catalog?: number;
    wallet?: number;
    pendingOrder?: number;
} = {}) {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    queryClient.setQueryData(['plan-catalog'], offlineSavedAt.catalog === undefined
        ? catalog
        : { ...catalog, offlineCacheSavedAt: offlineSavedAt.catalog });
    queryClient.setQueryData(['wallet-overview', user.id], offlineSavedAt.wallet === undefined
        ? wallet
        : { ...wallet, offlineCacheSavedAt: offlineSavedAt.wallet });
    queryClient.setQueryData(['pending-subscription-order', user.id], offlineSavedAt.pendingOrder === undefined
        ? { order: null, payments: [] }
        : { order: null, payments: [], offlineCacheSavedAt: offlineSavedAt.pendingOrder });

    return render(
        <QueryClientProvider client={queryClient}>
            <PlanCatalogScreen />
        </QueryClientProvider>,
    );
}

beforeEach(() => {
    jest.clearAllMocks();
    mockSecureStore.clear();
    mockIsOnline = true;
    mockServerStatus = 'connected';
    onlineManager.setOnline(true);
    jest.mocked(useAppContext).mockReturnValue(appContext);
    jest.mocked(useAppFeedback).mockReturnValue({
        showFeedback,
        dismissFeedback: jest.fn(),
        showError: jest.fn(),
    });
    jest.mocked(useAuth).mockReturnValue(authContext);
    jest.mocked(usePlanAccess).mockReturnValue(planAccessContext);
    jest.mocked(fetchPlanCatalog).mockResolvedValue(catalog);
    jest.mocked(fetchPendingSubscriptionOrder).mockResolvedValue({ order: null, payments: [] });
    jest.mocked(fetchWalletOverview).mockResolvedValue(wallet);
    jest.mocked(getStoredAuthToken).mockResolvedValue('test-token');
    jest.mocked(fetchPaymentOrder).mockRejectedValue(new Error('Unexpected payment-order lookup'));
    jest.mocked(purchaseSubscription).mockRejectedValue(new Error('Unexpected purchase'));
});

afterEach(cleanup);

describe('PlanCatalogScreen', () => {
    it('shows which cached purchase data is stale and prevents requesting a live quote', async () => {
        const catalogSavedAt = Date.now() - 60_000;
        const walletSavedAt = Date.now() - 120_000;
        const view = await renderScreen({ catalog: catalogSavedAt, wallet: walletSavedAt });

        expect(getOfflinePageNotices().some((notice) => (
            notice.pathname === '/account/plan-catalog'
            && notice.message === 'اطلاعات ذخیره‌شدهٔ پلن ممکن است به‌روز نباشد.'
        ))).toBe(true);

        const quoteButton = view.getByRole('button', { name: 'محاسبه مبلغ نهایی' });
        expect(quoteButton.props.accessibilityState?.disabled).toBe(true);
        await fireEvent.press(quoteButton);
        expect(quoteSubscription).not.toHaveBeenCalled();
    });

    it('shows plan features as a timeline with a title and description', async () => {
        const view = await renderScreen();

        expect(view.getByText('حقوق پایه')).toBeTruthy();
        expect(view.getByText('محاسبه حقوق پایه و نمایش جزئیات آن')).toBeTruthy();
        expect(view.getByText('پایه سنوات استحقاقی')).toBeTruthy();
        expect(view.getAllByText('اقلام مزدی مستمر')).toHaveLength(1);
    }, 15000);

    it('surfaces catalog request failures instead of leaving the page loading', async () => {
        jest.mocked(fetchPlanCatalog).mockRejectedValue(new TypeError('Catalog network unavailable'));
        const queryClient = new QueryClient({
            defaultOptions: { queries: { retry: false, gcTime: 0 } },
        });
        queryClient.setQueryData(['wallet-overview', user.id], wallet);
        queryClient.setQueryData(['pending-subscription-order', user.id], { order: null, payments: [] });

        const view = await render(
            <QueryClientProvider client={queryClient}>
                <PlanCatalogScreen />
            </QueryClientProvider>,
        );

        expect(await view.findByText('ارتباط با سرور برقرار نشد. دوباره تلاش کنید.')).toBeTruthy();
        expect(fetchPlanCatalog).toHaveBeenCalledTimes(1);
        const silverTab = view.getByRole('tab', { name: 'نقره‌ای' });
        expect(silverTab.props.accessibilityState).toEqual({ selected: false, disabled: false });

        await fireEvent.press(silverTab);

        await waitFor(() => {
            expect(view.getByRole('tab', { name: 'نقره‌ای' }).props.accessibilityState).toEqual({
                selected: true,
                disabled: false,
            });
        });
        expect(view.getByText('ارتباط با سرور برقرار نشد. دوباره تلاش کنید.')).toBeTruthy();
    });

    it('uses the offline notice instead of repeating a network error card when the server is unavailable', async () => {
        mockIsOnline = false;
        mockServerStatus = 'server-unavailable';
        onlineManager.setOnline(false);
        jest.mocked(fetchPlanCatalog).mockRejectedValue(new TypeError('Catalog network unavailable'));
        const queryClient = new QueryClient({
            defaultOptions: { queries: { retry: false, gcTime: 0 } },
        });
        queryClient.setQueryData(['wallet-overview', user.id], wallet);
        queryClient.setQueryData(['pending-subscription-order', user.id], { order: null, payments: [] });

        const view = await render(
            <QueryClientProvider client={queryClient}>
                <PlanCatalogScreen />
            </QueryClientProvider>,
        );

        expect(getOfflinePageNotices().some((notice) => (
            notice.pathname === '/account/plan-catalog'
            && notice.message === 'سرور در دسترس نیست؛ قیمت و خرید تأیید نمی‌شود.'
        ))).toBe(true);
        expect(view.queryByText('ارتباط با سرور برقرار نشد. دوباره تلاش کنید.')).toBeNull();
    });

    it('keeps purchase actions unavailable after reconnect until every purchase query returns live data', async () => {
        const view = await renderScreen();
        await waitFor(() => {
            expect(view.getByRole('button', { name: 'محاسبه مبلغ نهایی' })).toBeTruthy();
        });
        jest.mocked(quoteSubscription).mockResolvedValue(makeQuote());
        await fireEvent.press(view.getByRole('button', { name: 'محاسبه مبلغ نهایی' }));
        await waitFor(() => {
            expect(view.getByRole('button', { name: 'تأیید و خرید' })).toBeTruthy();
        });
        const catalogResponse = deferred<PlanCatalog>();
        const walletResponse = deferred<WalletOverview>();
        const pendingOrderResponse = deferred<{ order: null; payments: [] }>();

        await act(async () => {
            mockIsOnline = false;
            mockServerStatus = 'server-unavailable';
            onlineManager.setOnline(false);
        });
        expect(getOfflinePageNotices().some((notice) => notice.pathname === '/account/plan-catalog')).toBe(true);
        const purchaseButton = view.getByRole('button', { name: 'در حال بررسی سفارش قبلی…' });
        expect(purchaseButton.props.accessibilityState?.disabled).toBe(true);
        await fireEvent.press(purchaseButton);
        expect(purchaseSubscription).not.toHaveBeenCalled();

        await act(async () => {
            jest.mocked(fetchPlanCatalog).mockReturnValueOnce(catalogResponse.promise);
            jest.mocked(fetchWalletOverview).mockReturnValueOnce(walletResponse.promise);
            jest.mocked(fetchPendingSubscriptionOrder).mockReturnValueOnce(pendingOrderResponse.promise);
            mockIsOnline = true;
            mockServerStatus = 'connected';
            onlineManager.setOnline(true);
        });
        await waitFor(() => {
            expect(fetchPlanCatalog).toHaveBeenCalled();
            expect(fetchWalletOverview).toHaveBeenCalled();
            expect(fetchPendingSubscriptionOrder).toHaveBeenCalled();
        });
        expect(getOfflinePageNotices().some((notice) => notice.pathname === '/account/plan-catalog')).toBe(true);

        await act(async () => {
            catalogResponse.resolve(catalog);
            walletResponse.resolve(wallet);
            pendingOrderResponse.resolve({ order: null, payments: [] });
            await Promise.all([
                catalogResponse.promise,
                walletResponse.promise,
                pendingOrderResponse.promise,
            ]);
        });

        await waitFor(() => {
            expect(getOfflinePageNotices().some((notice) => notice.pathname === '/account/plan-catalog')).toBe(false);
        });
        expect(view.getByRole('button', { name: 'تأیید و خرید' }).props.accessibilityState?.disabled).toBe(false);
    });

    it('keeps purchase actions unavailable when a reconnect refresh fails', async () => {
        const view = await renderScreen();

        await act(async () => {
            mockIsOnline = false;
            mockServerStatus = 'server-unavailable';
            onlineManager.setOnline(false);
        });
        jest.mocked(fetchPlanCatalog).mockRejectedValueOnce(new TypeError('Catalog network unavailable'));

        await act(async () => {
            mockIsOnline = true;
            mockServerStatus = 'connected';
            onlineManager.setOnline(true);
        });

        await waitFor(() => {
            expect(fetchPlanCatalog).toHaveBeenCalled();
            expect(getOfflinePageNotices().some((notice) => notice.pathname === '/account/plan-catalog')).toBe(true);
        });
        expect(view.getByRole('button', { name: 'محاسبه مبلغ نهایی' }).props.accessibilityState?.disabled).toBe(true);
    });

    it('retries an uncertain purchase with the same idempotency key and exact request', async () => {
        jest.mocked(quoteSubscription).mockResolvedValue(makeQuote());
        jest.mocked(purchaseSubscription)
            .mockRejectedValueOnce(new TypeError('Purchase response was lost'))
            .mockResolvedValueOnce({
                order: {
                    id: 21,
                    reference: 'test-order',
                    kind: 'subscription',
                    subscription_change_type: 'purchase',
                    plan_key: 'bronze_1_month',
                    plan_name: null,
                    status: 'pending',
                    failure_code: null,
                    gross_amount: 120000,
                    discount_amount: 20000,
                    plan_credit_amount: 0,
                    wallet_amount: 0,
                    gateway_amount: 100000,
                    refunded_amount: 0,
                    currency: 'IRR',
                    expires_at: '2030-01-31T00:00:00.000Z',
                    completed_at: null,
                },
                payment: null,
            } as Awaited<ReturnType<typeof purchaseSubscription>>);
        const view = await renderScreen();

        await fireEvent.press(view.getByRole('button', { name: 'محاسبه مبلغ نهایی' }));
        await waitFor(() => expect(view.getByRole('button', { name: 'تأیید و خرید' })).toBeTruthy());
        await fireEvent.press(view.getByRole('button', { name: 'تأیید و خرید' }));
        const retry = await view.findByRole('button', { name: 'تلاش دوباره با همان درخواست' });

        expect(purchaseSubscription).toHaveBeenCalledTimes(1);
        expect(mockSecureStore.size).toBe(1);
        await fireEvent.press(retry);

        await waitFor(() => expect(purchaseSubscription).toHaveBeenCalledTimes(2));
        const purchaseMock = jest.mocked(purchaseSubscription);
        expect(purchaseMock.mock.calls[0]).toEqual(purchaseMock.mock.calls[1]);
        expect(purchaseMock.mock.calls[0]?.[2]).toBe('11111111-1111-4111-8111-111111111111');
        expect(mockSecureStore.size).toBe(0);
    });

    it.each(['succeeded', 'failed'] as const)(
        'persists a cleared pending-order snapshot when purchase returns %s immediately',
        async (status) => {
            jest.mocked(quoteSubscription).mockResolvedValue(makeQuote());
            jest.mocked(purchaseSubscription).mockResolvedValue({
                order: {
                    id: 23,
                    reference: 'terminal-purchase',
                    kind: 'subscription',
                    subscription_change_type: 'purchase',
                    plan_key: 'bronze_1_month',
                    plan_name: null,
                    status,
                    failure_code: status === 'failed' ? 'payment_failed' : null,
                    gross_amount: 120000,
                    discount_amount: 20000,
                    plan_credit_amount: 0,
                    wallet_amount: 0,
                    gateway_amount: 100000,
                    refunded_amount: 0,
                    currency: 'IRR',
                    expires_at: '2030-01-31T00:00:00.000Z',
                    completed_at: null,
                },
                payment: null,
            });
            const view = await renderScreen();

            await fireEvent.press(view.getByRole('button', { name: 'محاسبه مبلغ نهایی' }));
            await waitFor(() => expect(view.getByRole('button', { name: 'تأیید و خرید' })).toBeTruthy());
            await fireEvent.press(view.getByRole('button', { name: 'تأیید و خرید' }));

            await waitFor(() => {
                expect(saveOfflineCacheValue).toHaveBeenCalledWith(
                    user.id,
                    ACCOUNT_OFFLINE_CACHE.pendingSubscriptionOrder,
                    { order: null, payments: [] },
                );
            });
            view.unmount();
        },
    );

    it('deduplicates manual status checks while the automatic initial check is in flight', async () => {
        const order: Awaited<ReturnType<typeof fetchPendingSubscriptionOrder>>['order'] = {
            id: 21,
            reference: 'test-order',
            kind: 'subscription',
            subscription_change_type: 'purchase',
            plan_key: 'bronze_1_month',
            plan_name: null,
            status: 'pending',
            failure_code: null,
            gross_amount: 120000,
            discount_amount: 20000,
            plan_credit_amount: 0,
            wallet_amount: 0,
            gateway_amount: 100000,
            refunded_amount: 0,
            currency: 'IRR',
            expires_at: '2030-01-31T00:00:00.000Z',
            completed_at: null,
        };
        const orderRequest = deferred<Awaited<ReturnType<typeof fetchPaymentOrder>>>();
        jest.mocked(fetchPaymentOrder).mockReturnValue(orderRequest.promise);
        const queryClient = new QueryClient({
            defaultOptions: { queries: { retry: false, gcTime: 0 } },
        });
        queryClient.setQueryData(['plan-catalog'], catalog);
        queryClient.setQueryData(['wallet-overview', user.id], wallet);
        queryClient.setQueryData(['pending-subscription-order', user.id], {
            order,
            payments: [],
        });

        const view = await render(
            <QueryClientProvider client={queryClient}>
                <PlanCatalogScreen />
            </QueryClientProvider>,
        );
        await waitFor(() => expect(fetchPaymentOrder).toHaveBeenCalledTimes(1));
        await fireEvent.press(view.getByRole('button', { name: 'تازه‌سازی وضعیت سفارش' }));
        expect(fetchPaymentOrder).toHaveBeenCalledTimes(1);

        await act(async () => {
            orderRequest.resolve({
                order,
                payments: [],
                refund_transactions: [],
                subscription: null,
            });
            await orderRequest.promise;
        });
    });

    it.each(['succeeded', 'failed'] as const)(
        'persists a cleared pending-order snapshot after a %s terminal outcome',
        async (status) => {
            const order: Awaited<ReturnType<typeof fetchPendingSubscriptionOrder>>['order'] = {
                id: 22,
                reference: 'terminal-order',
                kind: 'subscription',
                subscription_change_type: 'purchase',
                plan_key: 'bronze_1_month',
                plan_name: null,
                status,
                failure_code: status === 'failed' ? 'payment_failed' : null,
                gross_amount: 120000,
                discount_amount: 20000,
                plan_credit_amount: 0,
                wallet_amount: 0,
                gateway_amount: 100000,
                refunded_amount: 0,
                currency: 'IRR',
                expires_at: '2030-01-31T00:00:00.000Z',
                completed_at: null,
            };
            const queryClient = new QueryClient({
                defaultOptions: { queries: { retry: false, gcTime: 10000 } },
            });
            const invalidateQueries = jest.spyOn(queryClient, 'invalidateQueries');
            queryClient.setQueryData(['plan-catalog'], catalog);
            queryClient.setQueryData(['wallet-overview', user.id], wallet);
            queryClient.setQueryData(['current-plan', user.id], { plan: { key: 'free' } });
            queryClient.setQueryData(['pending-subscription-order', user.id], { order, payments: [] });
            jest.mocked(fetchPaymentOrder).mockResolvedValue({
                order,
                payments: [],
                refund_transactions: [],
                subscription: null,
            });

            const view = await render(
                <QueryClientProvider client={queryClient}>
                    <PlanCatalogScreen />
                </QueryClientProvider>,
            );

            await waitFor(() => {
                expect(saveOfflineCacheValue).toHaveBeenCalledWith(
                    user.id,
                    ACCOUNT_OFFLINE_CACHE.pendingSubscriptionOrder,
                    { order: null, payments: [] },
                );
                expect(queryClient.getQueryData(['pending-subscription-order', user.id])).toMatchObject({
                    order: null,
                    payments: [],
                });
            });
            if (status === 'succeeded') {
                await waitFor(() => {
                    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['current-plan', user.id] });
                });
            }
            await waitFor(() => {
                expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['wallet-overview', user.id] });
            });
            view.unmount();
            queryClient.clear();
        },
    );

    it('enables wallet payment only when covered and combined payment for any positive balance', async () => {
        jest.mocked(fetchWalletOverview).mockResolvedValue({ ...wallet, balance: 30000 });
        jest.mocked(quoteSubscription).mockImplementation(async (_token, input) => {
            const method = input.payment_method ?? 'gateway';
            const walletAmount = method === 'gateway'
                ? 0
                : method === 'wallet'
                    ? 100000
                    : 30000;
            return makeQuote({
                payment_method: method,
                wallet_amount: walletAmount,
                gateway_amount: 100000 - walletAmount,
            });
        });
        const view = await renderScreen();

        await fireEvent.press(view.getByRole('button', { name: 'اعمال کد' }));
        const walletOption = (await view.findAllByRole('radio', { name: /کیف پول/ }))[0];
        const combinedOption = view.getAllByRole('radio', { name: /ترکیبی/ })[0];
        const gatewayOption = view.getAllByRole('radio', { name: /درگاه پرداخت/ })[0];
        if (!walletOption || !combinedOption || !gatewayOption) {
            throw new Error('Payment-method options were not rendered.');
        }

        expect(walletOption.props.accessibilityState.disabled).toBe(true);
        expect(combinedOption.props.accessibilityState.disabled).toBe(false);
        expect(gatewayOption.props.accessibilityState.disabled).toBe(false);

        await fireEvent.press(combinedOption);

        await waitFor(() => {
            expect(quoteSubscription).toHaveBeenLastCalledWith(
                'test-token',
                expect.objectContaining({ payment_method: 'combined' }),
            );
        });
    });

    it('keeps combined payment enabled when the wallet covers the full payable amount', async () => {
        jest.mocked(fetchWalletOverview).mockResolvedValue({ ...wallet, balance: 150000 });
        jest.mocked(quoteSubscription).mockResolvedValue(makeQuote());
        const view = await renderScreen();

        await fireEvent.press(view.getByRole('button', { name: 'اعمال کد' }));
        const walletOption = (await view.findAllByRole('radio', { name: /کیف پول/ }))[0];
        const combinedOption = view.getAllByRole('radio', { name: /ترکیبی/ })[0];
        const gatewayOption = view.getAllByRole('radio', { name: /درگاه پرداخت/ })[0];
        if (!walletOption || !combinedOption || !gatewayOption) {
            throw new Error('Payment-method options were not rendered.');
        }

        expect(walletOption.props.accessibilityState.disabled).toBe(false);
        expect(combinedOption.props.accessibilityState.disabled).toBe(false);
        expect(gatewayOption.props.accessibilityState.disabled).toBe(false);
    });

    it('keeps tier tabs navigable while the initial catalog is loading', async () => {
        const catalogRequest = deferred<PlanCatalog>();
        jest.mocked(fetchPlanCatalog).mockReturnValue(catalogRequest.promise);
        const queryClient = new QueryClient({
            defaultOptions: { queries: { retry: false, gcTime: 0 } },
        });
        queryClient.setQueryData(['wallet-overview', user.id], wallet);
        queryClient.setQueryData(['pending-subscription-order', user.id], { order: null, payments: [] });

        const view = await render(
            <QueryClientProvider client={queryClient}>
                <PlanCatalogScreen />
            </QueryClientProvider>,
        );

        expect(view.getByRole('tab', { name: 'طلایی' })).toBeTruthy();
        expect(view.getByRole('tab', { name: 'طلایی' }).props.accessibilityState.disabled).toBe(false);
        expect(view.getByText('در حال دریافت پلن‌ها…')).toBeTruthy();
        await fireEvent.press(view.getByRole('tab', { name: 'طلایی' }));
        expect(view.getByRole('tab', { name: 'طلایی' }).props.accessibilityState.selected).toBe(true);

        await act(async () => {
            catalogRequest.resolve(catalog);
            await catalogRequest.promise;
        });

        expect(await view.findByRole('tab', { name: 'برنزی' })).toBeTruthy();
        await waitFor(() => expect(view.queryByRole('tab', { name: 'طلایی' })).toBeNull());
    });

    it('normalizes a discount code, requests a quote, and displays the quoted discount', async () => {
        jest.mocked(quoteSubscription).mockResolvedValue(makeQuote());
        const view = await renderScreen();

        await fireEvent.changeText(view.getByLabelText('کد تخفیف'), '  save20 ');
        await fireEvent.press(view.getByRole('button', { name: 'اعمال کد' }));

        await waitFor(() => {
            expect(quoteSubscription).toHaveBeenCalledWith('test-token', {
                plan_key: 'bronze_1_month',
                discount_code: 'SAVE20',
                payment_method: 'gateway',
            });
        });
        expect(await view.findByText('کد تخفیف با موفقیت اعمال شد.')).toBeTruthy();
        expect(view.getAllByText('۱۰۰٬۰۰۰ تومان')).toHaveLength(2);
    });

    it('shows a quote error without presenting a stale successful quote', async () => {
        jest.mocked(quoteSubscription)
            .mockResolvedValueOnce(makeQuote())
            .mockRejectedValueOnce(new Error('کد تخفیف معتبر نیست.'));
        const view = await renderScreen();

        await fireEvent.changeText(view.getByLabelText('کد تخفیف'), 'SAVE20');
        await fireEvent.press(view.getByRole('button', { name: 'اعمال کد' }));
        expect(await view.findByText('کد تخفیف با موفقیت اعمال شد.')).toBeTruthy();

        await fireEvent.changeText(view.getByLabelText('کد تخفیف'), 'INVALID');
        await fireEvent.press(view.getByRole('button', { name: 'اعمال کد' }));

        expect(await view.findByText('کد تخفیف معتبر نیست.')).toBeTruthy();
        expect(view.queryByText('کد تخفیف با موفقیت اعمال شد.')).toBeNull();
        expect(purchaseSubscription).not.toHaveBeenCalled();
    });

    it('invalidates the quote when the discount code changes', async () => {
        jest.mocked(quoteSubscription).mockResolvedValue(makeQuote());
        const view = await renderScreen();

        await fireEvent.changeText(view.getByLabelText('کد تخفیف'), 'SAVE20');
        await fireEvent.press(view.getByRole('button', { name: 'اعمال کد' }));
        expect(await view.findByText('کد تخفیف با موفقیت اعمال شد.')).toBeTruthy();

        await fireEvent.changeText(view.getByLabelText('کد تخفیف'), 'SAVE30');

        expect(view.queryByText('کد تخفیف با موفقیت اعمال شد.')).toBeNull();
        expect(view.queryByText('۱۰۰٬۰۰۰ تومان')).toBeNull();

        await fireEvent.press(view.getByRole('button', { name: 'محاسبه مبلغ نهایی' }));

        await waitFor(() => {
            expect(quoteSubscription).toHaveBeenCalledTimes(2);
            expect(quoteSubscription).toHaveBeenLastCalledWith('test-token', {
                plan_key: 'bronze_1_month',
                discount_code: 'SAVE30',
                payment_method: 'gateway',
            });
        });
        expect(purchaseSubscription).not.toHaveBeenCalled();
    });

    it('ignores a quote response that arrives after a newer request', async () => {
        const olderQuote = deferred<SubscriptionQuote>();
        jest.mocked(quoteSubscription)
            .mockReturnValueOnce(olderQuote.promise)
            .mockResolvedValueOnce(makeQuote({ payable_amount: 90000, gateway_amount: 90000 }));
        const view = await renderScreen();

        await fireEvent.changeText(view.getByLabelText('کد تخفیف'), 'SAVE20');
        await fireEvent.press(view.getByRole('button', { name: 'اعمال کد' }));
        await waitFor(() => expect(quoteSubscription).toHaveBeenCalledTimes(1));

        await fireEvent.changeText(view.getByLabelText('کد تخفیف'), 'SAVE30');
        await fireEvent.press(view.getByRole('button', { name: 'اعمال کد' }));

        expect(await view.findByText('کد تخفیف با موفقیت اعمال شد.')).toBeTruthy();
        expect(view.getAllByText('۹۰٬۰۰۰ تومان')).toHaveLength(2);
        await act(async () => {
            olderQuote.resolve(makeQuote());
        });

        expect(view.getAllByText('۹۰٬۰۰۰ تومان')).toHaveLength(2);
        expect(view.queryByText('۱۰۰٬۰۰۰ تومان')).toBeNull();
    });

    it('invalidates the quote when the selected plan changes', async () => {
        jest.mocked(quoteSubscription).mockResolvedValue(makeQuote());
        const view = await renderScreen();

        await fireEvent.press(view.getByRole('tab', { name: 'برنزی' }));
        await fireEvent.changeText(view.getByLabelText('کد تخفیف'), 'SAVE20');
        await fireEvent.press(view.getByRole('button', { name: 'اعمال کد' }));
        expect(await view.findByText('کد تخفیف با موفقیت اعمال شد.')).toBeTruthy();

        await fireEvent.press(view.getByRole('tab', { name: 'نقره‌ای' }));

        expect(view.queryByText('کد تخفیف با موفقیت اعمال شد.')).toBeNull();
        expect(view.queryByText('۱۰۰٬۰۰۰ تومان')).toBeNull();
    });

    it('requires a second confirmation when the server returns a changed amount', async () => {
        const originalQuote = makeQuote();
        const updatedQuote = makeQuote({
            gross_amount: 140000,
            payable_amount: 120000,
            gateway_amount: 120000,
        });
        jest.mocked(purchaseSubscription).mockResolvedValueOnce({
            order: {
                id: 21,
                reference: 'test-order',
                kind: 'subscription',
                subscription_change_type: 'purchase',
                plan_key: 'bronze_1_month',
                plan_name: null,
                status: 'failed',
                failure_code: 'payment_failed',
                gross_amount: 140000,
                discount_amount: 20000,
                plan_credit_amount: 0,
                wallet_amount: 0,
                gateway_amount: 120000,
                refunded_amount: 0,
                currency: 'IRR',
                expires_at: '2030-01-31T00:00:00.000Z',
                completed_at: null,
            },
            payment: null,
        });
        jest.mocked(quoteSubscription)
            .mockResolvedValueOnce(originalQuote)
            .mockResolvedValueOnce(updatedQuote)
            .mockResolvedValueOnce(updatedQuote);
        const view = await renderScreen();

        await fireEvent.changeText(view.getByLabelText('کد تخفیف'), 'SAVE20');
        await fireEvent.press(view.getByRole('button', { name: 'اعمال کد' }));
        expect(await view.findByText('کد تخفیف با موفقیت اعمال شد.')).toBeTruthy();

        await fireEvent.press(view.getByRole('button', { name: 'تأیید و خرید' }));

        await waitFor(() => {
            expect(showFeedback).toHaveBeenCalledWith(expect.objectContaining({
                message: 'مبلغ یا شرایط پلن تغییر کرده است؛ جزئیات به‌روز را بررسی و دوباره تأیید کنید.',
            }));
        });
        expect(view.getByText('۱۴۰٬۰۰۰ تومان')).toBeTruthy();
        expect(purchaseSubscription).not.toHaveBeenCalled();
        expect(view.getByRole('button', { name: 'تأیید و خرید' })).toBeTruthy();

        await fireEvent.press(view.getByRole('button', { name: 'تأیید و خرید' }));

        await waitFor(() => expect(purchaseSubscription).toHaveBeenCalledTimes(1));
        expect(purchaseSubscription).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({ app_return_url: 'pahnavarkar://payment-return' }),
            expect.any(String),
        );
    });
});
