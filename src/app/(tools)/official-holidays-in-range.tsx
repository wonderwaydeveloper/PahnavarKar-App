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
import { CalculationDescriptionBox, CalculationResultHeading } from '@/components/calculation-card-sections';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { fetchOfficialHolidaysBetweenDates, fetchYears, seedFromJsonAsset } from '@/database';
import { useTheme } from '@/hooks/use-theme';
import { calculateOfficialHolidaysInDateRange, parseDateInput, type OfficialHolidaysInDateRangeResult } from '@/utils/salary-calculation';
import { useAppContext } from '@/hooks/use-app-context';

type PickerTarget = 'start' | 'end';

export default function OfficialHolidaysInRangeScreen() {
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
    const [availableYears, setAvailableYears] = useState<number[]>([]);
    const [holidayDates, setHolidayDates] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [result, setResult] = useState<OfficialHolidaysInDateRangeResult | null>(null);
    const [showDetails, setShowDetails] = useState(false);
    const [snackbarVisible, setSnackbarVisible] = useState(false);
    const [snackbarMessage, setSnackbarMessage] = useState('');

    useEffect(() => {
        let isMounted = true;

        const loadData = async () => {
            try {
                await seedFromJsonAsset();
                const years = await fetchYears();
                const firstYear = years[0]?.year ?? 1369;
                const lastYear = years.at(-1)?.year ?? currentYear;
                const holidays = await fetchOfficialHolidaysBetweenDates(
                    `${firstYear}/01/01`,
                    `${lastYear}/12/${jalaaliMonthLength(lastYear, 12)}`,
                );

                if (isMounted) {
                    setAvailableYears(years.map((year) => year.year));
                    setHolidayDates(holidays.map((holiday) => holiday.holiday_date));
                }
            } catch {
                if (isMounted) {
                    setSnackbarMessage('خطا در بارگذاری تقویم رسمی کشور. لطفاً دوباره تلاش کنید.');
                    setSnackbarVisible(true);
                }
            } finally {
                if (isMounted) {
                    setIsLoading(false);
                }
            }
        };

        void loadData();
        return () => { isMounted = false; };
    }, [currentYear]);

    const persianDigits = '۰۱۲۳۴۵۶۷۸۹';
    const toPersianDigits = (value: string | number) => String(value).replace(/\d/g, (digit) => persianDigits[Number(digit)]);
    const formatDate = (value: string) => {
        const parsed = parseDateInput(value);
        return parsed
            ? `${toPersianDigits(parsed.year)}/${toPersianDigits(String(parsed.month).padStart(2, '0'))}/${toPersianDigits(String(parsed.day).padStart(2, '0'))}`
            : '';
    };
    const compareDates = (left: string, right: string) => {
        const parsedLeft = parseDateInput(left);
        const parsedRight = parseDateInput(right);
        if (!parsedLeft || !parsedRight) return 0;
        return parsedLeft.year * 10000 + parsedLeft.month * 100 + parsedLeft.day
            - (parsedRight.year * 10000 + parsedRight.month * 100 + parsedRight.day);
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

    const { notifyCalculationCompleted } = useAppContext();
    const handleCalculate = () => {
        const start = parseDateInput(startDate);
        const end = parseDateInput(endDate);
        if (!start || !end || compareDates(startDate, endDate) > 0) {
            setResult(null);
            setSnackbarMessage('بازهٔ زمانی واردشده معتبر نیست.');
            setSnackbarVisible(true);
            return;
        }

        const calculation = calculateOfficialHolidaysInDateRange(start, end, holidayDates);
        setResult(calculation);
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
                                <ThemedText type="bodyBold" style={[styles.pageTitle, { color: theme.text }]}>محاسبه تعداد تعطیلات رسمی در بازه زمانی انتخاب شده</ThemedText>
                                <CalculationDescriptionBox>
                                    <ThemedText type="small" style={[styles.pageDescription, { color: theme.textSecondary }]}>تعیین تعداد روزهای تعطیل موضوع ماده ۶۳ قانون کار</ThemedText>
                                </CalculationDescriptionBox>
                            </View>

                            <View style={[styles.formulaBox, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}>
                                <ThemedText type="smallBold" style={[styles.formulaLabel, { color: theme.textSecondary }]}>مبنای محاسبه</ThemedText>
                                <ThemedText type="small" style={[styles.formulaText, { color: theme.text }]}>تعداد تعطیلات رسمی کشور در بازهٔ انتخابی؛ جمعه‌ها تعطیل‌کاری محسوب نمی‌شوند.</ThemedText>
                            </View>

                            <View style={styles.metricsRow}>
                                <DateInputField label="از تاریخ" value={startDate} onPress={() => setPickerTarget('start')} formatValue={formatDate} />
                                <DateInputField label="تا تاریخ" value={endDate} onPress={() => setPickerTarget('end')} formatValue={formatDate} />
                            </View>

                            <View style={styles.actionsGroup}>
                                <Button mode="contained" onPress={handleCalculate} icon="calendar-check-outline" buttonColor={theme.primary} textColor={theme.onPrimary} style={styles.actionButton} labelStyle={styles.actionLabel} loading={isLoading} disabled={isLoading}>محاسبه</Button>
                            </View>

                            {result ? (
                                <Card style={[styles.resultCard, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}>
                                    <Card.Content style={styles.resultContent}>
                                        <CalculationResultHeading />
                                        <View style={[styles.summaryBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                                            <ThemedText type="small" style={[styles.summaryLabel, { color: theme.textSecondary }]}>تعداد تعطیلات رسمی در بازه</ThemedText>
                                            <ThemedText type="largeTitle" style={[styles.amountValue, { color: theme.primaryText }]}>{toPersianDigits(result.totalHolidays)} روز</ThemedText>
                                        </View>
                                        <View style={[styles.rangeBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                                            <ThemedText type="small" style={[styles.summaryLabel, { color: theme.textSecondary }]}>بازهٔ بررسی‌شده</ThemedText>
                                            <ThemedText type="smallBold" style={{ color: theme.text }}>{formatDate(startDate)} تا {formatDate(endDate)}</ThemedText>
                                        </View>
                                        <View style={styles.breakdownHeader}>
                                            <ThemedText type="smallBold" style={[styles.breakdownSectionTitle, { color: theme.text }]}>جزئیات محاسبه</ThemedText>
                                            <Pressable onPress={() => setShowDetails((value) => !value)} style={[styles.toggleButton, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                                                <ThemedText type="smallBold" style={[styles.toggleButtonLabel, { color: theme.primaryText }]}>{showDetails ? 'عدم نمایش' : 'نمایش جزئیات'}</ThemedText>
                                                <MaterialCommunityIcons name={showDetails ? 'chevron-up' : 'chevron-down'} size={18} color={theme.primaryText} />
                                            </Pressable>
                                        </View>
                                        {showDetails ? (
                                            <View style={styles.breakdownGrid}>
                                                {result.breakdown.map((period) => (
                                                    <View key={period.year} style={[styles.breakdownItemCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                                                        <View style={[styles.breakdownItemHeaderRow, { borderBottomColor: theme.border }]}>
                                                            <ThemedText type="smallBold" style={[styles.breakdownItemTitle, { color: theme.text }]}>سال {toPersianDigits(period.year)}</ThemedText>
                                                        </View>
                                                        <View style={styles.detailGrid}>
                                                            <View style={[styles.detailBox, { backgroundColor: theme.primaryContainer, borderColor: theme.primary }]}>
                                                                <ThemedText type="small" style={[styles.detailLabel, { color: theme.textSecondary }]}>بازهٔ زمانی دوره</ThemedText>
                                                                <ThemedText type="smallBold" style={[styles.detailValue, { color: theme.primaryText }]}>{formatDate(`${period.startDate.year}/${period.startDate.month}/${period.startDate.day}`)} تا {formatDate(`${period.endDate.year}/${period.endDate.month}/${period.endDate.day}`)}</ThemedText>
                                                            </View>
                                                            <View style={[styles.detailBox, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}>
                                                                <ThemedText type="small" style={[styles.detailLabel, { color: theme.textSecondary }]}>تعداد تعطیلات این دوره</ThemedText>
                                                                <ThemedText type="smallBold" style={[styles.detailValue, { color: theme.text }]}>{toPersianDigits(period.totalHolidays)} روز</ThemedText>
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

            <PersianDatePickerModal visible={pickerTarget !== null} value={pickerTarget === 'start' ? startDate : endDate} title={pickerTarget === 'start' ? 'انتخاب تاریخ شروع' : 'انتخاب تاریخ پایان'} onClose={() => setPickerTarget(null)} onSelect={handleDateSelect} availableYears={availableYears} />
            <Snackbar visible={snackbarVisible} onDismiss={() => setSnackbarVisible(false)} duration={5000} style={{ backgroundColor: theme.errorFill, borderRadius: Radius.md }} action={{ label: 'بستن', onPress: () => setSnackbarVisible(false), labelStyle: { color: theme.onStatus } }}>
                <ThemedText type="small" style={{ color: theme.onStatus }}>{snackbarMessage}</ThemedText>
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
    dateInput: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.two, paddingVertical: Spacing.two, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth },
    actionsGroup: { flexDirection: 'row', gap: Spacing.two },
    actionButton: { flex: 1, borderRadius: 10 },
    actionLabel: { fontFamily: 'AppFont-Bold', fontSize: 12 },
    resultCard: { borderRadius: Radius.md, borderWidth: 1, marginTop: Spacing.two, overflow: 'hidden' },
    resultContent: { gap: Spacing.two, paddingVertical: Spacing.three, paddingHorizontal: Spacing.two },
    summaryBox: { width: '100%', alignItems: 'center', gap: Spacing.one, padding: Spacing.two, borderRadius: 12, borderWidth: 1 },
    rangeBox: { alignItems: 'center', gap: Spacing.one, padding: Spacing.two, borderRadius: 12, borderWidth: 1 },
    breakdownHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.one, paddingVertical: Spacing.one, gap: Spacing.one },
    breakdownSectionTitle: { fontSize: 13, fontFamily: 'AppFont-Bold' },
    toggleButtonLabel: { fontSize: 11, fontFamily: 'AppFont-Bold' },
    toggleButton: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one, paddingHorizontal: Spacing.two, paddingVertical: Spacing.one, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth },
    breakdownGrid: { gap: Spacing.two },
    breakdownItemCard: { borderRadius: Radius.md, borderWidth: 1, padding: Spacing.two, gap: Spacing.one },
    breakdownItemHeaderRow: { paddingTop: 2, paddingBottom: 2, marginBottom: 2, borderBottomWidth: StyleSheet.hairlineWidth },
    breakdownItemTitle: { fontSize: 12, fontFamily: 'AppFont-Bold' },
    detailGrid: { gap: Spacing.one },
    detailBox: { alignItems: 'center', gap: Spacing.one, padding: Spacing.one, borderRadius: 8, borderWidth: 1 },
    detailLabel: { fontSize: 12 },
    detailValue: { fontSize: 16, lineHeight: 22, fontFamily: 'AppFont-Bold' },
    summaryLabel: { fontSize: 11 },
    amountValue: { fontSize: 16, lineHeight: 22, fontFamily: 'AppFont-Bold' },
});
