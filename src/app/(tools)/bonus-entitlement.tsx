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
    calculateBonusEntitlementFromPeriodData,
    parseDateInput,
    type BonusEntitlementCalculationResult,
    type EntitledSeniorityWorkshopType,
    type SalaryPeriodBucket,
} from '@/utils/salary-calculation';
import { useAppContext } from '@/hooks/use-app-context';

type PickerTarget = 'start' | 'end' | 'employment';
type WorkHoursMethod = 'daily' | 'period';

export default function BonusEntitlementScreen() {
    const theme = useTheme();
    const { currencyPreference, formatCurrency } = useCurrencyFormatter();
    const insets = useSafeAreaInsets();
    const currentDate = useMemo(() => {
        const today = new Date();
        return toJalaali(today.getFullYear(), today.getMonth() + 1, today.getDate());
    }, []);
    const currentYear = currentDate.jy;
    const defaultStartDate = `${currentYear}/01/01`;
    const defaultEndDate = `${currentYear}/12/${jalaaliMonthLength(currentYear, 12)}`;

    const [startDate, setStartDate] = useState(defaultStartDate);
    const [endDate, setEndDate] = useState(defaultEndDate);
    const [employmentDate, setEmploymentDate] = useState(defaultStartDate);
    const [pickerTarget, setPickerTarget] = useState<PickerTarget | null>(null);
    const [workshopType, setWorkshopType] = useState<EntitledSeniorityWorkshopType>('unclassified');
    const [settledThrough1391, setSettledThrough1391] = useState(false);
    const [workHoursMethod, setWorkHoursMethod] = useState<WorkHoursMethod>('daily');
    const [jobGroups, setJobGroups] = useState<{ id: number; group_number: number; sort_order: number }[]>([]);
    const [selectedGroup, setSelectedGroup] = useState<number | null>(null);
    const [groupMenuVisible, setGroupMenuVisible] = useState(false);
    const [periodBuckets, setPeriodBuckets] = useState<SalaryPeriodBucket[]>([]);
    const [officialHolidayDates, setOfficialHolidayDates] = useState<string[]>([]);
    const [availableYears, setAvailableYears] = useState<number[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [result, setResult] = useState<BonusEntitlementCalculationResult | null>(null);
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
                            (await fetchSeniorityBaseByGroup(period.id)).map((row) => [
                                groups.find((group) => group.id === row.job_group_id)?.group_number ?? row.job_group_id,
                                Number(row.base_value),
                            ]),
                        ),
                    })));
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
                    setAvailableYears(sortedYears);
                    setJobGroups(groups);
                    setSelectedGroup(groups[0]?.group_number ?? null);
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

    const digits = '۰۱۲۳۴۵۶۷۸۹';
    const toPersianDigits = (value: string | number) => String(value).replace(/\d/g, (digit) => digits[Number(digit)]);
    const formatNumber = (value: number) => toPersianDigits(value.toFixed(2).replace(/\.00$/, ''));
    const formatDate = (value: string) => {
        const parsed = parseDateInput(value);
        return parsed ? `${toPersianDigits(parsed.year)}/${toPersianDigits(String(parsed.month).padStart(2, '0'))}/${toPersianDigits(String(parsed.day).padStart(2, '0'))}` : '';
    };
    const compareDates = (left: string, right: string) => {
        const a = parseDateInput(left);
        const b = parseDateInput(right);
        if (!a || !b) return 0;
        return a.year * 10000 + a.month * 100 + a.day - (b.year * 10000 + b.month * 100 + b.day);
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
        .replace(/[۰-۹]/g, (digit) => String(digits.indexOf(digit)))
        .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));
    const amountPaidInSelectedCurrency = Number(normalizedAmountPaid);
    const amountPaidInRial = displayCurrencyToRial(amountPaidInSelectedCurrency, currencyPreference);
    const isPaidAmountValid = Number.isSafeInteger(amountPaidInSelectedCurrency)
        && amountPaidInSelectedCurrency >= 0
        && Number.isSafeInteger(amountPaidInRial)
        && (currencyPreference !== 'toman'
            || amountPaidInSelectedCurrency <= Math.floor(Number.MAX_SAFE_INTEGER / 10));
    const remainingBonusAmount = result && isPaidAmountValid
        ? Math.max(0, Math.round(result.totalEntitlementAmount) - amountPaidInRial)
        : null;

    const handleDateSelect = (value: string) => {
        if (pickerTarget === 'employment') {
            setEmploymentDate(value);
            if ((parseDateInput(value)?.year ?? 0) > 1391) {
                setSettledThrough1391(false);
            }
            if (compareDates(value, endDate) > 0) setEndDate(value);
        } else if (pickerTarget === 'start') {
            setStartDate(value);
            setEmploymentDate(value);
            if (compareDates(value, endDate) > 0) setEndDate(value);
            resetWorkHoursForDateChange();
        } else if (pickerTarget === 'end') {
            if (compareDates(value, startDate) < 0) {
                setSnackbarMessage('تاریخ پایان باید برابر یا بزرگ‌تر از تاریخ شروع باشد.');
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
        if (!parsedStartDate || !parsedEndDate || !employment || !isDateRangeValid || compareDates(employmentDate, startDate) > 0) {
            setResult(null);
            setSnackbarMessage('بازهٔ زمانی یا تاریخ استخدام معتبر نیست.');
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

        const calculation = calculateBonusEntitlementFromPeriodData(
            parsedStartDate,
            parsedEndDate,
            employment,
            periodBuckets,
            workshopType,
            selectedGroup ?? undefined,
            settledThrough1391,
        );
        if (calculation.breakdown.length === 0) {
            setResult(null);
            setSnackbarMessage('برای بازهٔ انتخاب‌شده دادهٔ قابل محاسبه‌ای پیدا نشد.');
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

    return (
        <ThemedView style={styles.container}>
            <ScrollView contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + Spacing.three, paddingBottom: insets.bottom + Spacing.four }]} showsVerticalScrollIndicator={false}>
                <SafeAreaView style={styles.safeArea}>
                    <Card elevation={1} style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                        <Card.Content style={styles.cardContent}>
                            <View style={styles.headerText}>
                                <ThemedText type="bodyBold" style={[styles.pageTitle, { color: theme.text }]}>محاسبه عیدی و پاداش استحقاقی</ThemedText>
                                <CalculationDescriptionBox>
                                    <ThemedText type="small" style={[styles.pageDescription, { color: theme.textSecondary }]}>محاسبه عیدی پاداش ماهیانه بر اساس ماده واحده قانون تعیین عیدی پاداش، مصوب مجلس در سال ۱۳۷۰</ThemedText>
                                </CalculationDescriptionBox>
                            </View>
                            <HiddenCalculationGuide>
                                    مبلغ محاسبه‌شدهٔ هر بازه = ماه‌های پوشش‌یافته × ۵ × (حداقل مزد روزانه + پایه سنوات روزانه). سقف هر بازه = ماه‌های پوشش‌یافته × ۷٫۵ × حداقل مزد روزانه؛ مبلغ استحقاقی از این سقف بیشتر نمی‌شود. نسبت ساعات کارکرد روزانه یا نسبت مجموع ساعات کارکرد بازه به ساعات موظفی نیز اعمال می‌شود.
                            </HiddenCalculationGuide>
                            <View style={styles.metricsRow}>
                                <DateInputField label="از تاریخ" value={startDate} onPress={() => setPickerTarget('start')} formatValue={formatDate} />
                                <DateInputField label="تا تاریخ" value={endDate} onPress={() => setPickerTarget('end')} formatValue={formatDate} />
                            </View>
                            <DateInputField label="تاریخ استخدام" value={employmentDate} onPress={() => setPickerTarget('employment')} formatValue={formatDate} iconName="calendar-account-outline" helperText="جهت محاسبه پایه سنوات استحقاقی و اعمال آن در محاسبات" />
                            <WorkshopTypeSelector value={workshopType} onValueChange={setWorkshopType} />
                            {workshopType === 'classified' ? (
                                <View style={[styles.metricBox, { backgroundColor: theme.surfaceVariant }]}>
                                    <ThemedText type="small" style={[styles.sectionLabel, { color: theme.textSecondary }]}>گروه شغلی</ThemedText>
                                    <Menu visible={groupMenuVisible} onDismiss={() => setGroupMenuVisible(false)} anchor={<Pressable onPress={() => setGroupMenuVisible(true)} style={[styles.dateInput, { backgroundColor: theme.surface, borderColor: theme.border }]}><ThemedText type="smallBold" style={{ color: theme.text }}>{selectedGroup == null ? 'انتخاب گروه شغلی' : `گروه ${toPersianDigits(selectedGroup)}`}</ThemedText><MaterialCommunityIcons name="briefcase-outline" size={18} color={theme.primaryText} /></Pressable>}>
                                        {jobGroups.map((group) => <FontAwareMenuItem key={group.id} onPress={() => { setSelectedGroup(group.group_number); setGroupMenuVisible(false); }} title={`گروه ${toPersianDigits(group.group_number)}`} />)}
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
                                <ThemedText type="small" style={{ color: theme.textSecondary }}>
                                    این مبلغ از عیدی و پاداش استحقاقی محاسبه‌شده کسر می‌شود.
                                </ThemedText>
                                {!isPaidAmountValid ? (
                                    <ThemedText type="small" style={{ color: theme.error }}>
                                        مبلغ باید عدد صحیح و نامنفیِ قابل محاسبه باشد.
                                    </ThemedText>
                                ) : null}
                            </View>
                            <View style={styles.actionsGroup}>
                                <Button mode="contained" onPress={handleCalculate} icon="gift-outline" buttonColor={theme.primary} textColor={theme.onPrimary} style={styles.actionButton} labelStyle={styles.actionLabel} loading={isLoading} disabled={isLoading}>محاسبه</Button>
                            </View>
                            {result ? (
                                <Card style={[styles.resultCard, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}>
                                    <Card.Content style={styles.resultContent}>
                                        <CalculationResultHeading />
                                        <View style={[styles.summaryBoxContent, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                                            <ThemedText type="small" style={[styles.summaryLabel, { color: theme.textSecondary }]}>مبلغ نهایی عیدی و پاداش در بازهٔ زمانی انتخابی</ThemedText>
                                            <ThemedText type="largeTitle" style={[styles.amountValue, { color: theme.primaryText }]}>{toPersianDigits(formatCurrency(result.totalEntitlementAmount))}</ThemedText>
                                        </View>
                                        <View style={styles.summaryDetailsGrid}>
                                            <View style={[styles.summaryDetailBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                                                <ThemedText type="small" style={[styles.summaryLabel, { color: theme.textSecondary }]}>حداقل عیدی و پاداش در بازهٔ زمانی انتخابی</ThemedText>
                                                <ThemedText type="smallBold" style={{ color: theme.text }}>{toPersianDigits(formatCurrency(result.totalMinimumAmount))}</ThemedText>
                                            </View>
                                            <View style={[styles.summaryDetailBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                                                <ThemedText type="small" style={[styles.summaryLabel, { color: theme.textSecondary }]}>حداکثر عیدی و پاداش در بازهٔ زمانی انتخابی</ThemedText>
                                                <ThemedText type="smallBold" style={{ color: theme.text }}>{toPersianDigits(formatCurrency(result.totalMaximumAmount))}</ThemedText>
                                            </View>
                                        </View>
                                        <View style={[styles.summaryBoxContent, { backgroundColor: theme.primaryContainer, borderColor: theme.primary }]}>
                                            <ThemedText type="smallBold" style={[styles.summaryLabel, { color: theme.textSecondary }]}>
                                                عیدی و پاداش استحقاقی پس از کسر مبلغ پرداخت‌شده به کارگر
                                            </ThemedText>
                                            <ThemedText type="largeTitle" style={[styles.amountValue, { color: theme.primaryText }]}>
                                                {remainingBonusAmount === null
                                                    ? 'مبلغ پرداخت‌شده نامعتبر است'
                                                    : toPersianDigits(formatCurrency(remainingBonusAmount))}
                                            </ThemedText>
                                        </View>
                                        <View style={styles.breakdownHeader}>
                                            <ThemedText type="smallBold" style={{ color: theme.text }}>جزئیات دوره‌ها</ThemedText>
                                            <Pressable onPress={() => setShowDetails((value) => !value)} style={[styles.toggleButton, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                                                <ThemedText type="smallBold" style={[styles.toggleButtonLabel, { color: theme.primaryText }]}>{showDetails ? 'عدم نمایش' : 'نمایش جزئیات'}</ThemedText>
                                                <MaterialCommunityIcons name={showDetails ? 'chevron-up' : 'chevron-down'} size={18} color={theme.primaryText} />
                                            </Pressable>
                                        </View>
                                        {showDetails ? <View style={styles.breakdownGrid}>{result.breakdown.map((item, index) => (
                                            <View key={`${item.year}-${item.periodIndex}-${index}`} style={[styles.breakdownItemCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                                                <View style={[styles.breakdownItemHeaderRow, { borderBottomColor: theme.border }]}>
                                                    <ThemedText type="smallBold" style={[styles.breakdownItemTitle, { color: theme.text }]}>{`سال ${toPersianDigits(item.year)}${(periodBuckets.find((bucket) => bucket.year === item.year)?.periods.length ?? 0) > 1 ? ` · دوره ${toPersianDigits(item.periodIndex)}` : ''}`}</ThemedText>
                                                </View>
                                                <View style={styles.breakdownDetailGrid}>
                                                    <View style={[styles.breakdownDetailBox, { backgroundColor: theme.primaryContainer, borderColor: theme.primary }]}>
                                                        <ThemedText type="small" style={[styles.detailLabel, { color: theme.textSecondary }]}>بازهٔ زمانی</ThemedText>
                                                        <ThemedText type="smallBold" style={[styles.detailValue, { color: theme.primaryText }]}>{formatDate(`${item.startDate.year}/${item.startDate.month}/${item.startDate.day}`)} تا {formatDate(`${item.endDate.year}/${item.endDate.month}/${item.endDate.day}`)}</ThemedText>
                                                    </View>
                                                    <View style={[styles.breakdownDetailBox, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}>
                                                        <ThemedText type="small" style={[styles.detailLabel, { color: theme.textSecondary }]}>نوع بازه</ThemedText>
                                                        <ThemedText type="smallBold" style={[styles.detailValue, { color: theme.text }]}>{item.phase === 'before-anniversary' ? 'پیش از سالگرد استخدام' : 'بعد از سالگرد استخدام'}</ThemedText>
                                                    </View>
                                                    <View style={[styles.breakdownDetailBox, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}>
                                                        <ThemedText type="small" style={[styles.detailLabel, { color: theme.textSecondary }]}>ماه‌های کارکرد دوره</ThemedText>
                                                        <ThemedText type="smallBold" style={[styles.detailValue, { color: theme.text }]}>{formatNumber(item.monthsCovered)} ماه</ThemedText>
                                                    </View>
                                                    <View style={[styles.breakdownDetailBox, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}>
                                                        <ThemedText type="small" style={[styles.detailLabel, { color: theme.textSecondary }]}>حداقل مزد روزانه</ThemedText>
                                                        <ThemedText type="smallBold" style={[styles.detailValue, { color: theme.text }]}>{toPersianDigits(formatCurrency(item.dailyMinimumWage))}</ThemedText>
                                                    </View>
                                                    <View style={[styles.breakdownDetailBox, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}>
                                                        <ThemedText type="small" style={[styles.detailLabel, { color: theme.textSecondary }]}>{workshopType === 'classified' ? 'پایه سنوات استحقاقی روزانه گروه شغلی' : 'پایه سنوات استحقاقی روزانه'}</ThemedText>
                                                        <ThemedText type="smallBold" style={[styles.detailValue, { color: theme.text }]}>{toPersianDigits(formatCurrency(item.dailySeniority))}</ThemedText>
                                                    </View>
                                                    <View style={[styles.breakdownDetailBox, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}>
                                                        <ThemedText type="small" style={[styles.detailLabel, { color: theme.textSecondary }]}>حداقل عیدی و پاداش</ThemedText>
                                                        <ThemedText type="smallBold" style={[styles.detailValue, { color: theme.text }]}>{toPersianDigits(formatCurrency(item.minimumAmount))}</ThemedText>
                                                    </View>
                                                    <View style={[styles.breakdownDetailBox, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}>
                                                        <ThemedText type="small" style={[styles.detailLabel, { color: theme.textSecondary }]}>حداکثر عیدی و پاداش</ThemedText>
                                                        <ThemedText type="smallBold" style={[styles.detailValue, { color: theme.text }]}>{toPersianDigits(formatCurrency(item.maximumAmount))}</ThemedText>
                                                    </View>
                                                    <View style={[styles.breakdownDetailBox, { backgroundColor: theme.primaryContainer, borderColor: theme.primary }]}>
                                                        <ThemedText type="small" style={[styles.detailLabel, { color: theme.textSecondary }]}>سهم نهایی دوره</ThemedText>
                                                        <ThemedText type="smallBold" style={[styles.detailValue, { color: theme.primaryText }]}>{toPersianDigits(formatCurrency(item.entitlementAmount))}</ThemedText>
                                                    </View>
                                                </View>
                                            </View>
                                        ))}</View> : null}
                                    </Card.Content>
                                </Card>
                            ) : null}
                        </Card.Content>
                    </Card>
                </SafeAreaView>
            </ScrollView>
            <PersianDatePickerModal visible={pickerTarget !== null} value={pickerTarget === 'start' ? startDate : pickerTarget === 'end' ? endDate : employmentDate} title={pickerTarget === 'start' ? 'انتخاب تاریخ شروع' : pickerTarget === 'end' ? 'انتخاب تاریخ پایان' : 'انتخاب تاریخ استخدام'} onClose={() => setPickerTarget(null)} onSelect={handleDateSelect} availableYears={availableYears} />
            <Snackbar visible={snackbarVisible} onDismiss={() => setSnackbarVisible(false)} duration={5000} style={{ backgroundColor: theme.errorFill, borderRadius: Radius.md }} action={{ label: 'بستن', onPress: () => setSnackbarVisible(false), labelStyle: { color: theme.onStatus } }}><ThemedText type="small" style={{ color: theme.onStatus }}>{snackbarMessage}</ThemedText></Snackbar>
        </ThemedView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 }, scrollContent: { flexGrow: 1 }, safeArea: { flex: 1, justifyContent: 'center', paddingHorizontal: 0 },
    card: { borderRadius: Radius.md, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' }, cardContent: { gap: Spacing.three, paddingVertical: Spacing.four, paddingHorizontal: Spacing.three },
    headerText: { alignSelf: 'stretch', gap: Spacing.one }, pageTitle: { display: 'none', fontSize: 16, lineHeight: 22, fontFamily: 'AppFont-Bold' }, pageDescription: { fontSize: 13, lineHeight: 20 },
    formulaBox: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: Spacing.two, gap: Spacing.one }, formulaLabel: { fontSize: 11 }, formulaText: { fontSize: 12, lineHeight: 21 },
    metricsRow: { flexDirection: 'row', gap: Spacing.two }, metricBox: { flex: 1, borderRadius: 14, padding: Spacing.two, gap: Spacing.one }, sectionLabel: { fontSize: 11 },
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
    dateInput: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.two, paddingVertical: Spacing.two, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth },
    optionSection: { gap: Spacing.two }, optionsRow: { flexDirection: 'row', gap: Spacing.two }, optionButton: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.two, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth },
    paidAmountSection: { gap: Spacing.one, padding: Spacing.two, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12 },
    checkRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, padding: Spacing.two, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth }, checkText: { flex: 1, gap: Spacing.one }, optionTitle: { fontSize: 13, lineHeight: 19, fontFamily: 'AppFont-Bold' }, optionDescription: { fontSize: 11, lineHeight: 20, fontFamily: 'AppFont-Regular' }, actionsGroup: { flexDirection: 'row', gap: Spacing.two }, actionButton: { flex: 1, borderRadius: 12 }, actionLabel: { fontFamily: 'AppFont-Bold', fontSize: 12 },
    resultCard: { borderRadius: Radius.md, borderWidth: 1, marginTop: Spacing.two, overflow: 'hidden' }, resultContent: { gap: Spacing.two, paddingVertical: Spacing.three, paddingHorizontal: Spacing.two }, summaryBoxContent: { width: '100%', alignItems: 'center', gap: Spacing.one, padding: Spacing.two, borderRadius: 12, borderWidth: 1 }, summaryDetailsGrid: { gap: Spacing.one }, summaryDetailBox: { width: '100%', alignItems: 'center', gap: Spacing.half, padding: Spacing.two, borderRadius: 12, borderWidth: 1 }, summaryLabel: { fontSize: 11 }, amountValue: { fontSize: 16, lineHeight: 22, fontFamily: 'AppFont-Bold' },
    breakdownHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.one, paddingVertical: Spacing.one, gap: Spacing.one }, breakdownSectionTitle: { fontSize: 13 }, toggleButton: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one, paddingHorizontal: Spacing.two, paddingVertical: Spacing.one, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth }, toggleButtonLabel: { fontSize: 11, lineHeight: 17, fontFamily: 'AppFont-Bold' }, breakdownGrid: { gap: Spacing.two }, breakdownItemCard: { gap: Spacing.one, padding: Spacing.two, borderRadius: Radius.md, borderWidth: 1 }, breakdownItemHeaderRow: { paddingTop: 2, paddingBottom: 2, marginBottom: 2, borderBottomWidth: StyleSheet.hairlineWidth },     breakdownItemTitle: { fontSize: 12, fontFamily: 'AppFont-Bold' }, breakdownDetailGrid: { gap: Spacing.one }, breakdownDetailBox: { alignItems: 'center', gap: Spacing.one, padding: Spacing.one, borderRadius: 8, borderWidth: 1 }, detailLabel: { fontSize: 12 }, detailValue: { fontSize: 16, lineHeight: 22, fontFamily: 'AppFont-Bold' },
});
