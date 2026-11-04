import { Typography } from '@/constants/typography';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import type { useTheme } from '@/hooks/use-theme';

type ThemeColors = ReturnType<typeof useTheme>;

export type OfflineDataNoticeSource = {
    label: string;
    timestamp: number;
    kind: 'saved' | 'received';
};

type OfflineDataNoticeProps = {
    theme: ThemeColors;
    title: string;
    description?: string;
    sources?: readonly OfflineDataNoticeSource[];
    emptyMessage?: string;
    actionMessage?: string;
};

export function OfflineDataNotice({
    theme,
    title,
    description,
    sources = [],
    emptyMessage,
    actionMessage,
}: OfflineDataNoticeProps) {
    const validSources = sources.filter((source) => Number.isFinite(source.timestamp) && source.timestamp > 0);
    const hasSavedSource = validSources.some((source) => source.kind === 'saved');

    return (
        <View
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            style={[styles.notice, { backgroundColor: theme.surface, borderColor: theme.warning }]}
        >
            <View style={[styles.icon, { backgroundColor: theme.warningFill }]}>
                <MaterialCommunityIcons
                    name={hasSavedSource ? 'database-clock-outline' : 'wifi-off'}
                    size={20}
                    color={theme.onWarning}
                />
            </View>
            <View style={styles.content}>
                <ThemedText type="smallBold" style={{ color: theme.warning }}>
                    {title}
                </ThemedText>
                {description ? (
                    <ThemedText type="small" style={{ color: theme.textSecondary }}>
                        {description}
                    </ThemedText>
                ) : null}
                {validSources.map((source) => (
                    <ThemedText
                        key={source.label}
                        type="small"
                        style={[styles.source, { color: theme.textSecondary }]}
                    >
                        {source.label} · آخرین {source.kind === 'saved' ? 'ذخیره‌سازی' : 'دریافت'}: {new Date(source.timestamp).toLocaleString('fa-IR')}
                    </ThemedText>
                ))}
                {validSources.length === 0 && emptyMessage ? (
                    <ThemedText type="small" style={{ color: theme.textSecondary }}>
                        {emptyMessage}
                    </ThemedText>
                ) : null}
                {actionMessage ? (
                    <>
                        <View style={[styles.divider, { backgroundColor: theme.border }]} />
                        <View style={styles.actionRow}>
                            <MaterialCommunityIcons name="lock-outline" size={16} color={theme.textSecondary} />
                            <ThemedText type="small" style={[styles.actionText, { color: theme.textSecondary }]}>
                                {actionMessage}
                            </ThemedText>
                        </View>
                    </>
                ) : null}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    notice: {
        flexDirection: 'row',
        direction: 'rtl',
        alignItems: 'flex-start',
        gap: Spacing.two,
        borderWidth: 1,
        borderRadius: Radius.lg,
        padding: Spacing.three,
    },
    icon: {
        width: 36,
        height: 36,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: Radius.md,
    },
    content: {
        flex: 1,
        gap: Spacing.one,
    },
    source: {
        lineHeight: Typography.lineHeight.caption,
    },
    divider: {
        height: StyleSheet.hairlineWidth,
        marginVertical: Spacing.half,
    },
    actionRow: {
        flexDirection: 'row',
        direction: 'rtl',
        alignItems: 'flex-start',
        gap: Spacing.one,
    },
    actionText: {
        flex: 1,
        lineHeight: Typography.lineHeight.caption,
    },
});
