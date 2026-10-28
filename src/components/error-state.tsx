import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useTheme } from '@/hooks/use-theme';

interface ErrorStateProps {
    message: string;
    title?: string;
    onRetry?: () => void;
    retryLabel?: string;
}

export function ErrorState({
    message,
    title = 'مشکلی پیش آمد',
    onRetry,
    retryLabel = 'تلاش دوباره',
}: ErrorStateProps) {
    const theme = useTheme();

    return (
        <ThemedView style={styles.container} accessibilityRole="alert">
            <View style={[styles.icon, { backgroundColor: theme.errorFill }]}>
                <MaterialCommunityIcons name="alert-circle-outline" size={30} color={theme.onError} />
            </View>
            <ThemedText type="bodyBold" style={styles.title}>{title}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.message}>{message}</ThemedText>
            {onRetry ? (
                <Pressable
                    accessibilityRole="button"
                    onPress={onRetry}
                    style={({ pressed }) => [
                        styles.retryButton,
                        { backgroundColor: theme.primary, opacity: pressed ? 0.8 : 1 },
                    ]}
                >
                    <ThemedText type="smallBold" style={{ color: theme.onPrimary }}>{retryLabel}</ThemedText>
                </Pressable>
            ) : null}
        </ThemedView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 14,
        padding: 24,
    },
    icon: {
        width: 56,
        height: 56,
        borderRadius: 28,
        alignItems: 'center',
        justifyContent: 'center',
    },
    title: {
        textAlign: 'center',
    },
    message: {
        maxWidth: 420,
        textAlign: 'center',
        lineHeight: 24,
    },
    retryButton: {
        minHeight: 44,
        minWidth: 140,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 12,
        paddingHorizontal: 20,
        marginTop: 4,
    },
});
