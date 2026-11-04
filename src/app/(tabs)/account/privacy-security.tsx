import { Typography } from '@/constants/typography';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Snackbar } from 'react-native-paper';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ConfirmationModal } from '@/components/confirmation-modal';
import { AppTextInput } from '@/components/app-text';
import { OtpCodeInput } from '@/components/otp-code-input';
import { OtpResendControl } from '@/components/otp-resend-control';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { useAppFeedback } from '@/hooks/use-app-feedback';
import { useOtpResendCountdown } from '@/hooks/use-otp-resend-countdown';
import { useTheme } from '@/hooks/use-theme';
import { beginTwoFactorEnrollment, confirmTwoFactorEnrollment, disableTwoFactor, fetchTwoFactorStatus, getDeviceId, getStoredAuthToken, sendOtp, type AuthDevice, type TwoFactorEnrollment, type TwoFactorStatus } from '@/services/auth-api';
import { normalizeOtpCode } from '@/services/iranian-phone';
import { formatPersianDate } from '@/utils/persian-date';

function platformLabel(platform: AuthDevice['platform']): string {
    switch (platform) {
        case 'ios': return 'iOS';
        case 'android': return 'Android';
        case 'web': return 'مرورگر وب';
        case 'windows': return 'Windows';
        case 'macos': return 'macOS';
        case 'linux': return 'Linux';
        case 'desktop': return 'رایانه';
        default: return 'پلتفرم نامشخص';
    }
}

function platformIcon(platform: AuthDevice['platform']): React.ComponentProps<typeof MaterialCommunityIcons>['name'] {
    switch (platform) {
        case 'ios': return 'apple';
        case 'android': return 'android';
        case 'web': return 'web';
        case 'windows': return 'microsoft-windows';
        case 'macos': return 'laptop';
        case 'linux':
        case 'desktop': return 'desktop-classic';
        default: return 'devices';
    }
}

type ConfirmationAction =
    | { type: 'delete-account'; code: string }
    | { type: 'enable-inactivity-deletion'; period: 6 | 12 | 18 }
    | { type: 'sign-out-current' }
    | { type: 'sign-out-all' }
    | { type: 'revoke-device'; device: AuthDevice };

type SnackbarKind = 'info' | 'success' | 'error';
type BusyAction = 'delete-code' | 'inactivity' | null;
type InactivityDeletionPeriod = 6 | 12 | 18 | null;
export default function PrivacySecurityScreen() {
    const theme = useTheme();
    const router = useRouter();
    const {
        user,
        getDevices,
        revokeUserDevice,
        signOut,
        signOutAll,
        deleteAccount,
        updateInactivityDeletion,
    } = useAuth();
    const { showError } = useAppFeedback();
    const restrictedCapabilities = user?.restricted_capabilities ?? [];
    const securityRestricted = restrictedCapabilities.includes('security');
    const profileRestricted = restrictedCapabilities.includes('profile');
    const [devices, setDevices] = useState<AuthDevice[]>([]);
    const [deleteCode, setDeleteCode] = useState('');
    const [deleteCodeSent, setDeleteCodeSent] = useState(false);
    const { secondsRemaining: resendSeconds, start: startResendCountdown } = useOtpResendCountdown();
    const [busy, setBusy] = useState(false);
    const [busyAction, setBusyAction] = useState<BusyAction>(null);
    const [pendingInactivityPeriod, setPendingInactivityPeriod] = useState<InactivityDeletionPeriod>(null);
    const [twoFactorStatus, setTwoFactorStatus] = useState<TwoFactorStatus | null>(null);
    const [twoFactorEnrollment, setTwoFactorEnrollment] = useState<TwoFactorEnrollment | null>(null);
    const [twoFactorRecoveryCodes, setTwoFactorRecoveryCodes] = useState<string[]>([]);
    const [twoFactorCode, setTwoFactorCode] = useState('');
    const [twoFactorBusy, setTwoFactorBusy] = useState(false);
    const [snackbar, setSnackbar] = useState('');
    const [snackbarKind, setSnackbarKind] = useState<SnackbarKind>('info');
    const [confirmationAction, setConfirmationAction] = useState<ConfirmationAction | null>(null);

    const showMessage = (message: string, kind: SnackbarKind = 'info') => {
        setSnackbarKind(kind);
        setSnackbar(message);
    };

    const refreshDevices = useCallback(async () => {
        try {
            setDevices(await getDevices());
        } catch (loadError) {
            showError(loadError, 'دریافت فهرست دستگاه‌ها ناموفق بود.');
        }
    }, [getDevices, showError]);

    useEffect(() => {
        let isMounted = true;
        if (user) {
            void getDevices()
                .then((activeDevices) => {
                    if (isMounted) setDevices(activeDevices);
                })
                .catch((loadError: unknown) => {
                    if (isMounted) {
                        showError(loadError, 'دریافت فهرست دستگاه‌ها ناموفق بود.');
                    }
                });
        }
        return () => {
            isMounted = false;
        };
    }, [getDevices, showError, user]);

    useEffect(() => {
        let isMounted = true;

        const loadTwoFactorStatus = async () => {
            if (!user) {
                setTwoFactorStatus(null);
                return;
            }

            try {
                const token = await getStoredAuthToken();
                if (!token) throw new Error('نشست کاربری برای دریافت وضعیت امنیتی در دسترس نیست.');
                const status = await fetchTwoFactorStatus(token);
                if (isMounted) setTwoFactorStatus(status);
            } catch (loadError) {
                if (isMounted) {
                    showError(loadError, 'وضعیت تأیید دومرحله‌ای دریافت نشد.');
                }
            }
        };

        void loadTwoFactorStatus();
        return () => {
            isMounted = false;
        };
    }, [showError, user]);

    const beginTwoFactorSetup = async () => {
        setTwoFactorBusy(true);
        try {
            const token = await getStoredAuthToken();
            if (!token) throw new Error('برای تغییر امنیت حساب دوباره وارد شوید.');
            setTwoFactorEnrollment(await beginTwoFactorEnrollment(token));
            setTwoFactorCode('');
            setTwoFactorRecoveryCodes([]);
        } catch (setupError) {
            showError(setupError, 'شروع راه‌اندازی ناموفق بود.');
        } finally {
            setTwoFactorBusy(false);
        }
    };

    const confirmTwoFactorSetup = async () => {
        if (twoFactorBusy) return;
        setTwoFactorBusy(true);
        try {
            const token = await getStoredAuthToken();
            if (!token) throw new Error('برای تغییر امنیت حساب دوباره وارد شوید.');
            const recoveryCodes = await confirmTwoFactorEnrollment(token, normalizeOtpCode(twoFactorCode));
            setTwoFactorRecoveryCodes(recoveryCodes);
            setTwoFactorStatus({
                enabled: true,
                enabled_at: new Date().toISOString(),
                recovery_codes_remaining: recoveryCodes.length,
            });
            setTwoFactorEnrollment(null);
            setTwoFactorCode('');
            showMessage('تأیید دومرحله‌ای فعال شد. کدهای بازیابی را در جای امن نگه دارید.', 'success');
        } catch (setupError) {
            showError(setupError, 'تأیید راه‌اندازی ناموفق بود.');
        } finally {
            setTwoFactorBusy(false);
        }
    };

    const copyTwoFactorSecret = async () => {
        if (!twoFactorEnrollment) return;
        try {
            await Clipboard.setStringAsync(twoFactorEnrollment.secret);
            showMessage('کلید راه‌اندازی کپی شد.', 'success');
        } catch (copyError) {
            showError(copyError, 'کپی کلید راه‌اندازی ناموفق بود.');
        }
    };

    const turnOffTwoFactor = async () => {
        if (twoFactorBusy) return;
        setTwoFactorBusy(true);
        try {
            const token = await getStoredAuthToken();
            if (!token) throw new Error('برای تغییر امنیت حساب دوباره وارد شوید.');
            await disableTwoFactor(token, twoFactorCode.trim().toUpperCase());
            setTwoFactorStatus({ enabled: false, enabled_at: null, recovery_codes_remaining: 0 });
            setTwoFactorCode('');
            setTwoFactorRecoveryCodes([]);
            showMessage('تأیید دومرحله‌ای خاموش شد.', 'success');
        } catch (disableError) {
            showError(disableError, 'خاموش‌کردن تأیید دومرحله‌ای ناموفق بود.');
        } finally {
            setTwoFactorBusy(false);
        }
    };

    const saveInactivityDeletionPeriod = async (period: InactivityDeletionPeriod) => {
        setBusy(true);
        setBusyAction('inactivity');
        setPendingInactivityPeriod(period);
        try {
            await updateInactivityDeletion(period);
            showMessage(
                period === null
                    ? 'حذف خودکار حساب غیرفعال شد.'
                    : `حذف خودکار پس از ${period} ماه بی‌فعالیتی فعال شد.`,
                'success',
            );
        } catch (updateError) {
            showError(updateError, 'ذخیرهٔ تنظیم حذف خودکار ناموفق بود.');
        } finally {
            setBusy(false);
            setBusyAction(null);
            setPendingInactivityPeriod(null);
            setConfirmationAction(null);
        }
    };

    const chooseInactivityDeletionPeriod = async (period: InactivityDeletionPeriod) => {
        if (busy || period === user?.inactivity_deletion_period_months) return;

        if (period !== null) {
            setConfirmationAction({ type: 'enable-inactivity-deletion', period });
            return;
        }

        await saveInactivityDeletionPeriod(null);
    };

    const requestDeleteCode = async () => {
        if (!user?.phone) {
            showMessage('شمارهٔ تأییدشده‌ای برای حساب پیدا نشد.', 'error');
            return;
        }

        setBusy(true);
        setBusyAction('delete-code');
        try {
            const response = await sendOtp({ phone: user.phone, type: 'login' });
            setDeleteCode('');
            setDeleteCodeSent(true);
            startResendCountdown(response.resend_after);
            showMessage('کد تأیید از طریق پیامک ارسال شد.');
        } catch (requestError) {
            showError(requestError, 'ارسال کد ناموفق بود.');
        } finally {
            setBusy(false);
            setBusyAction(null);
        }
    };

    const confirmDeleteAccount = () => {
        const normalizedCode = normalizeOtpCode(deleteCode);
        if (!/^\d{6}$/.test(normalizedCode)) {
            showMessage('کد شش‌رقمی را وارد کنید.', 'error');
            return;
        }

        setConfirmationAction({ type: 'delete-account', code: normalizedCode });
    };

    const revokeDevice = async (device: AuthDevice) => {
        setBusy(true);
        try {
            await revokeUserDevice(device.id);
            setConfirmationAction(null);
            if (device.device_id === await getDeviceId()) {
                router.replace('/auth');
                return;
            }
            await refreshDevices();
        } catch (revokeError) {
            showError(revokeError, 'غیرفعال‌کردن دستگاه ناموفق بود.');
            setConfirmationAction(null);
        } finally {
            setBusy(false);
        }
    };

    const signOutCurrentDevice = async () => {
        setBusy(true);
        try {
            await signOut();
            setConfirmationAction(null);
            router.replace('/auth');
        } catch (signOutError) {
            showError(signOutError, 'خروج از این دستگاه ناموفق بود.');
            setConfirmationAction(null);
            setBusy(false);
        }
    };

    const confirmSignOutAllDevices = () => {
        setConfirmationAction({ type: 'sign-out-all' });
    };

    const performConfirmation = async () => {
        if (!confirmationAction || busy) return;

        if (confirmationAction.type === 'delete-account') {
            setBusy(true);
            try {
                await deleteAccount(confirmationAction.code);
                setConfirmationAction(null);
                router.replace('/auth');
            } catch (deleteError) {
                showError(deleteError, 'حذف حساب ناموفق بود.');
                setConfirmationAction(null);
            } finally {
                setBusy(false);
            }
            return;
        }

        if (confirmationAction.type === 'enable-inactivity-deletion') {
            await saveInactivityDeletionPeriod(confirmationAction.period);
            return;
        }

        if (confirmationAction.type === 'sign-out-all') {
            setBusy(true);
            try {
                await signOutAll();
                setConfirmationAction(null);
                router.replace('/auth');
            } catch (signOutError) {
                showError(signOutError, 'خروج از همهٔ دستگاه‌ها ناموفق بود.');
                setConfirmationAction(null);
            } finally {
                setBusy(false);
            }
            return;
        }

        if (confirmationAction.type === 'sign-out-current') {
            await signOutCurrentDevice();
            return;
        }

        await revokeDevice(confirmationAction.device);
    };

    if (!user) {
        return (
            <ThemedView style={styles.container}>
                <ThemedText type="body">برای مدیریت حریم خصوصی و امنیت ابتدا وارد حساب شوید.</ThemedText>
            </ThemedView>
        );
    }

    const confirmationTitle = confirmationAction?.type === 'delete-account'
        ? 'حذف دائمی حساب؟'
        : confirmationAction?.type === 'enable-inactivity-deletion'
            ? 'تأیید فعال‌سازی حذف خودکار؟'
            : confirmationAction?.type === 'sign-out-all'
                ? 'خروج از همهٔ دستگاه‌ها؟'
                : confirmationAction?.type === 'sign-out-current'
                    ? 'خروج از این دستگاه؟'
                    : 'لغو این نشست؟';
    const confirmationMessage = confirmationAction?.type === 'delete-account'
        ? 'با تأیید، حساب شما به‌صورت دائمی حذف خواهد شد:'
        : confirmationAction?.type === 'enable-inactivity-deletion'
            ? `با فعال‌سازی این گزینه و رسیدن مدت بی‌فعالیتی به ${confirmationAction.period} ماه، حذف حساب پس از هشدار پیامکی و مهلت ۳۰روزه انجام خواهد شد:`
            : confirmationAction?.type === 'sign-out-all'
                ? 'نشست شما در همهٔ دستگاه‌ها لغو می‌شود و برای استفادهٔ دوباره باید وارد شوید.'
                : confirmationAction?.type === 'sign-out-current'
                    ? 'از این دستگاه خارج می‌شوید. برای استفادهٔ دوباره باید وارد حساب شوید.'
                    : confirmationAction?.type === 'revoke-device'
                        ? `دسترسی ${confirmationAction.device.device_name || platformLabel(confirmationAction.device.platform)} فوراً لغو می‌شود.`
                        : '';
    const confirmationMessageItems = confirmationAction?.type === 'delete-account'
        ? [
            'ماندهٔ کیف پول و دسترسی به اشتراک فعال و مزایای آن از دسترس شما خارج می‌شود.',
            'این اقدام قابل بازگشت نیست؛ پیش از تأیید، موجودی و وضعیت اشتراک خود را بررسی کنید.',
        ]
        : confirmationAction?.type === 'enable-inactivity-deletion'
            ? [
                'ماندهٔ کیف پول و دسترسی به اشتراک فعال و مزایای آن از دسترس شما خارج می‌شود.',
                'ورود دوباره به حساب یا خاموش‌کردن این گزینه، فرایند حذف را لغو می‌کند.',
                'وجود پرداخت یا برداشت حل‌نشده، حذف را تا تعیین تکلیف آن به تعویق می‌اندازد.',
            ]
            : undefined;
    const confirmationLabel = confirmationAction?.type === 'delete-account'
        ? 'حذف دائمی'
        : confirmationAction?.type === 'enable-inactivity-deletion'
            ? 'فعال‌سازی'
            : confirmationAction?.type === 'sign-out-all'
                ? 'خروج از همه'
                : confirmationAction?.type === 'sign-out-current'
                    ? 'خروج'
                    : 'لغو نشست';
    const confirmationIcon = confirmationAction?.type === 'delete-account'
        ? 'delete-outline'
        : confirmationAction?.type === 'enable-inactivity-deletion'
            ? 'timer-alert-outline'
            : 'logout';

    return (
        <ThemedView style={styles.container}>
            <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
                <View style={[styles.introCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                    <View style={[styles.introIcon, { backgroundColor: theme.primary }]}>
                        <MaterialCommunityIcons name="shield-lock-outline" size={25} color={theme.onPrimary} />
                    </View>
                    <ThemedText type="subtitle" style={styles.introTitle}>امنیت حساب شما</ThemedText>
                    <ThemedText type="small" style={[styles.introText, { color: theme.textSecondary }]}>
                        نشست‌ها، شمارهٔ تلفن و داده‌های شخصی خود را مدیریت کنید.
                    </ThemedText>
                </View>

                <Section title="تأیید دومرحله‌ای" icon="shield-key-outline" theme={theme}>
                    <ThemedText type="small" style={{ color: theme.textSecondary }}>
                        با برنامهٔ احراز هویت، ورود به حساب را ایمن‌تر کنید. این گزینه اختیاری و در حالت پیش‌فرض خاموش است.
                    </ThemedText>
                    {twoFactorStatus?.enabled ? (
                        <>
                            <ThemedText type="smallBold" style={{ color: theme.success }}>
                                فعال است · {twoFactorStatus.recovery_codes_remaining} کد بازیابی باقی مانده
                            </ThemedText>
                            <ThemedText type="small" style={{ color: theme.textSecondary }}>
                                برای خاموش‌کردن، کد جاری برنامه یا یک کد بازیابی مصرف‌نشده را وارد کنید.
                            </ThemedText>
                            <AppTextInput
                                accessibilityLabel="کد برای خاموش‌کردن تأیید دومرحله‌ای"
                                autoCapitalize="characters"
                                autoCorrect={false}
                                maxLength={64}
                                editable={!securityRestricted}
                                onChangeText={setTwoFactorCode}
                                placeholder="کد برنامه یا کد بازیابی"
                                placeholderTextColor={theme.textMuted}
                                value={twoFactorCode}
                                style={[styles.profileInput, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]}
                            />
                            <ActionButton
                                label="خاموش‌کردن تأیید دومرحله‌ای"
                                icon="shield-off-outline"
                                busy={twoFactorBusy}
                                disabled={securityRestricted}
                                onPress={() => void turnOffTwoFactor()}
                                theme={theme}
                            />
                        </>
                    ) : (
                        <>
                            {twoFactorEnrollment ? (
                                <>
                                    <ThemedText type="small" style={{ color: theme.textSecondary }}>
                                        این کلید را در برنامهٔ احراز هویت خود وارد کنید. راه‌اندازی تا ۱۰ دقیقه معتبر است.
                                    </ThemedText>
                                    <ThemedText selectable type="code" style={[styles.twoFactorSecret, { color: theme.text, backgroundColor: theme.surfaceContainerHigh }]}>
                                        {twoFactorEnrollment.secret}
                                    </ThemedText>
                                    <Pressable
                                        accessibilityRole="button"
                                        accessibilityLabel="کپی کلید راه‌اندازی تأیید دومرحله‌ای"
                                        onPress={() => void copyTwoFactorSecret()}
                                        style={({ pressed }) => [
                                            styles.copySecretButton,
                                            {
                                                backgroundColor: theme.primary,
                                                borderColor: theme.border,
                                                opacity: pressed ? 0.7 : 1,
                                            },
                                        ]}
                                    >
                                        <MaterialCommunityIcons name="content-copy" size={18} color={theme.onPrimary} />
                                        <ThemedText type="smallBold" style={{ color: theme.onPrimary }}>کپی کلید</ThemedText>
                                    </Pressable>
                                    <OtpCodeInput
                                        accessibilityLabel="کد برنامه برای فعال‌سازی تأیید دومرحله‌ای"
                                        disabled={twoFactorBusy || securityRestricted}
                                        label="کد ۶ رقمی برنامه"
                                        onChangeText={setTwoFactorCode}
                                        value={twoFactorCode}
                                    />
                                    <ActionButton
                                        label="تأیید و فعال‌سازی"
                                        icon="check"
                                        busy={twoFactorBusy}
                                        disabled={securityRestricted || twoFactorCode.length !== 6}
                                        onPress={() => void confirmTwoFactorSetup()}
                                        theme={theme}
                                    />
                                </>
                            ) : (
                                <ActionButton
                                    label="راه‌اندازی تأیید دومرحله‌ای"
                                    icon="shield-key-outline"
                                    busy={twoFactorBusy || twoFactorStatus === null}
                                    disabled={securityRestricted || twoFactorStatus === null}
                                    onPress={() => void beginTwoFactorSetup()}
                                    theme={theme}
                                />
                            )}
                        </>
                    )}
                    {twoFactorRecoveryCodes.length > 0 ? (
                        <View style={[styles.recoveryCodes, { backgroundColor: theme.surfaceVariant }]}>
                            <ThemedText type="smallBold">کدهای بازیابی؛ هر کد فقط یک‌بار قابل استفاده است</ThemedText>
                            <ThemedText selectable type="code" style={{ color: theme.text }}>
                                {twoFactorRecoveryCodes.join('\n')}
                            </ThemedText>
                        </View>
                    ) : null}
                    {securityRestricted ? (
                        <ThemedText type="small" style={{ color: theme.warning }}>
                            به‌دلیل محدودیت امنیت حساب، تغییر تنظیمات تأیید دومرحله‌ای موقتاً غیرفعال است.
                        </ThemedText>
                    ) : null}
                </Section>

                <Section title="نشست‌ها و دستگاه‌ها" icon="devices" theme={theme}>
                    <ThemedText type="small" style={{ color: theme.textSecondary }}>
                        حداکثر ۳ نشست فعال نگهداری می‌شود. نشست پس از ۳۰ روز بی‌فعالیتی خودکار منقضی و دسترسی آن لغو می‌شود؛ نشست‌های بدون فعالیت بیش از ۷ روز نیز با برچسب «قدیمی» مشخص می‌شوند.
                    </ThemedText>
                    {devices.map((device) => (
                        <View key={device.id} style={[styles.deviceCard, { backgroundColor: theme.surfaceVariant }]}>
                            <View style={styles.deviceHeader}>
                                <View style={[styles.devicePlatformIcon, { backgroundColor: theme.primary }]}>
                                    <MaterialCommunityIcons name={platformIcon(device.platform)} size={20} color={theme.onPrimary} />
                                </View>
                                <View style={styles.deviceText}>
                                    <ThemedText type="smallBold">
                                        نشست دستگاه
                                    </ThemedText>
                                </View>
                                <View style={styles.deviceStatus}>
                                    {device.is_current ? (
                                        <View style={[styles.deviceStatusBadge, { backgroundColor: theme.success + '18' }]}>
                                            <ThemedText type="small" style={{ color: theme.success }}>این دستگاه</ThemedText>
                                        </View>
                                    ) : null}
                                    {!device.is_current && device.is_stale ? (
                                        <View style={[styles.deviceStatusBadge, { backgroundColor: theme.warningFill }]}>
                                            <ThemedText type="small" style={{ color: theme.onWarning }}>قدیمی</ThemedText>
                                        </View>
                                    ) : null}
                                </View>
                                {!device.is_current ? (
                                    <Pressable
                                        accessibilityRole="button"
                                        accessibilityLabel={`لغو نشست ${device.device_name || 'دستگاه'}`}
                                        disabled={busy || securityRestricted}
                                        onPress={() => setConfirmationAction({ type: 'revoke-device', device })}
                                        style={({ pressed }) => [
                                            styles.revokeDeviceButton,
                                            {
                                                borderColor: theme.border,
                                                backgroundColor: theme.primary,
                                                opacity: pressed || busy ? 0.72 : 1,
                                            },
                                        ]}
                                    >
                                        <MaterialCommunityIcons name="logout" size={19} color={theme.onPrimary} />
                                    </Pressable>
                                ) : null}
                            </View>
                            <View style={[styles.deviceDetails, { borderTopColor: theme.border }]}>
                                <View style={styles.deviceDetailRow}>
                                    <MaterialCommunityIcons name="laptop" size={16} color={theme.textMuted} />
                                    <ThemedText type="small" style={[styles.deviceDetailLabel, { color: theme.textSecondary }]}>
                                        سیستم‌عامل:
                                    </ThemedText>
                                    <ThemedText type="small" style={[styles.deviceDetailValue, { color: theme.text }]}>
                                        {platformLabel(device.platform)}
                                    </ThemedText>
                                </View>
                                <View style={styles.deviceDetailRow}>
                                    <MaterialCommunityIcons name="devices" size={16} color={theme.textMuted} />
                                    <ThemedText type="small" style={[styles.deviceDetailLabel, { color: theme.textSecondary }]}>
                                        نام دستگاه:
                                    </ThemedText>
                                    <ThemedText type="small" style={[styles.deviceDetailValue, { color: theme.text }]}>
                                        {device.device_name || 'نامشخص'}
                                    </ThemedText>
                                </View>
                                <View style={styles.deviceDetailRow}>
                                    <MaterialCommunityIcons name="cellphone-link" size={16} color={theme.textMuted} />
                                    <ThemedText type="small" style={[styles.deviceDetailLabel, { color: theme.textSecondary }]}>
                                        مدل دستگاه:
                                    </ThemedText>
                                    <ThemedText type="small" style={[styles.deviceDetailValue, { color: theme.text }]}>
                                        {device.device_model || 'نامشخص'}
                                    </ThemedText>
                                </View>
                                <View style={styles.deviceDetailRow}>
                                    <MaterialCommunityIcons name="clock-outline" size={16} color={theme.textMuted} />
                                    <ThemedText type="small" style={[styles.deviceDetailLabel, { color: theme.textSecondary }]}>
                                        آخرین فعالیت:
                                    </ThemedText>
                                    <ThemedText type="small" style={[styles.deviceDetailValue, { color: theme.text }]}>
                                        {device.last_activity ? formatPersianDate(device.last_activity, { dateStyle: 'medium', timeStyle: 'short' }) : 'نامشخص'}
                                    </ThemedText>
                                </View>
                                {device.expires_at ? (
                                    <View style={styles.deviceDetailRow}>
                                        <MaterialCommunityIcons name="calendar-clock-outline" size={16} color={theme.textMuted} />
                                        <ThemedText type="small" style={[styles.deviceDetailLabel, { color: theme.textSecondary }]}>
                                            انقضای نشست:
                                        </ThemedText>
                                        <ThemedText type="small" style={[styles.deviceDetailValue, { color: theme.text }]}>
                                            {formatPersianDate(device.expires_at, { dateStyle: 'medium', timeStyle: 'short' })}
                                        </ThemedText>
                                    </View>
                                ) : null}
                            </View>
                        </View>
                    ))}
                    {devices.length === 0 ? (
                        <ThemedText type="small" style={{ color: theme.textSecondary }}>دستگاه فعالی ثبت نشده است.</ThemedText>
                    ) : null}
                    <View style={[styles.divider, { backgroundColor: theme.border }]} />
                    <ActionButton
                        label="خروج از این دستگاه"
                        icon="logout"
                        disabled={busy}
                        onPress={() => setConfirmationAction({ type: 'sign-out-current' })}
                        theme={theme}
                    />
                    <ActionButton
                        label="خروج از همهٔ دستگاه‌ها"
                        icon="logout-variant"
                        disabled={busy}
                        onPress={confirmSignOutAllDevices}
                        theme={theme}
                    />
                </Section>

                <Section title="داده‌ها و حریم خصوصی" icon="database-lock-outline" theme={theme}>
                    <View style={[styles.noticeCard, { backgroundColor: theme.primary }]}>
                        <MaterialCommunityIcons name="information-outline" size={20} color={theme.onPrimary} />
                        <ThemedText type="small" style={[styles.noticeText, { color: theme.onPrimary }]}>
                            اطلاعات پروفایل شما فقط در حساب خودتان نمایش داده می‌شود و نمایهٔ عمومی کاربران فعال نیست.
                        </ThemedText>
                    </View>
                    <View style={[styles.divider, { backgroundColor: theme.border }]} />
                    <View style={styles.inactivityHeader}>
                        <View style={[styles.inactivityIcon, { backgroundColor: theme.primary }]}>
                            <MaterialCommunityIcons name="timer-sand" size={20} color={theme.onPrimary} />
                        </View>
                        <View style={styles.inactivityHeaderText}>
                            <ThemedText type="smallBold">حذف خودکار حساب</ThemedText>
                            <ThemedText type="small" style={[styles.noticeText, { color: theme.textSecondary }]}>
                                در صورت بی‌فعالیتی طولانی، حساب با هشدار قبلی حذف می‌شود.
                            </ThemedText>
                        </View>
                    </View>
                    <View style={styles.inactivityNotes}>
                        {[
                            'پس از دورهٔ بی‌فعالیتی انتخاب‌شده، هشدار حذف به شمارهٔ تلفن تأییدشده ارسال می‌شود و مهلت ۳۰روزه برای لغو در نظر گرفته می‌شود.',
                            'اگر پرداخت یا برداشت حل‌نشده‌ای وجود داشته باشد، حذف تا تعیین تکلیف آن به تعویق می‌افتد.',
                            'ورود دوباره به حساب یا خاموش‌کردن این گزینه، فرایند حذف خودکار را لغو می‌کند.',
                            'فعال‌سازی این قابلیت به پیکربندی پیامک در سرور نیاز دارد.',
                        ].map((note) => (
                            <View key={note} style={styles.inactivityNote}>
                                <View style={[styles.inactivityNoteBullet, { backgroundColor: theme.textSecondary }]} />
                                <ThemedText type="small" style={[styles.inactivityNoteText, { color: theme.textSecondary }]}>
                                    {note}
                                </ThemedText>
                            </View>
                        ))}
                    </View>
                    <View style={[styles.noticeCard, { backgroundColor: theme.warningFill }]}>
                        <MaterialCommunityIcons name="alert-outline" size={19} color={theme.onWarning} />
                        <ThemedText type="small" style={[styles.noticeText, { color: theme.onWarning }]}>
                            با حذف حساب، ماندهٔ کیف پول و دسترسی به اشتراک فعال و مزایای آن از دسترس شما خارج می‌شود. پیش از فعال‌سازی، موجودی و وضعیت اشتراک خود را بررسی کنید.
                        </ThemedText>
                    </View>
                    {!user.phone_verified_at ? (
                        <View style={[styles.noticeCard, { backgroundColor: theme.surfaceVariant }]}>
                            <MaterialCommunityIcons name="cellphone-lock" size={19} color={theme.textSecondary} />
                            <ThemedText type="small" style={{ color: theme.textSecondary }}>
                                برای فعال‌سازی این قابلیت، شمارهٔ تلفن باید تأیید شده باشد.
                            </ThemedText>
                        </View>
                    ) : null}
                    {user.inactivity_deletion_scheduled_at ? (
                        <View style={[styles.pendingDeletion, { backgroundColor: theme.warningFill }]}>
                            <MaterialCommunityIcons name="alert-outline" size={19} color={theme.onWarning} />
                            <ThemedText type="small" style={[styles.pendingDeletionText, { color: theme.onWarning }]}>
                                حذف حساب برای {formatPersianDate(user.inactivity_deletion_scheduled_at, { dateStyle: 'medium' }) ?? 'نامشخص'} زمان‌بندی شده است؛ با حذف، ماندهٔ کیف پول و دسترسی به اشتراک فعال و مزایای آن از دسترس خارج می‌شود. وجود پرداخت یا برداشت حل‌نشده حذف را تا تعیین تکلیف آن به تعویق می‌اندازد. برای لغو، وارد حساب بمانید یا گزینهٔ حذف خودکار را خاموش کنید.
                            </ThemedText>
                        </View>
                    ) : null}
                    <View style={[styles.inactivityOptions, { borderColor: theme.border }]}>
                        {([
                            { value: null, label: 'خاموش' },
                            { value: 6, label: '۶ ماه' },
                            { value: 12, label: '۱۲ ماه' },
                            { value: 18, label: '۱۸ ماه' },
                        ] as const).map((option, index) => {
                            const selected = user.inactivity_deletion_period_months === option.value;
                            const optionDisabled = busy || profileRestricted || (
                                option.value !== null
                                && !user.phone_verified_at
                                && !selected
                            );

                            return (
                                <Pressable
                                    key={option.label}
                                    accessibilityRole="radio"
                                    accessibilityState={{ checked: selected, disabled: optionDisabled }}
                                    disabled={optionDisabled}
                                    onPress={() => void chooseInactivityDeletionPeriod(option.value)}
                                    style={[
                                        styles.inactivityOption,
                                        index > 0 && { borderTopColor: theme.border },
                                    ]}
                                >
                                    <ThemedText
                                        type="small"
                                        style={{ color: optionDisabled ? theme.textMuted : theme.text }}
                                    >
                                        {option.label}
                                    </ThemedText>
                                    {busyAction === 'inactivity' && pendingInactivityPeriod === option.value ? (
                                        <ActivityIndicator size="small" color={theme.primaryText} />
                                    ) : (
                                        <MaterialCommunityIcons
                                            name={selected ? 'radiobox-marked' : 'radiobox-blank'}
                                            size={21}
                                            color={selected ? theme.primaryText : theme.textMuted}
                                        />
                                    )}
                                </Pressable>
                            );
                        })}
                    </View>
                    {profileRestricted ? (
                        <ThemedText type="small" style={{ color: theme.warning }}>
                            تغییر تنظیم حذف خودکار به‌دلیل محدودیت ویرایش پروفایل موقتاً غیرفعال است.
                        </ThemedText>
                    ) : null}
                </Section>

                <Section title="حذف حساب" icon="delete-outline" theme={theme}>
                    <View style={[styles.noticeCard, { backgroundColor: theme.warningFill }]}>
                        <MaterialCommunityIcons name="alert-outline" size={19} color={theme.onWarning} />
                        <ThemedText type="small" style={[styles.noticeText, { color: theme.onWarning }]}>
                            حذف حساب دائمی است و پس از انجام، قابل بازگشت نیست. اگر پرداخت یا برداشت در حال تعیین تکلیف باشد، تا نهایی‌شدن آن امکان حذف حساب وجود ندارد. برای تأیید، کد به شمارهٔ ثبت‌شده ارسال می‌شود.
                        </ThemedText>
                    </View>
                    {deleteCodeSent ? (
                        <OtpCodeInput
                            accessibilityLabel="کد تأیید حذف حساب"
                            onChangeText={setDeleteCode}
                            value={deleteCode}
                        />
                    ) : null}
                    {deleteCodeSent ? (
                        <OtpResendControl
                            disabled={busy}
                            label="ارسال دوبارهٔ کد حذف"
                            onPress={() => void requestDeleteCode()}
                            secondsRemaining={resendSeconds}
                        />
                    ) : null}
                    <ActionButton
                        label={deleteCodeSent ? 'حذف دائمی حساب' : 'درخواست کد تأیید حذف'}
                        icon="delete-outline"
                        busy={busyAction === 'delete-code'}
                        disabled={busy}
                        onPress={() => void (deleteCodeSent ? confirmDeleteAccount() : requestDeleteCode())}
                        theme={theme}
                    />
                </Section>

            </ScrollView>
            <ConfirmationModal
                visible={confirmationAction !== null}
                title={confirmationTitle}
                message={confirmationMessage}
                messageItems={confirmationMessageItems}
                confirmLabel={confirmationLabel}
                icon={confirmationIcon}
                busy={busy}
                onCancel={() => setConfirmationAction(null)}
                onConfirm={performConfirmation}
            />
            <Snackbar
                visible={Boolean(snackbar)}
                onDismiss={() => setSnackbar('')}
                duration={4500}
                style={{
                    backgroundColor: snackbarKind === 'error'
                        ? theme.errorFill
                        : snackbarKind === 'success' ? theme.successFill : theme.infoFill,
                    borderRadius: Radius.md,
                }}
                action={{
                    label: 'بستن',
                    onPress: () => setSnackbar(''),
                    labelStyle: { color: theme.onStatus },
                }}
            >
                <ThemedText
                    type="small"
                    accessibilityRole={snackbarKind === 'error' ? 'alert' : undefined}
                    style={{ color: theme.onStatus }}
                >
                    {snackbar}
                </ThemedText>
            </Snackbar>
        </ThemedView>
    );
}

function Section({
    title,
    icon,
    theme,
    children,
}: {
    title: string;
    icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
    theme: ReturnType<typeof useTheme>;
    children: React.ReactNode;
}) {
    return (
        <View style={styles.section}>
            <View style={styles.sectionHeading}>
                <View style={[styles.sectionIcon, { backgroundColor: theme.primary }]}>
                    <MaterialCommunityIcons name={icon} size={20} color={theme.onPrimary} />
                </View>
                <ThemedText type="smallBold">{title}</ThemedText>
            </View>
            <View style={[styles.sectionBody, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                {children}
            </View>
        </View>
    );
}

function ActionButton({
    label,
    icon,
    busy = false,
    disabled = false,
    onPress,
    theme,
}: {
    label: string;
    icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
    busy?: boolean;
    disabled?: boolean;
    onPress: () => void;
    theme: ReturnType<typeof useTheme>;
}) {
    const color = theme.onPrimary;

    return (
        <Pressable
            accessibilityRole="button"
            disabled={busy || disabled}
            onPress={onPress}
            style={({ pressed }) => [
                styles.actionButton,
                {
                    backgroundColor: theme.primary,
                    borderColor: theme.border,
                    opacity: pressed || busy || disabled ? 0.72 : 1,
                },
            ]}
        >
            {busy ? <ActivityIndicator size="small" color={color} /> : <MaterialCommunityIcons name={icon} size={19} color={color} />}
            <ThemedText type="smallBold" style={{ color }}>{label}</ThemedText>
            <MaterialCommunityIcons name="chevron-left" size={20} color={theme.textMuted} style={styles.actionChevron} />
        </Pressable>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    content: { padding: Spacing.four, paddingBottom: Spacing.six, gap: Spacing.four },
    introCard: {
        borderWidth: 1,
        borderRadius: Radius.lg,
        padding: Spacing.four,
        alignItems: 'center',
        gap: Spacing.two,
    },
    introIcon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
    introTitle: { textAlign: 'center' },
    introText: { textAlign: 'center' },
    noticeCard: { borderRadius: Radius.md, padding: Spacing.three, flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
    noticeText: { flex: 1 },
    inactivityHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
    inactivityIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
    inactivityHeaderText: { flex: 1, gap: 2 },
    inactivityNotes: { gap: Spacing.two },
    inactivityNote: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
    inactivityNoteBullet: { width: 6, height: 6, borderRadius: 3, marginTop: 8 },
    inactivityNoteText: { flex: 1 },
    inactivityOptions: { borderWidth: 1, borderRadius: Radius.md, overflow: 'hidden' },
    inactivityOption: {
        minHeight: 48,
        paddingHorizontal: Spacing.three,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderTopWidth: StyleSheet.hairlineWidth,
    },
    pendingDeletion: { borderRadius: Radius.md, padding: Spacing.three, flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
    pendingDeletionText: { flex: 1 },
    section: { gap: Spacing.one },
    sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, marginHorizontal: Spacing.one },
    sectionIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
    sectionBody: { borderWidth: 1, borderRadius: Radius.lg, padding: Spacing.three, gap: Spacing.two },
    twoFactorSecret: { borderRadius: Radius.md, padding: Spacing.three, textAlign: 'center', letterSpacing: 2 },
    copySecretButton: {
        minHeight: 44,
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: Spacing.one,
        borderWidth: 1,
        borderRadius: Radius.md,
        paddingHorizontal: Spacing.three,
    },
    recoveryCodes: { borderRadius: Radius.md, padding: Spacing.three, gap: Spacing.two },
    profileInput: { minHeight: 54, borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: Spacing.three, fontSize: Typography.fontSize.bodyLarge },
    actionButton: { minHeight: 52, borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: Spacing.three, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', gap: Spacing.two },
    actionChevron: { marginLeft: 'auto' },
    divider: { height: StyleSheet.hairlineWidth, marginVertical: Spacing.one },
    deviceCard: { borderRadius: Radius.md, padding: Spacing.three, gap: Spacing.two },
    deviceHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
    devicePlatformIcon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
    deviceStatus: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
    deviceStatusBadge: { paddingHorizontal: Spacing.two, paddingVertical: 2, borderRadius: Radius.sm },
    deviceText: { flex: 1, gap: 2 },
    revokeDeviceButton: { width: 40, height: 40, borderWidth: 1, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
    deviceDetails: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Spacing.two, gap: Spacing.one },
    deviceDetailRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
    deviceDetailLabel: { flexShrink: 0 },
    deviceDetailValue: { flex: 1, textAlign: 'left', writingDirection: 'ltr' },
    linkButton: { alignSelf: 'center', paddingVertical: Spacing.one },
});
