import { MaterialCommunityIcons } from '@expo/vector-icons';
import { toJalaali } from 'jalaali-js';
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
import type { PeriodRecord } from '@/database/types';
import { useTheme } from '@/hooks/use-theme';
import { useCurrencyFormatter } from '@/hooks/use-currency-formatter';
import { displayCurrencyToRial, rialToDisplayCurrency } from '@/utils/currency';
import {
    calculateUnemploymentInsuranceAllowance,
    parseDateInput,
    type UnemploymentInsuranceAllowanceCalculationResult,
} from '@/utils/salary-calculation';
import { useAppContext } from '@/hooks/use-app-context';

const persianDigits = '۰۱۲۳۴۵۶۷۸۹';
const latinDigits = '0123456789';

type DateTarget = 'unemployment';

interface YearPeriods {
    year: number;
    periods: PeriodRecord[];
}

function normalizeDigits(value: string) {
    return value.replace(/[۰-۹]/g, (digit) => latinDigits[persianDigits.indexOf(digit)]);
}

function toPersianDigits(value: string | number) {
    return String(value).replace(/\d/g, (digit) => persianDigits[Number(digit)]);
}

function changeNumber(value: string, delta: number, maximum?: number) {
    const currentValue = Number(normalizeDigits(value || '0')) || 0;
    const nextValue = Math.max(0, Math.trunc(currentValue) + delta);
    return toPersianDigits(String(maximum === undefined ? nextValue : Math.min(maximum, nextValue)));
}

function formatDate(value: string) {
    const parsed = parseDateInput(value);
    if (!parsed) return '';
    return `${toPersianDigits(parsed.year)}/${toPersianDigits(String(parsed.month).padStart(2, '0'))}/${toPersianDigits(String(parsed.day).padStart(2, '0'))}`;
}

function findDailyMinimumWage(date: ReturnType<typeof parseDateInput>, yearPeriods: YearPeriods[]) {
    if (!date) return null;

    const yearData = yearPeriods.find((item) => item.year === date.year);
    if (!yearData) return null;

    let monthOffset = 0;
    for (const period of [...yearData.periods].sort((left, right) => left.period_index - right.period_index)) {
        const periodLength = Number(period.month_count ?? 0);
        if (!Number.isFinite(periodLength) || periodLength <= 0) continue;

        const periodStartMonth = monthOffset + 1;
        const periodEndMonth = monthOffset + periodLength;
        if (date.month >= periodStartMonth && date.month <= periodEndMonth) {
            const minimumWage = Number(period.daily_minimum_wage ?? 0);
            return minimumWage > 0 ? minimumWage : null;
        }

        monthOffset = periodEndMonth;
    }

    return null;
}

function ResultDetail({ label, value, emphasized = false }: { label: string; value: string; emphasized?: boolean }) {
    const theme = useTheme();

    return (
        <View style={[styles.detailBox, { backgroundColor: emphasized ? theme.primaryContainer : theme.surface, borderColor: emphasized ? theme.primary : theme.border }]}>
            <ThemedText type="small" style={[styles.detailLabel, { color: theme.textSecondary }]}>{label}</ThemedText>
            <ThemedText type="smallBold" style={[styles.detailValue, { color: emphasized ? theme.primaryText : theme.text }]}>{value}</ThemedText>
        </View>
    );
}

export default function UnemploymentInsuranceAllowanceScreen() {
    const theme = useTheme();
    const { currencyPreference, formatCurrency } = useCurrencyFormatter();
    const insets = useSafeAreaInsets();
    const currentJalaliDate = useMemo(() => {
        const today = new Date();
        return toJalaali(today.getFullYear(), today.getMonth() + 1, today.getDate());
    }, []);
    const currentYear = currentJalaliDate.jy;
    const defaultUnemploymentDate = `${currentYear}/07/01`;

    const [unemploymentDate, setUnemploymentDate] = useState(defaultUnemploymentDate);
    const [totalWages, setTotalWages] = useState('۴۵۰۰۰۰۰۰۰');
    const [dependents, setDependents] = useState('۲');
    const [yearPeriods, setYearPeriods] = useState<YearPeriods[]>([]);
    const [isLoadingData, setIsLoadingData] = useState(true);
    const [pickerTarget, setPickerTarget] = useState<DateTarget | null>(null);
    const [result, setResult] = useState<UnemploymentInsuranceAllowanceCalculationResult | null>(null);
    const [snackbarMessage, setSnackbarMessage] = useState('');
    const [snackbarVisible, setSnackbarVisible] = useState(false);
    const displayedTotalWages = totalWages
        ? toPersianDigits(String(rialToDisplayCurrency(Number(normalizeDigits(totalWages)), currencyPreference)))
        : '';

    const unemployment = parseDateInput(unemploymentDate);
    const dailyMinimumWageValue = findDailyMinimumWage(unemployment, yearPeriods);

    useEffect(() => {
        let isMounted = true;

        const loadData = async () => {
            try {
                await seedFromJsonAsset();
                const years = await fetchYears();
                const loadedYearPeriods: YearPeriods[] = [];

                for (const year of years) {
                    const periods = await fetchPeriodsByYearId(year.id);
                    if (periods.length > 0) {
                        loadedYearPeriods.push({ year: year.year, periods });
                    }
                }

                if (isMounted) setYearPeriods(loadedYearPeriods);
            } catch {
                if (isMounted) {
                    setSnackbarMessage('خطا در بارگذاری مبلغ حداقل مزد روزانه مصوب شورای عالی کار از پایگاه داده.');
                    setSnackbarVisible(true);
                }
            } finally {
                if (isMounted) setIsLoadingData(false);
            }
        };

        void loadData();

        return () => {
            isMounted = false;
        };
    }, []);

    const openPicker = (target: DateTarget) => setPickerTarget(target);
    const selectedDate = unemploymentDate;

    const handleDateSelect = (value: string) => {
        if (pickerTarget === 'unemployment') {
            setUnemploymentDate(value);
        }
        setPickerTarget(null);
    };

    const showError = (message: string) => {
        setResult(null);
        setSnackbarMessage(message);
        setSnackbarVisible(true);
    };

    const { notifyCalculationCompleted } = useAppContext();
    const handleCalculate = () => {
        const unemployment = parseDateInput(unemploymentDate);
        const wages = Number(normalizeDigits(totalWages || '0'));
        const minimumWage = dailyMinimumWageValue ?? 0;
        const dependentCount = Number(normalizeDigits(dependents || '0'));

        if (!unemployment) {
            showError('تاریخ شروع بیکاری را درست وارد کنید.');
            return;
        }

        if (!Number.isFinite(wages) || wages <= 0) {
            showError('مجموع حقوق ۹۰ روز اخیر باید بیشتر از صفر باشد.');
            return;
        }

        if (isLoadingData || minimumWage <= 0) {
            showError('مبلغ حداقل مزد روزانه مصوب شورای عالی کار برای تاریخ انتخاب‌شده در پایگاه داده موجود نیست.');
            return;
        }

        if (!Number.isFinite(dependentCount) || dependentCount < 0 || dependentCount > 4) {
            showError('تعداد افراد تحت تکفل باید بین صفر تا چهار نفر باشد.');
            return;
        }

        const calculation = calculateUnemploymentInsuranceAllowance(
            wages,
            minimumWage,
            dependentCount,
        );

        setResult(calculation);
        notifyCalculationCompleted();
    };

    return (
        <ThemedView style={styles.container}>
            <ScrollView contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + Spacing.three, paddingBottom: insets.bottom + Spacing.four }]} showsVerticalScrollIndicator={false}>
                <SafeAreaView style={styles.safeArea}>
                    <Card elevation={1} style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                        <Card.Content style={styles.cardContent}>
                            <View style={styles.headerText}>
                                <ThemedText type="bodyBold" style={[styles.pageTitle, { color: theme.text }]}>مبلغ مقرری بیمه بیکاری</ThemedText>
                                <CalculationDescriptionBox>
                                    <ThemedText type="small" style={[styles.pageDescription, { color: theme.textSecondary }]}>محاسبه مقرری بیمه بیکاری براساس بند ب ماده ۷ قانون بیمه بیکاری</ThemedText>
                                </CalculationDescriptionBox>
                            </View>

                            <View
                                style={[
                                    styles.formulaBox,
                                    { display: 'none', backgroundColor: theme.surfaceVariant, borderColor: theme.border },
                                ]}
                            >
                                <ThemedText type="smallBold" style={{ color: theme.textSecondary }}>فرمول محاسبه</ThemedText>
                                <ThemedText type="small" style={[styles.formulaText, { color: theme.text }]}>
                                    شرط اولیه: احراز حداقل شش ماه سابقه از تاریخ شروع به کار تا تاریخ شروع بیکاری{'\n'}
                                    یا در صورت نداشتن ۶ ماه سابقه، وقوع حوادث قهریه و غیرمترقبه{'\n'}
                                    متوسط مزد روزانه = مجموع حقوق ۹۰ روز اخیر ÷ ۹۰{'\n'}
                                    مبلغ پایه روزانه = متوسط مزد روزانه × ۵۵٪{'\n'}
                                    سهم افراد تحت تکفل = تعداد افراد تحت تکفل × ۱۰٪ × مبلغ حداقل مزد روزانه مصوب شورای عالی کار{'\n'}
                                    مبلغ اولیه روزانه = مبلغ پایه روزانه + سهم افراد تحت تکفل{'\n'}
                                    مبلغ نهایی روزانه = اعمال کف مبلغ حداقل مزد روزانه مصوب شورای عالی کار و سقف ۸۰٪ متوسط مزد{'\n'}
                                    مقرری ماهیانه = مبلغ نهایی روزانه × ۳۰
                                </ThemedText>
                            </View>

                            <View style={[styles.metricBox, { backgroundColor: theme.surfaceVariant }]}>
                                <ThemedText type="small" style={[styles.fieldHint, { color: theme.textSecondary, fontSize: styles.formulaText.fontSize }]}>
                                    در صورت احراز شرایط دریافت مقرری بیمه بیکاری در فرایند بررسی‌ها در ادارات کار و تأمین اجتماعی
                                </ThemedText>
                            </View>

                            <DateInputField
                                label="تاریخ شروع بیکاری"
                                value={unemploymentDate}
                                onPress={() => openPicker('unemployment')}
                                formatValue={formatDate}
                            />

                            <View style={[styles.metricBox, { backgroundColor: theme.surfaceVariant }]}>
                                <ThemedText type="small" style={[styles.sectionLabel, { color: theme.textSecondary }]}>مجموع حقوق ۹۰ روز اخیر ({currencyPreference === 'toman' ? 'تومان' : 'ریال'})</ThemedText>
                                <NumericInputField
                                    value={displayedTotalWages}
                                    onChangeText={(value) => {
                                        if (value === '') {
                                            setTotalWages('');
                                            return;
                                        }

                                        const enteredAmount = Number(normalizeDigits(value));
                                        setTotalWages(toPersianDigits(String(displayCurrencyToRial(enteredAmount, currencyPreference))));
                                    }}
                                    style={[styles.textInput, { color: theme.text, backgroundColor: theme.surface, borderColor: theme.border, direction: 'ltr' }]}
                                    textAlign="center"
                                    accessibilityLabel={`مجموع حقوق ۹۰ روز اخیر (${currencyPreference === 'toman' ? 'تومان' : 'ریال'})`}
                                />
                                <ThemedText type="small" style={[styles.fieldHint, { color: theme.textMuted }]}>توجه: این مبلغ شامل حقوق و مزایای مشمول بیمه می‌باشد.</ThemedText>
                            </View>

                            <View style={[styles.metricBox, { backgroundColor: theme.surfaceVariant }]}>
                                <View style={styles.dependentsHeader}>
                                    <ThemedText type="small" style={[styles.sectionLabel, { color: theme.textSecondary }]}>تعداد افراد تحت تکفل</ThemedText>
                                    <ThemedText type="small" style={[styles.dependentsLimit, { color: theme.textMuted }]}>۰ تا ۴ نفر</ThemedText>
                                </View>
                                <View style={[styles.stepper, styles.dependentsStepper, { backgroundColor: theme.surface, borderColor: theme.border, direction: 'ltr' }]}>
                                    <Pressable onPress={() => setDependents((value) => changeNumber(value, -1))} disabled={Number(normalizeDigits(dependents || '0')) <= 0} style={({ pressed }) => [styles.stepperButton, { backgroundColor: pressed ? theme.primaryContainer : theme.surfaceVariant }, Number(normalizeDigits(dependents || '0')) <= 0 && styles.stepperButtonDisabled]} accessibilityRole="button" accessibilityLabel="کاهش افراد تحت تکفل"><MaterialCommunityIcons name="minus" size={20} color={theme.primaryText} /></Pressable>
                                    <NumericInputField value={dependents} onChangeText={setDependents} style={[styles.stepperInput, { color: theme.text, direction: 'ltr' }]} textAlign="center" accessibilityLabel="تعداد افراد تحت تکفل" />
                                    <Pressable onPress={() => setDependents((value) => changeNumber(value, 1, 4))} disabled={Number(normalizeDigits(dependents || '0')) >= 4} style={({ pressed }) => [styles.stepperButton, { backgroundColor: pressed ? theme.primaryContainer : theme.surfaceVariant }, Number(normalizeDigits(dependents || '0')) >= 4 && styles.stepperButtonDisabled]} accessibilityRole="button" accessibilityLabel="افزایش افراد تحت تکفل"><MaterialCommunityIcons name="plus" size={20} color={theme.primaryText} /></Pressable>
                                </View>
                            </View>

                            <View style={styles.actionsGroup}>
                                <Button mode="contained" onPress={handleCalculate} icon="cash-clock" buttonColor={theme.primary} textColor={theme.onPrimary} style={styles.actionButton} labelStyle={styles.actionLabel} loading={isLoadingData} disabled={isLoadingData}>محاسبه</Button>
                            </View>

                            {result ? (
                                <Card style={[styles.resultCard, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}>
                                    <Card.Content style={styles.resultContent}>
                                        <CalculationResultHeading />
                                        <View style={[styles.summaryBox, { backgroundColor: theme.primaryContainer, borderColor: theme.primary }]}>
                                            <ThemedText type="small" style={[styles.summaryLabel, { color: theme.textSecondary }]}>مقرری ماهیانه بیمه بیکاری</ThemedText>
                                            <ThemedText type="largeTitle" style={[styles.amountValue, { color: theme.primaryText }]}>{formatCurrency(result.monthlyAmount)}</ThemedText>
                                        </View>
                                        <View style={styles.breakdownGrid}>
                                            <ResultDetail label="متوسط مزد روزانه" value={formatCurrency(result.averageDailyWage)} />
                                            <ResultDetail label="مبلغ حداقل مزد روزانه مصوب شورای عالی کار" value={formatCurrency(result.dailyMinimumWage)} />
                                            <ResultDetail label="مبلغ پایه روزانه (۵۵٪)" value={formatCurrency(result.dailyBaseAmount)} />
                                            <ResultDetail label="سهم افراد تحت تکفل" value={formatCurrency(result.familyShare)} />
                                            <ResultDetail label="مبلغ اولیه روزانه" value={formatCurrency(result.initialDailyAmount)} />
                                            <ResultDetail label="سقف قانونی (۸۰٪ متوسط مزد)" value={formatCurrency(result.dailyCeiling)} />
                                            <ResultDetail label="مبلغ نهایی روزانه" value={formatCurrency(result.finalDailyAmount)} emphasized />
                                        </View>
                                    </Card.Content>
                                </Card>
                            ) : null}
                        </Card.Content>
                    </Card>
                </SafeAreaView>
            </ScrollView>

            <PersianDatePickerModal visible={pickerTarget !== null} value={selectedDate} title="انتخاب تاریخ" onClose={() => setPickerTarget(null)} onSelect={handleDateSelect} availableYears={yearPeriods.map((item) => item.year)} />
            <Snackbar visible={snackbarVisible} onDismiss={() => setSnackbarVisible(false)} duration={5000} style={{ backgroundColor: theme.errorFill, borderRadius: Radius.md }} action={{ label: 'بستن', onPress: () => setSnackbarVisible(false) }}><ThemedText type="small" style={{ color: theme.onStatus }}>{snackbarMessage}</ThemedText></Snackbar>
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
    formulaText: { fontSize: 12, lineHeight: 21 },
    metricBox: { borderRadius: 12, padding: Spacing.two, gap: Spacing.one },
    sectionLabel: { fontSize: 11 },
    fieldHint: { fontSize: 10, lineHeight: 16 },
    dependentsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    dependentsLimit: { fontSize: 10 },
    dateInput: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.two, paddingVertical: Spacing.two, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth },
    textInput: { minHeight: 42, borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, paddingHorizontal: Spacing.two, fontFamily: 'AppFont-Bold', fontSize: 14 },
    stepper: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: Spacing.one, gap: Spacing.one },
    dependentsStepper: { width: '100%' },
    stepperButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
    stepperButtonDisabled: { opacity: 0.4 },
    stepperInput: { flex: 1, minHeight: 42, fontFamily: 'AppFont-Bold', fontSize: 16, paddingVertical: 0 },
    actionsGroup: { flexDirection: 'row', gap: Spacing.two },
    actionButton: { flex: 1, borderRadius: 10 },
    actionLabel: { fontFamily: 'AppFont-Bold', fontSize: 12 },
    resultCard: { borderRadius: Radius.md, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
    resultContent: { gap: Spacing.two, paddingVertical: Spacing.three, paddingHorizontal: Spacing.two },
    summaryBox: { width: '100%', alignItems: 'center', gap: Spacing.one, padding: Spacing.two, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth },
    summaryLabel: { fontSize: 10, lineHeight: 16, fontFamily: 'AppFont-Medium' },
    amountValue: { fontSize: 16, lineHeight: 22, fontFamily: 'AppFont-Bold' },
    breakdownGrid: { gap: Spacing.one },
    detailBox: { alignItems: 'center', gap: Spacing.one, padding: Spacing.one, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth },
    detailLabel: { fontSize: 12 },
    detailValue: { fontSize: 16, lineHeight: 22, fontFamily: 'AppFont-Bold' },
});
