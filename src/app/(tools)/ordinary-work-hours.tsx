import { MaterialCommunityIcons } from '@expo/vector-icons';
import { jalaaliMonthLength, toJalaali } from 'jalaali-js';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Card, Snackbar } from 'react-native-paper';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { FontAwareButton as Button } from '@/components/font-aware-paper';
import { DateInputField } from '@/components/date-input-field';
import { PersianDatePickerModal } from '@/components/persian-date-picker-modal';
import { ThemedText } from '@/components/themed-text';
import { HiddenCalculationGuide } from '@/components/hidden-calculation-guide';
import { CalculationDescriptionBox, CalculationResultHeading } from '@/components/calculation-card-sections';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { fetchOfficialHolidaysBetweenDates, fetchPeriodsByYearId, fetchYears, seedFromJsonAsset } from '@/database';
import { useTheme } from '@/hooks/use-theme';
import {
    calculateOrdinaryWorkHoursFromPeriodData,
    parseDateInput,
    type OrdinaryWorkHoursCalculationResult,
    type SalaryPeriodBucket,
} from '@/utils/salary-calculation';

type PickerTarget = 'start' | 'end';

export default function OrdinaryWorkHoursScreen() {
    const theme = useTheme();
    const insets = useSafeAreaInsets();
    const currentJalaliDate = useMemo(() => {
        const today = new Date();
        return toJalaali(today.getFullYear(), today.getMonth() + 1, today.getDate());
    }, []);
    const currentYear = currentJalaliDate.jy;
    const defaultStartDate = `${currentYear}/01/01`;
    const defaultEndDate = `${currentYear}/12/${jalaaliMonthLength(currentYear, 12)}`;

    const [startDate, setStartDate] = useState(defaultStartDate);
    const [endDate, setEndDate] = useState(defaultEndDate);
    const [pickerTarget, setPickerTarget] = useState<PickerTarget | null>(null);
    const [periodBuckets, setPeriodBuckets] = useState<SalaryPeriodBucket[]>([]);
    const [officialHolidayDates, setOfficialHolidayDates] = useState<string[]>([]);
    const [availableYears, setAvailableYears] = useState<number[]>([]);
    const [isLoadingData, setIsLoadingData] = useState(true);
    const [result, setResult] = useState<OrdinaryWorkHoursCalculationResult | null>(null);
    const [showDetails, setShowDetails] = useState(false);
    const [snackbarVisible, setSnackbarVisible] = useState(false);
    const [snackbarMessage, setSnackbarMessage] = useState('');

    useEffect(() => {
        let isMounted = true;
        const loadData = async () => {
            try {
                await seedFromJsonAsset();
                const years = await fetchYears();
                const buckets: SalaryPeriodBucket[] = [];

                for (const year of years) {
                    const periods = await fetchPeriodsByYearId(year.id);
                    if (periods.length === 0) continue;
                    buckets.push({
                        year: year.year,
                        periods: periods.map((period) => ({
                            period_index: period.period_index,
                            month_count: period.month_count,
                            daily_minimum_wage: period.daily_minimum_wage,
                        })),
                    });
                }

                const holidays = await fetchOfficialHolidaysBetweenDates('1369/01/01', '1405/12/29');
                if (isMounted) {
                    setPeriodBuckets(buckets);
                    setOfficialHolidayDates(holidays.map((holiday) => holiday.holiday_date));
                    setAvailableYears(years.map((year) => year.year));
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
    const formatNumber = (value: number) => toPersianDigits(Number.isInteger(value) ? String(value) : value.toFixed(2));
    const formatDate = (value: string) => {
        const parsed = parseDateInput(value);
        return parsed ? `${toPersianDigits(parsed.year)}/${toPersianDigits(String(parsed.month).padStart(2, '0'))}/${toPersianDigits(String(parsed.day).padStart(2, '0'))}` : '';
    };
    const compareDates = (left: string, right: string) => {
        const parsedLeft = parseDateInput(left);
        const parsedRight = parseDateInput(right);
        if (!parsedLeft || !parsedRight) return 0;
        return parsedLeft.year * 10000 + parsedLeft.month * 100 + parsedLeft.day - (parsedRight.year * 10000 + parsedRight.month * 100 + parsedRight.day);
    };

    const handleDateSelect = (value: string) => {
        if (pickerTarget === 'start') {
            setStartDate(value);
            if (compareDates(value, endDate) > 0) setEndDate(value);
        } else if (pickerTarget === 'end') {
            if (compareDates(value, startDate) < 0) {
                setSnackbarMessage('تاریخ پایان باید برابر یا بزرگ‌تر از تاریخ شروع باشد.');
                setSnackbarVisible(true);
            } else {
                setEndDate(value);
            }
        }
        setPickerTarget(null);
    };

    const handleCalculate = () => {
        const start = parseDateInput(startDate);
        const end = parseDateInput(endDate);
        if (!start || !end || compareDates(startDate, endDate) > 0) {
            setResult(null);
            setSnackbarMessage('بازهٔ زمانی واردشده معتبر نیست.');
            setSnackbarVisible(true);
            return;
        }

        const yearsInRange = Array.from({ length: end.year - start.year + 1 }, (_, index) => start.year + index);
        const missingYears = yearsInRange.filter((year) => !periodBuckets.some((bucket) => bucket.year === year));
        if (missingYears.length > 0) {
            setResult(null);
            setSnackbarMessage(`برای سال‌های ${missingYears.map((year) => toPersianDigits(year)).join('، ')} داده‌ای موجود نیست.`);
            setSnackbarVisible(true);
            return;
        }

        const calculation = calculateOrdinaryWorkHoursFromPeriodData(start, end, periodBuckets, officialHolidayDates);
        if (calculation.breakdown.length === 0) {
            setResult(null);
            setSnackbarMessage('برای بازهٔ انتخاب‌شده داده‌ای برای محاسبه وجود ندارد.');
            setSnackbarVisible(true);
            return;
        }
        setResult(calculation);
        setShowDetails(false);
    };

    return (
        <ThemedView style={styles.container}>
            <ScrollView contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + Spacing.three, paddingBottom: insets.bottom + Spacing.four }]} showsVerticalScrollIndicator={false}>
                <SafeAreaView style={styles.safeArea}>
                    <Card elevation={1} style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                        <Card.Content style={styles.cardContent}>
                            <View style={styles.headerText}>
                                <ThemedText type="bodyBold" style={[styles.pageTitle, { color: theme.text }]}>کارکرد موظفی کارگر در مشاغل عادی</ThemedText>
                                <CalculationDescriptionBox>
                                    <ThemedText type="small" style={[styles.pageDescription, { color: theme.textSecondary }]}>محاسبه میزان ساعات کارکرد موظفی کارگر در مشاغل عادی طبق ماده ۵۱ قانون کار</ThemedText>
                                </CalculationDescriptionBox>
                            </View>
                            <HiddenCalculationGuide>
                                ساعات موظفی هر دوره = (کل روزهای بازه − جمعه‌ها − تعطیلات رسمی ثبت‌شده) × ۷٫۳۳ ساعت.
                            </HiddenCalculationGuide>
                            <View style={styles.metricsRow}>
                                <DateInputField label="از تاریخ" value={startDate} onPress={() => setPickerTarget('start')} formatValue={formatDate} />
                                <DateInputField label="تا تاریخ" value={endDate} onPress={() => setPickerTarget('end')} formatValue={formatDate} />
                            </View>

                            <View style={styles.actionsGroup}>
                                <Button mode="contained" onPress={handleCalculate} icon="calendar-check-outline" buttonColor={theme.primary} textColor={theme.surface} style={styles.actionButton} labelStyle={styles.actionLabel} loading={isLoadingData} disabled={isLoadingData}>محاسبه</Button>
                            </View>

                            {result ? <Card style={[styles.resultCard, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}><Card.Content style={styles.resultContent}>
                                <CalculationResultHeading />
                                <View style={[styles.summaryBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                                    <ThemedText type="small" style={[styles.summaryLabel, { color: theme.textSecondary }]}>مجموع ساعات کارکرد موظفی</ThemedText>
                                    <ThemedText type="largeTitle" style={[styles.amountValue, { color: theme.primary }]}>{formatNumber(result.totalHours)} ساعت</ThemedText>
                                </View>
                                <View style={styles.breakdownHeader}>
                                    <ThemedText type="smallBold" style={[styles.breakdownSectionTitle, { color: theme.text }]}>جزئیات دوره‌ها</ThemedText>
                                    <Pressable onPress={() => setShowDetails((value) => !value)} style={[styles.toggleButton, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                                        <ThemedText type="smallBold" style={[styles.toggleButtonLabel, { color: theme.primary }]}>{showDetails ? 'عدم نمایش' : 'نمایش جزئیات'}</ThemedText>
                                        <MaterialCommunityIcons name={showDetails ? 'chevron-up' : 'chevron-down'} size={18} color={theme.primary} />
                                    </Pressable>
                                </View>
                                {showDetails ? <View style={styles.breakdownGrid}>{result.breakdown.map((item) => <View key={`${item.year}-${item.periodIndex}`} style={[styles.breakdownItemCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                                    <View style={[styles.breakdownItemHeaderRow, { borderBottomColor: theme.border }]}><ThemedText type="smallBold" style={[styles.breakdownItemTitle, { color: theme.text }]}>{`سال ${toPersianDigits(item.year)}${(periodBuckets.find((bucket) => bucket.year === item.year)?.periods.length ?? 0) > 1 ? `، دوره ${toPersianDigits(item.periodIndex)}` : ''}`}</ThemedText></View>
                                    <View style={styles.detailGrid}>
                                        <View style={[styles.detailBox, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}><ThemedText type="small" style={[styles.detailLabel, { color: theme.textSecondary }]}>کل روزهای بازه</ThemedText><ThemedText type="smallBold" style={[styles.detailValue, { color: theme.text }]}>{toPersianDigits(item.daysCovered)} روز</ThemedText></View>
                                        <View style={[styles.detailBox, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}><ThemedText type="small" style={[styles.detailLabel, { color: theme.textSecondary }]}>تعطیلات رسمی</ThemedText><ThemedText type="smallBold" style={[styles.detailValue, { color: theme.text }]}>{toPersianDigits(item.officialHolidays)} روز</ThemedText></View>
                                        <View style={[styles.detailBox, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}><ThemedText type="small" style={[styles.detailLabel, { color: theme.textSecondary }]}>جمعه‌ها</ThemedText><ThemedText type="smallBold" style={[styles.detailValue, { color: theme.text }]}>{toPersianDigits(item.fridays)} روز</ThemedText></View>
                                        <View style={[styles.detailBox, { backgroundColor: theme.primaryContainer, borderColor: theme.primary }]}><ThemedText type="small" style={[styles.detailLabel, { color: theme.textSecondary }]}>روزهای کارکرد موظفی</ThemedText><ThemedText type="smallBold" style={[styles.detailValue, { color: theme.primary }]}>{toPersianDigits(item.workingDays)} روز</ThemedText></View>
                                        <View style={[styles.detailBox, { backgroundColor: theme.primaryContainer, borderColor: theme.primary }]}><ThemedText type="small" style={[styles.detailLabel, { color: theme.textSecondary }]}>ساعات موظفی این دوره</ThemedText><ThemedText type="smallBold" style={[styles.detailValue, { color: theme.primary }]}>{formatNumber(item.requiredHours)} ساعت</ThemedText></View>
                                    </View>
                                </View>)}</View> : null}
                            </Card.Content></Card> : null}
                        </Card.Content>
                    </Card>
                </SafeAreaView>
            </ScrollView>
            <PersianDatePickerModal visible={pickerTarget !== null} value={pickerTarget === 'start' ? startDate : endDate} title={pickerTarget === 'start' ? 'انتخاب تاریخ شروع' : 'انتخاب تاریخ پایان'} onClose={() => setPickerTarget(null)} onSelect={handleDateSelect} availableYears={availableYears} />
            <Snackbar visible={snackbarVisible} onDismiss={() => setSnackbarVisible(false)} duration={5000} style={{ backgroundColor: theme.error, borderRadius: Radius.md }} action={{ label: 'بستن', onPress: () => setSnackbarVisible(false), labelStyle: { color: theme.surface } }}><ThemedText type="small" style={{ color: theme.surface }}>{snackbarMessage}</ThemedText></Snackbar>
        </ThemedView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    scrollContent: { flexGrow: 1 },
    safeArea: { flex: 1, justifyContent: 'center', paddingHorizontal: 0 },
    card: { borderRadius: Radius.md, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
    cardContent: { gap: Spacing.three, paddingVertical: Spacing.four, paddingHorizontal: Spacing.three },
    headerText: { gap: Spacing.one },
    pageTitle: { display: 'none', fontSize: 16, lineHeight: 22, fontFamily: 'AppFont-Bold' },
    pageDescription: { fontSize: 13, lineHeight: 20 },
    infoText: { fontSize: 12, lineHeight: 20 },
    formulaBox: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: Spacing.two, gap: Spacing.one },
    formulaText: { fontSize: 12, lineHeight: 21 },
    metricsRow: { flexDirection: 'row', gap: Spacing.two },
    metricBox: { flex: 1, borderRadius: 14, padding: Spacing.two, gap: Spacing.one },
    sectionLabel: { fontSize: 11 },
    dateInput: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.two, paddingVertical: Spacing.two, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth },
    actionsGroup: { flexDirection: 'row', gap: Spacing.two },
    actionButton: { flex: 1, borderRadius: 10 },
    actionLabel: { fontFamily: 'AppFont-Bold', fontSize: 12 },
    resultCard: { borderRadius: Radius.md, borderWidth: 1, marginTop: Spacing.two, overflow: 'hidden' },
    resultContent: { gap: Spacing.two, paddingVertical: Spacing.three, paddingHorizontal: Spacing.two },
    summaryBox: { width: '100%', alignItems: 'center', gap: Spacing.one, padding: Spacing.two, borderRadius: 12, borderWidth: 1 },
    summaryLabel: { fontSize: 11 },
    amountValue: { fontSize: 16, lineHeight: 22, fontFamily: 'AppFont-Bold' },
    breakdownHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.one, paddingVertical: Spacing.one, gap: Spacing.one },
    breakdownSectionTitle: { fontSize: 13, fontFamily: 'AppFont-Bold' },
    toggleButtonLabel: { fontSize: 11 },
    toggleButton: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one, paddingHorizontal: Spacing.two, paddingVertical: Spacing.one, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth },
    breakdownGrid: { gap: Spacing.two },
    breakdownItemCard: { borderRadius: Radius.md, borderWidth: 1, padding: Spacing.two, gap: Spacing.one },
    breakdownItemHeaderRow: { paddingTop: 2, paddingBottom: 2, marginBottom: 2, borderBottomWidth: StyleSheet.hairlineWidth },
    breakdownItemTitle: { fontSize: 12, fontFamily: 'AppFont-Bold' },
    detailGrid: { gap: Spacing.one },
    detailBox: { alignItems: 'center', gap: Spacing.one, padding: Spacing.one, borderRadius: 8, borderWidth: 1 },
    detailLabel: { fontSize: 12 },
    detailValue: { fontSize: 16, lineHeight: 22, fontFamily: 'AppFont-Bold' },
});
