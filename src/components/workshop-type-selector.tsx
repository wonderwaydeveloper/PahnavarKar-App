import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { EntitledSeniorityWorkshopType } from '@/utils/salary-calculation';

interface WorkshopTypeSelectorProps {
    value: EntitledSeniorityWorkshopType;
    onValueChange: (value: EntitledSeniorityWorkshopType) => void;
}

export const WORKSHOP_TYPE_OPTIONS: { value: EntitledSeniorityWorkshopType; label: string }[] = [
    { value: 'unclassified', label: 'فاقد طرح طبقه‌بندی' },
    { value: 'classified', label: 'دارای طرح طبقه‌بندی' },
];

export function getWorkshopTypeLabel(value: EntitledSeniorityWorkshopType) {
    return WORKSHOP_TYPE_OPTIONS.find((option) => option.value === value)?.label ?? '';
}

export function WorkshopTypeSelector({ value, onValueChange }: WorkshopTypeSelectorProps) {
    const theme = useTheme();

    return (
        <View style={[styles.container, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}>
            <ThemedText type="small" style={[styles.title, { color: theme.textSecondary }]}>
                نوع کارگاه
            </ThemedText>
            <View style={styles.optionsRow}>
                {WORKSHOP_TYPE_OPTIONS.map((option) => {
                    const isSelected = value === option.value;

                    return (
                        <Pressable
                            key={option.value}
                            onPress={() => onValueChange(option.value)}
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
        borderWidth: StyleSheet.hairlineWidth,
    },
    optionLabel: {
        flexShrink: 1,
        fontFamily: 'AppFont-Bold',
        fontSize: 12,
        lineHeight: 18,
        textAlign: 'center',
    },
});