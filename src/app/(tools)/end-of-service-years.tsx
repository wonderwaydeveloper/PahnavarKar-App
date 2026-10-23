import { MaterialCommunityIcons } from '@expo/vector-icons';
import { jalaaliMonthLength, toJalaali } from 'jalaali-js';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Card, Menu, Snackbar } from 'react-native-paper';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { FontAwareButton as Button, FontAwareMenuItem } from '@/components/font-aware-paper';
import { CurrencyAmountInput } from '@/components/currency-amount-input';
import { DailyWorkTimeField, getDailyWorkMinutes } from '@/components/daily-work-time-field';
import { DateInputField } from '@/components/date-input-field';
import { NumericInputField } from '@/components/numeric-input-field';
import { PersianDatePickerModal } from '@/components/persian-date-picker-modal';
import { SettlementThrough1391Field } from '@/components/settlement-through-1391-field';
import { ThemedText } from '@/components/themed-text';
import { CalculationDescriptionBox, CalculationResultHeading } from '@/components/calculation-card-sections';
import { ThemedView } from '@/components/themed-view';
import { WorkshopTypeSelector } from '@/components/workshop-type-selector';
import { Radius, Spacing } from '@/constants/theme';
import { fetchOfficialHolidaysBetweenDates, fetchJobGroups, fetchPeriodsByYearId, fetchSeniorityBaseByGroup, fetchYears, seedFromJsonAsset } from '@/database';
import { useTheme } from '@/hooks/use-theme';
import { useCurrencyFormatter } from '@/hooks/use-currency-formatter';
import { displayCurrencyToRial, getCurrencyLabel } from '@/utils/currency';
import { getDailyWorkRatio, scaleWageCalculationResult } from '@/utils/daily-work-ratio';
import { normalizeWorkHoursInput } from '@/utils/work-hours-input';
import {
    calculateOrdinaryWorkHoursFromPeriodData,
    calculateEndOfServiceYearsFromPeriodData,
    calculateEntitledSeniorityFromPeriodData,
    parseDateInput,
    type EndOfServiceYearsCalculationResult,
    type EntitledSeniorityWorkshopType,
    type SalaryPeriodBucket,
} from '@/utils/salary-calculation';
import { useAppContext } from '@/hooks/use-app-context';

type WorkHoursMethod = 'daily' | 'period';

export default function EndOfServiceYearsScreen() {
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
    const [employmentDate, setEmploymentDate] = useState(defaultStartDate);
    const [pickerTarget, setPickerTarget] = useState<'start' | 'end' | 'employment' | null>(null);
    const [workshopType, setWorkshopType] = useState<EntitledSeniorityWorkshopType>('unclassified');
    const [settledThrough1391, setSettledThrough1391] = useState(false);
    const [jobGroups, setJobGroups] = useState<{ id: number; group_number: number; sort_order: number }[]>([]);
    const [selectedGroup, setSelectedGroup] = useState<number | null>(null);
    const [groupMenuVisible, setGroupMenuVisible] = useState(false);
    const [pickerVisible, setPickerVisible] = useState(false);
    const [workHoursMethod, setWorkHoursMethod] = useState<WorkHoursMethod>('daily');
    const [periodBuckets, setPeriodBuckets] = useState<SalaryPeriodBucket[]>([]);
    const [officialHolidayDates, setOfficialHolidayDates] = useState<string[]>([]);
    const [availableYears, setAvailableYears] = useState<number[]>([]);
    const [isLoadingData, setIsLoadingData] = useState(true);
    const [result, setResult] = useState<EndOfServiceYearsCalculationResult | null>(null);
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

                const [years, groups] = await Promise.all([fetchYears(), fetchJobGroups()]);
                const buckets: SalaryPeriodBucket[] = [];

                for (const year of years) {
                    const periods = await fetchPeriodsByYearId(year.id);
                    if (periods.length === 0) {
                        continue;
                    }

                    const mappedPeriods = await Promise.all(periods.map(async (period) => ({
                        period_index: period.period_index,
                        month_count: period.month_count,
                        daily_minimum_wage: period.daily_minimum_wage,
                        percent_increase: period.percent_increase,
                        seniority_base: period.seniority_base,
                        seniority_base_by_group: Object.fromEntries(
                            (await fetchSeniorityBaseByGroup(period.id)).map((row) => {
                                const group = groups.find((item) => item.id === row.job_group_id);
                                return [group?.group_number ?? row.job_group_id, Number(row.base_value)];
                            }),
                        ),
                    })));

                    buckets.push({
                        year: year.year,
                        periods: mappedPeriods,
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
                    setJobGroups(groups);
                    setSelectedGroup(groups[0]?.group_number ?? null);
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

    const formatNumber = (value: number) =>
        toPersianDigits(Number.isInteger(value) ? String(value) : value.toFixed(2));

    const formatDisplayedDate = (value: string) => {
        const parsed = parseDateInput(value);

        if (!parsed) {
            return '';
        }

        return `${toPersianDigits(String(parsed.year))}/${toPersianDigits(String(parsed.month).padStart(2, '0'))}/${toPersianDigits(String(parsed.day).padStart(2, '0'))}`;
    };

    const openPicker = (target: 'start' | 'end' | 'employment') => {
        setPickerTarget(target);
        setPickerVisible(true);
    };

    const closePicker = () => {
        setPickerVisible(false);
        setPickerTarget(null);
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

    const resetWorkHoursForDateChange = () => {
        setActualWorkedHours(null);
        setWorkedHoursError('');
        setResult(null);
    };

    const canUseSettlementPath = (parseDateInput(employmentDate)?.year ?? 0) <= 1391;

    const handleDateSelect = (value: string) => {
        if (pickerTarget === 'employment') {
            setEmploymentDate(value);
            if (compareDates(value, endDate) > 0) {
                setEndDate(value);
                resetWorkHoursForDateChange();
            } else {
                setResult(null);
            }
        } else if (pickerTarget === 'start') {
            setStartDate(value);
            setEmploymentDate(value);
            if ((parseDateInput(value)?.year ?? 0) > 1391) setSettledThrough1391(false);
            resetWorkHoursForDateChange();

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
                    resetWorkHoursForDateChange();
                    setSnackbarMessage('تاریخ پایان باید برابر یا بزرگتر از تاریخ شروع باشد.');
                    setSnackbarVisible(true);
                    return;
                }
            }

            setEndDate(value);
            resetWorkHoursForDateChange();
        }
    };

    const { notifyCalculationCompleted } = useAppContext();
    const handleCalculate = () => {
        const employment = parseDateInput(employmentDate);

        if (!parsedStartDate || !parsedEndDate || !employment || !isDateRangeValid || compareDates(employmentDate, endDate) > 0) {
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

        if (periodBuckets.length === 0 || (workshopType === 'classified' && selectedGroup == null)) {
            setResult(null);
            return;
        }

        setWorkedHoursError('');
        const seniority = calculateEntitledSeniorityFromPeriodData(
            employment,
            parsedEndDate,
            periodBuckets,
            workshopType,
            selectedGroup ?? undefined,
            settledThrough1391,
        );
        const dailySeniorityByPeriod = Object.fromEntries(
            seniority.breakdown.map((item) => [`${item.year}:${item.periodIndex}`, item.entitlement]),
        );
        const calculation = calculateEndOfServiceYearsFromPeriodData(
            parsedStartDate,
            parsedEndDate,
            periodBuckets,
            seniority.finalEntitlement,
            dailySeniorityByPeriod,
        );

        if (calculation.breakdown.length === 0) {
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
    const normalizedAmountPaid = amountPaidToWorker
        .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
        .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));
    const amountPaidInSelectedCurrency = Number(normalizedAmountPaid);
    const amountPaidInRial = displayCurrencyToRial(amountPaidInSelectedCurrency, currencyPreference);
    const isPaidAmountValid = Number.isSafeInteger(amountPaidInSelectedCurrency)
        && amountPaidInSelectedCurrency >= 0
        && Number.isSafeInteger(amountPaidInRial)
        && (currencyPreference !== 'toman'
            || amountPaidInSelectedCurrency <= Math.floor(Number.MAX_SAFE_INTEGER / 10));
    const remainingEndOfServiceAmount = result && isPaidAmountValid
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
                                        محاسبه سنوات پایان کار
                                    </ThemedText>
                                    <CalculationDescriptionBox>
                                        <ThemedText type="small" style={[styles.pageDescription, { color: theme.textSecondary }]}>
                                            محاسبه سنوات پایان کار براساس ماده ۲۴ قانون کار
                                        </ThemedText>
                                    </CalculationDescriptionBox>
                                </View>
                            </View>

                            <View style={[styles.formulaBox, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}>
                                <ThemedText type="small" style={[styles.formulaLabel, { color: theme.textSecondary }]}>
                                    فرمول محاسبه
                                </ThemedText>
                                <ThemedText type="small" style={[styles.formulaValue, { color: theme.text }]}>
                                    تعداد کل ماه کارکرد × ۲٫۵ × (حداقل مزد روزانه مصوب شورای عالی کار در آخرین روز کارکرد + پایه سنوات استحقاقی کارگر در آخرین روز کارکرد)
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

                            <DateInputField
                                label="تاریخ استخدام"
                                value={employmentDate}
                                onPress={() => openPicker('employment')}
                                formatValue={formatDisplayedDate}
                                iconName="calendar-account-outline"
                                helperText="جهت محاسبه پایه سنوات استحقاقی و اعمال آن در محاسبات"
                            />

                            <WorkshopTypeSelector value={workshopType} onValueChange={setWorkshopType} />

                            {workshopType === 'classified' ? (
                                <View style={[styles.metricBox, { backgroundColor: theme.surfaceVariant }]}>
                                    <ThemedText type="small" style={[styles.sectionLabel, { color: theme.textSecondary }]}>گروه شغلی</ThemedText>
                                    <Menu
                                        visible={groupMenuVisible}
                                        onDismiss={() => setGroupMenuVisible(false)}
                                        anchor={<Pressable onPress={() => setGroupMenuVisible(true)}><View style={[styles.dateInput, { backgroundColor: theme.surface, borderColor: theme.border }]}><ThemedText type="small" style={{ color: theme.text }}>{selectedGroup == null ? 'انتخاب گروه' : `گروه ${toPersianDigits(String(selectedGroup))}`}</ThemedText><MaterialCommunityIcons name="briefcase-outline" size={18} color={theme.primaryText} /></View></Pressable>}
                                    >
                                        {jobGroups.map((group) => <FontAwareMenuItem key={group.id} title={`گروه ${toPersianDigits(String(group.group_number))}`} onPress={() => { setSelectedGroup(group.group_number); setGroupMenuVisible(false); }} />)}
                                    </Menu>
                                </View>
                            ) : null}

                            <SettlementThrough1391Field checked={settledThrough1391} enabled={canUseSettlementPath} onChange={setSettledThrough1391} />
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
                                <ThemedText type="small" style={{ color: theme.textSecondary }}>
                                    این مبلغ از سنوات پایان کار محاسبه‌شده کسر می‌شود.
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
                                    icon="briefcase-clock"
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
                                        <View style={styles.summaryDetails}>
                                            <View style={[styles.summaryBoxContent, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                                                <ThemedText type="small" style={[styles.summaryLabel, { color: theme.textSecondary }]}>
                                                    مبلغ کل سنوات پایان کار
                                                </ThemedText>
                                                <ThemedText type="smallBold" style={[styles.amountValue, { color: theme.primaryText }]}>
                                                    {formattedResult}
                                                </ThemedText>
                                            </View>

                                            <View style={[styles.summaryBoxContent, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                                                <ThemedText type="small" style={[styles.summaryLabel, { color: theme.textSecondary }]}>تعداد ماه‌های کارکرد</ThemedText>
                                                <ThemedText type="smallBold" style={[styles.amountValue, { color: theme.primaryText }]}>{formatNumber(result.totalMonthEquivalent)} ماه</ThemedText>
                                            </View>
                                            <View style={[styles.summaryBoxContent, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                                                <ThemedText type="small" style={[styles.summaryLabel, { color: theme.textSecondary }]}>حداقل مزد روز آخر</ThemedText>
                                                <ThemedText type="smallBold" style={[styles.amountValue, { color: theme.text }]}>{toPersianDigits(formatCurrency(result.finalDailyMinimumWage))}</ThemedText>
                                            </View>
                                            <View style={[styles.summaryBoxContent, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                                                <ThemedText type="small" style={[styles.summaryLabel, { color: theme.textSecondary }]}>{workshopType === 'classified' ? 'پایه سنوات استحقاقی روزانه گروه شغلی' : 'پایه سنوات استحقاقی روزانه'}</ThemedText>
                                                <ThemedText type="smallBold" style={[styles.amountValue, { color: theme.text }]}>{toPersianDigits(formatCurrency(result.finalDailySeniority))}</ThemedText>
                                            </View>
                                            <View style={[styles.summaryBoxContent, { backgroundColor: theme.primaryContainer, borderColor: theme.primary }]}>
                                                <ThemedText type="small" style={[styles.summaryLabel, { color: theme.textSecondary }]}>{workshopType === 'classified' ? 'مزد مبنا روزانه' : 'مزد ثابت روزانه'}</ThemedText>
                                                <ThemedText type="smallBold" style={[styles.amountValue, { color: theme.primaryText }]}>{toPersianDigits(formatCurrency(result.finalDailyWage))}</ThemedText>
                                            </View>
                                            <View style={[styles.summaryBoxContent, { backgroundColor: theme.primaryContainer, borderColor: theme.primary }]}>
                                                <ThemedText type="small" style={[styles.summaryLabel, { color: theme.textSecondary }]}>
                                                    مبلغ سنوات پایان کار پس از کسر مبلغ پرداخت‌شده به کارگر
                                                </ThemedText>
                                                <ThemedText type="smallBold" style={[styles.amountValue, { color: theme.primaryText }]}>
                                                    {remainingEndOfServiceAmount === null
                                                        ? 'مبلغ پرداخت‌شده نامعتبر است'
                                                        : toPersianDigits(formatCurrency(remainingEndOfServiceAmount))}
                                                </ThemedText>
                                            </View>
                                        </View>

                                    </Card.Content>
                                </Card>
                            ) : null}
                        </Card.Content>
                    </Card>
                </SafeAreaView>
            </ScrollView>

            <PersianDatePickerModal
                visible={pickerVisible}
                value={pickerTarget === 'employment' ? employmentDate : pickerTarget === 'start' ? startDate : endDate}
                title={pickerTarget === 'employment' ? 'انتخاب تاریخ استخدام' : pickerTarget === 'start' ? 'انتخاب تاریخ شروع' : 'انتخاب تاریخ پایان'}
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
    formulaBox: {
        borderRadius: 12,
        borderWidth: 1,
        padding: Spacing.two,
        gap: Spacing.one,
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
    sectionLabel: {
        fontSize: 11,
        fontWeight: '500',
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
    fieldValue: {
        fontSize: 13,
        flex: 1,
    },
    optionSection: { gap: Spacing.two },
    optionsRow: {
        flexDirection: 'row',
        gap: Spacing.two,
    },
    optionButton: {
        flex: 1,
        minHeight: 44,
        borderRadius: 12,
        borderWidth: StyleSheet.hairlineWidth,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: Spacing.two,
    },
    checkRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: Spacing.two },
    checkboxRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
    checkText: { flex: 1, gap: Spacing.one },
    optionTitle: { fontSize: 13, lineHeight: 19, fontFamily: 'AppFont-Bold' },
    optionDescription: { fontSize: 11, lineHeight: 20, fontFamily: 'AppFont-Regular' },
    helpRow: {
        marginTop: Spacing.one,
    },
    helpText: {
        lineHeight: 20,
        fontSize: 11,
        fontFamily: 'AppFont-Regular',
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
    paidAmountSection: {
        gap: Spacing.one,
        padding: Spacing.two,
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: 12,
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
    summaryBoxContent: {
        width: '100%',
        borderRadius: 12,
        borderWidth: 1,
        padding: Spacing.two,
        gap: Spacing.one,
        alignItems: 'center',
    },
    summaryDetails: {
        gap: Spacing.two,
    },
    summaryLabel: {
        fontSize: 12,
        lineHeight: 18,
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
    formulaLabel: {
        fontSize: 11,
        fontWeight: '500',
    },
    formulaValue: {
        fontSize: 13,
        lineHeight: 18,
    },
});
