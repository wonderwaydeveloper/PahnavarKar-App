import { act, cleanup, render } from '@testing-library/react-native';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { onlineManager } from '@tanstack/react-query';
import { StyleSheet } from 'react-native';
import { NetworkStatusBanner } from '@/components/network-status-banner';

jest.mock('@tanstack/react-query', () => ({
    onlineManager: {
        isOnline: jest.fn(),
        subscribe: jest.fn(),
    },
}));

jest.mock('@expo/vector-icons', () => ({
    MaterialCommunityIcons: () => null,
}));

jest.mock('@/components/themed-text', () => {
    const React = jest.requireActual<typeof import('react')>('react');
    const { Text } = jest.requireActual<typeof import('react-native')>('react-native');

    return {
        ThemedText: ({ children, ...props }: React.ComponentProps<typeof Text>) => (
            React.createElement(Text, props, children)
        ),
    };
});

jest.mock('@/hooks/use-theme', () => ({
    useTheme: () => ({
        warningFill: '#8A5700',
        successFill: '#18794E',
        onWarning: '#FFFFFF',
        onSuccess: '#FFFFFF',
    }),
}));

jest.mock('@/constants/theme', () => ({
    Spacing: { one: 4, two: 8, three: 12 },
}));

const isOnlineMock = jest.mocked(onlineManager.isOnline);
const subscribeMock = jest.mocked(onlineManager.subscribe);
let updateNetworkStatus: ((isOnline: boolean) => void) | undefined;

describe('NetworkStatusBanner', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        updateNetworkStatus = undefined;
        isOnlineMock.mockReturnValue(true);
        subscribeMock.mockImplementation((listener) => {
            updateNetworkStatus = listener;
            return () => {
                updateNetworkStatus = undefined;
            };
        });
    });

    afterEach(() => {
        cleanup();
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    it('shows a compact offline notice and a temporary reconnection notice', async () => {
        const { getByText, queryByText } = await render(<NetworkStatusBanner />);

        expect(queryByText('اتصال اینترنتی ندارید')).toBeNull();

        await act(async () => updateNetworkStatus?.(false));
        expect(getByText('اتصال اینترنتی ندارید')).toBeTruthy();

        await act(async () => updateNetworkStatus?.(true));
        expect(getByText('دوباره متصل شدید')).toBeTruthy();

        await act(async () => {
            jest.advanceTimersByTime(3000);
        });
        await act(async () => {
            jest.advanceTimersByTime(220);
        });
        expect(queryByText('دوباره متصل شدید')).toBeNull();
    });

    it('shows offline state immediately when mounted without network', async () => {
        isOnlineMock.mockReturnValue(false);

        const { getByText } = await render(<NetworkStatusBanner />);

        expect(getByText('اتصال اینترنتی ندارید')).toBeTruthy();
        const banner = getByText('اتصال اینترنتی ندارید').parent;
        const bannerStyle = StyleSheet.flatten(banner?.props.style);
        expect(bannerStyle).toMatchObject({
            width: '100%',
            alignSelf: 'stretch',
            minHeight: 28,
        });
        expect(bannerStyle?.position).not.toBe('absolute');
    });
});
