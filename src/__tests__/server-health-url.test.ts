import { afterEach, describe, expect, it } from '@jest/globals';
import { getServerHealthCheckUrl } from '@/services/auth-api';

const originalApiUrl = process.env.EXPO_PUBLIC_API_URL;

afterEach(() => {
    if (originalApiUrl === undefined) {
        delete process.env.EXPO_PUBLIC_API_URL;
    } else {
        process.env.EXPO_PUBLIC_API_URL = originalApiUrl;
    }
});

describe('server health check URL', () => {
    it('targets Laravel health route when the API URL ends in /api/v1', () => {
        process.env.EXPO_PUBLIC_API_URL = 'https://api.example.test/api/v1/';

        expect(getServerHealthCheckUrl()).toBe('https://api.example.test/up');
    });

    it('preserves a configured server base path when deriving the health route', () => {
        process.env.EXPO_PUBLIC_API_URL = 'https://example.test/backend/api/v1';

        expect(getServerHealthCheckUrl()).toBe('https://example.test/backend/up');
    });
});
