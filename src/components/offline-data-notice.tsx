import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { useTheme } from '@/hooks/use-theme';

type ThemeColors = ReturnType<typeof useTheme>;

type OfflineDataNoticeProps = {
    theme: ThemeColors;
    message: string;
    details: readonly string[];
    hasSavedData?: boolean;
};

export function OfflineDataNotice({
    theme,
    message,
    details,
    hasSavedData = false,
}: OfflineDataNoticeProps) {
    const [expanded, setExpanded] = useState(false);

    return (
        <View
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            style={[styles.notice, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}
        >
            <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${message}؛ ${expanded ? 'بستن جزئیات' : 'نمایش جزئیات'}`}
                accessibilityState={{ expanded }}
                onPress={() => setExpanded((current) => !current)}
                style={({ pressed }) => [styles.header, { opacity: pressed ? 0.75 : 1 }]}
            >
                <MaterialCommunityIcons
                    name={hasSavedData ? 'database-clock-outline' : 'cloud-off-outline'}
                    size={16}
                    color={theme.warning}
                />
                <ThemedText
                    type="small"
                    numberOfLines={2}
                    style={[styles.message, { color: theme.textSecondary }]}
                >
                    {message}
                </ThemedText>
                <MaterialCommunityIcons
                    name={expanded ? 'chevron-up' : 'chevron-down'}
                    size={20}
                    color={theme.textSecondary}
                />
            </Pressable>
            {expanded ? (
                <View style={[styles.details, { borderTopColor: theme.border }]}>
                    {details.map((detail) => (
                        <View key={detail} style={styles.detailRow}>
                            <View style={[styles.bullet, { backgroundColor: theme.warning }]} />
                            <ThemedText type="small" style={[styles.detailText, { color: theme.textSecondary }]}>
                                {detail}
                            </ThemedText>
                        </View>
                    ))}
                </View>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    notice: {
        width: '100%',
        alignSelf: 'stretch',
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: 0,
        paddingHorizontal: Spacing.two,
    },
    header: {
        minHeight: 32,
        flexDirection: 'row',
        direction: 'rtl',
        alignItems: 'center',
        gap: Spacing.one,
        paddingVertical: Spacing.one,
    },
    message: {
        flex: 1,
        lineHeight: 20,
    },
    details: {
        gap: Spacing.one,
        borderTopWidth: StyleSheet.hairlineWidth,
        paddingTop: Spacing.two,
        paddingBottom: Spacing.one,
    },
    detailRow: {
        flexDirection: 'row',
        direction: 'rtl',
        alignItems: 'flex-start',
        gap: Spacing.two,
    },
    bullet: {
        width: 5,
        height: 5,
        borderRadius: 3,
        marginTop: 7,
    },
    detailText: {
        flex: 1,
        lineHeight: 20,
    },
});
