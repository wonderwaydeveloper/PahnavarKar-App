import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useState, useSyncExternalStore, type ComponentProps } from 'react';
import { Animated, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
    getServerConnectivityStatus,
    subscribeToServerConnectivity,
    type ServerConnectivityStatus,
} from '@/services/server-connectivity';

const NOTICE_FADE_IN_DURATION_MS = 180;
const NOTICE_FADE_OUT_DURATION_MS = 120;

export function NetworkStatusBanner() {
    const theme = useTheme();
    const [opacity] = useState(() => new Animated.Value(0));
    const status = useSyncExternalStore(
        subscribeToServerConnectivity,
        getServerConnectivityStatus,
        getServerConnectivityStatus,
    );
    const [displayedStatus, setDisplayedStatus] = useState<Exclude<ServerConnectivityStatus, 'connected'> | null>(
        () => status === 'connected' ? null : status,
    );

    useEffect(() => {
        if (status === 'connected') {
            const animation = Animated.timing(opacity, {
                toValue: 0,
                duration: NOTICE_FADE_OUT_DURATION_MS,
                useNativeDriver: true,
            });
            animation.start(({ finished }) => {
                if (finished) setDisplayedStatus(null);
            });
            return () => animation.stop();
        }

        const animation = Animated.timing(opacity, {
            toValue: 1,
            duration: NOTICE_FADE_IN_DURATION_MS,
            useNativeDriver: true,
        });
        animation.start(({ finished }) => {
            if (finished) setDisplayedStatus(status);
        });
        return () => animation.stop();
    }, [status, opacity]);

    const visibleStatus = status === 'connected' ? displayedStatus : status;
    if (visibleStatus === null) {
        return null;
    }

    const noticeConfig: Record<Exclude<ServerConnectivityStatus, 'connected'>, { message: string; icon: ComponentProps<typeof MaterialCommunityIcons>['name']; backgroundColor: string; textColor: string }> = {
        connecting: {
            message: 'در حال اتصال به سرور…',
            icon: 'cloud-sync-outline',
            backgroundColor: theme.infoFill,
            textColor: theme.onInfo,
        },
        'server-unavailable': {
            message: 'ارتباط با سرور برقرار نیست',
            icon: 'cloud-alert',
            backgroundColor: theme.errorFill,
            textColor: theme.onErrorFill,
        },
    };
    const config = noticeConfig[visibleStatus];

    return (
        <Animated.View
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            accessibilityLabel={config.message}
            style={[
                styles.banner,
                {
                    backgroundColor: config.backgroundColor,
                    opacity,
                },
            ]}
        >
            <MaterialCommunityIcons name={config.icon} size={14} color={config.textColor} />
            <ThemedText
                type="smallBold"
                numberOfLines={1}
                style={{ color: config.textColor }}
            >
                {config.message}
            </ThemedText>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    banner: {
        minHeight: 28,
        width: '100%',
        alignSelf: 'stretch',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: Spacing.one,
        paddingHorizontal: Spacing.one,
        paddingVertical: 0,
        borderRadius: 0,
    },
});
