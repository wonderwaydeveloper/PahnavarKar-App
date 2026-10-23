import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import {
  ActivityIndicator,
  Card,
  Snackbar
} from 'react-native-paper';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { YearSelectorCard } from '@/components/ui/exploer';
import { WebBadge } from '@/components/web-badge';
import { Radius, Spacing } from '@/constants/theme';
import { fetchJobGroups, fetchPeriodsByYearId, fetchSeniorityBaseByGroup, fetchYears, seedFromJsonAsset } from '@/database';
import type { PeriodRecord, YearRecord } from '@/database/types';
import { jobGroupUiLabels, periodUiLabels } from '@/database/ui/labels';
import { useTheme } from '@/hooks/use-theme';
import { useCurrencyFormatter } from '@/hooks/use-currency-formatter';
import { calculatePeriodDateRange } from '@/utils/period-date-calculator';

type PeriodDetailRow =
  | { kind: 'row'; label: string; value: number | string | null | undefined; currency?: boolean }
  | {
    kind: 'group';
    title: string;
    items: { label: string; value: number | string | null | undefined; currency?: boolean }[];
  };

interface PeriodCardProps {
  period: PeriodRecord;
  index: number;
  isExpanded: boolean;
  isWide: boolean;
  periodsLength: number;
  periodKey: string;
  jobGroups: { id: number; group_number: number; sort_order: number }[];
  seniorityBaseByPeriod: Record<number, Record<number, number>>;
  onToggle: (periodKey: string) => void;
  year: number;
  periodMonthCounts: (number | null)[];
}

function PeriodCardLocal({
  period,
  index,
  isExpanded,
  isWide,
  periodsLength,
  periodKey,
  jobGroups,
  seniorityBaseByPeriod,
  onToggle,
  year,
  periodMonthCounts,
}: PeriodCardProps) {
  const theme = useTheme();
  const { formatCurrency } = useCurrencyFormatter();
  const [seniorityGroupExpanded, setSeniorityGroupExpanded] = useState(false);

  const persianDigits = '۰۱۲۳۴۵۶۷۸۹';

  const toPersianDigits = (value: string) =>
    value.replace(/\d/g, (digit) => persianDigits[Number(digit)]);

  // محاسبه‌ی بازه‌ی تاریخی دوره
  const periodDateRange = useMemo(() => {
    try {
      const validMonthCounts = periodMonthCounts.filter(
        (m): m is number => typeof m === 'number' && m > 0
      );
      if (validMonthCounts.length === 0) return null;

      return calculatePeriodDateRange(year, index + 1, validMonthCounts);
    } catch {
      return null;
    }
  }, [year, index, periodMonthCounts]);

  const formatValue = (value: number | string | null | undefined, useCurrency = false) => {
    if (value == null || value === '') {
      return '-';
    }

    if (typeof value === 'number') {
      return useCurrency ? formatCurrency(value) : value.toLocaleString('fa-IR');
    }

    return toPersianDigits(String(value));
  };

  const getCompactTextStyle = (text: string, isValue = false, isTitle = false) => ({
    fontSize: isTitle ? 13 : isValue ? 12 : 10,
    lineHeight: isTitle ? 19 : isValue ? 18 : 16,
    textAlign: 'center' as const,
    fontFamily: isTitle || isValue ? 'AppFont-Bold' : 'AppFont-Medium',
  });

  const periodSeniorityEntries = seniorityBaseByPeriod[period.id] ?? {};

  const getPeriodDetailRows = (periodItem: PeriodRecord): PeriodDetailRow[] => [
    { kind: 'row', label: periodUiLabels.month_count, value: periodItem.month_count },
    { kind: 'row', label: periodUiLabels.days_in_year, value: periodItem.days_in_year },
    { kind: 'row', label: periodUiLabels.fridays_in_year, value: periodItem.fridays_in_year },
    { kind: 'row', label: periodUiLabels.official_holidays_in_year, value: periodItem.official_holidays_in_year },
    { kind: 'row', label: periodUiLabels.total_official_holidays, value: periodItem.total_official_holidays },
    { kind: 'row', label: periodUiLabels.total_work_hours_year, value: periodItem.total_work_hours_year },
    { kind: 'row', label: periodUiLabels.daily_minimum_wage, value: periodItem.daily_minimum_wage ?? null, currency: true },
    { kind: 'row', label: periodUiLabels.friday_work_per_day, value: periodItem.friday_work_per_day ?? null, currency: true },
    {
      kind: 'group',
      title: periodUiLabels.monthly_shift_work_group,
      items: [
        { label: periodUiLabels.monthly_shift_work_morning_evening_10, value: periodItem.monthly_shift_work_morning_evening_10, currency: true },
        { label: periodUiLabels.monthly_shift_work_morning_evening_night_15, value: periodItem.monthly_shift_work_morning_evening_night_15, currency: true },
        { label: periodUiLabels.monthly_shift_work_morning_night_or_evening_night_225, value: periodItem.monthly_shift_work_morning_night_or_evening_night_225, currency: true },
      ],
    },
    { kind: 'row', label: periodUiLabels.seniority_base, value: periodItem.seniority_base, currency: true },
    {
      kind: 'group',
      title: periodUiLabels.seniority_base_by_group,
      items: jobGroups
        .map((group) => ({
          label: `${jobGroupUiLabels.group_label} ${group.group_number}`,
          value: periodSeniorityEntries[group.group_number] ?? null,
          currency: true,
        }))
        .filter((item) => item.value != null),
    },
    { kind: 'row', label: periodUiLabels.overtime_per_hour, value: periodItem.overtime_per_hour, currency: true },
    { kind: 'row', label: periodUiLabels.night_work_per_hour, value: periodItem.night_work_per_hour, currency: true },
    {
      kind: 'group',
      title: periodUiLabels.monthly_allowance,
      items: [
        { label: periodUiLabels.monthly_single_allowance, value: periodItem.monthly_single_allowance, currency: true },
        { label: periodUiLabels.monthly_married_allowance, value: periodItem.monthly_married_allowance, currency: true },
      ],
    },
    {
      kind: 'group',
      title: periodUiLabels.housing_allowance,
      items: [
        { label: periodUiLabels.monthly_housing_single, value: periodItem.monthly_housing_single, currency: true },
        { label: periodUiLabels.monthly_housing_married, value: periodItem.monthly_housing_married, currency: true },
      ],
    },
    { kind: 'row', label: periodUiLabels.marital_allowance, value: periodItem.marital_allowance, currency: true },
    { kind: 'row', label: periodUiLabels.child_allowance, value: periodItem.child_allowance, currency: true },
    { kind: 'row', label: periodUiLabels.min_monthly_bonus, value: periodItem.min_monthly_bonus, currency: true },
    { kind: 'row', label: periodUiLabels.max_monthly_bonus, value: periodItem.max_monthly_bonus, currency: true },
    { kind: 'row', label: periodUiLabels.formula_increase, value: periodItem.formula_increase },
    { kind: 'row', label: periodUiLabels.min_wage_decree_reference, value: periodItem.min_wage_decree_reference },
  ];

  const getGroupedPeriodDisplayEntries = (title: string, items: { label: string; value: string }[]) => {
    if (items.length === 0) {
      return [];
    }

    const hasSameValue = items.length > 1 && items.every(item => item.value === items[0].value);

    if (hasSameValue) {
      return [{ kind: 'row' as const, label: title, value: items[0].value }];
    }

    return [{ kind: 'group' as const, title, items }];
  };

  const renderDetailItem = (
    item: { kind: 'row'; label: string; value: string } | { kind: 'group'; title: string; items: { label: string; value: string }[] },
    detailIndex: number,
  ) => {
    if (item.kind === 'group') {
      const isSeniorityGroupPanel = item.title === periodUiLabels.seniority_base_by_group;
      const shouldShowGroupDetails = !isSeniorityGroupPanel || seniorityGroupExpanded;

      return (
        <View
          key={item.title}
          style={[
            styles.detailBox,
            {
              borderColor: theme.borderStrong,
              width: isWide ? '48%' : '100%',
              maxWidth: isWide ? '48%' : '100%',
              backgroundColor: detailIndex % 2 === 0 ? theme.surfaceVariant : theme.surface,
            },
          ]}
        >
          <View style={[styles.detailItemStack, { marginBottom: Spacing.one }]}>
            <ThemedText
              type="smallBold"
              themeColor="textSecondary"
              style={[styles.detailRowLabel, getCompactTextStyle(item.title, false, true)]}
              numberOfLines={2}
            >
              {item.title}
            </ThemedText>

            {isSeniorityGroupPanel ? (
              <Pressable
                onPress={() => setSeniorityGroupExpanded((value) => !value)}
                style={({ pressed }) => [
                  styles.nestedToggleButton,
                  {
                    backgroundColor: pressed ? theme.primaryContainer : theme.primary,
                  },
                ]}
              >
                {({ pressed }) => (
                  <>
                    <MaterialCommunityIcons
                      name={seniorityGroupExpanded ? 'chevron-up' : 'chevron-down'}
                      size={16}
                      color={pressed ? theme.primaryText : theme.onPrimary}
                    />
                    <ThemedText style={[styles.nestedToggleLabel, { color: pressed ? theme.primaryText : theme.onPrimary }]}>
                      {seniorityGroupExpanded ? 'عدم نمایش' : 'نمایش جزئیات'}
                    </ThemedText>
                  </>
                )}
              </Pressable>
            ) : null}
          </View>

          {isSeniorityGroupPanel && !shouldShowGroupDetails ? (
            <View style={[styles.detailItemStack, { paddingVertical: Spacing.two }]}>
              <ThemedText type="small" themeColor="textSecondary" style={[styles.detailRowLabel, getCompactTextStyle('تعداد گروه‌ها', false, true)]}>
                {`${item.items.length} گروه شغلی`}
              </ThemedText>
            </View>
          ) : null}

          {shouldShowGroupDetails ? item.items.map((subItem, subIndex) => (
            <View
              key={`${item.title}-${subItem.label}`}
              style={[
                styles.detailItemStack,
                subIndex < item.items.length - 1
                  ? { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.borderStrong, paddingVertical: Spacing.three }
                  : { paddingVertical: Spacing.three },
              ]}
            >
              <ThemedText
                type="small"
                themeColor="textSecondary"
                style={[styles.detailRowLabel, getCompactTextStyle(subItem.label)]}
                numberOfLines={2}
              >
                {subItem.label}
              </ThemedText>
              <ThemedText
                type="smallBold"
                style={[styles.detailRowValue, getCompactTextStyle(subItem.value, true)]}
                numberOfLines={2}
              >
                {subItem.value}
              </ThemedText>
            </View>
          )) : null}
        </View>
      );
    }

    const isFormula = item.label === periodUiLabels.formula_increase;
    const displayValue = isFormula ? `\u202A${item.value}\u202C` : item.value;

    return (
      <View
        key={item.label}
        style={[
          styles.detailBox,
          {
            borderColor: theme.borderStrong,
            width: isWide ? '48%' : '100%',
            maxWidth: isWide ? '48%' : '100%',
            backgroundColor: detailIndex % 2 === 0 ? theme.surfaceVariant : theme.surface,
          },
        ]}
      >
        <View style={styles.detailItemStack}>
          <ThemedText
            type="small"
            themeColor="textSecondary"
            style={[styles.detailRowLabel, getCompactTextStyle(item.label)]}
            numberOfLines={2}
          >
            {item.label}
          </ThemedText>
          <ThemedText
            type="smallBold"
            style={[
              styles.detailRowValue,
              getCompactTextStyle(item.value, true),
              item.label === periodUiLabels.formula_increase ? styles.formulaValue : null,
            ]}
            numberOfLines={2}
          >
            {displayValue}
          </ThemedText>
        </View>
      </View>
    );
  };

  const periodDetails: ({ kind: 'row'; label: string; value: string } | { kind: 'group'; title: string; items: { label: string; value: string }[] })[] = [];

  getPeriodDetailRows(period).forEach((row) => {
    if (row.kind === 'group') {
      const normalizedItems = row.items
        .map(item => ({
          label: item.label,
          value: formatValue(item.value, item.currency ?? false),
        }))
        .filter(item => item.value !== '-');

      if (normalizedItems.length > 0) {
        periodDetails.push(...getGroupedPeriodDisplayEntries(row.title, normalizedItems));
      }
      return;
    }

    const value = formatValue(row.value, row.currency ?? false);
    if (value !== '-') {
      periodDetails.push({ kind: 'row', label: row.label, value });
    }
  });

  return (
    <Card
      key={periodKey}
      elevation={1}
      style={[
        styles.periodCard,
        {
          backgroundColor: theme.surface,
          borderColor: theme.border,
          borderWidth: StyleSheet.hairlineWidth,
        },
      ]}
    >
      <Card.Content style={styles.cardContent}>
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <ThemedText type="bodyBold" style={[styles.pageTitle, { color: theme.text }]}>
              دوره دستمزد
            </ThemedText>
            <ThemedText type="small" style={[styles.pageDescription, { color: theme.textSecondary }]}>
              {periodDateRange && (
                <ThemedText type="smallBold" style={{ color: theme.primaryText }}>
                  {periodDateRange.displayText}
                </ThemedText>
              )}
            </ThemedText>
          </View>
        </View>

        <View style={styles.metricsRow}>
          <View style={[styles.metricBox, { backgroundColor: theme.surfaceVariant }]}>
            <ThemedText type="small" style={[styles.sectionLabel, { color: theme.textSecondary }]}>
              شماره دوره
            </ThemedText>
            <View style={styles.metricContent}>
              <MaterialCommunityIcons name="calendar-range-outline" size={20} color={theme.primaryText} />
              <ThemedText type="bodyBold" style={[styles.fieldValue, { color: theme.text }]}>
                {periodsLength === 1 ? 'دوره کامل' : new Intl.NumberFormat('fa-IR').format(index + 1)}
              </ThemedText>
            </View>
          </View>

          <View style={[styles.metricBox, { backgroundColor: theme.surfaceVariant }]}>
            <ThemedText type="small" style={[styles.sectionLabel, { color: theme.textSecondary }]}>
              مدت زمان
            </ThemedText>
            <View style={styles.metricContent}>
              <MaterialCommunityIcons name="calendar-month" size={20} color={theme.primaryText} />
              <ThemedText type="bodyBold" style={[styles.fieldValue, { color: theme.text }]}>
                {`${period.month_count?.toLocaleString('fa-IR') ?? '-'} ماه`}
              </ThemedText>
            </View>
          </View>
        </View>

        <Pressable
          onPress={() => onToggle(periodKey)}
          style={({ pressed }) => [
            styles.actionButton,
            {
              backgroundColor: pressed ? theme.primaryContainer : theme.primary,
            },
          ]}
        >
          {({ pressed }) => (
            <>
              <MaterialCommunityIcons
                name={isExpanded ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={pressed ? theme.primaryText : theme.onPrimary}
              />
              <ThemedText style={[styles.buttonLabel, { color: pressed ? theme.primaryText : theme.onPrimary }]}>
                {isExpanded ? 'عدم نمایش' : 'نمایش جزئیات'}
              </ThemedText>
            </>
          )}
        </Pressable>

        {isExpanded ? (
          <View style={styles.expandedSection}>
            <View style={[styles.expandedDivider, { backgroundColor: theme.border }]} />
            <View style={styles.periodDetailsGrid}>
              {periodDetails.map((item, detailIndex) => renderDetailItem(item, detailIndex))}
            </View>
          </View>
        ) : null}
      </Card.Content>
    </Card>
  );
}

export default function YearlyInfoScreen() {
  const { width } = useWindowDimensions();
  const isWide = width >= 960;
  const theme = useTheme();

  // State management
  const [years, setYears] = useState<YearRecord[]>([]);
  const [jobGroups, setJobGroups] = useState<{ id: number; group_number: number; sort_order: number }[]>([]);
  const [selectedYearId, setSelectedYearId] = useState<number | null>(null);
  const [periods, setPeriods] = useState<PeriodRecord[]>([]);
  const [seniorityBaseByPeriod, setSeniorityBaseByPeriod] = useState<Record<number, Record<number, number>>>({});
  const [loading, setLoading] = useState(true);
  const [loadingPeriods, setLoadingPeriods] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showError, setShowError] = useState(false);
  const [expandedPeriods, setExpandedPeriods] = useState<Record<string, boolean>>({});
  const [yearPickerVisible, setYearPickerVisible] = useState(false);

  const selectedYear = useMemo(() => {
    if (selectedYearId == null) {
      return [...years].sort((a, b) => b.year - a.year)[0] ?? null;
    }

    return years.find((year) => year.id === selectedYearId) ?? [...years].sort((a, b) => b.year - a.year)[0] ?? null;
  }, [selectedYearId, years]);

  const loadPeriodsForYear = async (year: YearRecord | null, showLoading = true) => {
    if (showLoading) {
      setLoadingPeriods(true);
    }

    try {
      if (!year) {
        setPeriods([]);
        setSeniorityBaseByPeriod({});
        return;
      }

      const yearPeriods = await fetchPeriodsByYearId(year.id);
      const seniorityByPeriod: Record<number, Record<number, number>> = {};

      for (const period of yearPeriods) {
        const rows = await fetchSeniorityBaseByGroup(period.id);
        const groupMap: Record<number, number> = {};

        for (const row of rows) {
          const matchedGroup = jobGroups.find((group) => group.id === row.job_group_id);
          const groupNumber = matchedGroup?.group_number ?? row.job_group_id;
          groupMap[groupNumber] = Number(row.base_value);
        }

        seniorityByPeriod[period.id] = groupMap;
      }

      setPeriods(yearPeriods);
      setSeniorityBaseByPeriod(seniorityByPeriod);
      setError(null);
    } catch (err) {
      const errorMsg = String(err);
      setError(errorMsg);
      setShowError(true);
      setPeriods([]);
      setSeniorityBaseByPeriod({});
    } finally {
      if (showLoading) {
        setLoadingPeriods(false);
      }
    }
  };

  // Load database on mount
  useEffect(() => {
    async function loadDatabase() {
      try {
        await seedFromJsonAsset();
        const [yearRows, groupRows] = await Promise.all([
          fetchYears(),
          fetchJobGroups(),
        ]);
        const sortedYearRows = [...yearRows].sort((a, b) => b.year - a.year);
        setYears(yearRows);
        setJobGroups(groupRows);
        const latestYear = sortedYearRows[0] ?? null;
        setSelectedYearId(latestYear?.id ?? null);
        setError(null);
        await loadPeriodsForYear(latestYear ?? null, false);
      } catch (err) {
        const errorMsg = String(err);
        setError(errorMsg);
        setShowError(true);
      } finally {
        setLoading(false);
      }
    }

    void loadDatabase();
  }, []);

  const sortedYears = [...years].sort((a, b) => a.year - b.year);

  const handleYearSelection = (year: YearRecord | null) => {
    setSelectedYearId(year?.id ?? null);
    void loadPeriodsForYear(year, true);
  };

  const contentPlatformStyle = Platform.select({
    android: {
      paddingTop: Spacing.three,
      paddingLeft: 0,
      paddingRight: 0,
      paddingBottom: Spacing.four,
    },
    web: {
      paddingTop: Spacing.six,
      paddingBottom: Spacing.four,
      paddingLeft: 0,
      paddingRight: 0,
    },
  });

  const persianDigits = '۰۱۲۳۴۵۶۷۸۹';

  const toPersianDigits = (value: string) =>
    value.replace(/\d/g, (digit) => persianDigits[Number(digit)]);

  const formatYear = (value: number | string | null | undefined) => {
    if (value == null || value === '') {
      return '-';
    }

    const numericYear = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numericYear)) {
      return toPersianDigits(String(value));
    }

    const englishYear = String(Math.trunc(numericYear));
    return englishYear.replace(/\d/g, (digit) => persianDigits[Number(digit)]);
  };

  const togglePeriodExpanded = (periodKey: string) => {
    setExpandedPeriods(prev => ({
      ...prev,
      [periodKey]: !prev[periodKey],
    }));
  };

  const renderPeriodCard = (period: PeriodRecord, index: number) => {
    const periodKey = period.id?.toString() ?? `${index}-${period.month_count ?? 'x'}`;
    const isExpanded = expandedPeriods[periodKey] ?? false;

    // محاسبه‌ی month_count برای تمام دوره‌های این سال
    const periodMonthCounts = periods.map((p) => p.month_count);

    return (
      <PeriodCardLocal
        key={periodKey}
        period={period}
        index={index}
        isExpanded={isExpanded}
        isWide={isWide}
        periodsLength={periods.length}
        periodKey={periodKey}
        jobGroups={jobGroups}
        seniorityBaseByPeriod={seniorityBaseByPeriod}
        onToggle={togglePeriodExpanded}
        year={selectedYear?.year ?? 1400}
        periodMonthCounts={periodMonthCounts}
      />
    );
  };

  return (
    <>
      <ThemedView style={[styles.screen, { backgroundColor: theme.background }]}>
        {loading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator animating size="large" color={theme.primaryText} />
            <ThemedText type="small" style={styles.loadingText}>در حال بارگذاری داده‌ها...</ThemedText>
          </View>
        ) : (
          <ScrollView
            style={[styles.scrollView, { backgroundColor: theme.background }]}
            contentContainerStyle={[styles.contentContainer, contentPlatformStyle]}
            showsVerticalScrollIndicator={false}
          >
            <YearSelectorCard
              selectedYear={selectedYear}
              years={sortedYears}
              visible={yearPickerVisible}
              onOpen={() => setYearPickerVisible(true)}
              onClose={() => setYearPickerVisible(false)}
              onSelectYear={handleYearSelection}
              formatYear={formatYear}
            />

            {/* Periods Section */}
            <View style={{ marginTop: Spacing.two }}>
              <View style={styles.periodsSectionHeader}>
                <ThemedText type="smallBold" themeColor="text" style={styles.periodsSectionTitle}>جزئیات دوره‌ها</ThemedText>
                {loadingPeriods && <ActivityIndicator size="small" color={theme.primaryText} />}
              </View>

              {loadingPeriods ? (
                <View style={styles.centerContainer}>
                  <ActivityIndicator animating size="large" color={theme.primaryText} />
                </View>
              ) : periods.length === 0 ? (
                <Card style={[styles.emptyStateCard, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}>
                  <Card.Content style={styles.emptyStateContent}>
                    <View style={[styles.emptyStateIcon, { backgroundColor: theme.primaryContainer }]}>
                      <MaterialCommunityIcons name="calendar-blank" size={24} color={theme.primaryText} />
                    </View>
                    <ThemedText type="smallBold" style={styles.emptyText}>برای این سال دوره‌ای ثبت نشده است</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary" style={styles.emptySubText}>
                      با افزودن داده‌های جدید، جزئیات دوره‌ها اینجا به‌صورت خودکار ظاهر می‌شود.
                    </ThemedText>
                  </Card.Content>
                </Card>
              ) : (
                <View style={styles.periodsGrid}>
                  {periods.map((period, index) => renderPeriodCard(period, index))}
                </View>
              )}
            </View>

            {Platform.OS === 'web' && <WebBadge />}
          </ScrollView>
        )}
      </ThemedView>

      {/* Error Snackbar */}
      <Snackbar
        visible={showError}
        onDismiss={() => setShowError(false)}
        duration={5000}
        style={{ backgroundColor: theme.errorFill, borderRadius: Radius.md }}
        action={{
          label: 'بستن',
          onPress: () => setShowError(false),
          labelStyle: { color: theme.onStatus },
        }}
      >
        <ThemedText type="small" style={{ color: theme.onStatus }}>
          {error ?? 'خطایی رخ داده است.'}
        </ThemedText>
      </Snackbar>

    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: Spacing.six,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.three,
  },
  loadingText: {
    marginTop: Spacing.three,
  },
  periodsSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    marginBottom: Spacing.two,
  },
  periodsSectionTitle: {
    fontFamily: 'AppFont-Bold',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: Spacing.two,
  },
  periodsGrid: {
    gap: Spacing.two,
  },
  emptyStateCard: {
    borderRadius: Radius.md,
  },
  emptyStateContent: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.four,
  },
  emptyStateIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    textAlign: 'center',
  },
  emptySubText: {
    textAlign: 'center',
  },
  periodCard: {
    borderRadius: Radius.md,
    marginBottom: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  cardContent: {
    gap: Spacing.three,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
  },
  headerRow: {
    alignItems: 'flex-start',
  },
  headerText: {
    flex: 1,
    gap: Spacing.one,
  },
  pageTitle: {
    fontFamily: 'AppFont-Bold',
    fontSize: 16,
    lineHeight: 22,
  },
  pageDescription: {
    fontFamily: 'AppFont-Regular',
    fontSize: 12,
    lineHeight: 18,
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
    fontSize: 12,
    lineHeight: 18,
    fontFamily: 'AppFont-Medium',
  },
  metricContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  fieldValue: {
    fontFamily: 'AppFont-Bold',
    fontSize: 13,
    lineHeight: 19,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  buttonLabel: {
    fontFamily: 'AppFont-Bold',
    fontSize: 13,
    lineHeight: 19,
  },
  expandedSection: {
    marginTop: Spacing.one,
  },
  expandedDivider: {
    height: StyleSheet.hairlineWidth,
    marginBottom: Spacing.two,
  },
  periodDetailsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  detailBox: {
    minWidth: 0,
    flexShrink: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  detailRow: {
    width: '100%',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.half,
    textAlign: 'center',
  },
  detailItemStack: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.half,
  },
  detailRowLabel: {
    width: '100%',
    minWidth: 0,
    textAlign: 'center',
    alignSelf: 'center',
    fontSize: 10,
    lineHeight: 16,
    fontFamily: 'AppFont-Medium',
  },
  detailRowValue: {
    width: '100%',
    textAlign: 'center',
    alignSelf: 'center',
    fontSize: 12,
    lineHeight: 18,
    fontFamily: 'AppFont-Bold',
  },
  nestedToggleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    marginTop: Spacing.one,
  },
  nestedToggleLabel: {
    fontFamily: 'AppFont-Bold',
    fontSize: 11,
    lineHeight: 16,
  },
  formulaValue: {
    direction: 'ltr',
    writingDirection: 'ltr',
    textAlign: 'center',
    fontFamily: 'AppFont-Bold',
  },
  detailGroupBox: {
    alignItems: 'flex-start',
  },
  detailGroupHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
    width: '100%',
  },
  detailGroupHeaderText: {
    flex: 1,
    minWidth: 0,
  },
  detailGroupTitle: {
    width: '100%',
    textAlign: 'center',
    fontSize: 10,
    lineHeight: 16,
    fontWeight: '700',
    fontFamily: 'AppFont-Bold',
  },
  detailGroupItems: {
    width: '100%',
    gap: Spacing.half,
    marginTop: Spacing.one,
  },
  detailGroupRow: {
    width: '100%',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.half,
    textAlign: 'center',
  },
  detailGroupItemLabel: {
    width: '100%',
    minWidth: 0,
    textAlign: 'center',
    alignSelf: 'center',
    fontSize: 10,
    lineHeight: 16,
    fontFamily: 'AppFont-Medium',
  },
  detailGroupItemValue: {
    width: '100%',
    textAlign: 'center',
    alignSelf: 'center',
    fontSize: 11,
    lineHeight: 17,
    fontFamily: 'AppFont-Bold',
  },
});
