import { MaterialCommunityIcons } from '@expo/vector-icons';
import { toJalaali } from 'jalaali-js';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Card, Menu, Snackbar } from 'react-native-paper';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { FontAwareButton as Button, FontAwareMenuItem } from '@/components/font-aware-paper';
import { CurrencyAmountInput } from '@/components/currency-amount-input';
import { HiddenCalculationGuide } from '@/components/hidden-calculation-guide';
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
    calculateMissionAllowanceFromPeriodData,
    getMissionAllowancePeriodRanges,
    parseDateInput,
    type EntitledSeniorityWorkshopType,
    type MissionAllowanceCalculationResult,
    type MissionAllowancePeriodRange,
    type SalaryPeriodBucket,
} from '@/utils/salary-calculation';

type DateTarget = 'employment' | 'missionStart' | 'missionEnd';

const persianDigits = '۰۱۲۳۴۵۶۷۸۹';
const latinDigits = '0123456789';

function normalizeDigits(value: string) {
    return value.replace(/[۰-۹]/g, (digit) => latinDigits[persianDigits.indexOf(digit)]);
}

function toPersianDigits(value: string | number) {
    return String(value).replace(/\d/g, (digit) => persianDigits[Number(digit)]);
}

function formatDate(value: string) {
    const parsed = parseDateInput(value);
    if (!parsed) return '';

    return `${toPersianDigits(parsed.year)}/${toPersianDigits(String(parsed.month).padStart(2, '0'))}/${toPersianDigits(String(parsed.day).padStart(2, '0'))}`;
}

function compareDates(left: string, right: string) {
    const parsedLeft = parseDateInput(left);
    const parsedRight = parseDateInput(right);
    if (!parsedLeft || !parsedRight) return 0;

    const leftValue = parsedLeft.year * 10000 + parsedLeft.month * 100 + parsedLeft.day;
    const rightValue = parsedRight.year * 10000 + parsedRight.month * 100 + parsedRight.day;
    return leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
}

function formatParsedDate(value: { year: number; month: number; day: number }) {
    return `${toPersianDigits(value.year)}/${toPersianDigits(String(value.month).padStart(2, '0'))}/${toPersianDigits(String(value.day).padStart(2, '0'))}`;
}

export default function MissionAllowanceScreen() {
    const theme = useTheme();
    const { currencyPreference, formatCurrency } = useCurrencyFormatter();
    const insets = useSafeAreaInsets();
    const currentJalaliDate = useMemo(() => {
        const today = new Date();
        return toJalaali(today.getFullYear(), today.getMonth() + 1, today.getDate());
    }, []);
    const defaultMissionDate = `${currentJalaliDate.jy}/${String(currentJalaliDate.jm).padStart(2, '0')}/${String(currentJalaliDate.jd).padStart(2, '0')}`;

    const [employmentDate, setEmploymentDate] = useState(defaultMissionDate);
    const [missionStartDate, setMissionStartDate] = useState(defaultMissionDate);
    const [missionEndDate, setMissionEndDate] = useState(defaultMissionDate);
    const [missionDaysByPeriod, setMissionDaysByPeriod] = useState<Record<string, string>>({});
    const [pickerTarget, setPickerTarget] = useState<DateTarget | null>(null);
    const [workshopType, setWorkshopType] = useState<EntitledSeniorityWorkshopType>('unclassified');
    const [settledThrough1391, setSettledThrough1391] = useState(false);
    const [jobGroups, setJobGroups] = useState<{ id: number; group_number: number; sort_order: number }[]>([]);
    const [selectedGroup, setSelectedGroup] = useState<number | null>(null);
    const [groupMenuVisible, setGroupMenuVisible] = useState(false);
    const [periodBuckets, setPeriodBuckets] = useState<SalaryPeriodBucket[]>([]);
    const [availableYears, setAvailableYears] = useState<number[]>([]);
    const [isLoadingData, setIsLoadingData] = useState(true);
    const [result, setResult] = useState<MissionAllowanceCalculationResult | null>(null);
    const [amountPaidToWorker, setAmountPaidToWorker] = useState('۰');
    const [showDetailedBreakdown, setShowDetailedBreakdown] = useState(false);
    const [snackbarVisible, setSnackbarVisible] = useState(false);
    const [snackbarMessage, setSnackbarMessage] = useState('');

    useEffect(() => {
        let isMounted = true;

        const loadData = async () => {
            try {
                await seedFromJsonAsset();
                const [years, groups] = await Promise.all([fetchYears(), fetchJobGroups()]);
                const groupNumberById = new Map(groups.map((group) => [group.id, group.group_number]));
                const buckets: SalaryPeriodBucket[] = [];

                for (const year of years) {
                    const periods = await fetchPeriodsByYearId(year.id);
                    if (periods.length === 0) continue;

                    const mappedPeriods = await Promise.all(periods.map(async (period) => {
                        const seniorityRows = await fetchSeniorityBaseByGroup(period.id);

                        return {
                            period_index: period.period_index,
                            month_count: period.month_count,
                            daily_minimum_wage: period.daily_minimum_wage,
                            percent_increase: period.percent_increase,
                            seniority_base: period.seniority_base,
                            seniority_base_by_group: Object.fromEntries(
                                seniorityRows.map((row) => [
                                    groupNumberById.get(row.job_group_id) ?? row.job_group_id,
                                    Number(row.base_value),
                                ]),
                            ),
                        };
                    }));

                    buckets.push({ year: year.year, periods: mappedPeriods });
                }

                if (isMounted) {
                    setPeriodBuckets(buckets);
                    setAvailableYears(years.map((year) => year.year));
                    setJobGroups(groups);
                    setSelectedGroup(groups[0]?.group_number ?? null);
                }
            } catch {
                if (isMounted) {
                    setSnackbarMessage('خطا در بارگذاری داده‌های مزد و سنوات. دوباره تلاش کنید.');
                    setSnackbarVisible(true);
                }
            } finally {
                if (isMounted) setIsLoadingData(false);
            }
        };

        void loadData();
        return () => { isMounted = false; };
    }, []);

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
    const remainingMissionAllowance = result && isPaidAmountValid
        ? Math.max(0, Math.round(result.totalAmount) - amountPaidInRial)
        : null;
    const parsedMissionStart = parseDateInput(missionStartDate);
    const parsedMissionEnd = parseDateInput(missionEndDate);
    const availableMissionPeriods = useMemo(() => (
        parsedMissionStart && parsedMissionEnd
            ? getMissionAllowancePeriodRanges(parsedMissionStart, parsedMissionEnd, periodBuckets)
            : []
    ), [parsedMissionEnd, parsedMissionStart, periodBuckets]);
    const missionDaysTotal = availableMissionPeriods.reduce((total, period) => (
        total + (Number(normalizeDigits(missionDaysByPeriod[`${period.year}:${period.periodIndex}`] ?? '۰')) || 0)
    ), 0);

    const updateMissionDays = (periodKey: string, value: string) => {
        setMissionDaysByPeriod((currentValues) => ({
            ...currentValues,
            [periodKey]: value,
        }));
    };

    const changeMissionDays = (period: MissionAllowancePeriodRange, amount: number) => {
        const periodKey = `${period.year}:${period.periodIndex}`;
        const currentValue = Number(normalizeDigits(missionDaysByPeriod[periodKey] ?? '۰')) || 0;
        const available = period.availableDays;
        const nextValue = Math.min(available, Math.max(0, currentValue + amount));

        setMissionDaysByPeriod((currentValues) => ({
            ...currentValues,
            [periodKey]: toPersianDigits(String(nextValue)),
        }));
    };

    const validateMissionDays = (period: MissionAllowancePeriodRange) => {
        const periodKey = `${period.year}:${period.periodIndex}`;
        const value = Number(normalizeDigits((missionDaysByPeriod[periodKey] ?? '۰').trim()));
        const available = period.availableDays;

        if (Number.isInteger(value) && value > available) {
            setMissionDaysByPeriod((currentValues) => ({
                ...currentValues,
                [periodKey]: toPersianDigits(String(available)),
            }));
            setSnackbarMessage(`تعداد روزهای مأموریت در سال ${toPersianDigits(period.year)} و دورهٔ ${toPersianDigits(period.periodIndex)} نمی‌تواند از ${toPersianDigits(available)} روز بیشتر باشد.`);
            setSnackbarVisible(true);
        }
    };

    const showError = (message: string) => {
        setResult(null);
        setSnackbarMessage(message);
        setSnackbarVisible(true);
    };

    const handleDateSelect = (value: string) => {
        if (pickerTarget === 'employment') {
            if (compareDates(value, missionStartDate) > 0) {
                showError('تاریخ استخدام نمی‌تواند بعد از شروع مأموریت باشد.');
                setPickerTarget(null);
                return;
            }

            setEmploymentDate(value);
            if ((parseDateInput(value)?.year ?? 0) > 1391) setSettledThrough1391(false);
        } else if (pickerTarget === 'missionStart') {
            if (compareDates(value, missionEndDate) > 0) {
                showError('شروع مأموریت نمی‌تواند بعد از پایان آن باشد.');
                setPickerTarget(null);
                return;
            }

            setMissionStartDate(value);
            setMissionDaysByPeriod({});
        } else if (pickerTarget === 'missionEnd') {
            if (compareDates(value, missionStartDate) < 0) {
                showError('پایان مأموریت نمی‌تواند پیش از شروع آن باشد.');
                setPickerTarget(null);
                return;
            }

            setMissionEndDate(value);
            setMissionDaysByPeriod({});
        }

        setPickerTarget(null);
    };

    const handleCalculate = () => {
        const employment = parseDateInput(employmentDate);
        const missionStart = parseDateInput(missionStartDate);
        const missionEnd = parseDateInput(missionEndDate);

        if (
            !employment
            || !missionStart
            || !missionEnd
            || compareDates(employmentDate, missionStartDate) > 0
            || compareDates(missionStartDate, missionEndDate) > 0
        ) {
            showError('تاریخ استخدام و بازهٔ مأموریت را به‌درستی انتخاب کنید.');
            return;
        }

        if (workshopType === 'classified' && selectedGroup == null) {
            showError('گروه شغلی را انتخاب کنید.');
            return;
        }

        const parsedMissionDaysByPeriod: Record<string, number> = {};
        let totalMissionDays = 0;

        for (const period of availableMissionPeriods) {
            const periodKey = `${period.year}:${period.periodIndex}`;
            const displayedValue = missionDaysByPeriod[periodKey] ?? '۰';
            const normalizedValue = normalizeDigits(displayedValue.trim());
            const value = Number(normalizedValue);
            const available = period.availableDays;

            if (!/^\d+$/.test(normalizedValue) || !Number.isInteger(value) || value < 0) {
                showError(`تعداد روزهای مأموریت در سال ${toPersianDigits(period.year)} و دورهٔ ${toPersianDigits(period.periodIndex)} باید عدد صحیح صفر یا بزرگ‌تر باشد.`);
                return;
            }

            if (value > available) {
                showError(`تعداد روزهای مأموریت در سال ${toPersianDigits(period.year)} و دورهٔ ${toPersianDigits(period.periodIndex)} از روزهای موجود در بازه بیشتر است.`);
                return;
            }

            parsedMissionDaysByPeriod[periodKey] = value;
            totalMissionDays += value;
        }

        if (availableMissionPeriods.length === 0) {
            showError('برای بازهٔ مأموریت دورهٔ مزد معتبری پیدا نشد.');
            return;
        }

        if (totalMissionDays <= 0) {
            showError('تعداد روزهای مأموریت باید بیشتر از صفر باشد.');
            return;
        }

        const calculation = calculateMissionAllowanceFromPeriodData(
            employment,
            missionStart,
            missionEnd,
            parsedMissionDaysByPeriod,
            periodBuckets,
            workshopType,
            selectedGroup ?? undefined,
            settledThrough1391,
        );

        if (!calculation) {
            showError('برای تمام روزهای بازهٔ مأموریت دادهٔ مزد یا پایه سنوات پیدا نشد.');
            return;
        }

        setResult(calculation);
        setShowDetailedBreakdown(false);
    };

    const selectedDate = pickerTarget === 'employment'
        ? employmentDate
        : pickerTarget === 'missionStart'
            ? missionStartDate
            : missionEndDate;
    const formulaSeniorityLabel = workshopType === 'classified'
        ? 'پایه سنوات استحقاقی گروه شغلی'
        : 'پایه سنوات استحقاقی';

    return (
        <ThemedView style={styles.container}>
            <ScrollView
                contentContainerStyle={[
                    styles.scrollContent,
                    { paddingTop: insets.top + Spacing.three, paddingBottom: insets.bottom + Spacing.four },
                ]}
                showsVerticalScrollIndicator={false}
            >
                <SafeAreaView style={styles.safeArea}>
                    <Card elevation={1} style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                        <Card.Content style={styles.cardContent}>
                            <View style={styles.headerRow}>
                                <View style={styles.headerText}>
                                    <ThemedText type="bodyBold" style={[styles.pageTitle, { color: theme.text }]}>فوق‌العاده مأموریت</ThemedText>
                                    <CalculationDescriptionBox>
                                        <ThemedText type="small" style={[styles.pageDescription, { color: theme.textSecondary }]}>محاسبه حداقل مبلغ فوق‌العاده مأموریت براساس ماده ۴۶ قانون کار</ThemedText>
                                    </CalculationDescriptionBox>
                                </View>
                            </View>

                            <HiddenCalculationGuide>
                                حداقل مبلغ فوق‌العادهٔ مأموریت = روزهای مأموریت × (حداقل مزد روزانهٔ مصوب + پایه سنوات استحقاقی روزانهٔ همان بازه). روزهای بازه‌ای که شامل سالگرد استخدام است، پیش و پس از سالگرد جداگانه تخصیص می‌یابد.
                            </HiddenCalculationGuide>
                            <View style={styles.dateFieldsRow}>
                                <DateInputField
                                    label="از تاریخ"
                                    value={missionStartDate}
                                    onPress={() => setPickerTarget('missionStart')}
                                    formatValue={formatDate}
                                    iconName="calendar-start"
                                />
                                <DateInputField
                                    label="تا تاریخ"
                                    value={missionEndDate}
                                    onPress={() => setPickerTarget('missionEnd')}
                                    formatValue={formatDate}
                                    iconName="calendar-end"
                                />
                            </View>

                            <DateInputField
                                label="تاریخ استخدام"
                                value={employmentDate}
                                onPress={() => setPickerTarget('employment')}
                                formatValue={formatDate}
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
                                        anchor={(
                                            <Pressable onPress={() => setGroupMenuVisible(true)} style={[styles.groupSelector, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                                                <ThemedText type="smallBold" style={{ color: theme.text }}>
                                                    {selectedGroup == null ? 'انتخاب گروه شغلی' : `گروه ${toPersianDigits(selectedGroup)}`}
                                                </ThemedText>
                                                <MaterialCommunityIcons name="briefcase-outline" size={18} color={theme.primary} />
                                            </Pressable>
                                        )}
                                    >
                                        {jobGroups.map((group) => (
                                            <FontAwareMenuItem
                                                key={group.id}
                                                title={`گروه ${toPersianDigits(group.group_number)}`}
                                                onPress={() => { setSelectedGroup(group.group_number); setGroupMenuVisible(false); }}
                                            />
                                        ))}
                                    </Menu>
                                </View>
                            ) : null}

                            {canUseSettlementPath ? (
                                <SettlementThrough1391Field
                                    checked={settledThrough1391}
                                    enabled={canUseSettlementPath}
                                    onChange={setSettledThrough1391}
                                />
                            ) : null}

                            <View style={styles.yearFieldsGroup}>
                                <ThemedText type="small" style={[styles.sectionLabel, { color: theme.textSecondary }]}>تعداد روزهای مأموریت در هر دورهٔ مزد</ThemedText>
                                {availableMissionPeriods.map((period) => {
                                    const periodKey = `${period.year}:${period.periodIndex}`;
                                    const availableDays = period.availableDays;
                                    const displayedValue = missionDaysByPeriod[periodKey] ?? '۰';
                                    const normalizedValue = Number(normalizeDigits(displayedValue)) || 0;

                                    return (
                                        <View key={periodKey} style={[styles.yearField, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}>
                                            <View style={styles.yearFieldHeader}>
                                                <ThemedText type="smallBold" style={{ color: theme.text }}>
                                                    سال {toPersianDigits(period.year)} · دورهٔ {toPersianDigits(period.periodIndex)}
                                                </ThemedText>
                                                <ThemedText type="small" style={{ color: theme.textSecondary }}>
                                                    {formatParsedDate(period.startDate)} تا {formatParsedDate(period.endDate)} · حداکثر {toPersianDigits(availableDays)} روز
                                                </ThemedText>
                                            </View>
                                            <View style={[styles.stepper, { backgroundColor: theme.surface, borderColor: theme.border, direction: 'ltr' }]}>
                                                <Pressable
                                                    onPress={() => changeMissionDays(period, -1)}
                                                    disabled={normalizedValue <= 0}
                                                    style={({ pressed }) => [
                                                        styles.stepperButton,
                                                        { backgroundColor: pressed ? theme.primaryContainer : theme.surfaceVariant },
                                                        normalizedValue <= 0 && styles.stepperButtonDisabled,
                                                    ]}
                                                    accessibilityRole="button"
                                                    accessibilityLabel={`کاهش روزهای مأموریت سال ${period.year} دوره ${period.periodIndex}`}
                                                >
                                                    <MaterialCommunityIcons name="minus" size={20} color={theme.primary} />
                                                </Pressable>
                                                <NumericInputField
                                                    value={displayedValue}
                                                    onChangeText={(value) => updateMissionDays(periodKey, value)}
                                                    onBlur={() => validateMissionDays(period)}
                                                    placeholder="۰"
                                                    placeholderTextColor={theme.textMuted}
                                                    style={[styles.textInput, { color: theme.text, direction: 'ltr' }]}
                                                    textAlign="center"
                                                    accessibilityLabel={`تعداد روزهای مأموریت سال ${period.year} دوره ${period.periodIndex}`}
                                                />
                                                <Pressable
                                                    onPress={() => changeMissionDays(period, 1)}
                                                    disabled={normalizedValue >= availableDays}
                                                    style={({ pressed }) => [
                                                        styles.stepperButton,
                                                        { backgroundColor: pressed ? theme.primaryContainer : theme.surfaceVariant },
                                                        normalizedValue >= availableDays && styles.stepperButtonDisabled,
                                                    ]}
                                                    accessibilityRole="button"
                                                    accessibilityLabel={`افزایش روزهای مأموریت سال ${period.year} دوره ${period.periodIndex}`}
                                                >
                                                    <MaterialCommunityIcons name="plus" size={20} color={theme.primary} />
                                                </Pressable>
                                            </View>
                                        </View>
                                    );
                                })}
                                <ThemedText type="small" style={[styles.fieldHint, { color: theme.textSecondary }]}>
                                    مجموع روزهای ثبت‌شده: {toPersianDigits(missionDaysTotal)} روز
                                </ThemedText>
                                <ThemedText type="small" style={[styles.fieldHint, { color: theme.textSecondary }]}>
                                    اگر سالگرد استخدام داخل یک دوره باشد، روزهای مأموریت آن دوره به نسبت طول بخش‌های قبل و بعد از سالگرد تقسیم می‌شود.
                                </ThemedText>
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
                                    این مبلغ از فوق‌العادهٔ مأموریت محاسبه‌شده کسر می‌شود.
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

                            {result ? (
                                <Card style={[styles.breakdownCard, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}>
                                    <Card.Content style={styles.breakdownContent}>
                                        <CalculationResultHeading />
                                        <View style={[styles.summaryBoxContent, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                                            <ThemedText type="small" style={[styles.summaryLabel, { color: theme.textSecondary }]}>مبلغ فوق‌العاده مأموریت</ThemedText>
                                            <ThemedText type="largeTitle" style={[styles.amountValue, { color: theme.primary }]}>
                                                {formatCurrency(result.totalAmount)}
                                            </ThemedText>
                                        </View>
                                        <View style={[styles.totalMissionDaysBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                                            <ThemedText type="small" style={[styles.summaryLabel, { color: theme.textSecondary }]}>تعداد روزهای مأموریت در بازهٔ انتخاب‌شده</ThemedText>
                                            <ThemedText type="bodyBold" style={[styles.totalMissionDaysValue, { color: theme.text }]}>{toPersianDigits(result.totalMissionDays)} روز</ThemedText>
                                        </View>
                                        <View style={[styles.summaryBoxContent, { backgroundColor: theme.primaryContainer, borderColor: theme.primary }]}>
                                            <ThemedText type="smallBold" style={[styles.summaryLabel, { color: theme.textSecondary }]}>
                                                مبلغ فوق‌العادهٔ مأموریت پس از کسر مبلغ پرداخت‌شده به کارگر
                                            </ThemedText>
                                            <ThemedText type="largeTitle" style={[styles.amountValue, { color: theme.primary }]}>
                                                {remainingMissionAllowance === null
                                                    ? 'مبلغ پرداخت‌شده نامعتبر است'
                                                    : formatCurrency(remainingMissionAllowance)}
                                            </ThemedText>
                                        </View>
                                        <View style={styles.breakdownSectionHeader}>
                                            <ThemedText type="smallBold" style={[styles.breakdownSectionTitle, { color: theme.text }]}>جزئیات دوره‌ها</ThemedText>
                                            <Pressable onPress={() => setShowDetailedBreakdown((current) => !current)} style={[styles.toggleButton, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                                                <ThemedText type="smallBold" style={[styles.toggleButtonLabel, { color: theme.primary }]}>
                                                    {showDetailedBreakdown ? 'عدم نمایش' : 'نمایش جزئیات'}
                                                </ThemedText>
                                                <MaterialCommunityIcons name={showDetailedBreakdown ? 'chevron-up' : 'chevron-down'} size={18} color={theme.primary} />
                                            </Pressable>
                                        </View>
                                        {showDetailedBreakdown ? (
                                            <View style={styles.breakdownGrid}>
                                                {result.breakdown.map((item, index) => (
                                                    <View key={`${item.year}-${item.periodIndex}-${index}`} style={[styles.breakdownItemCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                                                        <View style={[styles.breakdownItemHeaderRow, { borderBottomColor: theme.border }]}>
                                                            <ThemedText type="smallBold" style={[styles.breakdownItemTitle, { color: theme.text }]}>
                                                                {`سال ${toPersianDigits(item.year)}${(periodBuckets.find((bucket) => bucket.year === item.year)?.periods.length ?? 0) > 1 ? ` · دورهٔ ${toPersianDigits(item.periodIndex)}` : ''}`}
                                                            </ThemedText>
                                                        </View>
                                                        <View style={styles.breakdownDetailGrid}>
                                                            <View style={[styles.breakdownDetailBox, { backgroundColor: theme.primaryContainer, borderColor: theme.primary }]}>
                                                                <ThemedText type="small" style={[styles.detailLabel, { color: theme.textSecondary }]}>بازهٔ زمانی</ThemedText>
                                                                <ThemedText type="smallBold" style={[styles.detailValue, { color: theme.primary }]}>
                                                                    {formatParsedDate(item.startDate)} تا {formatParsedDate(item.endDate)}
                                                                </ThemedText>
                                                            </View>
                                                            <View style={[styles.breakdownDetailBox, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}>
                                                                <ThemedText type="small" style={[styles.detailLabel, { color: theme.textSecondary }]}>نوع بازه</ThemedText>
                                                                <ThemedText type="smallBold" style={[styles.detailValue, { color: theme.text }]}>
                                                                    {item.phase === 'before-anniversary'
                                                                        ? 'پیش از سالگرد استخدام'
                                                                        : item.phase === 'after-anniversary'
                                                                            ? 'پس از سالگرد استخدام'
                                                                            : 'تصفیه‌شده تا پایان ۱۳۹۱'}
                                                                </ThemedText>
                                                            </View>
                                                            <View style={[styles.breakdownDetailBox, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}>
                                                                <ThemedText type="small" style={[styles.detailLabel, { color: theme.textSecondary }]}>روزهای موجود در این بخش</ThemedText>
                                                                <ThemedText type="smallBold" style={[styles.detailValue, { color: theme.text }]}>{toPersianDigits(item.daysCovered)} روز</ThemedText>
                                                            </View>
                                                            <View style={[styles.breakdownDetailBox, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}>
                                                                <ThemedText type="small" style={[styles.detailLabel, { color: theme.textSecondary }]}>روزهای مأموریت در این بخش</ThemedText>
                                                                <ThemedText type="smallBold" style={[styles.detailValue, { color: theme.text }]}>{toPersianDigits(item.missionDays)} روز</ThemedText>
                                                            </View>
                                                            <View style={[styles.breakdownDetailBox, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}>
                                                                <ThemedText type="small" style={[styles.detailLabel, { color: theme.textSecondary }]}>حداقل مزد روزانه</ThemedText>
                                                                <ThemedText type="smallBold" style={[styles.detailValue, { color: theme.text }]}>{formatCurrency(item.dailyMinimumWage)}</ThemedText>
                                                            </View>
                                                            <View style={[styles.breakdownDetailBox, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}>
                                                                <ThemedText type="small" style={[styles.detailLabel, { color: theme.textSecondary }]}>{formulaSeniorityLabel} روزانه</ThemedText>
                                                                <ThemedText type="smallBold" style={[styles.detailValue, { color: theme.text }]}>{formatCurrency(item.dailySeniority)}</ThemedText>
                                                            </View>
                                                            <View style={[styles.breakdownDetailBox, { backgroundColor: theme.primaryContainer, borderColor: theme.primary }]}>
                                                                <ThemedText type="small" style={[styles.detailLabel, { color: theme.textSecondary }]}>مبلغ این بخش</ThemedText>
                                                                <ThemedText type="smallBold" style={[styles.detailValue, { color: theme.primary }]}>{formatCurrency(item.amount)}</ThemedText>
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
                visible={pickerTarget !== null}
                value={selectedDate}
                title={pickerTarget === 'employment'
                    ? 'انتخاب تاریخ استخدام'
                    : pickerTarget === 'missionStart'
                        ? 'انتخاب شروع مأموریت'
                        : 'انتخاب پایان مأموریت'}
                onClose={() => setPickerTarget(null)}
                onSelect={handleDateSelect}
                availableYears={availableYears}
            />

            <Snackbar
                visible={snackbarVisible}
                onDismiss={() => setSnackbarVisible(false)}
                duration={5000}
                style={{ backgroundColor: theme.error, borderRadius: Radius.md }}
                action={{ label: 'بستن', onPress: () => setSnackbarVisible(false), labelStyle: { color: theme.surface } }}
            >
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
    headerText: { gap: Spacing.one },
    pageTitle: { display: 'none', fontSize: 16, lineHeight: 22, fontFamily: 'AppFont-Bold' },
    pageDescription: { fontSize: 13, lineHeight: 20 },
    formulaBox: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: Spacing.two, gap: Spacing.one },
    formulaLabel: { fontSize: 11, lineHeight: 16, fontFamily: 'AppFont-Medium' },
    formulaText: { fontSize: 12, lineHeight: 21 },
    metricBox: { borderRadius: 12, padding: Spacing.two, gap: Spacing.one },
    sectionLabel: { fontSize: 12, lineHeight: 18, fontFamily: 'AppFont-Medium' },
    dateFieldsRow: { flexDirection: 'row', gap: Spacing.two },
    daysValue: { minHeight: 40, textAlign: 'center', textAlignVertical: 'center', fontSize: 14, lineHeight: 20, fontFamily: 'AppFont-Bold' },
    yearFieldsGroup: { gap: Spacing.two },
    yearField: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: Spacing.two, gap: Spacing.one },
    yearFieldHeader: { gap: Spacing.half },
    stepper: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: Spacing.one, gap: Spacing.one },
    stepperButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
    stepperButtonDisabled: { opacity: 0.4 },
    textInput: { flex: 1, minHeight: 42, fontFamily: 'AppFont-Bold', fontSize: 14, paddingVertical: 0 },
    fieldHint: { fontSize: 11, lineHeight: 20, fontFamily: 'AppFont-Regular' },
    groupSelector: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.two, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth },
    actionsGroup: { flexDirection: 'row', gap: Spacing.two },
    actionButton: { flex: 1, borderRadius: 10 },
    actionLabel: { fontFamily: 'AppFont-Bold', fontSize: 12 },
    paidAmountSection: { gap: Spacing.one, padding: Spacing.two, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12 },
    breakdownCard: { borderRadius: Radius.md, borderWidth: 1, marginTop: Spacing.two, overflow: 'hidden' },
    breakdownContent: { gap: Spacing.two, paddingVertical: Spacing.three, paddingHorizontal: Spacing.two },
    summaryBoxContent: { width: '100%', borderRadius: 12, borderWidth: 1, padding: Spacing.two, gap: Spacing.one, alignItems: 'center' },
    summaryLabel: { fontSize: 12, lineHeight: 18, fontFamily: 'AppFont-Medium' },
    amountValue: { fontSize: 16, lineHeight: 22, fontFamily: 'AppFont-Bold' },
    detailsGrid: { gap: Spacing.two },
    totalMissionDaysBox: { width: '100%', borderRadius: 12, borderWidth: 1, padding: Spacing.two, gap: Spacing.one, alignItems: 'center' },
    totalMissionDaysValue: { fontSize: 16, lineHeight: 22, fontFamily: 'AppFont-Bold' },
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