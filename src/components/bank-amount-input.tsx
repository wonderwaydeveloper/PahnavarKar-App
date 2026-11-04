import { Typography } from '@/constants/typography';
import { useState } from 'react';
import { StyleSheet, View, type TextInputProps } from 'react-native';

import { NumericInputField } from '@/components/numeric-input-field';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type BankAmountInputProps = Pick<TextInputProps, 'accessibilityLabel' | 'editable'> & {
    onChangeText: (value: string) => void;
    value: string;
};

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_INDIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

function formatAmount(value: string): string {
    const normalized = value
        .replace(/[۰-۹]/g, (digit) => String(PERSIAN_DIGITS.indexOf(digit)))
        .replace(/[٠-٩]/g, (digit) => String(ARABIC_INDIC_DIGITS.indexOf(digit)))
        .replace(/[^\d]/g, '');
    if (!normalized) return '';

    const amount = Number(normalized);
    return Number.isSafeInteger(amount)
        ? new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 0 }).format(amount)
        : value;
}

export function BankAmountInput({
    accessibilityLabel,
    editable = true,
    onChangeText,
    value,
}: BankAmountInputProps) {
    const theme = useTheme();
    const [isFocused, setIsFocused] = useState(false);

    return (
        <View
            style={[
                styles.container,
                {
                    backgroundColor: theme.surfaceElevated,
                    borderColor: theme.border,
                    opacity: editable ? 1 : 0.6,
                },
            ]}
        >
            <NumericInputField
                accessibilityLabel={accessibilityLabel}
                editable={editable}
                mode="integer"
                onBlur={() => setIsFocused(false)}
                onChangeText={onChangeText}
                onFocus={() => setIsFocused(true)}
                placeholder="مبلغ به تومان"
                placeholderTextColor={theme.textMuted}
                selectTextOnFocus={false}
                style={[styles.input, { color: theme.text }]}
                value={isFocused ? value : formatAmount(value)}
            />
            <View style={[styles.currency, { borderLeftColor: theme.border }]}>
                <ThemedText type="smallBold" style={{ color: theme.textSecondary }}>تومان</ThemedText>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        minHeight: 52,
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderRadius: Radius.md,
        paddingHorizontal: Spacing.two,
        direction: 'ltr',
    },
    input: {
        flex: 1,
        minWidth: 0,
        minHeight: 48,
        paddingVertical: 0,
        fontSize: Typography.fontSize.bodyLarge,
        textAlign: 'center',
        writingDirection: 'ltr',
    },
    currency: {
        minHeight: 32,
        justifyContent: 'center',
        borderLeftWidth: StyleSheet.hairlineWidth,
        paddingLeft: Spacing.two,
    },
});
