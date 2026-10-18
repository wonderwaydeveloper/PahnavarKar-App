import { MaterialCommunityIcons } from '@expo/vector-icons';
import { jalaaliMonthLength, toJalaali } from 'jalaali-js';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Card, Snackbar } from 'react-native-paper';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { FontAwareButton as Button } from '@/components/font-aware-paper';
import { CurrencyAmountInput } from '@/components/currency-amount-input';
import { DailyWorkTimeField, getDailyWorkMinutes } from '@/components/daily-work-time-field';
import { DateInputField } from '@/components/date-input-field';
import { PersianDatePickerModal } from '@/components/persian-date-picker-modal';
import { ThemedText } from '@/components/themed-text';
import { CalculationDescriptionBox, CalculationResultHeading } from '@/components/calculation-card-sections';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { fetchPeriodsByYearId, fetchYears, seedFromJsonAsset } from '@/database';
import { useTheme } from '@/hooks/use-theme';
import { useCurrencyFormatter } from '@/hooks/use-currency-formatter';
import { displayCurrencyToRial, getCurrencyLabel } from '@/utils/currency';
import { getDailyWorkRatio, scaleWageCalculationResult } from '@/utils/daily-work-ratio';
import {
    calculateSpousalAllowanceFromPeriodData,
    parseDateInput,
    type SalaryPeriodBucket,
    type SpousalAllowanceCalculationResult,
} from '@/utils/salary-calculation';

export default function SpousalAllowanceScreen() {
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
    const [periodBuckets, setPeriodBuckets] = useState<SalaryPeriodBucket[]>([]);
    const [availableYears, setAvailableYears] = useState<number[]>([]);
    const [isLoadingData, setIsLoadingData] = useState(true);
    const [result, setResult] = useState<SpousalAllowanceCalculationResult | null>(null);
    const [isWorkerInsuranceExempt, setIsWorkerInsuranceExempt] = useState(false);
    const [isLegalBasisVisible, setIsLegalBasisVisible] = useState(false);
    const [dailyWorkTime, setDailyWorkTime] = useState('07:20');
    const [amountPaidToWorker, setAmountPaidToWorker] = useState('۰');
    const [showDetailedBreakdown, setShowDetailedBreakdown] = useState(false);
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
                            marital_allowance: period.marital_allowance,
                        })),
                    });
                }

                if (isMounted) {
                    setPeriodBuckets(buckets);
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

    const toPersianDigits = (value: string) =>
        value.replace(/\d/g, (digit) => persianDigits[Number(digit)]);

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

    const handleDateSelect = (value: string) => {
        if (pickerTarget === 'start') {
            setStartDate(value);

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
                    setSnackbarMessage('تاریخ پایان باید برابر یا بزرگتر از تاریخ شروع باشد.');
                    setSnackbarVisible(true);
                    return;
                }
            }

            setEndDate(value);
        }
    };

    const handleCalculate = () => {
        const parsedStart = parseDateInput(startDate);
        const parsedEnd = parseDateInput(endDate);

        if (!parsedStart || !parsedEnd) {
            setResult(null);
            return;
        }

        if (parsedStart.year > parsedEnd.year ||
            (parsedStart.year === parsedEnd.year && parsedStart.month > parsedEnd.month) ||
            (parsedStart.year === parsedEnd.year && parsedStart.month === parsedEnd.month && parsedStart.day > parsedEnd.day)) {
            setResult(null);
            return;
        }

        if (periodBuckets.length === 0) {
            setResult(null);
            return;
        }

        const calculation = calculateSpousalAllowanceFromPeriodData(
            parsedStart,
            parsedEnd,
            periodBuckets,
        );

        const unavailableYears = periodBuckets
            .filter((bucket) => bucket.year >= parsedStart.year && bucket.year <= parsedEnd.year)
            .filter((bucket) => bucket.periods.some((period) => period.marital_allowance == null))
            .map((bucket) => bucket.year);

        if (unavailableYears.length > 0) {
            const message = parsedEnd.year < 1403
                ? 'حق تأهل از سال ۱۴۰۳ ایجاد شده است و شما در این بازهٔ زمانی مستحق دریافت آن نیستید.'
                : `برای سال‌های ${unavailableYears.map((year) => toPersianDigits(String(year))).join('، ')} مبلغ حق تأهل در داده‌های مصوب ثبت نشده است.`;

            setSnackbarMessage(message);
            setSnackbarVisible(true);
        }

        if (calculation.breakdown.length === 0) {
            setResult(null);
            return;
        }

        setResult(scaleWageCalculationResult(calculation, getDailyWorkRatio(getDailyWorkMinutes(dailyWorkTime))));
        setShowDetailedBreakdown(false);
    };

    const formattedResult = useMemo(() => {
        if (!result) {
            return formatCurrency(0);
        }

        return toPersianDigits(formatCurrency(result.totalAmount));
    }, [formatCurrency, result]);
    const roundedSpousalAllowanceAmount = Math.round(result?.totalAmount ?? 0);
    const workerInsuranceAmount = isWorkerInsuranceExempt
        ? 0
        : Math.round(roundedSpousalAllowanceAmount * 0.07);
    const employerInsuranceAmount = Math.round(roundedSpousalAllowanceAmount * 0.23);
    const finalClaimAmount = roundedSpousalAllowanceAmount - workerInsuranceAmount;
    const normalizedAmountPaid = amountPaidToWorker.replace(/[۰-۹]/g, (digit) =>
        String(persianDigits.indexOf(digit)),
    );
    const amountPaidInSelectedCurrency = Number(normalizedAmountPaid);
    const amountPaidInRial = displayCurrencyToRial(amountPaidInSelectedCurrency, currencyPreference);
    const isPaidAmountValid = Number.isSafeInteger(amountPaidInSelectedCurrency)
        && amountPaidInSelectedCurrency >= 0
        && Number.isSafeInteger(amountPaidInRial);
    const remainingClaimAmount = isPaidAmountValid
        ? Math.max(0, roundedSpousalAllowanceAmount - amountPaidInRial)
        : null;
    const finalRemainingClaimAmount = remainingClaimAmount === null
        ? null
        : Math.max(0, finalClaimAmount - amountPaidInRial);

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
                                        محاسبه حق تاهل
                                    </ThemedText>
                                    <CalculationDescriptionBox>
                                        <ThemedText type="small" style={[styles.pageDescription, { color: theme.textSecondary }]}>
                                            محاسبه حق تاهل براساس تصریح مصوبات شورای عالی کار از سال ۱۴۰۳
                                        </ThemedText>
                                    </CalculationDescriptionBox>
                                </View>
                            </View>

                            <View
                                style={[
                                    styles.formulaBox,
                                    { display: 'none', backgroundColor: theme.surfaceVariant, borderColor: theme.border },
                                ]}
                            >
                                <ThemedText type="small" style={[styles.formulaLabel, { color: theme.textSecondary }]}>
                                    فرمول محاسبه
                                </ThemedText>
                                <ThemedText type="small" style={[styles.formulaValue, { color: theme.text }]}>
                                    تعداد ماه کارکرد در هر سال × حق تاهل ماهیانه مصوب برای آن سال
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

                            <DailyWorkTimeField value={dailyWorkTime} onChange={setDailyWorkTime} />

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
                                    این مبلغ از حق تأهل استحقاقی کسر می‌شود.
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
                                <Button
                                    mode="contained"
                                    onPress={handleCalculate}
                                    icon="heart-outline"
                                    style={styles.actionButton}
                                    labelStyle={styles.actionLabel}
                                    buttonColor={theme.primary}
                                    textColor={theme.surface}
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
                                        <View style={styles.summaryBoxHeader}>
                                            <View style={styles.insuranceSummary}>
                                                <View style={[styles.insuranceSummaryRow, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                                                    <ThemedText type="small" style={[styles.insuranceSummaryLabel, { color: theme.textSecondary }]}>
                                                        مبلغ کل حق تاهل استحقاقی
                                                    </ThemedText>
                                                    <ThemedText type="smallBold" style={[styles.insuranceSummaryValue, { color: theme.text }]}>
                                                        {formattedResult}
                                                    </ThemedText>
                                                </View>
                                                <View style={[styles.insuranceSummaryRow, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                                                    <ThemedText type="small" style={[styles.insuranceSummaryLabel, { color: theme.textSecondary }]}>
                                                        سهم بیمه ی کارگر از حق تاهل (۷٪{isWorkerInsuranceExempt ? '، معاف' : ''})
                                                    </ThemedText>
                                                    <ThemedText type="smallBold" style={[styles.insuranceSummaryValue, { color: theme.text }]}>
                                                        {toPersianDigits(formatCurrency(workerInsuranceAmount))}
                                                    </ThemedText>
                                                </View>
                                                <View style={[styles.insuranceSummaryRow, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                                                    <ThemedText type="small" style={[styles.insuranceSummaryLabel, { color: theme.textSecondary }]}>
                                                        سهم بیمه ی کارفرما از حق تاهل (۲۳٪)
                                                    </ThemedText>
                                                    <ThemedText type="smallBold" style={[styles.insuranceSummaryValue, { color: theme.text }]}>
                                                        {toPersianDigits(formatCurrency(employerInsuranceAmount))}
                                                    </ThemedText>
                                                </View>
                                                <View style={[styles.insuranceSummaryRow, { backgroundColor: theme.primaryContainer, borderColor: theme.primary }]}>
                                                    <ThemedText type="smallBold" style={[styles.insuranceSummaryLabel, styles.insuranceSummaryEmphasisLabel, { color: theme.textSecondary }]}>
                                                        حق تاهل پس از کسر سهم بیمه ی کارگر
                                                    </ThemedText>
                                                    <ThemedText type="smallBold" style={[styles.insuranceSummaryValue, styles.insuranceSummaryEmphasisValue, { color: theme.primary }]}>
                                                        {toPersianDigits(formatCurrency(finalClaimAmount))}
                                                    </ThemedText>
                                                </View>
                                                <View style={[styles.insuranceSummaryRow, { backgroundColor: theme.primaryContainer, borderColor: theme.primary }]}>
                                                    <ThemedText type="smallBold" style={[styles.insuranceSummaryLabel, styles.insuranceSummaryEmphasisLabel, { color: theme.textSecondary }]}>
                                                        حق تأهل پس از کسر مبلغ پرداخت‌شده به کارگر
                                                    </ThemedText>
                                                    <ThemedText type="smallBold" style={[styles.insuranceSummaryValue, styles.insuranceSummaryEmphasisValue, { color: theme.primary }]}>
                                                        {remainingClaimAmount === null
                                                            ? 'مبلغ پرداخت‌شده نامعتبر است'
                                                            : formatCurrency(remainingClaimAmount)}
                                                    </ThemedText>
                                                </View>
                                                <View style={[styles.insuranceSummaryRow, { backgroundColor: theme.primaryContainer, borderColor: theme.primary }]}>
                                                    <ThemedText type="smallBold" style={[styles.insuranceSummaryLabel, styles.insuranceSummaryEmphasisLabel, { color: theme.textSecondary }]}>
                                                        حق تأهل پس از کسر سهم بیمهٔ کارگر و مبلغ پرداخت‌شده
                                                    </ThemedText>
                                                    <ThemedText type="smallBold" style={[styles.insuranceSummaryValue, styles.insuranceSummaryEmphasisValue, { color: theme.primary }]}>
                                                        {finalRemainingClaimAmount === null
                                                            ? 'مبلغ پرداخت‌شده نامعتبر است'
                                                            : formatCurrency(finalRemainingClaimAmount)}
                                                    </ThemedText>
                                                </View>
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
                                                                    حق تاهل ماهیانه
                                                                </ThemedText>
                                                                <ThemedText type="smallBold" style={[styles.detailValue, { color: theme.text }]}>
                                                                    {item.spousalAllowance != null ? toPersianDigits(formatCurrency(item.spousalAllowance)) : '-'}
                                                                </ThemedText>
                                                            </View>

                                                            <View style={[styles.breakdownDetailBox, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}>
                                                                <ThemedText type="small" style={[styles.detailLabel, { color: theme.textSecondary }]}>
                                                                    مبلغ این دوره
                                                                </ThemedText>
                                                                <ThemedText type="smallBold" style={[styles.detailValue, { color: theme.primary }]}>
                                                                    {toPersianDigits(formatCurrency(item.amount))}
                                                                </ThemedText>
                                                            </View>

                                                            <View style={[styles.breakdownDetailBox, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}>
                                                                <ThemedText type="small" style={[styles.detailLabel, { color: theme.textSecondary }]}>
                                                                    حق بیمه پرداختی به سازمان تامین اجتماعی
                                                                </ThemedText>
                                                                <ThemedText type="smallBold" style={[styles.detailValue, { color: theme.primary }]}>
                                                                    {toPersianDigits(formatCurrency(Math.round(item.amount * 0.3)))}
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
    headerRow: {
        alignItems: 'flex-start',
    },
    headerText: {
        flex: 1,
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
    optionBox: {
        borderRadius: 12,
        borderWidth: 1,
        paddingHorizontal: Spacing.two,
        paddingVertical: Spacing.two,
        gap: Spacing.one,
    },
    optionRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    checkboxRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.one,
    },
    detailLabel: {
        fontSize: 12,
    },
    helpRow: {
        marginTop: Spacing.one,
    },
    helpText: {
        lineHeight: 20,
        fontSize: 11,
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
    summaryBoxHeader: {
        width: '100%',
        marginBottom: Spacing.one,
    },
    insuranceSummary: {
        width: '100%',
        gap: Spacing.one,
    },
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
    insuranceSummaryLabel: {
        textAlign: 'center',
        fontSize: 12,
    },
    insuranceSummaryValue: {
        textAlign: 'center',
        fontSize: 16,
        lineHeight: 22,
        fontFamily: 'AppFont-Bold',
    },
    insuranceSummaryEmphasisLabel: {
        fontSize: 13,
    },
    insuranceSummaryEmphasisValue: {
        fontSize: 16,
        lineHeight: 22,
        fontFamily: 'AppFont-Bold',
    },
    insuranceExemptionOption: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.two,
        padding: Spacing.two,
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: 12,
    },
    paidAmountSection: {
        gap: Spacing.one,
        padding: Spacing.two,
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: 12,
    },
    insuranceExemptionText: {
        flex: 1,
        gap: Spacing.half,
    },
    insuranceExemptionDescription: {
        fontSize: 12,
    },
    insuranceLegalBasis: {
        gap: Spacing.one,
        padding: Spacing.two,
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: 12,
    },
    insuranceLegalSummary: {
        fontSize: 12,
        lineHeight: 18,
    },
    insuranceLegalToggle: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: Spacing.one,
        paddingVertical: Spacing.half,
    },
    insuranceLegalToggleLabel: {
        fontSize: 13,
    },
    insuranceLegalText: {
        fontSize: 12,
        lineHeight: 20,
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
    detailValue: {
        fontSize: 16,
        lineHeight: 22,
        fontFamily: 'AppFont-Bold',
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
