import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect } from 'expo-router';
import { toGregorian, toJalaali } from 'jalaali-js';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onlineManager, useInfiniteQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { ActivityIndicator, Animated, Pressable, RefreshControl, SectionList, StyleSheet, View, useWindowDimensions } from 'react-native';
import AnimatedReanimated, { Easing, FadeIn, FadeOut, LinearTransition, ReduceMotion } from 'react-native-reanimated';
import { TabView } from 'react-native-tab-view';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ErrorNoticeCard } from '@/components/error-notice-card';
import { DateInputField } from '@/components/date-input-field';
import { OfflineDataNotice } from '@/components/offline-data-notice';
import { PersianDatePickerModal } from '@/components/persian-date-picker-modal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { useAppFeedback } from '@/hooks/use-app-feedback';
import { useOnlineRefetch } from '@/hooks/use-online-refetch';
import { useTheme } from '@/hooks/use-theme';
import {
    fetchPaymentOrderHistory,
    fetchWalletTransactionHistory,
    fetchWithdrawalHistory,
    getStoredAuthToken,
    isTemporaryApiFailure,
    type PaginatedResult,
    type PaymentOrderHistoryItem,
    type WalletTransactionHistoryItem,
    type WithdrawalHistoryItem,
} from '@/services/auth-api';
import { getUserFacingErrorMessage } from '@/services/user-facing-error';
import { getOfflineCacheEntry, updateOfflineCacheEntry } from '@/services/offline-cache';
import { CACHE_KEYS, CACHE_POLICY } from '@/services/cache-policy';
import { formatPersianDate } from '@/utils/persian-date';

type HistoryTab = 'transactions' | 'payments' | 'withdrawals';
type HistoryDateRange = { from: string | null; to: string | null };
type DatePickerTarget = 'from' | 'to';
const FINANCIAL_HISTORY_TIME_ZONE = 'Asia/Tehran';
const FINANCIAL_HISTORY_CACHE_POLICY = CACHE_POLICY.offline.entries.financialHistory;
const FINANCIAL_HISTORY_CACHE_MAX_AGE_MS = FINANCIAL_HISTORY_CACHE_POLICY.maxAgeMs;
const tehranDayPartsFormatter = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    timeZone: FINANCIAL_HISTORY_TIME_ZONE,
});
const tehranDateFormatter = new Intl.DateTimeFormat('fa-IR', {
    dateStyle: 'long',
    calendar: 'persian',
    numberingSystem: 'arabext',
    timeZone: FINANCIAL_HISTORY_TIME_ZONE,
});
const tehranTimeFormatter = new Intl.DateTimeFormat('fa-IR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: FINANCIAL_HISTORY_TIME_ZONE,
});

interface HistoryRow {
    id: string;
    kind: 'transaction' | 'payment' | 'withdrawal';
    title: string;
    icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
    details: HistoryDetail[];
    status: string;
    amount: number;
    currency: string;
    createdAt: string;
    amountDirection: 'debit' | 'credit' | 'neutral';
}

interface HistoryDetail {
    label: string;
    value: string;
    copyValue?: string;
    section?: 'overview' | 'amount' | 'gateway' | 'payout' | 'dates';
}

interface HistoryDetailGroup {
    section: NonNullable<HistoryDetail['section']>;
    details: HistoryDetail[];
}

interface HistoryGroup {
    date: string;
    title: string;
    data: HistoryRow[];
}

type FinancialHistoryPage = PaginatedResult<HistoryRow> & {
    offlineCacheSavedAt?: number;
};

interface CachedFinancialHistorySnapshot {
    version: 1;
    pages: {
        pageParam: number;
        savedAt: number;
        data: PaginatedResult<HistoryRow>;
    }[];
}

const receiptDetailTitles: Record<HistoryRow['kind'], string> = {
    transaction: 'جزئیات تراکنش',
    payment: 'جزئیات پرداخت',
    withdrawal: 'جزئیات برداشت',
};

const tabs: {
    key: HistoryTab;
    label: string;
    icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
}[] = [
        {
            key: 'transactions',
            label: 'تراکنش‌ها',
            icon: 'swap-vertical',
        },
        {
            key: 'payments',
            label: 'پرداخت‌ها',
            icon: 'credit-card-outline',
        },
        {
            key: 'withdrawals',
            label: 'برداشت‌ها',
            icon: 'bank-transfer-out',
        },
    ];

const historyRoutes = tabs.map(({ key, label }) => ({ key, title: label }));

const tabAccessibilityDescriptions: Record<HistoryTab, string> = {
    transactions: 'تغییرات ثبت‌شده در موجودی کیف پول؛ از شارژ و پرداخت تا بازگشت وجه و مبلغ رزروشدهٔ برداشت.',
    payments: 'سفارش‌های خرید پلن و شارژ؛ همراه با سهم کیف پول، درگاه و کد پیگیری.',
    withdrawals: 'درخواست‌های برداشت از کیف پول و وضعیت بررسی و واریز.',
};

const financialHistoryQueryKey = CACHE_KEYS.financialHistory;

const transactionLabels: Record<string, string> = {
    deposit: 'شارژ کیف پول',
    debit: 'پرداخت با کیف پول',
    refund: 'بازگشت وجه به کیف پول',
    subscription: 'پرداخت اشتراک از درگاه',
    withdrawal_hold: 'رزرو مبلغ برداشت',
    withdrawal_release: 'بازگشت مبلغ برداشت',
};

const transactionIcons: Record<string, React.ComponentProps<typeof MaterialCommunityIcons>['name']> = {
    deposit: 'wallet-plus-outline',
    debit: 'wallet-outline',
    refund: 'cash-refund',
    subscription: 'credit-card-check-outline',
    withdrawal_hold: 'bank-transfer-out',
    withdrawal_release: 'bank-transfer-in',
};

const statusLabels: Record<string, string> = {
    pending: 'در انتظار',
    processing: 'در حال پردازش',
    initiating: 'در حال آغاز پرداخت',
    initiation_unknown: 'نیازمند بررسی پرداخت',
    initiating_unknown: 'نیازمند بررسی پرداخت',
    succeeded: 'موفق',
    refunded: 'بازپرداخت‌شده',
    failed: 'ناموفق',
    rejected: 'ردشده',
    approved_pending_payout: 'تأییدشده؛ در انتظار واریز',
    paid: 'پرداخت‌شده',
    reserved: 'رزروشده',
    consumed: 'نهایی‌شده',
    released: 'آزادشده',
};

const kindLabels: Record<string, string> = {
    subscription: 'خرید یا تمدید اشتراک',
    wallet_top_up: 'شارژ کیف پول',
};

const gatewayLabels: Record<string, string> = {
    idpay: 'آیدی‌پی',
    zarinpal: 'زرین‌پال',
};

const planTierLabels: Record<string, string> = {
    bronze: 'برنزی',
    silver: 'نقره‌ای',
    gold: 'طلایی',
};

const planDurationLabels: Record<string, string> = {
    '1_month': 'یک‌ماهه',
    '3_months': 'سه‌ماهه',
    '6_months': 'شش‌ماهه',
    '1_year': 'یک‌ساله',
};

function FinancialHistoryTab({
    icon,
    label,
    description,
    selected,
    theme,
    onPress,
}: {
    icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
    label: string;
    description: string;
    selected: boolean;
    theme: ReturnType<typeof useTheme>;
    onPress: () => void;
}) {
    const indicatorProgress = useState(() => new Animated.Value(selected ? 1 : 0))[0];

    useEffect(() => {
        Animated.spring(indicatorProgress, {
            toValue: selected ? 1 : 0,
            damping: 18,
            stiffness: 180,
            mass: 0.7,
            useNativeDriver: true,
        }).start();
    }, [indicatorProgress, selected]);

    return (
        <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={`${label}، ${description}`}
            onPress={onPress}
            style={({ pressed }) => [
                styles.tab,
                { backgroundColor: pressed ? theme.surfaceVariant : theme.surface },
            ]}
        >
            <View style={styles.tabLabel}>
                <MaterialCommunityIcons
                    name={icon}
                    size={18}
                    color={selected ? theme.primaryText : theme.textSecondary}
                />
                <ThemedText
                    type={selected ? 'smallBold' : 'small'}
                    numberOfLines={1}
                    style={{ color: selected ? theme.primaryText : theme.textSecondary }}
                >
                    {label}
                </ThemedText>
            </View>
            <Animated.View
                style={[
                    styles.tabIndicator,
                    {
                        backgroundColor: theme.primaryText,
                        opacity: indicatorProgress,
                        transform: [{ scaleX: indicatorProgress }],
                    },
                ]}
            />
        </Pressable>
    );
}

function formatAmount(
    amount: number,
    currency: string,
    direction: HistoryRow['amountDirection'],
): string {
    const sign = amount === 0
        ? ''
        : direction === 'debit'
            ? '−'
            : direction === 'credit'
                ? '+'
                : '';
    const unit = currency === 'TOMAN' ? 'تومان' : currency;
    const numericAmount = `${sign}${Math.abs(amount).toLocaleString('fa-IR')}`;
    const displayedAmount = sign ? `\u2066${numericAmount}\u2069` : numericAmount;
    return `${displayedAmount} ${unit}`;
}

function getTehranDayParts(value: string | Date): { year: number; month: number; day: number } | null {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return null;

    const parts = tehranDayPartsFormatter.formatToParts(date);
    const year = Number(parts.find((part) => part.type === 'year')?.value);
    const month = Number(parts.find((part) => part.type === 'month')?.value);
    const day = Number(parts.find((part) => part.type === 'day')?.value);
    return Number.isInteger(year) && Number.isInteger(month) && Number.isInteger(day)
        ? { year, month, day }
        : null;
}

function getTehranDayKey(value: string | Date): string {
    const parts = getTehranDayParts(value);
    return parts ? `${parts.year}-${parts.month}-${parts.day}` : 'unknown';
}

function getTehranToday(): string {
    const parts = getTehranDayParts(new Date());
    if (!parts) return new Date().toISOString().slice(0, 10);
    return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function gregorianToJalaaliDate(value: string): string {
    const [year, month, day] = value.split('-').map(Number);
    const date = toJalaali(year, month, day);
    return `${date.jy}/${String(date.jm).padStart(2, '0')}/${String(date.jd).padStart(2, '0')}`;
}

function jalaaliToGregorianDate(value: string): string {
    const [year, month, day] = value.split('/').map(Number);
    const date = toGregorian(year, month, day);
    return `${date.gy}-${String(date.gm).padStart(2, '0')}-${String(date.gd).padStart(2, '0')}`;
}

function formatHistoryDate(value: string | null): string {
    if (!value) return 'انتخاب تاریخ';
    const persianDigits = '۰۱۲۳۴۵۶۷۸۹';
    return gregorianToJalaaliDate(value).replace(/\d/g, (digit) => persianDigits[Number(digit)]);
}

function getTehranDayTitle(
    value: string,
    today: { year: number; month: number; day: number } | null,
    yesterday: { year: number; month: number; day: number } | null,
): string {
    const parts = getTehranDayParts(value);
    if (!parts) return 'زمان نامشخص';

    if (today && parts.year === today.year && parts.month === today.month && parts.day === today.day) {
        return 'امروز';
    }

    if (yesterday && parts.year === yesterday.year && parts.month === yesterday.month && parts.day === yesterday.day) {
        return 'دیروز';
    }

    const date = new Date(value);
    return tehranDateFormatter.format(date);
}

function formatTime(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'زمان نامشخص';
    return tehranTimeFormatter.format(date);
}

function formatDetailDate(value: string | null): string | null {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return formatPersianDate(date, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: FINANCIAL_HISTORY_TIME_ZONE,
    });
}

function formatFutureDetailDate(value: string | null): string | null {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) return null;
    return formatDetailDate(value);
}

function detail(
    label: string,
    value: string | null | undefined,
    copyable = false,
    section?: HistoryDetail['section'],
): HistoryDetail | null {
    const normalized = value?.trim();
    return normalized
        ? {
            label,
            value: normalized,
            ...(copyable ? { copyValue: normalized } : {}),
            ...(section ? { section } : {}),
        }
        : null;
}

async function copyHistoryReference(value: string): Promise<void> {
    await Clipboard.setStringAsync(value);
}

function amountDetail(
    label: string,
    amount: number,
    currency: string,
    section?: HistoryDetail['section'],
): HistoryDetail {
    return { label, value: formatAmount(amount, currency, 'neutral'), ...(section ? { section } : {}) };
}

function groupHistoryDetails(details: HistoryDetail[]): HistoryDetailGroup[] {
    const groups: HistoryDetailGroup[] = [];

    details.forEach((item) => {
        const section = item.section ?? 'overview';
        const existingGroup = groups.find((group) => group.section === section);

        if (existingGroup) {
            existingGroup.details.push(item);
        } else {
            groups.push({ section, details: [item] });
        }
    });

    const sectionPriority: HistoryDetailGroup['section'][] = [
        'amount',
        'overview',
        'gateway',
        'payout',
        'dates',
    ];
    return groups.sort(
        (first, second) => sectionPriority.indexOf(first.section) - sectionPriority.indexOf(second.section),
    );
}

function getPlanName(planKey: string): string | null {
    const [tier, ...durationParts] = planKey.split('_');
    const duration = durationParts.join('_');
    const tierLabel = planTierLabels[tier];
    const durationLabel = planDurationLabels[duration];
    return tierLabel && durationLabel ? `${tierLabel} ${durationLabel}` : null;
}

function getTransactionDescription(
    type: string,
    description: string | null,
    gateway: string | null,
): HistoryDetail[] {
    const gatewayLabel = gateway
        ? gatewayLabels[gateway] ?? 'درگاه پرداخت'
        : null;
    const gatewayDetail = detail('درگاه پرداخت', gatewayLabel, false, 'gateway');

    switch (type) {
        case 'deposit':
            return [
                detail('توضیحات', 'موجودی کیف پول پس از تأیید پرداخت افزایش یافت.', false, 'overview'),
                gatewayDetail,
            ].filter((item): item is HistoryDetail => item !== null);
        case 'debit': {
            const translatedPlanPrefix = 'پرداخت از موجودی کیف پول برای اشتراک ';
            const legacyPlanPrefix = 'Wallet contribution for subscription ';
            const planValue = description?.startsWith(translatedPlanPrefix)
                ? description.slice(translatedPlanPrefix.length).trim()
                : description?.startsWith(legacyPlanPrefix)
                    ? description.slice(legacyPlanPrefix.length).trim()
                    : null;
            const planName = planValue
                ? getPlanName(planValue) ?? planValue
                : null;
            return [{
                label: 'توضیحات',
                value: planName
                    ? `مبلغ از موجودی کیف پول بابت خرید یا تمدید اشتراک ${planName} کسر شد.`
                    : 'مبلغ از موجودی کیف پول برای پرداخت خرید کسر شد.',
                section: 'overview',
            }];
        }
        case 'refund': {
            const refundDescription = description?.trim();
            return [{
                label: 'توضیحات',
                value: refundDescription || 'وجه پرداخت‌شده بابت این خرید به کیف پول بازگردانده شد.',
                section: 'overview',
            }];
        }
        case 'subscription': {
            const translatedDescriptionPrefix = 'پرداخت اشتراک ';
            const translatedOrderDelimiter = ' از طریق درگاه؛ سفارش ';
            const translatedDescription = description?.startsWith(translatedDescriptionPrefix)
                ? description.slice(translatedDescriptionPrefix.length)
                : null;
            const translatedDelimiterIndex = translatedDescription?.lastIndexOf(translatedOrderDelimiter) ?? -1;
            const translatedPlanName = translatedDelimiterIndex >= 0
                ? translatedDescription?.slice(0, translatedDelimiterIndex).trim()
                : null;
            const orderReference = translatedDelimiterIndex >= 0
                ? translatedDescription?.slice(translatedDelimiterIndex + translatedOrderDelimiter.length).trim()
                : description?.startsWith('Subscription order ')
                    ? description.slice('Subscription order '.length)
                    : description?.startsWith('پرداخت اشتراک از طریق درگاه؛ سفارش ')
                        ? description.slice('پرداخت اشتراک از طریق درگاه؛ سفارش '.length)
                        : null;
            return [
                detail(
                    'توضیحات',
                    translatedPlanName
                        ? `هزینهٔ پلن ${translatedPlanName} از طریق درگاه پرداخت شد.`
                        : 'هزینهٔ اشتراک از طریق درگاه پرداخت شد.',
                    false,
                    'overview',
                ),
                detail('کد سفارش', orderReference, true, 'overview'),
                gatewayDetail,
            ].filter((item): item is HistoryDetail => item !== null);
        }
        case 'withdrawal_hold':
            return [{
                label: 'توضیحات',
                value: 'مبلغ درخواست برداشت تا زمان بررسی، از موجودی قابل‌استفاده رزرو شد.',
                section: 'overview',
            }];
        case 'withdrawal_release':
            return [{
                label: 'توضیحات',
                value: 'به‌دلیل رد درخواست برداشت، مبلغ رزروشده به موجودی کیف پول بازگردانده شد.',
                section: 'overview',
            }];
        default:
            return [{
                label: 'توضیحات',
                value: 'شرح تکمیلی این نوع تراکنش در دسترس نیست.',
                section: 'overview',
            }];
    }
}

function groupHistoryRows(rows: HistoryRow[]): HistoryGroup[] {
    const groups = new Map<string, HistoryGroup>();
    const today = getTehranDayParts(new Date());
    const yesterdayDate = today
        ? new Date(Date.UTC(today.year, today.month - 1, today.day - 1, 12))
        : null;
    const yesterday = yesterdayDate ? getTehranDayParts(yesterdayDate) : null;
    rows.forEach((row) => {
        const date = getTehranDayKey(row.createdAt);
        const group = groups.get(date);
        if (group) {
            group.data.push(row);
        } else {
            groups.set(date, {
                date,
                title: getTehranDayTitle(row.createdAt, today, yesterday),
                data: [row],
            });
        }
    });
    return [...groups.values()];
}

const HistoryRowItem = memo(function HistoryRowItem({
    row,
    expanded,
    isLast,
    setExpandedRowId,
    onCopyReference,
    theme,
}: {
    row: HistoryRow;
    expanded: boolean;
    isLast: boolean;
    setExpandedRowId: React.Dispatch<React.SetStateAction<string | null>>;
    onCopyReference: (label: string, value: string) => Promise<void>;
    theme: ReturnType<typeof useTheme>;
}) {
    const statusColor = row.status === 'succeeded' || row.status === 'paid' || row.status === 'consumed' || row.status === 'refunded'
        ? theme.success
        : row.status === 'failed' || row.status === 'rejected'
            ? theme.error
            : theme.warning;

    return (
        <View style={styles.historyEntrySlot}>
            <AnimatedReanimated.View
                layout={LinearTransition
                    .duration(220)
                    .easing(Easing.out(Easing.cubic))
                    .reduceMotion(ReduceMotion.System)}
                style={[
                    styles.historyEntry,
                    expanded && {
                        backgroundColor: theme.surfaceVariant,
                        borderRadius: Radius.md,
                    },
                ]}
            >
                <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ expanded }}
                    onPress={() => setExpandedRowId((current) => current === row.id ? null : row.id)}
                    style={({ pressed }) => [
                        styles.historyEntryButton,
                        expanded && styles.expandedHistoryEntryButton,
                        pressed && { opacity: 0.75 },
                    ]}
                >
                    <View style={styles.historyEntryMain}>
                        <View style={[styles.historyEntryIcon, { backgroundColor: theme.primary }]}>
                            <MaterialCommunityIcons
                                name={row.icon}
                                size={18}
                                color={theme.onPrimary}
                            />
                        </View>
                        <View style={styles.historyEntryCopy}>
                            <ThemedText type="smallBold" numberOfLines={2}>{row.title}</ThemedText>
                            <View style={styles.rowMeta}>
                                <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                                <ThemedText type="small" style={{ color: statusColor }}>
                                    {statusLabels[row.status] ?? row.status}
                                </ThemedText>
                                <ThemedText type="small" style={{ color: theme.textMuted }}>
                                    {formatTime(row.createdAt)}
                                </ThemedText>
                            </View>
                        </View>
                        <View style={styles.rowTrailing}>
                            <ThemedText
                                type="smallBold"
                                numberOfLines={1}
                                style={[styles.amount, {
                                    color: row.amountDirection === 'credit'
                                        ? theme.success
                                        : row.amountDirection === 'debit'
                                            ? theme.text
                                            : theme.textSecondary,
                                }]}
                            >
                                {formatAmount(row.amount, row.currency, row.amountDirection)}
                            </ThemedText>
                            <MaterialCommunityIcons
                                name={expanded ? 'chevron-up' : 'chevron-down'}
                                size={18}
                                color={theme.textMuted}
                            />
                        </View>
                    </View>
                    {expanded ? (
                        <AnimatedReanimated.View
                            entering={FadeIn
                                .duration(210)
                                .easing(Easing.out(Easing.cubic))
                                .reduceMotion(ReduceMotion.System)}
                            exiting={FadeOut
                                .duration(170)
                                .easing(Easing.in(Easing.quad))
                                .reduceMotion(ReduceMotion.System)}
                            layout={LinearTransition
                                .duration(220)
                                .easing(Easing.out(Easing.cubic))
                                .reduceMotion(ReduceMotion.System)}
                            style={styles.rowDetails}
                        >
                            {row.details.length > 0 ? (
                                <View style={styles.receiptDetails}>
                                    {groupHistoryDetails([
                                        ...row.details,
                                        {
                                            label: 'زمان ثبت',
                                            value: formatDetailDate(row.createdAt) ?? 'نامشخص',
                                            section: 'dates',
                                        },
                                    ]).map((group, groupIndex) => (
                                        <View
                                            key={group.section}
                                            style={styles.receiptSection}
                                        >
                                            {groupIndex === 0 ? (
                                                <View style={styles.receiptTitleDivider}>
                                                    <View style={[styles.receiptTitleRule, { backgroundColor: theme.border }]} />
                                                    <ThemedText type="smallBold" style={{ color: theme.textSecondary }}>
                                                        {receiptDetailTitles[row.kind]}
                                                    </ThemedText>
                                                    <View style={[styles.receiptTitleRule, { backgroundColor: theme.border }]} />
                                                </View>
                                            ) : (
                                                <View style={[styles.receiptSectionRule, { backgroundColor: theme.border }]} />
                                            )}
                                            {group.details.map((item, index) => {
                                                const isSeparateRow = Boolean(item.copyValue)
                                                    || item.label === 'مبلغ تراکنش'
                                                    || item.label === 'ماندهٔ کیف پول پس از تراکنش';
                                                const isLong = isSeparateRow
                                                    || item.label === 'توضیحات'
                                                    || item.value.length > 46;

                                                return (
                                                    <View
                                                        key={item.label}
                                                        style={[
                                                            styles.receiptDetail,
                                                            {
                                                                borderBottomWidth: index < group.details.length - 1
                                                                    ? StyleSheet.hairlineWidth
                                                                    : 0,
                                                                borderBottomColor: theme.border,
                                                            },
                                                            isLong && styles.receiptDetailStacked,
                                                        ]}
                                                    >
                                                        <ThemedText
                                                            type="small"
                                                            style={{ color: theme.textSecondary }}
                                                        >
                                                            {item.label}:
                                                        </ThemedText>
                                                        {item.copyValue ? (
                                                            <View style={[styles.copyReference, { borderColor: theme.border }]}>
                                                                <ThemedText
                                                                    type="smallBold"
                                                                    style={[styles.copyReferenceValue, { color: theme.primaryText }]}
                                                                    selectable
                                                                >
                                                                    {item.value}
                                                                </ThemedText>
                                                                <View style={[styles.copyReferenceDivider, { backgroundColor: theme.border }]} />
                                                                <Pressable
                                                                    accessibilityRole="button"
                                                                    accessibilityLabel={`کپی ${item.label}`}
                                                                    onPress={(event) => {
                                                                        event.stopPropagation();
                                                                        void onCopyReference(item.label, item.copyValue ?? item.value);
                                                                    }}
                                                                    style={({ pressed }) => [
                                                                        styles.copyReferenceAction,
                                                                        {
                                                                            backgroundColor: theme.primary,
                                                                            borderColor: theme.primary,
                                                                        },
                                                                        pressed && styles.copyReferenceActionPressed,
                                                                    ]}
                                                                >
                                                                    <MaterialCommunityIcons
                                                                        name="content-copy"
                                                                        size={16}
                                                                        color={theme.onPrimary}
                                                                    />
                                                                    <ThemedText type="smallBold" style={{ color: theme.onPrimary }}>
                                                                        کپی
                                                                    </ThemedText>
                                                                </Pressable>
                                                            </View>
                                                        ) : (
                                                            <ThemedText
                                                                type="smallBold"
                                                                style={[
                                                                    styles.detailValue,
                                                                    { color: theme.text },
                                                                    isLong && styles.receiptLongValue,
                                                                ]}
                                                                selectable
                                                            >
                                                                {item.value}
                                                            </ThemedText>
                                                        )}
                                                    </View>
                                                );
                                            })}
                                        </View>
                                    ))}
                                </View>
                            ) : (
                                <ThemedText type="small" style={{ color: theme.textSecondary }}>
                                    جزئیات بیشتری برای این مورد ثبت نشده است.
                                </ThemedText>
                            )}
                        </AnimatedReanimated.View>
                    ) : null}
                </Pressable>
            </AnimatedReanimated.View>
            {!isLast ? (
                <View style={[styles.historySeparator, { backgroundColor: theme.border }]} />
            ) : null}
        </View>
    );
});

function transactionRow(item: WalletTransactionHistoryItem): HistoryRow {
    const amountDirection: HistoryRow['amountDirection'] = ['debit', 'subscription', 'withdrawal_hold'].includes(item.type)
        ? 'debit'
        : ['deposit', 'refund', 'withdrawal_release'].includes(item.type)
            ? 'credit'
            : 'neutral';
    const details = [
        detail(
            'وضعیت تراکنش',
            statusLabels[item.status] ?? item.status,
            false,
            'overview',
        ),
        ...getTransactionDescription(item.type, item.description, item.gateway),
        detail(
            'مبلغ تراکنش',
            formatAmount(item.amount, item.currency, amountDirection),
            false,
            'amount',
        ),
        amountDetail(
            'ماندهٔ کیف پول پس از تراکنش',
            item.balance_after,
            item.currency,
            'amount',
        ),
        detail('کد پیگیری درگاه', item.tracking_reference, true, 'gateway'),
    ].filter((item): item is HistoryDetail => item !== null);

    return {
        id: `transaction-${item.id}`,
        kind: 'transaction',
        title: transactionLabels[item.type] ?? 'سایر تراکنش‌ها',
        icon: transactionIcons[item.type] ?? 'swap-vertical',
        details,
        status: item.status,
        amount: item.amount,
        currency: item.currency,
        createdAt: item.created_at,
        amountDirection,
    };
}

function paymentRow(item: PaymentOrderHistoryItem): HistoryRow {
    const paymentIsPending = [
        'initiating',
        'pending',
        'processing',
        'initiation_unknown',
        'initiating_unknown',
    ].includes(item.status);
    const amountDirection: HistoryRow['amountDirection'] = item.status !== 'succeeded'
        ? 'neutral'
        : item.kind === 'wallet_top_up'
            ? 'credit'
            : item.kind === 'subscription'
                ? 'debit'
                : 'neutral';
    const paymentDetails = item.payments.flatMap((payment, index) => {
        const gateway = gatewayLabels[payment.gateway] ?? payment.gateway;
        const status = statusLabels[payment.status] ?? payment.status;
        const attemptLabel = item.payments.length > 1 ? `پرداخت ${index + 1}` : 'پرداخت درگاه';
        return [
            detail(`${attemptLabel} · درگاه`, gateway, false, 'gateway'),
            detail(`${attemptLabel} · وضعیت`, status, false, 'gateway'),
            detail(`${attemptLabel} · کد پیگیری درگاه`, payment.tracking_reference, true, 'gateway'),
        ];
    });
    const details = [
        detail('منبع پرداخت', item.source === 'order' ? 'سفارش' : 'پرداخت مستقل شارژ کیف پول', false, 'overview'),
        detail('نوع پرداخت', kindLabels[item.kind] ?? item.kind, false, 'overview'),
        detail('پلن', item.plan_name ?? (item.plan_key ? getPlanName(item.plan_key) : null), false, 'overview'),
        detail('کد سفارش', item.reference, true, 'overview'),
        detail('وضعیت پرداخت', statusLabels[item.status] ?? item.status, false, 'overview'),
        amountDetail('مبلغ سفارش', item.gross_amount, item.currency, 'amount'),
        item.discount_amount > 0 ? amountDetail('تخفیف', item.discount_amount, item.currency, 'amount') : null,
        item.wallet_amount > 0 ? amountDetail('پرداخت از کیف پول', item.wallet_amount, item.currency, 'amount') : null,
        item.gateway_amount > 0 ? amountDetail('پرداخت از درگاه', item.gateway_amount, item.currency, 'amount') : null,
        ...paymentDetails,
        paymentIsPending
            ? detail('مهلت تکمیل پرداخت', formatFutureDetailDate(item.expires_at), false, 'dates')
            : null,
        detail('زمان تکمیل', formatDetailDate(item.completed_at), false, 'dates'),
    ].filter((item): item is HistoryDetail => item !== null);

    return {
        id: `payment-${item.source}-${item.id}`,
        kind: 'payment',
        title: kindLabels[item.kind] ?? 'پرداخت',
        icon: item.kind === 'wallet_top_up' ? 'wallet-plus-outline' : 'credit-card-outline',
        details,
        status: item.status,
        amount: item.gross_amount,
        currency: item.currency,
        createdAt: item.created_at,
        amountDirection,
    };
}

function withdrawalRow(item: WithdrawalHistoryItem): HistoryRow {
    const details = [
        detail('وضعیت درخواست', statusLabels[item.status] ?? item.status, false, 'overview'),
        amountDetail('مبلغ درخواست', item.amount, item.currency, 'overview'),
        detail('کد درخواست', item.request_reference, true, 'overview'),
        detail(
            item.payout_method === 'card' ? 'شماره کارت مقصد' : 'شماره شبای مقصد',
            item.payout_method === 'card' ? item.bank_account_card_masked : item.bank_account_iban_masked,
            false,
            'overview',
        ),
        detail(
            'شیوهٔ انجام برداشت',
            item.payout_mode === 'automatic' ? 'خودکار' : item.payout_mode === 'manual' ? 'دستی' : item.payout_mode,
            false,
            'overview',
        ),
        detail('کد پیگیری واریز', item.payout_reference, true, 'payout'),
        detail('یادداشت بررسی', item.review_note, false, 'payout'),
        detail('زمان بررسی', formatDetailDate(item.reviewed_at), false, 'dates'),
        detail('زمان واریز', formatDetailDate(item.paid_at), false, 'dates'),
    ].filter((item): item is HistoryDetail => item !== null);

    return {
        id: `withdrawal-${item.id}`,
        kind: 'withdrawal',
        title: 'درخواست برداشت از کیف پول',
        icon: 'bank-transfer-out',
        details,
        status: item.status,
        amount: item.amount,
        currency: item.currency,
        createdAt: item.created_at,
        amountDirection: item.status === 'rejected' ? 'neutral' : 'debit',
    };
}

async function fetchFinancialHistoryPage(
    token: string,
    tab: HistoryTab,
    page: number,
    range: HistoryDateRange,
): Promise<FinancialHistoryPage> {
    const requestRange = {
        ...(range.from ? { from: range.from } : {}),
        ...(range.to ? { to: range.to } : {}),
    };
    if (tab === 'transactions') {
        const result = await fetchWalletTransactionHistory(token, page, requestRange);
        return { ...result, data: result.data.map(transactionRow) };
    }

    if (tab === 'payments') {
        const result = await fetchPaymentOrderHistory(token, page, requestRange);
        return { ...result, data: result.data.map(paymentRow) };
    }

    const result = await fetchWithdrawalHistory(token, page, requestRange);
    return { ...result, data: result.data.map(withdrawalRow) };
}

function getHistoryOfflineCacheKey(tab: HistoryTab, range: HistoryDateRange): string {
    return JSON.stringify([tab, range.from, range.to]);
}

function isHistoryRow(value: unknown): value is HistoryRow {
    if (!value || typeof value !== 'object') return false;
    const row = value as Partial<HistoryRow>;
    return typeof row.id === 'string'
        && typeof row.kind === 'string'
        && typeof row.title === 'string'
        && Array.isArray(row.details)
        && typeof row.status === 'string'
        && typeof row.amount === 'number'
        && typeof row.currency === 'string'
        && typeof row.createdAt === 'string';
}

function isCachedFinancialHistorySnapshot(value: unknown): value is CachedFinancialHistorySnapshot {
    if (!value || typeof value !== 'object') return false;
    const snapshot = value as Partial<CachedFinancialHistorySnapshot>;
    return snapshot.version === 1
        && Array.isArray(snapshot.pages)
        && snapshot.pages.every((page) => (
            typeof page.pageParam === 'number'
            && Number.isSafeInteger(page.pageParam)
            && page.pageParam > 0
            && typeof page.savedAt === 'number'
            && Number.isFinite(page.savedAt)
            && Boolean(page.data)
            && Array.isArray(page.data.data)
            && page.data.data.every(isHistoryRow)
            && typeof page.data.meta?.current_page === 'number'
            && typeof page.data.meta?.last_page === 'number'
            && typeof page.data.meta?.per_page === 'number'
            && typeof page.data.meta?.total === 'number'
        ));
}

async function getCachedFinancialHistorySnapshot(
    userId: number,
    tab: HistoryTab,
    range: HistoryDateRange,
): Promise<CachedFinancialHistorySnapshot | null> {
    const cached = await getOfflineCacheEntry<unknown>(
        userId,
        FINANCIAL_HISTORY_CACHE_POLICY.namespace,
        getHistoryOfflineCacheKey(tab, range),
        { maxAgeMs: FINANCIAL_HISTORY_CACHE_MAX_AGE_MS },
    );
    if (!cached || !isCachedFinancialHistorySnapshot(cached.value)) return null;

    const cutoff = Date.now() - FINANCIAL_HISTORY_CACHE_MAX_AGE_MS;
    const pages = cached.value.pages
        .filter((page) => page.savedAt >= cutoff && page.savedAt <= Date.now())
        .sort((first, second) => first.pageParam - second.pageParam);
    if (pages.length === 0 || pages[0]?.pageParam !== 1) return null;

    const contiguousPages = pages.filter((page, index) => page.pageParam === index + 1);
    return { version: 1, pages: contiguousPages };
}

async function saveFinancialHistoryPageToOfflineCache(
    userId: number,
    tab: HistoryTab,
    range: HistoryDateRange,
    pageParam: number,
    page: PaginatedResult<HistoryRow>,
): Promise<void> {
    await updateOfflineCacheEntry<unknown>(
        userId,
        FINANCIAL_HISTORY_CACHE_POLICY.namespace,
        getHistoryOfflineCacheKey(tab, range),
        (value) => {
            const pages = value && isCachedFinancialHistorySnapshot(value)
                ? value.pages.filter((cachedPage) => cachedPage.pageParam !== pageParam)
                : [];
            pages.push({ pageParam, data: page, savedAt: Date.now() });
            pages.sort((first, second) => first.pageParam - second.pageParam);
            return { version: 1, pages } satisfies CachedFinancialHistorySnapshot;
        },
        { maxAgeMs: FINANCIAL_HISTORY_CACHE_MAX_AGE_MS },
    );
}

async function fetchFinancialHistoryPageWithOfflineFallback(
    token: string,
    userId: number,
    tab: HistoryTab,
    pageParam: number,
    range: HistoryDateRange,
): Promise<FinancialHistoryPage> {
    const readCachedPage = async (): Promise<FinancialHistoryPage | null> => {
        const snapshot = await getCachedFinancialHistorySnapshot(userId, tab, range);
        const cachedPage = snapshot?.pages.find((page) => page.pageParam === pageParam);
        return cachedPage
            ? { ...cachedPage.data, offlineCacheSavedAt: cachedPage.savedAt }
            : null;
    };

    if (!onlineManager.isOnline()) {
        const cachedPage = await readCachedPage();
        if (cachedPage) return cachedPage;
        throw new Error('این صفحه از تاریخچه قبلاً برای استفادهٔ آفلاین ذخیره نشده است.');
    }

    try {
        const page = await fetchFinancialHistoryPage(token, tab, pageParam, range);
        try {
            await saveFinancialHistoryPageToOfflineCache(userId, tab, range, pageParam, page);
        } catch (cacheError) {
            console.error('ذخیرهٔ صفحهٔ تاریخچه مالی برای استفادهٔ آفلاین ناموفق بود.', cacheError);
        }
        return page;
    } catch (error) {
        if (!isTemporaryApiFailure(error)) throw error;

        const cachedPage = await readCachedPage();
        if (cachedPage) return cachedPage;
        throw error;
    }
}

export default function FinancialHistoryScreen() {
    const theme = useTheme();
    const insets = useSafeAreaInsets();
    const { width } = useWindowDimensions();
    const queryClient = useQueryClient();
    const { user, isLoading: authLoading } = useAuth();
    const { showError } = useAppFeedback();
    const userId = user?.id ?? null;
    const [activeTab, setActiveTab] = useState<HistoryTab>('transactions');
    const activeTabIndex = tabs.findIndex((tab) => tab.key === activeTab);
    const [dateRange, setDateRange] = useState<HistoryDateRange>({ from: null, to: null });
    const [hydratedCacheScope, setHydratedCacheScope] = useState<string | null>(null);
    const [draftRange, setDraftRange] = useState<HistoryDateRange>({ from: null, to: null });
    const [dateFilterExpanded, setDateFilterExpanded] = useState(false);
    const [datePickerTarget, setDatePickerTarget] = useState<DatePickerTarget | null>(null);
    const [rangeError, setRangeError] = useState('');
    const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
    const initializedUserId = useRef<number | null>(null);
    const previousUserId = useRef<number | null>(user?.id ?? null);
    const activeTabRef = useRef(activeTab);
    const dateRangeRef = useRef(dateRange);
    const cacheScope = userId !== null
        ? JSON.stringify([userId, dateRange.from, dateRange.to])
        : null;
    const offlineCacheReady = cacheScope !== null && hydratedCacheScope === cacheScope;
    useEffect(() => {
        activeTabRef.current = activeTab;
    }, [activeTab]);
    useEffect(() => {
        dateRangeRef.current = dateRange;
    }, [dateRange]);
    useEffect(() => {
        const nextUserId = user?.id ?? null;
        const oldUserId = previousUserId.current;
        if (oldUserId !== null && oldUserId !== nextUserId) {
            queryClient.removeQueries({ queryKey: CACHE_KEYS.financialHistoryPrefix(oldUserId) });
        }
        previousUserId.current = nextUserId;
    }, [queryClient, user?.id]);
    useEffect(() => {
        if (userId === null || authLoading || cacheScope === null) return;

        let cancelled = false;
        const scope = cacheScope;
        const range = { from: dateRange.from, to: dateRange.to };
        void Promise.all(tabs.map(async (tab) => {
            if (cancelled) return;
            const queryKey = financialHistoryQueryKey(userId, tab.key, range.from, range.to);
            if (queryClient.getQueryData(queryKey)) return;

            const snapshot = await getCachedFinancialHistorySnapshot(userId, tab.key, range);
            if (cancelled || !snapshot || snapshot.pages.length === 0) return;

            const pages = snapshot.pages.map((page) => ({
                ...page.data,
                offlineCacheSavedAt: page.savedAt,
            }));
            const updatedAt = Math.min(...snapshot.pages.map((page) => page.savedAt));
            queryClient.setQueryData<InfiniteData<FinancialHistoryPage, number>>(
                queryKey,
                { pages, pageParams: snapshot.pages.map((page) => page.pageParam) },
                { updatedAt },
            );
        })).then(() => {
            if (!cancelled) setHydratedCacheScope(scope);
        }).catch((error: unknown) => {
            console.error('بازیابی تاریخچه مالی از حافظهٔ آفلاین ناموفق بود.', error);
            if (!cancelled) setHydratedCacheScope(scope);
        });

        return () => {
            cancelled = true;
        };
    }, [authLoading, cacheScope, dateRange.from, dateRange.to, queryClient, userId]);
    const transactionsHistoryQuery = useInfiniteQuery({
        queryKey: user
            ? financialHistoryQueryKey(user.id, 'transactions', dateRange.from, dateRange.to)
            : CACHE_KEYS.financialHistory(0, 'transactions', dateRange.from, dateRange.to),
        enabled: offlineCacheReady && !authLoading && Math.abs(activeTabIndex - 0) <= 1,
        initialPageParam: 1,
        queryFn: async ({ pageParam }) => {
            const token = await getStoredAuthToken();
            if (!token) throw new Error('برای مشاهدهٔ تاریخچه مالی وارد حساب شوید.');
            if (!user) throw new Error('برای مشاهدهٔ تاریخچه مالی وارد حساب شوید.');
            return fetchFinancialHistoryPageWithOfflineFallback(token, user.id, 'transactions', pageParam, dateRange);
        },
        getNextPageParam: (lastPage) => lastPage.meta.current_page < lastPage.meta.last_page
            ? lastPage.meta.current_page + 1
            : undefined,
        staleTime: CACHE_POLICY.query.resources.financialHistory.staleTimeMs,
        retry: false,
        networkMode: 'always',
    });
    const paymentsHistoryQuery = useInfiniteQuery({
        queryKey: user
            ? financialHistoryQueryKey(user.id, 'payments', dateRange.from, dateRange.to)
            : CACHE_KEYS.financialHistory(0, 'payments', dateRange.from, dateRange.to),
        enabled: offlineCacheReady && !authLoading && Math.abs(activeTabIndex - 1) <= 1,
        initialPageParam: 1,
        queryFn: async ({ pageParam }) => {
            const token = await getStoredAuthToken();
            if (!token) throw new Error('برای مشاهدهٔ تاریخچه مالی وارد حساب شوید.');
            if (!user) throw new Error('برای مشاهدهٔ تاریخچه مالی وارد حساب شوید.');
            return fetchFinancialHistoryPageWithOfflineFallback(token, user.id, 'payments', pageParam, dateRange);
        },
        getNextPageParam: (lastPage) => lastPage.meta.current_page < lastPage.meta.last_page
            ? lastPage.meta.current_page + 1
            : undefined,
        staleTime: CACHE_POLICY.query.resources.financialHistory.staleTimeMs,
        retry: false,
        networkMode: 'always',
    });
    const withdrawalsHistoryQuery = useInfiniteQuery({
        queryKey: user
            ? financialHistoryQueryKey(user.id, 'withdrawals', dateRange.from, dateRange.to)
            : CACHE_KEYS.financialHistory(0, 'withdrawals', dateRange.from, dateRange.to),
        enabled: offlineCacheReady && !authLoading && Math.abs(activeTabIndex - 2) <= 1,
        initialPageParam: 1,
        queryFn: async ({ pageParam }) => {
            const token = await getStoredAuthToken();
            if (!token) throw new Error('برای مشاهدهٔ تاریخچه مالی وارد حساب شوید.');
            if (!user) throw new Error('برای مشاهدهٔ تاریخچه مالی وارد حساب شوید.');
            return fetchFinancialHistoryPageWithOfflineFallback(token, user.id, 'withdrawals', pageParam, dateRange);
        },
        getNextPageParam: (lastPage) => lastPage.meta.current_page < lastPage.meta.last_page
            ? lastPage.meta.current_page + 1
            : undefined,
        staleTime: CACHE_POLICY.query.resources.financialHistory.staleTimeMs,
        retry: false,
        networkMode: 'always',
    });
    const transactionsHistoryView = useMemo(() => ({
        data: transactionsHistoryQuery.data,
        error: transactionsHistoryQuery.error,
        isPending: transactionsHistoryQuery.isPending,
        isFetchingNextPage: transactionsHistoryQuery.isFetchingNextPage,
        hasNextPage: transactionsHistoryQuery.hasNextPage,
        isRefetching: transactionsHistoryQuery.isRefetching,
        fetchNextPage: transactionsHistoryQuery.fetchNextPage,
        refetch: transactionsHistoryQuery.refetch,
    }), [
        transactionsHistoryQuery.data,
        transactionsHistoryQuery.error,
        transactionsHistoryQuery.isPending,
        transactionsHistoryQuery.isFetchingNextPage,
        transactionsHistoryQuery.hasNextPage,
        transactionsHistoryQuery.isRefetching,
        transactionsHistoryQuery.fetchNextPage,
        transactionsHistoryQuery.refetch,
    ]);
    const paymentsHistoryView = useMemo(() => ({
        data: paymentsHistoryQuery.data,
        error: paymentsHistoryQuery.error,
        isPending: paymentsHistoryQuery.isPending,
        isFetchingNextPage: paymentsHistoryQuery.isFetchingNextPage,
        hasNextPage: paymentsHistoryQuery.hasNextPage,
        isRefetching: paymentsHistoryQuery.isRefetching,
        fetchNextPage: paymentsHistoryQuery.fetchNextPage,
        refetch: paymentsHistoryQuery.refetch,
    }), [
        paymentsHistoryQuery.data,
        paymentsHistoryQuery.error,
        paymentsHistoryQuery.isPending,
        paymentsHistoryQuery.isFetchingNextPage,
        paymentsHistoryQuery.hasNextPage,
        paymentsHistoryQuery.isRefetching,
        paymentsHistoryQuery.fetchNextPage,
        paymentsHistoryQuery.refetch,
    ]);
    const withdrawalsHistoryView = useMemo(() => ({
        data: withdrawalsHistoryQuery.data,
        error: withdrawalsHistoryQuery.error,
        isPending: withdrawalsHistoryQuery.isPending,
        isFetchingNextPage: withdrawalsHistoryQuery.isFetchingNextPage,
        hasNextPage: withdrawalsHistoryQuery.hasNextPage,
        isRefetching: withdrawalsHistoryQuery.isRefetching,
        fetchNextPage: withdrawalsHistoryQuery.fetchNextPage,
        refetch: withdrawalsHistoryQuery.refetch,
    }), [
        withdrawalsHistoryQuery.data,
        withdrawalsHistoryQuery.error,
        withdrawalsHistoryQuery.isPending,
        withdrawalsHistoryQuery.isFetchingNextPage,
        withdrawalsHistoryQuery.hasNextPage,
        withdrawalsHistoryQuery.isRefetching,
        withdrawalsHistoryQuery.fetchNextPage,
        withdrawalsHistoryQuery.refetch,
    ]);
    const historyQueries = useMemo<Record<HistoryTab, typeof transactionsHistoryView>>(() => ({
        transactions: transactionsHistoryView,
        payments: paymentsHistoryView,
        withdrawals: withdrawalsHistoryView,
    }), [transactionsHistoryView, paymentsHistoryView, withdrawalsHistoryView]);
    const historyRowsByTab = useMemo<Record<HistoryTab, HistoryRow[]>>(() => ({
        transactions: transactionsHistoryQuery.data?.pages.flatMap((page) => page.data) ?? [],
        payments: paymentsHistoryQuery.data?.pages.flatMap((page) => page.data) ?? [],
        withdrawals: withdrawalsHistoryQuery.data?.pages.flatMap((page) => page.data) ?? [],
    }), [
        transactionsHistoryQuery.data,
        paymentsHistoryQuery.data,
        withdrawalsHistoryQuery.data,
    ]);
    const historyGroupsByTab = useMemo<Record<HistoryTab, HistoryGroup[]>>(() => ({
        transactions: groupHistoryRows(historyRowsByTab.transactions),
        payments: groupHistoryRows(historyRowsByTab.payments),
        withdrawals: groupHistoryRows(historyRowsByTab.withdrawals),
    }), [historyRowsByTab]);
    const historyQuery = historyQueries[activeTab];
    const handleDateRangeApply = useCallback(() => {
        if (draftRange.from && draftRange.to && draftRange.from > draftRange.to) {
            setRangeError('تاریخ شروع باید پیش از تاریخ پایان باشد.');
            return;
        }
        if ((draftRange.from && draftRange.from > getTehranToday())
            || (draftRange.to && draftRange.to > getTehranToday())) {
            setRangeError('تاریخ انتخاب‌شده نمی‌تواند از امروز جلوتر باشد.');
            return;
        }

        setDateRange(draftRange);
        setRangeError('');
        setExpandedRowId(null);
        setDateFilterExpanded(false);
    }, [draftRange]);
    const handleDateRangeClear = useCallback(() => {
        const emptyRange = { from: null, to: null };
        setDraftRange(emptyRange);
        setDateRange(emptyRange);
        setRangeError('');
        setExpandedRowId(null);
        setDateFilterExpanded(false);
    }, []);

    const handleCopyReference = useCallback(async (label: string, value: string): Promise<void> => {
        try {
            await copyHistoryReference(value);
        } catch (copyError) {
            showError(copyError, `کپی ${label} ناموفق بود.`);
        }
    }, [showError]);

    useFocusEffect(useCallback(() => {
        if (!user) return;
        if (initializedUserId.current !== user.id) {
            initializedUserId.current = user.id;
            return;
        }

        void queryClient.invalidateQueries({
            queryKey: financialHistoryQueryKey(
                user.id,
                activeTabRef.current,
                dateRangeRef.current.from,
                dateRangeRef.current.to,
            ),
        });
    }, [queryClient, user]));
    useOnlineRefetch(() => {
        void historyQuery.refetch();
    }, user !== null);

    const renderHistoryScene = useCallback((tab: HistoryTab) => {
        const sceneQuery = historyQueries[tab];
        const rows = historyRowsByTab[tab];
        const loading = sceneQuery.isPending;
        const loadingMore = sceneQuery.isFetchingNextPage;
        const error = sceneQuery.error
            ? getUserFacingErrorMessage(sceneQuery.error, 'بارگذاری تاریخچه مالی ناموفق بود.')
            : null;
        const groups = historyGroupsByTab[tab];
        const hasDateFilter = Boolean(dateRange.from || dateRange.to);
        const emptyHistoryMessage = hasDateFilter
            ? 'در بازهٔ زمانی انتخاب‌شده موردی برای نمایش ثبت نشده است.'
            : tab === 'transactions'
                ? 'هنوز تراکنشی برای کیف پول ثبت نشده است.'
                : tab === 'payments'
                    ? 'هنوز سفارش پرداختی ثبت نشده است.'
                    : 'هنوز درخواست برداشتی ثبت نشده است.';
        const appliedRangeLabel = dateRange.from && dateRange.to
            ? `${formatHistoryDate(dateRange.from)} تا ${formatHistoryDate(dateRange.to)}`
            : dateRange.from
                ? `از ${formatHistoryDate(dateRange.from)}`
                : dateRange.to
                    ? `تا ${formatHistoryDate(dateRange.to)}`
                    : 'همهٔ سوابق';
        const offlineCacheSavedAt = sceneQuery.data?.pages.reduce<number | undefined>(
            (latest, page) => page.offlineCacheSavedAt === undefined
                ? latest
                : Math.max(latest ?? page.offlineCacheSavedAt, page.offlineCacheSavedAt),
            undefined,
        );
        const listHeader = (
            <View style={styles.listHeader}>
                {offlineCacheSavedAt !== undefined ? (
                    <OfflineDataNotice
                        theme={theme}
                        title="نسخهٔ ذخیره‌شدهٔ تاریخچه نمایش داده می‌شود"
                        description="این سوابق ممکن است جدیدترین وضعیت سرور نباشند."
                        sources={[{ label: 'این زبانه', timestamp: offlineCacheSavedAt, kind: 'saved' }]}
                    />
                ) : null}
                <View style={[styles.filterCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                    <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`فیلتر تاریخ، ${appliedRangeLabel}`}
                        accessibilityState={{ expanded: dateFilterExpanded }}
                        onPress={() => setDateFilterExpanded((expanded) => !expanded)}
                        style={({ pressed }) => [
                            styles.filterTitle,
                            pressed && { opacity: 0.75 },
                        ]}
                    >
                        <MaterialCommunityIcons name="calendar-range-outline" size={20} color={theme.primaryText} />
                        <View style={styles.filterHeading}>
                            <ThemedText type="smallBold">بازهٔ زمانی</ThemedText>
                            <ThemedText type="small" numberOfLines={1} style={{ color: theme.textSecondary }}>
                                {appliedRangeLabel}
                            </ThemedText>
                        </View>
                        <MaterialCommunityIcons
                            name={dateFilterExpanded ? 'chevron-up' : 'chevron-down'}
                            size={20}
                            color={theme.textMuted}
                        />
                    </Pressable>
                    {dateFilterExpanded ? (
                        <>
                            <View style={styles.dateFields}>
                                {(['from', 'to'] as const).map((target) => (
                                    <DateInputField
                                        key={target}
                                        label={target === 'from' ? 'از تاریخ' : 'تا تاریخ'}
                                        value={draftRange[target] ?? ''}
                                        placeholder="انتخاب تاریخ"
                                        formatValue={formatHistoryDate}
                                        containerStyle={styles.stackedDateField}
                                        onPress={() => {
                                            setRangeError('');
                                            setDatePickerTarget(target);
                                        }}
                                        onClear={draftRange[target] ? () => {
                                            setDraftRange((current) => ({ ...current, [target]: null }));
                                            setRangeError('');
                                        } : undefined}
                                        accessibilityLabel={`انتخاب ${target === 'from' ? 'تاریخ شروع' : 'تاریخ پایان'}`}
                                    />
                                ))}
                            </View>
                            {rangeError ? (
                                <ThemedText type="small" style={{ color: theme.error }} accessibilityRole="alert">
                                    {rangeError}
                                </ThemedText>
                            ) : null}
                            <View style={styles.rangeActions}>
                                {hasDateFilter || draftRange.from || draftRange.to ? (
                                    <Pressable
                                        accessibilityRole="button"
                                        onPress={handleDateRangeClear}
                                        style={[styles.rangeAction, { borderColor: theme.border }]}
                                    >
                                        <ThemedText type="smallBold" style={{ color: theme.textSecondary }}>پاک کردن</ThemedText>
                                    </Pressable>
                                ) : null}
                                <Pressable
                                    accessibilityRole="button"
                                    onPress={handleDateRangeApply}
                                    style={[styles.rangeAction, { backgroundColor: theme.primary, borderColor: theme.primary }]}
                                >
                                    <ThemedText type="smallBold" style={{ color: theme.onPrimary }}>اعمال بازه</ThemedText>
                                </Pressable>
                            </View>
                        </>
                    ) : null}
                </View>
                {error && rows.length > 0 ? (
                    <ErrorNoticeCard message={error} onRetry={() => void sceneQuery.refetch()} />
                ) : null}
            </View>
        );
        const emptyState = authLoading ? (
            <View style={styles.centerState}>
                <ActivityIndicator color={theme.primaryText} />
                <ThemedText type="small" style={{ color: theme.textSecondary }}>در حال بررسی حساب…</ThemedText>
            </View>
        ) : !user ? (
            <View style={[styles.stateCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <MaterialCommunityIcons name="account-lock-outline" size={32} color={theme.textSecondary} />
                <ThemedText type="bodyBold">ورود لازم است</ThemedText>
                <ThemedText type="small" style={{ color: theme.textSecondary }}>
                    برای دیدن اطلاعات مالی، ابتدا وارد حساب خود شوید.
                </ThemedText>
            </View>
        ) : loading ? (
            <View style={styles.centerState}>
                <ActivityIndicator color={theme.primaryText} />
                <ThemedText type="small" style={{ color: theme.textSecondary }}>در حال دریافت اطلاعات…</ThemedText>
            </View>
        ) : error ? (
            <ErrorNoticeCard message={error} onRetry={() => void sceneQuery.refetch()} />
        ) : (
            <View style={[styles.stateCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <MaterialCommunityIcons name="receipt-text-outline" size={32} color={theme.textSecondary} />
                <ThemedText type="bodyBold">موردی برای نمایش نیست</ThemedText>
                <ThemedText type="small" style={{ color: theme.textSecondary }}>
                    {emptyHistoryMessage}
                </ThemedText>
                {hasDateFilter ? (
                    <Pressable
                        accessibilityRole="button"
                        onPress={handleDateRangeClear}
                        style={({ pressed }) => [
                            styles.showAllButton,
                            {
                                backgroundColor: theme.primary,
                                opacity: pressed ? 0.75 : 1,
                            },
                        ]}
                    >
                        <ThemedText type="smallBold" style={{ color: theme.onPrimary }}>
                            نمایش همهٔ سوابق
                        </ThemedText>
                    </Pressable>
                ) : null}
            </View>
        );
        const listFooter = user && !loading && sceneQuery.hasNextPage ? (
            <Pressable
                accessibilityRole="button"
                disabled={loadingMore}
                onPress={() => void sceneQuery.fetchNextPage()}
                style={({ pressed }) => [
                    styles.loadMoreButton,
                    { backgroundColor: theme.surface, borderColor: theme.border, opacity: pressed ? 0.8 : 1 },
                ]}
            >
                {loadingMore ? <ActivityIndicator size="small" color={theme.primaryText} /> : null}
                <ThemedText type="smallBold" style={{ color: theme.primaryText }}>
                    {loadingMore ? 'در حال دریافت…' : 'نمایش موارد بیشتر'}
                </ThemedText>
            </Pressable>
        ) : undefined;

        return (
            <SectionList<HistoryRow, HistoryGroup>
                style={styles.scene}
                contentContainerStyle={[styles.sceneContent, { paddingBottom: insets.bottom + Spacing.four }]}
                showsVerticalScrollIndicator={false}
                sections={groups}
                keyExtractor={(row) => row.id}
                stickySectionHeadersEnabled={false}
                renderSectionHeader={({ section }) => (
                    <View style={styles.dateHeading}>
                        <ThemedText type="smallBold" style={{ color: theme.textSecondary }}>{section.title}</ThemedText>
                        <ThemedText type="small" style={{ color: theme.textMuted }}>
                            {section.data.length.toLocaleString('fa-IR')} مورد
                        </ThemedText>
                    </View>
                )}
                ListHeaderComponent={listHeader}
                ListEmptyComponent={emptyState}
                ListFooterComponent={listFooter}
                refreshControl={(
                    <RefreshControl
                        refreshing={sceneQuery.isRefetching}
                        onRefresh={() => void sceneQuery.refetch()}
                        tintColor={theme.primary}
                        colors={[theme.primary]}
                    />
                )}
                renderItem={({ item, index, section }) => (
                    <HistoryRowItem
                        row={item}
                        expanded={expandedRowId === item.id}
                        isLast={index === section.data.length - 1}
                        setExpandedRowId={setExpandedRowId}
                        onCopyReference={handleCopyReference}
                        theme={theme}
                    />
                )}
            />
        );
    }, [
        authLoading,
        dateFilterExpanded,
        dateRange,
        draftRange,
        expandedRowId,
        handleCopyReference,
        handleDateRangeApply,
        handleDateRangeClear,
        historyGroupsByTab,
        historyQueries,
        historyRowsByTab,
        insets.bottom,
        rangeError,
        setDatePickerTarget,
        setDraftRange,
        setExpandedRowId,
        setRangeError,
        setDateFilterExpanded,
        theme,
        user,
    ]);

    const historySceneElements = useMemo(() => ({
        transactions: renderHistoryScene('transactions'),
        payments: renderHistoryScene('payments'),
        withdrawals: renderHistoryScene('withdrawals'),
    }), [renderHistoryScene]);

    return (
        <ThemedView style={styles.container}>
            <TabView
                navigationState={{
                    index: Math.max(0, activeTabIndex),
                    routes: historyRoutes,
                }}
                onIndexChange={(index) => {
                    const tab = tabs[index];
                    if (tab) {
                        setExpandedRowId(null);
                        setRangeError('');
                        setActiveTab(tab.key);
                    }
                }}
                renderScene={({ route }) => {
                    const tab = tabs.find((item) => item.key === route.key);
                    return tab ? historySceneElements[tab.key] : null;
                }}
                renderTabBar={({ navigationState, jumpTo }) => (
                    <View
                        accessibilityRole="tablist"
                        style={[styles.tabs, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}
                    >
                        {navigationState.routes.map((route, index) => {
                            const tab = tabs[index];
                            if (!tab) return null;
                            return (
                                <FinancialHistoryTab
                                    key={route.key}
                                    icon={tab.icon}
                                    label={tab.label}
                                    description={tabAccessibilityDescriptions[tab.key]}
                                    selected={navigationState.index === index}
                                    theme={theme}
                                    onPress={() => jumpTo(route.key)}
                                />
                            );
                        })}
                    </View>
                )}
                direction="rtl"
                initialLayout={{ width }}
                swipeEnabled
                lazy
                lazyPreloadDistance={1}
                style={styles.tabView}
            />
            <PersianDatePickerModal
                visible={datePickerTarget !== null}
                value={gregorianToJalaaliDate(
                    datePickerTarget ? draftRange[datePickerTarget] ?? getTehranToday() : getTehranToday(),
                )}
                title={datePickerTarget === 'from' ? 'انتخاب تاریخ شروع بازه' : 'انتخاب تاریخ پایان بازه'}
                onClose={() => setDatePickerTarget(null)}
                onSelect={(value) => {
                    if (datePickerTarget) {
                        setDraftRange((current) => ({
                            ...current,
                            [datePickerTarget]: jalaaliToGregorianDate(value),
                        }));
                    }
                    setDatePickerTarget(null);
                }}
                showTodayButton
            />
        </ThemedView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    tabView: { flex: 1 },
    scene: { flex: 1 },
    sceneContent: {
        flexGrow: 1,
        paddingHorizontal: Spacing.four,
        paddingTop: Spacing.three,
        gap: Spacing.three,
    },
    listHeader: {
        gap: Spacing.two,
    },
    filterCard: {
        gap: Spacing.two,
        borderWidth: 1,
        borderRadius: Radius.md,
        padding: Spacing.two,
    },
    filterTitle: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.two,
    },
    filterHeading: {
        flex: 1,
        gap: Spacing.half,
    },
    dateFields: {
        flexDirection: 'column',
        gap: Spacing.two,
        alignSelf: 'stretch',
    },
    stackedDateField: {
        flex: 0,
        width: '100%',
    },
    rangeActions: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        gap: Spacing.two,
    },
    rangeAction: {
        minHeight: 40,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderRadius: Radius.md,
        paddingHorizontal: Spacing.three,
    },
    tabs: {
        flexDirection: 'row',
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    tab: {
        flex: 1,
        minHeight: 54,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: Spacing.one,
        position: 'relative',
    },
    tabLabel: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: Spacing.one,
    },
    tabIndicator: {
        position: 'absolute',
        left: Spacing.two,
        right: Spacing.two,
        bottom: 0,
        height: 4,
        borderRadius: 999,
        overflow: 'hidden',
    },
    centerState: {
        paddingVertical: Spacing.six,
        alignItems: 'center',
        gap: Spacing.two,
    },
    stateCard: {
        borderWidth: 1,
        borderRadius: Radius.lg,
        padding: Spacing.four,
        alignItems: 'center',
        gap: Spacing.two,
    },
    showAllButton: {
        minHeight: 40,
        justifyContent: 'center',
        borderRadius: Radius.md,
        paddingHorizontal: Spacing.three,
        marginTop: Spacing.one,
    },
    dateHeading: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: Spacing.two,
        paddingBottom: Spacing.one,
    },
    historyEntrySlot: {
        gap: Spacing.half,
    },
    historyEntry: {
        borderRadius: Radius.md,
        marginHorizontal: Spacing.one,
    },
    historySeparator: {
        height: StyleSheet.hairlineWidth,
        marginHorizontal: Spacing.two,
    },
    historyEntryButton: {
        minHeight: 68,
        justifyContent: 'center',
        paddingVertical: Spacing.one + 2,
        paddingHorizontal: Spacing.two,
    },
    expandedHistoryEntryButton: {
        paddingTop: Spacing.three + 1,
    },
    historyEntryMain: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
        justifyContent: 'space-between',
        gap: Spacing.two,
    },
    historyEntryIcon: {
        width: 36,
        height: 36,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 18,
    },
    historyEntryCopy: { flex: 1, gap: Spacing.half },
    rowTrailing: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.half,
    },
    rowMeta: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
    statusDot: { width: 6, height: 6, borderRadius: 3 },
    rowDetails: {
        marginTop: Spacing.half,
        paddingTop: Spacing.two,
    },
    receiptDetails: {
        paddingHorizontal: Spacing.two,
        paddingBottom: Spacing.one,
    },
    receiptSection: {
        paddingVertical: Spacing.one,
    },
    receiptSectionRule: {
        width: '100%',
        height: StyleSheet.hairlineWidth,
        marginBottom: Spacing.one,
    },
    receiptTitleDivider: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.two,
        marginBottom: Spacing.one,
    },
    receiptTitleRule: {
        flex: 1,
        height: StyleSheet.hairlineWidth,
    },
    receiptDetail: {
        minHeight: 42,
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: Spacing.two,
        borderBottomWidth: StyleSheet.hairlineWidth,
        paddingVertical: Spacing.one + 2,
    },
    receiptDetailStacked: {
        alignItems: 'stretch',
        flexDirection: 'column',
        gap: Spacing.half,
    },
    receiptLongValue: {
        alignSelf: 'stretch',
    },
    detailValue: {
        flex: 1,
        textAlign: 'left',
        writingDirection: 'rtl',
    },
    copyReference: {
        width: '100%',
        alignSelf: 'stretch',
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: Radius.sm,
        paddingHorizontal: Spacing.two,
        paddingTop: Spacing.two,
        paddingBottom: Spacing.two,
    },
    copyReferenceDivider: {
        width: '100%',
        height: StyleSheet.hairlineWidth,
        marginTop: Spacing.two,
    },
    copyReferenceValue: {
        width: '100%',
        textAlign: 'left',
        writingDirection: 'rtl',
    },
    copyReferenceAction: {
        width: '100%',
        minHeight: 44,
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'stretch',
        justifyContent: 'center',
        gap: Spacing.one,
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: Radius.md,
        paddingHorizontal: Spacing.two,
        marginTop: Spacing.two,
    },
    copyReferenceActionPressed: {
        opacity: 0.75,
        transform: [{ scale: 0.97 }],
    },
    amount: {
        maxWidth: 116,
        textAlign: 'left',
        writingDirection: 'rtl',
    },
    loadMoreButton: {
        minHeight: 48,
        borderWidth: 1,
        borderRadius: Radius.md,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: Spacing.two,
    },
});
