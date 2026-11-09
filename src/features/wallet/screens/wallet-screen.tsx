import { Typography } from '@/constants/typography';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { useFocusEffect, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { onlineManager, useQuery, useQueryClient } from '@tanstack/react-query';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Share, StyleSheet, TextInputInstance, View } from 'react-native';
import { AppSnackbar as Snackbar } from '@/components/app-snackbar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppTextInput } from '@/components/app-text';
import { BankAmountInput } from '@/components/bank-amount-input';
import { ErrorNoticeCard } from '@/components/error-notice-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { useAppFeedback } from '@/hooks/use-app-feedback';
import { useOnlineRefetch } from '@/hooks/use-online-refetch';
import { useOnlineStatus } from '@/hooks/use-online-status';
import { useOfflinePageNotice } from '@/hooks/use-offline-page-notice';
import { useTheme } from '@/hooks/use-theme';
import { CACHE_KEYS, CACHE_POLICY } from '@/services/cache-policy';
import {
    createWithdrawalRequest,
    fetchPendingWalletTopUp,
    fetchWalletOverview,
    fetchWalletPayment,
    getStoredAuthToken,
    reconcileWalletTopUp,
    revealWalletBankAccount,
    startWalletTopUp,
    updateWalletBankAccount,
    isTemporaryApiFailure,
    type WalletOverview,
} from '@/services/auth-api';
import { getUserFacingErrorMessage } from '@/services/user-facing-error';
import {
    ACCOUNT_OFFLINE_CACHE,
    fetchWithOfflineFallback,
    isWalletOverviewCacheValue,
    saveOfflineCacheValue,
    type OfflineAware,
    withOfflineCacheMetadata,
} from '@/services/account-offline-cache';
import {
    clearPendingWithdrawalIdempotency,
    createWithdrawalRequestFingerprint,
    getPendingWithdrawalIdempotency,
    savePendingWithdrawalIdempotency,
    type PendingWithdrawalIdempotency,
} from '@/services/withdrawal-idempotency';

const walletQueryKey = CACHE_KEYS.walletOverview;
const pendingTopUpQueryKey = CACHE_KEYS.walletPendingTopUp;
type FinancialAction = 'top-up' | 'check-top-up' | 'reconcile-top-up' | 'save-iban' | 'withdrawal';
type WalletTab = 'top-up' | 'withdrawal';
type ActiveFinancialAction = { action: FinancialAction; id: number };
type WalletTopUpPayment = {
    id: number;
    status: string;
    amount: number;
};
type PendingTopUpQueryData = {
    payment: WalletTopUpPayment | null;
    offlineCacheSavedAt?: number;
};

function isWalletTopUpPayment(value: unknown): value is WalletTopUpPayment | null {
    if (value === null) return true;
    if (!value || typeof value !== 'object') return false;
    const payment = value as Partial<WalletTopUpPayment>;
    return Number.isSafeInteger(payment.id)
        && typeof payment.status === 'string'
        && typeof payment.amount === 'number';
}

function normalizeDigits(value: string): string {
    return value.replace(/[۰-۹٠-٩]/g, (digit) => {
        const code = digit.charCodeAt(0);
        return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
    }).replace(/[^\d]/g, '');
}

function money(amount: number): string {
    return `${amount.toLocaleString('fa-IR')} تومان`;
}

function normalizeIbanInput(value: string): string {
    const withoutPrefix = value.replace(/^\s*IR\s*/i, '');
    return normalizeDigits(withoutPrefix).slice(0, 24);
}

function formatIbanInput(value: string): string {
    return value.replace(/(\d{4})(?=\d)/g, '$1 ');
}

function getFormattedIbanCursor(digitCount: number): number {
    return digitCount === 0 ? 0 : digitCount + Math.floor((digitCount - 1) / 4);
}

function hasValidCardChecksum(cardNumber: string): boolean {
    let sum = 0;
    let double = false;
    for (let index = cardNumber.length - 1; index >= 0; index--) {
        let digit = Number(cardNumber[index]);
        if (double) {
            digit *= 2;
            if (digit > 9) digit -= 9;
        }
        sum += digit;
        double = !double;
    }
    return sum % 10 === 0;
}

export default function WalletScreen() {
    const theme = useTheme();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { user, isLoading: authLoading } = useAuth();
    const { showError } = useAppFeedback();
    const queryClient = useQueryClient();
    const isOnline = useOnlineStatus();
    const hasFocusedScreen = useRef(false);
    const userId = user?.id ?? null;
    const currentUserIdRef = useRef(userId);
    const previousUserId = useRef(userId);
    const financialRestricted = user?.restricted_capabilities?.includes('financial') ?? false;
    const [activeWalletTab, setActiveWalletTab] = useState<WalletTab>('top-up');
    const [activeFinancialAction, setActiveFinancialAction] = useState<FinancialAction | null>(null);
    const activeFinancialActionRef = useRef<ActiveFinancialAction | null>(null);
    const financialActionIdRef = useRef(0);
    const [copyingIban, setCopyingIban] = useState(false);
    const [topUpAmount, setTopUpAmount] = useState('');
    const [withdrawalAmount, setWithdrawalAmount] = useState('');
    const [withdrawalPayoutMethod, setWithdrawalPayoutMethod] = useState<'iban' | 'card'>('iban');
    const [withdrawalCardNumber, setWithdrawalCardNumber] = useState('');
    const [pendingWithdrawalAttempt, setPendingWithdrawalAttempt] = useState<{
        userId: number;
        value: PendingWithdrawalIdempotency;
    } | null>(null);
    const [loadedWithdrawalAttemptUserId, setLoadedWithdrawalAttemptUserId] = useState<number | null>(null);
    const [withdrawalAttemptLoadError, setWithdrawalAttemptLoadError] = useState<{
        userId: number;
        message: string;
    } | null>(null);
    const pendingWithdrawalAttemptRef = useRef<{
        userId: number;
        value: PendingWithdrawalIdempotency;
    } | null>(null);
    const [ibanInput, setIbanInput] = useState('');
    const ibanInputRef = useRef<TextInputInstance>(null);
    const ibanSelectionRef = useRef({ start: 0, end: 0 });
    const ibanChangeSequenceRef = useRef(0);
    const [message, setMessage] = useState('');
    const [snackbarVisible, setSnackbarVisible] = useState(false);
    const financialActionInProgress = activeFinancialAction !== null;

    useLayoutEffect(() => {
        currentUserIdRef.current = userId;
    }, [userId]);

    const beginFinancialAction = (action: FinancialAction): number | null => {
        if (financialOperationsUnavailable) {
            showMessage('برای انجام عملیات مالی، ابتدا به اینترنت متصل شوید و اطلاعات زندهٔ کیف پول را دریافت کنید.');
            return null;
        }
        if (activeFinancialActionRef.current !== null) return null;
        const id = ++financialActionIdRef.current;
        activeFinancialActionRef.current = { action, id };
        setActiveFinancialAction(action);
        return id;
    };

    const finishFinancialAction = (action: FinancialAction, id: number): void => {
        if (
            activeFinancialActionRef.current?.action !== action
            || activeFinancialActionRef.current.id !== id
        ) return;
        activeFinancialActionRef.current = null;
        setActiveFinancialAction(null);
    };

    const showMessage = (text: string) => {
        setMessage(text);
        setSnackbarVisible(true);
    };

    const walletQuery = useQuery({
        queryKey: walletQueryKey(userId ?? 0),
        enabled: userId !== null && !authLoading,
        queryFn: async (): Promise<OfflineAware<WalletOverview>> => {
            if (userId === null) throw new Error('برای مشاهدهٔ کیف پول وارد حساب شوید.');
            const result = await fetchWithOfflineFallback(
                userId,
                ACCOUNT_OFFLINE_CACHE.wallet,
                async () => {
                    const token = await getStoredAuthToken();
                    if (!token) throw new Error('برای مشاهدهٔ کیف پول وارد حساب شوید.');
                    return fetchWalletOverview(token);
                },
                isWalletOverviewCacheValue,
                { isOnline: onlineManager.isOnline() },
            );
            return withOfflineCacheMetadata(result);
        },
        staleTime: CACHE_POLICY.query.resources.walletOverview.staleTimeMs,
        retry: false,
        networkMode: 'always',
    });
    const pendingTopUpQuery = useQuery({
        queryKey: pendingTopUpQueryKey(userId ?? 0),
        enabled: userId !== null && !authLoading,
        queryFn: async () => {
            if (userId === null) throw new Error('برای بررسی شارژ کیف پول وارد حساب شوید.');
            const result = await fetchWithOfflineFallback(
                userId,
                ACCOUNT_OFFLINE_CACHE.pendingTopUp,
                async () => {
                    const token = await getStoredAuthToken();
                    if (!token) throw new Error('برای بررسی شارژ کیف پول وارد حساب شوید.');
                    return (await fetchPendingWalletTopUp(token)).payment;
                },
                isWalletTopUpPayment,
                { isOnline: onlineManager.isOnline() },
            );
            return result.offlineCacheSavedAt === undefined
                ? { payment: result.value }
                : { payment: result.value, offlineCacheSavedAt: result.offlineCacheSavedAt };
        },
        staleTime: CACHE_POLICY.query.resources.walletPendingTopUp.staleTimeMs,
        refetchInterval: (query) => query.state.data?.payment?.status === 'initiating' ? 30 * 1000 : false,
        retry: false,
        networkMode: 'always',
    });

    useEffect(() => {
        const oldUserId = previousUserId.current;
        if (oldUserId !== userId) {
            setTopUpAmount('');
            setWithdrawalAmount('');
            setWithdrawalCardNumber('');
            setWithdrawalPayoutMethod('iban');
            setActiveWalletTab('top-up');
            setActiveFinancialAction(null);
            activeFinancialActionRef.current = null;
            financialActionIdRef.current += 1;
            setCopyingIban(false);
            setSnackbarVisible(false);
            setMessage('');
            setIbanInput('');
            ibanSelectionRef.current = { start: 0, end: 0 };
            ibanChangeSequenceRef.current += 1;
            if (oldUserId !== null) {
                queryClient.removeQueries({ queryKey: walletQueryKey(oldUserId) });
                queryClient.removeQueries({ queryKey: pendingTopUpQueryKey(oldUserId) });
            }
        }
        previousUserId.current = userId;
    }, [queryClient, userId]);

    const loadPendingWithdrawalAttempt = useCallback(async (targetUserId: number) => {
        try {
            const value = await getPendingWithdrawalIdempotency(targetUserId);
            if (currentUserIdRef.current !== targetUserId) return;
            const attempt = value ? { userId: targetUserId, value } : null;
            pendingWithdrawalAttemptRef.current = attempt;
            setPendingWithdrawalAttempt(attempt);
            setLoadedWithdrawalAttemptUserId(targetUserId);
            setWithdrawalAttemptLoadError(null);
        } catch (error) {
            console.error('بازیابی وضعیت درخواست برداشت ناموفق بود.', error);
            if (currentUserIdRef.current === targetUserId) {
                setWithdrawalAttemptLoadError({
                    userId: targetUserId,
                    message: 'بازیابی وضعیت تلاش قبلی برداشت ناموفق بود؛ برای جلوگیری از ثبت تکراری، ابتدا دوباره بررسی کنید.',
                });
            }
        }
    }, []);

    useEffect(() => {
        if (userId === null) return;
        void Promise.resolve().then(() => loadPendingWithdrawalAttempt(userId));
    }, [loadPendingWithdrawalAttempt, userId]);

    const wallet = walletQuery.data ?? null;
    const pendingTopUp = pendingTopUpQuery.data?.payment ?? null;
    const offlineCacheSavedAt = walletQuery.data?.offlineCacheSavedAt
        ?? pendingTopUpQuery.data?.offlineCacheSavedAt;
    const financialOperationsUnavailable = !isOnline
        || offlineCacheSavedAt !== undefined
        || walletQuery.isPending
        || walletQuery.isFetching
        || walletQuery.isError
        || walletQuery.data === undefined
        || pendingTopUpQuery.isPending
        || pendingTopUpQuery.isFetching
        || pendingTopUpQuery.isError
        || pendingTopUpQuery.data === undefined;
    const showOfflineWalletNotice = !isOnline || offlineCacheSavedAt !== undefined;
    useOfflinePageNotice(showOfflineWalletNotice ? {
        hasSavedData: offlineCacheSavedAt !== undefined,
        message: offlineCacheSavedAt !== undefined
            ? 'موجودی ذخیره‌شدهٔ کیف پول ممکن است به‌روز نباشد.'
            : 'سرور در دسترس نیست؛ عملیات مالی غیرفعال است.',
        details: [
            'موجودی یا وضعیت پرداخت ممکن است به‌روز نباشد.',
            'شارژ، برداشت و پیگیری پرداخت تا اتصال دوباره در دسترس نیست.',
        ],
    } : null);
    const pendingTopUpId = pendingTopUp?.id ?? null;
    const loading = authLoading || (user !== null && walletQuery.isPending);
    const topUpDisabled = financialActionInProgress
        || financialOperationsUnavailable
        || financialRestricted
        || pendingTopUpQuery.isPending
        || pendingTopUpQuery.isError
        || pendingTopUpId !== null;
    const withdrawalCardValid = withdrawalCardNumber.length === 16
        && hasValidCardChecksum(withdrawalCardNumber);
    const withdrawalDisabled = financialActionInProgress
        || financialOperationsUnavailable
        || financialRestricted
        || loadedWithdrawalAttemptUserId !== userId
        || (withdrawalPayoutMethod === 'card' && !withdrawalCardValid);
    const currentPendingWithdrawalAttempt = pendingWithdrawalAttempt?.userId === userId
        ? pendingWithdrawalAttempt.value
        : null;
    const currentWithdrawalAttemptLoadError = withdrawalAttemptLoadError?.userId === userId
        ? withdrawalAttemptLoadError.message
        : null;
    const walletError = walletQuery.error
        ? getUserFacingErrorMessage(walletQuery.error, 'دریافت اطلاعات کیف پول ناموفق بود.')
        : null;
    const pendingTopUpError = pendingTopUpQuery.error
        ? getUserFacingErrorMessage(pendingTopUpQuery.error, 'بررسی شارژهای در انتظار ناموفق بود.')
        : null;

    useFocusEffect(useCallback(() => {
        if (userId === null || !hasFocusedScreen.current) {
            hasFocusedScreen.current = true;
        } else {
            void queryClient.invalidateQueries({ queryKey: walletQueryKey(userId) });
            void queryClient.invalidateQueries({ queryKey: pendingTopUpQueryKey(userId) });
        }

        return () => setWithdrawalCardNumber('');
    }, [queryClient, userId]));

    const refetchWallet = walletQuery.refetch;
    const refetchPendingTopUp = pendingTopUpQuery.refetch;
    const refreshWallet = useCallback(async () => {
        await Promise.all([refetchWallet(), refetchPendingTopUp()]);
    }, [refetchPendingTopUp, refetchWallet]);
    useOnlineRefetch(refreshWallet, userId !== null);

    const updatePendingTopUpCache = (
        pendingTopUp: WalletTopUpPayment | null,
    ) => {
        if (userId === null) return;
        queryClient.setQueryData<PendingTopUpQueryData>(pendingTopUpQueryKey(userId), { payment: pendingTopUp });
    };

    const handleTopUp = async () => {
        if (financialRestricted) {
            showMessage('به‌دلیل محدودیت دسترسی مالی، امکان شارژ کیف پول وجود ندارد.');
            return;
        }
        if (pendingTopUpQuery.isPending || pendingTopUpQuery.isError || pendingTopUpId !== null) {
            showMessage(
                pendingTopUpQuery.isError
                    ? 'ابتدا وضعیت شارژهای قبلی را بررسی کنید.'
                    : pendingTopUpId !== null
                        ? 'ابتدا وضعیت شارژ قبلی را مشخص کنید.'
                        : 'در حال بررسی شارژهای قبلی هستیم؛ کمی بعد دوباره تلاش کنید.',
            );
            return;
        }
        const amount = Number(normalizeDigits(topUpAmount));
        if (!Number.isSafeInteger(amount)) {
            showMessage('مبلغ شارژ را به‌صورت عدد صحیح وارد کنید.');
            return;
        }
        if (!wallet) {
            showMessage('اطلاعات کیف پول در دسترس نیست؛ دوباره تلاش کنید.');
            return;
        }
        if (amount < wallet.top_up_min_amount) {
            showMessage(`حداقل مبلغ شارژ ${money(wallet.top_up_min_amount)} است.`);
            return;
        }
        if (amount > wallet.top_up_max_amount) {
            showMessage(`حداکثر مبلغ شارژ ${money(wallet.top_up_max_amount)} است.`);
            return;
        }

        const actionId = beginFinancialAction('top-up');
        if (actionId === null) return;
        const actionUserId = userId;
        try {
            const token = await getStoredAuthToken();
            if (!token) throw new Error('نشست کاربری در دسترس نیست؛ دوباره وارد شوید.');
            if (currentUserIdRef.current !== actionUserId) return;
            const appReturnUrl = Linking.createURL('payment-return');
            const result = await startWalletTopUp(
                token,
                amount,
                Crypto.randomUUID(),
                appReturnUrl,
            );
            if (currentUserIdRef.current !== actionUserId) return;
            updatePendingTopUpCache(result.payment.status === 'succeeded' ? null : result.payment);
            await checkTopUpStatus(token, result.payment.id, true, appReturnUrl, actionUserId);
        } catch (error) {
            if (currentUserIdRef.current !== actionUserId) return;
            showError(error, 'شروع شارژ کیف پول ناموفق بود.');
            await pendingTopUpQuery.refetch();
        } finally {
            finishFinancialAction('top-up', actionId);
        }
    };

    const sharePendingTopUpDetails = async () => {
        if (!pendingTopUp) return;
        const actionUserId = userId;
        try {
            if (currentUserIdRef.current !== actionUserId) return;
            await Share.share({
                title: 'جزئیات شارژ کیف پول',
                message: [
                    'درخواست پیگیری شارژ کیف پول',
                    `شناسه پرداخت: ${pendingTopUp.id}`,
                    `مبلغ: ${money(pendingTopUp.amount)}`,
                    `وضعیت: ${pendingTopUp.status}`,
                ].join('\n'),
            });
        } catch (error) {
            if (currentUserIdRef.current !== actionUserId) return;
            showError(error, 'آماده‌سازی اطلاعات شارژ برای اشتراک‌گذاری ناموفق بود.');
        }
    };

    const applyTopUpStatus = async (payment: WalletTopUpPayment, actionUserId: number | null) => {
        if (actionUserId === null || currentUserIdRef.current !== actionUserId) return;
        const { status } = payment;
        if (status === 'succeeded') {
            updatePendingTopUpCache(null);
            await saveOfflineCacheValue(actionUserId, ACCOUNT_OFFLINE_CACHE.pendingTopUp, null);
            if (currentUserIdRef.current !== actionUserId) return;
            setTopUpAmount('');
            if (userId !== null) {
                await queryClient.invalidateQueries({ queryKey: walletQueryKey(userId) });
            }
            if (currentUserIdRef.current !== actionUserId) return;
            showMessage('شارژ کیف پول تأیید و به موجودی اضافه شد.');
        } else if (status === 'failed') {
            updatePendingTopUpCache(null);
            await saveOfflineCacheValue(actionUserId, ACCOUNT_OFFLINE_CACHE.pendingTopUp, null);
            if (currentUserIdRef.current !== actionUserId) return;
            showMessage('درگاه پرداخت ناموفق‌بودن شارژ را تأیید کرد؛ اکنون می‌توانید دوباره شارژ کنید.');
        } else {
            updatePendingTopUpCache(payment);
            showMessage('درگاه هنوز پرداخت را نهایی نکرده است؛ از پرداخت مجدد خودداری کنید و کمی بعد دوباره استعلام بگیرید.');
        }
    };

    const checkTopUpStatus = async (
        token: string,
        paymentId: number,
        openGateway: boolean,
        appReturnUrl = Linking.createURL('payment-return'),
        actionUserId: number | null = userId,
    ) => {
        let result = await fetchWalletPayment(token, paymentId);
        if (actionUserId === null || currentUserIdRef.current !== actionUserId) return;
        if (openGateway && result.payment.status === 'pending' && result.payment.redirect_url) {
            await WebBrowser.openAuthSessionAsync(
                result.payment.redirect_url,
                appReturnUrl,
            );
            result = await fetchWalletPayment(token, paymentId);
            if (currentUserIdRef.current !== actionUserId) return;
        }

        await applyTopUpStatus(result.payment, actionUserId);
    };

    const handleCheckTopUp = async () => {
        if (!pendingTopUpId) return;
        const actionId = beginFinancialAction('check-top-up');
        if (actionId === null) return;
        const actionUserId = userId;
        try {
            const token = await getStoredAuthToken();
            if (!token) throw new Error('نشست کاربری در دسترس نیست؛ دوباره وارد شوید.');
            if (currentUserIdRef.current !== actionUserId) return;
            await checkTopUpStatus(token, pendingTopUpId, true, undefined, actionUserId);
        } catch (error) {
            if (currentUserIdRef.current !== actionUserId) return;
            showError(error, 'بررسی پرداخت شارژ ناموفق بود.');
        } finally {
            finishFinancialAction('check-top-up', actionId);
        }
    };

    const handleReconcileTopUp = async () => {
        if (!pendingTopUpId) return;
        const actionId = beginFinancialAction('reconcile-top-up');
        if (actionId === null) return;
        const actionUserId = userId;
        try {
            const token = await getStoredAuthToken();
            if (!token) throw new Error('نشست کاربری در دسترس نیست؛ دوباره وارد شوید.');
            if (currentUserIdRef.current !== actionUserId) return;
            const result = await reconcileWalletTopUp(token, pendingTopUpId);
            await applyTopUpStatus(result.payment, actionUserId);
        } catch (error) {
            if (currentUserIdRef.current !== actionUserId) return;
            showError(error, 'استعلام مستقیم وضعیت شارژ ناموفق بود.');
        } finally {
            finishFinancialAction('reconcile-top-up', actionId);
        }
    };

    const handleSaveIban = async (): Promise<boolean> => {
        const actionUserId = userId;
        if (actionUserId === null) throw new Error('برای ذخیرهٔ شماره شبا وارد حساب شوید.');
        if (financialRestricted) {
            throw new Error('به‌دلیل محدودیت دسترسی مالی، امکان ذخیرهٔ شماره شبا وجود ندارد.');
        }
        if (ibanInput.length !== 24) {
            throw new Error('شماره شبا باید شامل ۲۴ رقم پس از پیشوند IR باشد.');
        }
        const token = await getStoredAuthToken();
        if (!token) throw new Error('نشست کاربری در دسترس نیست؛ دوباره وارد شوید.');
        if (currentUserIdRef.current !== actionUserId) return false;
        const masked = await updateWalletBankAccount(token, `IR${ibanInput}`);
        if (currentUserIdRef.current !== actionUserId) return false;
        if (userId !== null) {
            queryClient.setQueryData<OfflineAware<WalletOverview>>(
                walletQueryKey(userId),
                (current) => current ? { ...current, bank_account_iban_masked: masked } : current,
            );
        }
        setIbanInput('');
        ibanSelectionRef.current = { start: 0, end: 0 };
        showMessage('شماره شبا با موفقیت ذخیره شد.');
        return true;
    };

    const handleCopyIban = async () => {
        const actionUserId = userId;
        setCopyingIban(true);
        try {
            const token = await getStoredAuthToken();
            if (!token) throw new Error('نشست کاربری در دسترس نیست؛ دوباره وارد شوید.');
            if (currentUserIdRef.current !== actionUserId) return;
            const iban = await revealWalletBankAccount(token);
            if (currentUserIdRef.current !== actionUserId) return;
            await Clipboard.setStringAsync(iban);
            if (currentUserIdRef.current !== actionUserId) return;
            showMessage('شماره شبای کامل کپی شد.');
        } catch (error) {
            if (currentUserIdRef.current !== actionUserId) return;
            showError(error, 'کپی شماره شبا ناموفق بود.');
        } finally {
            if (currentUserIdRef.current === actionUserId) setCopyingIban(false);
        }
    };

    const handleIbanChange = (value: string) => {
        const nextIban = normalizeIbanInput(value);
        const previousIban = ibanInput;
        const { start, end } = ibanSelectionRef.current;
        const previousFormattedIban = formatIbanInput(previousIban);
        const selectionStartDigit = normalizeDigits(previousFormattedIban.slice(0, start)).length;
        const selectionEndDigit = normalizeDigits(previousFormattedIban.slice(0, end)).length;
        const selectedDigitCount = selectionEndDigit - selectionStartDigit;
        const lengthDifference = nextIban.length - previousIban.length;
        const insertedDigitCount = Math.max(
            0,
            nextIban.length - (previousIban.length - selectedDigitCount),
        );
        const nextDigitCursor = nextIban.length === 24 && insertedDigitCount > 1
            ? 24
            : Math.min(
                nextIban.length,
                selectedDigitCount > 0
                    ? selectionStartDigit + insertedDigitCount
                    : lengthDifference >= 0
                        ? selectionStartDigit + lengthDifference
                        : Math.max(0, selectionStartDigit + lengthDifference),
            );
        const cursor = getFormattedIbanCursor(nextDigitCursor);
        const nextSelection = { start: cursor, end: cursor };
        setIbanInput(nextIban);
        ibanSelectionRef.current = nextSelection;
        const changeSequence = ++ibanChangeSequenceRef.current;
        requestAnimationFrame(() => {
            if (changeSequence !== ibanChangeSequenceRef.current) return;
            ibanInputRef.current?.setNativeProps({ selection: nextSelection });
        });
    };

    const handleWithdrawal = async () => {
        if (userId === null) {
            showMessage('برای ثبت درخواست برداشت وارد حساب شوید.');
            return;
        }
        if (financialRestricted) {
            showMessage('به‌دلیل محدودیت دسترسی مالی، امکان ثبت درخواست برداشت وجود ندارد.');
            return;
        }
        if (!wallet || !wallet.withdrawals.enabled) {
            showMessage('درخواست برداشت در حال حاضر در دسترس نیست.');
            return;
        }
        if (loadedWithdrawalAttemptUserId !== userId) {
            showMessage('برای جلوگیری از ثبت تکراری، ابتدا وضعیت تلاش قبلی برداشت را بررسی کنید.');
            return;
        }
        const amount = Number(normalizeDigits(withdrawalAmount));
        if (!Number.isSafeInteger(amount) || amount < 1) {
            showMessage('مبلغ برداشت را به‌صورت عدد صحیح و بیشتر از صفر وارد کنید.');
            return;
        }
        if (amount > wallet.withdrawals.max_per_request) {
            showMessage(`حداکثر مبلغ هر درخواست ${money(wallet.withdrawals.max_per_request)} است.`);
            return;
        }

        const actionId = beginFinancialAction('withdrawal');
        if (actionId === null) return;
        const actionUserId = userId;
        let attempt = pendingWithdrawalAttemptRef.current?.userId === userId
            ? pendingWithdrawalAttemptRef.current.value
            : null;
        let requestWasSent = false;
        let attemptCleared = false;
        try {
            const token = await getStoredAuthToken();
            if (!token) throw new Error('نشست کاربری در دسترس نیست؛ دوباره وارد شوید.');
            if (currentUserIdRef.current !== actionUserId) return;

            let cardNumber: string | undefined;
            if (withdrawalPayoutMethod === 'card') {
                cardNumber = normalizeDigits(withdrawalCardNumber);
                if (cardNumber.length !== 16 || !hasValidCardChecksum(cardNumber)) {
                    throw new Error('شماره کارت باید ۱۶ رقم معتبر باشد.');
                }
            }

            const requestFingerprint = await createWithdrawalRequestFingerprint({
                amount,
                payoutMethod: withdrawalPayoutMethod,
                ...(cardNumber ? { cardNumber } : {}),
            });
            if (attempt && attempt.requestFingerprint !== requestFingerprint) {
                showMessage('نتیجهٔ درخواست قبلی هنوز مشخص نیست. برای جلوگیری از برداشت تکراری، همان مبلغ و روش مقصد را وارد کنید؛ در روش کارت، شمارهٔ کارت قبلی نیز لازم است.');
                return;
            }

            if (!attempt && withdrawalPayoutMethod === 'iban') {
                if (ibanInput.trim()) {
                    const saved = await handleSaveIban();
                    if (!saved || currentUserIdRef.current !== actionUserId) return;
                } else if (!wallet.bank_account_iban_masked) {
                    throw new Error('ابتدا شماره شبای مقصد را ثبت کنید یا روش واریز به کارت را انتخاب کنید.');
                }
            }

            if (!attempt) {
                attempt = {
                    idempotencyKey: Crypto.randomUUID(),
                    requestFingerprint,
                    createdAt: Date.now(),
                };
                await savePendingWithdrawalIdempotency(actionUserId, attempt);
                if (currentUserIdRef.current !== actionUserId) return;
                const scopedAttempt = { userId: actionUserId, value: attempt };
                pendingWithdrawalAttemptRef.current = scopedAttempt;
                setPendingWithdrawalAttempt(scopedAttempt);
            }

            requestWasSent = true;
            await createWithdrawalRequest(
                token,
                amount,
                attempt.idempotencyKey,
                withdrawalPayoutMethod,
                cardNumber,
            );
            if (currentUserIdRef.current !== actionUserId) return;
            try {
                await clearPendingWithdrawalIdempotency(actionUserId);
                if (currentUserIdRef.current === actionUserId) {
                    pendingWithdrawalAttemptRef.current = null;
                    setPendingWithdrawalAttempt(null);
                    attemptCleared = true;
                }
            } catch (clearError) {
                console.error('پاک‌کردن کلید برداشت تأییدشده ناموفق بود؛ برای جلوگیری از تکرار، همان کلید حفظ می‌شود.', clearError);
            }
            if (attemptCleared) {
                setWithdrawalAmount('');
                setWithdrawalCardNumber('');
            }
            await queryClient.invalidateQueries({ queryKey: walletQueryKey(userId) });
            if (currentUserIdRef.current !== actionUserId) return;
            showMessage('درخواست برداشت ثبت شد. مبلغ تا بررسی و پرداخت، رزرو می‌شود.');
        } catch (error) {
            if (currentUserIdRef.current !== actionUserId) return;
            if (attempt && (!requestWasSent || !isTemporaryApiFailure(error))) {
                try {
                    await clearPendingWithdrawalIdempotency(actionUserId);
                    if (currentUserIdRef.current === actionUserId) {
                        pendingWithdrawalAttemptRef.current = null;
                        setPendingWithdrawalAttempt(null);
                    }
                } catch (clearError) {
                    console.error('پاک‌کردن کلید درخواست برداشت ناموفق بود؛ برای جلوگیری از ثبت تکراری، کلید نگه داشته شد.', clearError);
                }
            }
            if (requestWasSent && isTemporaryApiFailure(error)) {
                showError(error, 'نتیجهٔ ثبت برداشت مشخص نشد؛ برای جلوگیری از درخواست تکراری، تلاش دوباره با همان کلید انجام می‌شود.');
            } else {
                showError(error, 'ثبت درخواست برداشت ناموفق بود.');
            }
        } finally {
            finishFinancialAction('withdrawal', actionId);
        }
    };

    if (authLoading || loading && user) {
        return (
            <ThemedView style={styles.centered}>
                <ActivityIndicator color={theme.primaryText} />
                <ThemedText type="small" themeColor="textSecondary">در حال دریافت اطلاعات کیف پول…</ThemedText>
            </ThemedView>
        );
    }

    if (!user) {
        return (
            <ThemedView style={styles.centered}>
                <MaterialCommunityIcons name="account-lock-outline" size={34} color={theme.textSecondary} />
                <ThemedText type="bodyBold">ورود لازم است</ThemedText>
                <Pressable onPress={() => router.push('/auth')} style={[styles.primaryButton, { backgroundColor: theme.primary }]}>
                    <ThemedText type="smallBold" style={{ color: theme.onPrimary }}>ورود به حساب</ThemedText>
                </Pressable>
            </ThemedView>
        );
    }

    return (
        <ThemedView style={styles.container}>
            <ScrollView
                contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.five }]}
                keyboardDismissMode="on-drag"
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                refreshControl={(
                    <RefreshControl
                        refreshing={walletQuery.isRefetching || pendingTopUpQuery.isRefetching}
                        onRefresh={() => void refreshWallet()}
                        tintColor={theme.primary}
                        colors={[theme.primary]}
                    />
                )}
            >
                {walletError && !wallet ? (
                    <ErrorNoticeCard
                        message={walletError}
                        onRetry={() => void refreshWallet()}
                        busy={walletQuery.isRefetching || pendingTopUpQuery.isRefetching}
                        busyLabel="در حال دریافت…"
                    />
                ) : null}
                {walletError && wallet ? (
                    <ErrorNoticeCard
                        message={walletError}
                        onRetry={() => void refreshWallet()}
                        busy={walletQuery.isRefetching || pendingTopUpQuery.isRefetching}
                        busyLabel="در حال دریافت…"
                        tone="warning"
                    />
                ) : null}
                {pendingTopUpError && wallet ? (
                    <ErrorNoticeCard
                        message={`اطلاعات کیف پول نمایش داده می‌شود، اما ${pendingTopUpError}`}
                        onRetry={() => void pendingTopUpQuery.refetch()}
                        retryLabel="بررسی دوباره"
                        busy={pendingTopUpQuery.isRefetching}
                        busyLabel="در حال بررسی…"
                        tone="warning"
                    />
                ) : null}
                {wallet ? (
                    <>
                        <View style={[styles.balanceCard, { backgroundColor: theme.primary, borderColor: theme.border }]}>
                            <View style={styles.balanceHeader}>
                                <MaterialCommunityIcons name="wallet-outline" size={24} color={theme.onPrimary} />
                                <ThemedText type="bodyBold" themeColor="onPrimary">موجودی کیف پول</ThemedText>
                            </View>
                            <ThemedText type="subtitle" themeColor="onPrimary">{money(wallet.balance)}</ThemedText>
                            <ThemedText type="small" style={{ color: theme.onPrimary }}>
                                مبلغ‌های رزروشدهٔ درخواست‌های برداشت از موجودی آزاد کسر شده‌اند.
                            </ThemedText>
                        </View>

                        {pendingTopUp ? (
                            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.warning }]}>
                                <ThemedText type="smallBold" style={{ color: theme.warning }}>
                                    {pendingTopUp.status === 'initiation_unknown'
                                        ? 'نتیجهٔ آغاز شارژ نامشخص است و شناسه‌ای از درگاه نداریم. چون نمی‌توان نرسیدن درخواست به درگاه را قطعی دانست، شارژ را لغو یا تکرار نکنید؛ جزئیات را برای پیگیری پشتیبانی آماده کنید.'
                                        : 'یک شارژ در انتظار پرداخت یا تأیید دارید. وضعیت را از درگاه استعلام کنید؛ تا مشخص‌شدن نتیجه، شارژ جدید برای جلوگیری از پرداخت تکراری غیرفعال است.'}
                                </ThemedText>
                                {pendingTopUp.status === 'pending' ? (
                                    <Pressable
                                        accessibilityRole="button"
                                        disabled={financialActionInProgress || financialOperationsUnavailable}
                                        onPress={() => void handleCheckTopUp()}
                                        style={[styles.secondaryButton, { borderColor: theme.border, flexDirection: 'row', gap: Spacing.two, opacity: financialActionInProgress || financialOperationsUnavailable ? 0.6 : 1 }]}
                                    >
                                        {activeFinancialAction === 'check-top-up'
                                            ? <ActivityIndicator color={theme.primaryText} />
                                            : null}
                                        <ThemedText type="smallBold" themeColor="primaryText">
                                            {activeFinancialAction === 'check-top-up'
                                                ? 'در حال بررسی پرداخت…'
                                                : 'ادامه پرداخت در درگاه'}
                                        </ThemedText>
                                    </Pressable>
                                ) : null}
                                {pendingTopUp.status === 'initiation_unknown' ? (
                                    <Pressable
                                        accessibilityRole="button"
                                        onPress={() => void sharePendingTopUpDetails()}
                                        style={[styles.secondaryButton, { borderColor: theme.border }]}
                                    >
                                        <ThemedText type="smallBold" themeColor="primaryText">
                                            آماده‌سازی جزئیات برای پشتیبانی
                                        </ThemedText>
                                    </Pressable>
                                ) : null}
                                {pendingTopUp.status !== 'initiation_unknown' ? (
                                    <Pressable
                                        accessibilityRole="button"
                                        disabled={financialActionInProgress || financialOperationsUnavailable}
                                        onPress={() => void handleReconcileTopUp()}
                                        style={[styles.secondaryButton, { borderColor: theme.border, flexDirection: 'row', gap: Spacing.two, opacity: financialActionInProgress || financialOperationsUnavailable ? 0.6 : 1 }]}
                                    >
                                        {activeFinancialAction === 'reconcile-top-up'
                                            ? <ActivityIndicator color={theme.primaryText} />
                                            : null}
                                        <ThemedText type="smallBold" themeColor="primaryText">
                                            {activeFinancialAction === 'reconcile-top-up'
                                                ? 'در حال استعلام از درگاه…'
                                                : 'استعلام مستقیم از درگاه'}
                                        </ThemedText>
                                    </Pressable>
                                ) : null}
                            </View>
                        ) : null}

                        <View
                            accessibilityRole="tablist"
                            style={[styles.walletTabs, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}
                        >
                            {([
                                { key: 'top-up', label: 'شارژ کیف پول', icon: 'wallet-plus-outline' },
                                { key: 'withdrawal', label: 'برداشت', icon: 'bank-transfer-out' },
                            ] as const).map((tab) => {
                                const selected = activeWalletTab === tab.key;
                                return (
                                    <Pressable
                                        key={tab.key}
                                        accessibilityRole="tab"
                                        accessibilityLabel={tab.label}
                                        accessibilityState={{ selected }}
                                        onPress={() => setActiveWalletTab(tab.key)}
                                        style={[
                                            styles.walletTab,
                                            {
                                                backgroundColor: selected ? theme.primary : 'transparent',
                                                borderColor: selected ? theme.primary : 'transparent',
                                            },
                                        ]}
                                    >
                                        <MaterialCommunityIcons
                                            name={tab.icon}
                                            size={19}
                                            color={selected ? theme.onPrimary : theme.textSecondary}
                                        />
                                        <ThemedText
                                            type={selected ? 'smallBold' : 'small'}
                                            style={{ color: selected ? theme.onPrimary : theme.textSecondary }}
                                        >
                                            {tab.label}
                                        </ThemedText>
                                    </Pressable>
                                );
                            })}
                        </View>

                        {activeWalletTab === 'top-up' ? (
                            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                                <View style={styles.sectionHeader}>
                                    <MaterialCommunityIcons name="wallet-plus-outline" size={22} color={theme.primaryText} />
                                    <ThemedText type="bodyBold">شارژ کیف پول</ThemedText>
                                </View>
                                <ThemedText type="small" style={{ color: theme.textSecondary }}>
                                    حداقل شارژ {money(wallet.top_up_min_amount)} و سقف هر پرداخت {money(wallet.top_up_max_amount)} است.
                                </ThemedText>
                                {pendingTopUpQuery.isPending ? (
                                    <ThemedText type="small" style={{ color: theme.textSecondary }}>
                                        در حال بررسی وضعیت شارژهای قبلی…
                                    </ThemedText>
                                ) : null}
                                <BankAmountInput
                                    accessibilityLabel="مبلغ شارژ به تومان"
                                    editable={
                                        !topUpDisabled
                                    }
                                    onChangeText={setTopUpAmount}
                                    value={topUpAmount}
                                />
                                <Pressable
                                    accessibilityRole="button"
                                    disabled={topUpDisabled}
                                    onPress={() => void handleTopUp()}
                                    style={[styles.primaryButton, {
                                        backgroundColor: theme.primary,
                                        opacity: topUpDisabled ? 0.6 : 1,
                                    }]}
                                >
                                    {activeFinancialAction === 'top-up'
                                        ? <ActivityIndicator color={theme.onPrimary} />
                                        : null}
                                    <ThemedText type="smallBold" style={{ color: theme.onPrimary }}>ادامه به درگاه پرداخت</ThemedText>
                                </Pressable>
                            </View>
                        ) : (
                            <>
                                {currentWithdrawalAttemptLoadError ? (
                                    <ErrorNoticeCard
                                        message={currentWithdrawalAttemptLoadError}
                                        onRetry={() => {
                                            if (userId !== null) void loadPendingWithdrawalAttempt(userId);
                                        }}
                                        retryLabel="بررسی دوباره"
                                    />
                                ) : loadedWithdrawalAttemptUserId !== userId ? (
                                    <ThemedText type="small" style={{ color: theme.textSecondary }}>
                                        در حال بررسی وضعیت تلاش‌های قبلی برداشت…
                                    </ThemedText>
                                ) : currentPendingWithdrawalAttempt ? (
                                    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.warning }]}>
                                        <ThemedText type="smallBold" style={{ color: theme.warning }}>
                                            نتیجهٔ یک درخواست برداشت قبلی مشخص نیست. برای جلوگیری از ثبت دوباره، فقط با همان مبلغ و روش مقصد، و در روش کارت با همان شماره کارت، می‌توان تلاش کرد. شمارهٔ کارت قبلی روی دستگاه ذخیره نشده است.
                                        </ThemedText>
                                    </View>
                                ) : null}
                                <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                                    <View style={styles.sectionHeader}>
                                        <MaterialCommunityIcons name="bank-outline" size={22} color={theme.primaryText} />
                                        <ThemedText type="bodyBold">شماره شبای برداشت</ThemedText>
                                    </View>
                                    <ThemedText type="small" style={{ color: theme.textSecondary }}>
                                        فقط شماره شبای حساب بانکی متعلق به خودتان را ثبت کنید. هنگام ثبت درخواست می‌توانید از این شبا یا یک شماره کارت بانکی استفاده کنید.
                                    </ThemedText>
                                    {wallet.bank_account_iban_masked ? (
                                        <>
                                            <ThemedText type="smallBold" style={{ color: theme.success }}>
                                                شبای ثبت‌شده: {wallet.bank_account_iban_masked}
                                            </ThemedText>
                                            <Pressable
                                                accessibilityLabel="کپی شبای کامل ثبت‌شده"
                                                accessibilityRole="button"
                                                disabled={copyingIban || financialOperationsUnavailable}
                                                onPress={() => void handleCopyIban()}
                                                style={[styles.secondaryButton, { borderColor: theme.border, flexDirection: 'row', gap: Spacing.two, opacity: copyingIban || financialOperationsUnavailable ? 0.6 : 1 }]}
                                            >
                                                {copyingIban
                                                    ? <ActivityIndicator color={theme.primaryText} />
                                                    : <MaterialCommunityIcons name="content-copy" size={18} color={theme.primaryText} />}
                                                <ThemedText type="smallBold" themeColor="primaryText">
                                                    {copyingIban ? 'در حال دریافت شماره شبا…' : 'کپی شبای کامل'}
                                                </ThemedText>
                                            </Pressable>
                                        </>
                                    ) : (
                                        <ThemedText type="smallBold" style={{ color: theme.warning }}>هنوز شماره شبایی ثبت نشده است.</ThemedText>
                                    )}
                                    <View style={[styles.ibanInputWrap, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
                                        <ThemedText type="smallBold" style={[styles.ibanPrefix, { color: theme.textSecondary, borderRightColor: theme.border }]}>
                                            IR
                                        </ThemedText>
                                        <AppTextInput
                                            accessibilityLabel="۲۴ رقم شماره شبا پس از پیشوند IR"
                                            autoCapitalize="none"
                                            autoCorrect={false}
                                            editable={!financialRestricted}
                                            keyboardType="number-pad"
                                            onChangeText={handleIbanChange}
                                            onSelectionChange={(event) => {
                                                ibanSelectionRef.current = event.nativeEvent.selection;
                                            }}
                                            placeholder="0000 0000 0000 0000 0000 0000"
                                            placeholderTextColor={theme.textMuted}
                                            ref={ibanInputRef}
                                            value={formatIbanInput(ibanInput)}
                                            style={[styles.ibanInput, { color: theme.text }]}
                                        />
                                    </View>
                                    <Pressable
                                        accessibilityRole="button"
                                        disabled={financialOperationsUnavailable || financialActionInProgress || financialRestricted || ibanInput.length !== 24}
                                        onPress={() => {
                                            const actionId = beginFinancialAction('save-iban');
                                            if (actionId === null) return;
                                            const actionUserId = userId;
                                            void handleSaveIban()
                                                .catch((error: unknown) => {
                                                    if (currentUserIdRef.current === actionUserId) {
                                                        showError(error, 'ذخیره شماره شبا ناموفق بود.');
                                                    }
                                                })
                                                .finally(() => finishFinancialAction('save-iban', actionId));
                                        }}
                                        style={[styles.secondaryButton, { borderColor: theme.border, flexDirection: 'row', gap: Spacing.two, opacity: financialOperationsUnavailable || financialActionInProgress || financialRestricted || ibanInput.length !== 24 ? 0.55 : 1 }]}
                                    >
                                        {activeFinancialAction === 'save-iban'
                                            ? <ActivityIndicator color={theme.primaryText} />
                                            : null}
                                        <ThemedText type="smallBold" themeColor="primaryText">
                                            {activeFinancialAction === 'save-iban' ? 'در حال ذخیره…' : 'ذخیره شماره شبا'}
                                        </ThemedText>
                                    </Pressable>
                                </View>

                                <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                                    <View style={styles.sectionHeader}>
                                        <MaterialCommunityIcons name="bank-transfer-out" size={22} color={theme.primaryText} />
                                        <ThemedText type="bodyBold">درخواست برداشت</ThemedText>
                                    </View>
                                    {wallet.withdrawals.enabled ? (
                                        <>
                                            <ThemedText type="small" style={{ color: theme.textSecondary }}>
                                                سقف هر درخواست {money(wallet.withdrawals.max_per_request)} است. مبلغ تا بررسی درخواست از موجودی آزاد کسر می‌شود.
                                            </ThemedText>
                                            <ThemedText type="smallBold">روش واریز</ThemedText>
                                            <View accessibilityRole="radiogroup" style={styles.payoutMethodChoices}>
                                                <Pressable
                                                    accessibilityRole="radio"
                                                    accessibilityState={{ selected: withdrawalPayoutMethod === 'iban' }}
                                                    disabled={financialActionInProgress || financialRestricted}
                                                    onPress={() => setWithdrawalPayoutMethod('iban')}
                                                    style={[
                                                        styles.payoutMethodChoice,
                                                        {
                                                            backgroundColor: withdrawalPayoutMethod === 'iban' ? theme.primary : theme.surfaceElevated,
                                                            borderColor: withdrawalPayoutMethod === 'iban' ? theme.primary : theme.border,
                                                            opacity: financialActionInProgress || financialRestricted ? 0.6 : 1,
                                                        },
                                                    ]}
                                                >
                                                    <MaterialCommunityIcons
                                                        name="bank-outline"
                                                        size={18}
                                                        color={withdrawalPayoutMethod === 'iban' ? theme.onPrimary : theme.textSecondary}
                                                    />
                                                    <ThemedText type="smallBold" themeColor={withdrawalPayoutMethod === 'iban' ? 'onPrimary' : 'textSecondary'}>
                                                        شماره شبا
                                                    </ThemedText>
                                                </Pressable>
                                                <Pressable
                                                    accessibilityRole="radio"
                                                    accessibilityState={{ selected: withdrawalPayoutMethod === 'card' }}
                                                    disabled={financialActionInProgress || financialRestricted}
                                                    onPress={() => setWithdrawalPayoutMethod('card')}
                                                    style={[
                                                        styles.payoutMethodChoice,
                                                        {
                                                            backgroundColor: withdrawalPayoutMethod === 'card' ? theme.primary : theme.surfaceElevated,
                                                            borderColor: withdrawalPayoutMethod === 'card' ? theme.primary : theme.border,
                                                            opacity: financialActionInProgress || financialRestricted ? 0.6 : 1,
                                                        },
                                                    ]}
                                                >
                                                    <MaterialCommunityIcons
                                                        name="credit-card-outline"
                                                        size={18}
                                                        color={withdrawalPayoutMethod === 'card' ? theme.onPrimary : theme.textSecondary}
                                                    />
                                                    <ThemedText type="smallBold" themeColor={withdrawalPayoutMethod === 'card' ? 'onPrimary' : 'textSecondary'}>
                                                        شماره کارت
                                                    </ThemedText>
                                                </Pressable>
                                            </View>
                                            {withdrawalPayoutMethod === 'iban' ? (
                                                <ThemedText type="small" style={{ color: wallet.bank_account_iban_masked ? theme.textSecondary : theme.warning }}>
                                                    {wallet.bank_account_iban_masked
                                                        ? `مقصد ثبت‌شده: ${wallet.bank_account_iban_masked}`
                                                        : 'ابتدا شبای مقصد را در بخش بالا ثبت کنید.'}
                                                </ThemedText>
                                            ) : (
                                                <>
                                                    <ThemedText type="small" style={{ color: theme.textSecondary }}>
                                                        شماره کارت ۱۶ رقمی متعلق به خودتان را وارد کنید. اطلاعات فقط برای همین درخواست ثبت و به‌صورت رمزگذاری‌شده نگهداری می‌شود؛ رمز دوم، CVV2 و تاریخ انقضا را وارد نکنید.
                                                    </ThemedText>
                                                    <AppTextInput
                                                        accessibilityLabel="شماره کارت مقصد برداشت"
                                                        editable={!financialRestricted && !financialActionInProgress}
                                                        keyboardType="number-pad"
                                                        onChangeText={(value) => setWithdrawalCardNumber(normalizeDigits(value).slice(0, 16))}
                                                        placeholder="شماره کارت ۱۶ رقمی"
                                                        placeholderTextColor={theme.textMuted}
                                                        value={withdrawalCardNumber}
                                                        style={[styles.input, styles.cardNumberInput, { backgroundColor: theme.surfaceElevated, borderColor: theme.border, color: theme.text }]}
                                                    />
                                                </>
                                            )}
                                            <BankAmountInput
                                                accessibilityLabel="مبلغ برداشت به تومان"
                                                editable={!financialRestricted && !financialActionInProgress}
                                                onChangeText={setWithdrawalAmount}
                                                value={withdrawalAmount}
                                            />
                                            <Pressable
                                                accessibilityRole="button"
                                                disabled={
                                                    withdrawalDisabled
                                                }
                                                onPress={() => void handleWithdrawal()}
                                                style={[styles.primaryButton, {
                                                    backgroundColor: theme.secondary,
                                                    opacity: withdrawalDisabled ? 0.6 : 1,
                                                }]}
                                            >
                                                {activeFinancialAction === 'withdrawal'
                                                    ? <ActivityIndicator color={theme.onSecondary} />
                                                    : null}
                                                <ThemedText type="smallBold" style={{ color: theme.onSecondary }}>
                                                    {currentPendingWithdrawalAttempt ? 'تلاش دوباره برای ثبت همان درخواست' : 'ثبت درخواست برداشت'}
                                                </ThemedText>
                                            </Pressable>
                                        </>
                                    ) : (
                                        <ThemedText type="small" style={{ color: theme.textSecondary }}>
                                            درخواست برداشت در حال حاضر از سوی سامانه غیرفعال است.
                                        </ThemedText>
                                    )}
                                </View>
                            </>
                        )}

                        <Pressable
                            accessibilityRole="button"
                            onPress={() => router.push('/(tabs)/account/financial-history')}
                            style={[styles.historyButton, { borderColor: theme.border, backgroundColor: theme.surface }]}
                        >
                            <MaterialCommunityIcons name="receipt-text-outline" size={20} color={theme.primaryText} />
                            <ThemedText type="smallBold" themeColor="primaryText">مشاهده تاریخچه مالی</ThemedText>
                        </Pressable>
                    </>
                ) : null}
            </ScrollView>

            <Snackbar variant="error"
                visible={snackbarVisible}
                onDismiss={() => setSnackbarVisible(false)}
                duration={5000}
                style={{ backgroundColor: theme.surfaceElevated, borderRadius: Radius.md }}
            >
                <ThemedText type="small">{message}</ThemedText>
            </Snackbar>
        </ThemedView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.four, gap: Spacing.three },
    content: { flexGrow: 1, padding: Spacing.four, gap: Spacing.three },
    balanceCard: { borderWidth: 1, borderRadius: Radius.lg, padding: Spacing.four, gap: Spacing.two },
    balanceHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
    walletTabs: {
        flexDirection: 'row',
        gap: Spacing.one,
        borderWidth: 1,
        borderRadius: Radius.lg,
        padding: Spacing.one,
    },
    walletTab: {
        flex: 1,
        minHeight: 48,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: Spacing.one,
        borderWidth: 1,
        borderRadius: Radius.md,
        paddingHorizontal: Spacing.two,
    },
    card: { borderWidth: 1, borderRadius: Radius.lg, padding: Spacing.four, gap: Spacing.two },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
    input: { minHeight: 48, borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: Spacing.three, fontSize: Typography.fontSize.body, fontFamily: 'AppFont-Regular' },
    ibanInputWrap: { minHeight: 52, borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: Spacing.two, flexDirection: 'row', alignItems: 'center', direction: 'ltr' },
    ibanPrefix: { minHeight: 32, textAlignVertical: 'center', paddingRight: Spacing.two, marginRight: Spacing.two, borderRightWidth: StyleSheet.hairlineWidth },
    ibanInput: { flex: 1, minHeight: 48, paddingVertical: 0, fontSize: Typography.fontSize.body, textAlign: 'left', writingDirection: 'ltr' },
    payoutMethodChoices: { flexDirection: 'row', gap: Spacing.two },
    payoutMethodChoice: { flex: 1, minHeight: 48, borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: Spacing.two, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.one },
    cardNumberInput: { textAlign: 'left', writingDirection: 'ltr' },
    primaryButton: { minHeight: 48, borderRadius: Radius.md, paddingHorizontal: Spacing.three, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: Spacing.two },
    secondaryButton: { minHeight: 44, borderWidth: 1, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
    historyButton: { minHeight: 48, borderWidth: 1, borderRadius: Radius.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.two },
});
