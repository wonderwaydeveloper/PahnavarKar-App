import { MaterialCommunityIcons } from '@expo/vector-icons';
import { jalaaliMonthLength, toJalaali } from 'jalaali-js';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Card, Menu, Snackbar } from 'react-native-paper';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { FontAwareButton as Button, FontAwareMenuItem } from '@/components/font-aware-paper';
import { CurrencyAmountInput } from '@/components/currency-amount-input';
import { HiddenCalculationGuide } from '@/components/hidden-calculation-guide';
import { DailyWorkTimeField, getDailyWorkMinutes } from '@/components/daily-work-time-field';
import { DateInputField } from '@/components/date-input-field';
import { NumericInputField } from '@/components/numeric-input-field';
import { PersianDatePickerModal } from '@/components/persian-date-picker-modal';
import { ThemedText } from '@/components/themed-text';
import { CalculationDescriptionBox, CalculationResultHeading } from '@/components/calculation-card-sections';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { fetchOfficialHolidaysBetweenDates, fetchPeriodsByYearId, fetchYears, seedFromJsonAsset } from '@/database';
import { useTheme } from '@/hooks/use-theme';
import { useCurrencyFormatter } from '@/hooks/use-currency-formatter';
import { displayCurrencyToRial, getCurrencyLabel } from '@/utils/currency';
import { getDailyWorkRatio, scaleWageCalculationResult } from '@/utils/daily-work-ratio';
import { normalizeWorkHoursInput } from '@/utils/work-hours-input';
import {
    calculateOrdinaryWorkHoursFromPeriodData,
    calculateFamilyAllowanceFromPeriodData,
    parseDateInput,
    type FamilyAllowanceCalculationResult,
    type SalaryPeriodBucket,
} from '@/utils/salary-calculation';
import { useAppContext } from '@/hooks/use-app-context';

const CHILDREN_OPTIONS = Array.from({ length: 12 }, (_, index) => index + 1);
type WorkHoursMethod = 'daily' | 'period';

export default function FamilyAllowanceScreen() {
    const theme = useTheme();
    const { currencyPreference, formatCurrency } = useCurrencyFormatter();
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
    const [childrenCount, setChildrenCount] = useState(1);
    const [childrenMenuVisible, setChildrenMenuVisible] = useState(false);
    const [workHoursMethod, setWorkHoursMethod] = useState<WorkHoursMethod>('daily');
    const [periodBuckets, setPeriodBuckets] = useState<SalaryPeriodBucket[]>([]);
    const [officialHolidayDates, setOfficialHolidayDates] = useState<string[]>([]);
    const [availableYears, setAvailableYears] = useState<number[]>([]);
    const [isLoadingData, setIsLoadingData] = useState(true);
    const [showDetailedBreakdown, setShowDetailedBreakdown] = useState(false);
    const [result, setResult] = useState<FamilyAllowanceCalculationResult | null>(null);
    const [dailyWorkTime, setDailyWorkTime] = useState('07:20');
    const [actualWorkedHours, setActualWorkedHours] = useState<string | null>(null);
    const [workedHoursError, setWorkedHoursError] = useState('');
    const [amountPaidToWorker, setAmountPaidToWorker] = useState('۰');
    const [snackbarVisible, setSnackbarVisible] = useState(false);
    const [snackbarMessage, setSnackbarMessage] = useState('');

    useEffect(() => {
        let isMounted = true;

        const loadData = async () => {
            try {
                setIsLoadingData(true);
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
                            child_allowance: period.child_allowance,
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

    const formatDisplayedDate = (value: string) => {
        const parsed = parseDateInput(value);

        if (!parsed) {
            return '';
        }

        return `${toPersianDigits(String(parsed.year))}/${toPersianDigits(String(parsed.month).padStart(2, '0'))}/${toPersianDigits(String(parsed.day).padStart(2, '0'))}`;
    };

    const parsedStartDate = useMemo(() => parseDateInput(startDate), [startDate]);
    const parsedEndDate = useMemo(() => parseDateInput(endDate), [endDate]);
    const isDateRangeValid = !!parsedStartDate
        && !!parsedEndDate
        && parsedStartDate.year * 10000 + parsedStartDate.month * 100 + parsedStartDate.day
            <= parsedEndDate.year * 10000 + parsedEndDate.month * 100 + parsedEndDate.day;
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
    const workRatio = requiredWorkHours && isActualWorkedHoursValid
        ? Math.min(normalizedActualWorkedHours, requiredWorkHours) / requiredWorkHours
        : null;

    const getMaximumWorkHoursError = () =>
        `حداکثر ساعات قابل ورود در این بازه ${toPersianDigits((maximumAllowedWorkHours ?? 0).toFixed(2))} ساعت است.`;

    const handleActualWorkedHoursChange = (value: string) => {
        const normalizedValue = normalizeWorkHoursInput(value);
        const numericValue = Number(normalizedValue);
        if (
            maximumAllowedWorkHours !== null
            && Number.isFinite(numericValue)
            && numericValue > maximumAllowedWorkHours
        ) {
            setActualWorkedHours(maximumAllowedWorkHours.toFixed(2));
            setWorkedHoursError(getMaximumWorkHoursError());
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

    const openChildrenMenu = () => {
        setChildrenMenuVisible(true);
    };

    const closeChildrenMenu = () => {
        setChildrenMenuVisible(false);
    };

    const handleDateSelect = (value: string) => {
        if (pickerTarget === 'start') {
            setStartDate(value);
            setActualWorkedHours(null);
            setWorkedHoursError('');
            setResult(null);
            if (endDate) {
                const parsedStart = parseDateInput(value);
                const parsedEnd = parseDateInput(endDate);
                if (parsedStart && parsedEnd) {
                    const startValue = parsedStart.year * 10000 + parsedStart.month * 100 + parsedStart.day;
                    const endValue = parsedEnd.year * 10000 + parsedEnd.month * 100 + parsedEnd.day;
                    if (startValue > endValue) {
                        setEndDate(value);
                    }
                }
            }
            return;
        }

        if (pickerTarget === 'end') {
            if (startDate) {
                const parsedStart = parseDateInput(startDate);
                const parsedEnd = parseDateInput(value);
                if (parsedStart && parsedEnd) {
                    const leftValue = parsedStart.year * 10000 + parsedStart.month * 100 + parsedStart.day;
                    const rightValue = parsedEnd.year * 10000 + parsedEnd.month * 100 + parsedEnd.day;
                    if (rightValue < leftValue) {
                        setEndDate(startDate);
                        setActualWorkedHours(null);
                        setWorkedHoursError('');
                        setResult(null);
                        setSnackbarMessage('تاریخ پایان باید برابر یا بزرگتر از تاریخ شروع باشد.');
                        setSnackbarVisible(true);
                        return;
                    }
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
        if (!parsedStartDate || !parsedEndDate || !isDateRangeValid) {
            setSnackbarMessage('بازهٔ زمانی واردشده معتبر نیست.');
            setSnackbarVisible(true);
            setResult(null);
            return;
        }

        if (periodBuckets.length === 0) {
            setSnackbarMessage('داده دوره‌ای برای محاسبه موجود نیست.');
            setSnackbarVisible(true);
            setResult(null);
            return;
        }

        if (workHoursMethod === 'period' && !isActualWorkedHoursValid) {
            setResult(null);
            setWorkedHoursError('مجموع ساعات کارکرد کارگر را به‌صورت عدد معتبر وارد کنید.');
            return;
        }

        if (workHoursMethod === 'period' && requiredWorkHours === null) {
            setResult(null);
            setSnackbarMessage('برای بازهٔ انتخاب‌شده اطلاعات ساعات کارکرد موظفی در دسترس نیست.');
            setSnackbarVisible(true);
            return;
        }

        if (workHoursMethod === 'period' && (requiredWorkHours ?? 0) <= 0) {
            setResult(null);
            setSnackbarMessage('برای بازهٔ انتخاب‌شده ساعات کارکرد موظفی قابل محاسبه نیست.');
            setSnackbarVisible(true);
            return;
        }

        if (
            workHoursMethod === 'period'
            && maximumAllowedWorkHours !== null
            && normalizedActualWorkedHours > maximumAllowedWorkHours
        ) {
            setResult(null);
            setWorkedHoursError(getMaximumWorkHoursError());
            return;
        }

        setWorkedHoursError('');
        const calculation = calculateFamilyAllowanceFromPeriodData(
            parsedStartDate,
            parsedEndDate,
            periodBuckets,
            childrenCount,
        );

        if (calculation.breakdown.length === 0) {
            setSnackbarMessage('برای بازه انتخاب‌شده ماه کارکرد یا حق عائله‌مندی ثبت نشده است.');
            setSnackbarVisible(true);
            setResult(null);
            return;
        }

        const calculationWorkRatio = workHoursMethod === 'daily'
            ? getDailyWorkRatio(getDailyWorkMinutes(dailyWorkTime))
            : Math.min(normalizedActualWorkedHours, requiredWorkHours ?? 0) / (requiredWorkHours ?? 1);
        setResult(scaleWageCalculationResult(calculation, calculationWorkRatio));
        notifyCalculationCompleted();
    };

    const formattedResult = useMemo(() => {
        if (!result) {
            return formatCurrency(0);
        }

        return toPersianDigits(formatCurrency(result.totalAmount));
    }, [formatCurrency, result]);
    const normalizedAmountPaid = amountPaidToWorker.replace(/[۰-۹]/g, (digit) =>
        String(persianDigits.indexOf(digit)),
    );
    const amountPaidInSelectedCurrency = Number(normalizedAmountPaid);
    const amountPaidInRial = displayCurrencyToRial(amountPaidInSelectedCurrency, currencyPreference);
    const isPaidAmountValid = Number.isSafeInteger(amountPaidInSelectedCurrency)
        && amountPaidInSelectedCurrency >= 0
        && Number.isSafeInteger(amountPaidInRial);
    const remainingAllowance = result && isPaidAmountValid
        ? Math.max(0, Math.round(result.totalAmount) - amountPaidInRial)
        : null;

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
                                        محاسبه حق عائله مندی
                                    </ThemedText>
                                    <CalculationDescriptionBox>
                                        <ThemedText type="small" style={[styles.pageDescription, { color: theme.textSecondary }]}>
                                            محاسبه حق عائله مندی براساس بند۲ماده ۸۶قانون تامین اجتماعی
                                        </ThemedText>
                                    </CalculationDescriptionBox>
                                </View>
                            </View>

                            <HiddenCalculationGuide>
                                مبلغ هر دوره بر پایهٔ مبلغ ماهانهٔ مصوب برای هر فرزند واجد شرایط، تعداد فرزندان و سهم بازهٔ پوشش محاسبه می‌شود؛ ماه ناقص به نسبت روزهای پوشش‌یافته به روزهای ماه محاسبه می‌شود. در صورت ساعات کار کمتر از تمام‌وقت، نسبت ساعات کار نیز اعمال می‌شود.
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

                            <View style={[styles.metricBox, { backgroundColor: theme.surfaceVariant }]}>
                                <ThemedText type="small" style={[styles.sectionLabel, { color: theme.textSecondary }]}>
                                    تعداد فرزندان واجد شرایط
                                </ThemedText>
                                <Menu
                                    visible={childrenMenuVisible}
                                    onDismiss={closeChildrenMenu}
                                    anchor={
                                        <Pressable onPress={openChildrenMenu}>
                                            <View style={[styles.dateInput, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                                                <ThemedText type="small" style={[styles.fieldValue, { color: theme.text }]}>
                                                    {`${toPersianDigits(String(childrenCount))} فرزند`}
                                                </ThemedText>
                                                <MaterialCommunityIcons name="account-group-outline" size={18} color={theme.primaryText} />
                                            </View>
                                        </Pressable>
                                    }
                                    contentStyle={{ borderRadius: 16, backgroundColor: theme.surface }}
                                >
                                    {CHILDREN_OPTIONS.map((count) => (
                                        <FontAwareMenuItem
                                            key={count}
                                            onPress={() => {
                                                setChildrenCount(count);
                                                closeChildrenMenu();
                                            }}
                                            title={`${toPersianDigits(String(count))} فرزند`}
                                            titleStyle={{ fontFamily: 'AppFont-Regular', color: theme.text }}
                                        />
                                    ))}
                                </Menu>
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
                                    <DailyWorkTimeField
                                        value={dailyWorkTime}
                                        embedded
                                        onChange={(value) => {
                                            setDailyWorkTime(value);
                                            setResult(null);
                                        }}
                                    />
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
                                        {workRatio !== null && requiredWorkHours !== null && requiredWorkHours > 0 ? (
                                            <ThemedText type="small" style={[styles.workHoursHint, { color: theme.textSecondary }]}>
                                                • نسبت ساعات کارکرد: {toPersianDigits(workRatio.toFixed(4))}
                                            </ThemedText>
                                        ) : null}
                                    </View>
                                )}
                            </View>
                            <View style={[styles.paidAmountSection, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}>
                                <ThemedText type="small" style={{ color: theme.textSecondary }}>
                                    مبلغ پرداخت‌شده به کارگر در این بازه ({getCurrencyLabel(currencyPreference)})
                                </ThemedText>
                                <CurrencyAmountInput
                                    value={amountPaidToWorker}
                                    onChangeText={setAmountPaidToWorker}
                                    currencyPreference={currencyPreference}
                                    accessibilityLabel="مبلغ پرداخت‌شده به کارگر در بازهٔ انتخابی"
                                />
                                <ThemedText type="small" style={[styles.paidAmountHint, { color: theme.textSecondary }]}>
                                    این مبلغ از حق عائله‌مندی محاسبه‌شده کسر می‌شود؛ این مزیت مشمول کسر بیمه نیست.
                                </ThemedText>
                                {!isPaidAmountValid ? (
                                    <ThemedText type="small" style={{ color: theme.error }}>
                                        مبلغ باید عدد صحیح و نامنفیِ قابل محاسبه باشد.
                                    </ThemedText>
                                ) : null}
                            </View>
                            <View style={styles.actionsGroup}>
                                <Button
                                    mode="contained"
                                    onPress={handleCalculate}
                                    icon="family-tree"
                                    style={styles.actionButton}
                                    labelStyle={styles.actionLabel}
                                    buttonColor={theme.primary}
                                    textColor={theme.onPrimary}
                                    loading={isLoadingData}
                                    disabled={isLoadingData}
                                >
                                    محاسبه
                                </Button>

                            </View>

                            {result ? (
                                <Card style={[styles.breakdownCard, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}>
                                    <Card.Content style={styles.breakdownContent}>
                                        <CalculationResultHeading />
                                        <View style={{ marginBottom: Spacing.one }}>
                                            <ThemedText type="smallBold" style={[styles.breakdownSectionTitle, { color: theme.text }]}>جزئیات محاسبه</ThemedText>
                                        </View>
                                        <View style={styles.summaryBoxHeader}>
                                            <View style={[styles.summaryBoxContent, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                                                <ThemedText type="small" style={[styles.summaryLabel, { color: theme.textSecondary }]}>
                                                    مبلغ کل حق عائله‌مندی
                                                </ThemedText>
                                                <ThemedText type="largeTitle" style={[styles.amountValue, { color: theme.primaryText }]}>
                                                    {formattedResult}
                                                </ThemedText>
                                            </View>
                                            <View style={[styles.summaryBoxContent, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}>
                                                <ThemedText type="small" style={[styles.summaryLabel, { color: theme.textSecondary }]}>
                                                    مبلغ پرداخت‌شده به کارگر
                                                </ThemedText>
                                                <ThemedText type="smallBold" style={[styles.amountValue, { color: theme.text }]}>
                                                    {isPaidAmountValid
                                                        ? formatCurrency(amountPaidInRial)
                                                        : 'مبلغ پرداخت‌شده نامعتبر است'}
                                                </ThemedText>
                                            </View>
                                            <View style={[styles.summaryBoxContent, { backgroundColor: theme.primaryContainer, borderColor: theme.primary }]}>
                                                <ThemedText type="smallBold" style={[styles.summaryLabel, { color: theme.textSecondary }]}>
                                                    حق عائله‌مندی پس از کسر مبلغ پرداخت‌شده
                                                </ThemedText>
                                                <ThemedText type="largeTitle" style={[styles.amountValue, { color: theme.primaryText }]}>
                                                    {remainingAllowance === null
                                                        ? 'مبلغ پرداخت‌شده نامعتبر است'
                                                        : formatCurrency(remainingAllowance)}
                                                </ThemedText>
                                            </View>
                                        </View>

                                        <View style={styles.breakdownSectionHeader}>
                                            <ThemedText type="smallBold" style={[styles.breakdownSectionTitle, { color: theme.text }]}>
                                                جزئیات دوره‌ها
                                            </ThemedText>
                                            <Pressable
                                                onPress={() => setShowDetailedBreakdown((value) => !value)}
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
                                                {result.breakdown.map((item, index) => (
                                                    <View
                                                        key={`${item.year}-${item.periodIndex}-${index}`}
                                                        style={[
                                                            styles.breakdownItemCard,
                                                            {
                                                                backgroundColor: theme.surface,
                                                                borderColor: theme.border,
                                                            },
                                                        ]}
                                                    >
                                                        <View style={styles.breakdownItemHeaderRow}>
                                                            <ThemedText type="smallBold" style={[styles.breakdownItemTitle, { color: theme.text }]}>
                                                                {`سال ${toPersianDigits(String(item.year))}${(periodBuckets.find((bucket) => bucket.year === item.year)?.periods.length ?? 0) > 1 ? ` · دوره ${toPersianDigits(String(item.periodIndex))}` : ''}`}
                                                            </ThemedText>
                                                        </View>

                                                        <View style={styles.breakdownDetailGrid}>
                                                            <View style={[styles.breakdownDetailBox, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}>
                                                                <ThemedText type="small" style={[styles.detailLabel, { color: theme.textSecondary }]}>
                                                                    تعداد ماه‌های شمول
                                                                </ThemedText>
                                                                <ThemedText type="smallBold" style={[styles.detailValue, { color: theme.text }]}>
                                                                    {toPersianDigits(item.monthsCovered.toFixed(2).replace(/\.00$/, ''))} ماه
                                                                </ThemedText>
                                                            </View>
                                                            <View style={[styles.breakdownDetailBox, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}>
                                                                <ThemedText type="small" style={[styles.detailLabel, { color: theme.textSecondary }]}>
                                                                    مبلغ عائله مندی به یک فرزند واجد شرایط
                                                                </ThemedText>
                                                                <ThemedText type="smallBold" style={[styles.detailValue, { color: theme.text }]}>
                                                                    {item.childAllowance != null ? toPersianDigits(formatCurrency(item.childAllowance)) : '-'}
                                                                </ThemedText>
                                                            </View>
                                                            <View style={[styles.breakdownDetailBox, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}>
                                                                <ThemedText type="small" style={[styles.detailLabel, { color: theme.textSecondary }]}>
                                                                    مبلغ این دوره
                                                                </ThemedText>
                                                                <ThemedText type="smallBold" style={[styles.detailValue, { color: theme.primaryText }]}>
                                                                    {toPersianDigits(formatCurrency(item.amount))}
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
        borderWidth: 1,
        overflow: 'hidden',
    },
    cardContent: {
        gap: Spacing.three,
        paddingVertical: Spacing.four,
        paddingHorizontal: Spacing.three,
    },
    headerRow: {
        alignItems: 'flex-start',
    },
    headerText: {
        flex: 1,
        alignSelf: 'stretch',
        gap: Spacing.one,
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
    paidAmountSection: {
        gap: Spacing.one,
        padding: Spacing.two,
        borderRadius: 12,
        borderWidth: StyleSheet.hairlineWidth,
    },
    paidAmountHint: {
        fontSize: 12,
        lineHeight: 18,
    },
    metricsRow: {
        flexDirection: 'row',
        alignItems: 'stretch',
        gap: Spacing.two,
    },
    metricBox: {
        flex: 1,
        borderRadius: 12,
        padding: Spacing.two,
        gap: Spacing.one,
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
        paddingHorizontal: Spacing.two,
        paddingVertical: Spacing.two,
        borderRadius: 8,
        borderWidth: 1,
        minHeight: 40,
    },
    childrenSection: {
        gap: Spacing.two,
    },
    childSelectorButton: {
        borderRadius: 12,
        paddingHorizontal: Spacing.four,
    },
    childrenOptionsRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: Spacing.two,
    },
    childOption: {
        minWidth: 42,
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: 12,
        paddingHorizontal: Spacing.three,
        paddingVertical: Spacing.two,
        alignItems: 'center',
        justifyContent: 'center',
    },
    actionsGroup: {
        flexDirection: 'row',
        gap: Spacing.two,
        marginTop: Spacing.one,
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
    breakdownSectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: Spacing.one,
        paddingVertical: Spacing.one,
        gap: Spacing.one,
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
    breakdownSectionTitle: {
        fontSize: 13,
        fontFamily: 'AppFont-Bold',
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
    breakdownItemTitle: {
        fontSize: 12,
    },
    breakdownSummaryPill: {
        alignSelf: 'flex-start',
        borderRadius: 999,
        borderWidth: StyleSheet.hairlineWidth,
        paddingHorizontal: Spacing.two,
        paddingVertical: Spacing.one,
    },
    breakdownPillValue: {
        fontSize: 12,
        lineHeight: 18,
        fontFamily: 'AppFont-Bold',
    },
    breakdownItemHeaderRow: {
        paddingTop: 2,
        paddingBottom: 2,
        marginBottom: 2,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: 'rgba(0, 0, 0, 0.12)',
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
    sectionLabel: {
        fontSize: 11,
        fontWeight: '500',
    },
    fieldValue: {
        fontSize: 13,
        flex: 1,
    },
    summaryLabel: {
        fontSize: 11,
    },
    amountValue: {
        fontSize: 16,
        lineHeight: 22,
        fontFamily: 'AppFont-Bold',
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
