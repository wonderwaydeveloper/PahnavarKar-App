import { cleanup, render, waitFor } from '@testing-library/react-native';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Text } from 'react-native';
import { PlanAccessProvider } from '@/context/plan-access.provider';
import { usePlanAccess } from '@/hooks/use-plan-access';
import { fetchCurrentPlan, getStoredAuthToken } from '@/services/auth-api';
import { getCachedGuestPlanAccess, loadGuestPlanAccess } from '@/services/guest-plan-access';
import { getCachedPlanAccess } from '@/services/plan-access-cache';

const mockUser = {
    id: 7,
    name: 'Test User',
    phone: '09120000000',
    profile_photo_path: null,
    phone_verified_at: null,
    last_active_at: null,
    inactivity_deletion_period_months: null,
    inactivity_deletion_scheduled_at: null,
};
let mockServerStatus = 'server-unavailable';
let mockIsGuest = false;

jest.mock('@/hooks/use-auth', () => ({
    useAuth: () => ({ user: mockIsGuest ? null : mockUser, isLoading: false }),
}));

jest.mock('@/services/server-connectivity', () => ({
    getServerConnectivityStatus: () => mockServerStatus,
}));

jest.mock('@/hooks/use-online-status', () => ({
    useServerConnectivityStatus: () => mockServerStatus,
}));

jest.mock('@/services/auth-api', () => {
    const actual = jest.requireActual<typeof import('@/services/auth-api')>('@/services/auth-api');
    return {
        ...actual,
        fetchCurrentPlan: jest.fn(),
        getStoredAuthToken: jest.fn(),
    };
});

jest.mock('@/services/guest-plan-access', () => ({
    getCachedGuestPlanAccess: jest.fn(),
    loadGuestPlanAccess: jest.fn(),
}));

jest.mock('@/services/plan-access-cache', () => ({
    clearCachedPlanAccess: jest.fn(),
    getCachedPlanAccess: jest.fn(),
    getPlanAccessValidUntil: jest.fn(),
    saveCachedPlanAccess: jest.fn(),
}));

function PlanAccessProbe() {
    const { planAccess, isLoading, error, isUsingOfflineData } = usePlanAccess();
    return (
        <>
            <Text testID="plan-access">
                {`${planAccess?.name ?? 'none'}|${isLoading ? 'loading' : 'ready'}|${error ?? ''}`}
            </Text>
            <Text testID="plan-access-source">{isUsingOfflineData ? 'offline' : 'live'}</Text>
        </>
    );
}

function createQueryClient() {
    return new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
}

describe('PlanAccessProvider offline access', () => {
    let queryClient: QueryClient;

    beforeEach(() => {
        jest.clearAllMocks();
        mockServerStatus = 'server-unavailable';
        mockIsGuest = false;
        queryClient = createQueryClient();
        jest.mocked(getStoredAuthToken).mockResolvedValue('test-token');
        jest.mocked(getCachedPlanAccess).mockResolvedValue({
            userId: mockUser.id,
            tokenHash: 'hash',
            plan: { key: 'standard', name: 'استاندارد', features: {} },
            verifiedAt: Date.now(),
            validUntil: Date.now() + 60_000,
        });
        jest.mocked(getCachedGuestPlanAccess).mockResolvedValue(null);
    });

    afterEach(() => {
        cleanup();
        queryClient.clear();
    });

    it('keeps the last verified account plan available without contacting an unavailable server', async () => {
        mockServerStatus = 'connecting';
        const view = await render(
            <QueryClientProvider client={queryClient}>
                <PlanAccessProvider>
                    <PlanAccessProbe />
                </PlanAccessProvider>
            </QueryClientProvider>,
        );

        await waitFor(() => {
            expect(view.getByTestId('plan-access').props.children).toBe('استاندارد|ready|');
            expect(view.getByTestId('plan-access-source').props.children).toBe('offline');
        });

        expect(fetchCurrentPlan).not.toHaveBeenCalled();
    });

    it('keeps a temporary access error hidden while the initial server check is still running', async () => {
        mockServerStatus = 'connecting';
        jest.mocked(getCachedPlanAccess).mockResolvedValue(null);

        const view = await render(
            <QueryClientProvider client={queryClient}>
                <PlanAccessProvider>
                    <PlanAccessProbe />
                </PlanAccessProvider>
            </QueryClientProvider>,
        );

        await waitFor(() => {
            expect(view.getByTestId('plan-access').props.children).toBe('none|loading|');
        });
    });

    it('does not grant stale plan access when the saved verification has expired', async () => {
        jest.mocked(getCachedPlanAccess).mockResolvedValue({
            userId: mockUser.id,
            tokenHash: 'hash',
            plan: { key: 'standard', name: 'استاندارد', features: {} },
            verifiedAt: Date.now() - 120_000,
            validUntil: Date.now() - 60_000,
        });

        const view = await render(
            <QueryClientProvider client={queryClient}>
                <PlanAccessProvider>
                    <PlanAccessProbe />
                </PlanAccessProvider>
            </QueryClientProvider>,
        );

        await waitFor(() => {
            expect(view.getByTestId('plan-access').props.children).toContain('none|ready|');
        });
        expect(view.getByTestId('plan-access').props.children).toContain('دسترسی آفلاین معتبری');
        expect(fetchCurrentPlan).not.toHaveBeenCalled();
    });

    it('marks guest access from cache as offline after a temporary catalog failure', async () => {
        mockServerStatus = 'connected';
        mockIsGuest = true;
        jest.mocked(loadGuestPlanAccess).mockResolvedValue({
            plan: { key: 'free', name: 'رایگان', features: {} },
            validUntil: Date.now() + 60_000,
            isOffline: true,
        });

        const view = await render(
            <QueryClientProvider client={queryClient}>
                <PlanAccessProvider>
                    <PlanAccessProbe />
                </PlanAccessProvider>
            </QueryClientProvider>,
        );

        await waitFor(() => {
            expect(view.getByTestId('plan-access').props.children).toBe('رایگان|ready|');
            expect(view.getByTestId('plan-access-source').props.children).toBe('offline');
        });
        expect(loadGuestPlanAccess).toHaveBeenCalledTimes(1);
        expect(fetchCurrentPlan).not.toHaveBeenCalled();
    });
});
