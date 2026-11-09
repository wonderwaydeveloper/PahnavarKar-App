import { getServerHealthCheckUrl } from '@/services/auth-api';

export type ServerConnectivityStatus =
    | 'connecting'
    | 'connected'
    | 'server-unavailable';

const HEALTH_CHECK_TIMEOUT_MS = 5000;
const HEALTH_CHECK_INTERVAL_MS = 5000;
const HEALTH_CHECK_RETRY_BASE_MS = 5000;
const HEALTH_CHECK_RETRY_MAX_MS = 30_000;

let status: ServerConnectivityStatus = 'connecting';
let appActive = false;
let checkTimer: ReturnType<typeof setTimeout> | null = null;
let activeController: AbortController | null = null;
let requestSequence = 0;
let consecutiveFailures = 0;

const listeners = new Set<() => void>();

function publishStatus(nextStatus: ServerConnectivityStatus) {
    if (status === nextStatus) return;
    status = nextStatus;
    listeners.forEach((listener) => listener());
}

function clearCheckTimer() {
    if (checkTimer) {
        clearTimeout(checkTimer);
        checkTimer = null;
    }
}

function cancelActiveRequest() {
    requestSequence += 1;
    activeController?.abort();
    activeController = null;
}

function scheduleCheck(delayMs: number) {
    clearCheckTimer();
    if (!appActive) return;
    checkTimer = setTimeout(() => {
        checkTimer = null;
        void checkServer();
    }, delayMs);
}

async function checkServer() {
    if (!appActive || activeController) return;

    const controller = new AbortController();
    const currentRequestSequence = ++requestSequence;
    activeController = controller;
    const timeout = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS);

    try {
        const healthUrl = getServerHealthCheckUrl();
        const cacheBuster = `${healthUrl.includes('?') ? '&' : '?'}_health_check=${Date.now()}`;
        const response = await fetch(`${healthUrl}${cacheBuster}`, {
            method: 'GET',
            headers: {
                Accept: 'application/json',
            },
            signal: controller.signal,
        });

        if (!response.ok) {
            throw new Error(`Server health check returned HTTP ${response.status}.`);
        }

        if (currentRequestSequence !== requestSequence) return;
        consecutiveFailures = 0;
        publishStatus('connected');
        scheduleCheck(HEALTH_CHECK_INTERVAL_MS);
    } catch {
        if (currentRequestSequence !== requestSequence) return;
        consecutiveFailures += 1;
        publishStatus('server-unavailable');
        const retryDelay = Math.min(
            HEALTH_CHECK_RETRY_BASE_MS * (2 ** (consecutiveFailures - 1)),
            HEALTH_CHECK_RETRY_MAX_MS,
        );
        scheduleCheck(retryDelay);
    } finally {
        clearTimeout(timeout);
        if (activeController === controller) {
            activeController = null;
        }
    }
}

export function getServerConnectivityStatus(): ServerConnectivityStatus {
    return status;
}

export function subscribeToServerConnectivity(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function setServerConnectivityAppActive(isActive: boolean) {
    if (appActive === isActive) {
        if (isActive && !activeController && !checkTimer && status !== 'connected') {
            void checkServer();
        }
        return;
    }

    appActive = isActive;

    if (!appActive) {
        clearCheckTimer();
        cancelActiveRequest();
        return;
    }

    publishStatus('connecting');
    consecutiveFailures = 0;
    void checkServer();
}

export function stopServerConnectivityMonitoring() {
    clearCheckTimer();
    cancelActiveRequest();
    appActive = false;
    consecutiveFailures = 0;
    publishStatus('connecting');
}
