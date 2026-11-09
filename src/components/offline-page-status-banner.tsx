import { usePathname } from 'expo-router';
import { useSyncExternalStore } from 'react';
import { StyleSheet, View } from 'react-native';

import { OfflineDataNotice } from '@/components/offline-data-notice';
import { useTheme } from '@/hooks/use-theme';
import {
    getOfflinePageNotices,
    subscribeToOfflinePageNotices,
} from '@/services/offline-page-status';

export function OfflinePageStatusBanner() {
    const pathname = usePathname();
    const theme = useTheme();
    const notices = useSyncExternalStore(
        subscribeToOfflinePageNotices,
        getOfflinePageNotices,
        getOfflinePageNotices,
    );
    const notice = notices.find((entry) => entry.pathname === pathname);

    if (!notice) return null;

    return (
        <View style={styles.container}>
            <OfflineDataNotice
                theme={theme}
                message={notice.message}
                details={notice.details}
                hasSavedData={notice.hasSavedData}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        width: '100%',
    },
});
