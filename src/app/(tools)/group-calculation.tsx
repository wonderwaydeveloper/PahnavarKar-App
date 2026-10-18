import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Asset } from 'expo-asset';
import { jalaaliMonthLength, toGregorian, toJalaali } from 'jalaali-js';
import { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { EncodingType, File, Paths } from 'expo-file-system';
import { ActivityIndicator, Card, Checkbox, Menu, Snackbar } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { NativeFileStorageUnavailableError } from 'pahnavar-file-storage';

import { FontAwareButton as Button, FontAwareMenuItem, FontAwarePaperTextInput as TextInput } from '@/components/font-aware-paper';
import type { CurrencyPreference, FontPreference } from '@/context/app.context';
import { CurrencyAmountInput } from '@/components/currency-amount-input';
import { DailyWorkTimeField, getDailyWorkMinutes } from '@/components/daily-work-time-field';
import { PdfHtmlPreview } from '@/components/pdf-html-preview';
import { HiddenCalculationGuide } from '@/components/hidden-calculation-guide';
import { DateInputField } from '@/components/date-input-field';
import { NumericInputField } from '@/components/numeric-input-field';
import { PersianDatePickerModal } from '@/components/persian-date-picker-modal';
import { PersianTimePickerModal } from '@/components/persian-time-picker-modal';
import { SettlementThrough1391Field } from '@/components/settlement-through-1391-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ToolListItem } from '@/components/tool-list-item';
import { getWorkshopTypeLabel, WorkshopTypeSelector } from '@/components/workshop-type-selector';
import { Radius, Spacing } from '@/constants/theme';
import { TOOL_DEFINITIONS } from '@/constants/tool-definitions';
import { fetchJobGroups, fetchOfficialHolidaysBetweenDates, fetchPeriodsByYearId, fetchSeniorityBaseByGroup, fetchYears, seedFromJsonAsset } from '@/database';
import { useTheme } from '@/hooks/use-theme';
import { useAppContext } from '@/hooks/use-app-context';
import { useCurrencyFormatter } from '@/hooks/use-currency-formatter';
import { saveFileToDefaultLocation } from '@/services/file-storage';
import {
    buildGroupCalculationPdfHtml,
    type GroupCalculationPdfAssets,
    type GroupCalculationPdfDetail,
    type GroupCalculationPdfMetadata,
    type GroupCalculationPdfSection,
    type GroupCalculationPdfWageTotal,
} from '@/utils/group-calculation-pdf';
import { displayCurrencyToRial, formatCurrencyAmount, getCurrencyLabel } from '@/utils/currency';
import {
    calculateGroupItems,
    GROUP_CALCULATION_KEYS,
    type GroupCalculationKey,
    type GroupCalculationResult,
} from '@/utils/group-calculation';
import {
    calculateAvailableFridaysByPeriod,
    calculateUnusedLeaveMonths,
    getMissionAllowancePeriodRanges,
    parseDateInput,
    type ParsedDateInput,
    type SalaryPeriodBucket,
} from '@/utils/salary-calculation';
import { FULL_TIME_DAILY_MINUTES } from '@/utils/daily-work-ratio';

type DatePickerTarget = 'start' | 'end' | 'employment' | 'mission-start' | 'mission-end';
const NIGHT_SHIFT_CONFLICT_MESSAGE = 'بر اساس ماده 58 قانون کار ، مجاز به دریافت همزمان نوبت کاری و شب کاری نمی باشید ';
const SHIFT_TYPE_OPTIONS = [
    { value: 'morning-evening', label: 'صبح و عصر', percentage: '۱۰٪' },
    { value: 'morning-evening-night', label: 'صبح و عصر و شب', percentage: '۱۵٪' },
    { value: 'morning-night-or-evening-night', label: 'صبح و شب یا عصر و شب', percentage: '۲۲.۵٪' },
] as const;
const CHILDREN_OPTIONS = Array.from({ length: 13 }, (_, index) => index);
const CONTRACTOR_MONTH_DAY_OPTIONS = [30, 31] as const;
const MARITAL_OPTIONS = [
    { value: 'single', label: 'مجرد' },
    { value: 'married', label: 'متأهل' },
] as const;

const GROUP_TOOL_CATEGORIES = ['wageContinuous', 'wageNonContinuous', 'nonWage'] as const;
const GROUP_TOOLS = GROUP_TOOL_CATEGORIES.flatMap((category) =>
    TOOL_DEFINITIONS.filter((tool) =>
        tool.category === category && GROUP_CALCULATION_KEYS.includes(tool.key as GroupCalculationKey),
    ),
);
const WAGE_TOTAL_EXCLUDED_KEYS: GroupCalculationKey[] = ['minimum-bonus', 'maximum-bonus'];
const INSURANCE_CALCULATION_KEYS: GroupCalculationKey[] = [
    'base-salary',
    'housing-allowance',
    'monthly-allowance',
    'spousal-allowance',
    'entitled-seniority',
    'overtime-entitlement',
    'night-shift-entitlement',
    'monthly-shift-work',
    'official-holiday-work',
    'friday-work',
];

function isWageCalculationKey(key: GroupCalculationKey) {
    return GROUP_TOOLS.some((tool) => (
        tool.key === key && (tool.category === 'wageContinuous' || tool.category === 'wageNonContinuous')
    ));
}

function getResultAmount(result: GroupCalculationResult) {
    if (result.key !== 'entitled-seniority') {
        return result.value;
    }

    return result.breakdown.reduce<number>((total, item) => {
        if (
            !isRecord(item)
            || typeof item.daysCovered !== 'number'
            || typeof item.entitlement !== 'number'
        ) {
            return total;
        }

        return total + item.daysCovered * item.entitlement;
    }, 0);
}

function isInsuranceCalculationKey(key: GroupCalculationKey) {
    return INSURANCE_CALCULATION_KEYS.includes(key);
}

function getInsuranceBaseAmount(result: GroupCalculationResult) {
    return Math.max(0, result.key === 'entitled-seniority' ? getResultAmount(result) : result.value);
}

function getEmployerInsuranceTotal(results: readonly GroupCalculationResult[]) {
    return results.reduce((total, result) => {
        if (result.error || !isInsuranceCalculationKey(result.key)) return total;
        return total + Math.round(Math.round(getInsuranceBaseAmount(result)) * 0.23);
    }, 0);
}

function getInsurancePeriodDetailRecord(
    key: GroupCalculationKey,
    entry: Record<string, unknown>,
) {
    if (!isInsuranceCalculationKey(key)) return entry;

    const periodBaseAmount = key === 'entitled-seniority'
        && typeof entry.daysCovered === 'number'
        && typeof entry.entitlement === 'number'
        ? entry.daysCovered * entry.entitlement
        : entry.amount;
    if (typeof periodBaseAmount !== 'number' || !Number.isFinite(periodBaseAmount)) return entry;

    const safePeriodBaseAmount = Math.max(0, periodBaseAmount);
    return {
        ...entry,
        insurancePeriodBaseAmount: safePeriodBaseAmount,
        socialSecurityPremiumAmount: Math.round(safePeriodBaseAmount * 0.3),
    };
}

function getWageTotalResults(results: readonly GroupCalculationResult[]) {
    return results.filter((result) => (
        result.unit === 'ریال'
        && isWageCalculationKey(result.key)
        && !WAGE_TOTAL_EXCLUDED_KEYS.includes(result.key)
    ));
}

function calculateContractorMonthlyTotals(
    wageTotalAmount: number,
    employerInsuranceTotal: number,
    wageTotalHasErrors: boolean,
    periodDayCount: number | null,
    workerCount: number,
) {
    const periodDayCountIsValid = periodDayCount !== null
        && Number.isSafeInteger(periodDayCount)
        && periodDayCount > 0;
    const workerCountIsValid = Number.isSafeInteger(workerCount) && workerCount > 0;
    const wageTotalError = wageTotalHasErrors
        ? 'به‌دلیل خطای یکی از محاسبات، جمع کامل نیست.'
        : !Number.isFinite(wageTotalAmount)
            ? 'جمع حقوق و مزایا قابل محاسبه نیست.'
            : !Number.isFinite(employerInsuranceTotal)
                ? 'سهم بیمهٔ کارفرما قابل محاسبه نیست.'
            : undefined;
    const calculateContractorTotal = (monthDays: number) => {
        const employerInsuranceAmount = periodDayCountIsValid
            ? (employerInsuranceTotal / periodDayCount) * monthDays * workerCount
            : 0;
        const amount = periodDayCountIsValid
            ? ((wageTotalAmount + employerInsuranceTotal) / periodDayCount) * monthDays * workerCount
            : 0;
        const error = wageTotalError
            ?? (!periodDayCountIsValid
                ? 'تعداد روزهای بازه برای محاسبه معتبر نیست.'
                : !workerCountIsValid
                    ? 'تعداد کارگران باید عدد صحیح بزرگ‌تر از صفر باشد.'
                    : !Number.isFinite(amount)
                        ? 'هزینهٔ ماهانه برای تعداد واردشده قابل محاسبه نیست.'
                        : undefined);

        return { amount, employerInsuranceAmount, error };
    };
    const contractorTotal30 = calculateContractorTotal(CONTRACTOR_MONTH_DAY_OPTIONS[0]);
    const contractorTotal31 = calculateContractorTotal(CONTRACTOR_MONTH_DAY_OPTIONS[1]);

    return {
        wageTotalError,
        workerCountIsValid,
        contractorTotal30: contractorTotal30.amount,
        employerInsurance30: contractorTotal30.employerInsuranceAmount,
        contractorTotal30Error: contractorTotal30.error,
        contractorTotal: contractorTotal31.amount,
        employerInsurance31: contractorTotal31.employerInsuranceAmount,
        contractorTotalError: contractorTotal31.error,
    };
}

function calculateWorkerClaimsAfterPayments(
    wageTotalAmount: number,
    amountPaid: number,
    wageTotalError?: string,
) {
    const error = wageTotalError
        ?? (!Number.isSafeInteger(amountPaid) || amountPaid < 0
            ? 'مبلغ پرداخت‌شده باید عدد صحیح و نامنفی باشد.'
            : !Number.isFinite(wageTotalAmount)
                ? 'جمع حقوق و مزایا قابل محاسبه نیست.'
                : undefined);

    if (error) {
        return { error, remainingClaim: 0, finalClaim: 0 };
    }

    const remainingClaim = Math.max(0, Math.round(wageTotalAmount - amountPaid));
    const workerInsurance = Math.round(remainingClaim * 0.07);

    return {
        remainingClaim,
        finalClaim: remainingClaim - workerInsurance,
    };
}

function getResultTitle(
    result: GroupCalculationResult,
    workshopType: 'classified' | 'unclassified',
) {
    if (result.key !== 'entitled-seniority') {
        return result.title;
    }

    return workshopType === 'classified'
        ? 'پایه سنوات استحقاقی گروه شغلی (کل دوره)'
        : 'پایه سنوات استحقاقی (کل دوره)';
}

function getExcludedBonusItemTitles(results: readonly GroupCalculationResult[]) {
    return WAGE_TOTAL_EXCLUDED_KEYS
        .filter((key) => results.some((result) => result.key === key))
        .map((key) => GROUP_TOOLS.find((tool) => tool.key === key)?.title)
        .filter((title): title is string => title !== undefined);
}

function getOrderedGroupCalculationKeys(keys: readonly GroupCalculationKey[]) {
    return GROUP_TOOLS
        .filter((tool) => keys.includes(tool.key as GroupCalculationKey))
        .map((tool) => tool.key as GroupCalculationKey);
}

function getSelectedCalculationTitles(keys: readonly GroupCalculationKey[]) {
    return GROUP_TOOLS
        .filter((tool) => keys.includes(tool.key as GroupCalculationKey))
        .map((tool) => tool.title)
        .join('، ');
}

function PdfActionButton({
    label,
    icon,
    onPress,
    loading,
    disabled,
    variant,
    primaryColor,
    surfaceColor,
    borderColor,
}: {
    label: string;
    icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
    onPress: () => void;
    loading: boolean;
    disabled: boolean;
    variant: 'contained' | 'outlined';
    primaryColor: string;
    surfaceColor: string;
    borderColor: string;
}) {
    const isContained = variant === 'contained';
    const contentColor = isContained ? surfaceColor : primaryColor;

    return (
        <Pressable
            onPress={onPress}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityState={{ disabled, busy: loading }}
            style={({ pressed }) => [
                styles.pdfActionButton,
                {
                    backgroundColor: isContained ? primaryColor : 'transparent',
                    borderColor: isContained ? primaryColor : borderColor,
                    opacity: disabled && !loading ? 0.55 : pressed ? 0.8 : 1,
                },
            ]}
        >
            <View style={styles.pdfActionButtonContent}>
                {loading ? (
                    <ActivityIndicator size={16} color={contentColor} />
                ) : (
                    <MaterialCommunityIcons name={icon} size={16} color={contentColor} />
                )}
                <ThemedText
                    type="smallBold"
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.75}
                    style={[styles.pdfActionButtonLabel, { color: contentColor }]}
                >
                    {label}
                </ThemedText>
            </View>
        </Pressable>
    );
}

const PAYROLL_DAILY_WORK_KEYS: GroupCalculationKey[] = [
    'base-salary',
    'family-allowance',
    'housing-allowance',
    'monthly-allowance',
    'minimum-bonus',
    'maximum-bonus',
    'spousal-allowance',
    'entitled-seniority',
    'overtime-entitlement',
    'night-shift-entitlement',
    'monthly-shift-work',
    'end-of-service-years',
    'bonus-entitlement',
    'official-holiday-work',
    'friday-work',
    'unused-leave-wage',
];

const RESULT_SUMMARY_LABELS: Record<GroupCalculationKey, string> = {
    'base-salary': 'حقوق پایهٔ محاسبه‌شده در بازه',
    'family-allowance': 'مبلغ کل حق عائله‌مندی',
    'housing-allowance': 'مبلغ کل حق مسکن ماهیانه',
    'monthly-allowance': 'مبلغ کل بن ماهیانه',
    'minimum-bonus': 'مبلغ کل حداقل عیدی و پاداش استحقاقی',
    'maximum-bonus': 'مبلغ کل حداکثر عیدی و پاداش استحقاقی',
    'spousal-allowance': 'مبلغ کل حق تاهل استحقاقی',
    'official-holidays-in-range': 'تعداد تعطیلات رسمی در بازه',
    'ordinary-work-hours': 'مجموع ساعات کارکرد موظفی',
    'hazardous-work-hours': 'مجموع ساعات کارکرد موظفی',
    'young-worker-work-hours': 'مجموع ساعات کارکرد موظفی',
    'insurance-days-entitlement': 'مجموع کل روزهای بیمه استحقاقی',
    'entitled-seniority': 'پایه سنوات استحقاقی روزانه',
    'overtime-entitlement': 'مبلغ کل اضافه کاری استحقاقی',
    'night-shift-entitlement': 'مبلغ کل شب کاری استحقاقی',
    'monthly-shift-work': 'مبلغ کل نوبت کاری در بازه زمانی انتخاب شده',
    'end-of-service-years': 'مبلغ کل سنوات پایان کار',
    'bonus-entitlement': 'مبلغ نهایی عیدی و پاداش در بازهٔ زمانی انتخابی',
    'official-holiday-work': 'مبلغ نهایی تعطیل کاری استحقاقی',
    'friday-work': 'مبلغ کل جمعه کاری',
    'mission-allowance': 'مبلغ فوق‌العاده مأموریت',
    'unused-leave-entitlement': 'ذخیره نهایی مرخصی کارگر',
    'unused-leave-wage': 'مبلغ مزد مرخصی ذخیره شده کارگر',
};

const persianDigits = '۰۱۲۳۴۵۶۷۸۹';
const latinDigits = '0123456789';
const DEFAULT_MISSION_DAYS = '۱';

function normalizeDigits(value: string) {
    return value.replace(/[۰-۹]/g, (digit) => latinDigits[persianDigits.indexOf(digit)]);
}

function toPersianDigits(value: string | number) {
    return String(value).replace(/\d/g, (digit) => persianDigits[Number(digit)]);
}

function clampDayCount(value: string | number, maximum: number) {
    const normalized = typeof value === 'number' ? value : Number(normalizeDigits(value));
    const dayCount = Number.isFinite(normalized) ? Math.trunc(normalized) : 0;
    return toPersianDigits(Math.min(maximum, Math.max(0, dayCount)));
}

function addLeaveDays(value: string, delta: number) {
    const currentValue = Number(normalizeDigits(value)) || 0;
    const nextValue = Math.max(0, currentValue + delta);
    return toPersianDigits(nextValue.toFixed(2).replace(/\.00$/, ''));
}

function formatDateParts(date: ParsedDateInput) {
    return `${toPersianDigits(date.year)}/${toPersianDigits(String(date.month).padStart(2, '0'))}/${toPersianDigits(String(date.day).padStart(2, '0'))}`;
}

function getFullLeaveYearLabel(startDate: ParsedDateInput, segmentIndex: number) {
    const year = startDate.year + segmentIndex - 1;
    const firstDay = { year, month: startDate.month, day: Math.min(startDate.day, jalaaliMonthLength(year, startDate.month)) };
    const anniversaryYear = year + 1;
    const anniversary = {
        year: anniversaryYear,
        month: startDate.month,
        day: Math.min(startDate.day, jalaaliMonthLength(anniversaryYear, startDate.month)),
    };
    const anniversaryGregorian = toGregorian(anniversary.year, anniversary.month, anniversary.day);
    const previousGregorian = new Date(Date.UTC(anniversaryGregorian.gy, anniversaryGregorian.gm - 1, anniversaryGregorian.gd) - 86400000);
    const lastDay = toJalaali(
        previousGregorian.getUTCFullYear(),
        previousGregorian.getUTCMonth() + 1,
        previousGregorian.getUTCDate(),
    );

    return `سال کامل ${toPersianDigits(segmentIndex)} (${formatDateParts(firstDay)} تا ${formatDateParts({ year: lastDay.jy, month: lastDay.jm, day: lastDay.jd })})`;
}

function getPartialLeavePeriodLabel(startDate: ParsedDateInput, endDate: ParsedDateInput, fullYears: number, remainingMonths: number) {
    const year = startDate.year + fullYears;
    const partialStart = {
        year,
        month: startDate.month,
        day: Math.min(startDate.day, jalaaliMonthLength(year, startDate.month)),
    };

    return `بازه ناکامل (${formatDateParts(partialStart)} تا ${formatDateParts(endDate)}، ${toPersianDigits(remainingMonths.toFixed(2))} ماه)`;
}

function formatDate(value: string) {
    const parsed = parseDateInput(value);
    if (!parsed) return '';

    return `${toPersianDigits(parsed.year)}/${toPersianDigits(String(parsed.month).padStart(2, '0'))}/${toPersianDigits(String(parsed.day).padStart(2, '0'))}`;
}

type BreakdownFieldFormat = 'days' | 'months' | 'hours' | 'clock' | 'duration' | 'money' | 'number' | 'range' | 'phase' | 'shift' | 'coefficient' | 'calculation-type' | 'calculation-formula' | 'last-period';

interface BreakdownField {
    key: string;
    label: string;
    format: BreakdownFieldFormat;
}

const BREAKDOWN_FIELDS: Record<GroupCalculationKey, BreakdownField[]> = {
    'base-salary': [
        { key: 'daysCovered', label: 'تعداد روزهای پوشش', format: 'days' },
        { key: 'dailyMinimumWage', label: 'حداقل مزد روزانه', format: 'money' },
        { key: 'amount', label: 'مبلغ دوره', format: 'money' },
    ],
    'family-allowance': [
        { key: 'monthsCovered', label: 'تعداد ماه‌های شمول', format: 'months' },
        { key: 'childAllowance', label: 'مبلغ عائله مندی به یک فرزند واجد شرایط', format: 'money' },
        { key: 'amount', label: 'مبلغ این دوره', format: 'money' },
    ],
    'housing-allowance': [
        { key: 'monthsCovered', label: 'تعداد ماه‌های شمول', format: 'months' },
        { key: 'monthlyAllowance', label: 'حق مسکن ماهیانه', format: 'money' },
        { key: 'amount', label: 'مبلغ این دوره', format: 'money' },
    ],
    'monthly-allowance': [
        { key: 'monthsCovered', label: 'تعداد ماه‌های شمول', format: 'months' },
        { key: 'monthlyAllowance', label: 'بن ماهیانه', format: 'money' },
        { key: 'amount', label: 'مبلغ این دوره', format: 'money' },
    ],
    'minimum-bonus': [
        { key: 'monthsCovered', label: 'تعداد ماه‌های شمول', format: 'months' },
        { key: 'dailyMinimumWage', label: 'حداقل مزد روزانه', format: 'money' },
        { key: 'amount', label: 'مبلغ این دوره', format: 'money' },
    ],
    'maximum-bonus': [
        { key: 'monthsCovered', label: 'تعداد ماه‌های شمول', format: 'months' },
        { key: 'dailyMinimumWage', label: 'حداقل مزد روزانه', format: 'money' },
        { key: 'amount', label: 'مبلغ این دوره', format: 'money' },
    ],
    'spousal-allowance': [
        { key: 'monthsCovered', label: 'تعداد ماه‌های شمول', format: 'months' },
        { key: 'spousalAllowance', label: 'حق تاهل ماهیانه', format: 'money' },
        { key: 'amount', label: 'مبلغ این دوره', format: 'money' },
    ],
    'official-holidays-in-range': [
        { key: 'range', label: 'بازهٔ زمانی دوره', format: 'range' },
        { key: 'totalHolidays', label: 'تعداد تعطیلات این دوره', format: 'days' },
    ],
    'ordinary-work-hours': [
        { key: 'daysCovered', label: 'کل روزهای بازه', format: 'days' },
        { key: 'officialHolidays', label: 'تعطیلات رسمی', format: 'days' },
        { key: 'fridays', label: 'جمعه‌ها', format: 'days' },
        { key: 'workingDays', label: 'روزهای کارکرد موظفی', format: 'days' },
        { key: 'requiredHours', label: 'ساعات موظفی این دوره', format: 'hours' },
    ],
    'hazardous-work-hours': [
        { key: 'daysCovered', label: 'کل روزهای بازه', format: 'days' },
        { key: 'officialHolidays', label: 'تعطیلات رسمی', format: 'days' },
        { key: 'fridays', label: 'جمعه‌ها', format: 'days' },
        { key: 'workingDays', label: 'روزهای کارکرد موظفی', format: 'days' },
        { key: 'requiredHours', label: 'ساعات موظفی این دوره', format: 'hours' },
    ],
    'young-worker-work-hours': [
        { key: 'daysCovered', label: 'کل روزهای بازه', format: 'days' },
        { key: 'officialHolidays', label: 'تعطیلات رسمی', format: 'days' },
        { key: 'fridays', label: 'جمعه‌ها', format: 'days' },
        { key: 'workingDays', label: 'روزهای کارکرد موظفی', format: 'days' },
        { key: 'requiredHours', label: 'ساعات موظفی این دوره', format: 'hours' },
    ],
    'insurance-days-entitlement': [
        { key: 'daysCovered', label: 'روزهای پوشش', format: 'days' },
        { key: 'dailyHours', label: 'ساعات کاری روزانه', format: 'clock' },
        { key: 'calculationType', label: 'روش محاسبه', format: 'calculation-type' },
        { key: 'calculationType', label: 'شرح فرمول', format: 'calculation-formula' },
        { key: 'daysCalculated', label: 'روزهای بیمه', format: 'number' },
    ],
    'entitled-seniority': [
        { key: 'range', label: 'بازهٔ زمانی', format: 'range' },
        { key: 'phase', label: 'نوع بازه', format: 'phase' },
        { key: 'daysCovered', label: 'تعداد روزهای شمول', format: 'days' },
        { key: 'currentBase', label: 'پایه سنوات جاری', format: 'money' },
        { key: 'entitlement', label: 'پایه سنوات استحقاقی روزانه', format: 'money' },
    ],
    'overtime-entitlement': [
        { key: 'range', label: 'بازهٔ زمانی', format: 'range' },
        { key: 'phase', label: 'نوع بازه', format: 'phase' },
        { key: 'daysCovered', label: 'تعداد روزهای شمول', format: 'days' },
        { key: 'totalOvertimeHours', label: 'مجموع ساعات اضافه‌کاری دوره', format: 'duration' },
        { key: 'dailySeniority', label: 'پایه سنوات استحقاقی روزانه', format: 'money' },
        { key: 'dailyMinimumWage', label: 'حداقل مزد روزانه', format: 'money' },
        { key: 'amount', label: 'مبلغ این دوره', format: 'money' },
    ],
    'night-shift-entitlement': [
        { key: 'range', label: 'بازهٔ زمانی', format: 'range' },
        { key: 'phase', label: 'نوع بازه', format: 'phase' },
        { key: 'nightWorkDays', label: 'تعداد روزهای کارکرد در شب', format: 'days' },
        { key: 'dailyMinimumWage', label: 'حداقل مزد روزانه', format: 'money' },
        { key: 'dailySeniority', label: 'پایه سنوات استحقاقی روزانه', format: 'money' },
        { key: 'nightShiftRate', label: 'مبلغ یک نوبت شب‌کاری', format: 'money' },
        { key: 'amount', label: 'مبلغ این دوره', format: 'money' },
    ],
    'monthly-shift-work': [
        { key: 'range', label: 'بازهٔ زمانی', format: 'range' },
        { key: 'phase', label: 'نوع بازه', format: 'phase' },
        { key: 'daysCovered', label: 'تعداد روزهای شمول', format: 'days' },
        { key: 'dailySeniority', label: 'پایه سنوات استحقاقی روزانه', format: 'money' },
        { key: 'coefficient', label: 'ضریب نوبت', format: 'coefficient' },
        { key: 'dailyBase', label: 'حداقل مزد روزانه', format: 'money' },
        { key: 'amount', label: 'مبلغ این دوره', format: 'money' },
    ],
    'end-of-service-years': [
        { key: 'totalMonthEquivalent', label: 'تعداد ماه‌های کارکرد', format: 'months' },
        { key: 'finalDailyMinimumWage', label: 'حداقل مزد روز آخر', format: 'money' },
        { key: 'finalDailySeniority', label: 'پایه سنوات استحقاقی روزانه', format: 'money' },
        { key: 'finalDailyWage', label: 'مزد ثابت روزانه', format: 'money' },
    ],
    'bonus-entitlement': [
        { key: 'range', label: 'بازهٔ زمانی', format: 'range' },
        { key: 'phase', label: 'نوع بازه', format: 'phase' },
        { key: 'monthsCovered', label: 'ماه‌های کارکرد دوره', format: 'months' },
        { key: 'dailyMinimumWage', label: 'حداقل مزد روزانه', format: 'money' },
        { key: 'dailySeniority', label: 'پایه سنوات استحقاقی روزانه', format: 'money' },
        { key: 'minimumAmount', label: 'حداقل عیدی و پاداش', format: 'money' },
        { key: 'maximumAmount', label: 'حداکثر عیدی و پاداش', format: 'money' },
        { key: 'entitlementAmount', label: 'سهم نهایی دوره', format: 'money' },
    ],
    'official-holiday-work': [
        { key: 'range', label: 'بازه زمانی', format: 'range' },
        { key: 'phase', label: 'نوع بازه', format: 'phase' },
        { key: 'daysCovered', label: 'تعداد روزهای تعطیل', format: 'days' },
        { key: 'dailyMinimumWage', label: 'حداقل مزد روزانه', format: 'money' },
        { key: 'seniorityBase', label: 'پایه سنوات استحقاقی دوره', format: 'money' },
        { key: 'holidayWorkRate', label: 'مبلغ هر روز تعطیل‌کاری', format: 'money' },
        { key: 'amount', label: 'مبلغ نهایی', format: 'money' },
    ],
    'friday-work': [
        { key: 'range', label: 'بازهٔ زمانی', format: 'range' },
        { key: 'phase', label: 'نوع بازه', format: 'phase' },
        { key: 'fridaysInPeriod', label: 'جمعه‌های موجود در این دوره', format: 'days' },
        { key: 'fridayWorkDays', label: 'جمعه‌کاری واردشده', format: 'days' },
        { key: 'dailyMinimumWage', label: 'حداقل مزد روزانه', format: 'money' },
        { key: 'dailySeniority', label: 'پایه سنوات استحقاقی روزانه', format: 'money' },
        { key: 'fridayWorkRate', label: 'مبلغ یک روز جمعه کاری', format: 'money' },
        { key: 'amount', label: 'مبلغ این دوره', format: 'money' },
    ],
    'mission-allowance': [
        { key: 'range', label: 'بازهٔ زمانی', format: 'range' },
        { key: 'phase', label: 'نوع بازه', format: 'phase' },
        { key: 'daysCovered', label: 'روزهای موجود در این بخش', format: 'days' },
        { key: 'missionDays', label: 'روزهای مأموریت در این بخش', format: 'days' },
        { key: 'dailyMinimumWage', label: 'حداقل مزد روزانه', format: 'money' },
        { key: 'dailySeniority', label: 'پایه سنوات استحقاقی روزانه', format: 'money' },
        { key: 'amount', label: 'مبلغ این بخش', format: 'money' },
    ],
    'unused-leave-entitlement': [
        { key: 'entitlementDays', label: 'استحقاق این بخش', format: 'days' },
        { key: 'usedLeaveDays', label: 'مرخصی استفاده‌شده', format: 'days' },
        { key: 'savedLeaveDays', label: 'ذخیره این بخش', format: 'days' },
        { key: 'excessUsedDays', label: 'مازاد کسرشده از ذخیره قبل', format: 'days' },
        { key: 'carryAfter', label: 'ذخیره تجمعی پس از این بخش', format: 'days' },
    ],
    'unused-leave-wage': [
        { key: 'unusedLeaveDays', label: 'روزهای مرخصی ذخیره شده', format: 'days' },
        { key: 'calendarDaysInLastMonth', label: 'روزهای تقویمی ماه آخر کارکرد', format: 'days' },
        { key: 'lastPeriod', label: '', format: 'last-period' },
        { key: 'dailyMinimumWage', label: 'حداقل مزد روزانه', format: 'money' },
        { key: 'dailySeniority', label: 'پایه سنوات استحقاقی روزانه', format: 'money' },
        { key: 'dailyHousingAllowance', label: 'حق مسکن روزانه', format: 'money' },
        { key: 'dailyChildAllowance', label: 'حق عائله‌مندی روزانه', format: 'money' },
        { key: 'dailyMonthlyAllowance', label: 'بن کارگری روزانه', format: 'money' },
        { key: 'dailyMaritalAllowance', label: 'حق تأهل روزانه', format: 'money' },
        { key: 'dailyWage', label: 'مزد روزانه مشمول مرخصی', format: 'money' },
    ],
};

const PERSIAN_MONTH_NAMES = [
    'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
    'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند',
];

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function formatBreakdownNumber(value: number) {
    return toPersianDigits(Number.isInteger(value) ? String(value) : value.toFixed(2));
}

function formatBreakdownRange(entry: Record<string, unknown>) {
    const startDate = entry.startDate;
    const endDate = entry.endDate;
    if (!isRecord(startDate) || !isRecord(endDate)) return '—';

    const start = `${startDate.year}/${startDate.month}/${startDate.day}`;
    const end = `${endDate.year}/${endDate.month}/${endDate.day}`;
    const formattedStart = formatDate(start);
    const formattedEnd = formatDate(end);
    return formattedStart && formattedEnd ? `${formattedStart} تا ${formattedEnd}` : '—';
}

function formatBreakdownDetail(
    field: BreakdownField,
    entry: Record<string, unknown>,
    key: GroupCalculationKey,
    currencyPreference: CurrencyPreference,
) {
    if (field.format === 'range') return formatBreakdownRange(entry);
    if (field.format === 'last-period') {
        return `آخرین ماه کارکرد: سال ${toPersianDigits(String(entry.year))}، دوره ${toPersianDigits(String(entry.periodIndex))}`;
    }

    const value = entry[field.key];
    if (value == null) {
        if (key === 'base-salary' && field.key === 'dailyMinimumWage') {
            return formatCurrencyAmount(0, currencyPreference);
        }
        return '-';
    }

    if (field.format === 'phase') {
        const afterAnniversary = key === 'mission-allowance' ? 'پس از سالگرد استخدام' : 'بعد از سالگرد استخدام';
        const phaseMap: Record<string, string> = {
            'before-anniversary': 'پیش از سالگرد استخدام',
            'after-anniversary': afterAnniversary,
            'settled-through-1391': 'تصفیه‌شده تا پایان ۱۳۹۱',
            'before-anniversary-settled-through-1391': 'پیش از سالگرد و تسویه تا پایان ۱۳۹۱',
            'after-anniversary-settled-through-1391': key === 'mission-allowance'
                ? 'تصفیه‌شده تا پایان ۱۳۹۱'
                : 'پس از سالگرد و تسویه تا پایان ۱۳۹۱',
        };
        return typeof value === 'string' ? phaseMap[value] ?? value : '—';
    }

    if (field.format === 'shift') {
        const shiftMap: Record<string, string> = {
            'morning-evening': 'صبح و عصر',
            'morning-evening-night': 'صبح و عصر و شب',
            'morning-night-or-evening-night': 'صبح و شب یا عصر و شب',
        };
        return typeof value === 'string' ? shiftMap[value] ?? value : '—';
    }

    if (field.format === 'calculation-type') {
        return value === 'month-full' ? 'فرمول ۱' : value === 'partial' ? 'فرمول ۲' : '—';
    }

    if (field.format === 'calculation-formula') {
        return value === 'month-full'
            ? 'اگر ساعات کاری روزانه ۷ ساعت و ۲۰ دقیقه یا بیشتر باشد: روزهای بیمه = روزهای پوشش'
            : value === 'partial'
                ? 'اگر ساعات کاری روزانه کمتر از ۷ ساعت و ۲۰ دقیقه باشد: روزهای بیمه = روزهای پوشش × ساعات کاری روزانه ÷ ۷٫۳۳'
                : '—';
    }

    if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
    if (field.format === 'money') {
        return formatCurrencyAmount(value, currencyPreference);
    }
    if (field.format === 'coefficient') return `${toPersianDigits((value * 100).toFixed(1))}٪`;
    if (field.format === 'days') return `${formatBreakdownNumber(value)} روز`;
    if (field.format === 'months') return `${formatBreakdownNumber(value)} ماه`;
    if (field.format === 'clock') {
        const minutes = Math.round(value * 60);
        return `${toPersianDigits(String(Math.floor(minutes / 60)))}:${toPersianDigits(String(minutes % 60).padStart(2, '0'))}`;
    }
    if (field.format === 'duration') {
        const minutes = Math.round(value * 60);
        return `${toPersianDigits(String(Math.floor(minutes / 60)))} ساعت و ${toPersianDigits(String(minutes % 60))} دقیقه`;
    }
    if (field.format === 'hours') return `${formatBreakdownNumber(value)} ساعت`;
    return formatBreakdownNumber(value);
}

function getBreakdownDetailFields(
    key: GroupCalculationKey,
    entry: Record<string, unknown>,
    workshopType: 'classified' | 'unclassified',
): BreakdownField[] {
    const fields = BREAKDOWN_FIELDS[key].filter((field) => {
        if (field.key === 'range') return 'startDate' in entry && 'endDate' in entry;
        if (field.format === 'last-period') return typeof entry.year === 'number' && typeof entry.periodIndex === 'number';
        if (!(field.key in entry)) return false;
        if (field.key === 'excessUsedDays') return typeof entry.excessUsedDays === 'number' && entry.excessUsedDays > 0;
        return true;
    }).map((field) => {
        if (field.key === 'entitlement' && key === 'entitled-seniority' && workshopType === 'classified') {
            return { ...field, label: 'پایه سنوات استحقاقی روزانه گروه شغلی' };
        }
        if (field.key === 'currentBase' && key === 'entitled-seniority' && workshopType === 'classified') {
            return { ...field, label: 'پایه سنوات جاری گروه شغلی' };
        }
        if (field.key === 'dailySeniority' && workshopType === 'classified') {
            return {
                ...field,
                label: key === 'mission-allowance'
                    ? 'پایه سنوات استحقاقی گروه شغلی روزانه'
                    : 'پایه سنوات استحقاقی روزانه گروه شغلی',
            };
        }
        if (field.key === 'seniorityBase' && workshopType === 'classified') {
            return { ...field, label: 'پایه سنوات استحقاقی دوره گروه شغلی' };
        }
        if (field.key === 'finalDailySeniority' && workshopType === 'classified') {
            return { ...field, label: 'پایه سنوات استحقاقی روزانه گروه شغلی' };
        }
        if (field.key === 'finalDailyWage') {
            return { ...field, label: workshopType === 'classified' ? 'مزد مبنا روزانه' : 'مزد ثابت روزانه' };
        }
        return field;
    });

    if (isInsuranceCalculationKey(key) && typeof entry.socialSecurityPremiumAmount === 'number') {
        if (key === 'entitled-seniority' && typeof entry.insurancePeriodBaseAmount === 'number') {
            fields.push({
                key: 'insurancePeriodBaseAmount',
                label: 'مبنای مشمول بیمه این دوره',
                format: 'money',
            });
        }
        fields.push({
            key: 'socialSecurityPremiumAmount',
            label: 'حق بیمه پرداختی به سازمان تامین اجتماعی',
            format: 'money',
        });
    }

    return fields;
}

function formatBreakdownTitle(
    key: GroupCalculationKey,
    entry: Record<string, unknown>,
    index: number,
    startDateValue: string,
    endDateValue: string,
) {
    if (key === 'unused-leave-wage') return 'جزئیات مزد روزانه';
    if (key === 'end-of-service-years') return 'خلاصه محاسبه';

    if (key === 'unused-leave-entitlement' && typeof entry.segmentIndex === 'number') {
        if (entry.isPartial === true) {
            const leaveStart = parseDateInput(startDateValue);
            const leaveEnd = parseDateInput(endDateValue);
            if (leaveStart && leaveEnd) {
                const totalMonths = calculateUnusedLeaveMonths(leaveStart, leaveEnd);
                const fullYears = totalMonths === null ? 0 : Math.floor(totalMonths / 12);
                const remainingMonths = totalMonths === null ? 0 : totalMonths - fullYears * 12;
                return getPartialLeavePeriodLabel(leaveStart, leaveEnd, fullYears, remainingMonths);
            }
        }
        const leaveStart = parseDateInput(startDateValue);
        if (leaveStart) return getFullLeaveYearLabel(leaveStart, entry.segmentIndex);
    }

    if (typeof entry.year === 'number' && typeof entry.periodIndex === 'number') {
        if (key === 'insurance-days-entitlement') {
            const monthName = PERSIAN_MONTH_NAMES[entry.periodIndex - 1];
            return `سال ${toPersianDigits(entry.year)} · ماه ${toPersianDigits(entry.periodIndex)}${monthName ? ` (${monthName})` : ''}`;
        }
        if (key === 'ordinary-work-hours' || key === 'hazardous-work-hours' || key === 'young-worker-work-hours' || key === 'entitled-seniority' || key === 'official-holiday-work') {
            return `سال ${toPersianDigits(entry.year)}، دوره ${toPersianDigits(entry.periodIndex)}`;
        }
        if (key === 'friday-work' || key === 'mission-allowance') {
            return `سال ${toPersianDigits(entry.year)} · دورهٔ ${toPersianDigits(entry.periodIndex)}`;
        }
        return `سال ${toPersianDigits(entry.year)} · دوره ${toPersianDigits(entry.periodIndex)}`;
    }
    if (typeof entry.year === 'number') return `سال ${toPersianDigits(entry.year)}`;
    return `${GROUP_TOOLS.find((tool) => tool.key === key)?.title ?? key} ${toPersianDigits(index + 1)}`;
}

function compareDates(left: string, right: string) {
    const parsedLeft = parseDateInput(left);
    const parsedRight = parseDateInput(right);
    if (!parsedLeft || !parsedRight) return 0;

    return parsedLeft.year * 10000 + parsedLeft.month * 100 + parsedLeft.day
        - (parsedRight.year * 10000 + parsedRight.month * 100 + parsedRight.day);
}

function getInclusiveDayCount(start: ParsedDateInput, end: ParsedDateInput) {
    const gregorianStart = toGregorian(start.year, start.month, start.day);
    const gregorianEnd = toGregorian(end.year, end.month, end.day);
    const startDay = Date.UTC(gregorianStart.gy, gregorianStart.gm - 1, gregorianStart.gd);
    const endDay = Date.UTC(gregorianEnd.gy, gregorianEnd.gm - 1, gregorianEnd.gd);
    return Math.round((endDay - startDay) / 86400000) + 1;
}

function parseTimeToDecimalHours(value: string): number | null {
    const match = value.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;

    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours > 8 || minutes >= 60) return null;

    return hours + minutes / 60;
}

async function getPdfAssetDataUri(moduleId: number, mimeType: string, label: string): Promise<string> {
    const asset = Asset.fromModule(moduleId);
    await asset.downloadAsync();

    if (Platform.OS === 'web') {
        const response = await fetch(asset.localUri ?? asset.uri);
        if (!response.ok) throw new Error(`The ${label} could not be loaded.`);

        const bytes = new Uint8Array(await response.arrayBuffer());
        let binary = '';
        for (let offset = 0; offset < bytes.length; offset += 0x8000) {
            binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
        }
        return `data:${mimeType};base64,${btoa(binary)}`;
    }

    let localUri = asset.localUri;
    if (Platform.OS === 'android' && localUri && !/^[a-z][a-z0-9+.-]*:/i.test(localUri)) {
        const cachedAsset = Asset.fromURI(asset.uri);
        await cachedAsset.downloadAsync();
        localUri = cachedAsset.localUri;
    }
    if (!localUri) {
        throw new Error(`The ${label} is not available in local storage.`);
    }

    try {
        const base64 = await new File(localUri).base64();
        return `data:${mimeType};base64,${base64}`;
    } catch (error) {
        const reason = error instanceof Error && error.message ? `: ${error.message}` : '';
        throw new Error(`Unable to read ${label} from local storage${reason}`);
    }
}

async function getGroupCalculationPdfAssets(fontPreference: FontPreference): Promise<GroupCalculationPdfAssets> {
    if (fontPreference === 'system') {
        const logo = await getPdfAssetDataUri(require('../../../assets/images/logo-white.png'), 'image/png', 'app logo');
        return { logo };
    }

    const fontFiles = fontPreference === 'iransans'
        ? {
            regular: require('../../../assets/fonts/iransans/IRANSansX-Regular.ttf'),
            medium: require('../../../assets/fonts/iransans/IRANSansX-Medium.ttf'),
            semiBold: require('../../../assets/fonts/iransans/IRANSansX-DemiBold.ttf'),
            bold: require('../../../assets/fonts/iransans/IRANSansX-Bold.ttf'),
        }
        : fontPreference === 'vazir'
            ? {
                regular: require('../../../assets/fonts/vazir/Vazirmatn-Regular.ttf'),
                medium: require('../../../assets/fonts/vazir/Vazirmatn-Medium.ttf'),
                semiBold: require('../../../assets/fonts/vazir/Vazirmatn-SemiBold.ttf'),
                bold: require('../../../assets/fonts/vazir/Vazirmatn-Bold.ttf'),
            }
            : {
                regular: require('../../../assets/fonts/shabnam/Shabnam-FD.ttf'),
                medium: require('../../../assets/fonts/shabnam/Shabnam-Medium-FD.ttf'),
                semiBold: require('../../../assets/fonts/shabnam/Shabnam-Medium-FD.ttf'),
                bold: require('../../../assets/fonts/shabnam/Shabnam-Bold-FD.ttf'),
            };
    const [logo, regularFont, mediumFont, semiBoldFont, boldFont] = await Promise.all([
        getPdfAssetDataUri(require('../../../assets/images/logo-white.png'), 'image/png', 'app logo'),
        getPdfAssetDataUri(fontFiles.regular, 'font/ttf', 'regular font'),
        getPdfAssetDataUri(fontFiles.medium, 'font/ttf', 'medium font'),
        getPdfAssetDataUri(fontFiles.semiBold, 'font/ttf', 'semibold font'),
        getPdfAssetDataUri(fontFiles.bold, 'font/ttf', 'bold font'),
    ]);

    return { logo, regularFont, mediumFont, semiBoldFont, boldFont };
}

export default function GroupCalculationScreen() {
    const theme = useTheme();
    const { fontPreference, currencyPreference } = useAppContext();
    const { formatCurrency } = useCurrencyFormatter();
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
    const [employmentDate, setEmploymentDate] = useState(defaultStartDate);
    const [missionStartDate, setMissionStartDate] = useState(defaultStartDate);
    const [missionEndDate, setMissionEndDate] = useState(defaultEndDate);
    const [pickerTarget, setPickerTarget] = useState<DatePickerTarget | null>(null);
    const [selectedKeys, setSelectedKeys] = useState<GroupCalculationKey[]>([]);
    const [contractorWorkerCount, setContractorWorkerCount] = useState('۱');
    const [amountPaidToWorker, setAmountPaidToWorker] = useState('۰');
    const [maritalStatus, setMaritalStatus] = useState<'single' | 'married'>('single');
    const [childrenCount, setChildrenCount] = useState(0);
    const [childrenMenuVisible, setChildrenMenuVisible] = useState(false);
    const [workshopType, setWorkshopType] = useState<'classified' | 'unclassified'>('unclassified');
    const [jobGroups, setJobGroups] = useState<{ id: number; group_number: number; sort_order: number }[]>([]);
    const [selectedGroup, setSelectedGroup] = useState<number | null>(null);
    const [groupMenuVisible, setGroupMenuVisible] = useState(false);
    const [settledThrough1391, setSettledThrough1391] = useState(false);
    const [dailyOvertimeHours, setDailyOvertimeHours] = useState('01:00');
    const [timePickerVisible, setTimePickerVisible] = useState(false);
    const [fridayWorkDays, setFridayWorkDays] = useState<Record<string, string>>({});
    const [missionDays, setMissionDays] = useState<Record<string, string>>({});
    const [usedLeaveDaysBySegment, setUsedLeaveDaysBySegment] = useState<Record<number, string>>({});
    const [initialSavedLeaveDays, setInitialSavedLeaveDays] = useState('۰');
    const [shiftType, setShiftType] = useState<'morning-evening' | 'morning-evening-night' | 'morning-night-or-evening-night'>('morning-evening');
    const [dailyWorkTime, setDailyWorkTime] = useState('07:20');
    const [isWorkerInsuranceExempt, setIsWorkerInsuranceExempt] = useState(false);
    const [isInsuranceLegalBasisVisible, setIsInsuranceLegalBasisVisible] = useState(false);
    const [periodBuckets, setPeriodBuckets] = useState<SalaryPeriodBucket[]>([]);
    const [holidayDates, setHolidayDates] = useState<string[]>([]);
    const [availableYears, setAvailableYears] = useState<number[]>([]);
    const [results, setResults] = useState<GroupCalculationResult[] | null>(null);
    const [calculatedPeriodDayCount, setCalculatedPeriodDayCount] = useState<number | null>(null);
    const [expandedResults, setExpandedResults] = useState<Record<string, boolean>>({});
    const [loading, setLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState('');
    const [conflictSnackbarVisible, setConflictSnackbarVisible] = useState(false);
    const [pdfAction, setPdfAction] = useState<'preview' | 'share' | 'save' | null>(null);
    const [pdfPreviewHtml, setPdfPreviewHtml] = useState<string | null>(null);
    const [pdfPreviewVisible, setPdfPreviewVisible] = useState(false);
    const [pdfSnackbarMessage, setPdfSnackbarMessage] = useState('');
    const [pdfSnackbarVisible, setPdfSnackbarVisible] = useState(false);
    const [pdfSnackbarIsError, setPdfSnackbarIsError] = useState(true);
    const [includePdfDetails, setIncludePdfDetails] = useState(false);
    const [employerName, setEmployerName] = useState('');
    const [employerIdentifier, setEmployerIdentifier] = useState('');
    const [employeeName, setEmployeeName] = useState('');
    const [employeeNationalCode, setEmployeeNationalCode] = useState('');
    const [employeeJobTitle, setEmployeeJobTitle] = useState('');

    useEffect(() => {
        let isMounted = true;

        const loadData = async () => {
            try {
                await seedFromJsonAsset();
                const [years, groups] = await Promise.all([fetchYears(), fetchJobGroups()]);
                const buckets = await Promise.all(years.map(async (year) => {
                    const periods = await fetchPeriodsByYearId(year.id);
                    return {
                        year: year.year,
                        periods: await Promise.all(periods.map(async (period) => ({
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
                            monthly_single_allowance: period.monthly_single_allowance,
                            monthly_married_allowance: period.monthly_married_allowance,
                            monthly_housing_single: period.monthly_housing_single,
                            monthly_housing_married: period.monthly_housing_married,
                            child_allowance: period.child_allowance,
                            min_monthly_bonus: period.min_monthly_bonus,
                            max_monthly_bonus: period.max_monthly_bonus,
                            marital_allowance: period.marital_allowance,
                        }))),
                    };
                }));
                const firstYear = years[0]?.year ?? currentYear;
                const lastYear = years.at(-1)?.year ?? currentYear;
                const holidays = await fetchOfficialHolidaysBetweenDates(
                    `${firstYear}/01/01`,
                    `${lastYear}/12/${jalaaliMonthLength(lastYear, 12)}`,
                );

                if (isMounted) {
                    setPeriodBuckets(buckets);
                    setHolidayDates(holidays.map((holiday) => holiday.holiday_date));
                    setAvailableYears(years.map((year) => year.year));
                    setJobGroups(groups);
                    setSelectedGroup(groups[0]?.group_number ?? null);
                }
            } catch {
                if (isMounted) setErrorMessage('بارگذاری اطلاعات محاسبات انجام نشد.');
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        void loadData();
        return () => { isMounted = false; };
    }, [currentYear]);

    const hasFamilyAllowance = selectedKeys.includes('family-allowance');
    const allCompatibleCalculationsSelected = GROUP_CALCULATION_KEYS.every((key) => (
        selectedKeys.includes(key)
        || (key === 'night-shift-entitlement' && selectedKeys.includes('monthly-shift-work'))
        || (key === 'monthly-shift-work' && selectedKeys.includes('night-shift-entitlement'))
    ));
    const hasChildrenCount = hasFamilyAllowance || selectedKeys.includes('unused-leave-wage');
    const childrenOptions = CHILDREN_OPTIONS;
    const contractorWorkerCountValue = Number(normalizeDigits(contractorWorkerCount)) || 0;
    const contractorWorkerCountIsSafe = Number.isSafeInteger(contractorWorkerCountValue);
    const hasInsuranceDays = selectedKeys.includes('insurance-days-entitlement');
    const hasInsuranceCalculation = selectedKeys.some(isInsuranceCalculationKey);
    const hasPayrollDailyWorkTime = selectedKeys.some((key) => PAYROLL_DAILY_WORK_KEYS.includes(key));
    const hasDailyWorkTime = hasPayrollDailyWorkTime || hasInsuranceDays;
    const hasEmploymentBasedCalculation = selectedKeys.some((key) => [
        'entitled-seniority',
        'overtime-entitlement',
        'night-shift-entitlement',
        'monthly-shift-work',
        'end-of-service-years',
        'bonus-entitlement',
        'official-holiday-work',
        'friday-work',
        'mission-allowance',
        'unused-leave-wage',
    ].includes(key));
    const hasRangeBasedEmploymentCalculation = selectedKeys.some((key) => [
        'entitled-seniority',
        'overtime-entitlement',
        'night-shift-entitlement',
        'monthly-shift-work',
        'end-of-service-years',
        'bonus-entitlement',
        'official-holiday-work',
        'friday-work',
        'unused-leave-wage',
    ].includes(key));
    const employmentMustPrecedeRangeStart = selectedKeys.some((key) => [
        'overtime-entitlement',
        'night-shift-entitlement',
        'monthly-shift-work',
        'bonus-entitlement',
        'official-holiday-work',
        'friday-work',
    ].includes(key));
    const hasShiftWork = selectedKeys.includes('monthly-shift-work');
    const hasOvertime = selectedKeys.includes('overtime-entitlement');
    const hasFridayWork = selectedKeys.includes('friday-work');
    const hasMissionAllowance = selectedKeys.includes('mission-allowance');
    const hasSharedDateRange = selectedKeys.some((key) => key !== 'mission-allowance');
    const parsedRangeStart = parseDateInput(startDate);
    const parsedRangeEnd = parseDateInput(endDate);
    const parsedMissionStart = parseDateInput(missionStartDate);
    const parsedMissionEnd = parseDateInput(missionEndDate);
    const hasMaritalStatusDifference = parsedRangeStart && parsedRangeEnd
        ? getMissionAllowancePeriodRanges(parsedRangeStart, parsedRangeEnd, periodBuckets).some((range) => {
            const period = periodBuckets
                .find((bucket) => bucket.year === range.year)
                ?.periods.find((item) => item.period_index === range.periodIndex);
            if (!period) return false;

            const housingAllowanceDiffers = selectedKeys.includes('housing-allowance')
                && period.monthly_housing_single != null
                && period.monthly_housing_married != null
                && period.monthly_housing_single !== period.monthly_housing_married;
            const monthlyAllowanceDiffers = selectedKeys.includes('monthly-allowance')
                && period.monthly_single_allowance != null
                && period.monthly_married_allowance != null
                && period.monthly_single_allowance !== period.monthly_married_allowance;

            return housingAllowanceDiffers || monthlyAllowanceDiffers;
        })
        : false;
    const hasMaritalAllowance = selectedKeys.includes('unused-leave-wage') || hasMaritalStatusDifference;
    const fridayPeriods = hasFridayWork && parsedRangeStart && parsedRangeEnd
        ? calculateAvailableFridaysByPeriod(parsedRangeStart, parsedRangeEnd, periodBuckets)
        : [];
    const missionPeriods = hasMissionAllowance && parsedMissionStart && parsedMissionEnd
        ? getMissionAllowancePeriodRanges(parsedMissionStart, parsedMissionEnd, periodBuckets)
        : [];
    const missionDaysTotal = missionPeriods.reduce((total, period) => (
        total + (Number(normalizeDigits(missionDays[`${period.year}:${period.periodIndex}`] ?? DEFAULT_MISSION_DAYS)) || 0)
    ), 0);
    const leaveMonthsWorked = parsedRangeStart && parsedRangeEnd
        ? calculateUnusedLeaveMonths(parsedRangeStart, parsedRangeEnd)
        : null;
    const leaveFullYears = leaveMonthsWorked !== null && leaveMonthsWorked > 12
        ? Math.floor(leaveMonthsWorked / 12)
        : 0;
    const leaveRemainingMonths = leaveMonthsWorked !== null && leaveMonthsWorked > 12
        ? leaveMonthsWorked % 12
        : leaveMonthsWorked ?? 0;
    const leaveSegmentCount = leaveFullYears + (leaveRemainingMonths > 0 ? 1 : 0);
    const hasLeaveCalculation = selectedKeys.includes('unused-leave-entitlement')
        || selectedKeys.includes('unused-leave-wage');

    const changeInitialSavedLeaveDays = (delta: number) => {
        setInitialSavedLeaveDays((current) => addLeaveDays(current, delta));
    };

    const changeUsedLeaveDays = (segmentIndex: number, delta: number) => {
        setUsedLeaveDaysBySegment((current) => ({
            ...current,
            [segmentIndex]: addLeaveDays(current[segmentIndex] ?? '۰', delta),
        }));
    };

    const toggleCalculation = (key: GroupCalculationKey) => {
        const isSelecting = !selectedKeys.includes(key);
        const conflictsWithNightShift = key === 'monthly-shift-work' && selectedKeys.includes('night-shift-entitlement');
        const conflictsWithShiftWork = key === 'night-shift-entitlement' && selectedKeys.includes('monthly-shift-work');

        if (isSelecting && (conflictsWithNightShift || conflictsWithShiftWork)) {
            setErrorMessage('');
            setConflictSnackbarVisible(true);
            setResults(null);
            return;
        }

        setSelectedKeys((current) => current.includes(key)
            ? current.filter((item) => item !== key)
            : [...current, key]);
        setResults(null);
        setErrorMessage('');
    };

    const toggleAllCalculations = () => {
        if (allCompatibleCalculationsSelected) {
            setSelectedKeys([]);
            setResults(null);
            setErrorMessage('');
            return;
        }

        const selectedNightShift = selectedKeys.includes('night-shift-entitlement');
        const excludedKey = selectedNightShift ? 'monthly-shift-work' : 'night-shift-entitlement';
        setSelectedKeys(GROUP_CALCULATION_KEYS.filter((key) => key !== excludedKey));
        setResults(null);
        setErrorMessage('');
        setConflictSnackbarVisible(true);
    };

    const selectDate = (value: string) => {
        if (pickerTarget === 'employment') {
            if (hasRangeBasedEmploymentCalculation && compareDates(value, endDate) > 0) {
                setErrorMessage('تاریخ استخدام باید برابر یا قبل از تاریخ پایان باشد.');
                setPickerTarget(null);
                return;
            }
            if (employmentMustPrecedeRangeStart && compareDates(value, startDate) > 0) {
                setErrorMessage('تاریخ استخدام باید برابر یا قبل از شروع بازه باشد.');
                setPickerTarget(null);
                return;
            }
            if (hasMissionAllowance && compareDates(value, missionStartDate) > 0) {
                setErrorMessage('تاریخ استخدام نمی‌تواند بعد از شروع مأموریت باشد.');
                setPickerTarget(null);
                return;
            }
            setEmploymentDate(value);
            if (Number(normalizeDigits(value.split('/')[0] ?? '0')) > 1391) setSettledThrough1391(false);
        } else if (pickerTarget === 'start') {
            setStartDate(value);
            setEmploymentDate(value);
            if (Number(normalizeDigits(value.split('/')[0] ?? '0')) > 1391) setSettledThrough1391(false);
            if (compareDates(value, endDate) > 0) setEndDate(value);
        } else if (pickerTarget === 'end') {
            if (compareDates(value, startDate) < 0) {
                setErrorMessage('تاریخ پایان باید برابر یا پس از تاریخ شروع باشد.');
                setPickerTarget(null);
                return;
            }
            setEndDate(value);
        } else if (pickerTarget === 'mission-start') {
            if (compareDates(value, employmentDate) < 0) {
                setErrorMessage('شروع مأموریت نمی‌تواند پیش از تاریخ استخدام باشد.');
                setPickerTarget(null);
                return;
            }
            if (compareDates(value, missionEndDate) > 0) {
                setErrorMessage('شروع مأموریت نمی‌تواند بعد از پایان آن باشد.');
                setPickerTarget(null);
                return;
            }
            setMissionStartDate(value);
            setMissionDays({});
        } else if (pickerTarget === 'mission-end') {
            if (compareDates(value, missionStartDate) < 0) {
                setErrorMessage('پایان مأموریت نمی‌تواند پیش از شروع آن باشد.');
                setPickerTarget(null);
                return;
            }
            setMissionEndDate(value);
            setMissionDays({});
        }
        setPickerTarget(null);
        setResults(null);
        setErrorMessage('');
    };

    const handleCalculate = () => {
        const start = parseDateInput(startDate);
        const end = parseDateInput(endDate);
        const employment = parseDateInput(employmentDate);
        const missionStart = parseDateInput(missionStartDate);
        const missionEnd = parseDateInput(missionEndDate);
        const normalizedChildrenCount = childrenCount;
        const normalizedOvertimeHours = parseTimeToDecimalHours(dailyOvertimeHours);
        const dailyWorkHours = parseTimeToDecimalHours(dailyWorkTime);

        if (selectedKeys.includes('night-shift-entitlement') && selectedKeys.includes('monthly-shift-work')) {
            setErrorMessage('');
            setConflictSnackbarVisible(true);
            setResults(null);
            return;
        }

        if (selectedKeys.length === 0) {
            setErrorMessage('برای انجام محاسبات جامع، دست‌کم یک آیتم محاسباتی را انتخاب کنید.');
            setResults(null);
            return;
        }
        const workerCount = Number(normalizeDigits(contractorWorkerCount));
        if (!Number.isSafeInteger(workerCount) || workerCount <= 0) {
            setErrorMessage('تعداد کارگران باید یک عدد صحیح بزرگ‌تر از صفر باشد.');
            setResults(null);
            return;
        }
        if (!start || !end || compareDates(startDate, endDate) > 0) {
            setErrorMessage('بازهٔ زمانی واردشده معتبر نیست.');
            setResults(null);
            return;
        }
        if (
            hasChildrenCount
            && (!Number.isInteger(normalizedChildrenCount)
                || normalizedChildrenCount < 0
                || normalizedChildrenCount > 12)
        ) {
            setErrorMessage('تعداد فرزند باید بین ۰ تا ۱۲ باشد.');
            setResults(null);
            return;
        }
        if (hasRangeBasedEmploymentCalculation && (!employment || compareDates(employmentDate, endDate) > 0)) {
            setErrorMessage('تاریخ استخدام باید معتبر و برابر یا قبل از تاریخ پایان باشد.');
            setResults(null);
            return;
        }
        if (employmentMustPrecedeRangeStart && compareDates(employmentDate, startDate) > 0) {
            setErrorMessage('تاریخ استخدام باید برابر یا قبل از شروع بازه باشد.');
            setResults(null);
            return;
        }
        if (hasMissionAllowance && (
            !missionStart
            || !missionEnd
            || compareDates(missionStartDate, missionEndDate) > 0
            || compareDates(employmentDate, missionStartDate) > 0
        )) {
            setErrorMessage('بازهٔ مأموریت یا تاریخ استخدام معتبر نیست.');
            setResults(null);
            return;
        }
        if (hasEmploymentBasedCalculation && workshopType === 'classified' && selectedGroup == null) {
            setErrorMessage('برای کارگاه طبقه‌بندی‌شده گروه شغلی را انتخاب کنید.');
            setResults(null);
            return;
        }
        if (hasOvertime && (normalizedOvertimeHours === null || normalizedOvertimeHours <= 0)) {
            setErrorMessage('ساعات اضافه‌کاری روزانه باید بیشتر از صفر باشد.');
            setResults(null);
            return;
        }
        if (hasOvertime && normalizedOvertimeHours !== null && normalizedOvertimeHours > 8) {
            setErrorMessage('تعداد ساعات اضافه‌کاری نمی‌تواند بیشتر از ۸ ساعت باشد.');
            setResults(null);
            return;
        }
        if (hasInsuranceDays && (
            dailyWorkHours === null
            || dailyWorkHours < 1 / 60
            || dailyWorkHours > 7 + 20 / 60
        )) {
            setErrorMessage('ساعات کاری روزانه باید بین ۰۰:۰۱ تا ۰۷:۲۰ باشد.');
            setResults(null);
            return;
        }
        const normalizedUsedLeaveDays = Array.from({ length: leaveSegmentCount }, (_, index) =>
            Number(normalizeDigits(usedLeaveDaysBySegment[index] ?? '۰')),
        );
        const normalizedInitialSavedLeaveDays = Number(normalizeDigits(initialSavedLeaveDays));
        if (hasLeaveCalculation && (
            leaveMonthsWorked === null
            || normalizedUsedLeaveDays.some((days) => !Number.isFinite(days) || days < 0)
            || !Number.isFinite(normalizedInitialSavedLeaveDays)
            || normalizedInitialSavedLeaveDays < 0
        )) {
            setErrorMessage('روزهای مرخصی مصرف‌شده و ذخیرهٔ انتقالی باید صفر یا بیشتر باشند.');
            setResults(null);
            return;
        }
        const fridayWorkDaysByPeriod = Object.fromEntries(fridayPeriods.map((period) => {
            const key = `${period.year}:${period.periodIndex}`;
            return [key, Number(normalizeDigits(fridayWorkDays[key] ?? toPersianDigits(period.availableFridays)))];
        }));
        if (hasFridayWork && (fridayPeriods.length === 0 || fridayPeriods.some((period) => {
            const value = fridayWorkDaysByPeriod[`${period.year}:${period.periodIndex}`];
            return !Number.isInteger(value) || value < 0 || value > period.availableFridays;
        }))) {
            setErrorMessage('تعداد جمعه‌کاری هر دوره باید بین صفر و جمعه‌های قابل‌دسترس همان دوره باشد.');
            setResults(null);
            return;
        }
        const missionDaysByPeriod = Object.fromEntries(missionPeriods.map((period) => {
            const key = `${period.year}:${period.periodIndex}`;
            return [key, Number(normalizeDigits(missionDays[key] ?? DEFAULT_MISSION_DAYS))];
        }));
        const missionPeriodDays = missionPeriods.reduce((total, period) => total + period.availableDays, 0);
        if (hasMissionAllowance && (
            missionPeriods.length === 0
            || !employment
            || !missionStart
            || !missionEnd
            || missionPeriodDays !== getInclusiveDayCount(missionStart, missionEnd)
            || missionPeriods.some((period) => {
                const value = missionDaysByPeriod[`${period.year}:${period.periodIndex}`];
                return !Number.isInteger(value) || value < 0 || value > period.availableDays;
            })
            || !Object.values(missionDaysByPeriod).some((days) => days > 0)
        )) {
            setErrorMessage('برای هر دوره تعداد روز مأموریت را در بازهٔ مجاز وارد کنید.');
            setResults(null);
            return;
        }

        const calculationResults = calculateGroupItems(getOrderedGroupCalculationKeys(selectedKeys), {
            startDate: start,
            endDate: end,
            missionStartDate: missionStart ?? start,
            missionEndDate: missionEnd ?? end,
            periodBuckets,
            officialHolidayDates: holidayDates,
            maritalStatus,
            childrenCount: normalizedChildrenCount || 0,
            dailyWorkMinutes: getDailyWorkMinutes(dailyWorkTime),
            dailyWorkHours: dailyWorkHours ?? 0,
            employmentStartDate: employment ?? start,
            workshopType,
            jobGroupNumber: selectedGroup ?? undefined,
            settledThrough1391,
            dailyOvertimeHours: normalizedOvertimeHours || 0,
            shiftType,
            fridayWorkDaysByPeriod,
            missionDaysByPeriod,
            usedLeaveDaysBySegment: normalizedUsedLeaveDays,
            initialSavedLeaveDays: normalizedInitialSavedLeaveDays || 0,
        });
        setResults(calculationResults);
        setCalculatedPeriodDayCount(getInclusiveDayCount(start, end));
        setErrorMessage('');
    };

    const handleExportPdf = async (action: 'preview' | 'share' | 'save' = 'share') => {
        if (!results) return;
        if (action !== 'preview') setPdfPreviewVisible(false);

        const wageTotalResults = getWageTotalResults(results);
        const excludedBonusItems = getExcludedBonusItemTitles(results);
        const contractorWorkerCountValue = Number(normalizeDigits(contractorWorkerCount));
        const wageTotalHasErrors = wageTotalResults.some((result) => result.error);
        const wageTotalAmount = wageTotalResults.reduce((total, result) => total + getResultAmount(result), 0);
        const employerInsuranceTotal = getEmployerInsuranceTotal(wageTotalResults);
        const contractorTotals = calculateContractorMonthlyTotals(
            wageTotalAmount,
            employerInsuranceTotal,
            wageTotalHasErrors,
            calculatedPeriodDayCount,
            contractorWorkerCountValue,
        );
        const amountPaidValue = displayCurrencyToRial(
            Number(normalizeDigits(amountPaidToWorker)),
            currencyPreference,
        );
        const workerClaims = calculateWorkerClaimsAfterPayments(
            wageTotalAmount,
            amountPaidValue,
            contractorTotals.wageTotalError,
        );
        const contractorWorkerCountLabel = contractorWorkerCount.trim().length > 0
            ? contractorWorkerCount
            : 'وارد نشده';
        const wageTotal: GroupCalculationPdfWageTotal | undefined = wageTotalResults.length > 0
            ? contractorTotals.wageTotalError
                ? {
                    amount: '',
                    error: contractorTotals.wageTotalError,
                    contractorTotal30Error: contractorTotals.contractorTotal30Error,
                    contractorTotalError: contractorTotals.contractorTotalError,
                    contractorWorkerCount: contractorWorkerCountLabel,
                    excludedBonusItems,
                    amountPaid: Number.isSafeInteger(amountPaidValue) && amountPaidValue >= 0
                        ? formatCurrency(amountPaidValue)
                        : 'مبلغ نامعتبر',
                    remainingClaim: workerClaims.error ? undefined : formatCurrency(workerClaims.remainingClaim),
                    finalClaim: workerClaims.error ? undefined : formatCurrency(workerClaims.finalClaim),
                    claimError: workerClaims.error,
                }
                : {
                    amount: formatCurrency(wageTotalAmount),
                    contractorTotal30: contractorTotals.contractorTotal30Error
                        ? undefined
                        : formatCurrency(contractorTotals.contractorTotal30),
                    employerInsurance30: formatCurrency(contractorTotals.employerInsurance30),
                    contractorTotal30Error: contractorTotals.contractorTotal30Error,
                    contractorWorkerCount: contractorWorkerCountLabel,
                    contractorTotal: contractorTotals.contractorTotalError
                        ? undefined
                        : formatCurrency(contractorTotals.contractorTotal),
                    employerInsurance31: formatCurrency(contractorTotals.employerInsurance31),
                    contractorTotalError: contractorTotals.contractorTotalError,
                    excludedBonusItems,
                    amountPaid: Number.isSafeInteger(amountPaidValue) && amountPaidValue >= 0
                        ? formatCurrency(amountPaidValue)
                        : 'مبلغ نامعتبر',
                    remainingClaim: workerClaims.error ? undefined : formatCurrency(workerClaims.remainingClaim),
                    finalClaim: workerClaims.error ? undefined : formatCurrency(workerClaims.finalClaim),
                    claimError: workerClaims.error,
                }
            : undefined;

        const pdfSections: GroupCalculationPdfSection[] = results.map((result) => {
            const detailBreakdown = result.key === 'end-of-service-years' && result.breakdown.length > 0
                ? (() => {
                    const lastPeriod = result.breakdown.at(-1);
                    if (!isRecord(lastPeriod)) return result.breakdown;
                    const dailyMinimumWage = typeof lastPeriod.dailyMinimumWage === 'number'
                        ? lastPeriod.dailyMinimumWage
                        : 0;
                    const dailySeniority = typeof lastPeriod.dailySeniority === 'number'
                        ? lastPeriod.dailySeniority
                        : 0;
                    return [{
                        totalMonthEquivalent: result.breakdown.reduce<number>(
                            (total, item) => total + (isRecord(item) && typeof item.monthEquivalent === 'number' ? item.monthEquivalent : 0),
                            0,
                        ),
                        finalDailyMinimumWage: dailyMinimumWage,
                        finalDailySeniority: dailySeniority,
                        finalDailyWage: dailyMinimumWage + dailySeniority,
                    }];
                })()
                : result.breakdown;
            const resultAmount = getResultAmount(result);
            const formattedValue = result.unit === 'ریال'
                ? formatCurrencyAmount(resultAmount, currencyPreference)
                : toPersianDigits(Number.isInteger(resultAmount) ? String(resultAmount) : resultAmount.toFixed(2));
            const roundedInsuranceBaseAmount = Math.round(getInsuranceBaseAmount(result));
            const workerInsuranceAmount = isWorkerInsuranceExempt
                ? 0
                : Math.round(roundedInsuranceBaseAmount * 0.07);
            const employerInsuranceAmount = Math.round(roundedInsuranceBaseAmount * 0.23);
            const finalClaimAmount = roundedInsuranceBaseAmount - workerInsuranceAmount;
            const summaryLabel = result.key === 'monthly-shift-work'
                ? `${RESULT_SUMMARY_LABELS[result.key]} (${SHIFT_TYPE_OPTIONS.find((option) => option.value === shiftType)?.label ?? 'صبح و عصر'})`
                : result.key === 'entitled-seniority' && workshopType === 'classified'
                    ? 'پایه سنوات استحقاقی گروه شغلی (کل دوره)'
                    : result.key === 'entitled-seniority'
                        ? 'پایه سنوات استحقاقی (کل دوره)'
                    : RESULT_SUMMARY_LABELS[result.key];
            const detailsTitle = result.key === 'unused-leave-wage'
                || result.key === 'unused-leave-entitlement'
                || result.key === 'end-of-service-years'
                || result.key === 'official-holidays-in-range'
                ? 'جزئیات محاسبه'
                : result.key === 'entitled-seniority'
                    ? 'جزئیات بازه‌های محاسبه'
                    : result.key === 'insurance-days-entitlement'
                        ? 'جزئیات ماه‌ها'
                    : 'جزئیات دوره‌ها';
            const details: GroupCalculationPdfDetail[] = [];

            if (includePdfDetails && !result.error && result.key === 'unused-leave-entitlement') {
                details.push({
                    title: 'خلاصه محاسبه',
                    rows: [
                        {
                            label: 'کل استحقاق',
                            value: `${formatBreakdownNumber(result.breakdown.reduce<number>(
                                (total, item) => total + (isRecord(item) && typeof item.entitlementDays === 'number' ? item.entitlementDays : 0),
                                0,
                            ))} روز`,
                        },
                        {
                            label: 'کل مرخصی استفاده‌شده',
                            value: `${formatBreakdownNumber(result.breakdown.reduce<number>(
                                (total, item) => total + (isRecord(item) && typeof item.usedLeaveDays === 'number' ? item.usedLeaveDays : 0),
                                0,
                            ))} روز`,
                        },
                        { label: 'ذخیره نهایی', value: `${formatBreakdownNumber(result.value)} روز` },
                    ],
                });
            }

            if (includePdfDetails && !result.error) {
                detailBreakdown.forEach((entry, index) => {
                    const detailRecord = isRecord(entry)
                        ? getInsurancePeriodDetailRecord(result.key, entry)
                        : null;
                    const title = detailRecord
                        ? formatBreakdownTitle(result.key, detailRecord, index, startDate, endDate)
                        : `${getResultTitle(result, workshopType)} ${toPersianDigits(index + 1)}`;
                    const fields = detailRecord
                        ? getBreakdownDetailFields(result.key, detailRecord, workshopType)
                        : [];

                    details.push({
                        title,
                        rows: detailRecord
                            ? fields.map((field) => ({
                                label: field.label,
                                value: formatBreakdownDetail(field, detailRecord, result.key, currencyPreference),
                            }))
                            : [],
                    });
                });
            }

            return {
                title: getResultTitle(result, workshopType),
                summaryLabel,
                amount: result.unit === 'ریال' ? formattedValue : `${formattedValue} ${result.unit}`,
                insuranceSummary: isInsuranceCalculationKey(result.key) && !result.error
                    ? {
                        baseAmount: formatCurrency(roundedInsuranceBaseAmount),
                        workerAmount: formatCurrency(workerInsuranceAmount),
                        employerAmount: formatCurrency(employerInsuranceAmount),
                        netAmount: formatCurrency(finalClaimAmount),
                        workerExempt: isWorkerInsuranceExempt,
                    }
                    : undefined,
                error: result.error,
                detailsTitle,
                details,
            };
        });
        const today = new Date();
        const jalaliToday = toJalaali(today.getFullYear(), today.getMonth() + 1, today.getDate());
        const preparedAtMetadata = [
            {
                section: 'تاریخ تهیه',
                label: 'تاریخ شمسی',
                value: formatDate(`${jalaliToday.jy}/${jalaliToday.jm}/${jalaliToday.jd}`),
            },
            {
                section: 'تاریخ تهیه',
                label: 'تاریخ میلادی',
                value: toPersianDigits(`${today.getFullYear()}/${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}`),
            },
            {
                section: 'تاریخ تهیه',
                label: 'ساعت تهیه',
                value: toPersianDigits(`${String(today.getHours()).padStart(2, '0')}:${String(today.getMinutes()).padStart(2, '0')}`),
            },
        ];
        const metadata: GroupCalculationPdfMetadata[] = [
            ...preparedAtMetadata,
            {
                section: 'آنالیز حقوق و مزایای ماهیانه برای پیمانکاران',
                label: 'تعداد کارگران',
                value: contractorWorkerCountLabel,
            },
        ];
        if (results.some((result) => !result.error && isInsuranceCalculationKey(result.key))) {
            metadata.push({
                section: 'محاسبات بیمه',
                label: 'معافیت از سهم بیمهٔ کارگر',
                value: isWorkerInsuranceExempt ? 'فعال' : 'غیرفعال',
            });
            if (isWorkerInsuranceExempt) {
                metadata.push({
                    section: 'محاسبات بیمه',
                    label: 'مبنای قانونی معافیت',
                    value: 'اسرا، آزادگان و جانبازان براساس تبصرهٔ ۳ مادهٔ ۳۷ قانون جامع خدمات‌رسانی به ایثارگران مصوب ۱۳۹۱، و فرزندان شهید مطابق بند «ز» مادهٔ ۸۸ قانون برنامهٔ ششم توسعه که در بند ۲ قسمت «ت» مادهٔ ۳۱ قانون برنامهٔ هفتم توسعه تنفیذ شده است، از پرداخت حق بیمهٔ سهم کارگر معاف هستند.',
                });
            }
        }
        const employeeMetadata = [
            { label: 'نام', value: employeeName },
            { label: 'کد ملی', value: employeeNationalCode },
            { label: 'عنوان شغلی', value: employeeJobTitle },
        ].filter((item) => item.value.trim().length > 0);
        metadata.push(...employeeMetadata.map((item) => ({
            ...item,
            section: 'مشخصات کارگر',
        })));
        const employerMetadata = [
            { label: 'نام شخص حقوقی یا حقیقی', value: employerName },
            { label: 'شناسه ملی یا کد ملی', value: employerIdentifier },
        ].filter((item) => item.value.trim().length > 0);
        metadata.push(...employerMetadata.map((item) => ({
            ...item,
            section: 'مشخصات کارفرما',
        })));

        if (hasSharedDateRange) {
            metadata.push(
                { section: 'بازهٔ مشترک محاسبات', label: 'از تاریخ', value: formatDate(startDate) },
                { section: 'بازهٔ مشترک محاسبات', label: 'تا تاریخ', value: formatDate(endDate) },
            );
        }

        if (hasEmploymentBasedCalculation) {
            metadata.push(
                { section: 'سابقه و پایه سنوات', label: 'تاریخ استخدام', value: formatDate(employmentDate) },
                { section: 'سابقه و پایه سنوات', label: 'نوع کارگاه', value: getWorkshopTypeLabel(workshopType) },
            );
            if (workshopType === 'classified') {
                metadata.push({
                    section: 'سابقه و پایه سنوات',
                    label: 'گروه شغلی',
                    value: selectedGroup === null ? 'انتخاب گروه شغلی' : `گروه ${toPersianDigits(selectedGroup)}`,
                });
            }
            if ((parseDateInput(employmentDate)?.year ?? 0) <= 1391) {
                metadata.push({
                    section: 'سابقه و پایه سنوات',
                    label: 'وضعیت تصفیه حساب تا پایان سال ۱۳۹۱',
                    value: settledThrough1391 ? 'تصفیه حساب شده' : 'تصفیه حساب نشده',
                });
            }
        }

        if (hasMaritalAllowance) {
            metadata.push({
                section: 'وضعیت تأهل',
                label: 'وضعیت تأهل',
                value: MARITAL_OPTIONS.find((option) => option.value === maritalStatus)?.label ?? '',
            });
        }

        if (hasChildrenCount) {
            metadata.push({
                section: 'تعداد فرزندان واجد شرایط',
                label: 'تعداد فرزندان واجد شرایط',
                value: `${toPersianDigits(childrenCount)} فرزند`,
            });
        }

        if (hasLeaveCalculation) {
            metadata.push({
                section: 'مرخصی ذخیره‌شده و مزد مرخصی',
                label: 'ذخیره مرخصی از سال‌های قبل',
                value: initialSavedLeaveDays,
            });
            for (let index = 0; index < leaveSegmentCount; index += 1) {
                const isPartial = index >= leaveFullYears;
                const segmentLabel = isPartial && parsedRangeStart && parsedRangeEnd
                    ? getPartialLeavePeriodLabel(parsedRangeStart, parsedRangeEnd, leaveFullYears, leaveRemainingMonths)
                    : parsedRangeStart
                        ? getFullLeaveYearLabel(parsedRangeStart, index + 1)
                        : `سال کامل ${toPersianDigits(index + 1)}`;
                metadata.push({
                    section: 'مرخصی ذخیره‌شده و مزد مرخصی',
                    label: `مرخصی استفاده‌شده در بخش ${segmentLabel}`,
                    value: usedLeaveDaysBySegment[index] ?? '۰',
                });
            }
        }

        if (hasOvertime) {
            metadata.push({
                section: 'اضافه‌کاری استحقاقی',
                label: 'ساعت اضافه‌کاری روزانهٔ کارگر',
                value: toPersianDigits(dailyOvertimeHours),
            });
        }

        if (hasShiftWork) {
            const selectedShift = SHIFT_TYPE_OPTIONS.find((option) => option.value === shiftType) ?? SHIFT_TYPE_OPTIONS[0];
            metadata.push({
                section: 'نوبت‌کاری ماهانه',
                label: 'نوع نوبت کاری',
                value: `${selectedShift.label} ${selectedShift.percentage}`,
            });
        }

        if (hasFridayWork) {
            for (const period of fridayPeriods) {
                const key = `${period.year}:${period.periodIndex}`;
                metadata.push({
                    section: 'جمعه‌کاری',
                    label: `تعداد جمعه‌کاری کارگر در سال ${toPersianDigits(period.year)} دوره ${toPersianDigits(period.periodIndex)}`,
                    value: fridayWorkDays[key] ?? toPersianDigits(period.availableFridays),
                });
            }
        }

        if (hasMissionAllowance) {
            metadata.push(
                { section: 'فوق‌العاده مأموریت', label: 'از تاریخ', value: formatDate(missionStartDate) },
                { section: 'فوق‌العاده مأموریت', label: 'تا تاریخ', value: formatDate(missionEndDate) },
            );
            for (const period of missionPeriods) {
                const key = `${period.year}:${period.periodIndex}`;
                metadata.push({
                    section: 'فوق‌العاده مأموریت',
                    label: `تعداد روزهای مأموریت سال ${toPersianDigits(period.year)} دوره ${toPersianDigits(period.periodIndex)}`,
                    value: missionDays[key] ?? DEFAULT_MISSION_DAYS,
                });
            }
        }

        if (hasDailyWorkTime) {
            const dailyWorkLabel = hasPayrollDailyWorkTime
                ? getDailyWorkMinutes(dailyWorkTime) === FULL_TIME_DAILY_MINUTES
                    ? 'ساعات کارکرد روزانه بر اساس ماده ۵۱ قانون کار'
                    : 'ساعات کارکرد روزانه بر اساس ماده ۳۹ قانون کار'
                : 'ساعات کاری روزانه';
            metadata.push({
                section: 'ساعات کار روزانه',
                label: hasPayrollDailyWorkTime && hasInsuranceDays
                    ? 'ساعات کارکرد روزانه (محاسبات مزدی و روزهای بیمه)'
                    : dailyWorkLabel,
                value: toPersianDigits(dailyWorkTime),
            });
        }

        setPdfAction(action);
        setPdfSnackbarVisible(false);
        try {
            const pdfAssets = await getGroupCalculationPdfAssets(fontPreference);
            const html = buildGroupCalculationPdfHtml(pdfSections, metadata, includePdfDetails, pdfAssets, wageTotal);
            if (action === 'preview') {
                if (Platform.OS === 'web') {
                    await Print.printAsync({ html });
                } else {
                    setPdfPreviewHtml(html);
                    setPdfPreviewVisible(true);
                }
                return;
            }
            if (Platform.OS === 'web') {
                await Print.printAsync({ html });
                return;
            }
            const canShare = await Sharing.isAvailableAsync();
            const file = await Print.printToFileAsync({
                html,
                base64: Platform.OS === 'android' && action === 'share' && canShare,
            });

            if (action === 'save') {
                const savedFile = await saveFileToDefaultLocation(file.uri, {
                    fileName: `pahnavar-kar-payslip-${new Date().toISOString().replace(/[:.]/g, '-')}.pdf`,
                    mimeType: 'application/pdf',
                });
                if (savedFile.location === 'downloads') {
                    setPdfSnackbarMessage('فیش PDF در پوشهٔ Downloads/PahnavarKar ذخیره شد.');
                } else {
                    setPdfSnackbarMessage('فیش PDF در پوشهٔ پهناورکار در برنامهٔ Files ذخیره شد.');
                }
                setPdfSnackbarIsError(false);
                setPdfSnackbarVisible(true);
            } else if (canShare) {
                let shareUri = file.uri;
                if (Platform.OS === 'android') {
                    if (!file.base64) {
                        throw new Error('The generated PDF did not include its file data.');
                    }

                    const shareFile = new File(Paths.document, 'pahnavar-kar-calculation.pdf');
                    shareFile.create({ overwrite: true });
                    shareFile.write(file.base64, { encoding: EncodingType.Base64 });
                    shareUri = shareFile.uri;
                }

                await Sharing.shareAsync(shareUri, {
                    mimeType: 'application/pdf',
                    UTI: '.pdf',
                    dialogTitle: 'اشتراک فیش محاسبات',
                });
            } else {
                await Print.printAsync({ html });
            }
        } catch (error) {
            if (action === 'save' && error instanceof NativeFileStorageUnavailableError) {
                setPdfSnackbarMessage('ذخیرهٔ مستقیم در این نسخه در دسترس نیست. برای ذخیره در Downloads، Development Build جدید نصب کنید؛ در Expo Go از «اشتراک‌گذاری» استفاده کنید.');
                setPdfSnackbarIsError(true);
                setPdfSnackbarVisible(true);
                return;
            }

            console.error(
                action === 'save' ? 'Unable to save group calculation PDF:' : 'Unable to export group calculation PDF:',
                error,
            );
            const reason = error instanceof Error && error.message ? ` (${error.message})` : '';
            setPdfSnackbarMessage(
                action === 'save'
                    ? `ذخیرهٔ فیش PDF انجام نشد${reason}`
                    : `ساخت یا اشتراک PDF انجام نشد${reason}`,
            );
            setPdfSnackbarIsError(true);
            setPdfSnackbarVisible(true);
        } finally {
            setPdfAction(null);
        }
    };

    return (
        <ThemedView style={styles.container}>
            <ScrollView
                contentContainerStyle={[
                    styles.content,
                    { paddingTop: insets.top + Spacing.three, paddingBottom: insets.bottom + Spacing.four },
                ]}
                showsVerticalScrollIndicator={false}
            >
                <View style={styles.intro}>
                    <View style={styles.introHeader}>
                        <ThemedText type="bodyBold">انتخاب آیتم‌های محاسباتی</ThemedText>
                        <Button
                            mode="outlined"
                            compact
                            icon={allCompatibleCalculationsSelected ? 'checkbox-multiple-blank-outline' : 'checkbox-multiple-marked-outline'}
                            onPress={toggleAllCalculations}
                            labelStyle={styles.selectAllLabel}
                        >
                            {allCompatibleCalculationsSelected ? 'پاک‌کردن همه' : 'انتخاب همه'}
                        </Button>
                    </View>
                    <View style={[styles.introGuidance, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}>
                        <ThemedText type="small" style={[styles.introGuidanceText, { color: theme.textSecondary }]}>
                            {hasMissionAllowance && hasSharedDateRange
                                ? 'بازهٔ مشترک برای سایر محاسبات است؛ بازهٔ فوق‌العاده مأموریت جداگانه تعیین می‌شود.'
                                : hasMissionAllowance
                                    ? 'بازهٔ مأموریت را در بخش اختصاصی فوق‌العاده مأموریت وارد کنید.'
                                    : 'موارد موردنیاز را انتخاب کنید و بازهٔ مشترک را یک‌بار وارد کنید.'}
                        </ThemedText>
                        {selectedKeys.some((key) => WAGE_TOTAL_EXCLUDED_KEYS.includes(key)) ? (
                            <ThemedText type="small" style={[styles.introGuidanceText, { color: theme.textSecondary }]}>
                                جمع نتایج اقلام مزدی شامل آیتم‌های حداقل و حداکثر عیدی و پاداش نمی‌شود.
                            </ThemedText>
                        ) : null}
                    </View>
                </View>

                <Card style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                    <Card.Content style={styles.selectionList}>
                        {GROUP_TOOLS.map((tool, index) => {
                            const key = tool.key as GroupCalculationKey;
                            const checked = selectedKeys.includes(key);
                            return (
                                <View key={key}>
                                    <ToolListItem
                                        tool={tool}
                                        onPress={() => toggleCalculation(key)}
                                        compactIcon
                                        accessibilityRole="checkbox"
                                        accessibilityState={{ checked }}
                                        detailContent={(
                                            <ThemedText
                                                type="small"
                                                themeColor="textSecondary"
                                                style={{ fontSize: 13, lineHeight: 19 }}
                                            >
                                                {tool.detail}
                                            </ThemedText>
                                        )}
                                        trailingContent={(
                                            <View
                                                style={[
                                                    styles.selectionCheckbox,
                                                    {
                                                        backgroundColor: checked ? theme.primary : theme.surface,
                                                        borderColor: checked ? theme.primary : theme.borderStrong,
                                                    },
                                                ]}
                                            >
                                                {checked ? (
                                                    <MaterialCommunityIcons name="check-bold" size={15} color="#FFFFFF" />
                                                ) : null}
                                            </View>
                                        )}
                                    />
                                    {index < GROUP_TOOLS.length - 1 ? (
                                        <View style={[styles.selectionSeparator, { backgroundColor: theme.border }]} />
                                    ) : null}
                                </View>
                            );
                        })}
                    </Card.Content>
                </Card>

                <Card style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                    <Card.Content style={styles.form}>
                        <View style={[styles.employeeInfoSection, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}>
                            <View style={styles.employeeInfoHeader}>
                                <View style={[styles.employeeInfoIcon, { backgroundColor: theme.primaryContainer }]}>
                                    <MaterialCommunityIcons name="domain" size={20} color={theme.primary} />
                                </View>
                                <ThemedText type="smallBold" style={[styles.employeeInfoTitle, { color: theme.text }]}>
                                    مشخصات کارفرما
                                </ThemedText>
                            </View>
                            <View style={[styles.employeeInfoHint, { backgroundColor: theme.surface }]}>
                                <MaterialCommunityIcons name="information-outline" size={16} color={theme.textSecondary} />
                                <ThemedText type="small" style={[styles.fieldHint, styles.employeeInfoHintText, { color: theme.textSecondary }]}>
                                    این اطلاعات اختیاری است و در صورت تکمیل، در فیش PDF درج می‌شود.
                                </ThemedText>
                            </View>
                            <TextInput
                                mode="outlined"
                                dense
                                label="نام شخص حقوقی یا حقیقی"
                                value={employerName}
                                onChangeText={setEmployerName}
                                textColor={theme.text}
                                outlineColor={theme.borderStrong}
                                activeOutlineColor={theme.primary}
                                style={[styles.employeeTextInput, { backgroundColor: theme.surface }]}
                                contentStyle={styles.employeeTextInputContent}
                                outlineStyle={styles.employeeTextInputOutline}
                                autoCorrect={false}
                                autoCapitalize="words"
                            />
                            <TextInput
                                mode="outlined"
                                dense
                                label="شناسه ملی یا کد ملی"
                                value={employerIdentifier}
                                onChangeText={setEmployerIdentifier}
                                textColor={theme.text}
                                outlineColor={theme.borderStrong}
                                activeOutlineColor={theme.primary}
                                style={[styles.employeeTextInput, { backgroundColor: theme.surface }]}
                                contentStyle={styles.employeeTextInputContent}
                                outlineStyle={styles.employeeTextInputOutline}
                                keyboardType="number-pad"
                            />
                        </View>

                        <View style={[styles.employeeInfoSection, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}>
                            <View style={styles.employeeInfoHeader}>
                                <View style={[styles.employeeInfoIcon, { backgroundColor: theme.primaryContainer }]}>
                                    <MaterialCommunityIcons name="account-box-outline" size={20} color={theme.primary} />
                                </View>
                                <ThemedText type="smallBold" style={[styles.employeeInfoTitle, { color: theme.text }]}>
                                    مشخصات کارگر
                                </ThemedText>
                            </View>
                            <View style={[styles.employeeInfoHint, { backgroundColor: theme.surface }]}>
                                <MaterialCommunityIcons name="information-outline" size={16} color={theme.textSecondary} />
                                <ThemedText type="small" style={[styles.fieldHint, styles.employeeInfoHintText, { color: theme.textSecondary }]}>
                                    این اطلاعات اختیاری است و در صورت تکمیل، در فیش PDF درج می‌شود.
                                </ThemedText>
                            </View>
                            <TextInput
                                mode="outlined"
                                dense
                                label="نام"
                                value={employeeName}
                                onChangeText={setEmployeeName}
                                textColor={theme.text}
                                outlineColor={theme.borderStrong}
                                activeOutlineColor={theme.primary}
                                style={[styles.employeeTextInput, { backgroundColor: theme.surface }]}
                                contentStyle={styles.employeeTextInputContent}
                                outlineStyle={styles.employeeTextInputOutline}
                                autoCorrect={false}
                                autoCapitalize="words"
                            />
                            <TextInput
                                mode="outlined"
                                dense
                                label="کد ملی"
                                value={employeeNationalCode}
                                onChangeText={setEmployeeNationalCode}
                                textColor={theme.text}
                                outlineColor={theme.borderStrong}
                                activeOutlineColor={theme.primary}
                                style={[styles.employeeTextInput, { backgroundColor: theme.surface }]}
                                contentStyle={styles.employeeTextInputContent}
                                outlineStyle={styles.employeeTextInputOutline}
                                keyboardType="number-pad"
                                maxLength={10}
                            />
                            <TextInput
                                mode="outlined"
                                dense
                                label="عنوان شغلی"
                                value={employeeJobTitle}
                                onChangeText={setEmployeeJobTitle}
                                textColor={theme.text}
                                outlineColor={theme.borderStrong}
                                activeOutlineColor={theme.primary}
                                style={[styles.employeeTextInput, { backgroundColor: theme.surface }]}
                                contentStyle={styles.employeeTextInputContent}
                                outlineStyle={styles.employeeTextInputOutline}
                                autoCorrect={false}
                                autoCapitalize="words"
                            />
                        </View>

                        {hasSharedDateRange ? (
                            <View style={[styles.inputSection, { backgroundColor: theme.surfaceVariant, borderColor: theme.borderStrong }]}>
                                <View style={styles.inputSectionHeader}>
                                    <ThemedText type="smallBold" style={{ color: theme.text }}>بازهٔ مشترک محاسبات</ThemedText>
                                    {selectedKeys.includes('entitled-seniority') ? (
                                        <ThemedText type="small" style={[styles.fieldHint, { color: theme.textSecondary }]}>
                                            تاریخ استخدام سابقه و سالگرد پایه سنوات را تعیین می‌کند؛ مبلغ فقط برای بازهٔ «از تاریخ» تا «تا تاریخ» محاسبه می‌شود.
                                        </ThemedText>
                                    ) : null}
                                    {hasMissionAllowance ? (
                                        <ThemedText type="small" style={[styles.fieldHint, { color: theme.textSecondary }]}>
                                            این بازه برای محاسبات دیگر است؛ مأموریت بازهٔ جداگانه دارد.
                                        </ThemedText>
                                    ) : null}
                                </View>
                                <View style={styles.dateRow}>
                                    <DateInputField label="از تاریخ" value={startDate} onPress={() => setPickerTarget('start')} formatValue={formatDate} />
                                    <DateInputField label="تا تاریخ" value={endDate} onPress={() => setPickerTarget('end')} formatValue={formatDate} />
                                </View>
                            </View>
                        ) : null}

                        {hasEmploymentBasedCalculation ? (
                            <View style={[styles.specificCalculationSection, { backgroundColor: theme.surfaceVariant, borderColor: theme.borderStrong }]}>
                                <View style={styles.inputSectionHeader}>
                                    <ThemedText type="smallBold" style={{ color: theme.text }}>سابقه و پایه سنوات</ThemedText>
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
                                    <View style={styles.formField}>
                                        <ThemedText type="small" themeColor="textSecondary">گروه شغلی</ThemedText>
                                        <Menu
                                            visible={groupMenuVisible}
                                            onDismiss={() => setGroupMenuVisible(false)}
                                            anchor={(
                                                <Pressable
                                                    onPress={() => setGroupMenuVisible(true)}
                                                    style={[styles.groupPicker, { backgroundColor: theme.surface, borderColor: theme.border }]}
                                                >
                                                    <ThemedText type="smallBold">
                                                        {selectedGroup == null ? 'انتخاب گروه شغلی' : `گروه ${toPersianDigits(selectedGroup)}`}
                                                    </ThemedText>
                                                    <MaterialCommunityIcons name="chevron-down" size={18} color={theme.primary} />
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
                                <SettlementThrough1391Field
                                    checked={settledThrough1391}
                                    enabled={(parseDateInput(employmentDate)?.year ?? 0) <= 1391}
                                    onChange={setSettledThrough1391}
                                />
                            </View>
                        ) : null}

                        {hasMaritalAllowance ? (
                            <View style={[styles.specificCalculationSection, { backgroundColor: theme.surfaceVariant, borderColor: theme.borderStrong }]}>
                                <View style={styles.inputSectionHeader}>
                                    <ThemedText type="smallBold" style={{ color: theme.text }}>وضعیت تأهل</ThemedText>
                                    <ThemedText type="small" style={[styles.fieldHint, { color: theme.textSecondary }]}>
                                        مبنای محاسبهٔ {getSelectedCalculationTitles(['housing-allowance', 'monthly-allowance', 'unused-leave-wage'])}.
                                    </ThemedText>
                                </View>
                                <View style={styles.maritalOptionsRow}>
                                    {MARITAL_OPTIONS.map((option) => {
                                        const selected = maritalStatus === option.value;
                                        return (
                                            <Pressable
                                                key={option.value}
                                                onPress={() => {
                                                    setMaritalStatus(option.value);
                                                    if (option.value === 'single') setChildrenCount(0);
                                                }}
                                                style={[
                                                    styles.maritalOption,
                                                    {
                                                        backgroundColor: selected ? theme.primary : theme.surface,
                                                        borderColor: selected ? theme.primary : theme.border,
                                                    },
                                                ]}
                                                accessibilityRole="radio"
                                                accessibilityState={{ selected }}
                                                accessibilityLabel={option.label}
                                            >
                                                <ThemedText type="smallBold" style={{ color: selected ? theme.surface : theme.text }}>
                                                    {option.label}
                                                </ThemedText>
                                            </Pressable>
                                        );
                                    })}
                                </View>
                            </View>
                        ) : null}

                        {hasChildrenCount ? (
                            <View style={[styles.specificCalculationSection, { backgroundColor: theme.surfaceVariant, borderColor: theme.borderStrong }]}>
                                <View style={styles.inputSectionHeader}>
                                    <ThemedText type="smallBold" style={{ color: theme.text }}>
                                        تعداد فرزندان واجد شرایط
                                    </ThemedText>
                                    <ThemedText type="small" style={[styles.fieldHint, { color: theme.textSecondary }]}>
                                        برای {getSelectedCalculationTitles(['family-allowance', 'unused-leave-wage'])}.
                                    </ThemedText>
                                </View>
                                <Menu
                                    visible={childrenMenuVisible}
                                    onDismiss={() => setChildrenMenuVisible(false)}
                                    anchor={(
                                        <Pressable onPress={() => setChildrenMenuVisible(true)}>
                                            <View style={[styles.valuePicker, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                                                <ThemedText type="small" style={[styles.valuePickerText, { color: theme.text }]}>
                                                    {`${toPersianDigits(childrenCount)} فرزند`}
                                                </ThemedText>
                                                <MaterialCommunityIcons name="account-group-outline" size={18} color={theme.primary} />
                                            </View>
                                        </Pressable>
                                    )}
                                    contentStyle={{ borderRadius: 16, backgroundColor: theme.surface }}
                                >
                                    {childrenOptions.map((count) => (
                                        <FontAwareMenuItem
                                            key={count}
                                            onPress={() => {
                                                setChildrenCount(count);
                                                setChildrenMenuVisible(false);
                                            }}
                                            title={`${toPersianDigits(count)} فرزند`}
                                            titleStyle={{ fontFamily: 'AppFont-Regular', color: theme.text }}
                                        />
                                    ))}
                                </Menu>
                            </View>
                        ) : null}

                        {hasLeaveCalculation ? (
                            <View style={[styles.specificCalculationSection, { backgroundColor: theme.surfaceVariant, borderColor: theme.borderStrong }]}>
                                <View style={styles.inputSectionHeader}>
                                    <ThemedText type="smallBold" style={{ color: theme.text }}>مرخصی ذخیره‌شده و مزد مرخصی</ThemedText>
                                    <ThemedText type="small" style={[styles.fieldHint, { color: theme.textSecondary }]}>
                                        این ورودی‌ها برای {getSelectedCalculationTitles(['unused-leave-entitlement', 'unused-leave-wage'])} هستند.
                                    </ThemedText>
                                </View>
                                <View style={[styles.leaveInitialBox, { backgroundColor: theme.surfaceVariant }]}>
                                    <ThemedText type="small" style={[styles.fieldGroupLabel, { color: theme.textSecondary }]}>
                                        ذخیره مرخصی از سال‌های قبل
                                    </ThemedText>
                                    <View style={[styles.dayCountStepper, { backgroundColor: theme.surface, borderColor: theme.border, direction: 'ltr' }]}>
                                        <Pressable
                                            onPress={() => changeInitialSavedLeaveDays(-1)}
                                            disabled={(Number(normalizeDigits(initialSavedLeaveDays)) || 0) <= 0}
                                            style={({ pressed }) => [styles.stepperButton, { backgroundColor: pressed ? theme.primaryContainer : theme.surfaceVariant }, (Number(normalizeDigits(initialSavedLeaveDays)) || 0) <= 0 && styles.stepperButtonDisabled]}
                                            accessibilityRole="button"
                                            accessibilityLabel="کاهش ذخیره مرخصی سال‌های قبل"
                                        >
                                            <MaterialCommunityIcons name="minus" size={20} color={theme.primary} />
                                        </Pressable>
                                        <NumericInputField
                                            mode="decimal"
                                            value={initialSavedLeaveDays}
                                            onChangeText={setInitialSavedLeaveDays}
                                            placeholder="۰"
                                            placeholderTextColor={theme.textMuted}
                                            style={[styles.stepperInput, { color: theme.text, direction: 'ltr' }]}
                                            textAlign="center"
                                            accessibilityLabel="ذخیره مرخصی از سال‌های قبل"
                                        />
                                        <Pressable
                                            onPress={() => changeInitialSavedLeaveDays(1)}
                                            style={({ pressed }) => [styles.stepperButton, { backgroundColor: pressed ? theme.primaryContainer : theme.surfaceVariant }]}
                                            accessibilityRole="button"
                                            accessibilityLabel="افزایش ذخیره مرخصی سال‌های قبل"
                                        >
                                            <MaterialCommunityIcons name="plus" size={20} color={theme.primary} />
                                        </Pressable>
                                    </View>
                                </View>

                                {leaveSegmentCount > 0 ? (
                                    <View style={[styles.leaveSegmentsBox, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}>
                                        <ThemedText type="smallBold" style={[styles.fieldGroupLabel, { color: theme.text }]}>
                                            مرخصی استفاده‌شده در هر بخش
                                        </ThemedText>
                                        {Array.from({ length: leaveSegmentCount }, (_, index) => {
                                            const isPartial = index >= leaveFullYears;
                                            const segmentLabel = isPartial && parsedRangeStart && parsedRangeEnd
                                                ? getPartialLeavePeriodLabel(parsedRangeStart, parsedRangeEnd, leaveFullYears, leaveRemainingMonths)
                                                : parsedRangeStart
                                                    ? getFullLeaveYearLabel(parsedRangeStart, index + 1)
                                                    : `سال کامل ${toPersianDigits(index + 1)}`;
                                            const displayedValue = usedLeaveDaysBySegment[index] ?? '۰';
                                            const normalizedValue = Number(normalizeDigits(displayedValue)) || 0;

                                            return (
                                                <View key={index} style={styles.leaveSegmentRow}>
                                                    <ThemedText type="small" style={styles.leaveSegmentLabel}>{segmentLabel}</ThemedText>
                                                    <View style={[styles.dayCountStepper, { backgroundColor: theme.surface, borderColor: theme.border, direction: 'ltr' }]}>
                                                        <Pressable
                                                            onPress={() => changeUsedLeaveDays(index, -1)}
                                                            disabled={normalizedValue <= 0}
                                                            style={({ pressed }) => [styles.stepperButton, { backgroundColor: pressed ? theme.primaryContainer : theme.surfaceVariant }, normalizedValue <= 0 && styles.stepperButtonDisabled]}
                                                            accessibilityRole="button"
                                                            accessibilityLabel="کاهش مرخصی استفاده‌شده"
                                                        >
                                                            <MaterialCommunityIcons name="minus" size={20} color={theme.primary} />
                                                        </Pressable>
                                                        <NumericInputField
                                                            mode="decimal"
                                                            value={displayedValue}
                                                            onChangeText={(value) => setUsedLeaveDaysBySegment((current) => ({ ...current, [index]: value }))}
                                                            placeholder="۰"
                                                            placeholderTextColor={theme.textMuted}
                                                            style={[styles.stepperInput, { color: theme.text, direction: 'ltr' }]}
                                                            textAlign="center"
                                                            accessibilityLabel={`مرخصی استفاده‌شده در بخش ${index + 1}`}
                                                        />
                                                        <Pressable
                                                            onPress={() => changeUsedLeaveDays(index, 1)}
                                                            style={({ pressed }) => [styles.stepperButton, { backgroundColor: pressed ? theme.primaryContainer : theme.surfaceVariant }]}
                                                            accessibilityRole="button"
                                                            accessibilityLabel="افزایش مرخصی استفاده‌شده"
                                                        >
                                                            <MaterialCommunityIcons name="plus" size={20} color={theme.primary} />
                                                        </Pressable>
                                                    </View>
                                                </View>
                                            );
                                        })}
                                    </View>
                                ) : null}
                            </View>
                        ) : null}

                        {hasOvertime ? (
                            <View style={[styles.specificCalculationSection, { backgroundColor: theme.surfaceVariant, borderColor: theme.borderStrong }]}>
                                <View style={styles.inputSectionHeader}>
                                    <ThemedText type="smallBold" style={{ color: theme.text }}>اضافه‌کاری استحقاقی</ThemedText>
                                    <ThemedText type="small" style={[styles.fieldHint, { color: theme.textSecondary }]}>
                                        ساعت اضافه‌کاری روزانهٔ کارگر را وارد کنید.
                                    </ThemedText>
                                </View>
                                <Pressable onPress={() => setTimePickerVisible(true)}>
                                    <View style={[styles.valuePicker, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                                        <ThemedText type="small" style={[styles.valuePickerText, { color: theme.text }]}>
                                            {dailyOvertimeHours.replace(/\d/g, (digit) => persianDigits[Number(digit)])}
                                        </ThemedText>
                                        <MaterialCommunityIcons name="clock-outline" size={18} color={theme.primary} />
                                    </View>
                                </Pressable>
                            </View>
                        ) : null}

                        {hasShiftWork ? (
                            <View style={[styles.specificCalculationSection, { backgroundColor: theme.surfaceVariant, borderColor: theme.borderStrong }]}>
                                <View style={styles.inputSectionHeader}>
                                    <ThemedText type="smallBold" style={{ color: theme.text }}>نوبت‌کاری ماهانه</ThemedText>
                                    <ThemedText type="small" style={[styles.fieldHint, { color: theme.textSecondary }]}>
                                        نوع نوبت کاری کارگر را انتخاب کنید.
                                    </ThemedText>
                                </View>
                                <View style={[styles.shiftTypeField, { backgroundColor: theme.surfaceVariant }]}>
                                    <ThemedText type="small" style={[styles.fieldGroupLabel, { color: theme.textSecondary }]}>
                                        نوع نوبت کاری
                                    </ThemedText>
                                    <View style={styles.shiftOptionsGroup}>
                                        {SHIFT_TYPE_OPTIONS.map((option) => {
                                            const isSelected = option.value === shiftType;
                                            return (
                                                <Pressable
                                                    key={option.value}
                                                    onPress={() => setShiftType(option.value)}
                                                    style={[
                                                        styles.shiftOption,
                                                        {
                                                            backgroundColor: isSelected ? theme.primary : theme.surface,
                                                            borderColor: isSelected ? theme.primary : theme.border,
                                                        },
                                                    ]}
                                                    accessibilityRole="radio"
                                                    accessibilityState={{ selected: isSelected }}
                                                    accessibilityLabel={`${option.label} ${option.percentage}`}
                                                >
                                                    <ThemedText type="smallBold" style={{ color: isSelected ? theme.surface : theme.text }}>
                                                        {option.label}
                                                    </ThemedText>
                                                    <ThemedText type="small" style={{ color: isSelected ? theme.surface : theme.textSecondary }}>
                                                        {option.percentage}
                                                    </ThemedText>
                                                </Pressable>
                                            );
                                        })}
                                    </View>
                                </View>
                            </View>
                        ) : null}

                        {hasFridayWork ? (
                            <View style={[styles.specificCalculationSection, { backgroundColor: theme.surfaceVariant, borderColor: theme.borderStrong }]}>
                                <View style={styles.inputSectionHeader}>
                                    <ThemedText type="smallBold" style={{ color: theme.text }}>جمعه‌کاری</ThemedText>
                                    <ThemedText type="small" style={[styles.fieldHint, { color: theme.textSecondary }]}>
                                        تعداد روزهای جمعه‌کاری را در هر دوره وارد کنید.
                                    </ThemedText>
                                </View>
                                {fridayPeriods.map((period) => {
                                    const key = `${period.year}:${period.periodIndex}`;
                                    const displayedValue = fridayWorkDays[key] ?? toPersianDigits(period.availableFridays);
                                    const normalizedValue = Number(normalizeDigits(displayedValue)) || 0;
                                    return (
                                        <View key={key} style={[styles.periodInputCard, { backgroundColor: theme.surface, borderColor: theme.borderStrong }]}>
                                            <View style={styles.periodInputHeader}>
                                                <ThemedText type="smallBold" style={{ color: theme.text }}>
                                                    سال {toPersianDigits(period.year)}، دورهٔ {toPersianDigits(period.periodIndex)}
                                                </ThemedText>
                                                <ThemedText type="small" style={{ color: theme.textSecondary }}>
                                                    جمعه‌های موجود: {toPersianDigits(period.availableFridays)}
                                                </ThemedText>
                                            </View>
                                            <View style={[styles.dayCountStepper, { backgroundColor: theme.surface, borderColor: theme.border, direction: 'ltr' }]}>
                                                <Pressable
                                                    onPress={() => setFridayWorkDays((current) => ({ ...current, [key]: clampDayCount(normalizedValue - 1, period.availableFridays) }))}
                                                    disabled={normalizedValue <= 0}
                                                    style={({ pressed }) => [styles.stepperButton, { backgroundColor: pressed ? theme.primaryContainer : theme.surfaceVariant }, normalizedValue <= 0 && styles.stepperButtonDisabled]}
                                                    accessibilityRole="button"
                                                    accessibilityLabel={`کاهش جمعه‌کاری سال ${period.year} دوره ${period.periodIndex}`}
                                                >
                                                    <MaterialCommunityIcons name="minus" size={20} color={theme.primary} />
                                                </Pressable>
                                                <NumericInputField
                                                    value={displayedValue}
                                                    onChangeText={(value) => setFridayWorkDays((current) => ({ ...current, [key]: value }))}
                                                    onBlur={() => setFridayWorkDays((current) => ({ ...current, [key]: clampDayCount(current[key] ?? toPersianDigits(period.availableFridays), period.availableFridays) }))}
                                                    mode="integer"
                                                    placeholder={toPersianDigits(period.availableFridays)}
                                                    placeholderTextColor={theme.textMuted}
                                                    style={[styles.stepperInput, { color: theme.text }]}
                                                    textAlign="center"
                                                    accessibilityLabel={`تعداد جمعه‌کاری کارگر در سال ${period.year} دوره ${period.periodIndex}`}
                                                />
                                                <Pressable
                                                    onPress={() => setFridayWorkDays((current) => ({ ...current, [key]: clampDayCount(normalizedValue + 1, period.availableFridays) }))}
                                                    disabled={normalizedValue >= period.availableFridays}
                                                    style={({ pressed }) => [styles.stepperButton, { backgroundColor: pressed ? theme.primaryContainer : theme.surfaceVariant }, normalizedValue >= period.availableFridays && styles.stepperButtonDisabled]}
                                                    accessibilityRole="button"
                                                    accessibilityLabel={`افزایش جمعه‌کاری سال ${period.year} دوره ${period.periodIndex}`}
                                                >
                                                    <MaterialCommunityIcons name="plus" size={20} color={theme.primary} />
                                                </Pressable>
                                            </View>
                                        </View>
                                    );
                                })}
                            </View>
                        ) : null}

                        {hasMissionAllowance ? (
                            <View style={[styles.specificCalculationSection, { backgroundColor: theme.surfaceVariant, borderColor: theme.borderStrong }]}>
                                <View style={styles.inputSectionHeader}>
                                    <ThemedText type="smallBold" style={{ color: theme.text }}>فوق‌العاده مأموریت</ThemedText>
                                    <ThemedText type="small" style={[styles.fieldHint, { color: theme.textSecondary }]}>
                                        بازه و تعداد روزهای این بخش فقط برای محاسبهٔ مأموریت استفاده می‌شود.
                                    </ThemedText>
                                </View>
                                <View style={styles.dateRow}>
                                    <DateInputField
                                        label="از تاریخ"
                                        value={missionStartDate}
                                        onPress={() => setPickerTarget('mission-start')}
                                        formatValue={formatDate}
                                        iconName="calendar-start"
                                    />
                                    <DateInputField
                                        label="تا تاریخ"
                                        value={missionEndDate}
                                        onPress={() => setPickerTarget('mission-end')}
                                        formatValue={formatDate}
                                        iconName="calendar-end"
                                    />
                                </View>
                                <ThemedText type="small" style={[styles.fieldGroupLabel, { color: theme.textSecondary }]}>
                                    تعداد روزهای مأموریت در هر دورهٔ مزد
                                </ThemedText>
                                {missionPeriods.map((period) => {
                                    const key = `${period.year}:${period.periodIndex}`;
                                    const displayedValue = missionDays[key] ?? DEFAULT_MISSION_DAYS;
                                    const normalizedValue = Number(normalizeDigits(displayedValue)) || 0;
                                    return (
                                        <View key={key} style={[styles.periodInputCard, { backgroundColor: theme.surface, borderColor: theme.borderStrong }]}>
                                            <View style={styles.periodInputHeader}>
                                                <ThemedText type="smallBold" style={{ color: theme.text }}>
                                                    سال {toPersianDigits(period.year)} · دورهٔ {toPersianDigits(period.periodIndex)}
                                                </ThemedText>
                                                <ThemedText type="small" style={{ color: theme.textSecondary }}>
                                                    {formatDate(`${period.startDate.year}/${period.startDate.month}/${period.startDate.day}`)} تا {formatDate(`${period.endDate.year}/${period.endDate.month}/${period.endDate.day}`)} · حداکثر {toPersianDigits(period.availableDays)} روز
                                                </ThemedText>
                                            </View>
                                            <View style={[styles.dayCountStepper, { backgroundColor: theme.surface, borderColor: theme.border, direction: 'ltr' }]}>
                                                <Pressable
                                                    onPress={() => setMissionDays((current) => ({ ...current, [key]: clampDayCount(normalizedValue - 1, period.availableDays) }))}
                                                    disabled={normalizedValue <= 0}
                                                    style={({ pressed }) => [styles.stepperButton, { backgroundColor: pressed ? theme.primaryContainer : theme.surfaceVariant }, normalizedValue <= 0 && styles.stepperButtonDisabled]}
                                                    accessibilityRole="button"
                                                    accessibilityLabel={`کاهش روزهای مأموریت سال ${period.year} دوره ${period.periodIndex}`}
                                                >
                                                    <MaterialCommunityIcons name="minus" size={20} color={theme.primary} />
                                                </Pressable>
                                                <NumericInputField
                                                    value={displayedValue}
                                                    onChangeText={(value) => setMissionDays((current) => ({ ...current, [key]: value }))}
                                                    onBlur={() => setMissionDays((current) => ({ ...current, [key]: clampDayCount(current[key] ?? DEFAULT_MISSION_DAYS, period.availableDays) }))}
                                                    mode="integer"
                                                    placeholder={DEFAULT_MISSION_DAYS}
                                                    placeholderTextColor={theme.textMuted}
                                                    style={[styles.stepperInput, { color: theme.text }]}
                                                    textAlign="center"
                                                    accessibilityLabel={`تعداد روزهای مأموریت سال ${period.year} دوره ${period.periodIndex}`}
                                                />
                                                <Pressable
                                                    onPress={() => setMissionDays((current) => ({ ...current, [key]: clampDayCount(normalizedValue + 1, period.availableDays) }))}
                                                    disabled={normalizedValue >= period.availableDays}
                                                    style={({ pressed }) => [styles.stepperButton, { backgroundColor: pressed ? theme.primaryContainer : theme.surfaceVariant }, normalizedValue >= period.availableDays && styles.stepperButtonDisabled]}
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
                        ) : null}

                        {hasDailyWorkTime ? (
                            <View style={[styles.specificCalculationSection, { backgroundColor: theme.surfaceVariant, borderColor: theme.borderStrong }]}>
                                <ThemedText type="smallBold" style={{ color: theme.text }}>ساعات کار روزانه</ThemedText>
                                <DailyWorkTimeField
                                    value={dailyWorkTime}
                                    onChange={setDailyWorkTime}
                                    maxHours={7}
                                    maxMinutesAtMaxHour={20}
                                    label={hasPayrollDailyWorkTime ? undefined : 'ساعات کاری روزانه'}
                                    showFullTimeHint={hasPayrollDailyWorkTime}
                                />
                            </View>
                        ) : null}

                        <View style={[styles.specificCalculationSection, { backgroundColor: theme.surfaceVariant, borderColor: theme.borderStrong }]}>
                            <View style={styles.inputSectionHeader}>
                                <ThemedText type="smallBold" style={{ color: theme.text }}>
                                    کسر مبالغ دریافتی کارگر
                                </ThemedText>
                            </View>
                            <ThemedText type="small" style={[styles.fieldGroupLabel, { color: theme.textSecondary }]}>
                                مبلغ پرداخت‌شده به کارگر در بازهٔ زمانی انتخابی ({getCurrencyLabel(currencyPreference)})
                            </ThemedText>
                            <CurrencyAmountInput
                                value={amountPaidToWorker}
                                onChangeText={setAmountPaidToWorker}
                                currencyPreference={currencyPreference}
                                accessibilityLabel="مبلغ پرداخت‌شده به کارگر در بازهٔ زمانی انتخابی"
                            />
                            {!Number.isFinite(Number(normalizeDigits(amountPaidToWorker)))
                                || Number(normalizeDigits(amountPaidToWorker)) < 0
                                || !Number.isSafeInteger(displayCurrencyToRial(
                                    Number(normalizeDigits(amountPaidToWorker)),
                                    currencyPreference,
                                )) ? (
                                <ThemedText type="small" style={[styles.fieldHint, { color: theme.error }]}>
                                    مبلغ باید عدد صحیح و نامنفی باشد.
                                </ThemedText>
                            ) : null}
                            <ThemedText type="small" style={[styles.fieldHint, { color: theme.textSecondary }]}>
                                این مبلغ از جمع حقوق و مزایای محاسبه‌شده کسر می‌شود و از مانده، ۷٪ سهم بیمهٔ کارگر کسر خواهد شد.
                            </ThemedText>
                        </View>

                        <View style={[styles.contractorAnalysisSection, { backgroundColor: theme.surfaceVariant, borderColor: theme.borderStrong }]}>
                            <View style={styles.inputSectionHeader}>
                                <ThemedText type="smallBold" style={{ color: theme.text }}>
                                    آنالیز حقوق و مزایای ماهیانه برای پیمانکاران
                                </ThemedText>
                            </View>
                            <ThemedText type="small" style={[styles.fieldGroupLabel, { color: theme.textSecondary }]}>
                                تعداد کارگران
                            </ThemedText>
                            <View style={[styles.dayCountStepper, { backgroundColor: theme.surface, borderColor: theme.border, direction: 'ltr' }]}>
                                <Pressable
                                    onPress={() => setContractorWorkerCount(toPersianDigits(Math.max(1, contractorWorkerCountValue - 1)))}
                                    disabled={!contractorWorkerCountIsSafe || contractorWorkerCountValue <= 1}
                                    style={({ pressed }) => [
                                        styles.stepperButton,
                                        { backgroundColor: pressed ? theme.primaryContainer : theme.surfaceVariant },
                                        (!contractorWorkerCountIsSafe || contractorWorkerCountValue <= 1) && styles.stepperButtonDisabled,
                                    ]}
                                    accessibilityRole="button"
                                    accessibilityLabel="کاهش تعداد کارگران"
                                >
                                    <MaterialCommunityIcons name="minus" size={20} color={theme.primary} />
                                </Pressable>
                                <NumericInputField
                                    value={contractorWorkerCount}
                                    onChangeText={setContractorWorkerCount}
                                    mode="integer"
                                    placeholder="۱"
                                    placeholderTextColor={theme.textMuted}
                                    style={[styles.stepperInput, { color: theme.text }]}
                                    textAlign="center"
                                    accessibilityLabel="تعداد کارگران پیمانکار"
                                />
                                <Pressable
                                    onPress={() => setContractorWorkerCount(toPersianDigits(contractorWorkerCountIsSafe ? contractorWorkerCountValue + 1 : 1))}
                                    disabled={contractorWorkerCountIsSafe && contractorWorkerCountValue >= Number.MAX_SAFE_INTEGER}
                                    style={({ pressed }) => [
                                        styles.stepperButton,
                                        { backgroundColor: pressed ? theme.primaryContainer : theme.surfaceVariant },
                                        contractorWorkerCountIsSafe && contractorWorkerCountValue >= Number.MAX_SAFE_INTEGER && styles.stepperButtonDisabled,
                                    ]}
                                    accessibilityRole="button"
                                    accessibilityLabel="افزایش تعداد کارگران"
                                >
                                    <MaterialCommunityIcons name="plus" size={20} color={theme.primary} />
                                </Pressable>
                            </View>
                        </View>

                        {hasInsuranceCalculation ? (
                            <View style={styles.insuranceOptions}>
                                <Pressable
                                    accessibilityRole="checkbox"
                                    accessibilityState={{ checked: isWorkerInsuranceExempt }}
                                    onPress={() => setIsWorkerInsuranceExempt((value) => !value)}
                                    style={[
                                        styles.insuranceExemptionOption,
                                        {
                                            backgroundColor: theme.surfaceVariant,
                                            borderColor: theme.border,
                                        },
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
                                            ویژهٔ اسرا، آزادگان، جانبازان و فرزندان شهدا؛ فقط سهم ۷٪ کارگر معاف می‌شود.
                                        </ThemedText>
                                    </View>
                                </Pressable>

                                <View style={[styles.insuranceLegalBasis, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}>
                                    <ThemedText type="small" style={[styles.insuranceLegalSummary, { color: theme.textSecondary }]}>
                                        معافیت از سهم ۷٪ بیمه ی کارگر برای گروه‌های مشمول قوانین ایثارگران.
                                    </ThemedText>
                                    <Pressable
                                        accessibilityRole="button"
                                        accessibilityState={{ expanded: isInsuranceLegalBasisVisible }}
                                        onPress={() => setIsInsuranceLegalBasisVisible((visible) => !visible)}
                                        style={styles.insuranceLegalToggle}
                                    >
                                        <ThemedText type="smallBold" style={[styles.insuranceLegalToggleLabel, { color: theme.primary }]}>
                                            مبنای قانونی معافیت
                                        </ThemedText>
                                        <MaterialCommunityIcons
                                            name={isInsuranceLegalBasisVisible ? 'chevron-up' : 'chevron-down'}
                                            size={18}
                                            color={theme.primary}
                                        />
                                    </Pressable>
                                    {isInsuranceLegalBasisVisible ? (
                                        <ThemedText type="small" style={[styles.insuranceLegalText, { color: theme.text }]}>
                                            اسرا، آزادگان و جانبازان، براساس تبصرهٔ ۳ مادهٔ ۳۷ قانون جامع خدمات‌رسانی به ایثارگران مصوب ۱۳۹۱، و فرزندان شهید مطابق بند «ز» مادهٔ ۸۸ قانون برنامهٔ پنج‌سالهٔ ششم توسعه، که در بند ۲ قسمت «ت» مادهٔ ۳۱ قانون برنامهٔ پنج‌سالهٔ هفتم توسعه تنفیذ شده است، از پرداخت حق بیمهٔ سهم کارگر معاف هستند.
                                        </ThemedText>
                                    ) : null}
                                </View>
                            </View>
                        ) : null}

                        {errorMessage ? <ThemedText type="small" style={{ color: theme.error }}>{errorMessage}</ThemedText> : null}
                        <Button
                            mode="contained"
                            icon="calculator-variant"
                            onPress={handleCalculate}
                            loading={loading}
                            disabled={loading || periodBuckets.length === 0}
                            buttonColor={theme.primary}
                            textColor={theme.surface}
                            style={styles.calculateButton}
                            labelStyle={styles.calculateButtonLabel}
                        >
                            محاسبهٔ انتخاب‌شده‌ها
                        </Button>
                    </Card.Content>
                </Card>

                {results ? (
                    <View style={styles.results}>
                        <ThemedText type="smallBold" style={styles.resultsTitle}>نتایج</ThemedText>
                        <View style={[styles.pdfExportSection, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
                            {(() => {
                                const wageTotalResults = getWageTotalResults(results);
                                if (wageTotalResults.length === 0) return null;

                                const wageTotalHasErrors = wageTotalResults.some((result) => result.error);
                                const wageTotalAmount = wageTotalResults.reduce((total, result) => total + getResultAmount(result), 0);
                                const employerInsuranceTotal = getEmployerInsuranceTotal(wageTotalResults);
                                const workerCount = Number(normalizeDigits(contractorWorkerCount));
                                const contractorTotals = calculateContractorMonthlyTotals(
                                    wageTotalAmount,
                                    employerInsuranceTotal,
                                    wageTotalHasErrors,
                                    calculatedPeriodDayCount,
                                    workerCount,
                                );
                                const workerClaims = calculateWorkerClaimsAfterPayments(
                                    wageTotalAmount,
                                    displayCurrencyToRial(
                                        Number(normalizeDigits(amountPaidToWorker)),
                                        currencyPreference,
                                    ),
                                    contractorTotals.wageTotalError,
                                );
                                const excludedBonusItems = getExcludedBonusItemTitles(results);
                                return (
                                    <View style={styles.summaryBoxHeader}>
                                        <View style={[styles.summaryBoxContent, { backgroundColor: theme.primaryContainer, borderColor: theme.primary }]}>
                                            <View style={[styles.contractorTotalBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                                                <ThemedText type="small" style={[styles.summaryLabel, { color: theme.textSecondary }]}>
                                                    جمع حقوق و مزایای محاسبه‌شده در بازه
                                                </ThemedText>
                                                <ThemedText type="smallBold" style={[styles.amountValue, { color: contractorTotals.wageTotalError ? theme.error : theme.primary }]}>
                                                    {contractorTotals.wageTotalError
                                                        ? contractorTotals.wageTotalError
                                                        : formatCurrency(wageTotalAmount)}
                                                </ThemedText>
                                            </View>
                                            <View style={[styles.contractorTotalBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                                                <ThemedText type="small" style={[styles.summaryLabel, { color: theme.textSecondary }]}>
                                                    ماندهٔ حقوق و مزایا پس از کسر مبلغ پرداخت‌شده
                                                </ThemedText>
                                                <ThemedText type="smallBold" style={[styles.amountValue, { color: workerClaims.error ? theme.error : theme.primary }]}>
                                                    {workerClaims.error ?? formatCurrency(workerClaims.remainingClaim)}
                                                </ThemedText>
                                            </View>
                                            <View style={[styles.contractorTotalBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                                                <ThemedText type="small" style={[styles.summaryLabel, { color: theme.textSecondary }]}>
                                                    خالص ماندهٔ حقوق و مزایا پس از کسر ۷٪ سهم بیمهٔ کارگر
                                                </ThemedText>
                                                <ThemedText type="smallBold" style={[styles.amountValue, { color: workerClaims.error ? theme.error : theme.primary }]}>
                                                    {workerClaims.error ?? formatCurrency(workerClaims.finalClaim)}
                                                </ThemedText>
                                            </View>
                                            <View style={[styles.contractorTotalBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                                                <ThemedText type="small" style={[styles.summaryLabel, { color: theme.textSecondary }]}>
                                                    هزینهٔ ماهانهٔ ۳۰ روز برای {contractorTotals.workerCountIsValid ? toPersianDigits(workerCount) : 'تعداد نامعتبر'} کارگر
                                                </ThemedText>
                                                <ThemedText
                                                    type="smallBold"
                                                    style={[
                                                        styles.amountValue,
                                                        { color: contractorTotals.contractorTotal30Error ? theme.error : theme.primary },
                                                    ]}
                                                >
                                                    {contractorTotals.contractorTotal30Error
                                                        ?? formatCurrency(contractorTotals.contractorTotal30)}
                                                </ThemedText>
                                                <ThemedText type="small" style={[styles.contractorInsuranceNote, { color: theme.textSecondary }]}>
                                                    شامل سهم ۲۳٪ بیمهٔ کارفرما: {formatCurrency(contractorTotals.employerInsurance30)}
                                                </ThemedText>
                                            </View>
                                            <View style={[styles.contractorTotalBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                                                <ThemedText type="small" style={[styles.summaryLabel, { color: theme.textSecondary }]}>
                                                    هزینهٔ ماهانهٔ ۳۱ روز برای {contractorTotals.workerCountIsValid ? toPersianDigits(workerCount) : 'تعداد نامعتبر'} کارگر
                                                </ThemedText>
                                                <ThemedText
                                                    type="smallBold"
                                                    style={[
                                                        styles.amountValue,
                                                        { color: contractorTotals.contractorTotalError ? theme.error : theme.primary },
                                                    ]}
                                                >
                                                    {contractorTotals.contractorTotalError
                                                        ?? formatCurrency(contractorTotals.contractorTotal)}
                                                </ThemedText>
                                                <ThemedText type="small" style={[styles.contractorInsuranceNote, { color: theme.textSecondary }]}>
                                                    شامل سهم ۲۳٪ بیمهٔ کارفرما: {formatCurrency(contractorTotals.employerInsurance31)}
                                                </ThemedText>
                                            </View>
                                            {excludedBonusItems.length > 0 ? (
                                                <ThemedText type="small" style={[styles.wageTotalNote, { color: theme.textSecondary }]}>
                                                    این جمع شامل {excludedBonusItems.map((title) => `«${title}»`).join(' و ')} نمی‌شود.
                                                </ThemedText>
                                            ) : null}
                                        </View>
                                    </View>
                                );
                            })()}
                            <View style={styles.pdfExportHeader}>
                                <ThemedText type="smallBold">خروجی فیش PDF</ThemedText>
                                <ThemedText type="small" style={[styles.fieldHint, { color: theme.textSecondary }]}>
                                    روش دریافت فایل را انتخاب کنید.
                                </ThemedText>
                            </View>
                            <View style={[styles.pdfDetailsOption, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                                <Checkbox
                                    status={includePdfDetails ? 'checked' : 'unchecked'}
                                    onPress={() => setIncludePdfDetails((value) => !value)}
                                    disabled={pdfAction !== null}
                                    color={theme.primary}
                                />
                                <Pressable
                                    style={styles.pdfDetailsLabel}
                                    onPress={() => setIncludePdfDetails((value) => !value)}
                                    disabled={pdfAction !== null}
                                    accessibilityRole="checkbox"
                                    accessibilityState={{ checked: includePdfDetails }}
                                >
                                    <ThemedText type="smallBold">
                                        درج جزئیات محاسبه
                                    </ThemedText>
                                    <ThemedText type="small" style={[styles.fieldHint, { color: theme.textSecondary }]}>
                                        اطلاعات تفصیلی محاسبات نیز به PDF اضافه شود.
                                    </ThemedText>
                                </Pressable>
                            </View>
                            <View style={styles.pdfActions}>
                                <View style={styles.pdfActionItem}>
                                    <PdfActionButton
                                        label="پیش‌نمایش"
                                        icon="eye-outline"
                                        onPress={() => void handleExportPdf('preview')}
                                        loading={pdfAction === 'preview'}
                                        disabled={pdfAction !== null}
                                        variant="outlined"
                                        primaryColor={theme.primary}
                                        surfaceColor={theme.surface}
                                        borderColor={theme.borderStrong}
                                    />
                                </View>
                                <View style={styles.pdfActionItem}>
                                    <PdfActionButton
                                        label="اشتراک‌گذاری"
                                        icon="share-variant"
                                        onPress={() => void handleExportPdf('share')}
                                        loading={pdfAction === 'share'}
                                        disabled={pdfAction !== null}
                                        variant="contained"
                                        primaryColor={theme.primary}
                                        surfaceColor={theme.surface}
                                        borderColor={theme.borderStrong}
                                    />
                                </View>
                                <View style={styles.pdfActionItem}>
                                    <PdfActionButton
                                        label="ذخیره"
                                        icon="download"
                                        onPress={() => void handleExportPdf('save')}
                                        loading={pdfAction === 'save'}
                                        disabled={pdfAction !== null}
                                        variant="outlined"
                                        primaryColor={theme.primary}
                                        surfaceColor={theme.surface}
                                        borderColor={theme.borderStrong}
                                    />
                                </View>
                            </View>
                        </View>
                        {results.map((result) => {
                            const isExpanded = !!expandedResults[result.key];
                            const detailBreakdown = result.key === 'end-of-service-years' && result.breakdown.length > 0
                                ? (() => {
                                    const lastPeriod = result.breakdown.at(-1);
                                    if (!isRecord(lastPeriod)) return result.breakdown;
                                    const dailyMinimumWage = typeof lastPeriod.dailyMinimumWage === 'number'
                                        ? lastPeriod.dailyMinimumWage
                                        : 0;
                                    const dailySeniority = typeof lastPeriod.dailySeniority === 'number'
                                        ? lastPeriod.dailySeniority
                                        : 0;
                                    return [{
                                        totalMonthEquivalent: result.breakdown.reduce<number>(
                                            (total, item) => total + (isRecord(item) && typeof item.monthEquivalent === 'number' ? item.monthEquivalent : 0),
                                            0,
                                        ),
                                        finalDailyMinimumWage: dailyMinimumWage,
                                        finalDailySeniority: dailySeniority,
                                        finalDailyWage: dailyMinimumWage + dailySeniority,
                                    }];
                                })()
                                : result.breakdown;
                            const formattedValue = result.unit === 'ریال'
                                ? formatCurrency(result.value)
                                : toPersianDigits(Number.isInteger(result.value) ? String(result.value) : result.value.toFixed(2));
                            const amountText = result.error ?? (result.unit === 'ریال' ? formattedValue : `${formattedValue} ${result.unit}`);
                            const totalPeriodEntitlement = result.key === 'entitled-seniority' ? getResultAmount(result) : 0;
                            const hasInsuranceSummary = isInsuranceCalculationKey(result.key) && !result.error;
                            const roundedInsuranceBaseAmount = hasInsuranceSummary
                                ? Math.round(getInsuranceBaseAmount(result))
                                : 0;
                            const workerInsuranceAmount = isWorkerInsuranceExempt
                                ? 0
                                : Math.round(roundedInsuranceBaseAmount * 0.07);
                            const employerInsuranceAmount = Math.round(roundedInsuranceBaseAmount * 0.23);
                            const finalClaimAmount = roundedInsuranceBaseAmount - workerInsuranceAmount;
                            const summaryLabelText = result.key === 'monthly-shift-work'
                                ? `${RESULT_SUMMARY_LABELS[result.key]} (${SHIFT_TYPE_OPTIONS.find((option) => option.value === shiftType)?.label ?? 'صبح و عصر'})`
                                : result.key === 'entitled-seniority' && workshopType === 'classified'
                                    ? 'پایه سنوات استحقاقی روزانه گروه شغلی'
                                    : RESULT_SUMMARY_LABELS[result.key];
                            const detailHeading = result.key === 'unused-leave-wage'
                                || result.key === 'unused-leave-entitlement'
                                || result.key === 'end-of-service-years'
                                || result.key === 'official-holidays-in-range'
                                ? 'جزئیات محاسبه'
                                : result.key === 'entitled-seniority'
                                    ? 'جزئیات بازه‌های محاسبه'
                                    : result.key === 'insurance-days-entitlement'
                                        ? 'جزئیات ماه‌ها'
                                        : 'جزئیات دوره‌ها';
                            const toolInfo = GROUP_TOOLS.find((tool) => tool.key === result.key);
                            return (
                                <Card key={result.key} style={[styles.resultCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                                    <Card.Content style={styles.resultContent}>
                                        <View style={styles.resultHeading}>
                                            <View style={styles.resultTitleRow}>
                                                <View style={[styles.resultBadge, { backgroundColor: toolInfo?.accent ?? theme.primary }]}>
                                                    <MaterialCommunityIcons name={toolInfo?.icon ?? 'calculator-variant'} size={16} color="#FFFFFF" />
                                                </View>
                                                <ThemedText type="smallBold" style={styles.resultTitle}>
                                                    {getResultTitle(result, workshopType)}
                                                </ThemedText>
                                            </View>
                                        </View>
                                        <HiddenCalculationGuide title="راهنمای محاسبه">
                                            شرح مبالغ، روزها و ضرایب مؤثر در نتیجه در جزئیات دوره‌های همین کارت آمده است.
                                        </HiddenCalculationGuide>

                                        {hasInsuranceSummary ? (
                                            <View style={[styles.insuranceSummary, { borderColor: theme.border }]}>
                                                <View style={[styles.insuranceSummaryRow, { backgroundColor: theme.surface }]}>
                                                    <ThemedText type="smallBold" style={[styles.insuranceSummaryLabel, { color: theme.textSecondary }]}>
                                                        {result.key === 'entitled-seniority'
                                                            ? workshopType === 'classified'
                                                                ? 'پایه سنوات استحقاقی کل دوره گروه شغلی'
                                                                : 'پایه سنوات استحقاقی کل دوره'
                                                            : summaryLabelText}
                                                    </ThemedText>
                                                    <ThemedText type="smallBold" style={[styles.insuranceSummaryValue, { color: theme.text }]}>
                                                        {result.key === 'entitled-seniority'
                                                            ? formatCurrency(totalPeriodEntitlement)
                                                            : amountText}
                                                    </ThemedText>
                                                </View>
                                                {result.key === 'entitled-seniority' ? (
                                                    <View style={[styles.insuranceSummaryRow, { backgroundColor: theme.surface }]}>
                                                        <ThemedText type="small" style={[styles.insuranceSummaryLabel, { color: theme.textSecondary }]}>
                                                            {summaryLabelText}
                                                        </ThemedText>
                                                        <ThemedText type="smallBold" style={[styles.insuranceSummaryValue, { color: theme.text }]}>
                                                            {amountText}
                                                        </ThemedText>
                                                    </View>
                                                ) : null}
                                                <View style={[styles.insuranceSummaryRow, { backgroundColor: theme.surface }]}>
                                                    <ThemedText type="small" style={[styles.insuranceSummaryLabel, { color: theme.textSecondary }]}>
                                                        سهم بیمهٔ کارگر (۷٪{isWorkerInsuranceExempt ? '، معاف' : ''})
                                                    </ThemedText>
                                                    <ThemedText type="smallBold" style={[styles.insuranceSummaryValue, { color: theme.text }]}>
                                                        {formatCurrency(workerInsuranceAmount)}
                                                    </ThemedText>
                                                </View>
                                                <View style={[styles.insuranceSummaryRow, { backgroundColor: theme.surface }]}>
                                                    <ThemedText type="small" style={[styles.insuranceSummaryLabel, { color: theme.textSecondary }]}>
                                                        سهم بیمهٔ کارفرما (۲۳٪)
                                                    </ThemedText>
                                                    <ThemedText type="smallBold" style={[styles.insuranceSummaryValue, { color: theme.text }]}>
                                                        {formatCurrency(employerInsuranceAmount)}
                                                    </ThemedText>
                                                </View>
                                                <View style={[styles.insuranceSummaryRow, styles.insuranceSummaryFinalRow, { backgroundColor: theme.primaryContainer }]}>
                                                    <ThemedText type="smallBold" style={[styles.insuranceSummaryLabel, { color: theme.textSecondary }]}>
                                                        مبلغ پس از کسر سهم بیمهٔ کارگر
                                                    </ThemedText>
                                                    <ThemedText type="smallBold" style={[styles.insuranceSummaryValue, { color: theme.primary }]}>
                                                        {formatCurrency(finalClaimAmount)}
                                                    </ThemedText>
                                                </View>
                                            </View>
                                        ) : (
                                            <>
                                                {result.key === 'entitled-seniority' ? (
                                                    <View style={styles.summaryBoxHeader}>
                                                        <View style={[styles.summaryBoxContent, { backgroundColor: theme.primaryContainer, borderColor: theme.primary }]}>
                                                            <ThemedText type="small" style={[styles.summaryLabel, { color: theme.textSecondary }]}>
                                                                {workshopType === 'classified'
                                                                    ? 'پایه سنوات استحقاقی کل دوره گروه شغلی'
                                                                    : 'پایه سنوات استحقاقی کل دوره'}
                                                            </ThemedText>
                                                            <ThemedText type="largeTitle" style={[styles.amountValue, { color: theme.primary }]}>
                                                                {formatCurrency(totalPeriodEntitlement)}
                                                            </ThemedText>
                                                        </View>
                                                    </View>
                                                ) : null}
                                                <View style={styles.summaryBoxHeader}>
                                                    <View style={[styles.summaryBoxContent, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                                                        <ThemedText type="small" style={[styles.summaryLabel, { color: theme.textSecondary }]}>
                                                            {summaryLabelText}
                                                        </ThemedText>
                                                        <ThemedText type="largeTitle" style={[styles.amountValue, { color: result.error ? theme.error : theme.primary }]}>
                                                            {amountText}
                                                        </ThemedText>
                                                    </View>
                                                </View>
                                            </>
                                        )}

                                        <View style={styles.breakdownSectionHeader}>
                                            <ThemedText type="smallBold" style={[styles.breakdownSectionTitle, { color: theme.text }]}>
                                                {detailHeading}
                                            </ThemedText>
                                            <Pressable
                                                onPress={() => setExpandedResults((current) => ({ ...current, [result.key]: !isExpanded }))}
                                                style={[styles.toggleButton, { backgroundColor: theme.surface, borderColor: theme.border }]}
                                            >
                                                <ThemedText type="smallBold" style={[styles.toggleButtonLabel, { color: theme.primary }]}>
                                                    {isExpanded ? 'عدم نمایش' : 'نمایش جزئیات'}
                                                </ThemedText>
                                                <MaterialCommunityIcons
                                                    name={isExpanded ? 'chevron-up' : 'chevron-down'}
                                                    size={18}
                                                    color={theme.primary}
                                                />
                                            </Pressable>
                                        </View>

                                        {isExpanded ? (
                                            <View style={styles.breakdownSection}>
                                                {(!result.error && (detailBreakdown.length > 0 || result.key === 'unused-leave-entitlement')) ? (
                                                    <View style={styles.breakdownGrid}>
                                                        {result.key === 'unused-leave-entitlement' ? (
                                                            <View style={[styles.breakdownItemCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                                                                <View style={styles.breakdownItemHeaderRow}>
                                                                    <ThemedText type="smallBold" style={[styles.breakdownItemTitle, { color: theme.text }]}>
                                                                        خلاصه محاسبه
                                                                    </ThemedText>
                                                                </View>
                                                                <View style={styles.breakdownDetailGrid}>
                                                                    <View style={[styles.breakdownDetailBox, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}>
                                                                        <ThemedText type="small" style={[styles.detailLabel, { color: theme.textSecondary }]}>کل استحقاق</ThemedText>
                                                                        <ThemedText type="smallBold" style={[styles.detailValue, { color: theme.text }]}>
                                                                            {formatBreakdownNumber(result.breakdown.reduce<number>((total, item) => total + (isRecord(item) && typeof item.entitlementDays === 'number' ? item.entitlementDays : 0), 0))} روز
                                                                        </ThemedText>
                                                                    </View>
                                                                    <View style={[styles.breakdownDetailBox, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}>
                                                                        <ThemedText type="small" style={[styles.detailLabel, { color: theme.textSecondary }]}>کل مرخصی استفاده‌شده</ThemedText>
                                                                        <ThemedText type="smallBold" style={[styles.detailValue, { color: theme.text }]}>
                                                                            {formatBreakdownNumber(result.breakdown.reduce<number>((total, item) => total + (isRecord(item) && typeof item.usedLeaveDays === 'number' ? item.usedLeaveDays : 0), 0))} روز
                                                                        </ThemedText>
                                                                    </View>
                                                                    <View style={[styles.breakdownDetailBox, { backgroundColor: theme.primaryContainer, borderColor: theme.primary }]}>
                                                                        <ThemedText type="small" style={[styles.detailLabel, { color: theme.textSecondary }]}>ذخیره نهایی</ThemedText>
                                                                        <ThemedText type="smallBold" style={[styles.detailValue, { color: theme.primary }]}>
                                                                            {formatBreakdownNumber(result.value)} روز
                                                                        </ThemedText>
                                                                    </View>
                                                                </View>
                                                            </View>
                                                        ) : null}
                                                        {detailBreakdown.map((entry, index) => {
                                                            const detailRecord = isRecord(entry)
                                                                ? getInsurancePeriodDetailRecord(result.key, entry)
                                                                : null;
                                                            const title = detailRecord
                                                                ? formatBreakdownTitle(result.key, detailRecord, index, startDate, endDate)
                                                                : `${getResultTitle(result, workshopType)} ${toPersianDigits(index + 1)}`;
                                                            const detailFields = detailRecord
                                                                ? getBreakdownDetailFields(result.key, detailRecord, workshopType)
                                                                : [];

                                                            return (
                                                                <View key={`${result.key}-detail-${index}`} style={[styles.breakdownItemCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                                                                    <View style={styles.breakdownItemHeaderRow}>
                                                                        <ThemedText type="smallBold" style={[styles.breakdownItemTitle, { color: theme.text }]}>
                                                                            {title}
                                                                        </ThemedText>
                                                                    </View>
                                                                    <View style={styles.breakdownDetailGrid}>
                                                                        {detailFields.map((field) => {
                                                                            if (field.format === 'last-period' && detailRecord) {
                                                                                return (
                                                                                    <ThemedText key={`${result.key}-${field.key}-${field.format}-${index}`} type="small" style={[styles.detailContext, { color: theme.textSecondary }]}>
                                                                                        {formatBreakdownDetail(field, detailRecord, result.key, currencyPreference)}
                                                                                    </ThemedText>
                                                                                );
                                                                            }
                                                                            const isEmphasized = field.format === 'range'
                                                                                || ['amount', 'dailyWage', 'entitlement', 'entitlementAmount', 'daysCalculated', 'savedLeaveDays', 'carryAfter', 'requiredHours', 'workingDays', 'unusedLeaveDays', 'finalDailyWage', 'fridayWorkRate'].includes(field.key);
                                                                            const isWarning = field.key === 'excessUsedDays';
                                                                            return (
                                                                                <View key={`${result.key}-${field.key}-${field.format}-${index}`} style={[styles.breakdownDetailBox, { backgroundColor: isEmphasized ? theme.primaryContainer : theme.surfaceVariant, borderColor: isEmphasized ? theme.primary : theme.border }]}>
                                                                                    <ThemedText type="small" style={[styles.detailLabel, { color: theme.textSecondary }]}>
                                                                                        {field.label}
                                                                                    </ThemedText>
                                                                                    <ThemedText type="smallBold" style={[styles.detailValue, { color: isWarning ? theme.error : isEmphasized ? theme.primary : theme.text }]}>
                                                                                        {detailRecord ? formatBreakdownDetail(field, detailRecord, result.key, currencyPreference) : '-'}
                                                                                    </ThemedText>
                                                                                </View>
                                                                            );
                                                                        })}
                                                                    </View>
                                                                </View>
                                                            );
                                                        })}
                                                    </View>
                                                ) : (
                                                    <ThemedText type="small" style={{ color: theme.textSecondary }}>
                                                        {result.error ?? 'جزئیاتی برای این محاسبه ثبت نشده است.'}
                                                    </ThemedText>
                                                )}
                                            </View>
                                        ) : null}
                                    </Card.Content>
                                </Card>
                            );
                        })}
                    </View>
                ) : null}
            </ScrollView>

            <PdfHtmlPreview
                visible={pdfPreviewVisible}
                html={pdfPreviewHtml}
                action={pdfAction}
                onClose={() => setPdfPreviewVisible(false)}
                onShare={() => void handleExportPdf('share')}
                onSave={() => void handleExportPdf('save')}
            />

            <PersianDatePickerModal
                visible={pickerTarget !== null}
                value={
                    pickerTarget === 'employment' ? employmentDate
                        : pickerTarget === 'mission-start' ? missionStartDate
                            : pickerTarget === 'mission-end' ? missionEndDate
                                : pickerTarget === 'start' ? startDate : endDate
                }
                title={
                    pickerTarget === 'employment' ? 'انتخاب تاریخ استخدام'
                        : pickerTarget === 'mission-start' ? 'انتخاب شروع مأموریت'
                            : pickerTarget === 'mission-end' ? 'انتخاب پایان مأموریت'
                                : pickerTarget === 'start' ? 'انتخاب تاریخ شروع' : 'انتخاب تاریخ پایان'
                }
                onClose={() => setPickerTarget(null)}
                onSelect={selectDate}
                availableYears={availableYears}
            />
            <PersianTimePickerModal
                visible={timePickerVisible}
                value={dailyOvertimeHours}
                title="انتخاب زمان اضافه کاری"
                onClose={() => setTimePickerVisible(false)}
                onSelect={(value) => {
                    setDailyOvertimeHours(value);
                    setTimePickerVisible(false);
                }}
                maxHours={8}
                maxMinutesAtMaxHour={0}
            />
            <Snackbar
                visible={conflictSnackbarVisible}
                onDismiss={() => setConflictSnackbarVisible(false)}
                duration={5000}
                style={{ backgroundColor: theme.error }}
                action={{
                    label: 'بستن',
                    onPress: () => setConflictSnackbarVisible(false),
                    labelStyle: { color: theme.surface },
                }}
            >
                <ThemedText type="small" style={{ color: theme.surface }}>
                    {NIGHT_SHIFT_CONFLICT_MESSAGE}
                </ThemedText>
            </Snackbar>
            <Snackbar
                visible={pdfSnackbarVisible}
                onDismiss={() => setPdfSnackbarVisible(false)}
                duration={5000}
                style={{ backgroundColor: pdfSnackbarIsError ? theme.error : theme.success }}
                action={{
                    label: 'بستن',
                    onPress: () => setPdfSnackbarVisible(false),
                    labelStyle: { color: theme.surface },
                }}
            >
                <ThemedText type="small" style={{ color: theme.surface }}>
                    {pdfSnackbarMessage}
                </ThemedText>
            </Snackbar>
        </ThemedView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    content: { flexGrow: 1, paddingHorizontal: 0, gap: Spacing.three },
    intro: { gap: Spacing.two },
    introGuidance: { gap: Spacing.one, paddingVertical: Spacing.two, paddingHorizontal: Spacing.three, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth },
    introGuidanceText: { fontSize: 12, lineHeight: 18 },
    introHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two, paddingHorizontal: Spacing.three },
    selectAllLabel: { fontFamily: 'AppFont-Medium', fontSize: 12 },
    resultsTitle: { paddingHorizontal: Spacing.three },
    card: { borderRadius: Radius.md, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
    selectionList: { paddingVertical: 0, paddingHorizontal: 0 },
    selectionSeparator: { height: StyleSheet.hairlineWidth, marginStart: Spacing.three + 50 + Spacing.two },
    selectionCheckbox: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderRadius: 6 },
    form: { gap: Spacing.three, paddingVertical: Spacing.four, paddingHorizontal: Spacing.three },
    calculateButton: { borderRadius: 10 },
    calculateButtonLabel: { fontFamily: 'AppFont-Bold', fontSize: 12 },
    inputSection: { gap: Spacing.two, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: Spacing.two },
    contractorAnalysisSection: { gap: Spacing.two, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: Spacing.two },
    employeeInfoSection: { gap: Spacing.two, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: Spacing.three },
    employeeInfoHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
    employeeInfoIcon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
    employeeInfoTitle: { fontSize: 14 },
    employeeInfoHint: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one, paddingHorizontal: Spacing.two, paddingVertical: Spacing.one, borderRadius: 8 },
    employeeInfoHintText: { flex: 1 },
    employeeTextInput: { backgroundColor: 'transparent' },
    employeeTextInputContent: { textAlign: 'right', fontFamily: 'AppFont-Regular' },
    employeeTextInputOutline: { borderRadius: 10 },
    specificCalculationSection: { gap: Spacing.two, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: Spacing.two },
    inputSectionHeader: { gap: Spacing.one },
    dateRow: { flexDirection: 'row', alignItems: 'stretch', gap: Spacing.two },
    formField: { gap: Spacing.two },
    maritalOptionsRow: { flexDirection: 'row', gap: Spacing.two },
    maritalOption: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.one, paddingVertical: Spacing.two, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth },
    fieldGroup: { gap: Spacing.one, padding: Spacing.two, borderRadius: 12 },
    fieldGroupLabel: { fontSize: 11, lineHeight: 18 },
    valuePicker: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.two, paddingVertical: Spacing.two, borderRadius: 8, borderWidth: 1 },
    valuePickerText: { flex: 1, fontSize: 13, fontFamily: 'AppFont-Regular' },
    periodInputCard: { gap: Spacing.one, borderRadius: Radius.md, borderWidth: StyleSheet.hairlineWidth, padding: Spacing.two },
    periodInputHeader: { gap: Spacing.half },
    fieldHint: { fontSize: 11, lineHeight: 20, fontFamily: 'AppFont-Regular' },
    dayCountStepper: { minHeight: 50, flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: Spacing.one, gap: Spacing.one },
    leaveInitialBox: { gap: Spacing.one, borderRadius: 14, padding: Spacing.two },
    leaveSegmentsBox: { gap: Spacing.two, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: Spacing.two },
    leaveSegmentRow: { flexDirection: 'column', alignItems: 'stretch', gap: Spacing.two },
    leaveSegmentLabel: { flex: 1, fontSize: 12, lineHeight: 19 },
    stepperButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
    stepperButtonDisabled: { opacity: 0.4 },
    stepperInput: { flex: 1, minHeight: 42, paddingVertical: 0, fontFamily: 'AppFont-Bold', fontSize: 14 },
    shiftTypeField: { gap: Spacing.one, padding: Spacing.two, borderRadius: 12 },
    shiftOptionsGroup: { flexDirection: 'column', gap: Spacing.one },
    shiftOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.two, paddingVertical: Spacing.two, borderRadius: 12, borderWidth: 1 },
    numberInput: { minHeight: 44, borderRadius: 8, paddingHorizontal: Spacing.two, fontFamily: 'AppFont-Medium', textAlign: 'right' },
    periodInputRow: { gap: Spacing.one },
    groupPicker: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.two, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth },
    results: { gap: Spacing.two },
    pdfExportSection: { gap: Spacing.three, padding: Spacing.three, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth },
    insuranceOptions: { gap: Spacing.one },
    insuranceExemptionOption: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, padding: Spacing.two, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12 },
    insuranceExemptionText: { flex: 1, gap: Spacing.half },
    insuranceExemptionDescription: { fontSize: 12 },
    insuranceLegalBasis: { gap: Spacing.one, padding: Spacing.two, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12 },
    insuranceLegalSummary: { fontSize: 12, lineHeight: 18 },
    insuranceLegalToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.one, paddingVertical: Spacing.half },
    insuranceLegalToggleLabel: { fontSize: 13 },
    insuranceLegalText: { fontSize: 12, lineHeight: 20 },
    pdfExportHeader: { gap: Spacing.half },
    pdfDetailsOption: { flexDirection: 'row', alignItems: 'center', borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, paddingEnd: Spacing.two },
    pdfDetailsLabel: { flex: 1, gap: Spacing.half, paddingVertical: Spacing.two },
    pdfActions: { flexDirection: 'row', gap: Spacing.one },
    pdfActionItem: { flex: 1, minWidth: 0 },
    pdfActionButton: { minHeight: 46, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, justifyContent: 'center', paddingHorizontal: Spacing.half },
    pdfActionButtonContent: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.half },
    pdfActionButtonLabel: { flexShrink: 1, minWidth: 0, fontSize: 10, lineHeight: 16, textAlign: 'center' },
    wageTotalNote: { fontSize: 11, lineHeight: 16, textAlign: 'center' },
    resultCard: { borderRadius: Radius.md, borderWidth: StyleSheet.hairlineWidth },
    resultContent: { gap: Spacing.two, paddingVertical: Spacing.two, paddingHorizontal: Spacing.three },
    resultHeading: { alignItems: 'stretch', justifyContent: 'space-between', gap: Spacing.one },
    resultTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', gap: Spacing.two, flex: 1, minWidth: 0 },
    resultBadge: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
    resultTitle: { textAlign: 'right', flexShrink: 1 },
    resultHeaderActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' },
    resultToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.two, paddingVertical: Spacing.two, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth },
    resultToggleLabel: { fontSize: 12 },
    summaryBoxHeader: { alignItems: 'center', marginBottom: Spacing.one },
    summaryBoxContent: { width: '100%', borderRadius: 12, borderWidth: 1, padding: Spacing.two, gap: Spacing.one, alignItems: 'center' },
    contractorTotalBox: { width: '100%', borderRadius: 12, borderWidth: 1, padding: Spacing.two, gap: Spacing.one, alignItems: 'center' },
    contractorInsuranceNote: { fontSize: 10, textAlign: 'center' },
    summaryLabel: { fontSize: 12, lineHeight: 18 },
    amountValue: { fontSize: 16, lineHeight: 22, fontFamily: 'AppFont-Bold' },
    insuranceSummary: { width: '100%', overflow: 'hidden', borderRadius: 12, borderWidth: StyleSheet.hairlineWidth },
    insuranceSummaryRow: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two, paddingHorizontal: Spacing.two, paddingVertical: Spacing.one },
    insuranceSummaryFinalRow: { borderTopWidth: StyleSheet.hairlineWidth },
    insuranceSummaryLabel: { flex: 1, fontSize: 12, lineHeight: 18 },
    insuranceSummaryValue: { maxWidth: '55%', flexShrink: 1, fontSize: 16, lineHeight: 22, fontFamily: 'AppFont-Bold', textAlign: 'left' },
    breakdownSection: { gap: Spacing.two },
    breakdownSectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.one, paddingVertical: Spacing.one, gap: Spacing.one },
    breakdownSectionTitle: { fontSize: 13, fontFamily: 'AppFont-Bold' },
    toggleButton: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: Spacing.two, paddingVertical: Spacing.one },
    toggleButtonLabel: { fontSize: 11 },
    breakdownGrid: { gap: Spacing.two },
    breakdownItemCard: { borderRadius: Radius.md, borderWidth: 1, padding: Spacing.two, gap: Spacing.one },
    breakdownItemHeaderRow: { paddingTop: 2, paddingBottom: 2, marginBottom: 2, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(0, 0, 0, 0.12)' },
    breakdownItemTitle: { fontSize: 13, lineHeight: 19, fontFamily: 'AppFont-Bold', textAlign: 'center' },
    breakdownDetailGrid: { gap: Spacing.one },
    breakdownDetailBox: { borderRadius: 8, borderWidth: 1, padding: Spacing.one, gap: Spacing.one, alignItems: 'center' },
    detailLabel: { fontSize: 12, lineHeight: 18, textAlign: 'center' },
    detailValue: { paddingHorizontal: Spacing.two, paddingBottom: Spacing.two, fontSize: 16, lineHeight: 22, fontFamily: 'AppFont-Bold', textAlign: 'center' },
    detailContext: { textAlign: 'center' },
});