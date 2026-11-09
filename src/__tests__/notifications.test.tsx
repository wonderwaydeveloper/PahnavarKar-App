import { act, render, waitFor } from '@testing-library/react-native';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ComponentProps, ReactNode } from 'react';

import NotificationsScreen from '@/app/(tabs)/account/notifications';
import { useAppFeedback } from '@/hooks/use-app-feedback';
import { useAuth } from '@/hooks/use-auth';
import { getOfflineCacheEntry } from '@/services/offline-cache';
import {
    fetchNotificationCounts,
    fetchNotificationInbox,
    getStoredAuthToken,
} from '@/services/auth-api';
import { getOfflinePageNotices } from '@/services/offline-page-status';

let mockIsFocused = true;
let mockIsOnline = false;
const mockOfflineEntries = new Map<string, { value: unknown; updatedAt: number }>();

jest.mock('expo-router', () => ({
    usePathname: () => '/account/notifications',
    useFocusEffect: (callback: () => void | (() => void)) => {
        const React = jest.requireActual<typeof import('react')>('react');
        React.useEffect(() => {
            if (!mockIsFocused) return undefined;
            return callback();
        }, [callback]);
    },
    useIsFocused: () => mockIsFocused,
}));
jest.mock('react-native-safe-area-context', () => ({
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('react-native-tab-view', () => {
    const React = jest.requireActual<typeof import('react')>('react');
    const { View } = jest.requireActual<typeof import('react-native')>('react-native');

    return {
        TabView: ({ navigationState, renderScene }: {
            navigationState: { index: number; routes: { key: string }[] };
            renderScene: (input: { route: { key: string } }) => ReactNode;
        }) => React.createElement(
            View,
            null,
            renderScene({ route: navigationState.routes[navigationState.index]! }),
        ),
    };
});
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: () => null }));
jest.mock('expo-constants', () => ({
    __esModule: true,
    default: { appOwnership: 'standalone', expoConfig: { extra: { eas: { projectId: 'test-project' } } } },
    AppOwnership: { Expo: 'expo' },
}));
jest.mock('@/components/app-snackbar', () => ({ AppSnackbar: () => null }));
jest.mock('@/components/confirmation-modal', () => ({ ConfirmationModal: () => null }));
jest.mock('@/components/error-notice-card', () => {
    const React = jest.requireActual<typeof import('react')>('react');
    const { Text } = jest.requireActual<typeof import('react-native')>('react-native');

    return { ErrorNoticeCard: ({ message }: { message: string }) => React.createElement(Text, null, message) };
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
    Spacing: { half: 2, one: 4, two: 8, three: 16, four: 24 },
}));
jest.mock('@/hooks/use-auth', () => ({ useAuth: jest.fn() }));
jest.mock('@/hooks/use-app-feedback', () => ({ useAppFeedback: jest.fn() }));
jest.mock('@/hooks/use-online-refetch', () => ({ useOnlineRefetch: jest.fn() }));
jest.mock('@/hooks/use-online-status', () => ({ useOnlineStatus: () => mockIsOnline }));
jest.mock('@/hooks/use-theme', () => ({
    useTheme: () => new Proxy({}, { get: (_target, key) => `#${String(key)}` }),
}));
jest.mock('@/services/offline-cache', () => ({
    clearOfflineCacheNamespace: jest.fn(async () => undefined),
    getOfflineCacheEntry: jest.fn(),
    setOfflineCacheEntry: jest.fn(async () => Date.now()),
}));
jest.mock('@/services/auth-api', () => ({
    deleteNotification: jest.fn(),
    deleteReadNotifications: jest.fn(),
    fetchNotificationInbox: jest.fn(),
    fetchNotificationCounts: jest.fn(),
    fetchPushSubscriptionStatus: jest.fn(),
    getStoredAuthToken: jest.fn(),
    isTemporaryApiFailure: jest.fn((error: unknown) => error instanceof TypeError),
    markAllNotificationsRead: jest.fn(),
    markNotificationRead: jest.fn(),
    removePushSubscription: jest.fn(),
    restoreDeletedNotifications: jest.fn(),
    savePushSubscription: jest.fn(),
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
const page = {
    data: [{
        id: 12,
        category: 'service' as const,
        priority: 'normal' as const,
        title: 'آزمایش اعلان',
        body: 'این پیام برای بررسی کش آفلاین است.',
        event: null,
        data: null,
        read_at: null,
        created_at: '2026-11-05T12:00:00.000Z',
    }],
    meta: { current_page: 1, last_page: 1, per_page: 20, total: 1 },
};
const counts = { unread_count: 3, read_count: 5 };
const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
});

beforeEach(() => {
    jest.clearAllMocks();
    queryClient.clear();
    mockOfflineEntries.clear();
    mockIsFocused = true;
    mockIsOnline = false;
    onlineManager.setOnline(false);
    jest.mocked(useAuth).mockReturnValue({ user, isLoading: false } as ReturnType<typeof useAuth>);
    jest.mocked(useAppFeedback).mockReturnValue({
        showFeedback: jest.fn(),
        dismissFeedback: jest.fn(),
        showError: jest.fn(),
    });
    jest.mocked(getStoredAuthToken).mockResolvedValue('test-token');
    jest.mocked(fetchNotificationInbox).mockResolvedValue(page);
    jest.mocked(fetchNotificationCounts).mockResolvedValue(counts);
    jest.mocked(getOfflineCacheEntry).mockImplementation(async <T,>(
        _userId: number,
        _namespace: string,
        cacheKey: string,
    ) => {
        const entry = mockOfflineEntries.get(cacheKey);
        return entry ? { value: entry.value as T, updatedAt: entry.updatedAt } : null;
    });
});

afterEach(() => {
    jest.restoreAllMocks();
    queryClient.clear();
    onlineManager.setOnline(true);
});

async function renderScreen() {
    return render(
        <QueryClientProvider client={queryClient}>
            <NotificationsScreen />
        </QueryClientProvider>,
    );
}

describe('notification inbox performance', () => {
    it('serves encrypted-cache-backed inbox and count data while offline', async () => {
        const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
        const savedAt = Date.now() - 60_000;
        mockOfflineEntries.set(JSON.stringify(['all', 1]), { value: page, updatedAt: savedAt });
        mockOfflineEntries.set('counts', { value: counts, updatedAt: savedAt });

        const view = await renderScreen();
        await waitFor(() => {
            expect(queryClient.getQueryData(['notification-inbox', user.id, 'all']))
                .toMatchObject({ pages: [{ offlineCacheSavedAt: savedAt }] });
            expect(queryClient.getQueryData(['notification-counts', user.id]))
                .toMatchObject({ offlineCacheSavedAt: savedAt, ...counts });
            expect(view.getByText('آزمایش اعلان')).toBeTruthy();
            expect(view.getByText('خوانده‌نشده')).toBeTruthy();
            expect(consoleError.mock.calls.flat().join(' '))
                .not.toContain('Cannot update a component');
            expect(getOfflinePageNotices().some((notice) => (
                notice.pathname === '/account/notifications'
                && notice.message === 'اعلان‌های ذخیره‌شده ممکن است به‌روز نباشند.'
            ))).toBe(true);
            expect(view.getByLabelText('حذف اعلان آزمایش اعلان').props.accessibilityState?.disabled).toBe(true);
        });
        expect(fetchNotificationInbox).not.toHaveBeenCalled();
        expect(fetchNotificationCounts).not.toHaveBeenCalled();
        expect(getOfflineCacheEntry).toHaveBeenCalledWith(
            user.id,
            'notification-inbox-v1',
            JSON.stringify(['all', 1]),
            { maxAgeMs: 30 * 24 * 60 * 60 * 1000 },
        );
        await view.unmount();
    });

    it('does not show an unread status chip for a read notification', async () => {
        const savedAt = Date.now();
        const readPage = {
            ...page,
            data: page.data.map((notification) => ({
                ...notification,
                read_at: '2026-11-05T12:30:00.000Z',
            })),
        };
        mockOfflineEntries.set(JSON.stringify(['all', 1]), { value: readPage, updatedAt: savedAt });
        mockOfflineEntries.set('counts', { value: counts, updatedAt: savedAt });

        const view = await renderScreen();

        await waitFor(() => {
            expect(view.getByText('آزمایش اعلان')).toBeTruthy();
            expect(view.queryByText('خوانده‌نشده')).toBeNull();
        });
        await view.unmount();
    });

    it('does not request inbox or count data while its route is unfocused', async () => {
        mockIsFocused = false;

        const view = await renderScreen();

        await waitFor(() => {
            expect(fetchNotificationInbox).not.toHaveBeenCalled();
            expect(fetchNotificationCounts).not.toHaveBeenCalled();
            expect(getOfflineCacheEntry).not.toHaveBeenCalled();
        });
        await view.unmount();
    });

    it('revalidates cached notification data immediately when the network returns', async () => {
        const savedAt = Date.now() - 60_000;
        mockOfflineEntries.set(JSON.stringify(['all', 1]), { value: page, updatedAt: savedAt });
        mockOfflineEntries.set('counts', { value: counts, updatedAt: savedAt });
        const view = await renderScreen();

        await waitFor(() => {
            expect(queryClient.getQueryData(['notification-inbox', user.id, 'all']))
                .toMatchObject({ pages: [{ offlineCacheSavedAt: savedAt }] });
        });

        mockIsOnline = true;
        onlineManager.setOnline(true);
        await view.rerender(
            <QueryClientProvider client={queryClient}>
                <NotificationsScreen />
            </QueryClientProvider>,
        );

        await waitFor(() => {
            expect(fetchNotificationInbox).toHaveBeenCalledTimes(1);
            expect(fetchNotificationCounts).toHaveBeenCalledTimes(1);
            expect(queryClient.getQueryData(['notification-inbox', user.id, 'all']))
                .not.toMatchObject({ pages: [{ offlineCacheSavedAt: savedAt }] });
        });
        expect(getOfflinePageNotices().some((notice) => notice.pathname === '/account/notifications')).toBe(false);
        await view.unmount();
    });

    it('marks already loaded inbox and counts offline immediately when connectivity is lost', async () => {
        mockIsOnline = true;
        onlineManager.setOnline(true);
        queryClient.setQueryData(['notification-inbox', user.id, 'security'], {
            pages: [page],
            pageParams: [1],
        });
        const view = await renderScreen();

        await waitFor(() => {
            expect(queryClient.getQueryData(['notification-inbox', user.id, 'all']))
                .toMatchObject({ pages: [{ data: [{ title: 'آزمایش اعلان' }] }] });
            expect(queryClient.getQueryData(['notification-counts', user.id])).toEqual(counts);
        });

        await act(async () => {
            mockIsOnline = false;
            onlineManager.setOnline(false);
        });

        await waitFor(() => {
            expect(getOfflinePageNotices().some((notice) => (
                notice.pathname === '/account/notifications'
                && notice.hasSavedData
            ))).toBe(true);
        });
        await view.unmount();
    });

    it('keeps the offline notice visible until live inbox and count responses both complete', async () => {
        const savedAt = Date.now() - 60_000;
        mockOfflineEntries.set(JSON.stringify(['all', 1]), { value: page, updatedAt: savedAt });
        mockOfflineEntries.set('counts', { value: counts, updatedAt: savedAt });
        const view = await renderScreen();
        await waitFor(() => {
            expect(getOfflinePageNotices().some((notice) => notice.pathname === '/account/notifications')).toBe(true);
        });

        let resolveInbox!: (value: typeof page) => void;
        let resolveCounts!: (value: typeof counts) => void;
        const inboxResponse = new Promise<typeof page>((resolve) => { resolveInbox = resolve; });
        const countsResponse = new Promise<typeof counts>((resolve) => { resolveCounts = resolve; });
        jest.mocked(fetchNotificationInbox).mockReturnValueOnce(inboxResponse);
        jest.mocked(fetchNotificationCounts).mockReturnValueOnce(countsResponse);

        await act(async () => {
            mockIsOnline = true;
            onlineManager.setOnline(true);
            await view.rerender(
                <QueryClientProvider client={queryClient}>
                    <NotificationsScreen />
                </QueryClientProvider>,
            );
        });
        await waitFor(() => {
            expect(fetchNotificationInbox).toHaveBeenCalled();
            expect(fetchNotificationCounts).toHaveBeenCalled();
        });
        expect(getOfflinePageNotices().some((notice) => notice.pathname === '/account/notifications')).toBe(true);

        await act(async () => {
            resolveInbox(page);
            await inboxResponse;
        });
        expect(getOfflinePageNotices().some((notice) => notice.pathname === '/account/notifications')).toBe(true);

        await act(async () => {
            resolveCounts(counts);
            await countsResponse;
        });
        await waitFor(() => {
            expect(getOfflinePageNotices().some((notice) => notice.pathname === '/account/notifications')).toBe(false);
        });
        await view.unmount();
    });

    it('keeps cached notification data and the offline notice when reconnect requests fail', async () => {
        const savedAt = Date.now() - 60_000;
        mockOfflineEntries.set(JSON.stringify(['all', 1]), { value: page, updatedAt: savedAt });
        mockOfflineEntries.set('counts', { value: counts, updatedAt: savedAt });
        const view = await renderScreen();
        await waitFor(() => {
            expect(queryClient.getQueryData(['notification-counts', user.id]))
                .toMatchObject({ offlineCacheSavedAt: savedAt });
        });
        jest.mocked(fetchNotificationInbox).mockRejectedValueOnce(new TypeError('Network unavailable'));
        jest.mocked(fetchNotificationCounts).mockRejectedValueOnce(new TypeError('Network unavailable'));

        await act(async () => {
            mockIsOnline = true;
            onlineManager.setOnline(true);
            await view.rerender(
                <QueryClientProvider client={queryClient}>
                    <NotificationsScreen />
                </QueryClientProvider>,
            );
        });

        await waitFor(() => {
            expect(getOfflinePageNotices().some((notice) => (
                notice.pathname === '/account/notifications'
                && notice.hasSavedData
            ))).toBe(true);
        });
        expect(queryClient.getQueryData(['notification-inbox', user.id, 'all']))
            .toMatchObject({ pages: [{ offlineCacheSavedAt: savedAt }] });
        expect(queryClient.getQueryData(['notification-counts', user.id]))
            .toMatchObject({ offlineCacheSavedAt: savedAt });
        await view.unmount();
    });
});
