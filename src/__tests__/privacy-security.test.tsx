import { act, render, waitFor } from '@testing-library/react-native';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { onlineManager } from '@tanstack/react-query';
import type { ComponentProps } from 'react';
import { Text, TextInput, View } from 'react-native';

import PrivacySecurityScreen from '@/app/(tabs)/account/privacy-security';
import { useAppFeedback } from '@/hooks/use-app-feedback';
import { useAuth } from '@/hooks/use-auth';
import type { AuthDevice } from '@/services/auth-api';
import {
    beginTwoFactorEnrollment,
    fetchTwoFactorStatus,
    getStoredAuthToken,
    sendOtp,
} from '@/services/auth-api';
import { getOfflinePageNotices } from '@/services/offline-page-status';

let mockIsFocused = true;
let mockIsOnline = true;
const mockReplace = jest.fn();
const mockGetDevices = jest.fn<() => Promise<AuthDevice[]>>();
const mockRevokeUserDevice = jest.fn();
const mockSignOut = jest.fn();
const mockSignOutOtherDevices = jest.fn();
const mockDeleteAccount = jest.fn();
const mockUpdateInactivityDeletion = jest.fn();

jest.mock('expo-router', () => {
    const React = jest.requireActual<typeof import('react')>('react');
    return {
        useFocusEffect: (callback: () => void | (() => void)) => React.useEffect(() => {
            if (!mockIsFocused) return undefined;
            return callback();
        }, [callback]),
        useIsFocused: () => mockIsFocused,
        usePathname: () => '/account/privacy-security',
        useRouter: () => ({ replace: mockReplace }),
    };
});
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: () => null }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => undefined) }));
jest.mock('react-native-paper', () => ({ ActivityIndicator: () => null }));
jest.mock('@/components/app-snackbar', () => ({ AppSnackbar: () => null }));
jest.mock('@/components/confirmation-modal', () => ({ ConfirmationModal: () => null }));
jest.mock('@/components/app-text', () => {
    const React = jest.requireActual<typeof import('react')>('react');
    const { TextInput: MockTextInput } = jest.requireActual<typeof import('react-native')>('react-native');
    return {
        AppTextInput: (props: ComponentProps<typeof TextInput>) => React.createElement(MockTextInput, props),
    };
});
jest.mock('@/components/otp-code-input', () => ({
    OtpCodeInput: () => null,
}));
jest.mock('@/components/otp-resend-control', () => ({
    OtpResendControl: () => null,
}));
jest.mock('@/components/themed-text', () => {
    const React = jest.requireActual<typeof import('react')>('react');
    const { Text: MockText } = jest.requireActual<typeof import('react-native')>('react-native');
    return {
        ThemedText: ({ children, ...props }: ComponentProps<typeof Text>) => React.createElement(MockText, props, children),
    };
});
jest.mock('@/components/themed-view', () => {
    const React = jest.requireActual<typeof import('react')>('react');
    const { View: MockView } = jest.requireActual<typeof import('react-native')>('react-native');
    return { ThemedView: (props: ComponentProps<typeof View>) => React.createElement(MockView, props) };
});
jest.mock('@/constants/theme', () => ({
    Radius: { sm: 8, md: 12, lg: 16 },
    Spacing: { half: 2, one: 4, two: 8, three: 16, four: 24, six: 32 },
}));
jest.mock('@/hooks/use-auth', () => ({ useAuth: jest.fn() }));
jest.mock('@/hooks/use-app-feedback', () => ({ useAppFeedback: jest.fn() }));
jest.mock('@/hooks/use-online-status', () => ({ useOnlineStatus: () => mockIsOnline }));
jest.mock('@/hooks/use-otp-resend-countdown', () => ({
    useOtpResendCountdown: () => ({ secondsRemaining: 0, start: jest.fn() }),
}));
jest.mock('@/hooks/use-theme', () => ({
    useTheme: () => new Proxy({}, { get: (_target, key) => `#${String(key)}` }),
}));
jest.mock('@/services/auth-api', () => ({
    beginTwoFactorEnrollment: jest.fn(),
    confirmTwoFactorEnrollment: jest.fn(),
    disableTwoFactor: jest.fn(),
    fetchTwoFactorStatus: jest.fn(),
    getDeviceId: jest.fn(),
    getStoredAuthToken: jest.fn(),
    sendOtp: jest.fn(),
}));
jest.mock('@/utils/persian-date', () => ({
    formatPersianDate: () => 'تاریخ آزمایشی',
}));

const user = {
    id: 7,
    name: 'Test User',
    phone: '09120000000',
    profile_photo_path: null,
    phone_verified_at: '2026-01-01T00:00:00.000Z',
    last_active_at: null,
    inactivity_deletion_period_months: null,
    inactivity_deletion_scheduled_at: null,
    restricted_capabilities: [],
};
const devices = [{
    id: 4,
    device_id: 'other-device',
    device_name: 'دستگاه آزمایشی',
    device_model: 'Test Model',
    platform: 'android' as const,
    last_activity: null,
    created_at: '2026-01-01T00:00:00.000Z',
    expires_at: null,
    is_current: false,
    is_stale: false,
}];
const twoFactorStatus = {
    enabled: true,
    enabled_at: '2026-01-01T00:00:00.000Z',
    recovery_codes_remaining: 3,
};

beforeEach(() => {
    jest.clearAllMocks();
    mockIsFocused = true;
    mockIsOnline = true;
    onlineManager.setOnline(true);
    jest.mocked(useAuth).mockReturnValue({
        user,
        getDevices: mockGetDevices,
        revokeUserDevice: mockRevokeUserDevice,
        signOut: mockSignOut,
        signOutOtherDevices: mockSignOutOtherDevices,
        deleteAccount: mockDeleteAccount,
        updateInactivityDeletion: mockUpdateInactivityDeletion,
    } as unknown as ReturnType<typeof useAuth>);
    jest.mocked(useAppFeedback).mockReturnValue({
        showFeedback: jest.fn(),
        dismissFeedback: jest.fn(),
        showError: jest.fn(),
    });
    mockGetDevices.mockResolvedValue(devices);
    jest.mocked(fetchTwoFactorStatus).mockResolvedValue(twoFactorStatus);
    jest.mocked(getStoredAuthToken).mockResolvedValue('test-token');
    jest.mocked(beginTwoFactorEnrollment).mockResolvedValue({
        secret: 'test-secret',
        provisioning_uri: 'otpauth://test',
    });
    jest.mocked(sendOtp).mockResolvedValue({ message: 'sent', resend_after: 30 });
});

afterEach(() => {
    onlineManager.setOnline(true);
});

async function renderScreen() {
    return render(<PrivacySecurityScreen />);
}

async function setConnectivity(view: Awaited<ReturnType<typeof renderScreen>>, online: boolean) {
    await act(async () => {
        mockIsOnline = online;
        onlineManager.setOnline(online);
        await view.rerender(<PrivacySecurityScreen />);
    });
}

describe('privacy and security offline behavior', () => {
    it('retains the last security responses and keeps the notice until both reconnect requests succeed', async () => {
        const view = await renderScreen();
        await waitFor(() => {
            expect(view.getByText('دستگاه آزمایشی')).toBeTruthy();
            expect(view.getByText('فعال است · 3 کد بازیابی باقی مانده')).toBeTruthy();
        });

        await setConnectivity(view, false);
        await waitFor(() => {
            expect(getOfflinePageNotices().some((notice) => (
                notice.pathname === '/account/privacy-security'
                && notice.hasSavedData
            ))).toBe(true);
        });

        let resolveDevices!: (value: typeof devices) => void;
        let resolveTwoFactor!: (value: typeof twoFactorStatus) => void;
        const devicesResponse = new Promise<typeof devices>((resolve) => { resolveDevices = resolve; });
        const twoFactorResponse = new Promise<typeof twoFactorStatus>((resolve) => { resolveTwoFactor = resolve; });
        mockGetDevices.mockReturnValueOnce(devicesResponse);
        jest.mocked(fetchTwoFactorStatus).mockReturnValueOnce(twoFactorResponse);

        await setConnectivity(view, true);
        await waitFor(() => {
            expect(mockGetDevices).toHaveBeenCalledTimes(2);
            expect(fetchTwoFactorStatus).toHaveBeenCalledTimes(2);
            expect(view.getByText('دستگاه آزمایشی')).toBeTruthy();
            expect(view.getByText('فعال است · 3 کد بازیابی باقی مانده')).toBeTruthy();
        });
        expect(getOfflinePageNotices().some((notice) => notice.pathname === '/account/privacy-security')).toBe(true);

        await act(async () => {
            resolveDevices(devices);
            await devicesResponse;
        });
        expect(getOfflinePageNotices().some((notice) => notice.pathname === '/account/privacy-security')).toBe(true);

        await act(async () => {
            resolveTwoFactor(twoFactorStatus);
            await twoFactorResponse;
        });
        await waitFor(() => {
            expect(getOfflinePageNotices().some((notice) => notice.pathname === '/account/privacy-security')).toBe(false);
        });
        await view.unmount();
    });

    it('keeps stale data marked and disables server actions when offline or reconnect refresh fails', async () => {
        const view = await renderScreen();
        await waitFor(() => expect(view.getByText('دستگاه آزمایشی')).toBeTruthy());
        await setConnectivity(view, false);

        expect(view.getByRole('button', { name: 'لغو نشست دستگاه آزمایشی' }).props.accessibilityState?.disabled).toBe(true);
        expect(view.getByRole('button', { name: 'خروج از سایر دستگاه‌ها' }).props.accessibilityState?.disabled).toBe(true);
        expect(view.getByRole('button', { name: 'درخواست کد تأیید حذف' }).props.accessibilityState?.disabled).toBe(true);
        expect(view.getByRole('radio', { name: '۶ ماه' }).props.accessibilityState?.disabled).toBe(true);
        expect(view.getByRole('button', { name: 'خروج از این دستگاه' }).props.accessibilityState?.disabled).toBe(false);

        jest.mocked(fetchTwoFactorStatus).mockRejectedValueOnce(new TypeError('Network unavailable'));
        mockGetDevices.mockRejectedValueOnce(new TypeError('Network unavailable'));
        await setConnectivity(view, true);

        await waitFor(() => {
            expect(view.getByText('دستگاه آزمایشی')).toBeTruthy();
            expect(view.getByText('فعال است · 3 کد بازیابی باقی مانده')).toBeTruthy();
            expect(getOfflinePageNotices().some((notice) => (
                notice.pathname === '/account/privacy-security'
                && notice.hasSavedData
            ))).toBe(true);
        });
        expect(view.getByRole('button', { name: 'لغو نشست دستگاه آزمایشی' }).props.accessibilityState?.disabled).toBe(true);
        expect(mockSignOutOtherDevices).not.toHaveBeenCalled();
        expect(mockDeleteAccount).not.toHaveBeenCalled();
        expect(mockUpdateInactivityDeletion).not.toHaveBeenCalled();
        await view.unmount();
    });

    it('does not request security data while initially offline and explains that no live data is available', async () => {
        mockIsOnline = false;
        onlineManager.setOnline(false);

        const view = await renderScreen();

        await waitFor(() => {
            expect(mockGetDevices).not.toHaveBeenCalled();
            expect(fetchTwoFactorStatus).not.toHaveBeenCalled();
            expect(view.getByText('برای دریافت فهرست دستگاه‌ها اتصال به سرور لازم است.')).toBeTruthy();
            expect(getOfflinePageNotices().some((notice) => (
                notice.pathname === '/account/privacy-security'
                && notice.hasSavedData === false
            ))).toBe(true);
        });
        await view.unmount();
    });
});
