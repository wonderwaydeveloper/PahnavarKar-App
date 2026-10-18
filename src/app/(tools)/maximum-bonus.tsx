import { MaterialCommunityIcons } from '@expo/vector-icons';
import { jalaaliMonthLength, toJalaali } from 'jalaali-js';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Card, Snackbar } from 'react-native-paper';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { FontAwareButton as Button } from '@/components/font-aware-paper';
import { HiddenCalculationGuide } from '@/components/hidden-calculation-guide';
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
import { getDailyWorkRatio, scaleWageCalculationResult } from '@/utils/daily-work-ratio';
import {
    calculateMaximumBonusAndEntitlementFromPeriodData,
    parseDateInput,
    type MaximumBonusAndEntitlementCalculationResult,
    type SalaryPeriodBucket,
} from '@/utils/salary-calculation';

export default function MaximumBonusScreen() {
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
    const [pickerTarget, setPickerTarget] = useState<'start' | 'end' | null>(null);
    const [pickerVisible, setPickerVisible] = useState(false);
    const [periodBuckets, setPeriodBuckets] = useState<SalaryPeriodBucket[]>([]);
    const [availableYears, setAvailableYears] = useState<number[]>([]);
    const [isLoadingData, setIsLoadingData] = useState(true);
    const [result, setResult] = useState<MaximumBonusAndEntitlementCalculationResult | null>(null);
    const [dailyWorkTime, setDailyWorkTime] = useState('07:20');
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

        const calculation = calculateMaximumBonusAndEntitlementFromPeriodData(
            parsedStart,
            parsedEnd,
            periodBuckets,
        );

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
                                        محاسبه حداکثر عیدی و پاداش
                                    </ThemedText>
                                    <CalculationDescriptionBox>
                                        <ThemedText type="small" style={[styles.pageDescription, { color: theme.textSecondary }]}>
                                            محاسبه حداکثر عیدی و پاداش ماهیانه براساس ماده واحده قانون تعیین عیدی و پاداش، مصوب مجلس در سال ۱۳۷۰
                                        </ThemedText>
                                    </CalculationDescriptionBox>
                                </View>
                            </View>

                            <HiddenCalculationGuide>
                                مبلغ حداکثر هر بازه = حداقل مزد روزانهٔ مصوب × ۷٫۵ × ماه‌های پوشش‌یافته؛ ماه ناقص به نسبت روزهای پوشش‌یافته به روزهای ماه محاسبه می‌شود. نسبت ساعات کار روزانه نیز در صورت کارکرد کمتر از تمام‌وقت اعمال می‌شود.
                            </HiddenCalculationGuide>
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
                            <View style={styles.actionsGroup}>
                                <Button
                                    mode="contained"
                                    onPress={handleCalculate}
                                    icon="gift"
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
                                            <View style={[styles.summaryBoxContent, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                                                <ThemedText type="small" style={[styles.summaryLabel, { color: theme.textSecondary }]}>
                                                    مبلغ کل حداکثر عیدی و پاداش استحقاقی
                                                </ThemedText>
                                                <ThemedText type="largeTitle" style={[styles.amountValue, { color: theme.primary }]}>
                                                    {formattedResult}
                                                </ThemedText>
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
                                                                    حداقل مزد روزانه
                                                                </ThemedText>
                                                                <ThemedText type="smallBold" style={[styles.detailValue, { color: theme.text }]}>
                                                                    {item.dailyMinimumWage != null ? toPersianDigits(formatCurrency(item.dailyMinimumWage)) : '-'}
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
        borderRadius: Radius.md,
        borderWidth: StyleSheet.hairlineWidth,
        paddingHorizontal: Spacing.two,
        paddingVertical: Spacing.two,
        gap: Spacing.one,
    },
    metricsRow: {
        flexDirection: 'row',
        gap: Spacing.two,
    },
    metricBox: {
        flex: 1,
        borderRadius: 14,
        paddingHorizontal: Spacing.two,
        paddingVertical: Spacing.two,
        gap: Spacing.one,
    },
    sectionLabel: {
        fontSize: 10,
        lineHeight: 16,
        fontFamily: 'AppFont-Medium',
    },
    dateInput: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: Spacing.one,
        paddingHorizontal: Spacing.two,
        paddingVertical: Spacing.two,
        borderRadius: 12,
        borderWidth: StyleSheet.hairlineWidth,
    },
    fieldValue: {
        flex: 1,
        fontSize: 12,
        lineHeight: 18,
        fontFamily: 'AppFont-Bold',
    },
    optionBox: {
        borderRadius: Radius.md,
        borderWidth: StyleSheet.hairlineWidth,
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
        lineHeight: 16,
        fontFamily: 'AppFont-Medium',
        textAlign: 'center',
    },
    helpRow: {
        marginTop: Spacing.one,
    },
    helpText: {
        lineHeight: 20,
        fontSize: 11,
        fontFamily: 'AppFont-Regular',
    },
    actionsGroup: {
        flexDirection: 'row',
        gap: Spacing.two,
    },
    actionButton: {
        flex: 1,
        borderRadius: 12,
    },
    actionLabel: {
        fontSize: 13,
        fontFamily: 'AppFont-Bold',
    },
    breakdownCard: {
        borderRadius: Radius.md,
        borderWidth: StyleSheet.hairlineWidth,
        overflow: 'hidden',
    },
    breakdownContent: {
        gap: Spacing.two,
        paddingVertical: Spacing.three,
    },
    summaryBoxHeader: {
        width: '100%',
    },
    summaryBoxContent: {
        borderRadius: 14,
        borderWidth: StyleSheet.hairlineWidth,
        paddingHorizontal: Spacing.two,
        paddingVertical: Spacing.two,
        alignItems: 'center',
        gap: Spacing.one,
    },
    summaryLabel: {
        fontSize: 10,
        lineHeight: 16,
        fontFamily: 'AppFont-Medium',
    },
    amountValue: {
        fontSize: 16,
        lineHeight: 22,
        fontFamily: 'AppFont-Bold',
    },
    breakdownSectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: Spacing.two,
    },
    breakdownSectionTitle: {
        fontSize: 13,
        lineHeight: 19,
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
        lineHeight: 17,
        fontFamily: 'AppFont-Bold',
    },
    breakdownGrid: {
        gap: Spacing.two,
    },
    breakdownItemCard: {
        borderRadius: Radius.md,
        borderWidth: StyleSheet.hairlineWidth,
        padding: Spacing.two,
        gap: Spacing.two,
    },
    breakdownItemHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    breakdownItemTitle: {
        fontSize: 12,
        lineHeight: 18,
        fontFamily: 'AppFont-Bold',
    },
    breakdownDetailGrid: {
        gap: Spacing.one,
    },
    breakdownDetailBox: {
        borderRadius: 10,
        borderWidth: StyleSheet.hairlineWidth,
        paddingHorizontal: Spacing.two,
        paddingVertical: Spacing.one,
        gap: Spacing.one,
        alignItems: 'center',
        justifyContent: 'center',
    },
    detailValue: {
        fontSize: 16,
        lineHeight: 22,
        fontFamily: 'AppFont-Bold',
        textAlign: 'center',
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
        fontFamily: 'AppFont-Regular',
    },
    formulaLabel: {
        fontSize: 10,
        lineHeight: 16,
        fontFamily: 'AppFont-Medium',
    },
    formulaValue: {
        lineHeight: 20,
        fontSize: 12,
        fontFamily: 'AppFont-Regular',
    },
});
