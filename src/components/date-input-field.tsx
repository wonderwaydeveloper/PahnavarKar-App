import { Typography } from '@/constants/typography';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface DateInputFieldProps {
    label: string;
    value: string;
    placeholder?: string;
    onPress: () => void;
    formatValue?: (value: string) => string;
    compact?: boolean;
    iconName?: ComponentProps<typeof MaterialCommunityIcons>['name'];
    helperText?: string;
    accessibilityLabel?: string;
    onClear?: () => void;
    containerStyle?: StyleProp<ViewStyle>;
}

export function DateInputField({
    label,
    value,
    placeholder = 'انتخاب تاریخ',
    onPress,
    formatValue,
    compact = false,
    iconName = 'calendar-month-outline',
    helperText,
    accessibilityLabel,
    onClear,
    containerStyle,
}: DateInputFieldProps) {
    const theme = useTheme();

    const displayValue = value
        ? formatValue ? formatValue(value) : value
        : placeholder;

    return (
        <View style={[styles.metricBox, containerStyle, { backgroundColor: theme.surfaceVariant }]}>
            <ThemedText type="small" style={[styles.sectionLabel, { color: theme.textSecondary }]}>
                {label}
            </ThemedText>

            <View style={styles.inputRow}>
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={accessibilityLabel ?? `${label}، ${displayValue}`}
                    onPress={onPress}
                    style={{ flex: 1 }}
                >
                    <View
                        style={[
                            styles.dateInput,
                            {
                                backgroundColor: theme.surface,
                                borderColor: theme.border,
                                minHeight: compact ? 40 : 44,
                            },
                        ]}
                    >
                        <ThemedText
                            type={compact ? 'small' : 'smallBold'}
                            style={[styles.fieldValue, { color: value ? theme.text : theme.textSecondary }]}
                            numberOfLines={1}
                        >
                            {displayValue}
                        </ThemedText>

                        <MaterialCommunityIcons name={iconName} size={18} color={theme.primaryText} />
                    </View>
                </Pressable>
                {onClear ? (
                    <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`پاک کردن ${label}`}
                        onPress={onClear}
                        style={[styles.clearButton, { backgroundColor: theme.surface, borderColor: theme.border }]}
                    >
                        <MaterialCommunityIcons name="close" size={16} color={theme.textSecondary} />
                    </Pressable>
                ) : null}
            </View>

            {helperText ? (
                <ThemedText type="small" style={[styles.helperText, { color: theme.textSecondary }]}>
                    {helperText}
                </ThemedText>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    metricBox: {
        flex: 1,
        borderRadius: 12,
        padding: Spacing.two,
        gap: Spacing.one,
    },
    sectionLabel: {
        fontSize: Typography.fontSize.footnote,
        lineHeight: Typography.lineHeight.caption,
        fontFamily: 'AppFont-Medium',
    },
    dateInput: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: Spacing.two,
        paddingVertical: Spacing.two,
        borderRadius: 8,
        borderWidth: 1,
    },
    inputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.one,
    },
    clearButton: {
        width: 36,
        height: 36,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 10,
        borderWidth: StyleSheet.hairlineWidth,
    },
    fieldValue: {
        flexShrink: 1,
        fontFamily: 'AppFont-Bold',
        fontSize: Typography.fontSize.compact,
        lineHeight: Typography.lineHeight.bodyCompact,
        textAlign: 'right',
    },
    helperText: {
        fontSize: Typography.fontSize.tiny,
        lineHeight: Typography.lineHeight.tight,
        fontFamily: 'AppFont-Regular',
    },
});
