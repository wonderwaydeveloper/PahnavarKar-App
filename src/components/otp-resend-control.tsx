import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface OtpResendControlProps {
    disabled?: boolean;
    label?: string;
    onPress: () => void;
    secondsRemaining: number;
}

export function OtpResendControl({
    disabled = false,
    label = 'ارسال دوبارهٔ کد',
    onPress,
    secondsRemaining,
}: OtpResendControlProps) {
    const theme = useTheme();
    const waiting = secondsRemaining > 0;

    if (waiting) {
        return (
            <View style={styles.control} accessibilityRole="text">
                <ThemedText type="smallBold" style={{ color: theme.textMuted }}>
                    ارسال دوبارهٔ کد تا {secondsRemaining} ثانیه
                </ThemedText>
            </View>
        );
    }

    return (
        <Pressable
            accessibilityRole="button"
            disabled={disabled}
            onPress={onPress}
            style={({ pressed }) => [styles.control, { opacity: disabled || pressed ? 0.65 : 1 }]}
        >
            <ThemedText type="smallBold" style={{ color: disabled ? theme.textMuted : theme.primaryText }}>
                {disabled ? 'در حال ارسال...' : label}
            </ThemedText>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    control: { minHeight: 40, alignItems: 'center', justifyContent: 'center', paddingVertical: Spacing.one },
});
