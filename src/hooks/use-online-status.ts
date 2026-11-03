import { onlineManager } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';

const subscribeToOnlineStatus = (onStoreChange: () => void) => onlineManager.subscribe(onStoreChange);
const getOnlineStatus = () => onlineManager.isOnline();
const getServerOnlineStatus = () => true;

export function useOnlineStatus(): boolean {
    return useSyncExternalStore(
        subscribeToOnlineStatus,
        getOnlineStatus,
        getServerOnlineStatus,
    );
}
