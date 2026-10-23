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
import { ThemedText } from '@/components/themed-text';
import { CalculationDescriptionBox, CalculationResultHeading } from '@/components/calculation-card-sections';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { fetchPeriodsByYearId, fetchYears, seedFromJsonAsset } from '@/database';
import { useTheme } from '@/hooks/use-theme';
import { useCurrencyFormatter } from '@/hooks/use-currency-formatter';
import {
    calculateIllegalForeignWorkerPenaltyFromPeriodData,
    parseDateInput,
    type IllegalForeignWorkerPenaltyCalculationResult,
    type SalaryPeriodBucket,
} from '@/utils/salary-calculation';
import { useAppContext } from '@/hooks/use-app-context';

type PickerTarget = 'start' | 'end';

export default function IllegalForeignWorkerPenaltyScreen() {
    const theme = useTheme();
    const { formatCurrency } = useCurrencyFormatter();
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
    const [workerCount, setWorkerCount] = useState('1');
    const [pickerTarget, setPickerTarget] = useState<PickerTarget | null>(null);
    const [periodBuckets, setPeriodBuckets] = useState<SalaryPeriodBucket[]>([]);
    const [availableYears, setAvailableYears] = useState<number[]>([]);
    const [isLoadingData, setIsLoadingData] = useState(true);
    const [result, setResult] = useState<IllegalForeignWorkerPenaltyCalculationResult | null>(null);
    const [showDetails, setShowDetails] = useState(false);
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
    const latinDigits = '0123456789';

    const normalizeDigits = (value: string) => value.replace(/[۰-۹]/g, (digit) => latinDigits[persianDigits.indexOf(digit)]);
    const toPersianDigits = (value: string | number) => String(value).replace(/\d/g, (digit) => persianDigits[Number(digit)]);

    const changeWorkerCount = (delta: number) => {
        setWorkerCount((currentValue) => {
            const numericValue = Number(normalizeDigits((currentValue || '1').trim())) || 1;
            const nextValue = Math.max(1, numericValue + delta);
            return toPersianDigits(String(nextValue));
        });
    };

    const formatDate = (value: string) => {
        const parsed = parseDateInput(value);
        if (!parsed) {
            return '';
        }

        return `${toPersianDigits(parsed.year)}/${toPersianDigits(String(parsed.month).padStart(2, '0'))}/${toPersianDigits(String(parsed.day).padStart(2, '0'))}`;
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
            if (compareDates(value, endDate) > 0) {
                setEndDate(value);
            }
        } else if (pickerTarget === 'end') {
            if (compareDates(value, startDate) < 0) {
                setSnackbarMessage('تاریخ پایان باید برابر یا بزرگتر از تاریخ شروع باشد.');
                setSnackbarVisible(true);
            } else {
                setEndDate(value);
            }
        }

        setPickerTarget(null);
    };

    const { notifyCalculationCompleted } = useAppContext();
    const handleCalculate = () => {
        const parsedStart = parseDateInput(startDate);
        const parsedEnd = parseDateInput(endDate);

        if (!parsedStart || !parsedEnd || compareDates(startDate, endDate) > 0) {
            setResult(null);
            setSnackbarMessage('بازه زمانی واردشده معتبر نیست.');
            setSnackbarVisible(true);
            return;
        }

        const count = Number(normalizeDigits(workerCount.trim()));
        if (!Number.isFinite(count) || !Number.isInteger(count) || count < 1) {
            setResult(null);
            setSnackbarMessage('تعداد کارگران غیرمجاز باید یک عدد صحیح بزرگ‌تر یا برابر ۱ باشد.');
            setSnackbarVisible(true);
            return;
        }

        const yearsInRange = Array.from({ length: parsedEnd.year - parsedStart.year + 1 }, (_, index) => parsedStart.year + index);
        const missingYears = yearsInRange.filter((year) => !periodBuckets.some((bucket) => bucket.year === year));

        if (missingYears.length > 0) {
            setResult(null);
            setSnackbarMessage(`برای سال‌های ${missingYears.map((year) => toPersianDigits(year)).join('، ')} داده‌ای موجود نیست.`);
            setSnackbarVisible(true);
            return;
        }

        const calculation = calculateIllegalForeignWorkerPenaltyFromPeriodData(parsedStart, parsedEnd, periodBuckets, count);

        if (calculation.breakdown.length === 0) {
            setResult(null);
            setSnackbarMessage('برای بازه انتخاب‌شده محاسبه‌ای انجام نشد.');
            setSnackbarVisible(true);
            return;
        }

        setResult(calculation);
        notifyCalculationCompleted();
        setShowDetails(false);
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
                            <View style={styles.headerText}>
                                <ThemedText type="bodyBold" style={[styles.pageTitle, { color: theme.text }]}>
                                    مبلغ جریمه به‌کارگیری اتباع بیگانه غیرمجاز
                                </ThemedText>
                                <CalculationDescriptionBox>
                                    <ThemedText type="small" style={[styles.pageDescription, { color: theme.textSecondary }]}>
                                        محاسبه میزان جریمه کارفرما برای بازه زمانی اشتغال تبعه بیگانه غیرمجاز بر اساس تعداد کارگران غیرمجاز و حداقل مزد مصوب شورای عالی کار
                                    </ThemedText>
                                </CalculationDescriptionBox>
                            </View>

                            <View
                                style={[
                                    styles.formulaBox,
                                    { display: 'none', backgroundColor: theme.surfaceVariant, borderColor: theme.border },
                                ]}
                            >
                                <ThemedText type="smallBold" style={[styles.formulaLabel, { color: theme.textSecondary }]}>
                                    فرمول محاسبه
                                </ThemedText>
                                <ThemedText type="small" style={[styles.formulaText, { color: theme.text }]}>
                                    تعداد کارگران غیرمجاز × تعداد روز بازه زمانی انتخاب‌شده × حداقل مزد مصوب شورای عالی کار در سال × ۵
                                </ThemedText>
                            </View>

                            <View style={styles.metricsRow}>
                                <DateInputField label="از تاریخ" value={startDate} onPress={() => setPickerTarget('start')} formatValue={formatDate} />
                                <DateInputField label="تا تاریخ" value={endDate} onPress={() => setPickerTarget('end')} formatValue={formatDate} />
                            </View>

                            <View style={styles.yearFieldsGroup}>
                                <ThemedText type="small" style={[styles.sectionLabel, { color: theme.textSecondary }]}>
                                    تعداد کارگران غیرمجاز
                                </ThemedText>
                                <View style={[styles.stepper, { backgroundColor: theme.surface, borderColor: theme.border, direction: 'ltr' }]}>
                                    <Pressable
                                        onPress={() => changeWorkerCount(-1)}
                                        disabled={Number(normalizeDigits(workerCount || '1')) <= 1}
                                        style={({ pressed }) => [
                                            styles.stepperButton,
                                            { backgroundColor: pressed ? theme.primaryContainer : theme.surfaceVariant },
                                            Number(normalizeDigits(workerCount || '1')) <= 1 && styles.stepperButtonDisabled,
                                        ]}
                                        accessibilityRole="button"
                                        accessibilityLabel="کاهش تعداد کارگران غیرمجاز"
                                    >
                                        <MaterialCommunityIcons name="minus" size={20} color={theme.primaryText} />
                                    </Pressable>

                                    <NumericInputField
                                        value={workerCount}
                                        onChangeText={setWorkerCount}
                                        onBlur={() => {
                                            const value = Number(normalizeDigits(workerCount.trim()));
                                            if (!Number.isFinite(value) || !Number.isInteger(value) || value < 1) {
                                                setWorkerCount('1');
                                                setSnackbarMessage('تعداد کارگران غیرمجاز باید یک عدد صحیح بزرگ‌تر یا برابر ۱ باشد.');
                                                setSnackbarVisible(true);
                                            }
                                        }}
                                        placeholder="۱"
                                        placeholderTextColor={theme.textSecondary}
                                        style={[styles.textInput, { color: theme.text, direction: 'ltr' }]}
                                        textAlign="center"
                                        accessibilityLabel="تعداد کارگران غیرمجاز"
                                    />

                                    <Pressable
                                        onPress={() => changeWorkerCount(1)}
                                        style={({ pressed }) => [
                                            styles.stepperButton,
                                            { backgroundColor: pressed ? theme.primaryContainer : theme.surfaceVariant },
                                        ]}
                                        accessibilityRole="button"
                                        accessibilityLabel="افزایش تعداد کارگران غیرمجاز"
                                    >
                                        <MaterialCommunityIcons name="plus" size={20} color={theme.primaryText} />
                                    </Pressable>
                                </View>
                            </View>

                            <View style={styles.actionsGroup}>
                                <Button
                                    mode="contained"
                                    onPress={handleCalculate}
                                    icon="calculator"
                                    buttonColor={theme.primary}
                                    textColor={theme.onPrimary}
                                    style={styles.actionButton}
                                    labelStyle={styles.actionLabel}
                                    loading={isLoadingData}
                                    disabled={isLoadingData}
                                >
                                    محاسبه
                                </Button>
                            </View>

                            {result ? (
                                <Card style={[styles.resultCard, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}>
                                    <Card.Content style={styles.resultContent}>
                                        <CalculationResultHeading />
                                        <View style={[styles.summaryBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                                            <ThemedText type="small" style={[styles.summaryLabel, { color: theme.textSecondary }]}>
                                                مبلغ نهایی جریمه
                                            </ThemedText>
                                            <ThemedText type="largeTitle" style={[styles.amountValue, { color: theme.primaryText }]}>
                                                {toPersianDigits(formatCurrency(result.totalAmount))}
                                            </ThemedText>
                                        </View>

                                        <View style={styles.breakdownHeader}>
                                            <ThemedText type="smallBold" style={[styles.breakdownSectionTitle, { color: theme.text }]}>
                                                جزئیات دوره‌ها
                                            </ThemedText>
                                            <Pressable
                                                onPress={() => setShowDetails((value) => !value)}
                                                style={[styles.toggleButton, { backgroundColor: theme.surface, borderColor: theme.border }]}
                                            >
                                                <ThemedText type="smallBold" style={[styles.toggleButtonLabel, { color: theme.primaryText }]}>
                                                    {showDetails ? 'عدم نمایش' : 'نمایش جزئیات'}
                                                </ThemedText>
                                                <MaterialCommunityIcons name={showDetails ? 'chevron-up' : 'chevron-down'} size={18} color={theme.primaryText} />
                                            </Pressable>
                                        </View>

                                        {showDetails ? (
                                            <View style={styles.breakdownGrid}>
                                                {result.breakdown.map((item) => (
                                                    <View
                                                        key={`${item.year}-${item.periodIndex}`}
                                                        style={[styles.breakdownItemCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
                                                    >
                                                        <View style={[styles.breakdownItemHeaderRow, { borderBottomColor: theme.border }]}>
                                                            <ThemedText type="smallBold" style={[styles.breakdownItemTitle, { color: theme.text }]}>
                                                                {`سال ${toPersianDigits(item.year)}${(periodBuckets.find((bucket) => bucket.year === item.year)?.periods.length ?? 0) > 1 ? `، دوره ${toPersianDigits(item.periodIndex)}` : ''}`}
                                                            </ThemedText>
                                                        </View>

                                                        <View style={styles.detailGrid}>
                                                            <View style={[styles.detailBox, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}>
                                                                <ThemedText type="small" style={[styles.detailLabel, { color: theme.textSecondary }]}>تعداد روز</ThemedText>
                                                                <ThemedText type="smallBold" style={[styles.detailValue, { color: theme.text }]}>
                                                                    {toPersianDigits(item.daysCovered)} روز
                                                                </ThemedText>
                                                            </View>
                                                            <View style={[styles.detailBox, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}>
                                                                <ThemedText type="small" style={[styles.detailLabel, { color: theme.textSecondary }]}>کارگر غیرمجاز</ThemedText>
                                                                <ThemedText type="smallBold" style={[styles.detailValue, { color: theme.text }]}>
                                                                    {toPersianDigits(item.workerCount)} نفر
                                                                </ThemedText>
                                                            </View>
                                                            <View style={[styles.detailBox, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}>
                                                                <ThemedText type="small" style={[styles.detailLabel, { color: theme.textSecondary }]}>حداقل مزد روزانه</ThemedText>
                                                                <ThemedText type="smallBold" style={[styles.detailValue, { color: theme.text }]}>
                                                                    {toPersianDigits(formatCurrency(item.dailyMinimumWage))}
                                                                </ThemedText>
                                                            </View>
                                                            <View style={[styles.detailBox, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}>
                                                                <ThemedText type="small" style={[styles.detailLabel, { color: theme.textSecondary }]}>مبلغ</ThemedText>
                                                                <ThemedText type="smallBold" style={[styles.detailValue, { color: theme.text }]}>
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
                visible={pickerTarget !== null}
                value={pickerTarget === 'start' ? startDate : endDate}
                title={pickerTarget === 'start' ? 'انتخاب تاریخ شروع' : 'انتخاب تاریخ پایان'}
                onClose={() => setPickerTarget(null)}
                onSelect={handleDateSelect}
                availableYears={availableYears}
            />

            <Snackbar
                visible={snackbarVisible}
                onDismiss={() => setSnackbarVisible(false)}
                duration={5000}
                style={{ backgroundColor: theme.surfaceVariant }}
                wrapperStyle={{ zIndex: 999 }}
            >
                <ThemedText type="smallBold" style={{ color: theme.text }}>{snackbarMessage}</ThemedText>
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
    headerText: { alignSelf: 'stretch', gap: Spacing.one },
    pageTitle: { display: 'none', fontSize: 16, lineHeight: 22, fontFamily: 'AppFont-Bold' },
    pageDescription: { fontSize: 13, lineHeight: 20 },
    formulaBox: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: Spacing.two, gap: Spacing.one },
    formulaLabel: { fontSize: 11 },
    formulaText: { fontSize: 12, lineHeight: 21 },
    metricsRow: { flexDirection: 'row', gap: Spacing.two },
    metricBox: { flex: 1, borderRadius: 14, padding: Spacing.two, gap: Spacing.one },
    sectionLabel: { fontSize: 11 },
    dateInput: {
        minHeight: 42,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: Spacing.two,
        paddingVertical: Spacing.two,
        borderRadius: 8,
        borderWidth: StyleSheet.hairlineWidth,
    },
    yearFieldsGroup: { gap: Spacing.two },
    stepper: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: Spacing.one, gap: Spacing.one },
    stepperButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
    stepperButtonDisabled: { opacity: 0.4 },
    textInput: { flex: 1, minHeight: 42, fontFamily: 'AppFont-Bold', fontSize: 14, paddingVertical: 0 },
    actionsGroup: { flexDirection: 'row', gap: Spacing.two },
    actionButton: { flex: 1, borderRadius: 10 },
    actionLabel: { fontFamily: 'AppFont-Bold', fontSize: 12 },
    resultCard: { borderRadius: Radius.md, borderWidth: 1, marginTop: Spacing.two, overflow: 'hidden' },
    resultContent: { gap: Spacing.two, paddingVertical: Spacing.three, paddingHorizontal: Spacing.two },
    summaryBox: {
        width: '100%',
        alignItems: 'center',
        gap: Spacing.one,
        padding: Spacing.two,
        borderRadius: 12,
        borderWidth: 1,
    },
    summaryLabel: { fontSize: 11 },
    amountValue: { fontSize: 16, lineHeight: 22, fontFamily: 'AppFont-Bold' },
    breakdownHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: Spacing.one,
        paddingVertical: Spacing.one,
        gap: Spacing.one,
    },
    breakdownSectionTitle: { fontSize: 13, fontFamily: 'AppFont-Bold' },
    toggleButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.one,
        paddingHorizontal: Spacing.two,
        paddingVertical: Spacing.one,
        borderRadius: 12,
        borderWidth: StyleSheet.hairlineWidth,
    },
    toggleButtonLabel: { fontSize: 11 },
    breakdownGrid: { gap: Spacing.two },
    breakdownItemCard: { borderRadius: Radius.md, borderWidth: 1, padding: Spacing.two, gap: Spacing.one },
    breakdownItemHeaderRow: { paddingTop: 2, paddingBottom: 2, marginBottom: 2, borderBottomWidth: StyleSheet.hairlineWidth },
    breakdownItemTitle: { fontSize: 12, fontFamily: 'AppFont-Bold' },
    detailGrid: { gap: Spacing.one },
    detailBox: { alignItems: 'center', gap: Spacing.one, padding: Spacing.one, borderRadius: 8, borderWidth: 1 },
    detailLabel: { fontSize: 12 },
    detailValue: { fontSize: 16, lineHeight: 22, fontFamily: 'AppFont-Bold' },
});
