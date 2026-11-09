import { useEffect, useId, useMemo } from 'react';
import { usePathname } from 'expo-router';

import type { OfflinePageNoticeData } from '@/services/offline-page-status';
import { setOfflinePageNotice } from '@/services/offline-page-status';

export function useOfflinePageNotice(
    notice: OfflinePageNoticeData | null,
    enabled = true,
): void {
    const pathname = usePathname();
    const noticeId = useId();
    const message = notice?.message;
    const hasSavedData = notice?.hasSavedData;
    const detailsKey = JSON.stringify(notice?.details ?? []);
    const stableNotice = useMemo(() => {
        if (message === undefined) return null;
        return {
            message,
            details: JSON.parse(detailsKey) as string[],
            hasSavedData,
        };
    }, [detailsKey, hasSavedData, message]);

    useEffect(() => {
        if (!enabled || stableNotice === null) {
            setOfflinePageNotice(noticeId, pathname, null);
            return;
        }

        setOfflinePageNotice(noticeId, pathname, stableNotice);
        return () => setOfflinePageNotice(noticeId, pathname, null);
    }, [enabled, noticeId, pathname, stableNotice]);
}
