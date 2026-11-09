import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { onlineManager } from '@tanstack/react-query';
import type { ComponentProps } from 'react';
import { Text, TextInput, View } from 'react-native';

import EditProfileScreen from '@/app/(tabs)/account/edit-profile';
import { useAppFeedback } from '@/hooks/use-app-feedback';
import { useAuth } from '@/hooks/use-auth';
import type { AuthenticatedUser } from '@/services/auth-api';
import { getOfflinePageNotices } from '@/services/offline-page-status';

let mockIsFocused = true;
let mockIsOnline = true;
const mockRouterBack = jest.fn();
const mockRefreshUser = jest.fn<() => Promise<void>>();
const mockUpdateProfile = jest.fn<(input: { name: string }) => Promise<void>>();
const mockUploadProfilePhoto = jest.fn<() => Promise<void>>();
const mockRemoveProfilePhoto = jest.fn<() => Promise<void>>();
const mockChangePhone = jest.fn<(phone: string, code: string) => Promise<void>>();
const mockSendOtp = jest.fn<(input: { phone: string; type: 'login' }) => Promise<{ message: string; resend_after: number }>>();
let mockAuthUser: AuthenticatedUser | null;

jest.mock('expo-router', () => {
    const React = jest.requireActual<typeof import('react')>('react');
    return {
        useFocusEffect: (callback: () => void | (() => void)) => React.useEffect(() => {
            if (!mockIsFocused) return undefined;
            return callback();
        }, [callback]),
        useIsFocused: () => mockIsFocused,
        usePathname: () => '/account/edit-profile',
        useRouter: () => ({ back: mockRouterBack }),
    };
});
jest.mock('expo-image-picker', () => ({
    requestMediaLibraryPermissionsAsync: jest.fn(),
    launchImageLibraryAsync: jest.fn(),
    UIImagePickerPreferredAssetRepresentationMode: { Compatible: 'compatible' },
}));
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: () => null }));
jest.mock('react-native-paper', () => ({ ActivityIndicator: () => null }));
jest.mock('@/components/app-snackbar', () => ({ AppSnackbar: () => null }));
jest.mock('@/components/app-text', () => {
    const React = jest.requireActual<typeof import('react')>('react');
    const { TextInput: MockTextInput } = jest.requireActual<typeof import('react-native')>('react-native');
    return {
        AppTextInput: (props: ComponentProps<typeof TextInput>) => React.createElement(MockTextInput, props),
    };
});
jest.mock('@/components/iranian-phone-input', () => {
    const React = jest.requireActual<typeof import('react')>('react');
    const { TextInput: MockTextInput } = jest.requireActual<typeof import('react-native')>('react-native');
    return {
        IranianPhoneInput: ({ accessibilityLabel, disabled, onChangeText, value }: {
            accessibilityLabel: string;
            disabled?: boolean;
            onChangeText: (value: string) => void;
            value: string;
        }) => React.createElement(MockTextInput, {
            accessibilityLabel,
            editable: !disabled,
            onChangeText,
            value,
        }),
    };
});
jest.mock('@/components/otp-code-input', () => ({
    OtpCodeInput: () => null,
}));
jest.mock('@/components/otp-resend-control', () => ({
    OtpResendControl: () => null,
}));
jest.mock('@/components/profile-photo-field', () => ({
    ProfilePhotoField: () => null,
}));
jest.mock('@/components/profile-photo-preview', () => ({
    ProfilePhotoPreview: () => null,
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
    Spacing: { half: 2, one: 4, two: 8, three: 16, four: 24, five: 32, six: 48 },
}));
jest.mock('@/hooks/use-auth', () => ({ useAuth: jest.fn() }));
jest.mock('@/hooks/use-app-feedback', () => ({ useAppFeedback: jest.fn() }));
jest.mock('@/hooks/use-online-status', () => ({ useOnlineStatus: () => mockIsOnline }));
jest.mock('@/hooks/use-otp-resend-countdown', () => ({
    useOtpResendCountdown: () => ({ secondsRemaining: 0, start: jest.fn(), reset: jest.fn() }),
}));
jest.mock('@/hooks/use-theme', () => ({
    useTheme: () => new Proxy({}, { get: (_target, key) => `#${String(key)}` }),
}));
jest.mock('@/services/auth-api', () => ({
    getProfilePhotoUrl: (path: string | null) => path ? `https://example.test/${path}` : null,
    sendOtp: (input: { phone: string; type: 'login' }) => mockSendOtp(input),
}));
jest.mock('@/services/iranian-phone', () => ({
    normalizeIranianPhone: (value: string) => value.length === 10 ? `+98${value}` : null,
    normalizeOtpCode: (value: string) => value,
}));
jest.mock('@/services/user-facing-error', () => ({
    getUserFacingErrorMessage: (error: unknown) => error instanceof Error ? error.message : 'Unknown error',
}));

const user = {
    id: 8,
    name: 'Test User',
    phone: '+989120000000',
    profile_photo_path: null,
    phone_verified_at: '2026-01-01T00:00:00.000Z',
    last_active_at: null,
    inactivity_deletion_period_months: null,
    inactivity_deletion_scheduled_at: null,
    restricted_capabilities: [],
};

function createAuthValue() {
    return {
        user: mockAuthUser,
        refreshUser: mockRefreshUser,
        updateProfile: mockUpdateProfile,
        uploadProfilePhoto: mockUploadProfilePhoto,
        removeProfilePhoto: mockRemoveProfilePhoto,
        changePhone: mockChangePhone,
    } as unknown as ReturnType<typeof useAuth>;
}

function updateAuthMock() {
    jest.mocked(useAuth).mockReturnValue(createAuthValue());
}

async function renderScreen() {
    return render(<EditProfileScreen />);
}

async function setConnectivity(view: Awaited<ReturnType<typeof renderScreen>>, online: boolean) {
    await act(async () => {
        mockIsOnline = online;
        onlineManager.setOnline(online);
        await view.rerender(<EditProfileScreen />);
    });
}

beforeEach(() => {
    jest.clearAllMocks();
    mockIsFocused = true;
    mockIsOnline = true;
    onlineManager.setOnline(true);
    mockAuthUser = { ...user };
    mockRefreshUser.mockResolvedValue(undefined);
    mockUpdateProfile.mockResolvedValue(undefined);
    mockUploadProfilePhoto.mockResolvedValue(undefined);
    mockRemoveProfilePhoto.mockResolvedValue(undefined);
    mockChangePhone.mockResolvedValue(undefined);
    mockSendOtp.mockResolvedValue({ message: 'sent', resend_after: 30 });
    updateAuthMock();
    jest.mocked(useAppFeedback).mockReturnValue({
        showFeedback: jest.fn(),
        dismissFeedback: jest.fn(),
        showError: jest.fn(),
    });
});

afterEach(() => {
    cleanup();
    onlineManager.setOnline(true);
});

describe('edit profile offline behavior', () => {
    it('marks saved account details as offline and disables server mutations while preserving local photo selection', async () => {
        const view = await renderScreen();
        await setConnectivity(view, false);

        await waitFor(() => {
            expect(getOfflinePageNotices().some((notice) => (
                notice.pathname === '/account/edit-profile'
                && notice.hasSavedData
            ))).toBe(true);
        });
        expect(view.getByRole('button', { name: 'ذخیرهٔ تغییرات پروفایل' }).props.accessibilityState?.disabled).toBe(true);
        expect(view.getByRole('button', { name: 'ارسال کد به شمارهٔ جدید' }).props.accessibilityState?.disabled).toBe(true);
        expect(view.getByLabelText('شمارهٔ تلفن جدید').props.editable).toBe(false);
        expect(mockUpdateProfile).not.toHaveBeenCalled();
        expect(mockSendOtp).not.toHaveBeenCalled();

        await view.unmount();
    });

    it('retains the unsaved name draft while reconnect refresh succeeds, then saves only when online', async () => {
        mockIsOnline = false;
        onlineManager.setOnline(false);
        const view = await renderScreen();
        await act(async () => {
            fireEvent.changeText(view.getByLabelText('نام و نام خانوادگی'), 'Draft Name');
        });
        expect(view.getByLabelText('نام و نام خانوادگی').props.value).toBe('Draft Name');

        await setConnectivity(view, true);
        await waitFor(() => {
            expect(mockRefreshUser).toHaveBeenCalledTimes(1);
            expect(getOfflinePageNotices().some((notice) => notice.pathname === '/account/edit-profile')).toBe(false);
        });
        expect(view.getByLabelText('نام و نام خانوادگی').props.value).toBe('Draft Name');

        await fireEvent.press(view.getByRole('button', { name: 'ذخیرهٔ تغییرات پروفایل' }));
        await waitFor(() => {
            expect(mockUpdateProfile).toHaveBeenCalledWith({ name: 'Draft Name' });
            expect(mockRouterBack).toHaveBeenCalledTimes(1);
        });
        await view.unmount();
    });

    it('keeps the profile notice after reconnect refresh fails and exposes an explicit retry', async () => {
        mockIsOnline = false;
        onlineManager.setOnline(false);
        mockRefreshUser.mockRejectedValueOnce(new TypeError('Network unavailable'));
        const view = await renderScreen();

        await setConnectivity(view, true);
        await waitFor(() => {
            expect(mockRefreshUser).toHaveBeenCalledTimes(1);
            expect(view.getByRole('button', { name: 'همگام‌سازی دوبارهٔ اطلاعات حساب' })).toBeTruthy();
            expect(getOfflinePageNotices().some((notice) => (
                notice.pathname === '/account/edit-profile'
                && notice.hasSavedData
            ))).toBe(true);
        });
        await fireEvent.press(view.getByRole('button', { name: 'همگام‌سازی دوبارهٔ اطلاعات حساب' }));
        await waitFor(() => {
            expect(mockRefreshUser).toHaveBeenCalledTimes(2);
            expect(getOfflinePageNotices().some((notice) => notice.pathname === '/account/edit-profile')).toBe(false);
        });
        await view.unmount();
    });
});
