import { MaterialCommunityIcons } from '@expo/vector-icons';
import { jalaaliMonthLength, toGregorian, toJalaali } from 'jalaali-js';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Card, Snackbar } from 'react-native-paper';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { FontAwareButton as Button } from '@/components/font-aware-paper';
import { CalculationDescriptionBox, CalculationResultHeading } from '@/components/calculation-card-sections';
import { DateInputField } from '@/components/date-input-field';
import { NumericInputField } from '@/components/numeric-input-field';
import { PersianDatePickerModal } from '@/components/persian-date-picker-modal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { fetchYears, seedFromJsonAsset } from '@/database';
import { useTheme } from '@/hooks/use-theme';
import { calculateUnusedLeaveEntitlement, calculateUnusedLeaveMonths, parseDateInput, type UnusedLeaveEntitlementCalculationResult } from '@/utils/salary-calculation';

export default function UnusedLeaveEntitlementScreen() {
    const theme = useTheme();
    const insets = useSafeAreaInsets();
    const currentJalaliDate = useMemo(() => {
        const today = new Date();
        return toJalaali(today.getFullYear(), today.getMonth() + 1, today.getDate());
    }, []);

    const currentPersianYear = currentJalaliDate.jy;
    const defaultStartDate = `${currentPersianYear}/01/01`;
    const defaultEndDate = `${currentPersianYear}/12/${jalaaliMonthLength(currentPersianYear, 12)}`;

    const [startDate, setStartDate] = useState(defaultStartDate);
    const [endDate, setEndDate] = useState(defaultEndDate);
    const [pickerTarget, setPickerTarget] = useState<'start' | 'end' | null>(null);
    const [pickerVisible, setPickerVisible] = useState(false);
    const [result, setResult] = useState<number | null>(null);
    const [usedLeaveDaysBySegment, setUsedLeaveDaysBySegment] = useState<Record<number, string>>({});
    const [initialSavedLeaveDays, setInitialSavedLeaveDays] = useState('۰');
    const [showDetailedBreakdown, setShowDetailedBreakdown] = useState(false);
    const [snackbarVisible, setSnackbarVisible] = useState(false);
    const [snackbarMessage, setSnackbarMessage] = useState('');
    const [availableYears, setAvailableYears] = useState<number[]>([]);
    const [isLoadingData, setIsLoadingData] = useState(true);
    const [calculationDetails, setCalculationDetails] = useState<UnusedLeaveEntitlementCalculationResult | null>(null);

    useEffect(() => {
        let isMounted = true;

        const loadData = async () => {
            try {
                setIsLoadingData(true);
                await seedFromJsonAsset();
                const years = await fetchYears();

                if (isMounted) {
                    setAvailableYears(years.map((year) => year.year));
                }
            } catch {
                if (isMounted) {
                    setSnackbarMessage('خطا در بارگذاری داده‌ها. لطفاً دوباره تلاش کنید.');
                    setSnackbarVisible(true);
                }
            } finally {
                if (isMounted) {
                    setIsLoadingData(false);
                }
            }
        };

        void loadData();

        return () => {
            isMounted = false;
        };
    }, []);

    const persianDigits = '۰۱۲۳۴۵۶۷۸۹';

    const toPersianDigits = (value: string | number) =>
        String(value).replace(/\d/g, (digit) => persianDigits[Number(digit)]);

    const formatNumber = (value: number) =>
        Number.isInteger(value) ? toPersianDigits(value.toFixed(0)) : toPersianDigits(value.toFixed(2));

    const formatMonths = (value: number) => toPersianDigits(value.toFixed(2));

    const formattedResult = result === null ? '۰' : formatNumber(result);

    const totalMonthsWorked = (() => {
        const parsedStart = parseDateInput(startDate);
        const parsedEnd = parseDateInput(endDate);
        return parsedStart && parsedEnd ? calculateUnusedLeaveMonths(parsedStart, parsedEnd) : null;
    })();
    const parsedStartDate = parseDateInput(startDate);
    const formatDateParts = (date: { year: number; month: number; day: number }) =>
        `${toPersianDigits(String(date.year))}/${toPersianDigits(String(date.month).padStart(2, '0'))}/${toPersianDigits(String(date.day).padStart(2, '0'))}`;
    const getFullYearLabel = (segmentIndex: number) => {
        if (!parsedStartDate) {
            return `سال کامل ${toPersianDigits(segmentIndex)}`;
        }

        const startYear = parsedStartDate.year + segmentIndex - 1;
        const startDay = Math.min(parsedStartDate.day, jalaaliMonthLength(startYear, parsedStartDate.month));
        const nextAnniversaryYear = startYear + 1;
        const nextAnniversary = {
            year: nextAnniversaryYear,
            month: parsedStartDate.month,
            day: Math.min(parsedStartDate.day, jalaaliMonthLength(nextAnniversaryYear, parsedStartDate.month)),
        };
        const nextAnniversaryGregorian = toGregorian(nextAnniversary.year, nextAnniversary.month, nextAnniversary.day);
        const dayBeforeGregorian = new Date(Date.UTC(nextAnniversaryGregorian.gy, nextAnniversaryGregorian.gm - 1, nextAnniversaryGregorian.gd) - 86400000);
        const dayBefore = toJalaali(
            dayBeforeGregorian.getUTCFullYear(),
            dayBeforeGregorian.getUTCMonth() + 1,
            dayBeforeGregorian.getUTCDate(),
        );

        return `سال کامل ${toPersianDigits(segmentIndex)} (${formatDateParts({ year: startYear, month: parsedStartDate.month, day: startDay })} تا ${formatDateParts({ year: dayBefore.jy, month: dayBefore.jm, day: dayBefore.jd })})`;
    };
    const fullYears = totalMonthsWorked == null || totalMonthsWorked <= 12 ? 0 : Math.floor(totalMonthsWorked / 12);
    const remainingMonths = totalMonthsWorked == null ? 0 : totalMonthsWorked > 12 ? totalMonthsWorked % 12 : totalMonthsWorked;
    const segmentCount = fullYears + (remainingMonths > 0 ? 1 : 0);
    const getPartialPeriodLabel = () => {
        if (!parsedStartDate) {
            return `بازه ناکامل (${formatMonths(remainingMonths)} ماه)`;
        }

        const partialStartYear = parsedStartDate.year + fullYears;
        const partialStart = {
            year: partialStartYear,
            month: parsedStartDate.month,
            day: Math.min(parsedStartDate.day, jalaaliMonthLength(partialStartYear, parsedStartDate.month)),
        };

        return `بازه ناکامل (${formatDateParts(partialStart)} تا ${formatDisplayedDate(endDate)}، ${formatMonths(remainingMonths)} ماه)`;
    };

    const updateUsedLeaveDays = (segmentIndex: number, value: string) => {
        setUsedLeaveDaysBySegment((current) => ({ ...current, [segmentIndex]: value }));
    };

    const changeInitialSavedLeaveDays = (delta: number) => {
        const normalized = initialSavedLeaveDays.replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)));
        const currentValue = Number(normalized) || 0;
        const nextValue = Math.max(0, currentValue + delta);
        setInitialSavedLeaveDays(toPersianDigits(nextValue.toFixed(2).replace(/\.00$/, '')));
    };

    const changeUsedLeaveDays = (segmentIndex: number, delta: number) => {
        const currentValue = Number(String(usedLeaveDaysBySegment[segmentIndex] ?? '0').replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))) || 0;
        const nextValue = Math.max(0, currentValue + delta);
        updateUsedLeaveDays(segmentIndex, toPersianDigits(nextValue.toFixed(2).replace(/\.00$/, '')));
    };

    const formatDisplayedDate = (value: string) => {
        const parsed = parseDateInput(value);

        if (!parsed) {
            return '';
        }

        return `${toPersianDigits(String(parsed.year))}/${toPersianDigits(String(parsed.month).padStart(2, '0'))}/${toPersianDigits(String(parsed.day).padStart(2, '0'))}`;
    };

    const openPicker = (target: 'start' | 'end') => {
        setPickerTarget(target);
        setPickerVisible(true);
    };

    const closePicker = () => {
        setPickerVisible(false);
        setPickerTarget(null);
    };

    const handleDateSelect = (value: string) => {
        if (pickerTarget === 'start') {
            setStartDate(value);

            if (compareDates(value, endDate) > 0) {
                setEndDate(value);
            }
            return;
        }

        if (pickerTarget === 'end') {
            if (compareDates(value, startDate) < 0) {
                setEndDate(startDate);
                setSnackbarMessage('تاریخ پایان باید برابر یا بزرگتر از تاریخ شروع باشد.');
                setSnackbarVisible(true);
                return;
            }

            setEndDate(value);
        }
    };

    const compareDates = (left: string, right: string) => {
        const parsedLeft = parseDateInput(left);
        const parsedRight = parseDateInput(right);

        if (!parsedLeft || !parsedRight) {
            return 0;
        }

        const leftValue = parsedLeft.year * 10000 + parsedLeft.month * 100 + parsedLeft.day;
        const rightValue = parsedRight.year * 10000 + parsedRight.month * 100 + parsedRight.day;

        if (leftValue < rightValue) {
            return -1;
        }

        if (leftValue > rightValue) {
            return 1;
        }

        return 0;
    };

    const handleCalculate = () => {
        const parsedStart = parseDateInput(startDate);
        const parsedEnd = parseDateInput(endDate);

        if (!parsedStart || !parsedEnd) {
            setResult(null);
            setCalculationDetails(null);
            setSnackbarMessage('تاریخ واردشده معتبر نیست.');
            setSnackbarVisible(true);
            return;
        }

        if (compareDates(startDate, endDate) > 0) {
            setSnackbarMessage('تاریخ شروع باید قبل یا برابر تاریخ پایان باشد.');
            setSnackbarVisible(true);
            return;
        }

        const totalMonthsWorked = calculateUnusedLeaveMonths(parsedStart, parsedEnd);

        if (totalMonthsWorked === null) {
            setSnackbarMessage('بازه زمانی وارد‌شده معتبر نیست.');
            setSnackbarVisible(true);
            return;
        }

        const usedLeaveDays = Array.from({ length: fullYears + (remainingMonths > 0 ? 1 : 0) }, (_, index) =>
            Number(String(usedLeaveDaysBySegment[index] ?? '0').replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))),
        );
        const initialSavedDays = Number(initialSavedLeaveDays.replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit))));
        if (usedLeaveDays.some((value) => !Number.isFinite(value) || value < 0) || !Number.isFinite(initialSavedDays) || initialSavedDays < 0) {
            setSnackbarMessage('مقادیر مرخصی استفاده‌شده و ذخیره انتقالی باید صفر یا بیشتر باشند.');
            setSnackbarVisible(true);
            return;
        }

        const calculation = calculateUnusedLeaveEntitlement(parsedStart, parsedEnd, usedLeaveDays, initialSavedDays);
        if (!calculation) {
            setResult(null);
            setCalculationDetails(null);
            return;
        }

        setResult(calculation.totalSavedLeaveDays);
        setCalculationDetails(calculation);
        setShowDetailedBreakdown(false);
    };

    return (
        <ThemedView style={styles.container}>
            <ScrollView
                contentContainerStyle={[
                    styles.scrollContent,
                    {
                        paddingTop: insets.top + Spacing.three,
                        paddingBottom: insets.bottom + Spacing.four,
                    },
                ]}
                showsVerticalScrollIndicator={false}
            >
                <SafeAreaView style={styles.safeArea}>
                    <Card elevation={1} style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                        <Card.Content style={styles.cardContent}>
                            <View style={styles.headerRow}>
                                <View style={styles.headerText}>
                                    <ThemedText type="bodyBold" style={[styles.pageTitle, { color: theme.text }]}>
                                        میزان مرخصی ذخیره شده کارگر
                                    </ThemedText>
                                    <CalculationDescriptionBox>
                                        <ThemedText type="small" style={[styles.pageDescription, { color: theme.textSecondary }]}>
                                            محاسبه تعداد مرخصی ذخیره شده کارگر براساس مواد ۶۴ و ۶۹ قانون کار
                                        </ThemedText>
                                    </CalculationDescriptionBox>
                                </View>
                            </View>

                            <View style={[styles.formulaBox, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}>
                                <ThemedText type="small" style={[styles.formulaLabel, { color: theme.textSecondary }]}>
                                    فرمول محاسبه
                                </ThemedText>
                                <ThemedText type="small" style={[styles.formulaValue, { color: theme.text }]}>
                                    گام اول: تعیین استحقاق مرخصی ذخیره‌شده با نرخ ۲٫۱۷ روز برای هر ماه ناقص و ۹ روز برای هر سال کامل.{'\n'}
                                    گام دوم: کسر مرخصی استفاده‌شده و تهاتر مازاد سال ناکامل از ذخیره سال‌های قبل.
                                </ThemedText>
                            </View>

                            <View style={styles.metricsRow}>
                                <DateInputField
                                    label="از تاریخ"
                                    value={startDate}
                                    placeholder="۱۴۰۳/۰۱/۰۱"
                                    onPress={() => openPicker('start')}
                                    formatValue={formatDisplayedDate}
                                />

                                <DateInputField
                                    label="تا تاریخ"
                                    value={endDate}
                                    placeholder="۱۴۰۳/۱۲/۲۹"
                                    onPress={() => openPicker('end')}
                                    formatValue={formatDisplayedDate}
                                />
                            </View>

                            <View style={[styles.metricBox, { backgroundColor: theme.surfaceVariant }]}>
                                <ThemedText type="small" style={[styles.sectionLabel, { color: theme.textSecondary }]}>ذخیره مرخصی از سال‌های قبل</ThemedText>
                                <View style={[styles.stepper, styles.initialSavedStepper, { backgroundColor: theme.surface, borderColor: theme.border, direction: 'ltr' }]}>
                                    <Pressable
                                        onPress={() => changeInitialSavedLeaveDays(-1)}
                                        disabled={Number(initialSavedLeaveDays.replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))) <= 0}
                                        style={({ pressed }) => [
                                            styles.stepperButton,
                                            { backgroundColor: pressed ? theme.primaryContainer : theme.surfaceVariant },
                                            Number(initialSavedLeaveDays.replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))) <= 0 && styles.stepperButtonDisabled,
                                        ]}
                                        accessibilityRole="button"
                                        accessibilityLabel="کاهش ذخیره مرخصی سال‌های قبل"
                                    >
                                        <MaterialCommunityIcons name="minus" size={20} color={theme.primary} />
                                    </Pressable>
                                    <NumericInputField
                                        mode="decimal"
                                        value={initialSavedLeaveDays}
                                        onChangeText={setInitialSavedLeaveDays}
                                        placeholder="۰"
                                        placeholderTextColor={theme.textMuted}
                                        style={[styles.stepperInput, { color: theme.text, direction: 'ltr' }]}
                                        textAlign="center"
                                        accessibilityLabel="ذخیره مرخصی از سال‌های قبل"
                                    />
                                    <Pressable
                                        onPress={() => changeInitialSavedLeaveDays(1)}
                                        style={({ pressed }) => [
                                            styles.stepperButton,
                                            { backgroundColor: pressed ? theme.primaryContainer : theme.surfaceVariant },
                                        ]}
                                        accessibilityRole="button"
                                        accessibilityLabel="افزایش ذخیره مرخصی سال‌های قبل"
                                    >
                                        <MaterialCommunityIcons name="plus" size={20} color={theme.primary} />
                                    </Pressable>
                                </View>
                            </View>

                            {segmentCount > 0 ? (
                                <View style={[styles.usedLeaveBox, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}>
                                    <ThemedText type="smallBold" style={[styles.sectionLabel, { color: theme.text }]}>مرخصی استفاده‌شده در هر بخش</ThemedText>
                                    {Array.from({ length: segmentCount }, (_, index) => {
                                        const isPartial = index >= fullYears;
                                        return (
                                            <View key={index} style={styles.usedLeaveRow}>
                                                <ThemedText type="small" style={[styles.usedLeaveLabel, { color: theme.textSecondary }]}>
                                                    {isPartial ? getPartialPeriodLabel() : getFullYearLabel(index + 1)}
                                                </ThemedText>
                                                <View style={[styles.stepper, { backgroundColor: theme.surface, borderColor: theme.border, direction: 'ltr' }]}>
                                                    <Pressable
                                                        onPress={() => changeUsedLeaveDays(index, -1)}
                                                        disabled={Number(String(usedLeaveDaysBySegment[index] ?? '0').replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))) <= 0}
                                                        style={({ pressed }) => [
                                                            styles.stepperButton,
                                                            { backgroundColor: pressed ? theme.primaryContainer : theme.surfaceVariant },
                                                            Number(String(usedLeaveDaysBySegment[index] ?? '0').replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))) <= 0 && styles.stepperButtonDisabled,
                                                        ]}
                                                        accessibilityRole="button"
                                                        accessibilityLabel="کاهش مرخصی استفاده‌شده"
                                                    >
                                                        <MaterialCommunityIcons name="minus" size={20} color={theme.primary} />
                                                    </Pressable>
                                                    <NumericInputField
                                                        mode="decimal"
                                                        value={usedLeaveDaysBySegment[index] ?? ''}
                                                        onChangeText={(value) => updateUsedLeaveDays(index, value)}
                                                        placeholder="۰"
                                                        placeholderTextColor={theme.textMuted}
                                                        style={[styles.stepperInput, { color: theme.text, direction: 'ltr' }]}
                                                        textAlign="center"
                                                        accessibilityLabel="مرخصی استفاده‌شده"
                                                    />
                                                    <Pressable
                                                        onPress={() => changeUsedLeaveDays(index, 1)}
                                                        style={({ pressed }) => [
                                                            styles.stepperButton,
                                                            { backgroundColor: pressed ? theme.primaryContainer : theme.surfaceVariant },
                                                        ]}
                                                        accessibilityRole="button"
                                                        accessibilityLabel="افزایش مرخصی استفاده‌شده"
                                                    >
                                                        <MaterialCommunityIcons name="plus" size={20} color={theme.primary} />
                                                    </Pressable>
                                                </View>
                                            </View>
                                        );
                                    })}
                                </View>
                            ) : null}

                            <View style={styles.actionsGroup}>
                                <Button
                                    mode="contained"
                                    onPress={handleCalculate}
                                    icon="calendar-clock"
                                    buttonColor={theme.primary}
                                    textColor={theme.surface}
                                    style={styles.actionButton}
                                    labelStyle={styles.actionLabel}
                                    loading={isLoadingData}
                                    disabled={isLoadingData}
                                >
                                    محاسبه
                                </Button>

                            </View>

                            {result !== null ? (
                                <Card style={[styles.breakdownCard, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}>
                                    <Card.Content style={styles.breakdownContent}>
                                        <CalculationResultHeading />
                                        <View style={styles.summaryBoxHeader}>
                                            <View style={[styles.summaryBoxContent, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                                                <ThemedText type="small" style={[styles.resultLabel, { color: theme.textSecondary }]}>
                                                    ذخیره نهایی مرخصی کارگر
                                                </ThemedText>
                                                <ThemedText type="largeTitle" style={[styles.amountValue, { color: theme.primary }]}>
                                                    {formattedResult}
                                                </ThemedText>
                                            </View>
                                        </View>

                                        <View style={styles.breakdownSectionHeader}>
                                            <ThemedText type="smallBold" style={[styles.breakdownSectionTitle, { color: theme.text }]}>
                                                جزئیات محاسبه
                                            </ThemedText>
                                            <Pressable
                                                onPress={() => setShowDetailedBreakdown((prev) => !prev)}
                                                style={[
                                                    styles.toggleButton,
                                                    {
                                                        backgroundColor: theme.surface,
                                                        borderColor: theme.border,
                                                    },
                                                ]}
                                            >
                                                <ThemedText type="smallBold" style={[styles.toggleButtonLabel, { color: theme.primary }]}>
                                                    {showDetailedBreakdown ? 'عدم نمایش' : 'نمایش جزئیات'}
                                                </ThemedText>
                                                <MaterialCommunityIcons
                                                    name={showDetailedBreakdown ? 'chevron-up' : 'chevron-down'}
                                                    size={18}
                                                    color={theme.primary}
                                                />
                                            </Pressable>
                                        </View>

                                        {showDetailedBreakdown && calculationDetails ? (
                                            <View style={styles.breakdownGrid}>
                                                <View style={[styles.breakdownItemCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                                                    <View style={styles.breakdownItemHeaderRow}>
                                                        <ThemedText type="smallBold" style={[styles.breakdownItemTitle, { color: theme.text }]}>خلاصه محاسبه</ThemedText>
                                                    </View>
                                                    <View style={styles.breakdownDetailGrid}>
                                                        <View style={[styles.breakdownDetailBox, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}><ThemedText type="small" style={[styles.detailLabel, { color: theme.textSecondary }]}>کل استحقاق</ThemedText><ThemedText type="smallBold" style={[styles.detailValue, { color: theme.text }]}>{formatNumber(calculationDetails.totalEntitlementDays)} روز</ThemedText></View>
                                                        <View style={[styles.breakdownDetailBox, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}><ThemedText type="small" style={[styles.detailLabel, { color: theme.textSecondary }]}>کل مرخصی استفاده‌شده</ThemedText><ThemedText type="smallBold" style={[styles.detailValue, { color: theme.text }]}>{formatNumber(calculationDetails.totalUsedLeaveDays)} روز</ThemedText></View>
                                                        <View style={[styles.breakdownDetailBox, { backgroundColor: theme.primaryContainer, borderColor: theme.primary }]}><ThemedText type="small" style={[styles.detailLabel, { color: theme.textSecondary }]}>ذخیره نهایی</ThemedText><ThemedText type="smallBold" style={[styles.detailValue, { color: theme.primary }]}>{formatNumber(calculationDetails.totalSavedLeaveDays)} روز</ThemedText></View>
                                                    </View>
                                                </View>
                                                {calculationDetails.breakdown.map((item) => (
                                                    <View key={item.segmentIndex} style={[styles.breakdownItemCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                                                        <ThemedText type="smallBold" style={[styles.breakdownItemTitle, { color: theme.text }]}>{item.isPartial ? getPartialPeriodLabel() : getFullYearLabel(item.segmentIndex)}</ThemedText>
                                                        <View style={styles.breakdownDetailGrid}>
                                                            <View style={[styles.breakdownDetailBox, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}><ThemedText type="small" style={[styles.detailLabel, { color: theme.textSecondary }]}>استحقاق این بخش</ThemedText><ThemedText type="smallBold" style={[styles.detailValue, { color: theme.text }]}>{formatNumber(item.entitlementDays)} روز</ThemedText></View>
                                                            <View style={[styles.breakdownDetailBox, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}><ThemedText type="small" style={[styles.detailLabel, { color: theme.textSecondary }]}>مرخصی استفاده‌شده</ThemedText><ThemedText type="smallBold" style={[styles.detailValue, { color: theme.text }]}>{formatNumber(item.usedLeaveDays)} روز</ThemedText></View>
                                                            <View style={[styles.breakdownDetailBox, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}><ThemedText type="small" style={[styles.detailLabel, { color: theme.textSecondary }]}>ذخیره این بخش</ThemedText><ThemedText type="smallBold" style={[styles.detailValue, { color: theme.primary }]}>{formatNumber(item.savedLeaveDays)} روز</ThemedText></View>
                                                            {item.excessUsedDays > 0 ? <View style={[styles.breakdownDetailBox, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}><ThemedText type="small" style={[styles.detailLabel, { color: theme.textSecondary }]}>مازاد کسرشده از ذخیره قبل</ThemedText><ThemedText type="smallBold" style={[styles.detailValue, { color: theme.error }]}>{formatNumber(item.excessUsedDays)} روز</ThemedText></View> : null}
                                                            <View style={[styles.breakdownDetailBox, { backgroundColor: theme.primaryContainer, borderColor: theme.primary }]}><ThemedText type="small" style={[styles.detailLabel, { color: theme.textSecondary }]}>ذخیره تجمعی پس از این بخش</ThemedText><ThemedText type="smallBold" style={[styles.detailValue, { color: theme.primary }]}>{formatNumber(item.carryAfter)} روز</ThemedText></View>
                                                        </View>
                                                    </View>
                                                ))}
                                            </View>
                                        ) : null}
                                    </Card.Content>
                                </Card>
                            ) : null}
                        </Card.Content>
                    </Card>
                </SafeAreaView>
            </ScrollView>

            <PersianDatePickerModal
                visible={pickerVisible}
                value={pickerTarget === 'start' ? startDate : endDate}
                title={pickerTarget === 'start' ? 'انتخاب تاریخ شروع' : 'انتخاب تاریخ پایان'}
                onClose={closePicker}
                onSelect={handleDateSelect}
                availableYears={availableYears}
            />

            <Snackbar
                visible={snackbarVisible}
                onDismiss={() => setSnackbarVisible(false)}
                duration={5000}
                style={{ backgroundColor: theme.error, borderRadius: Radius.md }}
                action={{
                    label: 'بستن',
                    onPress: () => setSnackbarVisible(false),
                    labelStyle: { color: theme.surface },
                }}
            >
                <ThemedText type="small" style={{ color: theme.surface }}>
                    {snackbarMessage}
                </ThemedText>
            </Snackbar>
        </ThemedView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    scrollContent: {
        flexGrow: 1,
    },
    safeArea: {
        flex: 1,
        justifyContent: 'center',
        paddingHorizontal: 0,
    },
    card: {
        borderRadius: Radius.md,
        borderWidth: StyleSheet.hairlineWidth,
        overflow: 'hidden',
    },
    cardContent: {
        gap: Spacing.three,
        paddingVertical: Spacing.four,
        paddingHorizontal: Spacing.three,
    },
    usedLeaveBox: {
        borderRadius: 14,
        borderWidth: StyleSheet.hairlineWidth,
        padding: Spacing.two,
        gap: Spacing.two,
    },
    usedLeaveRow: {
        flexDirection: 'column',
        alignItems: 'stretch',
        gap: Spacing.two,
    },
    usedLeaveLabel: {
        fontSize: 12,
        lineHeight: 19,
    },
    stepper: {
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
        fontFamily: 'AppFont-Bold',
        fontSize: 14,
        paddingVertical: 0,
    },
    initialSavedStepper: { width: '100%' },
    headerRow: {
        alignItems: 'flex-start',
    },
    headerText: {
        flex: 1,
        gap: Spacing.one,
    },
    pageTitle: {
        display: 'none',
        fontSize: 16,
        lineHeight: 22,
        fontFamily: 'AppFont-Bold',
    },
    pageDescription: {
        lineHeight: 20,
        fontSize: 13,
    },
    formulaBox: {
        borderRadius: Radius.md,
        borderWidth: StyleSheet.hairlineWidth,
        paddingHorizontal: Spacing.two,
        paddingVertical: Spacing.two,
        gap: Spacing.one,
    },
    formulaLabel: {
        fontSize: 11,
    },
    formulaValue: {
        lineHeight: 20,
        fontSize: 12,
    },
    metricsRow: {
        flexDirection: 'row',
        gap: Spacing.two,
    },
    metricBox: {
        flex: 1,
        borderRadius: 14,
        paddingHorizontal: Spacing.two,
        paddingVertical: Spacing.two,
        gap: Spacing.one,
    },
    sectionLabel: {
        fontSize: 11,
    },
    dateInput: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: Spacing.one,
        paddingHorizontal: Spacing.two,
        paddingVertical: Spacing.two,
        borderRadius: 12,
        borderWidth: StyleSheet.hairlineWidth,
    },
    fieldValue: {
        fontSize: 13,
        flex: 1,
    },
    actionsGroup: {
        flexDirection: 'row',
        gap: Spacing.two,
    },
    actionButton: {
        flex: 1,
        borderRadius: 12,
    },
    actionLabel: {
        fontFamily: 'AppFont-Bold',
        fontSize: 12,
    },
    resultCard: {
        borderRadius: Radius.md,
        borderWidth: 1,
        marginTop: Spacing.two,
        overflow: 'hidden',
    },
    resultContent: {
        gap: Spacing.two,
        paddingVertical: Spacing.three,
        paddingHorizontal: Spacing.two,
    },
    summaryBoxHeader: {
        alignItems: 'center',
        marginBottom: Spacing.one,
    },
    summaryBoxContent: {
        width: '100%',
        borderRadius: 12,
        borderWidth: 1,
        padding: Spacing.two,
        gap: Spacing.one,
        alignItems: 'center',
    },
    resultLabel: {
        fontSize: 11,
    },
    amountValue: {
        fontSize: 16,
        lineHeight: 22,
        fontFamily: 'AppFont-Bold',
    },
    breakdownCard: {
        borderRadius: Radius.md,
        borderWidth: 1,
        marginTop: Spacing.two,
        overflow: 'hidden',
    },
    breakdownContent: {
        gap: Spacing.two,
        paddingVertical: Spacing.three,
        paddingHorizontal: Spacing.two,
    },
    breakdownSectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: Spacing.one,
        paddingVertical: Spacing.one,
        gap: Spacing.one,
    },
    breakdownSectionTitle: {
        fontSize: 13,
        fontFamily: 'AppFont-Bold',
    },
    toggleButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.one,
        borderRadius: 12,
        borderWidth: StyleSheet.hairlineWidth,
        paddingHorizontal: Spacing.two,
        paddingVertical: Spacing.one,
    },
    toggleButtonLabel: {
        fontSize: 11,
    },
    breakdownGrid: {
        gap: Spacing.two,
    },
    breakdownItemCard: {
        borderRadius: Radius.md,
        borderWidth: 1,
        padding: Spacing.two,
        gap: Spacing.one,
    },
    breakdownItemHeaderRow: {
        paddingTop: 2,
        paddingBottom: 2,
        marginBottom: 2,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: 'rgba(0, 0, 0, 0.12)',
    },
    breakdownItemTitle: {
        fontSize: 12,
    },
    breakdownDetailGrid: {
        gap: Spacing.one,
    },
    breakdownDetailBox: {
        borderRadius: 8,
        borderWidth: 1,
        padding: Spacing.one,
        gap: Spacing.one,
        alignItems: 'center',
    },
    detailLabel: {
        fontSize: 12,
    },
    detailValue: {
        fontSize: 16,
        lineHeight: 22,
        fontFamily: 'AppFont-Bold',
    },
});
