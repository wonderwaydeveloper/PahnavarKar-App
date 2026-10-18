import { MaterialCommunityIcons } from '@expo/vector-icons';
import { jalaaliMonthLength, toJalaali } from 'jalaali-js';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Card, Menu, Snackbar } from 'react-native-paper';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { FontAwareButton as Button, FontAwareMenuItem } from '@/components/font-aware-paper';
import { CurrencyAmountInput } from '@/components/currency-amount-input';
import { DateInputField } from '@/components/date-input-field';
import { NumericInputField } from '@/components/numeric-input-field';
import { PersianDatePickerModal } from '@/components/persian-date-picker-modal';
import { SettlementThrough1391Field } from '@/components/settlement-through-1391-field';
import { ThemedText } from '@/components/themed-text';
import { CalculationDescriptionBox, CalculationResultHeading } from '@/components/calculation-card-sections';
import { ThemedView } from '@/components/themed-view';
import { WorkshopTypeSelector } from '@/components/workshop-type-selector';
import { Radius, Spacing } from '@/constants/theme';
import { fetchJobGroups, fetchPeriodsByYearId, fetchSeniorityBaseByGroup, fetchYears, seedFromJsonAsset } from '@/database';
import { useTheme } from '@/hooks/use-theme';
import { useCurrencyFormatter } from '@/hooks/use-currency-formatter';
import { displayCurrencyToRial, getCurrencyLabel } from '@/utils/currency';
import {
    calculateAvailableFridaysByPeriod,
    calculateFridayWorkFromPeriodData,
    parseDateInput,
    type EntitledSeniorityWorkshopType,
    type FridayWorkCalculationResult,
    type SalaryPeriodBucket,
} from '@/utils/salary-calculation';

export default function FridayWorkScreen() {
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
    const [workshopType, setWorkshopType] = useState<EntitledSeniorityWorkshopType>('unclassified');
    const [settledThrough1391, setSettledThrough1391] = useState(false);
    const [jobGroups, setJobGroups] = useState<{ id: number; group_number: number; sort_order: number }[]>([]);
    const [selectedGroup, setSelectedGroup] = useState<number | null>(null);
    const [groupMenuVisible, setGroupMenuVisible] = useState(false);
    const [fridayWorkDaysByPeriod, setFridayWorkDaysByPeriod] = useState<Record<string, string>>({});
    const [pickerTarget, setPickerTarget] = useState<'start' | 'end' | 'employment' | null>(null);
    const [pickerVisible, setPickerVisible] = useState(false);
    const [periodBuckets, setPeriodBuckets] = useState<SalaryPeriodBucket[]>([]);
    const [availableYears, setAvailableYears] = useState<number[]>([]);
    const [isLoadingData, setIsLoadingData] = useState(true);
    const [result, setResult] = useState<FridayWorkCalculationResult | null>(null);
    const [amountPaidToWorker, setAmountPaidToWorker] = useState('۰');
    const [isWorkerInsuranceExempt, setIsWorkerInsuranceExempt] = useState(false);
    const [isLegalBasisVisible, setIsLegalBasisVisible] = useState(false);
    const [showDetailedBreakdown, setShowDetailedBreakdown] = useState(false);
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

                if (isMounted) {
                    setPeriodBuckets(buckets);
                    setAvailableYears(years.map((year) => year.year));
                    setJobGroups(groups);
                    setSelectedGroup(groups[0]?.group_number ?? null);
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
    const latinDigits = '0123456789';

    const normalizeDigits = (value: string) => value.replace(/[۰-۹]/g, (digit) => latinDigits[persianDigits.indexOf(digit)]);
    const toPersianDigits = (value: string | number) => String(value).replace(/\d/g, (digit) => persianDigits[Number(digit)]);

    const formatDisplayedDate = (value: string) => {
        const parsed = parseDateInput(value);

        if (!parsed) {
            return '';
        }

        return `${toPersianDigits(String(parsed.year))}/${toPersianDigits(String(parsed.month).padStart(2, '0'))}/${toPersianDigits(String(parsed.day).padStart(2, '0'))}`;
    };

    const compareDates = (left: string, right: string) => {
        const parsedLeft = parseDateInput(left);
        const parsedRight = parseDateInput(right);

        if (!parsedLeft || !parsedRight) {
            return 0;
        }

        const leftValue = parsedLeft.year * 10000 + parsedLeft.month * 100 + parsedLeft.day;
        const rightValue = parsedRight.year * 10000 + parsedRight.month * 100 + parsedRight.day;
        return leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
    };

    const openPicker = (target: 'start' | 'end' | 'employment') => {
        setPickerTarget(target);
        setPickerVisible(true);
    };

    const closePicker = () => {
        setPickerVisible(false);
        setPickerTarget(null);
    };

    const handleDateSelect = (value: string) => {
        if (pickerTarget === 'employment') {
            if (compareDates(value, startDate) > 0) {
                setSnackbarMessage('تاریخ استخدام باید برابر یا قبل از تاریخ شروع جمعه‌کاری باشد.');
                setSnackbarVisible(true);
                closePicker();
                return;
            }
            setEmploymentDate(value);
            if ((parseDateInput(value)?.year ?? 0) > 1391) {
                setSettledThrough1391(false);
            }
        } else if (pickerTarget === 'start') {
            setStartDate(value);
            setEmploymentDate(value);
            if ((parseDateInput(value)?.year ?? 0) > 1391) {
                setSettledThrough1391(false);
            }
            if (compareDates(value, endDate) > 0) {
                setEndDate(value);
            }
        } else if (pickerTarget === 'end') {
            if (compareDates(value, startDate) < 0) {
                setEndDate(startDate);
                setSnackbarMessage('تاریخ پایان باید برابر یا بزرگتر از تاریخ شروع باشد.');
                setSnackbarVisible(true);
                closePicker();
                return;
            }

            setEndDate(value);
        }
        closePicker();
    };

    const availableFridaysByPeriod = (() => {
        const parsedStartDate = parseDateInput(startDate);
        const parsedEndDate = parseDateInput(endDate);
        if (!parsedStartDate || !parsedEndDate || compareDates(startDate, endDate) > 0) {
            return [];
        }

        return calculateAvailableFridaysByPeriod(parsedStartDate, parsedEndDate, periodBuckets);
    })();
    const canUseSettlementPath = (parseDateInput(employmentDate)?.year ?? 0) <= 1391;

    const getFridayWorkPeriodKey = (year: number, periodIndex: number) => `${year}:${periodIndex}`;

    const updateFridayWorkDays = (periodKey: string, value: string) => {
        setFridayWorkDaysByPeriod((currentValues) => ({
            ...currentValues,
            [periodKey]: value,
        }));
    };

    const changeFridayWorkDays = (year: number, periodIndex: number, available: number, amount: number) => {
        const periodKey = getFridayWorkPeriodKey(year, periodIndex);
        const currentValue = Number(normalizeDigits(
            fridayWorkDaysByPeriod[periodKey] ?? String(available),
        )) || 0;
        const nextValue = Math.min(available, Math.max(0, currentValue + amount));

        setFridayWorkDaysByPeriod((currentValues) => ({
            ...currentValues,
            [periodKey]: toPersianDigits(String(nextValue)),
        }));
    };

    const validateFridayWorkDays = (year: number, periodIndex: number, available: number) => {
        const periodKey = getFridayWorkPeriodKey(year, periodIndex);
        const value = Number(normalizeDigits((fridayWorkDaysByPeriod[periodKey] ?? '').trim()));

        if (Number.isInteger(value) && value > available) {
            setFridayWorkDaysByPeriod((currentValues) => ({
                ...currentValues,
                [periodKey]: toPersianDigits(String(available)),
            }));
            setSnackbarMessage(`تعداد جمعه‌کاری واردشده در سال ${toPersianDigits(year)} و دورهٔ ${toPersianDigits(periodIndex)} از جمعه‌های موجود بیشتر است.`);
            setSnackbarVisible(true);
        }
    };

    const handleCalculate = () => {
        const parsedStart = parseDateInput(startDate);
        const parsedEnd = parseDateInput(endDate);

        const parsedEmployment = parseDateInput(employmentDate);
        if (!parsedStart || !parsedEnd || !parsedEmployment || compareDates(startDate, endDate) > 0 || compareDates(employmentDate, startDate) > 0) {
            setResult(null);
            setSnackbarMessage('بازهٔ زمانی یا تاریخ استخدام واردشده معتبر نیست.');
            setSnackbarVisible(true);
            return;
        }

        if (periodBuckets.length === 0) {
            setResult(null);
            return;
        }

        if (workshopType === 'classified' && selectedGroup == null) {
            setResult(null);
            setSnackbarMessage('گروه شغلی را انتخاب کنید.');
            setSnackbarVisible(true);
            return;
        }

        const parsedFridayWorkDaysByPeriod: Record<string, number> = {};
        for (const period of availableFridaysByPeriod) {
            const periodKey = getFridayWorkPeriodKey(period.year, period.periodIndex);
            const displayedValue = fridayWorkDaysByPeriod[periodKey] ?? toPersianDigits(period.availableFridays);
            const normalizedValue = normalizeDigits(displayedValue.trim());
            const value = Number(normalizedValue);
            const available = period.availableFridays;

            if (!/^\d+$/.test(normalizedValue) || !Number.isInteger(value) || value < 0) {
                setResult(null);
                setSnackbarMessage(`تعداد جمعه‌کاری سال ${toPersianDigits(period.year)} و دورهٔ ${toPersianDigits(period.periodIndex)} باید عدد صحیح صفر یا بزرگ‌تر باشد.`);
                setSnackbarVisible(true);
                return;
            }

            if (value > available) {
                setResult(null);
                setSnackbarMessage(`تعداد جمعه‌کاری واردشده در سال ${toPersianDigits(period.year)} و دورهٔ ${toPersianDigits(period.periodIndex)} از جمعه‌های موجود بیشتر است.`);
                setSnackbarVisible(true);
                return;
            }

            parsedFridayWorkDaysByPeriod[periodKey] = value;
        }

        const calculation = calculateFridayWorkFromPeriodData(
            parsedStart,
            parsedEnd,
            parsedEmployment,
            periodBuckets,
            parsedFridayWorkDaysByPeriod,
            workshopType,
            selectedGroup ?? undefined,
            settledThrough1391,
        );

        if (calculation.breakdown.length === 0) {
            setResult(null);
            setSnackbarMessage('برای بازهٔ انتخابی مبلغ جمعه کاری ثبت‌شده‌ای پیدا نشد.');
            setSnackbarVisible(true);
            return;
        }

        setResult(calculation);
        setShowDetailedBreakdown(false);
    };

    const formattedResult = useMemo(() => (
        result ? toPersianDigits(formatCurrency(result.totalAmount)) : formatCurrency(0)
    ), [formatCurrency, result]);
    const roundedFridayWorkAmount = Math.round(result?.totalAmount ?? 0);
    const workerInsuranceAmount = isWorkerInsuranceExempt
        ? 0
        : Math.round(roundedFridayWorkAmount * 0.07);
    const employerInsuranceAmount = Math.round(roundedFridayWorkAmount * 0.23);
    const finalClaimAmount = roundedFridayWorkAmount - workerInsuranceAmount;
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
    const remainingFridayWorkAmount = isPaidAmountValid
        ? Math.max(0, roundedFridayWorkAmount - amountPaidInRial)
        : null;
    const finalRemainingFridayWorkAmount = remainingFridayWorkAmount === null
        ? null
        : Math.max(0, finalClaimAmount - amountPaidInRial);
    const totalFridaysInRange = availableFridaysByPeriod.reduce((sum, period) => sum + period.availableFridays, 0);

    return (
        <ThemedView style={styles.container}>
            <ScrollView
                contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + Spacing.three, paddingBottom: insets.bottom + Spacing.four }]}
                showsVerticalScrollIndicator={false}
            >
                <SafeAreaView style={styles.safeArea}>
                    <Card elevation={1} style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                        <Card.Content style={styles.cardContent}>
                            <View style={styles.headerRow}>
                                <View style={styles.headerText}>
                                    <ThemedText type="bodyBold" style={[styles.pageTitle, { color: theme.text }]}>محاسبه جمعه کاری</ThemedText>
                                    <CalculationDescriptionBox>
                                        <ThemedText type="small" style={[styles.pageDescription, { color: theme.textSecondary }]}>محاسبه مزد جمعه‌کاری‌های انجام‌شده براساس ماده ۶۲ قانون کار</ThemedText>
                                    </CalculationDescriptionBox>
                                </View>
                            </View>

                            <View style={[styles.formulaBox, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}>
                                <ThemedText type="small" style={[styles.formulaLabel, { color: theme.textSecondary }]}>فرمول محاسبه</ThemedText>
                                <ThemedText type="small" style={[styles.formulaValue, { color: theme.text }]}>مبلغ کل جمعه‌کاری = مجموعِ (تعداد جمعه‌کاری کارگر در هر دوره × ۰٫۴۰ × (حداقل مزد مصوب روزانه + پایه سنوات استحقاقی همان دوره))</ThemedText>
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
                                onPress={() => {
                                    setPickerTarget('employment');
                                    setPickerVisible(true);
                                }}
                                formatValue={formatDisplayedDate}
                                iconName="calendar-account-outline"
                                helperText="جهت محاسبه پایه سنوات استحقاقی و اعمال آن در محاسبات"
                            />

                            <WorkshopTypeSelector value={workshopType} onValueChange={setWorkshopType} />

                            {workshopType === 'classified' ? <View style={[styles.metricBox, { backgroundColor: theme.surfaceVariant }]}>
                                <ThemedText type="small" style={[styles.sectionLabel, { color: theme.textSecondary }]}>گروه شغلی</ThemedText>
                                <Menu visible={groupMenuVisible} onDismiss={() => setGroupMenuVisible(false)} anchor={<Pressable onPress={() => setGroupMenuVisible(true)} style={[styles.dateInput, { backgroundColor: theme.surface, borderColor: theme.border }]}><ThemedText type="small" style={[styles.fieldValue, { color: theme.text }]}>{selectedGroup == null ? 'انتخاب گروه شغلی' : `گروه ${toPersianDigits(String(selectedGroup))}`}</ThemedText><MaterialCommunityIcons name="briefcase-outline" size={18} color={theme.primary} /></Pressable>} contentStyle={{ borderRadius: 16, backgroundColor: theme.surface }}>
                                    {jobGroups.map((group) => <FontAwareMenuItem key={group.id} onPress={() => { setSelectedGroup(group.group_number); setGroupMenuVisible(false); }} title={`گروه ${toPersianDigits(String(group.group_number))}`} titleStyle={{ fontFamily: 'AppFont-Regular', color: theme.text }} />)}
                                </Menu>
                            </View> : null}

                            <SettlementThrough1391Field checked={settledThrough1391} enabled={canUseSettlementPath} onChange={setSettledThrough1391} />

                            <View style={styles.yearFieldsGroup}>
                                <ThemedText type="small" style={[styles.sectionLabel, { color: theme.textSecondary }]}>تعداد جمعه‌کاری کارگر در هر دوره</ThemedText>
                                {availableFridaysByPeriod.map(({ year, periodIndex, availableFridays }) => {
                                    const periodKey = getFridayWorkPeriodKey(year, periodIndex);
                                    const fridayWorkDays = fridayWorkDaysByPeriod[periodKey] ?? toPersianDigits(availableFridays);
                                    return (
                                        <View key={periodKey} style={[styles.yearField, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}>
                                            <View style={styles.yearFieldHeader}>
                                                <ThemedText type="smallBold" style={{ color: theme.text }}>
                                                    سال {toPersianDigits(year)}، دورهٔ {toPersianDigits(periodIndex)}
                                                </ThemedText>
                                                <ThemedText type="small" style={{ color: theme.textSecondary }}>
                                                    جمعه‌های موجود: {toPersianDigits(availableFridays)}
                                                </ThemedText>
                                            </View>
                                            <View style={[styles.stepper, { backgroundColor: theme.surface, borderColor: theme.border, direction: 'ltr' }]}>
                                                <Pressable
                                                    onPress={() => changeFridayWorkDays(year, periodIndex, availableFridays, -1)}
                                                    disabled={Number(normalizeDigits(fridayWorkDays)) <= 0}
                                                    style={({ pressed }) => [
                                                        styles.stepperButton,
                                                        { backgroundColor: pressed ? theme.primaryContainer : theme.surfaceVariant },
                                                        Number(normalizeDigits(fridayWorkDays)) <= 0 && styles.stepperButtonDisabled,
                                                    ]}
                                                    accessibilityRole="button"
                                                    accessibilityLabel={`کاهش جمعه‌کاری سال ${year} دوره ${periodIndex}`}
                                                >
                                                    <MaterialCommunityIcons name="minus" size={20} color={theme.primary} />
                                                </Pressable>
                                                <NumericInputField
                                                    value={fridayWorkDays}
                                                    onChangeText={(value) => updateFridayWorkDays(periodKey, value)}
                                                    onBlur={() => validateFridayWorkDays(year, periodIndex, availableFridays)}
                                                    placeholder={toPersianDigits(availableFridays)}
                                                    placeholderTextColor={theme.textMuted}
                                                    style={[styles.textInput, { color: theme.text, direction: 'ltr' }]}
                                                    textAlign="center"
                                                    accessibilityLabel={`تعداد جمعه‌کاری کارگر در سال ${year} دوره ${periodIndex}`}
                                                />
                                                <Pressable
                                                    onPress={() => changeFridayWorkDays(year, periodIndex, availableFridays, 1)}
                                                    disabled={Number(normalizeDigits(fridayWorkDays)) >= availableFridays}
                                                    style={({ pressed }) => [
                                                        styles.stepperButton,
                                                        { backgroundColor: pressed ? theme.primaryContainer : theme.surfaceVariant },
                                                        Number(normalizeDigits(fridayWorkDays)) >= availableFridays && styles.stepperButtonDisabled,
                                                    ]}
                                                    accessibilityRole="button"
                                                    accessibilityLabel={`افزایش جمعه‌کاری سال ${year} دوره ${periodIndex}`}
                                                >
                                                    <MaterialCommunityIcons name="plus" size={20} color={theme.primary} />
                                                </Pressable>
                                            </View>
                                        </View>
                                    );
                                })}
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
                                    این مبلغ از جمعه‌کاری محاسبه‌شده کسر می‌شود.
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
                                    color={isWorkerInsuranceExempt ? theme.primary : theme.textSecondary}
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
                                    <ThemedText type="smallBold" style={[styles.insuranceLegalToggleLabel, { color: theme.primary }]}>
                                        مبنای قانونی معافیت
                                    </ThemedText>
                                    <MaterialCommunityIcons
                                        name={isLegalBasisVisible ? 'chevron-up' : 'chevron-down'}
                                        size={18}
                                        color={theme.primary}
                                    />
                                </Pressable>
                                {isLegalBasisVisible ? (
                                    <ThemedText type="small" style={[styles.insuranceLegalText, { color: theme.text }]}>
                                        اسرا، آزادگان و جانبازان، براساس تبصرهٔ ۳ مادهٔ ۳۷ قانون جامع خدمات‌رسانی به ایثارگران مصوب ۱۳۹۱، و فرزندان شهید مطابق بند «ز» مادهٔ ۸۸ قانون برنامهٔ پنج‌سالهٔ ششم توسعه، که در بند ۲ قسمت «ت» مادهٔ ۳۱ قانون برنامهٔ پنج‌سالهٔ هفتم توسعه تنفیذ شده است، از پرداخت حق بیمهٔ سهم کارگر معاف هستند.
                                    </ThemedText>
                                ) : null}
                            </View>

                            <View style={styles.actionsGroup}>
                                <Button mode="contained" onPress={handleCalculate} icon="calendar-star" style={styles.actionButton} labelStyle={styles.actionLabel} buttonColor={theme.primary} textColor={theme.surface} loading={isLoadingData} disabled={isLoadingData}>محاسبه</Button>
                            </View>

                            {result ? (
                                <Card style={[styles.breakdownCard, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}>
                                    <Card.Content style={styles.breakdownContent}>
                                        <CalculationResultHeading />
                                        <View style={styles.insuranceSummary}>
                                            <View style={[styles.insuranceSummaryRow, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                                                <ThemedText type="small" style={[styles.insuranceSummaryLabel, { color: theme.textSecondary }]}>مبلغ کل جمعه‌کاری</ThemedText>
                                                <ThemedText type="smallBold" style={[styles.insuranceSummaryValue, { color: theme.text }]}>{formattedResult}</ThemedText>
                                            </View>
                                            <View style={[styles.insuranceSummaryRow, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                                                <ThemedText type="small" style={[styles.insuranceSummaryLabel, { color: theme.textSecondary }]}>سهم بیمهٔ کارگر از مبلغ جمعه‌کاری (۷٪{isWorkerInsuranceExempt ? '، معاف' : ''})</ThemedText>
                                                <ThemedText type="smallBold" style={[styles.insuranceSummaryValue, { color: theme.text }]}>{toPersianDigits(formatCurrency(workerInsuranceAmount))}</ThemedText>
                                            </View>
                                            <View style={[styles.insuranceSummaryRow, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                                                <ThemedText type="small" style={[styles.insuranceSummaryLabel, { color: theme.textSecondary }]}>سهم بیمهٔ کارفرما از مبلغ جمعه‌کاری (۲۳٪)</ThemedText>
                                                <ThemedText type="smallBold" style={[styles.insuranceSummaryValue, { color: theme.text }]}>{toPersianDigits(formatCurrency(employerInsuranceAmount))}</ThemedText>
                                            </View>
                                            <View style={[styles.totalFridaysBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                                                <ThemedText type="small" style={[styles.summaryLabel, { color: theme.textSecondary }]}>مجموع جمعه‌های موجود در بازهٔ انتخاب‌شده</ThemedText>
                                                <ThemedText type="bodyBold" style={[styles.totalFridaysValue, { color: theme.text }]}>{toPersianDigits(String(totalFridaysInRange))} روز</ThemedText>
                                            </View>
                                            <View style={[styles.insuranceSummaryRow, { backgroundColor: theme.primaryContainer, borderColor: theme.primary }]}>
                                                <ThemedText type="smallBold" style={[styles.insuranceSummaryLabel, styles.insuranceSummaryEmphasisLabel, { color: theme.textSecondary }]}>مبلغ جمعه‌کاری پس از کسر سهم بیمهٔ کارگر</ThemedText>
                                                <ThemedText type="smallBold" style={[styles.insuranceSummaryValue, styles.insuranceSummaryEmphasisValue, { color: theme.primary }]}>{toPersianDigits(formatCurrency(finalClaimAmount))}</ThemedText>
                                            </View>
                                            <View style={[styles.insuranceSummaryRow, { backgroundColor: theme.primaryContainer, borderColor: theme.primary }]}>
                                                <ThemedText type="smallBold" style={[styles.insuranceSummaryLabel, styles.insuranceSummaryEmphasisLabel, { color: theme.textSecondary }]}>
                                                    مبلغ جمعه‌کاری پس از کسر مبلغ پرداخت‌شده به کارگر
                                                </ThemedText>
                                                <ThemedText type="smallBold" style={[styles.insuranceSummaryValue, styles.insuranceSummaryEmphasisValue, { color: theme.primary }]}>
                                                    {remainingFridayWorkAmount === null
                                                        ? 'مبلغ پرداخت‌شده نامعتبر است'
                                                        : formatCurrency(remainingFridayWorkAmount)}
                                                </ThemedText>
                                            </View>
                                            <View style={[styles.insuranceSummaryRow, { backgroundColor: theme.primaryContainer, borderColor: theme.primary }]}>
                                                <ThemedText type="smallBold" style={[styles.insuranceSummaryLabel, styles.insuranceSummaryEmphasisLabel, { color: theme.textSecondary }]}>
                                                    مبلغ جمعه‌کاری پس از کسر سهم بیمهٔ کارگر و مبلغ پرداخت‌شده
                                                </ThemedText>
                                                <ThemedText type="smallBold" style={[styles.insuranceSummaryValue, styles.insuranceSummaryEmphasisValue, { color: theme.primary }]}>
                                                    {finalRemainingFridayWorkAmount === null
                                                        ? 'مبلغ پرداخت‌شده نامعتبر است'
                                                        : formatCurrency(finalRemainingFridayWorkAmount)}
                                                </ThemedText>
                                            </View>
                                        </View>
                                        <View style={styles.breakdownSectionHeader}>
                                            <ThemedText type="smallBold" style={[styles.breakdownSectionTitle, { color: theme.text }]}>جزئیات دوره‌ها</ThemedText>
                                            <Pressable onPress={() => setShowDetailedBreakdown((value) => !value)} style={[styles.toggleButton, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                                                <ThemedText type="smallBold" style={[styles.toggleButtonLabel, { color: theme.primary }]}>{showDetailedBreakdown ? 'عدم نمایش' : 'نمایش جزئیات'}</ThemedText>
                                                <MaterialCommunityIcons name={showDetailedBreakdown ? 'chevron-up' : 'chevron-down'} size={18} color={theme.primary} />
                                            </Pressable>
                                        </View>
                                        {showDetailedBreakdown ? (
                                            <View style={styles.breakdownGrid}>
                                                {result.breakdown.map((item, index) => (
                                                    <View key={`${item.year}-${item.periodIndex}-${index}`} style={[styles.breakdownItemCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                                                        <View style={[styles.breakdownItemHeaderRow, { borderBottomColor: theme.border }]}>
                                                            <ThemedText type="smallBold" style={[styles.breakdownItemTitle, { color: theme.text }]}>{`سال ${toPersianDigits(String(item.year))}${(periodBuckets.find((bucket) => bucket.year === item.year)?.periods.length ?? 0) > 1 ? ` · دوره ${toPersianDigits(String(item.periodIndex))}` : ''}`}</ThemedText>
                                                        </View>
                                                        <View style={styles.breakdownDetailGrid}>
                                                            <View style={[styles.breakdownDetailBox, { backgroundColor: theme.primaryContainer, borderColor: theme.primary }]}><ThemedText type="small" style={[styles.detailLabel, { color: theme.textSecondary }]}>بازهٔ زمانی</ThemedText><ThemedText type="smallBold" style={[styles.detailValue, { color: theme.primary }]}>{`${formatDisplayedDate(`${item.startDate.year}/${item.startDate.month}/${item.startDate.day}`)} تا ${formatDisplayedDate(`${item.endDate.year}/${item.endDate.month}/${item.endDate.day}`)}`}</ThemedText></View>
                                                            <View style={[styles.breakdownDetailBox, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}><ThemedText type="small" style={[styles.detailLabel, { color: theme.textSecondary }]}>نوع بازه</ThemedText><ThemedText type="smallBold" style={[styles.detailValue, { color: theme.text }]}>{item.phase === 'before-anniversary' ? 'پیش از سالگرد استخدام' : 'بعد از سالگرد استخدام'}</ThemedText></View>
                                                            <View style={[styles.breakdownDetailBox, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}><ThemedText type="small" style={[styles.detailLabel, { color: theme.textSecondary }]}>جمعه‌های موجود در این دوره</ThemedText><ThemedText type="smallBold" style={[styles.detailValue, { color: theme.text }]}>{toPersianDigits(String(item.fridaysInPeriod))} روز</ThemedText></View>
                                                            <View style={[styles.breakdownDetailBox, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}><ThemedText type="small" style={[styles.detailLabel, { color: theme.textSecondary }]}>جمعه‌کاری واردشده</ThemedText><ThemedText type="smallBold" style={[styles.detailValue, { color: theme.text }]}>{toPersianDigits(String(item.fridayWorkDays))} روز</ThemedText></View>
                                                            <View style={[styles.breakdownDetailBox, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}><ThemedText type="small" style={[styles.detailLabel, { color: theme.textSecondary }]}>حداقل مزد روزانه</ThemedText><ThemedText type="smallBold" style={[styles.detailValue, { color: theme.text }]}>{toPersianDigits(formatCurrency(item.dailyMinimumWage))}</ThemedText></View>
                                                            <View style={[styles.breakdownDetailBox, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}><ThemedText type="small" style={[styles.detailLabel, { color: theme.textSecondary }]}>{workshopType === 'classified' ? 'پایه سنوات استحقاقی روزانه گروه شغلی' : 'پایه سنوات استحقاقی روزانه'}</ThemedText><ThemedText type="smallBold" style={[styles.detailValue, { color: theme.text }]}>{toPersianDigits(formatCurrency(item.dailySeniority))}</ThemedText></View>
                                                            <View style={[styles.breakdownDetailBox, { backgroundColor: theme.primaryContainer, borderColor: theme.primary }]}><ThemedText type="small" style={[styles.detailLabel, { color: theme.textSecondary }]}>مبلغ یک روز جمعه کاری</ThemedText><ThemedText type="smallBold" style={[styles.detailValue, { color: theme.primary }]}>{item.fridayWorkRate != null ? toPersianDigits(formatCurrency(item.fridayWorkRate)) : '-'}</ThemedText></View>
                                                            <View style={[styles.breakdownDetailBox, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}><ThemedText type="small" style={[styles.detailLabel, { color: theme.textSecondary }]}>مبلغ این دوره</ThemedText><ThemedText type="smallBold" style={[styles.detailValue, { color: theme.primary }]}>{toPersianDigits(formatCurrency(item.amount))}</ThemedText></View>
                                                            <View style={[styles.breakdownDetailBox, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}><ThemedText type="small" style={[styles.detailLabel, { color: theme.textSecondary }]}>حق بیمه پرداختی به سازمان تامین اجتماعی</ThemedText><ThemedText type="smallBold" style={[styles.detailValue, { color: theme.primary }]}>{toPersianDigits(formatCurrency(Math.round(item.amount * 0.3)))}</ThemedText></View>
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

            <PersianDatePickerModal visible={pickerVisible} value={pickerTarget === 'start' ? startDate : pickerTarget === 'end' ? endDate : employmentDate} title={pickerTarget === 'start' ? 'انتخاب تاریخ شروع' : pickerTarget === 'end' ? 'انتخاب تاریخ پایان' : 'انتخاب تاریخ استخدام'} onClose={closePicker} onSelect={handleDateSelect} availableYears={availableYears} />

            <Snackbar visible={snackbarVisible} onDismiss={() => setSnackbarVisible(false)} duration={5000} style={{ backgroundColor: theme.error, borderRadius: Radius.md }} action={{ label: 'بستن', onPress: () => setSnackbarVisible(false), labelStyle: { color: theme.surface } }}>
                <ThemedText type="small" style={{ color: theme.surface }}>{snackbarMessage}</ThemedText>
            </Snackbar>
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
    headerText: { flex: 1, gap: Spacing.one },
    pageTitle: { display: 'none', fontSize: 16, lineHeight: 22, fontFamily: 'AppFont-Bold' },
    pageDescription: { lineHeight: 20, fontSize: 13 },
    formulaBox: { borderRadius: Radius.md, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: Spacing.two, paddingVertical: Spacing.two, gap: Spacing.one },
    formulaLabel: { fontSize: 11 },
    formulaValue: { lineHeight: 20, fontSize: 12 },
    metricsRow: { flexDirection: 'row', gap: Spacing.two },
    metricBox: { flex: 1, borderRadius: 14, paddingHorizontal: Spacing.two, paddingVertical: Spacing.two, gap: Spacing.one },
    yearFieldsGroup: { gap: Spacing.two },
    yearField: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: Spacing.two, gap: Spacing.one },
    yearFieldHeader: { gap: Spacing.half },
    sectionLabel: { fontSize: 11 },
    dateInput: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.one, paddingHorizontal: Spacing.two, paddingVertical: Spacing.two, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth },
    stepper: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: Spacing.one, gap: Spacing.one },
    stepperButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
    stepperButtonDisabled: { opacity: 0.4 },
    textInput: { flex: 1, minHeight: 42, fontFamily: 'AppFont-Bold', fontSize: 14, paddingVertical: 0 },
    fieldValue: { fontSize: 13, flex: 1 },
    helpText: { fontSize: 11, lineHeight: 20, fontFamily: 'AppFont-Regular' },
    optionSection: { gap: Spacing.two },
    optionsRow: { flexDirection: 'row', gap: Spacing.two },
    optionButton: { flex: 1, minHeight: 44, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.two },
    checkRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: Spacing.two },
    checkText: { flex: 1, gap: Spacing.one },
    optionTitle: { fontSize: 13, lineHeight: 19, fontFamily: 'AppFont-Bold' },
    optionDescription: { fontSize: 11, lineHeight: 20, fontFamily: 'AppFont-Regular' },
    actionsGroup: { flexDirection: 'row', gap: Spacing.two },
    actionButton: { flex: 1, borderRadius: 12 },
    actionLabel: { fontFamily: 'AppFont-Bold', fontSize: 12 },
    breakdownCard: { borderRadius: Radius.md, borderWidth: 1, marginTop: Spacing.two, overflow: 'hidden' },
    breakdownContent: { gap: Spacing.two, paddingVertical: Spacing.three, paddingHorizontal: Spacing.two },
    insuranceSummary: { width: '100%', gap: Spacing.one },
    insuranceSummaryRow: { minHeight: 52, flexDirection: 'column', alignItems: 'center', gap: Spacing.one, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, borderRadius: 12, borderWidth: 1 },
    insuranceSummaryLabel: { textAlign: 'center', fontSize: 12 },
    insuranceSummaryValue: { textAlign: 'center', fontSize: 16, lineHeight: 22, fontFamily: 'AppFont-Bold' },
    insuranceSummaryEmphasisLabel: { fontSize: 13 },
    insuranceSummaryEmphasisValue: { fontSize: 16, lineHeight: 22, fontFamily: 'AppFont-Bold' },
    insuranceExemptionOption: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, padding: Spacing.two, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12 },
    paidAmountSection: { gap: Spacing.one, padding: Spacing.two, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12 },
    insuranceExemptionText: { flex: 1, gap: Spacing.half },
    insuranceExemptionDescription: { fontSize: 12 },
    insuranceLegalBasis: { gap: Spacing.one, padding: Spacing.two, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12 },
    insuranceLegalSummary: { fontSize: 12, lineHeight: 18 },
    insuranceLegalToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.one, paddingVertical: Spacing.half },
    insuranceLegalToggleLabel: { fontSize: 13 },
    insuranceLegalText: { fontSize: 12, lineHeight: 20 },
    summaryLabel: { fontSize: 11 },
    totalFridaysBox: { width: '100%', borderRadius: 12, borderWidth: 1, padding: Spacing.two, gap: Spacing.one, alignItems: 'center' },
    totalFridaysValue: { fontSize: 16, lineHeight: 22, fontFamily: 'AppFont-Bold' },
    breakdownSectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.one, paddingVertical: Spacing.one, gap: Spacing.one },
    breakdownSectionTitle: { fontSize: 13 },
    toggleButton: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: Spacing.two, paddingVertical: Spacing.one },
    toggleButtonLabel: { fontSize: 11 },
    breakdownGrid: { gap: Spacing.two },
    breakdownItemCard: { borderRadius: Radius.md, borderWidth: 1, padding: Spacing.two, gap: Spacing.one },
    breakdownItemHeaderRow: { paddingTop: 2, paddingBottom: 2, marginBottom: 2, borderBottomWidth: StyleSheet.hairlineWidth },
    breakdownItemTitle: { fontSize: 12, fontFamily: 'AppFont-Bold' },
    breakdownDetailGrid: { gap: Spacing.one },
    breakdownDetailBox: { borderRadius: 8, borderWidth: 1, padding: Spacing.one, gap: Spacing.one, alignItems: 'center' },
    detailLabel: { fontSize: 12 },
    detailValue: { fontSize: 16, lineHeight: 22, fontFamily: 'AppFont-Bold' },
});