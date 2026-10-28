import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppTextInput } from '@/components/app-text';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { sanitizePhoneInput } from '@/services/iranian-phone';

interface IranianPhoneInputProps {
    accessibilityLabel: string;
    disabled?: boolean;
    error?: string;
    label?: string;
    onChangeText: (value: string) => void;
    onSubmitEditing?: () => void;
    returnKeyType?: 'done' | 'next' | 'search' | 'send';
    value: string;
}

export function IranianPhoneInput({
    accessibilityLabel,
    disabled = false,
    error,
    label,
    onChangeText,
    onSubmitEditing,
    returnKeyType = 'done',
    value,
}: IranianPhoneInputProps) {
    const theme = useTheme();
    const [focused, setFocused] = useState(false);

    return (
        <View style={styles.fieldGroup}>
            {label ? <ThemedText type="smallBold" style={styles.label}>{label}</ThemedText> : null}
            <View
                style={[
                    styles.inputCard,
                    {
                        backgroundColor: theme.surface,
                        borderColor: error ? theme.error : focused ? theme.primary : theme.border,
                    },
                ]}
            >
                <AppTextInput
                    accessibilityLabel={accessibilityLabel}
                    autoComplete="tel-national"
                    autoCorrect={false}
                    editable={!disabled}
                    keyboardType="phone-pad"
                    maxLength={20}
                    onBlur={() => setFocused(false)}
                    onChangeText={(input) => onChangeText(sanitizePhoneInput(input))}
                    onFocus={() => setFocused(true)}
                    onSubmitEditing={onSubmitEditing}
                    placeholder="9123456789"
                    placeholderTextColor={theme.textMuted}
                    returnKeyType={returnKeyType}
                    underlineColorAndroid="transparent"
                    value={value}
                    style={[styles.phoneInput, { color: theme.text, opacity: disabled ? 0.6 : 1 }]}
                />
                <View style={[styles.dialCode, { borderColor: theme.border }]}>
                    <ThemedText type="smallBold" style={{ color: theme.textSecondary }}>
                        +98
                    </ThemedText>
                </View>
            </View>
            {error ? (
                <ThemedText type="small" accessibilityRole="alert" style={{ color: theme.error }}>
                    {error}
                </ThemedText>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    fieldGroup: { gap: Spacing.one },
    label: { paddingHorizontal: Spacing.one },
    inputCard: {
        minHeight: 64,
        borderWidth: 1,
        borderRadius: Radius.md,
        paddingHorizontal: Spacing.three,
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.two,
    },
    dialCode: {
        minHeight: 32,
        borderStartWidth: 1,
        paddingStart: Spacing.two,
        alignItems: 'center',
        justifyContent: 'center',
    },
    phoneInput: {
        flex: 1,
        minHeight: 52,
        paddingVertical: 0,
        fontSize: 17,
        direction: 'ltr',
        writingDirection: 'ltr',
        textAlign: 'left',
    },
});
