import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface SettlementThrough1391FieldProps {
    checked: boolean;
    enabled: boolean;
    onChange: (checked: boolean) => void;
}

export function SettlementThrough1391Field({ checked, enabled, onChange }: SettlementThrough1391FieldProps) {
    const theme = useTheme();
    const options = [
        { value: true, label: 'تصفیه حساب شده' },
        { value: false, label: 'تصفیه حساب نشده' },
    ];

    if (!enabled) {
        return null;
    }

    return (
        <View style={[styles.container, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}>
            <ThemedText type="small" style={[styles.title, { color: theme.textSecondary }]}>
                وضعیت تصفیه حساب تا پایان سال ۱۳۹۱
            </ThemedText>
            <View style={styles.optionsRow}>
                {options.map((option) => {
                    const isSelected = checked === option.value;

                    return (
                        <Pressable
                            key={option.label}
                            onPress={() => onChange(option.value)}
                            accessibilityRole="radio"
                            accessibilityState={{ checked: isSelected }}
                            accessibilityLabel={option.label}
                            style={[
                                styles.optionButton,
                                {
                                    backgroundColor: theme.surface,
                                    borderColor: isSelected ? theme.primary : theme.border,
                                    borderWidth: isSelected ? 1.5 : StyleSheet.hairlineWidth,
                                },
                            ]}
                        >
                            <MaterialCommunityIcons
                                name={isSelected ? 'radiobox-marked' : 'radiobox-blank'}
                                size={20}
                                color={isSelected ? theme.primaryText : theme.textSecondary}
                            />
                            <ThemedText
                                type="smallBold"
                                style={[styles.optionLabel, { color: isSelected ? theme.primaryText : theme.text }]}
                            >
                                {option.label}
                            </ThemedText>
                        </Pressable>
                    );
                })}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        gap: Spacing.two,
        padding: Spacing.two,
        borderRadius: 12,
        borderWidth: StyleSheet.hairlineWidth,
    },
    title: {
        fontSize: 12,
        lineHeight: 18,
        fontFamily: 'AppFont-Medium',
    },
    optionsRow: {
        width: '100%',
        flexDirection: 'row',
        gap: Spacing.two,
    },
    optionButton: {
        flex: 1,
        minWidth: 0,
        minHeight: 48,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: Spacing.one,
        paddingHorizontal: Spacing.one,
        borderRadius: 10,
    },
    optionLabel: {
        flexShrink: 1,
        fontFamily: 'AppFont-Bold',
        fontSize: 12,
        lineHeight: 18,
        textAlign: 'center',
    },
});