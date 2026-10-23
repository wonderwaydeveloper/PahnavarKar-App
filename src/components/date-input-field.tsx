import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

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
}: DateInputFieldProps) {
    const theme = useTheme();

    const displayValue = value
        ? formatValue ? formatValue(value) : value
        : placeholder;

    return (
        <View style={[styles.metricBox, { backgroundColor: theme.surfaceVariant }]}>
            <ThemedText type="small" style={[styles.sectionLabel, { color: theme.textSecondary }]}>
                {label}
            </ThemedText>

            <Pressable onPress={onPress}>
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
        fontSize: 12,
        lineHeight: 18,
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
    fieldValue: {
        flexShrink: 1,
        fontFamily: 'AppFont-Bold',
        fontSize: 13,
        lineHeight: 19,
        textAlign: 'right',
    },
    helperText: {
        fontSize: 10,
        lineHeight: 16,
        fontFamily: 'AppFont-Regular',
    },
});
