import { MaterialCommunityIcons } from '@expo/vector-icons';
import { jalaaliMonthLength, toGregorian, toJalaali } from 'jalaali-js';
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
    calculateEntitledSeniorityFromPeriodData,
    calculateUnusedLeaveEntitlement,
    calculateUnusedLeaveMonths,
    calculateUnusedLeaveWageFromPeriodData,
    parseDateInput,
    type EntitledSeniorityWorkshopType,
    type SalaryPeriodBucket,
    type UnusedLeaveWageCalculationResult,
    type UnusedLeaveWageMaritalStatus,
} from '@/utils/salary-calculation';
import { useAppContext } from '@/hooks/use-app-context';

type PickerTarget = 'start' | 'end' | 'employment';
type WorkHoursMethod = 'daily' | 'period';
const CHILDREN_OPTIONS = Array.from({ length: 13 }, (_, index) => index);

export default function UnusedLeaveWageScreen() {
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
    const [workHoursMethod, setWorkHoursMethod] = useState<WorkHoursMethod>('daily');
    const [workshopType, setWorkshopType] = useState<EntitledSeniorityWorkshopType>('unclassified');
    const [settledThrough1391, setSettledThrough1391] = useState(false);
    const [jobGroups, setJobGroups] = useState<{ id: number; group_number: number; sort_order: number }[]>([]);
    const [selectedGroup, setSelectedGroup] = useState<number | null>(null);
    const [groupMenuVisible, setGroupMenuVisible] = useState(false);
    const [maritalStatus, setMaritalStatus] = useState<UnusedLeaveWageMaritalStatus>('single');
    const [childrenCount, setChildrenCount] = useState(0);
    const [childrenMenuVisible, setChildrenMenuVisible] = useState(false);
    const [usedLeaveDaysBySegment, setUsedLeaveDaysBySegment] = useState<Record<number, string>>({});
    const [initialSavedLeaveDays, setInitialSavedLeaveDays] = useState('۰');
    const [pickerTarget, setPickerTarget] = useState<PickerTarget | null>(null);
    const [periodBuckets, setPeriodBuckets] = useState<SalaryPeriodBucket[]>([]);
    const [officialHolidayDates, setOfficialHolidayDates] = useState<string[]>([]);
    const [availableYears, setAvailableYears] = useState<number[]>([]);
    const [isLoadingData, setIsLoadingData] = useState(true);
    const [result, setResult] = useState<UnusedLeaveWageCalculationResult | null>(null);
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
                        monthly_housing_single: period.monthly_housing_single,
                        monthly_housing_married: period.monthly_housing_married,
                        monthly_single_allowance: period.monthly_single_allowance,
                        monthly_married_allowance: period.monthly_married_allowance,
                        child_allowance: period.child_allowance,
                        marital_allowance: period.marital_allowance,
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
                if (isMounted) setIsLoadingData(false);
            }
        };
        void loadData();
        return () => { isMounted = false; };
    }, []);

    const persianDigits = '۰۱۲۳۴۵۶۷۸۹';
    const toPersianDigits = (value: string | number) => String(value).replace(/\d/g, (digit) => persianDigits[Number(digit)]);
    const formatNumber = (value: number) => toPersianDigits(Number.isInteger(value) ? value.toFixed(0) : value.toFixed(2));
    const formatDate = (value: string) => {
        const parsed = parseDateInput(value);
        return parsed ? `${toPersianDigits(String(parsed.year))}/${toPersianDigits(String(parsed.month).padStart(2, '0'))}/${toPersianDigits(String(parsed.day).padStart(2, '0'))}` : '';
    };
    const compareDates = (left: string, right: string) => {
        const parsedLeft = parseDateInput(left);
        const parsedRight = parseDateInput(right);
        if (!parsedLeft || !parsedRight) return 0;
        return parsedLeft.year * 10000 + parsedLeft.month * 100 + parsedLeft.day - (parsedRight.year * 10000 + parsedRight.month * 100 + parsedRight.day);
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
    const normalizedAmountPaid = amountPaidToWorker
        .replace(/[۰-۹]/g, (digit) => String(persianDigits.indexOf(digit)))
        .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));
    const amountPaidInSelectedCurrency = Number(normalizedAmountPaid);
    const amountPaidInRial = displayCurrencyToRial(amountPaidInSelectedCurrency, currencyPreference);
    const isPaidAmountValid = Number.isSafeInteger(amountPaidInSelectedCurrency)
        && amountPaidInSelectedCurrency >= 0
        && Number.isSafeInteger(amountPaidInRial)
        && (currencyPreference !== 'toman'
            || amountPaidInSelectedCurrency <= Math.floor(Number.MAX_SAFE_INTEGER / 10));
    const unusedLeaveWageAmount = result
        ? Math.round(result.unusedLeaveDays * result.dailyWage)
        : 0;
    const remainingUnusedLeaveWage = result && isPaidAmountValid
        ? Math.max(0, unusedLeaveWageAmount - amountPaidInRial)
        : null;
    const totalMonthsWorked = (() => {
        const parsedStart = parseDateInput(startDate);
        const parsedEnd = parseDateInput(endDate);
        return parsedStart && parsedEnd ? calculateUnusedLeaveMonths(parsedStart, parsedEnd) : null;
    })();
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
            return `بازه ناقص (${toPersianDigits(remainingMonths.toFixed(2))} ماه)`;
        }

        const partialStartYear = parsedStartDate.year + fullYears;
        const partialStart = {
            year: partialStartYear,
            month: parsedStartDate.month,
            day: Math.min(parsedStartDate.day, jalaaliMonthLength(partialStartYear, parsedStartDate.month)),
        };

        return `بازه ناقص (${formatDateParts(partialStart)} تا ${formatDate(endDate)}، ${toPersianDigits(remainingMonths.toFixed(2))} ماه)`;
    };

    const updateUsedLeaveDays = (segmentIndex: number, value: string) => {
        setUsedLeaveDaysBySegment((current) => ({
            ...current,
            [segmentIndex]: value,
        }));
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

    const handleDateSelect = (value: string) => {
        if (pickerTarget === 'employment') {
            setEmploymentDate(value);
            if (compareDates(value, endDate) > 0) setEndDate(value);
            resetWorkHoursForDateChange();
        } else if (pickerTarget === 'start') {
            setStartDate(value);
            setEmploymentDate(value);
            if ((parseDateInput(value)?.year ?? 0) > 1391) setSettledThrough1391(false);
            if (compareDates(value, endDate) > 0) setEndDate(value);
            resetWorkHoursForDateChange();
        } else if (pickerTarget === 'end') {
            if (compareDates(value, startDate) < 0) {
                setSnackbarMessage('تاریخ پایان باید برابر یا بزرگتر از تاریخ شروع باشد.');
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
        const employment = parseDateInput(employmentDate);
        if (!parsedStartDate || !parsedEndDate || !employment || !isDateRangeValid || compareDates(employmentDate, endDate) > 0) {
            setResult(null);
            setSnackbarMessage('تاریخ‌های واردشده معتبر نیستند.');
            setSnackbarVisible(true);
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
        if (workshopType === 'classified' && selectedGroup == null) {
            setResult(null);
            setSnackbarMessage('گروه شغلی را انتخاب کنید.');
            setSnackbarVisible(true);
            return;
        }

        const usedLeaveDays = Array.from({ length: segmentCount }, (_, index) =>
            Number(String(usedLeaveDaysBySegment[index] ?? '0').replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))),
        );
        const initialSavedDays = Number(initialSavedLeaveDays.replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit))));
        if (usedLeaveDays.some((value) => !Number.isFinite(value) || value < 0) || !Number.isFinite(initialSavedDays) || initialSavedDays < 0) {
            setResult(null);
            setSnackbarMessage('مقادیر مرخصی استفاده‌شده و ذخیره انتقالی باید صفر یا بیشتر باشند.');
            setSnackbarVisible(true);
            return;
        }

        const leaveCalculation = calculateUnusedLeaveEntitlement(parsedStartDate, parsedEndDate, usedLeaveDays, initialSavedDays);
        if (!leaveCalculation) {
            setResult(null);
            setSnackbarMessage('محاسبه میزان مرخصی ذخیره‌شده امکان‌پذیر نیست.');
            setSnackbarVisible(true);
            return;
        }

        const seniority = calculateEntitledSeniorityFromPeriodData(
            employment,
            parsedEndDate,
            periodBuckets,
            workshopType,
            selectedGroup ?? undefined,
            settledThrough1391,
        );
        const calculation = calculateUnusedLeaveWageFromPeriodData(
            parsedStartDate,
            parsedEndDate,
            periodBuckets,
            maritalStatus,
            childrenCount,
            seniority.finalEntitlement,
            leaveCalculation.totalSavedLeaveDays,
        );
        if (!calculation) {
            setResult(null);
            setSnackbarMessage('برای تاریخ پایان، داده‌ی حقوقی معتبری پیدا نشد.');
            setSnackbarVisible(true);
            return;
        }
        const calculationWorkRatio = workHoursMethod === 'daily'
            ? getDailyWorkRatio(getDailyWorkMinutes(dailyWorkTime))
            : Math.min(normalizedActualWorkedHours, requiredWorkHours ?? 0) / (requiredWorkHours ?? 1);
        setResult(scaleWageCalculationResult(calculation, calculationWorkRatio));
        notifyCalculationCompleted();
        setShowDetails(false);
    };

    const components = result ? [
        ['حداقل مزد روزانه', result.dailyMinimumWage],
        [workshopType === 'classified' ? 'پایه سنوات استحقاقی روزانه گروه شغلی' : 'پایه سنوات استحقاقی روزانه', result.dailySeniority],
        ['حق مسکن روزانه', result.dailyHousingAllowance],
        ['حق عائله‌مندی روزانه', result.dailyChildAllowance],
        ['بن کارگری روزانه', result.dailyMonthlyAllowance],
        ['حق تأهل روزانه', result.dailyMaritalAllowance],
    ] as const : [];

    return (
        <ThemedView style={styles.container}>
            <ScrollView contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + Spacing.three, paddingBottom: insets.bottom + Spacing.four }]} showsVerticalScrollIndicator={false}>
                <SafeAreaView style={styles.safeArea}>
                    <Card elevation={1} style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                        <Card.Content style={styles.cardContent}>
                            <View style={styles.headerRow}>
                                <View style={styles.headerText}>
                                    <ThemedText type="bodyBold" style={[styles.pageTitle, { color: theme.text }]}>مزد مرخصی ذخیره شده کارگر</ThemedText>
                                    <CalculationDescriptionBox>
                                        <ThemedText type="small" style={[styles.pageDescription, { color: theme.textSecondary }]}>مزد مرخصی بر اساس روزهای مرخصی ذخیره شده و آخرین ماه کارکرد محاسبه می‌شود.</ThemedText>
                                    </CalculationDescriptionBox>
                                </View>
                            </View>
                            <View style={[styles.formulaBox, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}>
                                <ThemedText type="small" style={[styles.formulaLabel, { color: theme.textSecondary }]}>فرمول محاسبه</ThemedText>
                                <ThemedText type="small" style={[styles.formulaValue, { color: theme.text }]}>میزان مرخصی ذخیره‌شده کارگر × ((حداقل مزد روزانه مصوب شورای عالی کار در آخرین روز کارکرد + پایه سنوات استحقاقی روزانه در آخرین روز کارکرد) + (مبلغ حق مسکن ماهیانه در آخرین ماه کارکرد ÷ تعداد روزهای آن ماه در تقویم) + (مبلغ حق عائله‌مندی ماهیانه در آخرین ماه کارکرد ÷ تعداد روزهای آن ماه در تقویم) + (مبلغ بن کارگری در آخرین ماه کارکرد ÷ تعداد روزهای آن ماه در تقویم) + (مبلغ حق تأهل ماهیانه در آخرین ماه کارکرد ÷ تعداد روزهای آن ماه در تقویم))</ThemedText>
                            </View>
                            <View style={styles.metricsRow}>
                                <DateInputField label="از تاریخ" value={startDate} onPress={() => setPickerTarget('start')} formatValue={formatDate} />
                                <DateInputField label="تا تاریخ" value={endDate} onPress={() => setPickerTarget('end')} formatValue={formatDate} />
                            </View>
                            <DateInputField
                                label="تاریخ استخدام"
                                value={employmentDate}
                                onPress={() => setPickerTarget('employment')}
                                formatValue={formatDate}
                                iconName="calendar-account-outline"
                                helperText="جهت محاسبه پایه سنوات استحقاقی و اعمال آن در محاسبات"
                            />
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
                                        <MaterialCommunityIcons name="minus" size={20} color={theme.primaryText} />
                                    </Pressable>
                                    <NumericInputField
                                        mode="decimal"
                                        value={initialSavedLeaveDays}
                                        onChangeText={setInitialSavedLeaveDays}
                                        placeholder="۰"
                                        placeholderTextColor={theme.textMuted}
                                        style={[styles.stepperInput, { color: theme.text }]}
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
                                        <MaterialCommunityIcons name="plus" size={20} color={theme.primaryText} />
                                    </Pressable>
                                </View>
                            </View>
                            {segmentCount > 0 ? (
                                <View style={[styles.usedLeaveBox, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}>
                                    <ThemedText type="smallBold" style={[styles.sectionLabel, { color: theme.text }]}>مرخصی استفاده‌شده در هر بخش</ThemedText>
                                    {Array.from({ length: segmentCount }, (_, index) => {
                                        const isPartial = index >= fullYears;
                                        const label = isPartial ? getPartialPeriodLabel() : getFullYearLabel(index + 1);
                                        return (
                                            <View key={index} style={styles.usedLeaveRow}>
                                                <ThemedText type="small" style={styles.usedLeaveLabel}>{label}</ThemedText>
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
                                                        <MaterialCommunityIcons name="minus" size={20} color={theme.primaryText} />
                                                    </Pressable>
                                                    <NumericInputField
                                                        mode="decimal"
                                                        value={usedLeaveDaysBySegment[index] ?? ''}
                                                        onChangeText={(value) => updateUsedLeaveDays(index, value)}
                                                        placeholder="۰"
                                                        placeholderTextColor={theme.textMuted}
                                                        style={[styles.stepperInput, { color: theme.text }]}
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
                                                        <MaterialCommunityIcons name="plus" size={20} color={theme.primaryText} />
                                                    </Pressable>
                                                </View>
                                            </View>
                                        );
                                    })}
                                </View>
                            ) : null}
                            <WorkshopTypeSelector value={workshopType} onValueChange={setWorkshopType} />
                            {workshopType === 'classified' ? (
                                <View style={[styles.metricBox, { backgroundColor: theme.surfaceVariant }]}>
                                    <ThemedText type="small" style={[styles.sectionLabel, { color: theme.textSecondary }]}>گروه شغلی</ThemedText>
                                    <Menu
                                        visible={groupMenuVisible}
                                        onDismiss={() => setGroupMenuVisible(false)}
                                        anchor={
                                            <Pressable onPress={() => setGroupMenuVisible(true)} style={[styles.dateInput, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                                                <ThemedText type="smallBold" style={{ color: theme.text }}>{selectedGroup == null ? 'انتخاب گروه' : `گروه ${toPersianDigits(selectedGroup)}`}</ThemedText>
                                                <MaterialCommunityIcons name="briefcase-outline" size={18} color={theme.primaryText} />
                                            </Pressable>
                                        }
                                    >
                                        {jobGroups.map((group) => <FontAwareMenuItem key={group.id} title={`گروه ${toPersianDigits(group.group_number)}`} onPress={() => { setSelectedGroup(group.group_number); setGroupMenuVisible(false); }} />)}
                                    </Menu>
                                </View>
                            ) : null}
                            <SettlementThrough1391Field checked={settledThrough1391} enabled={canUseSettlementPath} onChange={setSettledThrough1391} />
                            <View style={[styles.metricBox, { backgroundColor: theme.surfaceVariant }]}>
                                <ThemedText type="small" style={[styles.sectionLabel, { color: theme.textSecondary }]}>وضعیت تأهل</ThemedText>
                                <View style={styles.statusRow}>
                                    {([['single', 'مجرد'], ['married', 'متأهل']] as const).map(([value, label]) => {
                                        const selected = maritalStatus === value;
                                        return <Pressable key={value} onPress={() => setMaritalStatus(value)} style={[styles.statusButton, { backgroundColor: selected ? theme.primary : theme.surface, borderColor: selected ? theme.primary : theme.border }]}><ThemedText type="smallBold" style={{ color: selected ? theme.surface : theme.text }}>{label}</ThemedText></Pressable>;
                                    })}
                                </View>
                            </View>
                            <View style={[styles.metricBox, { backgroundColor: theme.surfaceVariant }]}>
                                <ThemedText type="small" style={[styles.sectionLabel, { color: theme.textSecondary }]}>تعداد فرزندان واجد شرایط</ThemedText>
                                <Menu
                                    visible={childrenMenuVisible}
                                    onDismiss={() => setChildrenMenuVisible(false)}
                                    anchor={
                                        <Pressable onPress={() => setChildrenMenuVisible(true)}>
                                            <View style={[styles.dateInput, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                                                <ThemedText type="smallBold" style={[styles.fieldValue, { color: theme.text }]}>
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
                                                setChildrenMenuVisible(false);
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
                                <ThemedText type="small" style={{ color: theme.textSecondary }}>
                                    این مبلغ از مزد مرخصی ذخیره‌شده کسر می‌شود.
                                </ThemedText>
                                {!isPaidAmountValid ? (
                                    <ThemedText type="small" style={{ color: theme.error }}>
                                        مبلغ باید عدد صحیح و نامنفیِ قابل محاسبه باشد.
                                    </ThemedText>
                                ) : null}
                            </View>
                            <View style={styles.actionsGroup}>
                                <Button mode="contained" onPress={handleCalculate} icon="cash-clock" buttonColor={theme.primary} textColor={theme.onPrimary} style={styles.actionButton} labelStyle={styles.actionLabel} loading={isLoadingData} disabled={isLoadingData}>محاسبه</Button>
                            </View>
                            {result ? <Card style={[styles.resultCard, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}><Card.Content style={styles.resultContent}>
                                <CalculationResultHeading />
                                <View style={[styles.summaryBox, { backgroundColor: theme.surface, borderColor: theme.border }]}><ThemedText type="small" style={[styles.summaryLabel, { color: theme.textSecondary }]}>مبلغ مزد مرخصی ذخیره شده کارگر</ThemedText><ThemedText type="largeTitle" style={[styles.amountValue, { color: theme.primaryText }]}>{toPersianDigits(formatCurrency(unusedLeaveWageAmount))}</ThemedText></View>
                                <View style={[styles.summaryBox, { backgroundColor: theme.primaryContainer, borderColor: theme.primary }]}>
                                    <ThemedText type="smallBold" style={[styles.summaryLabel, { color: theme.textSecondary }]}>
                                        مبلغ مزد مرخصی ذخیره‌شده پس از کسر مبلغ پرداخت‌شده به کارگر
                                    </ThemedText>
                                    <ThemedText type="largeTitle" style={[styles.amountValue, { color: theme.primaryText }]}>
                                        {remainingUnusedLeaveWage === null
                                            ? 'مبلغ پرداخت‌شده نامعتبر است'
                                            : formatCurrency(remainingUnusedLeaveWage)}
                                    </ThemedText>
                                </View>
                                <View style={styles.breakdownHeader}><ThemedText type="smallBold" style={[styles.breakdownSectionTitle, { color: theme.text }]}>جزئیات محاسبه</ThemedText><Pressable onPress={() => setShowDetails((value) => !value)} style={[styles.toggleButton, { backgroundColor: theme.surface, borderColor: theme.border }]}><ThemedText type="smallBold" style={[styles.toggleButtonLabel, { color: theme.primaryText }]}>{showDetails ? 'عدم نمایش' : 'نمایش جزئیات'}</ThemedText><MaterialCommunityIcons name={showDetails ? 'chevron-up' : 'chevron-down'} size={18} color={theme.primaryText} /></Pressable></View>
                                {showDetails ? <View style={styles.breakdownGrid}><View style={[styles.breakdownItemCard, { backgroundColor: theme.surface, borderColor: theme.border }]}><View style={styles.breakdownItemHeaderRow}><ThemedText type="smallBold" style={[styles.breakdownItemTitle, { color: theme.text }]}>جزئیات مزد روزانه</ThemedText></View><View style={styles.breakdownDetailGrid}><View style={[styles.detailBox, { backgroundColor: theme.primaryContainer, borderColor: theme.primary }]}><ThemedText type="small" style={[styles.detailLabel, { color: theme.textSecondary }]}>روزهای مرخصی ذخیره شده</ThemedText><ThemedText type="smallBold" style={[styles.detailValue, { color: theme.primaryText }]}>{formatNumber(result.unusedLeaveDays)} روز</ThemedText></View><View style={[styles.detailBox, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}><ThemedText type="small" style={[styles.detailLabel, { color: theme.textSecondary }]}>روزهای تقویمی ماه آخر کارکرد</ThemedText><ThemedText type="smallBold" style={[styles.detailValue, { color: theme.text }]}>{toPersianDigits(result.calendarDaysInLastMonth)} روز</ThemedText></View><ThemedText type="small" style={[styles.detailDescription, { color: theme.textSecondary }]}>آخرین ماه کارکرد: سال {toPersianDigits(result.year)}، دوره {toPersianDigits(result.periodIndex)}</ThemedText>{components.map(([label, value]) => <View key={label} style={[styles.detailBox, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}><ThemedText type="small" style={[styles.detailLabel, { color: theme.textSecondary }]}>{label}</ThemedText><ThemedText type="smallBold" style={[styles.detailValue, { color: theme.text }]}>{formatCurrency(value)}</ThemedText></View>)}<View style={[styles.detailBox, { backgroundColor: theme.primaryContainer, borderColor: theme.primary }]}><ThemedText type="small" style={[styles.detailLabel, { color: theme.textSecondary }]}>مزد روزانه مشمول مرخصی</ThemedText><ThemedText type="smallBold" style={[styles.detailValue, { color: theme.primaryText }]}>{formatCurrency(result.dailyWage)}</ThemedText></View></View></View></View> : null}
                            </Card.Content></Card> : null}
                        </Card.Content>
                    </Card>
                </SafeAreaView>
            </ScrollView>
            <PersianDatePickerModal visible={pickerTarget !== null} value={pickerTarget === 'employment' ? employmentDate : pickerTarget === 'start' ? startDate : endDate} title={pickerTarget === 'employment' ? 'انتخاب تاریخ استخدام' : pickerTarget === 'start' ? 'انتخاب تاریخ شروع' : 'انتخاب تاریخ پایان'} onClose={() => setPickerTarget(null)} onSelect={handleDateSelect} availableYears={availableYears} />
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
    headerRow: { alignItems: 'flex-start' },
    headerText: { alignSelf: 'stretch', flex: 1, gap: Spacing.one },
    pageTitle: { display: 'none', fontSize: 16, lineHeight: 22, fontFamily: 'AppFont-Bold' },
    pageDescription: { fontSize: 13, lineHeight: 20 },
    formulaBox: { borderRadius: Radius.md, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: Spacing.two, paddingVertical: Spacing.two, gap: Spacing.one },
    formulaLabel: { fontSize: 11 },
    formulaValue: { fontSize: 12, lineHeight: 20 },
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
    sectionLabel: { fontSize: 11 },
    helpText: { fontSize: 11, lineHeight: 20, fontFamily: 'AppFont-Regular' },
    dateInput: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.two, paddingVertical: Spacing.two, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, gap: Spacing.one },
    fieldValue: { flex: 1, fontSize: 13 },
    textInput: { minHeight: 42, borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, paddingHorizontal: Spacing.two, fontFamily: 'AppFont-Bold', fontSize: 14 },
    usedLeaveBox: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: Spacing.two, gap: Spacing.two },
    usedLeaveRow: { flexDirection: 'column', alignItems: 'stretch', gap: Spacing.two },
    usedLeaveLabel: { fontSize: 12, lineHeight: 19 },
    stepper: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: Spacing.one, gap: Spacing.one },
    stepperButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
    stepperButtonDisabled: { opacity: 0.4 },
    stepperInput: { flex: 1, minHeight: 42, fontFamily: 'AppFont-Bold', fontSize: 14, paddingVertical: 0 },
    initialSavedStepper: { width: '100%' },
    statusRow: { flexDirection: 'row', gap: Spacing.two },
    statusButton: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.one, paddingVertical: Spacing.two, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth },
    optionSection: { gap: Spacing.two, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: Spacing.two },
    leaveUsageField: { gap: Spacing.one },
    settlementRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: Spacing.two },
    checkText: { flex: 1, gap: Spacing.one },
    optionTitle: { fontSize: 13, lineHeight: 19, fontFamily: 'AppFont-Bold' },
    optionDescription: { fontSize: 11, lineHeight: 20, fontFamily: 'AppFont-Regular' },
    settlementText: { flex: 1, gap: Spacing.one },
    settlementTitle: { fontSize: 13, lineHeight: 19 },
    settlementDescription: { fontSize: 11, lineHeight: 20 },
    actionsGroup: { flexDirection: 'row', gap: Spacing.two },
    actionButton: { flex: 1, borderRadius: 12 },
    actionLabel: { fontFamily: 'AppFont-Bold', fontSize: 12 },
    paidAmountSection: { gap: Spacing.one, padding: Spacing.two, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12 },
    resultCard: { borderRadius: Radius.md, borderWidth: 1, marginTop: Spacing.two, overflow: 'hidden' },
    resultContent: { gap: Spacing.two, paddingVertical: Spacing.three, paddingHorizontal: Spacing.two },
    summaryBox: { width: '100%', alignItems: 'center', gap: Spacing.one, padding: Spacing.two, borderRadius: 12, borderWidth: 1 },
    summaryLabel: { fontSize: 11 },
    amountValue: { fontSize: 16, lineHeight: 22, fontFamily: 'AppFont-Bold' },
    breakdownHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.one, paddingVertical: Spacing.one, gap: Spacing.one },
    breakdownSectionTitle: { fontSize: 13, fontFamily: 'AppFont-Bold' },
    toggleButton: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one, paddingHorizontal: Spacing.two, paddingVertical: Spacing.one, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth },
    toggleButtonLabel: { fontSize: 11 },
    breakdownGrid: { gap: Spacing.two },
    breakdownItemCard: { borderRadius: Radius.md, borderWidth: 1, padding: Spacing.two, gap: Spacing.one },
    breakdownItemHeaderRow: { paddingTop: 2, paddingBottom: 2, marginBottom: 2, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(0, 0, 0, 0.12)' },
    breakdownItemTitle: { fontSize: 12, fontFamily: 'AppFont-Bold' },
    breakdownDetailGrid: { gap: Spacing.one },
    detailDescription: { fontSize: 12, lineHeight: 18 },
    detailBox: { alignItems: 'center', gap: Spacing.one, padding: Spacing.one, borderRadius: 8, borderWidth: 1 },
    detailLabel: { fontSize: 12 },
    detailValue: { fontSize: 16, lineHeight: 22, fontFamily: 'AppFont-Bold' },
});
