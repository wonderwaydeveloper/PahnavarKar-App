import { MaterialCommunityIcons } from '@expo/vector-icons';
import { jalaaliMonthLength, toJalaali } from 'jalaali-js';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Card, Snackbar } from 'react-native-paper';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { FontAwareButton as Button } from '@/components/font-aware-paper';
import { DateInputField } from '@/components/date-input-field';
import { NumericInputField } from '@/components/numeric-input-field';
import { PersianDatePickerModal } from '@/components/persian-date-picker-modal';
import { PersianTimePickerModal } from '@/components/persian-time-picker-modal';
import { ThemedText } from '@/components/themed-text';
import { HiddenCalculationGuide } from '@/components/hidden-calculation-guide';
import { CalculationDescriptionBox, CalculationResultHeading } from '@/components/calculation-card-sections';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { fetchOfficialHolidaysBetweenDates, fetchPeriodsByYearId, fetchYears, seedFromJsonAsset } from '@/database';
import { useTheme } from '@/hooks/use-theme';
import { normalizeWorkHoursInput } from '@/utils/work-hours-input';
import {
    calculateOrdinaryWorkHoursFromPeriodData,
    calculateInsuranceDaysEntitlementFromPeriodData,
    parseDateInput,
    type InsuranceDaysEntitlementCalculationResult,
    type SalaryPeriodBucket,
} from '@/utils/salary-calculation';
import { useAppContext } from '@/hooks/use-app-context';

type WorkHoursMethod = 'daily' | 'period';

export default function InsuranceDaysEntitlementScreen() {
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
    const [timePickerVisible, setTimePickerVisible] = useState(false);
    const [dailyWorkHours, setDailyWorkHours] = useState('07:20');
    const [workHoursMethod, setWorkHoursMethod] = useState<WorkHoursMethod>('daily');
    const [actualWorkedHours, setActualWorkedHours] = useState<string | null>(null);
    const [workedHoursError, setWorkedHoursError] = useState('');
    const [periodBuckets, setPeriodBuckets] = useState<SalaryPeriodBucket[]>([]);
    const [officialHolidayDates, setOfficialHolidayDates] = useState<string[]>([]);
    const [availableYears, setAvailableYears] = useState<number[]>([]);
    const [isLoadingData, setIsLoadingData] = useState(true);
    const [result, setResult] = useState<InsuranceDaysEntitlementCalculationResult | null>(null);
    const [showDetailedBreakdown, setShowDetailedBreakdown] = useState(false);
    const [snackbarVisible, setSnackbarVisible] = useState(false);
    const [snackbarMessage, setSnackbarMessage] = useState('');

    useEffect(() => {
        let isMounted = true;

        const loadData = async () => {
            try {
                await seedFromJsonAsset();

                const years = await fetchYears();
                const buckets: SalaryPeriodBucket[] = [];

                for (const year of years) {
                    const periods = await fetchPeriodsByYearId(year.id);
                    if (periods.length === 0) {
                        continue;
                    }

                    buckets.push({
                        year: year.year,
                        periods: periods.map((period) => ({
                            period_index: period.period_index,
                            month_count: period.month_count,
                            daily_minimum_wage: period.daily_minimum_wage,
                        })),
                    });
                }

                const sortedYears = years.map((year) => year.year).sort((left, right) => left - right);
                const holidays = sortedYears.length > 0
                    ? await fetchOfficialHolidaysBetweenDates(
                        `${sortedYears[0]}/01/01`,
                        `${sortedYears[sortedYears.length - 1]}/12/${String(jalaaliMonthLength(sortedYears[sortedYears.length - 1], 12)).padStart(2, '0')}`,
                    )
                    : [];

                if (isMounted) {
                    setPeriodBuckets(buckets);
                    setOfficialHolidayDates(holidays.map((holiday) => holiday.holiday_date));
                    setAvailableYears(sortedYears);
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

    const toPersianDigits = (value: string) =>
        value.replace(/\d/g, (digit) => persianDigits[Number(digit)]);

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

    const formatMonthName = (month: number) => persianMonthNames[month - 1] ?? '';

    const formatNumber = (value: number) => {
        const normalizedValue = Number.isInteger(value) ? value.toFixed(0) : value.toFixed(2);
        return toPersianDigits(normalizedValue);
    };

    const formatDisplayedDate = (value: string) => {
        const parsed = parseDateInput(value);

        if (!parsed) {
            return '';
        }

        return `${toPersianDigits(String(parsed.year))}/${toPersianDigits(String(parsed.month).padStart(2, '0'))}/${toPersianDigits(String(parsed.day).padStart(2, '0'))}`;
    };

    const parseTimeToDecimalHours = (value: string) => {
        const match = value.match(/^(\d{1,2}):(\d{1,2})$/);

        if (!match) {
            return 0;
        }

        const hours = Number(match[1]);
        const minutes = Number(match[2]);

        if (!Number.isFinite(hours) || !Number.isFinite(minutes) || minutes >= 60) {
            return 0;
        }

        return hours + minutes / 60;
    };

    const formatDecimalHours = (value: number) => {
        const totalMinutes = Math.round(value * 60);
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;

        return `${toPersianDigits(String(hours))}:${toPersianDigits(String(minutes).padStart(2, '0'))}`;
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

    const parsedStartDate = useMemo(() => parseDateInput(startDate), [startDate]);
    const parsedEndDate = useMemo(() => parseDateInput(endDate), [endDate]);
    const isDateRangeValid = !!parsedStartDate
        && !!parsedEndDate
        && compareDates(startDate, endDate) <= 0;
    const requiredWorkHours = useMemo(() => {
        if (!isDateRangeValid || !parsedStartDate || !parsedEndDate) {
            return null;
        }

        const yearsInRange = Array.from(
            { length: parsedEndDate.year - parsedStartDate.year + 1 },
            (_, index) => parsedStartDate.year + index,
        );
        if (yearsInRange.some((year) => !periodBuckets.some((bucket) => bucket.year === year))) {
            return null;
        }

        const calculation = calculateOrdinaryWorkHoursFromPeriodData(
            parsedStartDate,
            parsedEndDate,
            periodBuckets,
            officialHolidayDates,
        );

        return calculation.breakdown.length > 0 ? calculation.totalHours : null;
    }, [isDateRangeValid, officialHolidayDates, parsedEndDate, parsedStartDate, periodBuckets]);
    const maximumAllowedWorkHours = requiredWorkHours;
    const actualWorkedHoursValue = actualWorkedHours ?? (requiredWorkHours?.toFixed(2) ?? '');
    const normalizedActualWorkedHours = Number(actualWorkedHoursValue);
    const isActualWorkedHoursValid = actualWorkedHoursValue.trim().length > 0
        && Number.isFinite(normalizedActualWorkedHours)
        && normalizedActualWorkedHours >= 0;

    const handleActualWorkedHoursChange = (value: string) => {
        const normalizedValue = normalizeWorkHoursInput(value);
        const numericValue = Number(normalizedValue);
        if (
            maximumAllowedWorkHours !== null
            && Number.isFinite(numericValue)
            && numericValue > maximumAllowedWorkHours
        ) {
            setActualWorkedHours(maximumAllowedWorkHours.toFixed(2));
            setWorkedHoursError(`حداکثر ساعات قابل ورود در این بازه ${toPersianDigits(maximumAllowedWorkHours.toFixed(2))} ساعت است.`);
        } else {
            setActualWorkedHours(normalizedValue);
            setWorkedHoursError('');
        }

        setResult(null);
    };

    const changeActualWorkedHours = (amount: number) => {
        const currentValue = Number(actualWorkedHoursValue) || 0;
        const nextValue = Math.max(0, currentValue + amount);
        const cappedValue = maximumAllowedWorkHours === null
            ? nextValue
            : Math.min(nextValue, maximumAllowedWorkHours);

        handleActualWorkedHoursChange(cappedValue.toFixed(2));
    };

    const handleWorkHoursMethodChange = (method: WorkHoursMethod) => {
        setWorkHoursMethod(method);
        setWorkedHoursError('');
        setResult(null);
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
            setActualWorkedHours(null);
            setWorkedHoursError('');
            setResult(null);

            if (endDate) {
                const comparison = compareDates(value, endDate);
                if (comparison > 0) {
                    setEndDate(value);
                }
            }

            return;
        }

        if (pickerTarget === 'end') {
            if (startDate) {
                const comparison = compareDates(value, startDate);
                if (comparison < 0) {
                    setEndDate(startDate);
                    setActualWorkedHours(null);
                    setWorkedHoursError('');
                    setResult(null);
                    setSnackbarMessage('تاریخ پایان باید برابر یا بزرگتر از تاریخ شروع باشد.');
                    setSnackbarVisible(true);
                    return;
                }
            }

            setEndDate(value);
            setActualWorkedHours(null);
            setWorkedHoursError('');
            setResult(null);
        }
    };

    const { notifyCalculationCompleted } = useAppContext();
    const handleCalculate = () => {
        const parsedStart = parseDateInput(startDate);
        const parsedEnd = parseDateInput(endDate);

        if (!parsedStart || !parsedEnd) {
            setResult(null);
            return;
        }

        if (
            parsedStart.year > parsedEnd.year ||
            (parsedStart.year === parsedEnd.year && parsedStart.month > parsedEnd.month) ||
            (parsedStart.year === parsedEnd.year && parsedStart.month === parsedEnd.month && parsedStart.day > parsedEnd.day)
        ) {
            setResult(null);
            return;
        }

        let calculation: InsuranceDaysEntitlementCalculationResult;
        if (workHoursMethod === 'daily') {
            const hours = parseTimeToDecimalHours(dailyWorkHours);
            if (!Number.isFinite(hours) || hours < 1 / 60) {
                setSnackbarMessage('ساعات کاری روزانه باید حداقل ۱ دقیقه (۰۰:۰۱) باشد.');
                setSnackbarVisible(true);
                return;
            }

            if (hours > 7 + 20 / 60) {
                setSnackbarMessage('ساعات کاری روزانه نمی‌تواند بیشتر از ۷ ساعت و ۲۰ دقیقه (۰۷:۲۰) باشد.');
                setSnackbarVisible(true);
                return;
            }

            calculation = calculateInsuranceDaysEntitlementFromPeriodData(parsedStart, parsedEnd, hours);
        } else {
            if (!isActualWorkedHoursValid) {
                setResult(null);
                setWorkedHoursError('مجموع ساعات کارکرد کارگر را به‌صورت عدد معتبر وارد کنید.');
                return;
            }

            if (requiredWorkHours === null) {
                setResult(null);
                setSnackbarMessage('برای بازهٔ انتخاب‌شده اطلاعات ساعات کارکرد موظفی در دسترس نیست.');
                setSnackbarVisible(true);
                return;
            }

            if (requiredWorkHours <= 0) {
                setResult(null);
                setSnackbarMessage('برای بازهٔ انتخاب‌شده ساعات کارکرد موظفی قابل محاسبه نیست.');
                setSnackbarVisible(true);
                return;
            }

            if (
                maximumAllowedWorkHours !== null
                && normalizedActualWorkedHours > maximumAllowedWorkHours
            ) {
                setResult(null);
                setWorkedHoursError(`حداکثر ساعات قابل ورود در این بازه ${toPersianDigits(maximumAllowedWorkHours.toFixed(2))} ساعت است.`);
                return;
            }

            const workRatio = Math.min(normalizedActualWorkedHours, requiredWorkHours) / requiredWorkHours;
            const fullTimeCalculation = calculateInsuranceDaysEntitlementFromPeriodData(parsedStart, parsedEnd, 7 + 20 / 60);
            calculation = {
                totalDays: Number(fullTimeCalculation.breakdown.reduce(
                    (total, item) => total + Number((item.daysCovered * workRatio).toFixed(2)),
                    0,
                ).toFixed(2)),
                breakdown: fullTimeCalculation.breakdown.map((item) => ({
                    ...item,
                    dailyHours: (7 + 20 / 60) * workRatio,
                    calculationType: workRatio >= 1 ? 'month-full' : 'partial',
                    daysCalculated: Number((item.daysCovered * workRatio).toFixed(2)),
                })),
            };
        }

        if (calculation.breakdown.length === 0) {
            setResult(null);
            return;
        }

        setWorkedHoursError('');
        setResult(calculation);
        notifyCalculationCompleted();
        setShowDetailedBreakdown(false);
    };

    const formattedResult = result ? formatNumber(result.totalDays) : '۰';

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
                                        محاسبه تعداد روزهای بیمه استحقاقی
                                    </ThemedText>
                                    <CalculationDescriptionBox>
                                        <ThemedText type="small" style={[styles.pageDescription, { color: theme.textSecondary }]}>
                                            محاسبه تعداد روزهای بیمه موضوع مفاد مواد ۳۹ و ۱۴۸ قانون کار
                                        </ThemedText>
                                    </CalculationDescriptionBox>
                                </View>
                            </View>

                            <HiddenCalculationGuide>
                                اگر ساعات کار روزانه حداقل ۷٫۳۳ ساعت باشد، روزهای بیمه برابر روزهای پوشش است؛ در غیر این صورت: روزهای پوشش × (ساعات کار روزانه ÷ ۷٫۳۳). نتیجهٔ دوره‌ها با هم جمع می‌شود.
                            </HiddenCalculationGuide>
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

                            <View style={[styles.workHoursSection, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}>
                                <ThemedText type="smallBold" style={{ color: theme.text }}>
                                    روش محاسبهٔ ساعات کارکرد
                                </ThemedText>
                                <View accessibilityRole="radiogroup" style={styles.workHoursMethods}>
                                    {([
                                        { value: 'daily', label: 'ساعات کارکرد روزانه' },
                                        { value: 'period', label: 'مجموع ساعات کارکرد کارگر در بازه ی زمانی انتخابی' },
                                    ] as const).map((option) => {
                                        const selected = workHoursMethod === option.value;
                                        return (
                                            <Pressable
                                                key={option.value}
                                                accessibilityRole="radio"
                                                accessibilityState={{ selected }}
                                                accessibilityLabel={option.label}
                                                onPress={() => handleWorkHoursMethodChange(option.value)}
                                                style={[
                                                    styles.workHoursMethodOption,
                                                    {
                                                        backgroundColor: selected ? theme.primaryContainer : theme.surface,
                                                        borderColor: selected ? theme.primary : theme.border,
                                                        borderWidth: selected ? 1.5 : StyleSheet.hairlineWidth,
                                                    },
                                                ]}
                                            >
                                                <MaterialCommunityIcons
                                                    name={selected ? 'radiobox-marked' : 'radiobox-blank'}
                                                    size={20}
                                                    color={selected ? theme.primaryText : theme.textSecondary}
                                                />
                                                <ThemedText
                                                    type="smallBold"
                                                    style={[
                                                        styles.workHoursMethodLabel,
                                                        { color: selected ? theme.primaryText : theme.text },
                                                    ]}
                                                >
                                                    {option.label}
                                                </ThemedText>
                                            </Pressable>
                                        );
                                    })}
                                </View>
                                <View style={[styles.workHoursDivider, { backgroundColor: theme.border }]} />
                                {workHoursMethod === 'daily' ? (
                                    <View style={styles.workHoursDetails}>
                                        <ThemedText type="small" style={{ color: theme.textSecondary }}>
                                            ساعات کاری روزانه
                                        </ThemedText>
                                        <Pressable
                                            style={[styles.dateInput, { backgroundColor: theme.surface, borderColor: theme.border }]}
                                            onPress={() => setTimePickerVisible(true)}
                                        >
                                            <ThemedText type="smallBold" style={[styles.fieldValue, { color: theme.text }]}>
                                                {formatDecimalHours(parseTimeToDecimalHours(dailyWorkHours))}
                                            </ThemedText>
                                            <MaterialCommunityIcons name="clock-outline" size={18} color={theme.primaryText} />
                                        </Pressable>
                                        <ThemedText type="small" style={[styles.workHoursHint, { color: theme.textSecondary }]}>
                                            مبنای تمام‌وقت: ۷ ساعت و ۲۰ دقیقه در روز
                                        </ThemedText>
                                    </View>
                                ) : (
                                    <View style={styles.workHoursDetails}>
                                        <ThemedText type="smallBold" style={{ color: theme.text }}>
                                            ساعات کارکرد کارگر در بازه ی زمانی انتخاب شده
                                        </ThemedText>
                                        <View
                                            style={[
                                                styles.workHoursStepper,
                                                {
                                                    backgroundColor: theme.surface,
                                                    borderColor: workedHoursError ? theme.error : theme.border,
                                                    direction: 'ltr',
                                                },
                                            ]}
                                        >
                                            <Pressable
                                                onPress={() => changeActualWorkedHours(-1)}
                                                disabled={normalizedActualWorkedHours <= 0}
                                                style={({ pressed }) => [
                                                    styles.workHoursStepperButton,
                                                    { backgroundColor: pressed ? theme.primaryContainer : theme.surfaceVariant },
                                                    normalizedActualWorkedHours <= 0 && styles.workHoursStepperButtonDisabled,
                                                ]}
                                                accessibilityRole="button"
                                                accessibilityLabel="کاهش ساعات کارکرد کارگر"
                                            >
                                                <MaterialCommunityIcons name="minus" size={20} color={theme.primaryText} />
                                            </Pressable>
                                            <NumericInputField
                                                mode="decimal"
                                                accessibilityLabel="ساعات کارکرد کارگر در بازه ی زمانی انتخاب شده"
                                                onChangeText={handleActualWorkedHoursChange}
                                                placeholder="ساعات موظفی بازه"
                                                placeholderTextColor={theme.textMuted}
                                                returnKeyType="done"
                                                style={[styles.workHoursInput, { color: theme.text }]}
                                                textAlign="center"
                                                value={actualWorkedHoursValue}
                                            />
                                            <Pressable
                                                onPress={() => changeActualWorkedHours(1)}
                                                disabled={
                                                    maximumAllowedWorkHours !== null
                                                    && normalizedActualWorkedHours >= maximumAllowedWorkHours
                                                }
                                                style={({ pressed }) => [
                                                    styles.workHoursStepperButton,
                                                    { backgroundColor: pressed ? theme.primaryContainer : theme.surfaceVariant },
                                                    maximumAllowedWorkHours !== null
                                                    && normalizedActualWorkedHours >= maximumAllowedWorkHours
                                                    && styles.workHoursStepperButtonDisabled,
                                                ]}
                                                accessibilityRole="button"
                                                accessibilityLabel="افزایش ساعات کارکرد کارگر"
                                            >
                                                <MaterialCommunityIcons name="plus" size={20} color={theme.primaryText} />
                                            </Pressable>
                                        </View>
                                        {workedHoursError ? (
                                            <ThemedText type="small" accessibilityRole="alert" style={{ color: theme.error }}>
                                                {workedHoursError}
                                            </ThemedText>
                                        ) : null}
                                        <ThemedText type="small" style={[styles.workHoursHint, { color: theme.textSecondary }]}>
                                            • ساعات موظفی این بازه: {requiredWorkHours === null
                                                ? isLoadingData ? 'در حال محاسبه…' : 'در دسترس نیست'
                                                : `${toPersianDigits(requiredWorkHours.toFixed(2))} ساعت`}
                                        </ThemedText>
                                        {maximumAllowedWorkHours !== null ? (
                                            <ThemedText type="small" style={[styles.workHoursHint, { color: theme.textSecondary }]}>
                                                • حداکثر ساعات کارکرد مجاز: {toPersianDigits(maximumAllowedWorkHours.toFixed(2))} ساعت
                                            </ThemedText>
                                        ) : null}
                                        <ThemedText type="small" style={[styles.workHoursHint, { color: theme.textSecondary }]}>
                                            • نسبت کارکرد = ساعات کارکرد کارگر ÷ ساعات موظفی کارگر
                                        </ThemedText>
                                        {requiredWorkHours !== null && requiredWorkHours > 0 && isActualWorkedHoursValid ? (
                                            <ThemedText type="small" style={[styles.workHoursHint, { color: theme.textSecondary }]}>
                                                • نسبت ساعات کارکرد: {toPersianDigits((Math.min(normalizedActualWorkedHours, requiredWorkHours) / requiredWorkHours).toFixed(4))}
                                            </ThemedText>
                                        ) : null}
                                    </View>
                                )}
                            </View>

                            <View style={styles.actionsGroup}>
                                <Button
                                    mode="contained"
                                    onPress={handleCalculate}
                                    icon="shield-check"
                                    buttonColor={theme.primary}
                                    textColor={theme.onPrimary}
                                    style={styles.actionButton}
                                    labelStyle={styles.actionLabel}
                                >
                                    محاسبه
                                </Button>

                            </View>

                            {result ? (
                                <Card style={[styles.breakdownCard, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}>
                                    <Card.Content style={styles.breakdownContent}>
                                        <CalculationResultHeading />
                                        <View style={styles.summaryBoxHeader}>
                                            <View style={[styles.summaryBoxContent, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                                                <ThemedText type="small" style={[styles.summaryLabel, { color: theme.textSecondary }]}>
                                                    مجموع کل روزهای بیمه استحقاقی
                                                </ThemedText>
                                                <ThemedText type="largeTitle" style={[styles.amountValue, { color: theme.primaryText }]}>
                                                    {formattedResult}
                                                </ThemedText>
                                            </View>
                                        </View>

                                        <View style={styles.breakdownSectionHeader}>
                                            <ThemedText type="smallBold" style={[styles.breakdownSectionTitle, { color: theme.text }]}>
                                                جزئیات ماه‌ها
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
                                                <ThemedText type="smallBold" style={[styles.toggleButtonLabel, { color: theme.primaryText }]}>
                                                    {showDetailedBreakdown ? 'عدم نمایش' : 'نمایش جزئیات'}
                                                </ThemedText>
                                                <MaterialCommunityIcons
                                                    name={showDetailedBreakdown ? 'chevron-up' : 'chevron-down'}
                                                    size={18}
                                                    color={theme.primaryText}
                                                />
                                            </Pressable>
                                        </View>

                                        {showDetailedBreakdown ? (
                                            <View style={styles.breakdownGrid}>
                                                {result.breakdown.map((item) => (
                                                    <View key={`${item.year}-${item.periodIndex}`} style={[styles.breakdownItemCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                                                        <View style={styles.breakdownItemHeaderRow}>
                                                            <ThemedText type="smallBold" style={[styles.breakdownItemTitle, { color: theme.text }]}>
                                                                {`سال ${toPersianDigits(String(item.year))} · ماه ${toPersianDigits(String(item.periodIndex))} (${formatMonthName(item.periodIndex)})`}
                                                            </ThemedText>
                                                        </View>

                                                        <View style={styles.breakdownDetailGrid}>
                                                            <View style={[styles.breakdownDetailBox, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}>
                                                                <ThemedText type="small" style={[styles.detailLabel, { color: theme.textSecondary }]}>
                                                                    روزهای پوشش
                                                                </ThemedText>
                                                                <ThemedText type="smallBold" style={[styles.detailValue, { color: theme.text }]}>
                                                                    {formatNumber(item.daysCovered)} روز
                                                                </ThemedText>
                                                            </View>
                                                            <View style={[styles.breakdownDetailBox, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}>
                                                                <ThemedText type="small" style={[styles.detailLabel, { color: theme.textSecondary }]}>
                                                                    {workHoursMethod === 'daily' ? 'ساعات کاری روزانه' : 'معادل ساعات کاری روزانه'}
                                                                </ThemedText>
                                                                <ThemedText type="smallBold" style={[styles.detailValue, { color: theme.text }]}>
                                                                    {formatDecimalHours(item.dailyHours)}
                                                                </ThemedText>
                                                            </View>
                                                            <View style={[styles.breakdownDetailBox, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}>
                                                                <ThemedText type="small" style={[styles.detailLabel, { color: theme.textSecondary }]}>
                                                                    روش محاسبه
                                                                </ThemedText>
                                                                <ThemedText type="smallBold" style={[styles.detailValue, { color: theme.text }]}>
                                                                    {item.calculationType === 'month-full' ? 'فرمول ۱' : 'فرمول ۲'}
                                                                </ThemedText>
                                                            </View>
                                                            <View style={[styles.breakdownDetailBox, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}>
                                                                <ThemedText type="small" style={[styles.detailLabel, { color: theme.textSecondary }]}>
                                                                    روزهای بیمه
                                                                </ThemedText>
                                                                <ThemedText type="smallBold" style={[styles.detailValue, { color: theme.primaryText }]}>
                                                                    {formatNumber(item.daysCalculated)}
                                                                </ThemedText>
                                                            </View>
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

            <PersianTimePickerModal
                visible={timePickerVisible}
                value={dailyWorkHours}
                title="انتخاب ساعات کاری روزانه"
                onClose={() => setTimePickerVisible(false)}
                onSelect={(value) => {
                    setDailyWorkHours(value);
                    setResult(null);
                    setTimePickerVisible(false);
                }}
                maxHours={7}
                maxMinutesAtMaxHour={20}
            />

            <Snackbar
                visible={snackbarVisible}
                onDismiss={() => setSnackbarVisible(false)}
                duration={5000}
                style={{ backgroundColor: theme.errorFill, borderRadius: Radius.md }}
                action={{
                    label: 'بستن',
                    onPress: () => setSnackbarVisible(false),
                    labelStyle: { color: theme.onStatus },
                }}
            >
                <ThemedText type="small" style={{ color: theme.onStatus }}>
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
    headerRow: {
        alignItems: 'stretch',
    },
    headerText: {
        alignSelf: 'stretch',
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
    workHoursSection: {
        gap: Spacing.two,
        padding: Spacing.two,
        borderRadius: 12,
        borderWidth: StyleSheet.hairlineWidth,
    },
    workHoursMethods: {
        gap: Spacing.one,
    },
    workHoursMethodOption: {
        minHeight: 52,
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.two,
        paddingHorizontal: Spacing.two,
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: 10,
    },
    workHoursMethodLabel: {
        flexShrink: 1,
        lineHeight: 20,
    },
    workHoursDivider: {
        height: StyleSheet.hairlineWidth,
        marginVertical: Spacing.one,
    },
    workHoursDetails: {
        gap: Spacing.two,
    },
    workHoursInput: {
        flex: 1,
        minHeight: 48,
        paddingVertical: 0,
        fontFamily: 'AppFont-Bold',
        fontSize: 16,
        writingDirection: 'ltr',
    },
    workHoursHint: {
        fontSize: 12,
        lineHeight: 18,
    },
    workHoursStepper: {
        minHeight: 54,
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: 12,
        padding: Spacing.one,
        gap: Spacing.one,
    },
    workHoursStepperButton: {
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 10,
    },
    workHoursStepperButtonDisabled: {
        opacity: 0.4,
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
    summaryLabel: {
        fontSize: 11,
    },
    amountValue: {
        fontSize: 16,
        lineHeight: 22,
        fontFamily: 'AppFont-Bold',
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
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
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
