import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ComponentProps, ReactNode } from 'react';

import FinancialHistoryScreen from '@/app/(tabs)/account/financial-history';
import { useAppFeedback } from '@/hooks/use-app-feedback';
import { useAuth } from '@/hooks/use-auth';
import {
    fetchPaymentOrderHistory,
    fetchWalletTransactionHistory,
    fetchWithdrawalHistory,
    getStoredAuthToken,
} from '@/services/auth-api';

jest.mock('expo-router', () => ({ useFocusEffect: jest.fn() }));
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
            React.createElement(
                View,
                { testID: `test-scene-${navigationState.routes[navigationState.index]?.key}` },
                renderScene({ route: navigationState.routes[navigationState.index] }),
            ),
        ),
    };
});
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: () => null }));
jest.mock('react-native-reanimated', () => {
    const React = jest.requireActual<typeof import('react')>('react');
    const { View } = jest.requireActual<typeof import('react-native')>('react-native');
    const AnimatedView = (props: ComponentProps<typeof View>) => React.createElement(View, props);

    return {
        __esModule: true,
        default: { View: AnimatedView },
        Easing: { out: () => ({ cubic: jest.fn(), quad: jest.fn() }), in: () => ({ quad: jest.fn() }) },
        FadeIn: { duration: () => ({ easing: jest.fn(() => ({ reduceMotion: jest.fn() })) }) },
        FadeOut: { duration: () => ({ easing: jest.fn(() => ({ reduceMotion: jest.fn() })) }) },
        LinearTransition: { duration: () => ({ easing: jest.fn(() => ({ reduceMotion: jest.fn() })) }) },
        ReduceMotion: { System: 'system' },
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
jest.mock('@/components/date-input-field', () => ({ DateInputField: () => null }));
jest.mock('@/components/persian-date-picker-modal', () => ({ PersianDatePickerModal: () => null }));
jest.mock('@/hooks/use-auth', () => ({ useAuth: jest.fn() }));
jest.mock('@/hooks/use-app-feedback', () => ({ useAppFeedback: jest.fn() }));
jest.mock('@/hooks/use-online-refetch', () => ({ useOnlineRefetch: jest.fn() }));
jest.mock('@/hooks/use-theme', () => ({
    useTheme: () => ({
        text: '#102A39',
        textSecondary: '#4B6275',
        textMuted: '#536B79',
        surface: '#FFFFFF',
        surfaceVariant: '#D9EFF2',
        border: '#BBD9DE',
        primary: '#26C6DA',
        primaryText: '#006B78',
        onPrimary: '#00363F',
        primaryContainer: '#D2F1F4',
        success: '#18794E',
        warning: '#8A5700',
        warningFill: '#8A5700',
        onWarning: '#FFFFFF',
        error: '#B42318',
    }),
}));
jest.mock('@/services/offline-cache', () => ({
    getOfflineCacheEntry: jest.fn(async () => null),
    updateOfflineCacheEntry: jest.fn(async () => Date.now()),
}));
jest.mock('@/services/auth-api', () => ({
    fetchPaymentOrderHistory: jest.fn(),
    fetchWalletTransactionHistory: jest.fn(),
    fetchWithdrawalHistory: jest.fn(),
    getStoredAuthToken: jest.fn(),
    isTemporaryApiFailure: jest.fn(() => false),
}));
jest.mock('@/services/user-facing-error', () => ({
    getUserFacingErrorMessage: (error: unknown) => error instanceof Error ? error.message : 'History failed',
}));
jest.mock('@/constants/theme', () => ({
    Radius: { sm: 8, md: 12, lg: 16 },
    Spacing: { half: 2, one: 4, two: 8, three: 16, four: 24, six: 64 },
}));

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

const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
});

beforeEach(() => {
    jest.clearAllMocks();
    queryClient.clear();
    jest.mocked(useAuth).mockReturnValue({ user, isLoading: false } as ReturnType<typeof useAuth>);
    jest.mocked(useAppFeedback).mockReturnValue({
        showFeedback: jest.fn(),
        dismissFeedback: jest.fn(),
        showError: jest.fn(),
    });
    jest.mocked(getStoredAuthToken).mockResolvedValue('test-token');
    jest.mocked(fetchWalletTransactionHistory).mockRejectedValue(new Error('transactions failed'));
    jest.mocked(fetchPaymentOrderHistory).mockRejectedValue(new Error('payments failed'));
    jest.mocked(fetchWithdrawalHistory).mockRejectedValue(new Error('withdrawals failed'));
});

afterEach(() => {
    queryClient.clear();
});

describe('financial history tabs', () => {
    it('shows the saved history notice with the latest cached page timestamp', async () => {
        const savedAt = Date.now() - 60_000;
        queryClient.setQueryData(
            ['financial-history', user.id, 'transactions', null, null],
            {
                pages: [{
                    data: [],
                    meta: { current_page: 1, last_page: 1, per_page: 20, total: 0 },
                    offlineCacheSavedAt: savedAt,
                }],
                pageParams: [1],
            },
        );

        const view = await render(
            <QueryClientProvider client={queryClient}>
                <FinancialHistoryScreen />
            </QueryClientProvider>,
        );

        expect(await view.findByText('نسخهٔ ذخیره‌شدهٔ تاریخچه نمایش داده می‌شود')).toBeTruthy();
        expect(view.getByText(new RegExp(
            `این زبانه · آخرین ذخیره‌سازی: ${new Date(savedAt).toLocaleString('fa-IR')}`,
        ))).toBeTruthy();
    });

    it('renders the corresponding error card in each tab', async () => {
        const view = await render(
            <QueryClientProvider client={queryClient}>
                <FinancialHistoryScreen />
            </QueryClientProvider>,
        );

        const tabs = [
            { label: 'تراکنش‌ها', scene: 'transactions', message: 'transactions failed' },
            { label: 'پرداخت‌ها', scene: 'payments', message: 'payments failed' },
            { label: 'برداشت‌ها', scene: 'withdrawals', message: 'withdrawals failed' },
        ];

        for (const tab of tabs) {
            fireEvent.press(view.getByRole('tab', { name: new RegExp(tab.label) }));
            await waitFor(() => {
                expect(view.getByTestId(`test-scene-${tab.scene}`)).toBeTruthy();
                expect(view.getByText(tab.message)).toBeTruthy();
            });
        }
    });
});
