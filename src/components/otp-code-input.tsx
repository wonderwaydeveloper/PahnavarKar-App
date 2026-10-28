import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppTextInput } from '@/components/app-text';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { normalizeOtpCode } from '@/services/iranian-phone';

interface OtpCodeInputProps {
    accessibilityLabel: string;
    disabled?: boolean;
    error?: string;
    label?: string;
    onChangeText: (value: string) => void;
    onComplete?: (value: string) => void;
    value: string;
}

export function OtpCodeInput({
    accessibilityLabel,
    disabled = false,
    error,
    label,
    onChangeText,
    onComplete,
    value,
}: OtpCodeInputProps) {
    const theme = useTheme();
    const [focused, setFocused] = useState(false);
    const lastCompletedCode = useRef<string | null>(null);

    const handleChange = (input: string) => {
        const code = normalizeOtpCode(input);
        onChangeText(code);

        if (code.length < 6) {
            lastCompletedCode.current = null;
        } else if (!disabled && code !== lastCompletedCode.current) {
            lastCompletedCode.current = code;
            onComplete?.(code);
        }
    };

    return (
        <View style={styles.fieldGroup}>
            {label ? <ThemedText type="smallBold" style={styles.label}>{label}</ThemedText> : null}
            <AppTextInput
                accessibilityLabel={accessibilityLabel}
                autoComplete="one-time-code"
                editable={!disabled}
                keyboardType="number-pad"
                maxLength={6}
                onBlur={() => setFocused(false)}
                onChangeText={handleChange}
                onFocus={() => setFocused(true)}
                placeholder="••••••"
                placeholderTextColor={theme.textMuted}
                textAlign="center"
                underlineColorAndroid="transparent"
                value={value}
                style={[
                    styles.codeInput,
                    {
                        backgroundColor: theme.surface,
                        borderColor: error ? theme.error : focused ? theme.primary : theme.border,
                        color: theme.text,
                        opacity: disabled ? 0.6 : 1,
                    },
                ]}
            />
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
    codeInput: {
        minHeight: 58,
        borderWidth: 1,
        borderRadius: Radius.md,
        paddingHorizontal: Spacing.three,
        fontSize: 24,
        letterSpacing: 8,
        direction: 'ltr',
        writingDirection: 'ltr',
        textAlign: 'center',
    },
});
