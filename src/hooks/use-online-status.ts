import { onlineManager } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import {
    getServerConnectivityStatus,
    subscribeToServerConnectivity,
    type ServerConnectivityStatus,
} from '@/services/server-connectivity';

const subscribeToOnlineStatus = (onStoreChange: () => void) => onlineManager.subscribe(onStoreChange);
const getOnlineStatus = () => onlineManager.isOnline();
const getServerOnlineStatus = () => true;
const subscribeToServerStatus = (onStoreChange: () => void) => subscribeToServerConnectivity(onStoreChange);
const getServerStatus = (): ServerConnectivityStatus => getServerConnectivityStatus();

export function useOnlineStatus(): boolean {
    return useSyncExternalStore(
        subscribeToOnlineStatus,
        getOnlineStatus,
        getServerOnlineStatus,
    );
}

export function useServerConnectivityStatus(): ServerConnectivityStatus {
    return useSyncExternalStore(
        subscribeToServerStatus,
        getServerStatus,
        getServerStatus,
    );
}
