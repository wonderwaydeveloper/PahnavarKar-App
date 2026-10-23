import { MaterialCommunityIcons } from '@expo/vector-icons';
import { jalaaliMonthLength, toJalaali } from 'jalaali-js';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Card, Menu, Snackbar } from 'react-native-paper';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { FontAwareButton as Button, FontAwareMenuItem } from '@/components/font-aware-paper';
import { CalculationDescriptionBox, CalculationResultHeading } from '@/components/calculation-card-sections';
import { CurrencyAmountInput } from '@/components/currency-amount-input';
import { DailyWorkTimeField, getDailyWorkMinutes } from '@/components/daily-work-time-field';
import { DateInputField } from '@/components/date-input-field';
import { NumericInputField } from '@/components/numeric-input-field';
import { PersianDatePickerModal } from '@/components/persian-date-picker-modal';
import { SettlementThrough1391Field } from '@/components/settlement-through-1391-field';
import { ThemedText } from '@/components/themed-text';
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
    calculateEntitledSeniorityFromPeriodData,
    parseDateInput,
    type EntitledSeniorityCalculationResult,
    type EntitledSeniorityWorkshopType,
    type SalaryPeriodBucket,
} from '@/utils/salary-calculation';
import { useAppContext } from '@/hooks/use-app-context';

type WorkHoursMethod = 'daily' | 'period';

export default function EntitledSeniorityScreen() {
    const theme = useTheme();
    const { currencyPreference, formatCurrency } = useCurrencyFormatter();
    const insets = useSafeAreaInsets();
    const currentDate = useMemo(() => {
        const today = new Date();
        return toJalaali(today.getFullYear(), today.getMonth() + 1, today.getDate());
    }, []);
    const defaultEmploymentDate = `${currentDate.jy - 1}/01/01`;
    const defaultEndDate = `${currentDate.jy}/12/${jalaaliMonthLength(currentDate.jy, 12)}`;

    const [employmentDate, setEmploymentDate] = useState(defaultEmploymentDate);
    const [endDate, setEndDate] = useState(defaultEndDate);
    const [pickerTarget, setPickerTarget] = useState<'employment' | 'end' | null>(null);
    const [workHoursMethod, setWorkHoursMethod] = useState<WorkHoursMethod>('daily');
    const [workshopType, setWorkshopType] = useState<EntitledSeniorityWorkshopType>('unclassified');
    const [settledThrough1391, setSettledThrough1391] = useState(false);
    const [jobGroups, setJobGroups] = useState<{ id: number; group_number: number; sort_order: number }[]>([]);
    const [selectedGroup, setSelectedGroup] = useState<number | null>(null);
    const [groupMenuVisible, setGroupMenuVisible] = useState(false);
    const [periodBuckets, setPeriodBuckets] = useState<SalaryPeriodBucket[]>([]);
    const [officialHolidayDates, setOfficialHolidayDates] = useState<string[]>([]);
    const [availableYears, setAvailableYears] = useState<number[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [result, setResult] = useState<EntitledSeniorityCalculationResult | null>(null);
    const [isWorkerInsuranceExempt, setIsWorkerInsuranceExempt] = useState(false);
    const [isLegalBasisVisible, setIsLegalBasisVisible] = useState(false);
    const [dailyWorkTime, setDailyWorkTime] = useState('07:20');
    const [actualWorkedHours, setActualWorkedHours] = useState<string | null>(null);
    const [workedHoursError, setWorkedHoursError] = useState('');
    const [amountPaidToWorker, setAmountPaidToWorker] = useState('۰');
    const [showDetails, setShowDetails] = useState(false);
    const [snackbarVisible, setSnackbarVisible] = useState(false);
    const [snackbarMessage, setSnackbarMessage] = useState('');

    useEffect(() => {
        let isMounted = true;

        const loadData = async () => {
            try {
                await seedFromJsonAsset();
                const [years, groups] = await Promise.all([fetchYears(), fetchJobGroups()]);
                const buckets: SalaryPeriodBucket[] = [];

                for (const year of years) {
                    const periods = await fetchPeriodsByYearId(year.id);
                    if (periods.length === 0) continue;

                    const mappedPeriods = [];
                    for (const period of periods) {
                        const groupRows = await fetchSeniorityBaseByGroup(period.id);
                        const seniorityBaseByGroup = Object.fromEntries(
                            groupRows.map((row) => {
                                const group = groups.find((item) => item.id === row.job_group_id);
                                return [group?.group_number ?? row.job_group_id, Number(row.base_value)];
                            }),
                        );
                        mappedPeriods.push({
                            period_index: period.period_index,
                            month_count: period.month_count,
                            daily_minimum_wage: period.daily_minimum_wage,
                            percent_increase: period.percent_increase,
                            seniority_base: period.seniority_base,
                            seniority_base_by_group: seniorityBaseByGroup,
                        });
                    }

                    buckets.push({ year: year.year, periods: mappedPeriods });
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
                if (isMounted) setIsLoading(false);
            }
        };

        void loadData();
        return () => { isMounted = false; };
    }, []);

    const persianDigits = '۰۱۲۳۴۵۶۷۸۹';
    const toPersianDigits = (value: string | number) => String(value).replace(/\d/g, (digit) => persianDigits[Number(digit)]);
    const formatDate = (value: string) => {
        const parsed = parseDateInput(value);
        return parsed ? `${toPersianDigits(parsed.year)}/${toPersianDigits(String(parsed.month).padStart(2, '0'))}/${toPersianDigits(String(parsed.day).padStart(2, '0'))}` : '';
    };
    const formatParsedDate = (value: { year: number; month: number; day: number }) =>
        `${toPersianDigits(value.year)}/${toPersianDigits(String(value.month).padStart(2, '0'))}/${toPersianDigits(String(value.day).padStart(2, '0'))}`;
    const canUseSettlementPath = (parseDateInput(employmentDate)?.year ?? 0) <= 1391;

    const compareDates = (left: string, right: string) => {
        const parsedLeft = parseDateInput(left);
        const parsedRight = parseDateInput(right);
        if (!parsedLeft || !parsedRight) return 0;
        return parsedLeft.year * 10000 + parsedLeft.month * 100 + parsedLeft.day - (parsedRight.year * 10000 + parsedRight.month * 100 + parsedRight.day);
    };

    const parsedEmploymentDate = useMemo(() => parseDateInput(employmentDate), [employmentDate]);
    const parsedEndDate = useMemo(() => parseDateInput(endDate), [endDate]);
    const isDateRangeValid = !!parsedEmploymentDate
        && !!parsedEndDate
        && compareDates(employmentDate, endDate) <= 0;
    const requiredWorkHours = useMemo(() => {
        if (!isDateRangeValid || !parsedEmploymentDate || !parsedEndDate) {
            return null;
        }

        const yearsInRange = Array.from(
            { length: parsedEndDate.year - parsedEmploymentDate.year + 1 },
            (_, index) => parsedEmploymentDate.year + index,
        );
        if (yearsInRange.some((year) => !periodBuckets.some((bucket) => bucket.year === year))) {
            return null;
        }

        const calculation = calculateOrdinaryWorkHoursFromPeriodData(
            parsedEmploymentDate,
            parsedEndDate,
            periodBuckets,
            officialHolidayDates,
        );

        return calculation.breakdown.length > 0 ? calculation.totalHours : null;
    }, [isDateRangeValid, officialHolidayDates, parsedEndDate, parsedEmploymentDate, periodBuckets]);
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

    const selectDate = (value: string) => {
        if (pickerTarget === 'employment') {
            setEmploymentDate(value);
            if ((parseDateInput(value)?.year ?? 0) > 1391) {
                setSettledThrough1391(false);
            }
            if (compareDates(value, endDate) > 0) setEndDate(value);
            resetWorkHoursForDateChange();
        } else if (pickerTarget === 'end') {
            if (compareDates(value, employmentDate) < 0) {
                setSnackbarMessage('تاریخ پایان باید برابر یا بزرگ‌تر از تاریخ استخدام باشد.');
                setSnackbarVisible(true);
            } else {
                setEndDate(value);
                resetWorkHoursForDateChange();
            }
        }
        setPickerTarget(null);
    };

    const { notifyCalculationCompleted } = useAppContext();
    const handleCalculate = () => {
        if (!parsedEmploymentDate || !parsedEndDate || !isDateRangeValid) {
            setSnackbarMessage('تاریخ‌های واردشده معتبر نیستند.');
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
        if (workshopType === 'classified' && selectedGroup == null) {
            setSnackbarMessage('گروه شغلی را انتخاب کنید.');
            setSnackbarVisible(true);
            return;
        }

        setWorkedHoursError('');
        const calculation = calculateEntitledSeniorityFromPeriodData(
            parsedEmploymentDate,
            parsedEndDate,
            periodBuckets,
            workshopType,
            selectedGroup ?? undefined,
            settledThrough1391,
        );
        if (calculation.breakdown.length === 0) {
            setSnackbarMessage('برای بازه انتخاب‌شده پایه سنوات قابل محاسبه‌ای پیدا نشد.');
            setSnackbarVisible(true);
            setResult(null);
            return;
        }
        const calculationWorkRatio = workHoursMethod === 'daily'
            ? getDailyWorkRatio(getDailyWorkMinutes(dailyWorkTime))
            : Math.min(normalizedActualWorkedHours, requiredWorkHours ?? 0) / (requiredWorkHours ?? 1);
        setResult(scaleWageCalculationResult(calculation, calculationWorkRatio));
        notifyCalculationCompleted();
        setShowDetails(false);
    };

    const selectedEndYear = parseDateInput(endDate)?.year;
    const finalYearBreakdown = result && selectedEndYear != null
        ? result.breakdown.filter((item) => item.year === selectedEndYear)
        : [];
    const totalPeriodEntitlement = result?.breakdown.reduce(
        (total, item) => total + item.daysCovered * item.entitlement,
        0,
    ) ?? 0;
    const roundedTotalPeriodEntitlement = Math.round(totalPeriodEntitlement);
    const workerInsuranceAmount = isWorkerInsuranceExempt
        ? 0
        : Math.round(roundedTotalPeriodEntitlement * 0.07);
    const employerInsuranceAmount = Math.round(roundedTotalPeriodEntitlement * 0.23);
    const finalClaimAmount = roundedTotalPeriodEntitlement - workerInsuranceAmount;
    const normalizedAmountPaid = amountPaidToWorker.replace(/[۰-۹]/g, (digit) =>
        String(persianDigits.indexOf(digit)),
    );
    const amountPaidInSelectedCurrency = Number(normalizedAmountPaid);
    const amountPaidInRial = displayCurrencyToRial(amountPaidInSelectedCurrency, currencyPreference);
    const isPaidAmountValid = Number.isSafeInteger(amountPaidInSelectedCurrency)
        && amountPaidInSelectedCurrency >= 0
        && Number.isSafeInteger(amountPaidInRial);
    const remainingClaimAmount = isPaidAmountValid
        ? Math.max(0, roundedTotalPeriodEntitlement - amountPaidInRial)
        : null;
    const finalRemainingClaimAmount = remainingClaimAmount === null
        ? null
        : Math.max(0, finalClaimAmount - amountPaidInRial);

    return (
        <ThemedView style={styles.container}>
            <ScrollView contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + Spacing.three, paddingBottom: insets.bottom + Spacing.four }]} showsVerticalScrollIndicator={false}>
                <SafeAreaView style={styles.safeArea}>
                    <Card elevation={1} style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                        <Card.Content style={styles.cardContent}>
                            <View style={styles.headerText}>
                                <ThemedText type="bodyBold" style={[styles.pageTitle, { color: theme.text }]}>پایه سنوات استحقاقی</ThemedText>
                                <CalculationDescriptionBox>
                                    <ThemedText type="small" style={[styles.pageDescription, { color: theme.textSecondary }]}>محاسبه پایه سنوات بر اساس تاریخ استخدام، وضعیت تصفیه حساب و طرح طبقه‌بندی مشاغل</ThemedText>
                                </CalculationDescriptionBox>
                            </View>

                            <View style={[styles.formulaBox, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}>
                                <ThemedText type="smallBold" style={[styles.formulaLabel, { color: theme.textSecondary }]}>راهنمای محاسبه</ThemedText>
                                <ThemedText type="small" style={[styles.formulaValue, { color: theme.text }]}>سال اول: صفر؛ از اولین سالگرد: پایه سنوات جاری؛ سال‌های بعد: پایه جاری به‌اضافه پایه سنوات محاسبه‌شده قبلی</ThemedText>
                            </View>

                            <View style={styles.metricsRow}>
                                <DateInputField label="تاریخ استخدام" value={employmentDate} onPress={() => setPickerTarget('employment')} formatValue={formatDate} iconName="calendar-account-outline" />
                                <DateInputField label="تا تاریخ" value={endDate} onPress={() => setPickerTarget('end')} formatValue={formatDate} />
                            </View>

                            <WorkshopTypeSelector value={workshopType} onValueChange={setWorkshopType} />

                            {workshopType === 'classified' ? (
                                <View style={[styles.metricBox, { backgroundColor: theme.surfaceVariant }]}>
                                    <ThemedText type="small" style={[styles.sectionLabel, { color: theme.textSecondary }]}>گروه شغلی</ThemedText>
                                    <Menu visible={groupMenuVisible} onDismiss={() => setGroupMenuVisible(false)} anchor={<Pressable onPress={() => setGroupMenuVisible(true)} style={[styles.dateInput, { backgroundColor: theme.surface, borderColor: theme.border }]}><ThemedText type="smallBold" style={{ color: theme.text }}>{selectedGroup == null ? 'انتخاب گروه' : `گروه ${toPersianDigits(selectedGroup)}`}</ThemedText><MaterialCommunityIcons name="briefcase-outline" size={18} color={theme.primaryText} /></Pressable>}>
                                        {jobGroups.map((group) => <FontAwareMenuItem key={group.id} title={`گروه ${toPersianDigits(group.group_number)}`} onPress={() => { setSelectedGroup(group.group_number); setGroupMenuVisible(false); }} />)}
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
                                                ? isLoading ? 'در حال محاسبه…' : 'در دسترس نیست'
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
                                <ThemedText type="small" style={[styles.insuranceExemptionDescription, { color: theme.textSecondary }]}>
                                    این مبلغ از پایه سنوات استحقاقی کل دوره کسر می‌شود؛ سپس سهم بیمهٔ کارگر از مانده محاسبه خواهد شد.
                                </ThemedText>
                                {!isPaidAmountValid ? (
                                    <ThemedText type="small" style={{ color: theme.error }}>
                                        مبلغ باید عدد صحیح و نامنفیِ قابل محاسبه باشد.
                                    </ThemedText>
                                ) : null}
                            </View>

                            <Pressable
                                accessibilityRole="checkbox"
                                accessibilityState={{ checked: isWorkerInsuranceExempt }}
                                onPress={() => setIsWorkerInsuranceExempt((value) => !value)}
                                style={[
                                    styles.insuranceExemptionOption,
                                    { backgroundColor: theme.surfaceVariant, borderColor: theme.border },
                                ]}
                            >
                                <MaterialCommunityIcons
                                    name={isWorkerInsuranceExempt ? 'checkbox-marked' : 'checkbox-blank-outline'}
                                    size={22}
                                    color={isWorkerInsuranceExempt ? theme.primaryText : theme.textSecondary}
                                />
                                <View style={styles.insuranceExemptionText}>
                                    <ThemedText type="smallBold" style={{ color: theme.text, fontSize: 13, lineHeight: 19 }}>
                                        مشمول معافیت از پرداخت سهم بیمه ی کارگر هستم
                                    </ThemedText>
                                    <ThemedText type="small" style={[styles.insuranceExemptionDescription, { color: theme.textSecondary }]}>
                                        ویژهٔ اسرا، آزادگان، جانبازان و فرزندان شهدا
                                    </ThemedText>
                                </View>
                            </Pressable>

                            <View style={[styles.insuranceLegalBasis, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}>
                                <ThemedText type="small" style={[styles.insuranceLegalSummary, { color: theme.textSecondary }]}>
                                    معافیت از سهم ۷٪ بیمه ی کارگر برای گروه‌های مشمول قوانین ایثارگران.
                                </ThemedText>
                                <Pressable
                                    accessibilityRole="button"
                                    accessibilityState={{ expanded: isLegalBasisVisible }}
                                    onPress={() => setIsLegalBasisVisible((visible) => !visible)}
                                    style={styles.insuranceLegalToggle}
                                >
                                    <ThemedText type="smallBold" style={[styles.insuranceLegalToggleLabel, { color: theme.primaryText }]}>
                                        مبنای قانونی معافیت
                                    </ThemedText>
                                    <MaterialCommunityIcons
                                        name={isLegalBasisVisible ? 'chevron-up' : 'chevron-down'}
                                        size={18}
                                        color={theme.primaryText}
                                    />
                                </Pressable>
                                {isLegalBasisVisible ? (
                                    <ThemedText type="small" style={[styles.insuranceLegalText, { color: theme.text }]}>
                                        اسرا، آزادگان و جانبازان، براساس تبصرهٔ ۳ مادهٔ ۳۷ قانون جامع خدمات‌رسانی به ایثارگران مصوب ۱۳۹۱، و فرزندان شهید مطابق بند «ز» مادهٔ ۸۸ قانون برنامهٔ پنج‌سالهٔ ششم توسعه، که در بند ۲ قسمت «ت» مادهٔ ۳۱ قانون برنامهٔ پنج‌سالهٔ هفتم توسعه تنفیذ شده است، از پرداخت حق بیمهٔ سهم کارگر معاف هستند.
                                    </ThemedText>
                                ) : null}
                            </View>

                            <View style={styles.actionsGroup}>
                                <Button mode="contained" onPress={handleCalculate} icon="cash-plus" buttonColor={theme.primary} textColor={theme.onPrimary} style={styles.actionButton} labelStyle={styles.actionLabel} loading={isLoading} disabled={isLoading}>محاسبه</Button>
                            </View>

                            {result ? <Card style={[styles.resultCard, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}><Card.Content style={styles.resultContent}>
                                <CalculationResultHeading />
                                <View style={[styles.summaryBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                                    <ThemedText type="small" style={[styles.summaryLabel, { color: theme.textSecondary }]}>
                                        {workshopType === 'classified' ? 'مبالغ پایه سنوات استحقاقی گروه شغلی' : 'مبالغ پایه سنوات استحقاقی'} در سال {toPersianDigits(selectedEndYear ?? '')}
                                    </ThemedText>
                                    <View style={styles.finalYearAmounts}>
                                        {finalYearBreakdown.map((item, index) => (
                                            <View key={`${item.year}-${item.periodIndex}-${item.phase}-${index}`} style={[styles.finalYearAmount, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}>
                                                <ThemedText type="small" style={[styles.finalYearDateLabel, { color: theme.textSecondary }]}>بازه زمانی</ThemedText>
                                                <ThemedText type="smallBold" style={[styles.finalYearDate, { color: theme.text }]}>{formatParsedDate(item.startDate)} تا {formatParsedDate(item.endDate)}</ThemedText>
                                                <View style={styles.finalYearValueRow}>
                                                    <View style={[styles.finalYearValueBlock, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                                                        <ThemedText type="small" style={[styles.finalYearValueLabel, { color: theme.textSecondary }]}>روزانه</ThemedText>
                                                        <ThemedText type="smallBold" style={[styles.finalYearAmountValue, { color: theme.primaryText }]}>{formatCurrency(item.entitlement)}</ThemedText>
                                                    </View>
                                                    <View style={[styles.finalYearValueBlock, styles.finalYearMonthlyBlock, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
                                                        <ThemedText type="small" style={[styles.finalYearValueLabel, { color: theme.textSecondary }]}>۳۰ روزه</ThemedText>
                                                        <ThemedText type="smallBold" style={[styles.finalYearAmountValue, { color: theme.primaryText }]}>{formatCurrency(item.entitlement * 30)}</ThemedText>
                                                    </View>
                                                </View>
                                            </View>
                                        ))}
                                    </View>
                                </View>
                                <View style={styles.insuranceSummary}>
                                    <View style={[styles.insuranceSummaryRow, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                                        <ThemedText type="small" style={[styles.insuranceSummaryLabel, { color: theme.textSecondary }]}>
                                            پایه سنوات استحقاقی کل دوره
                                        </ThemedText>
                                        <ThemedText type="smallBold" style={[styles.insuranceSummaryValue, { color: theme.text }]}>
                                            {formatCurrency(roundedTotalPeriodEntitlement)}
                                        </ThemedText>
                                    </View>
                                    <View style={[styles.insuranceSummaryRow, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                                        <ThemedText type="small" style={[styles.insuranceSummaryLabel, { color: theme.textSecondary }]}>
                                            سهم بیمه ی کارگر از پایه سنوات استحقاقی (۷٪{isWorkerInsuranceExempt ? '، معاف' : ''})
                                        </ThemedText>
                                        <ThemedText type="smallBold" style={[styles.insuranceSummaryValue, { color: theme.text }]}>
                                            {formatCurrency(workerInsuranceAmount)}
                                        </ThemedText>
                                    </View>
                                    <View style={[styles.insuranceSummaryRow, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                                        <ThemedText type="small" style={[styles.insuranceSummaryLabel, { color: theme.textSecondary }]}>
                                            سهم بیمه ی کارفرما از پایه سنوات استحقاقی (۲۳٪)
                                        </ThemedText>
                                        <ThemedText type="smallBold" style={[styles.insuranceSummaryValue, { color: theme.text }]}>
                                            {formatCurrency(employerInsuranceAmount)}
                                        </ThemedText>
                                    </View>
                                    <View style={[styles.insuranceSummaryRow, { backgroundColor: theme.primaryContainer, borderColor: theme.primary }]}>
                                        <ThemedText type="smallBold" style={[styles.insuranceSummaryLabel, styles.insuranceSummaryEmphasisLabel, { color: theme.textSecondary }]}>
                                            پایه سنوات استحقاقی پس از کسر سهم بیمه ی کارگر
                                        </ThemedText>
                                        <ThemedText type="smallBold" style={[styles.insuranceSummaryValue, styles.insuranceSummaryEmphasisValue, { color: theme.primaryText }]}>
                                            {formatCurrency(finalClaimAmount)}
                                        </ThemedText>
                                    </View>
                                    <View style={[styles.insuranceSummaryRow, { backgroundColor: theme.primaryContainer, borderColor: theme.primary }]}>
                                        <ThemedText type="smallBold" style={[styles.insuranceSummaryLabel, styles.insuranceSummaryEmphasisLabel, { color: theme.textSecondary }]}>
                                            پایه سنوات استحقاقی پس از کسر مبلغ پرداخت‌شده به کارگر
                                        </ThemedText>
                                        <ThemedText type="smallBold" style={[styles.insuranceSummaryValue, styles.insuranceSummaryEmphasisValue, { color: theme.primaryText }]}>
                                            {remainingClaimAmount === null
                                                ? 'مبلغ پرداخت‌شده نامعتبر است'
                                                : formatCurrency(remainingClaimAmount)}
                                        </ThemedText>
                                    </View>
                                    <View style={[styles.insuranceSummaryRow, { backgroundColor: theme.primaryContainer, borderColor: theme.primary }]}>
                                        <ThemedText type="smallBold" style={[styles.insuranceSummaryLabel, styles.insuranceSummaryEmphasisLabel, { color: theme.textSecondary }]}>
                                            پایه سنوات استحقاقی پس از کسر سهم بیمهٔ کارگر و مبلغ پرداخت‌شده به کارگر
                                        </ThemedText>
                                        <ThemedText type="smallBold" style={[styles.insuranceSummaryValue, styles.insuranceSummaryEmphasisValue, { color: theme.primaryText }]}>
                                            {finalRemainingClaimAmount === null
                                                ? 'مبلغ پرداخت‌شده نامعتبر است'
                                                : formatCurrency(finalRemainingClaimAmount)}
                                        </ThemedText>
                                    </View>
                                </View>
                                <View style={styles.breakdownHeader}>
                                    <ThemedText type="smallBold" style={[styles.breakdownSectionTitle, { color: theme.text }]}>جزئیات بازه‌های محاسبه</ThemedText>
                                    <Pressable onPress={() => setShowDetails((value) => !value)} style={[styles.toggleButton, { backgroundColor: theme.surface, borderColor: theme.border }]}><ThemedText type="smallBold" style={[styles.toggleButtonLabel, { color: theme.primaryText }]}>{showDetails ? 'عدم نمایش' : 'نمایش جزئیات'}</ThemedText><MaterialCommunityIcons name={showDetails ? 'chevron-up' : 'chevron-down'} size={18} color={theme.primaryText} /></Pressable>
                                </View>
                                {showDetails ? (
                                    <View style={styles.breakdownGrid}>
                                        {result.breakdown.map((item, index) => (
                                            <View
                                                key={`${item.year}-${item.periodIndex}-${index}`}
                                                style={[styles.breakdownItem, { backgroundColor: theme.surface, borderColor: theme.border }]}
                                            >
                                                <View style={[styles.breakdownItemHeaderRow, { borderBottomColor: theme.border }]}>
                                                    <ThemedText type="smallBold" style={[styles.breakdownItemTitle, { color: theme.text }]}>
                                                        {`سال ${toPersianDigits(item.year)}${(periodBuckets.find((bucket) => bucket.year === item.year)?.periods.length ?? 0) > 1 ? `، دوره ${toPersianDigits(item.periodIndex)}` : ''}`}
                                                    </ThemedText>
                                                </View>
                                                <View style={styles.detailGrid}>
                                                    <View style={[styles.detailBox, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}>
                                                        <ThemedText type="small" style={[styles.detailLabel, { color: theme.textSecondary }]}>بازه زمانی</ThemedText>
                                                        <ThemedText type="smallBold" style={[styles.detailValue, styles.dateValue, { color: theme.text }]}>
                                                            {formatParsedDate(item.startDate)} تا {formatParsedDate(item.endDate)}
                                                        </ThemedText>
                                                    </View>
                                                    <View style={[styles.detailBox, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}>
                                                        <ThemedText type="small" style={[styles.detailLabel, { color: theme.textSecondary }]}>نوع بازه</ThemedText>
                                                        <ThemedText type="smallBold" style={[styles.detailValue, { color: theme.text }]}>
                                                            {item.phase === 'before-anniversary' ? 'پیش از سالگرد استخدام' : 'بعد از سالگرد استخدام'}
                                                        </ThemedText>
                                                    </View>
                                                    <View style={[styles.detailBox, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}>
                                                        <ThemedText type="small" style={[styles.detailLabel, { color: theme.textSecondary }]}>تعداد روز</ThemedText>
                                                        <ThemedText type="smallBold" style={[styles.detailValue, { color: theme.text }]}>{toPersianDigits(item.daysCovered)} روز</ThemedText>
                                                    </View>
                                                    <View style={[styles.detailBox, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}>
                                                        <ThemedText type="small" style={[styles.detailLabel, { color: theme.textSecondary }]}>
                                                            {workshopType === 'classified' ? 'پایه سنوات جاری گروه شغلی' : 'پایه سنوات جاری'}
                                                        </ThemedText>
                                                        <ThemedText type="smallBold" style={[styles.detailValue, { color: theme.text }]}>{formatCurrency(item.currentBase)}</ThemedText>
                                                    </View>
                                                    <View style={[styles.detailBox, { backgroundColor: theme.primaryContainer, borderColor: theme.primary }]}>
                                                        <ThemedText type="small" style={[styles.detailLabel, { color: theme.textSecondary }]}>
                                                            {workshopType === 'classified' ? 'پایه سنوات استحقاقی روزانه گروه شغلی' : 'پایه سنوات استحقاقی روزانه'}
                                                        </ThemedText>
                                                        <ThemedText type="smallBold" style={[styles.detailValue, { color: theme.primaryText }]}>{formatCurrency(item.entitlement)}</ThemedText>
                                                    </View>
                                                    <View style={[styles.detailBox, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}>
                                                        <ThemedText type="small" style={[styles.detailLabel, { color: theme.textSecondary }]}>
                                                            پایه سنوات استحقاقی این بازه
                                                        </ThemedText>
                                                        <ThemedText type="smallBold" style={[styles.detailValue, { color: theme.text }]}>
                                                            {formatCurrency(item.entitlement * item.daysCovered)}
                                                        </ThemedText>
                                                    </View>
                                                    <View style={[styles.detailBox, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}>
                                                        <ThemedText type="small" style={[styles.detailLabel, { color: theme.textSecondary }]}>
                                                            حق بیمه پرداختی به سازمان تامین اجتماعی
                                                        </ThemedText>
                                                        <ThemedText type="smallBold" style={[styles.detailValue, { color: theme.primaryText }]}>
                                                            {formatCurrency(Math.round(item.entitlement * item.daysCovered * 0.3))}
                                                        </ThemedText>
                                                    </View>
                                                </View>
                                            </View>
                                        ))}
                                    </View>
                                ) : null}
                            </Card.Content></Card> : null}
                        </Card.Content>
                    </Card>
                </SafeAreaView>
            </ScrollView>
            <PersianDatePickerModal visible={pickerTarget !== null} value={pickerTarget === 'employment' ? employmentDate : endDate} title={pickerTarget === 'employment' ? 'انتخاب تاریخ استخدام' : 'انتخاب تاریخ پایان'} onClose={() => setPickerTarget(null)} onSelect={selectDate} availableYears={availableYears} />
            <Snackbar visible={snackbarVisible} onDismiss={() => setSnackbarVisible(false)} duration={5000} style={{ backgroundColor: theme.errorFill, borderRadius: Radius.md }} action={{ label: 'بستن', onPress: () => setSnackbarVisible(false), labelStyle: { color: theme.onStatus } }}><ThemedText type="small" style={{ color: theme.onStatus }}>{snackbarMessage}</ThemedText></Snackbar>
        </ThemedView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    scrollContent: { flexGrow: 1 },
    safeArea: { flex: 1, justifyContent: 'center', paddingHorizontal: 0 },
    card: { borderRadius: Radius.md, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
    cardContent: { gap: Spacing.three, paddingVertical: Spacing.four, paddingHorizontal: Spacing.three },
    headerText: { alignSelf: 'stretch', gap: Spacing.one },
    pageTitle: { display: 'none', fontSize: 16, lineHeight: 22, fontFamily: 'AppFont-Bold' },
    pageDescription: { fontSize: 13, lineHeight: 20, fontFamily: 'AppFont-Regular' },
    formulaBox: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: Spacing.two, gap: Spacing.one },
    formulaLabel: { fontSize: 10, lineHeight: 16, fontFamily: 'AppFont-Medium' },
    formulaValue: { fontSize: 12, lineHeight: 20, fontFamily: 'AppFont-Regular' },
    metricsRow: { flexDirection: 'row', gap: Spacing.two },
    metricBox: { flex: 1, borderRadius: 14, padding: Spacing.two, gap: Spacing.one },
    workHoursSection: { gap: Spacing.two, padding: Spacing.two, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth },
    workHoursMethods: { gap: Spacing.one },
    workHoursMethodOption: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.two, borderWidth: StyleSheet.hairlineWidth, borderRadius: 10 },
    workHoursMethodLabel: { flexShrink: 1, lineHeight: 20 },
    workHoursDivider: { height: StyleSheet.hairlineWidth, marginVertical: Spacing.one },
    workHoursDetails: { gap: Spacing.two },
    workHoursInput: { flex: 1, minHeight: 48, paddingVertical: 0, fontFamily: 'AppFont-Bold', fontSize: 16, writingDirection: 'ltr' },
    workHoursHint: { fontSize: 12, lineHeight: 18 },
    workHoursStepper: { minHeight: 54, flexDirection: 'row', alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: Spacing.one, gap: Spacing.one },
    workHoursStepperButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
    workHoursStepperButtonDisabled: { opacity: 0.4 },
    sectionLabel: { fontSize: 11, lineHeight: 16, fontFamily: 'AppFont-Medium' },
    dateInput: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.one, paddingHorizontal: Spacing.two, paddingVertical: Spacing.two, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth },
    fieldValue: { flex: 1, fontSize: 12, lineHeight: 18, fontFamily: 'AppFont-Bold' },
    optionSection: { gap: Spacing.two },
    optionsRow: { flexDirection: 'row', gap: Spacing.two },
    optionButton: { flex: 1, minHeight: 44, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.two },
    checkRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: Spacing.two },
    checkText: { flex: 1, gap: Spacing.one },
    insuranceExemptionOption: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, padding: Spacing.two, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12 },
    insuranceExemptionText: { flex: 1, gap: Spacing.half },
    insuranceExemptionDescription: { fontSize: 12 },
    paidAmountSection: { gap: Spacing.one, padding: Spacing.two, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth },
    insuranceLegalBasis: { gap: Spacing.one, padding: Spacing.two, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12 },
    insuranceLegalSummary: { fontSize: 12, lineHeight: 18 },
    insuranceLegalToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.one, paddingVertical: Spacing.half },
    insuranceLegalToggleLabel: { fontSize: 13 },
    insuranceLegalText: { fontSize: 12, lineHeight: 20 },
    actionsGroup: { flexDirection: 'row', gap: Spacing.two },
    actionButton: { flex: 1, borderRadius: 10 },
    actionLabel: { fontFamily: 'AppFont-Bold', fontSize: 12 },
    optionTitle: { fontSize: 13, lineHeight: 19, fontFamily: 'AppFont-Bold' },
    optionDescription: { fontSize: 11, lineHeight: 20, fontFamily: 'AppFont-Regular' },
    resultCard: { borderRadius: Radius.md, borderWidth: 1, overflow: 'hidden' },
    resultContent: { gap: Spacing.two, paddingVertical: Spacing.three, paddingHorizontal: Spacing.two },
    summaryBox: { width: '100%', alignItems: 'center', gap: Spacing.one, padding: Spacing.two, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth },
    summaryLabel: { fontSize: 11, lineHeight: 16, fontFamily: 'AppFont-Medium', textAlign: 'center' },
    amountValue: { fontSize: 16, lineHeight: 22, fontFamily: 'AppFont-Bold' },
    insuranceSummary: { width: '100%', gap: Spacing.one },
    insuranceSummaryRow: {
        minHeight: 52,
        flexDirection: 'column',
        alignItems: 'center',
        gap: Spacing.one,
        paddingHorizontal: Spacing.three,
        paddingVertical: Spacing.two,
        borderRadius: 12,
        borderWidth: 1,
    },
    insuranceSummaryLabel: { textAlign: 'center', fontSize: 12 },
    insuranceSummaryValue: { textAlign: 'center', fontSize: 16, lineHeight: 22, fontFamily: 'AppFont-Bold' },
    insuranceSummaryEmphasisLabel: { fontSize: 13 },
    insuranceSummaryEmphasisValue: { fontSize: 16, lineHeight: 22, fontFamily: 'AppFont-Bold' },
    finalYearAmounts: { width: '100%', gap: Spacing.one },
    finalYearAmount: { width: '100%', alignItems: 'center', gap: Spacing.half, padding: Spacing.two, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth },
    finalYearDateLabel: { fontSize: 10, lineHeight: 16, fontFamily: 'AppFont-Medium' },
    finalYearDate: { fontSize: 12, lineHeight: 18, fontFamily: 'AppFont-Bold', textAlign: 'center' },
    finalYearValueRow: { width: '100%', flexDirection: 'column', gap: Spacing.one, marginTop: Spacing.one },
    finalYearValueBlock: { width: '100%', alignItems: 'center', gap: Spacing.half, paddingHorizontal: Spacing.two, paddingVertical: Spacing.one, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth },
    finalYearMonthlyBlock: {},
    finalYearValueLabel: { fontSize: 10, lineHeight: 16, fontFamily: 'AppFont-Medium' },
    finalYearAmountValue: { fontSize: 16, lineHeight: 22, fontFamily: 'AppFont-Bold' },
    breakdownHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.one, paddingVertical: Spacing.one, gap: Spacing.two },
    breakdownSectionTitle: { fontSize: 13, lineHeight: 19, fontFamily: 'AppFont-Bold' },
    toggleButton: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one, paddingHorizontal: Spacing.two, paddingVertical: Spacing.one, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth },
    toggleButtonLabel: { fontSize: 11, lineHeight: 17, fontFamily: 'AppFont-Bold' },
    breakdownGrid: { gap: Spacing.two },
    breakdownItem: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: Spacing.two, gap: Spacing.one },
    breakdownItemHeaderRow: { paddingTop: 2, paddingBottom: 2, marginBottom: 2, borderBottomWidth: StyleSheet.hairlineWidth },
    breakdownItemTitle: { fontSize: 12, lineHeight: 18, fontFamily: 'AppFont-Bold' },
    detailGrid: { gap: Spacing.one },
    detailBox: { alignItems: 'center', gap: Spacing.one, padding: Spacing.one, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth },
    detailLabel: { fontSize: 12, lineHeight: 16, fontFamily: 'AppFont-Regular' },
    detailValue: { fontSize: 16, lineHeight: 22, fontFamily: 'AppFont-Bold' },
    dateValue: { textAlign: 'center' },
});