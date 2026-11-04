import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ErrorNoticeCardProps = {
    message: string;
    onRetry: () => void;
    retryLabel?: string;
    busy?: boolean;
    busyLabel?: string;
    title?: string;
    tone?: 'error' | 'warning';
    style?: StyleProp<ViewStyle>;
};

export function ErrorNoticeCard({
    message,
    onRetry,
    retryLabel = 'تلاش دوباره',
    busy = false,
    busyLabel,
    title,
    tone = 'error',
    style,
}: ErrorNoticeCardProps) {
    const theme = useTheme();
    const accentColor = tone === 'error' ? theme.error : theme.warning;

    return (
        <View style={[styles.card, style, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <MaterialCommunityIcons name="alert-circle-outline" size={30} color={accentColor} />
            {title ? <ThemedText type="smallBold" style={{ color: theme.text }}>{title}</ThemedText> : null}
            <ThemedText type="small" style={[styles.message, { color: accentColor }]} accessibilityRole="alert">
                {message}
            </ThemedText>
            <Pressable
                accessibilityRole="button"
                disabled={busy}
                onPress={onRetry}
                style={({ pressed }) => [
                    styles.retryButton,
                    { backgroundColor: theme.primary, opacity: pressed || busy ? 0.7 : 1 },
                ]}
            >
                {busy ? <ActivityIndicator size="small" color={theme.onPrimary} /> : null}
                <ThemedText type="smallBold" style={{ color: theme.onPrimary }}>
                    {busy && busyLabel ? busyLabel : retryLabel}
                </ThemedText>
            </Pressable>
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        alignItems: 'center',
        gap: Spacing.two,
        borderWidth: 1,
        borderRadius: Radius.lg,
        padding: Spacing.four,
    },
    message: {
        textAlign: 'center',
    },
    retryButton: {
        minHeight: 40,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: Spacing.one,
        borderRadius: Radius.md,
        paddingHorizontal: Spacing.four,
        paddingVertical: Spacing.two,
        marginTop: Spacing.one,
    },
});
