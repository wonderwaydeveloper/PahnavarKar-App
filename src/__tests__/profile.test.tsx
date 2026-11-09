import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ComponentProps } from 'react';

import ProfileScreen from '@/app/(tabs)/account';
import { useAppContext } from '@/hooks/use-app-context';
import { useAppFeedback } from '@/hooks/use-app-feedback';
import { useAuth } from '@/hooks/use-auth';
import { useTheme } from '@/hooks/use-theme';
import { fetchNotificationCounts, getProfilePhotoUrl, getStoredAuthToken } from '@/services/auth-api';
import { getOfflineCacheEntry, setOfflineCacheEntry } from '@/services/offline-cache';
import { CACHE_POLICY } from '@/services/cache-policy';
import { getOfflinePageNotices } from '@/services/offline-page-status';

let mockIsFocused = true;
let mockIsOnline = false;
let mockRouterPush: jest.Mock;
let mockOnlineRefetch: (() => void) | undefined;
const mockOfflineEntries = new Map<string, { value: unknown; updatedAt: number }>();
const mockQueryClients: QueryClient[] = [];
const mockShowError = jest.fn();
const mockRefreshUser = jest.fn<() => Promise<void>>();
const mockPlanAccessRefresh = jest.fn<() => Promise<boolean>>();
let mockPlanAccessOffline = false;

jest.mock('expo-router', () => ({
    usePathname: () => '/account',
    useIsFocused: () => mockIsFocused,
    useRouter: () => ({ push: mockRouterPush }),
}));
jest.mock('expo-image', () => {
    const React = jest.requireActual<typeof import('react')>('react');
    const { View } = jest.requireActual<typeof import('react-native')>('react-native');

    return { Image: (props: ComponentProps<typeof View>) => React.createElement(View, props) };
});
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => undefined) }));
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: () => null }));
jest.mock('react-native-paper', () => ({ ActivityIndicator: () => null }));
jest.mock('react-native-safe-area-context', () => ({
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('@/components/app-snackbar', () => ({ AppSnackbar: () => null }));
jest.mock('@/components/confirmation-modal', () => ({ ConfirmationModal: () => null }));
jest.mock('@/components/error-notice-card', () => {
    const React = jest.requireActual<typeof import('react')>('react');
    const { Pressable, Text, View } = jest.requireActual<typeof import('react-native')>('react-native');

    return {
        ErrorNoticeCard: ({ message, onRetry, retryLabel }: { message: string; onRetry: () => void; retryLabel: string }) => (
            React.createElement(View, null,
                React.createElement(Text, null, message),
                React.createElement(Pressable, { accessibilityRole: 'button', accessibilityLabel: retryLabel, onPress: onRetry },
                    React.createElement(Text, null, retryLabel)),
            )
        ),
    };
});
jest.mock('@/components/profile-photo-preview', () => {
    const React = jest.requireActual<typeof import('react')>('react');
    const { Text } = jest.requireActual<typeof import('react-native')>('react-native');

    return {
        ProfilePhotoPreview: ({ visible }: { visible: boolean }) => (
            visible ? React.createElement(Text, null, 'پیش‌نمایش تصویر باز است') : null
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
jest.mock('@/constants/theme', () => ({
    Radius: { sm: 8, md: 12, lg: 16 },
    Spacing: { half: 2, one: 4, two: 8, three: 16, four: 24, five: 32 },
}));
jest.mock('@/hooks/use-app-context', () => ({ useAppContext: jest.fn() }));
jest.mock('@/hooks/use-app-feedback', () => ({ useAppFeedback: jest.fn() }));
jest.mock('@/hooks/use-auth', () => ({ useAuth: jest.fn() }));
jest.mock('@/hooks/use-online-refetch', () => ({
    useOnlineRefetch: (callback: () => void) => {
        mockOnlineRefetch = callback;
    },
}));
jest.mock('@/hooks/use-online-status', () => ({ useOnlineStatus: () => mockIsOnline }));
jest.mock('@/hooks/use-plan-access', () => ({
    usePlanAccess: () => ({
        planAccess: null,
        isUsingOfflineData: mockPlanAccessOffline,
        refresh: mockPlanAccessRefresh,
    }),
}));
jest.mock('@/hooks/use-theme', () => ({ useTheme: jest.fn() }));
jest.mock('@/services/auth-api', () => ({
    fetchNotificationCounts: jest.fn(),
    getProfilePhotoUrl: jest.fn(),
    getStoredAuthToken: jest.fn(),
    isTemporaryApiFailure: jest.fn(() => false),
}));
jest.mock('@/services/offline-cache', () => ({
    getOfflineCacheEntry: jest.fn(),
    setOfflineCacheEntry: jest.fn(),
}));

const user = {
    id: 7,
    name: 'Test User',
    phone: '09120000000',
    profile_photo_path: null as string | null,
    phone_verified_at: null,
    last_active_at: null,
    inactivity_deletion_period_months: null,
    inactivity_deletion_scheduled_at: null,
};
const counts = { unread_count: 3, read_count: 5 };

function createQueryClient() {
    return new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
}

async function renderScreen(queryClient = createQueryClient()) {
    mockQueryClients.push(queryClient);
    const view = await render(
        <QueryClientProvider client={queryClient}>
            <ProfileScreen />
        </QueryClientProvider>,
    );

    return { ...view, queryClient };
}

function createAuthValue(profilePhotoPath = user.profile_photo_path) {
    return {
        user: { ...user, profile_photo_path: profilePhotoPath },
        isLoading: false,
        sessionError: null,
        accountSuspension: null,
        refreshUser: mockRefreshUser,
        signInWithOtp: jest.fn(),
        verifyTwoFactorLogin: jest.fn(),
        uploadProfilePhoto: jest.fn(),
        removeProfilePhoto: jest.fn(),
        updateProfile: jest.fn(),
        updateInactivityDeletion: jest.fn(),
        changePhone: jest.fn(),
        deleteAccount: jest.fn(),
        signOut: jest.fn(),
        signOutAll: jest.fn(),
        signOutOtherDevices: jest.fn(),
        getDevices: jest.fn(),
        revokeUserDevice: jest.fn(),
    } as ReturnType<typeof useAuth>;
}

beforeEach(() => {
    jest.clearAllMocks();
    mockOfflineEntries.clear();
    mockIsFocused = true;
    mockIsOnline = false;
    mockRouterPush = jest.fn();
    mockOnlineRefetch = undefined;
    mockShowError.mockClear();
    mockPlanAccessOffline = false;
    onlineManager.setOnline(mockIsOnline);
    mockRefreshUser.mockResolvedValue(undefined);
    mockPlanAccessRefresh.mockResolvedValue(true);

    jest.mocked(useAppContext).mockReturnValue({ theme: 'light' } as ReturnType<typeof useAppContext>);
    jest.mocked(useTheme).mockReturnValue({
        surface: '#fff',
        border: '#ddd',
        text: '#111',
        textSecondary: '#555',
        primary: '#08a',
        onPrimary: '#fff',
        primaryText: '#08a',
        infoFill: '#08a',
        onStatus: '#fff',
    } as ReturnType<typeof useTheme>);
    jest.mocked(useAuth).mockReturnValue(createAuthValue());
    jest.mocked(useAppFeedback).mockReturnValue({
        showFeedback: jest.fn(),
        dismissFeedback: jest.fn(),
        showError: mockShowError,
    });
    jest.mocked(getProfilePhotoUrl).mockImplementation((path) => path ? `https://example.test/${path}` : null);
    jest.mocked(getStoredAuthToken).mockResolvedValue('test-token');
    jest.mocked(fetchNotificationCounts).mockResolvedValue(counts);
    jest.mocked(getOfflineCacheEntry).mockImplementation(async <T,>(
        _userId: number,
        _namespace: string,
        cacheKey: string,
    ) => {
        const entry = mockOfflineEntries.get(cacheKey);
        return entry ? { value: entry.value as T, updatedAt: entry.updatedAt } : null;
    });
    jest.mocked(setOfflineCacheEntry).mockImplementation(async (
        _userId,
        _namespace,
        cacheKey,
        value,
    ) => {
        mockOfflineEntries.set(cacheKey, { value, updatedAt: Date.now() });
        return Date.now();
    });
});

afterEach(() => {
    cleanup();
    mockQueryClients.forEach((queryClient) => queryClient.clear());
    mockQueryClients.length = 0;
    onlineManager.setOnline(true);
    jest.clearAllTimers();
});

describe('profile screen', () => {
    it('opens profile editing from the name', async () => {
        const view = await renderScreen();
        await fireEvent.press(view.getByLabelText('ویرایش پروفایل Test User'));

        expect(mockRouterPush).toHaveBeenCalledWith('/(tabs)/account/edit-profile');
    });

    it('opens profile editing from the empty avatar', async () => {
        const view = await renderScreen();
        await fireEvent.press(view.getByLabelText('ویرایش پروفایل'));

        expect(mockRouterPush).toHaveBeenCalledWith('/(tabs)/account/edit-profile');
    });

    it('opens image preview when the profile photo is available', async () => {
        jest.mocked(useAuth).mockReturnValue(createAuthValue('profile.jpg'));
        const view = await renderScreen();

        expect(view.getByTestId('profile-avatar-image').props.cachePolicy).toBe('memory-disk');
        await fireEvent.press(view.getByLabelText('پیش‌نمایش تصویر پروفایل'));
        expect(view.getByText('پیش‌نمایش تصویر باز است')).toBeTruthy();
    });

    it('falls back to an editable avatar if the remote photo fails to load', async () => {
        jest.mocked(useAuth).mockReturnValue(createAuthValue('profile.jpg'));
        const view = await renderScreen();

        await fireEvent(view.getByTestId('profile-avatar-image'), 'error');

        expect(view.getByLabelText('ویرایش پروفایل')).toBeTruthy();
        await fireEvent.press(view.getByLabelText('ویرایش پروفایل'));
        expect(mockRouterPush).toHaveBeenCalledWith('/(tabs)/account/edit-profile');
    });

    it('copies the phone number from the profile card', async () => {
        const Clipboard = jest.requireMock<typeof import('expo-clipboard')>('expo-clipboard');
        const view = await renderScreen();

        await fireEvent.press(view.getByLabelText(`کپی شمارهٔ تلفن ${user.phone}`));

        await waitFor(() => {
            expect(Clipboard.setStringAsync).toHaveBeenCalledWith(user.phone);
        });
    });

    it('renders cached notification counts without a network request while offline', async () => {
        const savedAt = Date.now() - 60_000;
        mockOfflineEntries.set('counts', { value: counts, updatedAt: savedAt });
        const view = await renderScreen();

        await waitFor(() => {
            expect(view.getByText('۳')).toBeTruthy();
            expect(view.queryClient.getQueryData(['notification-counts', user.id]))
                .toMatchObject({ offlineCacheSavedAt: savedAt, ...counts });
            expect(getOfflinePageNotices().some((notice) => (
                notice.pathname === '/account'
                && notice.hasSavedData
            ))).toBe(true);
        });
        expect(fetchNotificationCounts).not.toHaveBeenCalled();
    });

    it('marks existing account overview data offline immediately and waits for live refresh on reconnect', async () => {
        mockIsOnline = true;
        onlineManager.setOnline(true);
        const view = await renderScreen();
        await waitFor(() => {
            expect(fetchNotificationCounts).toHaveBeenCalledTimes(1);
            expect(view.getByText('۳')).toBeTruthy();
        });

        await act(async () => {
            mockIsOnline = false;
            onlineManager.setOnline(false);
            await view.rerender(
                <QueryClientProvider client={view.queryClient}>
                    <ProfileScreen />
                </QueryClientProvider>,
            );
        });
        await waitFor(() => {
            expect(getOfflinePageNotices().some((notice) => (
                notice.pathname === '/account'
                && notice.hasSavedData
            ))).toBe(true);
        });

        let resolveUser!: () => void;
        let resolveCounts!: (value: typeof counts) => void;
        let resolvePlan!: (value: boolean) => void;
        const userResponse = new Promise<void>((resolve) => { resolveUser = resolve; });
        const countsResponse = new Promise<typeof counts>((resolve) => { resolveCounts = resolve; });
        const planResponse = new Promise<boolean>((resolve) => { resolvePlan = resolve; });
        mockRefreshUser.mockReturnValueOnce(userResponse);
        jest.mocked(fetchNotificationCounts).mockReturnValueOnce(countsResponse);
        mockPlanAccessRefresh.mockReturnValueOnce(planResponse);

        await act(async () => {
            mockIsOnline = true;
            onlineManager.setOnline(true);
            await view.rerender(
                <QueryClientProvider client={view.queryClient}>
                    <ProfileScreen />
                </QueryClientProvider>,
            );
        });

        await waitFor(() => {
            expect(mockRefreshUser).toHaveBeenCalledTimes(1);
            expect(fetchNotificationCounts).toHaveBeenCalledTimes(2);
            expect(mockPlanAccessRefresh).toHaveBeenCalledTimes(1);
        });
        expect(getOfflinePageNotices().some((notice) => notice.pathname === '/account')).toBe(true);

        await act(async () => {
            resolveUser();
            await userResponse;
        });
        await act(async () => {
            resolveCounts(counts);
            await countsResponse;
        });
        expect(getOfflinePageNotices().some((notice) => notice.pathname === '/account')).toBe(true);

        await act(async () => {
            resolvePlan(true);
            await planResponse;
        });
        await waitFor(() => {
            expect(getOfflinePageNotices().some((notice) => notice.pathname === '/account')).toBe(false);
        });
    });

    it('keeps the account offline notice after reconnect refresh fails and exposes retry', async () => {
        mockIsOnline = true;
        onlineManager.setOnline(true);
        const view = await renderScreen();
        await waitFor(() => expect(fetchNotificationCounts).toHaveBeenCalledTimes(1));

        await act(async () => {
            mockIsOnline = false;
            onlineManager.setOnline(false);
            await view.rerender(
                <QueryClientProvider client={view.queryClient}>
                    <ProfileScreen />
                </QueryClientProvider>,
            );
        });
        mockRefreshUser.mockRejectedValueOnce(new TypeError('Network unavailable'));

        await act(async () => {
            mockIsOnline = true;
            onlineManager.setOnline(true);
            await view.rerender(
                <QueryClientProvider client={view.queryClient}>
                    <ProfileScreen />
                </QueryClientProvider>,
            );
        });
        await waitFor(() => {
            expect(mockRefreshUser).toHaveBeenCalledTimes(1);
            expect(view.getByRole('button', { name: 'همگام‌سازی دوباره' })).toBeTruthy();
            expect(getOfflinePageNotices().some((notice) => (
                notice.pathname === '/account'
                && notice.hasSavedData
            ))).toBe(true);
        });

        await fireEvent.press(view.getByRole('button', { name: 'همگام‌سازی دوباره' }));
        await waitFor(() => {
            expect(mockRefreshUser).toHaveBeenCalledTimes(2);
            expect(getOfflinePageNotices().some((notice) => notice.pathname === '/account')).toBe(false);
        });
    });

    it('does not complete account refresh when plan access is still offline-backed', async () => {
        const view = await renderScreen();
        mockPlanAccessRefresh.mockResolvedValueOnce(false);

        await act(async () => {
            mockIsOnline = true;
            onlineManager.setOnline(true);
            await view.rerender(
                <QueryClientProvider client={view.queryClient}>
                    <ProfileScreen />
                </QueryClientProvider>,
            );
        });

        await waitFor(() => {
            expect(mockPlanAccessRefresh).toHaveBeenCalledTimes(1);
            expect(view.getByRole('button', { name: 'همگام‌سازی دوباره' })).toBeTruthy();
            expect(getOfflinePageNotices().some((notice) => (
                notice.pathname === '/account'
                && notice.hasSavedData
            ))).toBe(true);
        });

        await fireEvent.press(view.getByRole('button', { name: 'همگام‌سازی دوباره' }));
        await waitFor(() => {
            expect(mockPlanAccessRefresh).toHaveBeenCalledTimes(2);
            expect(getOfflinePageNotices().some((notice) => notice.pathname === '/account')).toBe(false);
        });
    });

    it('reports a missing offline count cache without trying the network', async () => {
        await renderScreen();

        await waitFor(() => {
            expect(mockShowError).toHaveBeenCalledWith(
                expect.any(TypeError),
                'دریافت تعداد اعلان‌های خوانده‌نشده ناموفق بود.',
            );
        });
        expect(fetchNotificationCounts).not.toHaveBeenCalled();
    });

    it('revalidates cached account data when the screen mounts offline and connectivity returns', async () => {
        const savedAt = Date.now() - 60_000;
        mockOfflineEntries.set('counts', { value: counts, updatedAt: savedAt });
        const view = await renderScreen();

        await waitFor(() => {
            expect(view.queryClient.getQueryData(['notification-counts', user.id]))
                .toMatchObject({ offlineCacheSavedAt: savedAt, ...counts });
        });

        await act(async () => {
            mockIsOnline = true;
            onlineManager.setOnline(true);
            await view.rerender(
                <QueryClientProvider client={view.queryClient}>
                    <ProfileScreen />
                </QueryClientProvider>,
            );
        });

        await waitFor(() => {
            expect(mockRefreshUser).toHaveBeenCalledTimes(1);
            expect(mockPlanAccessRefresh).toHaveBeenCalledTimes(1);
            expect(fetchNotificationCounts).toHaveBeenCalledTimes(1);
            expect(view.queryClient.getQueryData(['notification-counts', user.id]))
                .not.toMatchObject({ offlineCacheSavedAt: savedAt });
            expect(getOfflinePageNotices().some((notice) => notice.pathname === '/account')).toBe(false);
        });
    });

    it('fetches notification counts online and refetches when the reconnect callback runs', async () => {
        mockIsOnline = true;
        onlineManager.setOnline(true);
        const view = await renderScreen();

        await waitFor(() => {
            expect(fetchNotificationCounts).toHaveBeenCalledTimes(1);
            expect(view.getByText('۳')).toBeTruthy();
            expect(setOfflineCacheEntry).toHaveBeenCalledWith(
                user.id,
                CACHE_POLICY.offline.entries.notificationInbox.namespace,
                'counts',
                counts,
            );
        });

        await act(async () => mockOnlineRefetch?.());

        await waitFor(() => {
            expect(fetchNotificationCounts).toHaveBeenCalledTimes(2);
            expect(view.queryClient.getQueryState(['notification-counts', user.id])?.fetchStatus).toBe('idle');
        });
    });

    it('does not request notification counts while the profile screen is unfocused', async () => {
        mockIsFocused = false;

        await renderScreen();

        expect(getStoredAuthToken).not.toHaveBeenCalled();
        expect(fetchNotificationCounts).not.toHaveBeenCalled();
    });
});
