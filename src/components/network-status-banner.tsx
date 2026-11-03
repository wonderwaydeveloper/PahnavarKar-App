import { onlineManager } from '@tanstack/react-query';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const RECONNECTED_MESSAGE_DURATION_MS = 3000;
const NOTICE_FADE_DURATION_MS = 220;

type NetworkNotice = 'online' | 'offline' | 'reconnected';

export function NetworkStatusBanner() {
    const theme = useTheme();
    const [opacity] = useState(() => new Animated.Value(0));
    const [notice, setNotice] = useState<NetworkNotice>(() => (
        onlineManager.isOnline() ? 'online' : 'offline'
    ));
    const wasOnline = useRef(onlineManager.isOnline());
    const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        const unsubscribe = onlineManager.subscribe((isOnline) => {
            if (isOnline === wasOnline.current) {
                return;
            }

            wasOnline.current = isOnline;
            if (reconnectTimer.current) {
                clearTimeout(reconnectTimer.current);
                reconnectTimer.current = null;
            }

            if (!isOnline) {
                setNotice('offline');
                return;
            }

            setNotice('reconnected');
            reconnectTimer.current = setTimeout(() => {
                Animated.timing(opacity, {
                    toValue: 0,
                    duration: NOTICE_FADE_DURATION_MS,
                    useNativeDriver: true,
                }).start(({ finished }) => {
                    if (finished && wasOnline.current) {
                        setNotice('online');
                    }
                });
                reconnectTimer.current = null;
            }, RECONNECTED_MESSAGE_DURATION_MS);
        });

        return () => {
            unsubscribe();
            if (reconnectTimer.current) {
                clearTimeout(reconnectTimer.current);
            }
        };
    }, [opacity]);

    useEffect(() => {
        if (notice === 'online') {
            opacity.setValue(0);
            return;
        }

        Animated.timing(opacity, {
            toValue: 1,
            duration: NOTICE_FADE_DURATION_MS,
            useNativeDriver: true,
        }).start();
    }, [notice, opacity]);

    if (notice === 'online') {
        return null;
    }

    const isOffline = notice === 'offline';
    const message = isOffline ? 'اتصال اینترنتی ندارید' : 'دوباره متصل شدید';

    return (
        <Animated.View
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            accessibilityLabel={message}
            style={[
                styles.banner,
                {
                    backgroundColor: isOffline ? theme.warningFill : theme.successFill,
                    opacity,
                },
            ]}
        >
            <MaterialCommunityIcons
                name={isOffline ? 'wifi-off' : 'wifi'}
                size={14}
                color={isOffline ? theme.onWarning : theme.onSuccess}
            />
            <ThemedText
                type="smallBold"
                numberOfLines={1}
                style={{ color: isOffline ? theme.onWarning : theme.onSuccess }}
            >
                {message}
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
