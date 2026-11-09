import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { ComponentProps } from 'react';
import { Text, TextInput, View } from 'react-native';

import AuthScreen from '@/app/auth';
import { useAppFeedback } from '@/hooks/use-app-feedback';
import { useAuth } from '@/hooks/use-auth';
import { sendOtp } from '@/services/auth-api';

const mockRouterReplace = jest.fn();
const mockShowFeedback = jest.fn();

jest.mock('expo-router', () => ({
    useLocalSearchParams: () => ({}),
    useRouter: () => ({
        back: jest.fn(),
        canGoBack: () => true,
        replace: mockRouterReplace,
    }),
}));
jest.mock('expo-image-picker', () => ({
    requestMediaLibraryPermissionsAsync: jest.fn(),
    launchImageLibraryAsync: jest.fn(),
    UIImagePickerPreferredAssetRepresentationMode: { Compatible: 'compatible' },
}));
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: () => null }));
jest.mock('react-native-paper', () => {
    const React = jest.requireActual<typeof import('react')>('react');
    const { Pressable: MockPressable, View: MockView } = jest.requireActual<typeof import('react-native')>('react-native');

    return {
        ActivityIndicator: () => null,
        Appbar: {
            Header: ({ children, ...props }: ComponentProps<typeof View>) => React.createElement(MockView, props, children),
            Action: ({ onPress, accessibilityLabel }: { onPress: () => void; accessibilityLabel: string }) => (
                React.createElement(MockPressable, { accessibilityRole: 'button', accessibilityLabel, onPress })
            ),
        },
    };
});
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
        IranianPhoneInput: ({ accessibilityLabel, onChangeText, value }: {
            accessibilityLabel: string;
            onChangeText: (value: string) => void;
            value: string;
        }) => React.createElement(MockTextInput, { accessibilityLabel, onChangeText, value }),
    };
});
jest.mock('@/components/otp-code-input', () => ({ OtpCodeInput: () => null }));
jest.mock('@/components/otp-resend-control', () => ({ OtpResendControl: () => null }));
jest.mock('@/components/profile-photo-field', () => ({ ProfilePhotoField: () => null }));
jest.mock('@/components/profile-photo-preview', () => ({ ProfilePhotoPreview: () => null }));
jest.mock('@/components/network-status-banner', () => {
    const React = jest.requireActual<typeof import('react')>('react');
    const { Text: MockText } = jest.requireActual<typeof import('react-native')>('react-native');
    return {
        NetworkStatusBanner: () => React.createElement(MockText, { testID: 'network-status-banner' }, 'وضعیت اتصال سرور'),
    };
});
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
    Spacing: { half: 2, one: 4, two: 8, three: 16, four: 24 },
}));
jest.mock('@/hooks/use-app-context', () => ({ useAppContext: () => ({ theme: 'light' }) }));
jest.mock('@/hooks/use-app-feedback', () => ({ useAppFeedback: jest.fn() }));
jest.mock('@/hooks/use-auth', () => ({ useAuth: jest.fn() }));
jest.mock('@/hooks/use-otp-resend-countdown', () => ({
    useOtpResendCountdown: () => ({ secondsRemaining: 0, start: jest.fn(), reset: jest.fn() }),
}));
jest.mock('@/hooks/use-theme', () => ({
    useTheme: () => new Proxy({}, { get: (_target, key) => `#${String(key)}` }),
}));
jest.mock('@/services/auth-api', () => ({
    sendOtp: jest.fn(),
}));
jest.mock('@/services/iranian-phone', () => ({
    getIranianNationalNumber: (value: string) => value.replace(/\D/g, '').replace(/^0/, ''),
    normalizeIranianPhone: (value: string) => {
        const digits = value.replace(/\D/g, '').replace(/^0/, '');
        return /^9\d{9}$/.test(digits) ? `+98${digits}` : null;
    },
    normalizeOtpCode: (value: string) => value,
}));
jest.mock('@/services/user-facing-error', () => ({
    getUserFacingErrorMessage: (error: unknown) => (
        error instanceof TypeError ? 'ارتباط با سرور برقرار نشد. دوباره تلاش کنید.' : 'خطای نامشخص'
    ),
    getUserFacingFieldError: () => null,
}));

beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useAuth).mockReturnValue({
        user: null,
        isLoading: false,
        signInWithOtp: jest.fn(),
        verifyTwoFactorLogin: jest.fn(),
        uploadProfilePhoto: jest.fn(),
    } as unknown as ReturnType<typeof useAuth>);
    jest.mocked(useAppFeedback).mockReturnValue({
        showFeedback: mockShowFeedback,
        dismissFeedback: jest.fn(),
        showError: jest.fn(),
    } as ReturnType<typeof useAppFeedback>);
    jest.mocked(sendOtp).mockResolvedValue({ message: 'sent', resend_after: 30 });
});

afterEach(cleanup);

describe('authentication screen connectivity', () => {
    it('shows server connectivity and prevents duplicate OTP requests', async () => {
        let resolveOtp!: (value: { message: string; resend_after: number }) => void;
        jest.mocked(sendOtp).mockReturnValueOnce(new Promise((resolve) => {
            resolveOtp = resolve;
        }));

        const view = await render(<AuthScreen />);
        expect(view.getByTestId('network-status-banner')).toBeTruthy();
        await fireEvent.changeText(view.getByLabelText('شماره تلفن'), '09120000000');

        const submit = view.getByRole('button', { name: 'دریافت کد تأیید' });
        await fireEvent.press(submit);
        await fireEvent.press(view.getByRole('button', { name: 'در حال ارسال...' }));

        expect(sendOtp).toHaveBeenCalledTimes(1);
        expect(sendOtp).toHaveBeenCalledWith({ phone: '+989120000000', type: 'login' });

        await act(async () => {
            resolveOtp({ message: 'sent', resend_after: 30 });
        });
        await waitFor(() => {
            expect(mockShowFeedback).toHaveBeenCalledWith({
                message: 'کد تأیید از طریق پیامک ارسال شد.',
                variant: 'success',
            });
        });
    });

    it('keeps the phone draft and reports a network failure so the user can retry', async () => {
        jest.mocked(sendOtp).mockRejectedValueOnce(new TypeError('Network request failed'));

        const view = await render(<AuthScreen />);
        const phoneInput = view.getByLabelText('شماره تلفن');
        await fireEvent.changeText(phoneInput, '09120000000');
        await fireEvent.press(view.getByRole('button', { name: 'دریافت کد تأیید' }));

        await waitFor(() => {
            expect(mockShowFeedback).toHaveBeenCalledWith(expect.objectContaining({
                message: 'ارتباط با سرور برقرار نشد. دوباره تلاش کنید.',
                variant: 'error',
            }));
            expect(view.getByLabelText('شماره تلفن').props.value).toBe('09120000000');
            expect(view.getByRole('button', { name: 'دریافت کد تأیید' })).toBeTruthy();
        });
    });
});
