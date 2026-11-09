import { cleanup, render, waitFor } from '@testing-library/react-native';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { ComponentProps } from 'react';
import { Text, TextInput, View } from 'react-native';

import HomeLayout from '@/app/(tabs)/home/_layout';
import SearchScreen from '@/app/(tabs)/search';
import { getOfflinePageNotices } from '@/services/offline-page-status';
import { usePlanAccess } from '@/hooks/use-plan-access';

let mockPathname = '/home';
let mockIsUsingOfflineData = true;
let mockPlanAccess: { key: string; name: string; features: Record<string, boolean> } | null = {
    key: 'free',
    name: 'رایگان',
    features: { 'legal_library': true },
};

jest.mock('expo-router', () => {
    const React = jest.requireActual<typeof import('react')>('react');
    const { View: MockView } = jest.requireActual<typeof import('react-native')>('react-native');
    function MockStack({ children }: { children: React.ReactNode }) {
        return React.createElement(MockView, null, children);
    }
    function MockStackScreen() {
        return null;
    }
    MockStack.Screen = MockStackScreen;

    return {
        Stack: MockStack,
        usePathname: () => mockPathname,
        useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
    };
});
jest.mock('react-native-safe-area-context', () => ({
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: () => null }));
jest.mock('@/components/app-header', () => ({ AppHeader: () => null }));
jest.mock('@/components/app-text', () => {
    const React = jest.requireActual<typeof import('react')>('react');
    const { TextInput: MockTextInput } = jest.requireActual<typeof import('react-native')>('react-native');
    return { AppTextInput: (props: ComponentProps<typeof TextInput>) => React.createElement(MockTextInput, props) };
});
jest.mock('@/components/error-notice-card', () => ({ ErrorNoticeCard: () => null }));
jest.mock('@/components/error-state', () => ({ ErrorState: () => null }));
jest.mock('@/components/tool-list-item', () => ({ ToolListItem: () => null }));
jest.mock('@/components/themed-text', () => {
    const React = jest.requireActual<typeof import('react')>('react');
    const { Text: MockText } = jest.requireActual<typeof import('react-native')>('react-native');
    return { ThemedText: ({ children, ...props }: ComponentProps<typeof Text>) => React.createElement(MockText, props, children) };
});
jest.mock('@/components/themed-view', () => {
    const React = jest.requireActual<typeof import('react')>('react');
    const { View: MockView } = jest.requireActual<typeof import('react-native')>('react-native');
    return { ThemedView: (props: ComponentProps<typeof View>) => React.createElement(MockView, props) };
});
jest.mock('@/components/legal/legal-category-list', () => ({ LegalCategoryList: () => null }));
jest.mock('@/constants/theme', () => ({
    Spacing: { one: 4, two: 8, three: 16 },
}));
jest.mock('@/hooks/use-plan-access', () => ({ usePlanAccess: jest.fn() }));
jest.mock('@/hooks/use-theme', () => ({
    useTheme: () => new Proxy({}, { get: (_target, key) => `#${String(key)}` }),
}));
jest.mock('@/database', () => ({
    searchLegalContent: jest.fn(async () => []),
}));

describe('offline entitlement notices on home and search', () => {
    beforeEach(() => {
        mockPathname = '/home';
        mockIsUsingOfflineData = true;
        mockPlanAccess = {
            key: 'free',
            name: 'رایگان',
            features: { 'legal_library': true },
        };
        jest.mocked(usePlanAccess).mockImplementation(() => ({
            planAccess: mockPlanAccess,
            isLoading: false,
            error: null,
            refresh: jest.fn(async () => false),
            isUsingOfflineData: mockIsUsingOfflineData,
        }));
    });

    afterEach(() => {
        cleanup();
    });

    it('marks saved plan entitlement as offline on home, including legal routes', async () => {
        const view = await render(<HomeLayout />);

        await waitFor(() => {
            expect(getOfflinePageNotices().some((notice) => (
                notice.pathname === '/home'
                && notice.hasSavedData
                && notice.message === 'وضعیت دسترسی پلن ممکن است به‌روز نباشد.'
            ))).toBe(true);
        });

        mockPathname = '/home/rules/article/12';
        await view.rerender(<HomeLayout />);
        await waitFor(() => {
            expect(getOfflinePageNotices().some((notice) => (
                notice.pathname === '/home/rules/article/12'
                && notice.hasSavedData
            ))).toBe(true);
        });
    });

    it('marks saved plan entitlement as offline on search and clears the notice for live access', async () => {
        mockPathname = '/search';
        const view = await render(<SearchScreen />);

        await waitFor(() => {
            expect(getOfflinePageNotices().some((notice) => (
                notice.pathname === '/search'
                && notice.hasSavedData
            ))).toBe(true);
        });

        mockIsUsingOfflineData = false;
        await view.rerender(<SearchScreen />);
        await waitFor(() => {
            expect(getOfflinePageNotices().some((notice) => notice.pathname === '/search')).toBe(false);
        });
    });
});
