import { act, cleanup, render } from '@testing-library/react-native';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { StyleSheet } from 'react-native';
import { NetworkStatusBanner } from '@/components/network-status-banner';
import {
    getServerConnectivityStatus,
    subscribeToServerConnectivity,
    type ServerConnectivityStatus,
} from '@/services/server-connectivity';

jest.mock('@/services/server-connectivity', () => ({
    getServerConnectivityStatus: jest.fn(),
    subscribeToServerConnectivity: jest.fn(),
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

const getStatusMock = jest.mocked(getServerConnectivityStatus);
const subscribeMock = jest.mocked(subscribeToServerConnectivity);
let serverStatus: ServerConnectivityStatus = 'connected';
let updateServerStatus: (() => void) | undefined;

function publishStatus(nextStatus: ServerConnectivityStatus) {
    serverStatus = nextStatus;
    updateServerStatus?.();
}

describe('NetworkStatusBanner', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        serverStatus = 'connected';
        updateServerStatus = undefined;
        getStatusMock.mockImplementation(() => serverStatus);
        subscribeMock.mockImplementation((listener) => {
            updateServerStatus = listener;
            return () => {
                updateServerStatus = undefined;
            };
        });
    });

    afterEach(() => {
        cleanup();
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    it('shows server connection state and hides after the server responds', async () => {
        const { getByText, queryByText } = await render(<NetworkStatusBanner />);

        await act(async () => publishStatus('server-unavailable'));
        expect(getByText('ارتباط با سرور برقرار نیست')).toBeTruthy();

        await act(async () => {
            publishStatus('connected');
            jest.advanceTimersByTime(120);
        });
        expect(queryByText('ارتباط با سرور برقرار نیست')).toBeNull();
    });

    it('shows a connecting state while the server health check is pending', async () => {
        serverStatus = 'connecting';

        const { getByText } = await render(<NetworkStatusBanner />);

        expect(getByText('در حال اتصال به سرور…')).toBeTruthy();
        const banner = getByText('در حال اتصال به سرور…').parent;
        const bannerStyle = StyleSheet.flatten(banner?.props.style);
        expect(bannerStyle).toMatchObject({
            width: '100%',
            alignSelf: 'stretch',
            minHeight: 28,
        });
        expect(bannerStyle?.position).not.toBe('absolute');
    });
});
