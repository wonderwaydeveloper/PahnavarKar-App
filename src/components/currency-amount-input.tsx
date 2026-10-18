import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { NumericInputField } from '@/components/numeric-input-field';
import type { CurrencyPreference } from '@/context/app.context';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const AMOUNT_STEP = 100_000;
const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_INDIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const LATIN_DIGITS = '0123456789';

interface CurrencyAmountInputProps {
    accessibilityLabel: string;
    currencyPreference: CurrencyPreference;
    onChangeText: (value: string) => void;
    value: string;
}

function parseAmount(value: string) {
    const normalized = value
        .replace(/[۰-۹]/g, (digit) => LATIN_DIGITS[PERSIAN_DIGITS.indexOf(digit)])
        .replace(/[٠-٩]/g, (digit) => LATIN_DIGITS[ARABIC_INDIC_DIGITS.indexOf(digit)])
        .replace(/[٬,]/g, '');
    return Number(normalized);
}

function toPersianDigits(value: number) {
    return String(value).replace(/\d/g, (digit) => PERSIAN_DIGITS[Number(digit)]);
}

function formatAmount(value: string) {
    const amount = parseAmount(value);
    return Number.isSafeInteger(amount) && amount >= 0
        ? new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 0 }).format(amount)
        : value;
}

export function CurrencyAmountInput({
    accessibilityLabel,
    currencyPreference,
    onChangeText,
    value,
}: CurrencyAmountInputProps) {
    const theme = useTheme();
    const [isFocused, setIsFocused] = useState(false);
    const amount = parseAmount(value);
    const maximumAmount = currencyPreference === 'toman'
        ? Math.floor(Number.MAX_SAFE_INTEGER / 10)
        : Number.MAX_SAFE_INTEGER;
    const amountIsValid = Number.isSafeInteger(amount) && amount >= 0 && amount <= maximumAmount;

    const updateAmount = (nextAmount: number) => {
        onChangeText(toPersianDigits(nextAmount));
    };

    return (
        <View style={[styles.stepper, { backgroundColor: theme.surface, borderColor: theme.border, direction: 'ltr' }]}>
            <Pressable
                onPress={() => updateAmount(Math.max(0, (amountIsValid ? amount : 0) - AMOUNT_STEP))}
                disabled={!amountIsValid || amount <= 0}
                style={({ pressed }) => [
                    styles.stepperButton,
                    { backgroundColor: pressed ? theme.primaryContainer : theme.surfaceVariant },
                    (!amountIsValid || amount <= 0) && styles.stepperButtonDisabled,
                ]}
                accessibilityRole="button"
                accessibilityLabel="کاهش مبلغ پرداخت‌شده"
            >
                <MaterialCommunityIcons name="minus" size={20} color={theme.primary} />
            </Pressable>
            <NumericInputField
                value={isFocused ? value : formatAmount(value)}
                onChangeText={onChangeText}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                mode="integer"
                placeholder="۰"
                placeholderTextColor={theme.textMuted}
                selectionColor={theme.primary}
                style={[styles.stepperInput, { color: theme.text }]}
                textAlign="center"
                accessibilityLabel={accessibilityLabel}
            />
            <Pressable
                onPress={() => updateAmount((amountIsValid ? amount : 0) + AMOUNT_STEP)}
                disabled={!amountIsValid || amount > maximumAmount - AMOUNT_STEP}
                style={({ pressed }) => [
                    styles.stepperButton,
                    { backgroundColor: pressed ? theme.primaryContainer : theme.surfaceVariant },
                    (!amountIsValid || amount > maximumAmount - AMOUNT_STEP) && styles.stepperButtonDisabled,
                ]}
                accessibilityRole="button"
                accessibilityLabel="افزایش مبلغ پرداخت‌شده"
            >
                <MaterialCommunityIcons name="plus" size={20} color={theme.primary} />
            </Pressable>
        </View>
    );
}

const styles = StyleSheet.create({
    stepper: {
        minHeight: 50,
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 12,
        borderWidth: StyleSheet.hairlineWidth,
        padding: Spacing.one,
        gap: Spacing.one,
    },
    stepperButton: {
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 10,
    },
    stepperButtonDisabled: {
        opacity: 0.4,
    },
    stepperInput: {
        flex: 1,
        minHeight: 42,
        paddingVertical: 0,
        fontFamily: 'AppFont-Bold',
        fontSize: 14,
    },
});
