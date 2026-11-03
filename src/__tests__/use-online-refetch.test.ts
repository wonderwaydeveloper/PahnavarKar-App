import { act, cleanup, renderHook } from '@testing-library/react-native';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { onlineManager } from '@tanstack/react-query';

import { useOnlineRefetch } from '@/hooks/use-online-refetch';

jest.mock('@tanstack/react-query', () => ({
    onlineManager: {
        isOnline: jest.fn(),
        subscribe: jest.fn(),
    },
}));

const isOnlineMock = jest.mocked(onlineManager.isOnline);
const subscribeMock = jest.mocked(onlineManager.subscribe);
let updateNetworkStatus: ((isOnline: boolean) => void) | undefined;

describe('useOnlineRefetch', () => {
    beforeEach(() => {
        updateNetworkStatus = undefined;
        isOnlineMock.mockReturnValue(false);
        subscribeMock.mockImplementation((listener) => {
            updateNetworkStatus = listener;
            return () => {
                updateNetworkStatus = undefined;
            };
        });
    });

    afterEach(() => {
        cleanup();
        jest.clearAllMocks();
    });

    it('refetches once only on each offline to online transition', async () => {
        const onReconnect = jest.fn();
        renderHook(() => useOnlineRefetch(onReconnect));

        await act(async () => updateNetworkStatus?.(true));
        await act(async () => updateNetworkStatus?.(true));
        await act(async () => updateNetworkStatus?.(false));
        await act(async () => updateNetworkStatus?.(true));

        expect(onReconnect).toHaveBeenCalledTimes(2);
    });
});
