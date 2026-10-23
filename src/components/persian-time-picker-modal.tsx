import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FontAwareButton as Button } from '@/components/font-aware-paper';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface PersianTimePickerModalProps {
    visible: boolean;
    value: string;
    title: string;
    onClose: () => void;
    onSelect: (value: string) => void;
    maxHours?: number;
    maxMinutesAtMaxHour?: number;
}

const persianDigits = '۰۱۲۳۴۵۶۷۸۹';
const latinDigits = '0123456789';

function normalizeDigits(value: string) {
    return value.replace(/[۰-۹]/g, (digit) => latinDigits[persianDigits.indexOf(digit)]);
}

function formatPersianNumber(value: number) {
    return String(value).replace(/\d/g, (digit) => persianDigits[Number(digit)]);
}

function parseTimeValue(value: string) {
    const normalized = normalizeDigits(value.trim());
    const match = normalized.match(/^(\d{1,2}):(\d{1,2})$/);

    if (!match) {
        return null;
    }

    const hours = Number(match[1]);
    const minutes = Number(match[2]);

    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
        return null;
    }

    if (hours < 0 || minutes < 0 || minutes >= 60) {
        return null;
    }

    return { hours, minutes };
}

function formatTimeValue(hours: number, minutes: number) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function PersianTimePickerModal({
    visible,
    value,
    title,
    onClose,
    onSelect,
    maxHours = 8,
    maxMinutesAtMaxHour = 59,
}: PersianTimePickerModalProps) {
    const theme = useTheme();
    const insets = useSafeAreaInsets();

    const initialTime = useMemo(() => parseTimeValue(value) ?? { hours: 1, minutes: 0 }, [value]);

    const [hours, setHours] = useState(initialTime.hours);
    const [minutes, setMinutes] = useState(initialTime.minutes);
    const [prevValue, setPrevValue] = useState(value);

    if (prevValue !== value) {
        const nextTime = parseTimeValue(value) ?? { hours: 1, minutes: 0 };
        setHours(nextTime.hours);
        setMinutes(nextTime.minutes);
        setPrevValue(value);
    }

    const hourOptions = useMemo(() => Array.from({ length: maxHours + 1 }, (_, index) => index), [maxHours]);
    const minuteOptions = useMemo(() => {
        const maxMinutes = hours === maxHours ? Math.min(59, Math.max(0, maxMinutesAtMaxHour)) : 59;
        return Array.from({ length: maxMinutes + 1 }, (_, index) => index);
    }, [hours, maxHours, maxMinutesAtMaxHour]);
    const selectedMinutes = hours === maxHours ? Math.min(minutes, maxMinutesAtMaxHour) : minutes;

    const handleConfirm = () => {
        const selected = formatTimeValue(hours, selectedMinutes);
        onSelect(selected);
        onClose();
    };

    return (
        <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
            <Pressable style={styles.overlay} onPress={onClose}>
                <Pressable
                    style={[styles.modalContent, { backgroundColor: theme.surfaceElevated, paddingBottom: Spacing.three + insets.bottom }]}
                    onPress={(event) => event.stopPropagation()}
                >
                    <View style={styles.handle} />

                    <View style={styles.header}>
                        <View style={styles.headerTextBlock}>
                            <ThemedText type="smallBold" style={styles.title}>
                                {title}
                            </ThemedText>
                            <ThemedText type="small" themeColor="textSecondary">
                                ساعت و دقیقه را انتخاب کنید
                            </ThemedText>
                        </View>
                        <Pressable onPress={onClose}>
                            <MaterialCommunityIcons name="close" size={20} color={theme.textSecondary} />
                        </Pressable>
                    </View>

                    <View style={[styles.pickerRow, { direction: 'ltr' }]}>
                        <View style={styles.pickerColumn}>
                            <View style={styles.labelContainer}>
                                <ThemedText type="smallBold" style={{ color: theme.textSecondary }}>
                                    ساعت
                                </ThemedText>
                            </View>
                            <ScrollView
                                style={styles.pickerList}
                                contentContainerStyle={styles.pickerContent}
                                showsVerticalScrollIndicator={false}
                            >
                                {hourOptions.map((option) => {
                                    const isSelected = option === hours;
                                    return (
                                        <Pressable
                                            key={`hour-${option}`}
                                            onPress={() => setHours(option)}
                                            style={[
                                                styles.option,
                                                {
                                                    backgroundColor: isSelected ? theme.primary : theme.surface,
                                                    borderColor: isSelected ? theme.primary : theme.border,
                                                },
                                            ]}
                                        >
                                            <ThemedText
                                                type="smallBold"
                                                style={{
                                                    color: isSelected ? theme.surface : theme.text,
                                                }}
                                            >
                                                {formatPersianNumber(option)}
                                            </ThemedText>
                                        </Pressable>
                                    );
                                })}
                            </ScrollView>
                        </View>

                        <View style={styles.pickerColumn}>
                            <View style={styles.labelContainer}>
                                <ThemedText type="smallBold" style={{ color: theme.textSecondary }}>
                                    دقیقه
                                </ThemedText>
                            </View>
                            <ScrollView
                                style={styles.pickerList}
                                contentContainerStyle={styles.pickerContent}
                                showsVerticalScrollIndicator={false}
                            >
                                {minuteOptions.map((option) => {
                                    const isSelected = option === selectedMinutes;
                                    return (
                                        <Pressable
                                            key={`minute-${option}`}
                                            onPress={() => setMinutes(option)}
                                            style={[
                                                styles.option,
                                                {
                                                    backgroundColor: isSelected ? theme.primary : theme.surface,
                                                    borderColor: isSelected ? theme.primary : theme.border,
                                                },
                                            ]}
                                        >
                                            <ThemedText
                                                type="smallBold"
                                                style={{
                                                    color: isSelected ? theme.surface : theme.text,
                                                }}
                                            >
                                                {formatPersianNumber(option)}
                                            </ThemedText>
                                        </Pressable>
                                    );
                                })}
                            </ScrollView>
                        </View>
                    </View>

                    <View style={[styles.previewBox, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}>
                        <ThemedText type="small" style={{ color: theme.textSecondary }}>
                            پیش‌نمایش زمان
                        </ThemedText>
                        <ThemedText type="bodyBold" style={{ color: theme.primaryText }}>
                            {formatTimeValue(hours, selectedMinutes).replace(/\d/g, (digit) => persianDigits[Number(digit)])}
                        </ThemedText>
                    </View>

                    <View style={styles.actionsRow}>
                        <Button
                            mode="outlined"
                            compact
                            onPress={onClose}
                            style={styles.actionButton}
                            labelStyle={styles.actionLabel}
                            textColor={theme.textSecondary}
                        >
                            لغو
                        </Button>
                        <Button
                            mode="contained"
                            compact
                            onPress={handleConfirm}
                            buttonColor={theme.primary}
                            textColor={theme.onPrimary}
                            style={styles.actionButton}
                            labelStyle={styles.actionLabel}
                        >
                            تأیید
                        </Button>
                    </View>
                </Pressable>
            </Pressable>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'flex-end',
        backgroundColor: 'rgba(0,0,0,0.4)',
    },
    modalContent: {
        borderTopLeftRadius: Radius.xl,
        borderTopRightRadius: Radius.xl,
        paddingBottom: Spacing.four,
        paddingHorizontal: Spacing.three,
        paddingTop: Spacing.three,
        maxHeight: '95%',
        display: 'flex',
        flexDirection: 'column',
    },
    handle: {
        width: 72,
        height: 5,
        borderRadius: 999,
        backgroundColor: '#ccc',
        alignSelf: 'center',
        marginBottom: Spacing.three,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: Spacing.two,
        gap: Spacing.two,
    },
    headerTextBlock: {
        flex: 1,
        gap: 4,
    },
    title: {
        fontSize: 16,
    },
    previewBox: {
        borderRadius: Radius.md,
        borderWidth: StyleSheet.hairlineWidth,
        padding: Spacing.two,
        alignItems: 'center',
        gap: Spacing.one,
        marginTop: Spacing.three,
    },
    previewLabel: {
        fontSize: 12,
    },
    previewValue: {
        fontSize: 18,
        fontFamily: 'AppFont-Bold',
    },
    pickerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: Spacing.two,
        marginTop: Spacing.three,
        height: 220,
    },
    pickerColumn: {
        flex: 1,
        gap: Spacing.two,
        minHeight: 0,
    },
    labelContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 24,
    },
    pickerList: {
        minHeight: 0,
        flex: 1,
    },
    pickerContent: {
        paddingBottom: Spacing.one,
    },
    option: {
        borderRadius: Radius.md,
        borderWidth: StyleSheet.hairlineWidth,
        paddingVertical: Spacing.one,
        paddingHorizontal: Spacing.one,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: Spacing.two,
        minHeight: 40,
    },
    actionsRow: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        alignItems: 'center',
        gap: Spacing.one,
        marginTop: Spacing.three,
    },
    actionButton: {
        minWidth: 56,
        borderRadius: Radius.md,
    },
    actionLabel: {
        fontSize: 12,
        lineHeight: 16,
    },
});
