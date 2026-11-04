import { Typography } from '@/constants/typography';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { isLeapJalaaliYear, isValidJalaaliDate, toJalaali } from 'jalaali-js';
import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FontAwareButton as Button } from '@/components/font-aware-paper';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface PersianDatePickerModalProps {
  visible: boolean;
  value: string;
  title: string;
  onClose: () => void;
  onSelect: (value: string) => void;
  availableYears?: number[];
  showTodayButton?: boolean;
}

const persianDigits = '۰۱۲۳۴۵۶۷۸۹';
const latinDigits = '0123456789';
const persianMonthNames = [
  'فروردین',
  'اردیبهشت',
  'خرداد',
  'تیر',
  'مرداد',
  'شهریور',
  'مهر',
  'آبان',
  'آذر',
  'دی',
  'بهمن',
  'اسفند',
];

function normalizeDigits(value: string) {
  return value.replace(/[۰-۹]/g, (digit) => latinDigits[persianDigits.indexOf(digit)]);
}

function formatPersianNumber(value: number) {
  return String(value).replace(/\d/g, (digit) => persianDigits[Number(digit)]);
}

function formatPersianMonthName(month: number) {
  return persianMonthNames[month - 1] ?? '';
}

function parseDateValue(value: string) {
  const normalized = normalizeDigits(value.trim());
  const match = normalized.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/);

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }

  if (month < 1 || month > 12) {
    return null;
  }

  if (!isValidJalaaliDate(year, month, day)) {
    return null;
  }

  return { year, month, day };
}

function formatDateValue(year: number, month: number, day: number) {
  return `${year}/${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}`;
}

function getPersianDaysInMonth(year: number, month: number) {
  if (month <= 6) {
    return 31;
  }

  if (month <= 11) {
    return 30;
  }

  return isLeapJalaaliYear(year) ? 30 : 29;
}

export function PersianDatePickerModal({
  visible,
  value,
  title,
  onClose,
  onSelect,
  availableYears = [],
  showTodayButton = false,
}: PersianDatePickerModalProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const currentJalaliDate = useMemo(() => {
    const today = new Date();
    return toJalaali(today.getFullYear(), today.getMonth() + 1, today.getDate());
  }, []);

  const currentYear = currentJalaliDate.jy;
  const currentMonth = currentJalaliDate.jm;
  const currentDay = currentJalaliDate.jd;

  const fallbackYear = useMemo(() => {
    if (availableYears.length > 0) {
      return availableYears[availableYears.length - 1];
    }
    return currentYear;
  }, [availableYears, currentYear]);

  const initialDate = useMemo(
    () => parseDateValue(value) ?? { year: fallbackYear, month: currentMonth, day: currentDay },
    [currentDay, currentMonth, fallbackYear, value]
  );

  const [year, setYear] = useState(initialDate.year);
  const [month, setMonth] = useState(initialDate.month);
  const [day, setDay] = useState(initialDate.day);

  const [prevValue, setPrevValue] = useState(value);

  if (prevValue !== value) {
    setYear(initialDate.year);
    setMonth(initialDate.month);
    setDay(initialDate.day);
    setPrevValue(value);
  }

  const resolvedDay = Math.min(day, getPersianDaysInMonth(year, month));

  const years = useMemo(() => {
    if (availableYears.length > 0) {
      return [...availableYears].sort((a, b) => b - a);
    }
    return Array.from({ length: currentYear - 1369 + 1 }, (_, index) => 1369 + index).reverse();
  }, [availableYears, currentYear]);

  const months = useMemo(() => Array.from({ length: 12 }, (_, index) => index + 1), []);

  const days = useMemo(() => {
    const maxDay = getPersianDaysInMonth(year, month);
    return Array.from({ length: maxDay }, (_, index) => index + 1);
  }, [year, month]);

  const handleYearSelect = (nextYear: number) => {
    setYear(nextYear);
    setDay((currentDay) => Math.min(currentDay, getPersianDaysInMonth(nextYear, month)));
  };

  const handleMonthSelect = (nextMonth: number) => {
    setMonth(nextMonth);
    setDay((currentDay) => Math.min(currentDay, getPersianDaysInMonth(year, nextMonth)));
  };

  const handleDaySelect = (nextDay: number) => {
    setDay(nextDay);
  };

  const handleTodaySelect = () => {
    setYear(currentJalaliDate.jy);
    setMonth(currentJalaliDate.jm);
    setDay(currentJalaliDate.jd);
  };

  const handleConfirm = () => {
    const selectedDate = formatDateValue(year, month, resolvedDay);
    onSelect(selectedDate);
    onClose();
  };

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <Pressable style={[styles.overlay, { backgroundColor: theme.overlay }]} onPress={onClose}>
        <Pressable
          style={[styles.modalContent, { backgroundColor: theme.surfaceElevated, paddingBottom: Spacing.three + insets.bottom }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={[styles.handle, { backgroundColor: theme.borderStrong }]} />

          <View style={styles.header}>
            <View style={styles.headerTextBlock}>
              <ThemedText type="smallBold" style={styles.title}>
                {title}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                روز، ماه و سال را انتخاب کنید
              </ThemedText>
            </View>
            <Pressable onPress={onClose}>
              <MaterialCommunityIcons name="close" size={20} color={theme.textSecondary} />
            </Pressable>
          </View>

          <View style={styles.pickerRow}>
            <View style={styles.pickerColumn}>
              <View style={styles.labelContainer}>
                <ThemedText type="smallBold" style={{ color: theme.textSecondary }}>
                  روز
                </ThemedText>
              </View>
              <ScrollView
                style={styles.pickerList}
                contentContainerStyle={styles.pickerContent}
                showsVerticalScrollIndicator={false}
              >
                {days.map((d) => {
                  const isSelected = d === day;
                  return (
                    <Pressable
                      key={d}
                      onPress={() => handleDaySelect(d)}
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
                        style={{ color: isSelected ? theme.onPrimary : theme.text }}
                      >
                        {formatPersianNumber(d)}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            <View style={styles.pickerColumn}>
              <View style={styles.labelContainer}>
                <ThemedText type="smallBold" style={{ color: theme.textSecondary }}>
                  ماه
                </ThemedText>
              </View>
              <ScrollView
                style={styles.pickerList}
                contentContainerStyle={styles.pickerContent}
                showsVerticalScrollIndicator={false}
              >
                {months.map((m) => {
                  const isSelected = m === month;
                  return (
                    <Pressable
                      key={m}
                      onPress={() => handleMonthSelect(m)}
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
                        style={{ color: isSelected ? theme.onPrimary : theme.text }}
                      >
                        {formatPersianMonthName(m)}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            <View style={styles.pickerColumn}>
              <View style={styles.labelContainer}>
                <ThemedText type="smallBold" style={{ color: theme.textSecondary }}>
                  سال
                </ThemedText>
              </View>
              <ScrollView
                style={styles.pickerList}
                contentContainerStyle={styles.pickerContent}
                showsVerticalScrollIndicator={false}
              >
                {years.map((y) => {
                  const isSelected = y === year;
                  return (
                    <Pressable
                      key={y}
                      onPress={() => handleYearSelect(y)}
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
                        style={{ color: isSelected ? theme.onPrimary : theme.text }}
                      >
                        {formatPersianNumber(y)}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          </View>

          <View style={[styles.previewBox, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              پیش‌نمایش تاریخ
            </ThemedText>
            <ThemedText type="bodyBold" style={{ color: theme.primaryText }}>
              {`${formatPersianNumber(year)}/${formatPersianNumber(month)}/${formatPersianNumber(resolvedDay)}`}
            </ThemedText>
          </View>

          <View style={styles.actionsRow}>
            <View style={styles.todayButtonSlot}>
              {showTodayButton ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="انتخاب تاریخ امروز"
                  onPress={handleTodaySelect}
                  style={({ pressed }) => [
                    styles.todayButton,
                    {
                      backgroundColor: pressed ? theme.surfaceVariant : theme.surface,
                      borderColor: theme.border,
                    },
                  ]}
                >
                  <MaterialCommunityIcons name="calendar-today" size={16} color={theme.primaryText} />
                  <ThemedText type="smallBold" style={{ color: theme.primaryText }}>امروز</ThemedText>
                </Pressable>
              ) : null}
            </View>
            <View style={styles.confirmationActions}>
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
    fontSize: Typography.fontSize.bodyLarge,
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
  previewBox: {
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.two,
    alignItems: 'center',
    gap: Spacing.one,
    marginTop: Spacing.three,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.one,
    marginTop: Spacing.three,
  },
  confirmationActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  todayButtonSlot: {
    width: 76,
    minHeight: 40,
  },
  todayButton: {
    width: '100%',
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.two,
  },
  actionButton: {
    minWidth: 56,
    borderRadius: Radius.md,
  },
  actionLabel: {
    fontSize: Typography.fontSize.footnote,
    lineHeight: Typography.lineHeight.tight,
  },
});
