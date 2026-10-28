import { onlineManager } from '@tanstack/react-query';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function NetworkStatusBanner() {
    const theme = useTheme();
    const [isOnline, setIsOnline] = useState(() => onlineManager.isOnline());

    useEffect(() => onlineManager.subscribe(setIsOnline), []);

    if (isOnline) {
        return null;
    }

    return (
        <View
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            style={[styles.banner, { backgroundColor: theme.warningFill }]}
        >
            <MaterialCommunityIcons name="wifi-off" size={20} color={theme.onWarning} />
            <ThemedText type="small" style={[styles.message, { color: theme.onWarning }]}>
                اتصال اینترنت برقرار نیست؛ قابلیت‌های وابسته به سرور موقتاً در دسترس نیستند.
            </ThemedText>
        </View>
    );
}

const styles = StyleSheet.create({
    banner: {
        minHeight: 44,
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.two,
        paddingHorizontal: Spacing.four,
        paddingVertical: Spacing.two,
    },
    message: {
        flex: 1,
        textAlign: 'right',
    },
});
