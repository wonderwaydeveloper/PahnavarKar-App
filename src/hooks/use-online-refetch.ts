import { onlineManager } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

export function useOnlineRefetch(onReconnect: () => void, enabled = true): void {
    const callbackRef = useRef(onReconnect);
    const wasOnlineRef = useRef(onlineManager.isOnline());

    useEffect(() => {
        callbackRef.current = onReconnect;
    }, [onReconnect]);

    useEffect(() => {
        wasOnlineRef.current = onlineManager.isOnline();

        const unsubscribe = onlineManager.subscribe((isOnline) => {
            if (isOnline === wasOnlineRef.current) return;

            const wasOnline = wasOnlineRef.current;
            wasOnlineRef.current = isOnline;
            if (enabled && wasOnline === false && isOnline) {
                callbackRef.current();
            }
        });

        return unsubscribe;
    }, [enabled]);
}
