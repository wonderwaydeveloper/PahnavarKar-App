import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ComponentProps } from 'react';

import WalletScreen from '@/features/wallet';
import { useAppFeedback } from '@/hooks/use-app-feedback';
import { useAuth } from '@/hooks/use-auth';
import {
    createWithdrawalRequest,
    fetchPendingWalletTopUp,
    fetchWalletOverview,
    fetchWalletPayment,
    getStoredAuthToken,
    startWalletTopUp,
    type WalletOverview,
} from '@/services/auth-api';
import { ACCOUNT_OFFLINE_CACHE, saveOfflineCacheValue } from '@/services/account-offline-cache';
import { getOfflinePageNotices } from '@/services/offline-page-status';

jest.mock('expo-router', () => ({
    usePathname: () => '/account/wallet',
    useFocusEffect: jest.fn(),
    useRouter: () => ({ push: jest.fn() }),
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
jest.mock('expo-crypto', () => ({
    randomUUID: () => 'test-idempotency-key',
    CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
    digestStringAsync: jest.fn(async (_algorithm: string, value: string) => {
        let hash = 0;
        for (const character of value) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
        return hash.toString(16).padStart(8, '0').repeat(8);
    }),
}));
jest.mock('expo-linking', () => ({ createURL: (path: string) => `pahnavarkar://${path}` }));
jest.mock('expo-web-browser', () => ({ openAuthSessionAsync: jest.fn() }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));
jest.mock('@/services/account-offline-cache', () => ({
    ACCOUNT_OFFLINE_CACHE: {
        wallet: { namespace: 'account-wallet-v1', key: 'overview', maxAgeMs: 2592000000 },
        pendingTopUp: { namespace: 'account-wallet-v1', key: 'pending-top-up', maxAgeMs: 2592000000 },
    },
    fetchWithOfflineFallback: jest.fn(async (
        _userId: number,
        _cache: unknown,
        fetcher: () => Promise<unknown>,
        _isValid: (value: unknown) => boolean,
        options: { isOnline?: boolean } = {},
    ) => {
        const value = await fetcher();
        return options.isOnline === false
            ? { value, offlineCacheSavedAt: Date.now() }
            : { value };
    }),
    saveOfflineCacheValue: jest.fn(async () => {}),
    withOfflineCacheMetadata: jest.fn((result: { value: object; offlineCacheSavedAt?: number }) => (
        result.offlineCacheSavedAt === undefined
            ? result.value
            : { ...result.value, offlineCacheSavedAt: result.offlineCacheSavedAt }
    )),
}));
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: () => null }));
jest.mock('react-native-safe-area-context', () => ({
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('react-native-paper', () => {
    const React = jest.requireActual<typeof import('react')>('react');
    const { View } = jest.requireActual<typeof import('react-native')>('react-native');

    return {
        Snackbar: ({ children }: { children: React.ReactNode }) => React.createElement(View, null, children),
    };
});
jest.mock('@/components/app-text', () => {
    const React = jest.requireActual<typeof import('react')>('react');
    const { TextInput } = jest.requireActual<typeof import('react-native')>('react-native');

    return { AppTextInput: (props: ComponentProps<typeof TextInput>) => React.createElement(TextInput, props) };
});
jest.mock('@/components/bank-amount-input', () => {
    const React = jest.requireActual<typeof import('react')>('react');
    const { TextInput } = jest.requireActual<typeof import('react-native')>('react-native');

    return { BankAmountInput: (props: ComponentProps<typeof TextInput>) => React.createElement(TextInput, props) };
});
jest.mock('@/components/error-notice-card', () => {
    const React = jest.requireActual<typeof import('react')>('react');
    const { Pressable, Text, View } = jest.requireActual<typeof import('react-native')>('react-native');

    return {
        ErrorNoticeCard: ({ message, onRetry, busy }: {
            message: string;
            onRetry: () => void;
            busy?: boolean;
        }) => React.createElement(
            View,
            null,
            React.createElement(Text, { accessibilityRole: 'alert' }, message),
            React.createElement(Pressable, { accessibilityRole: 'button', disabled: busy, onPress: onRetry }, React.createElement(Text, null, 'تلاش دوباره')),
        ),
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

    return { ThemedView: (props: ComponentProps<typeof View>) => React.createElement(View, props) };
});
jest.mock('@/hooks/use-auth', () => ({ useAuth: jest.fn() }));
jest.mock('@/hooks/use-app-feedback', () => ({ useAppFeedback: jest.fn() }));
jest.mock('@/hooks/use-theme', () => ({
    useTheme: () => ({
        text: '#102A39',
        textSecondary: '#4B6275',
        textMuted: '#536B79',
        surface: '#FFFFFF',
        surfaceVariant: '#D9EFF2',
        surfaceElevated: '#F5FBFC',
        border: '#BBD9DE',
        primary: '#26C6DA',
        primaryText: '#006B78',
        onPrimary: '#00363F',
        primaryContainer: '#D2F1F4',
        secondary: '#2F6D8A',
        onSecondary: '#FFFFFF',
        success: '#18794E',
        warning: '#8A5700',
        warningFill: '#8A5700',
        onWarning: '#FFFFFF',
        error: '#B42318',
    }),
}));
jest.mock('@/services/auth-api', () => ({
    createWithdrawalRequest: jest.fn(),
    fetchPendingWalletTopUp: jest.fn(),
    fetchWalletOverview: jest.fn(),
    fetchWalletPayment: jest.fn(),
    getStoredAuthToken: jest.fn(),
    isTemporaryApiFailure: (error: unknown) => error instanceof TypeError,
    reconcileWalletTopUp: jest.fn(),
    revealWalletBankAccount: jest.fn(),
    startWalletTopUp: jest.fn(),
    updateWalletBankAccount: jest.fn(),
}));
jest.mock('@/services/user-facing-error', () => ({
    getUserFacingErrorMessage: (error: unknown) => error instanceof Error ? error.message : 'Wallet failed',
}));
jest.mock('@/constants/theme', () => ({
    Radius: { sm: 8, md: 12, lg: 16 },
    Spacing: { half: 2, one: 4, two: 8, three: 16, four: 24, five: 32 },
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

const wallet: WalletOverview = {
    balance: 50000,
    currency: 'IRR',
    unit: 'toman',
    bank_account_iban_masked: null,
    top_up_min_amount: 10000,
    top_up_max_amount: 100000000,
    withdrawals: { enabled: false, max_per_request: 0, max_per_day: 0 },
};

const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
});

async function renderWallet() {
    return render(
        <QueryClientProvider client={queryClient}>
            <WalletScreen />
        </QueryClientProvider>,
    );
}

beforeEach(async () => {
    jest.clearAllMocks();
    queryClient.clear();
    mockSecureStore.clear();
    await act(async () => {
        onlineManager.setOnline(true);
    });
    jest.mocked(useAuth).mockReturnValue({ user, isLoading: false } as ReturnType<typeof useAuth>);
    jest.mocked(useAppFeedback).mockReturnValue({
        showFeedback: jest.fn(),
        dismissFeedback: jest.fn(),
        showError: jest.fn(),
    });
    jest.mocked(getStoredAuthToken).mockResolvedValue('test-token');
    jest.mocked(fetchWalletOverview).mockResolvedValue(wallet);
    jest.mocked(fetchPendingWalletTopUp).mockResolvedValue({ payment: null });
});

afterEach(async () => {
    cleanup();
    await act(async () => {
        onlineManager.setOnline(true);
    });
    queryClient.clear();
});

describe('wallet screen', () => {
    it('surfaces offline failures instead of leaving the initial request paused', async () => {
        await act(async () => {
            onlineManager.setOnline(false);
        });
        jest.mocked(fetchWalletOverview).mockRejectedValue(new TypeError('Network unavailable'));
        jest.mocked(fetchPendingWalletTopUp).mockRejectedValue(new TypeError('Network unavailable'));

        const view = await renderWallet();

        await waitFor(() => {
            expect(view.getByText('Network unavailable')).toBeTruthy();
        });
        await waitFor(() => {
            expect(getOfflinePageNotices().some((notice) => (
                notice.pathname === '/account/wallet'
                && notice.message === 'سرور در دسترس نیست؛ عملیات مالی غیرفعال است.'
            ))).toBe(true);
        });
        expect(fetchWalletOverview).toHaveBeenCalledTimes(1);
        expect(fetchPendingWalletTopUp).toHaveBeenCalledTimes(1);

        fireEvent.press(view.getByRole('button', { name: 'تلاش دوباره' }));
        await waitFor(() => {
            expect(fetchWalletOverview).toHaveBeenCalledTimes(2);
            expect(fetchPendingWalletTopUp).toHaveBeenCalledTimes(2);
        });
    });

    it('labels cached wallet data and disables financial actions', async () => {
        const savedAt = Date.now() - 60_000;
        queryClient.setQueryData(['wallet-overview', user.id], { ...wallet, offlineCacheSavedAt: savedAt });
        queryClient.setQueryData(['wallet-pending-top-up', user.id], {
            payment: null,
            offlineCacheSavedAt: savedAt - 30_000,
        });

        const view = await renderWallet();

        await waitFor(() => {
            expect(getOfflinePageNotices().some((notice) => (
                notice.pathname === '/account/wallet'
                && notice.message === 'موجودی ذخیره‌شدهٔ کیف پول ممکن است به‌روز نباشد.'
            ))).toBe(true);
        });
        const topUpButton = view.getByRole('button', { name: 'ادامه به درگاه پرداخت' });
        expect(topUpButton.props.accessibilityState?.disabled).toBe(true);
        fireEvent.press(topUpButton);
        expect(startWalletTopUp).not.toHaveBeenCalled();
    });

    it('replaces offline wallet data with live data after the server reconnects', async () => {
        await act(async () => {
            onlineManager.setOnline(false);
        });

        const view = await renderWallet();

        await waitFor(() => {
            expect(getOfflinePageNotices().some((notice) => (
                notice.pathname === '/account/wallet'
                && notice.hasSavedData
            ))).toBe(true);
            expect(view.getByRole('button', { name: 'ادامه به درگاه پرداخت' })
                .props.accessibilityState?.disabled).toBe(true);
        });

        let resolveWallet: ((value: WalletOverview) => void) | undefined;
        let resolvePendingTopUp: ((value: { payment: null }) => void) | undefined;
        jest.mocked(fetchWalletOverview).mockImplementationOnce(() => new Promise((resolve) => {
            resolveWallet = resolve;
        }));
        jest.mocked(fetchPendingWalletTopUp).mockImplementationOnce(() => new Promise((resolve) => {
            resolvePendingTopUp = resolve;
        }));

        await act(async () => {
            onlineManager.setOnline(true);
        });

        await waitFor(() => {
            expect(fetchWalletOverview).toHaveBeenCalledTimes(2);
            expect(fetchPendingWalletTopUp).toHaveBeenCalledTimes(2);
        });
        expect(view.getByRole('button', { name: 'ادامه به درگاه پرداخت' })
            .props.accessibilityState?.disabled).toBe(true);
        expect(getOfflinePageNotices().some((notice) => (
            notice.pathname === '/account/wallet'
        ))).toBe(true);

        await act(async () => {
            resolveWallet?.(wallet);
            resolvePendingTopUp?.({ payment: null });
        });

        await waitFor(() => {
            expect(getOfflinePageNotices().some((notice) => notice.pathname === '/account/wallet')).toBe(false);
            expect(view.getByRole('button', { name: 'ادامه به درگاه پرداخت' })
                .props.accessibilityState?.disabled).toBe(false);
        });
    });

    it('keeps financial actions disabled when reconnect refresh fails', async () => {
        await act(async () => {
            onlineManager.setOnline(false);
        });

        const view = await renderWallet();
        await waitFor(() => {
            expect(getOfflinePageNotices().some((notice) => (
                notice.pathname === '/account/wallet'
                && notice.hasSavedData
            ))).toBe(true);
        });

        jest.mocked(fetchWalletOverview).mockRejectedValueOnce(new TypeError('Network unavailable'));
        await act(async () => {
            onlineManager.setOnline(true);
        });

        await waitFor(() => {
            expect(fetchWalletOverview).toHaveBeenCalledTimes(2);
            expect(view.getByRole('button', { name: 'ادامه به درگاه پرداخت' })
                .props.accessibilityState?.disabled).toBe(true);
            expect(getOfflinePageNotices().some((notice) => (
                notice.pathname === '/account/wallet'
                && notice.hasSavedData
            ))).toBe(true);
        });
    });

    it('shows pending top-up failures separately while keeping wallet details available', async () => {
        jest.mocked(fetchPendingWalletTopUp)
            .mockRejectedValueOnce(new Error('Pending top-up unavailable'))
            .mockResolvedValue({ payment: null });

        const view = await renderWallet();

        await waitFor(() => {
            expect(view.getByText(/اطلاعات کیف پول نمایش داده می‌شود/)).toBeTruthy();
            expect(view.getByText('۵۰٬۰۰۰ تومان')).toBeTruthy();
        });
        expect(view.getByLabelText('مبلغ شارژ به تومان').props.editable).toBe(false);
        const retry = view.getByRole('button', { name: 'تلاش دوباره' });
        expect(retry).toBeTruthy();
        fireEvent.press(retry);
        await waitFor(() => {
            expect(fetchPendingWalletTopUp).toHaveBeenCalledTimes(2);
            expect(view.getByLabelText('مبلغ شارژ به تومان').props.editable).toBe(true);
        });
    });

    it.each(['succeeded', 'failed'] as const)(
        'persists a cleared pending top-up snapshot after a %s terminal outcome',
        async (status) => {
            jest.mocked(startWalletTopUp).mockResolvedValue({
                payment: {
                    id: 17,
                    status: 'pending',
                    amount: 10000,
                    currency: 'IRR',
                    redirect_url: null,
                    expires_at: null,
                    can_cancel_without_gateway: false,
                },
            });
            jest.mocked(fetchWalletPayment).mockResolvedValue({
                payment: {
                    id: 17,
                    status,
                    amount: 10000,
                    currency: 'IRR',
                    redirect_url: null,
                    expires_at: null,
                    can_cancel_without_gateway: false,
                },
            });

            const view = await renderWallet();
            await waitFor(() => expect(view.getByText('۵۰٬۰۰۰ تومان')).toBeTruthy());
            await waitFor(() => expect(view.getByLabelText('مبلغ شارژ به تومان').props.editable).toBe(true));
            await fireEvent.changeText(view.getByLabelText('مبلغ شارژ به تومان'), '10000');
            await fireEvent.press(view.getByRole('button', { name: 'ادامه به درگاه پرداخت' }));
            await waitFor(() => expect(startWalletTopUp).toHaveBeenCalledTimes(1));

            await waitFor(() => {
                expect(fetchWalletPayment).toHaveBeenCalledWith('test-token', 17);
                expect(saveOfflineCacheValue).toHaveBeenCalledWith(
                    user.id,
                    ACCOUNT_OFFLINE_CACHE.pendingTopUp,
                    null,
                );
                expect(queryClient.getQueryData(['wallet-pending-top-up', user.id])).toMatchObject({ payment: null });
            });
            if (status === 'succeeded') {
                await waitFor(() => expect(fetchWalletOverview).toHaveBeenCalledTimes(2));
            }
            view.unmount();
        },
    );

    it('retries an uncertain withdrawal with the same idempotency key and payload', async () => {
        jest.mocked(fetchWalletOverview).mockResolvedValue({
            ...wallet,
            withdrawals: { enabled: true, max_per_request: 500000, max_per_day: 1000000 },
        });
        const withdrawalRequestMock = jest.mocked(createWithdrawalRequest);
        withdrawalRequestMock
            .mockRejectedValueOnce(new TypeError('Network response was lost'))
            .mockResolvedValue({} as Awaited<ReturnType<typeof createWithdrawalRequest>>);

        const view = await renderWallet();
        await waitFor(() => expect(view.getByLabelText('مبلغ شارژ به تومان')).toBeTruthy());
        fireEvent.press(view.getByRole('tab', { name: 'برداشت' }));
        await waitFor(() => expect(view.getByRole('radio', { name: 'شماره کارت' })).toBeTruthy());
        fireEvent.press(view.getByRole('radio', { name: 'شماره کارت' }));
        await waitFor(() => expect(view.getByLabelText('شماره کارت مقصد برداشت')).toBeTruthy());
        fireEvent.changeText(view.getByLabelText('شماره کارت مقصد برداشت'), '4111111111111111');
        fireEvent.changeText(view.getByLabelText('مبلغ برداشت به تومان'), '۱۲۵۰۰');

        const submit = view.getByRole('button', { name: 'ثبت درخواست برداشت' });
        await waitFor(() => expect(submit.props.accessibilityState?.disabled).toBe(false));
        fireEvent.press(submit);
        await waitFor(() => expect(withdrawalRequestMock).toHaveBeenCalledTimes(1));
        await waitFor(() => expect(mockSecureStore.size).toBe(1));
        const storedAttempt = [...mockSecureStore.values()][0];
        expect(storedAttempt).not.toContain('4111111111111111');

        await waitFor(() => expect(submit.props.accessibilityState?.disabled).toBe(false));
        fireEvent.press(submit);
        await waitFor(() => expect(withdrawalRequestMock).toHaveBeenCalledTimes(2));
        expect(withdrawalRequestMock.mock.calls[0]).toEqual(withdrawalRequestMock.mock.calls[1]);
        expect(withdrawalRequestMock.mock.calls[0]?.[2]).toBe('test-idempotency-key');
        expect(mockSecureStore.size).toBe(0);
    });
});
