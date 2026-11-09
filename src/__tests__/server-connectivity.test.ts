import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
    getServerConnectivityStatus,
    setServerConnectivityAppActive,
    stopServerConnectivityMonitoring,
} from '@/services/server-connectivity';

jest.mock('@/services/auth-api', () => ({
    getServerHealthCheckUrl: jest.fn(() => 'https://api.example.test/up'),
}));

describe('server connectivity monitoring', () => {
    let fetchMock: jest.SpiedFunction<typeof fetch>;

    beforeEach(() => {
        jest.useFakeTimers();
        stopServerConnectivityMonitoring();
        fetchMock = jest.spyOn(globalThis, 'fetch');
    });

    afterEach(() => {
        stopServerConnectivityMonitoring();
        fetchMock.mockRestore();
        jest.useRealTimers();
    });

    it('checks the backend health endpoint and reports a responsive server', async () => {
        fetchMock.mockResolvedValue({ ok: true, status: 200 } as Response);

        setServerConnectivityAppActive(true);
        await Promise.resolve();
        await Promise.resolve();

        expect(fetchMock).toHaveBeenCalledWith(
            expect.stringMatching(/^https:\/\/api\.example\.test\/up\?_health_check=/),
            expect.objectContaining({
                method: 'GET',
                headers: expect.objectContaining({ Accept: 'application/json' }),
            }),
        );
        expect(getServerConnectivityStatus()).toBe('connected');
    });

    it('rechecks a responsive server every five seconds while the app is active', async () => {
        fetchMock.mockResolvedValue({ ok: true, status: 200 } as Response);

        setServerConnectivityAppActive(true);
        await Promise.resolve();
        await Promise.resolve();
        expect(fetchMock).toHaveBeenCalledTimes(1);

        await jest.advanceTimersByTimeAsync(4999);
        expect(fetchMock).toHaveBeenCalledTimes(1);

        await jest.advanceTimersByTimeAsync(1);
        await Promise.resolve();
        await Promise.resolve();
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(getServerConnectivityStatus()).toBe('connected');
    });

    it('reports an unavailable server and retries', async () => {
        const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
        fetchMock.mockResolvedValue({ ok: false, status: 503 } as Response);

        setServerConnectivityAppActive(true);
        await Promise.resolve();
        await Promise.resolve();
        expect(getServerConnectivityStatus()).toBe('server-unavailable');

        await jest.advanceTimersByTimeAsync(5000);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(getServerConnectivityStatus()).toBe('server-unavailable');
        expect(consoleError).not.toHaveBeenCalled();
    });

    it('does not log ordinary connection failures as console errors', async () => {
        const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
        fetchMock.mockRejectedValue(new TypeError('fetch failed: java.net.ConnectException'));

        setServerConnectivityAppActive(true);
        await Promise.resolve();
        await Promise.resolve();

        expect(getServerConnectivityStatus()).toBe('server-unavailable');
        expect(consoleError).not.toHaveBeenCalled();
    });

    it('pauses checks while the app is in the background and checks again on resume', async () => {
        fetchMock.mockResolvedValue({ ok: true, status: 200 } as Response);
        setServerConnectivityAppActive(true);
        await Promise.resolve();
        await Promise.resolve();
        expect(fetchMock).toHaveBeenCalledTimes(1);

        setServerConnectivityAppActive(false);
        await jest.advanceTimersByTimeAsync(60_000);
        expect(fetchMock).toHaveBeenCalledTimes(1);

        setServerConnectivityAppActive(true);
        await Promise.resolve();
        await Promise.resolve();
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });
});
