import { MaterialCommunityIcons } from '@expo/vector-icons';
import Constants, { AppOwnership } from 'expo-constants';
import * as Device from 'expo-device';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Snackbar } from 'react-native-paper';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ConfirmationModal } from '@/components/confirmation-modal';
import { AppTextInput } from '@/components/app-text';
import { IranianPhoneInput } from '@/components/iranian-phone-input';
import { OtpCodeInput } from '@/components/otp-code-input';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { useTheme } from '@/hooks/use-theme';
import { beginTwoFactorEnrollment, confirmTwoFactorEnrollment, disableTwoFactor, fetchPushSubscriptionStatus, fetchTwoFactorStatus, getDeviceId, getStoredAuthToken, removePushSubscription, savePushSubscription, sendOtp, type AuthDevice, type TwoFactorEnrollment, type TwoFactorStatus } from '@/services/auth-api';
import { normalizeIranianPhone, normalizeOtpCode } from '@/services/iranian-phone';

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
    | { type: 'sign-out-current' }
    | { type: 'sign-out-all' }
    | { type: 'revoke-device'; device: AuthDevice };

type SnackbarKind = 'info' | 'success' | 'error';
type BusyAction = 'phone' | 'delete-code' | 'inactivity' | null;
type InactivityDeletionPeriod = 6 | 12 | 18 | null;
const isExpoGo = Constants.appOwnership === AppOwnership.Expo;

export default function PrivacySecurityScreen() {
    const theme = useTheme();
    const router = useRouter();
    const {
        user,
        getDevices,
        revokeUserDevice,
        signOut,
        signOutAll,
        changePhone,
        deleteAccount,
        updateInactivityDeletion,
    } = useAuth();
    const [devices, setDevices] = useState<AuthDevice[]>([]);
    const [phoneInput, setPhoneInput] = useState('');
    const [phoneCode, setPhoneCode] = useState('');
    const [phoneCodeSent, setPhoneCodeSent] = useState(false);
    const [deleteCode, setDeleteCode] = useState('');
    const [deleteCodeSent, setDeleteCodeSent] = useState(false);
    const [busy, setBusy] = useState(false);
    const [busyAction, setBusyAction] = useState<BusyAction>(null);
    const [pendingInactivityPeriod, setPendingInactivityPeriod] = useState<InactivityDeletionPeriod>(null);
    const [pushEnabled, setPushEnabled] = useState(false);
    const [pushBusy, setPushBusy] = useState(false);
    const [twoFactorStatus, setTwoFactorStatus] = useState<TwoFactorStatus | null>(null);
    const [twoFactorEnrollment, setTwoFactorEnrollment] = useState<TwoFactorEnrollment | null>(null);
    const [twoFactorRecoveryCodes, setTwoFactorRecoveryCodes] = useState<string[]>([]);
    const [twoFactorCode, setTwoFactorCode] = useState('');
    const [twoFactorBusy, setTwoFactorBusy] = useState(false);
    const [snackbar, setSnackbar] = useState('');
    const [snackbarKind, setSnackbarKind] = useState<SnackbarKind>('info');
    const [confirmationAction, setConfirmationAction] = useState<ConfirmationAction | null>(null);
    const isVerifyingPhoneChange = useRef(false);

    const showMessage = (message: string, kind: SnackbarKind = 'info') => {
        setSnackbarKind(kind);
        setSnackbar(message);
    };

    const refreshDevices = useCallback(async () => {
        try {
            setDevices(await getDevices());
        } catch (loadError) {
            showMessage(loadError instanceof Error ? loadError.message : 'دریافت فهرست دستگاه‌ها ناموفق بود.', 'error');
        }
    }, [getDevices]);

    useEffect(() => {
        let isMounted = true;
        if (user) {
            void getDevices()
                .then((activeDevices) => {
                    if (isMounted) setDevices(activeDevices);
                })
                .catch((loadError: unknown) => {
                    if (isMounted) {
                        showMessage(loadError instanceof Error ? loadError.message : 'دریافت فهرست دستگاه‌ها ناموفق بود.', 'error');
                    }
                });
        }
        return () => {
            isMounted = false;
        };
    }, [getDevices, user]);

    useEffect(() => {
        let isMounted = true;

        const loadPushStatus = async () => {
            if (!user) {
                setPushEnabled(false);
                return;
            }

            try {
                const token = await getStoredAuthToken();
                if (!token) {
                    setPushEnabled(false);
                    return;
                }
                const enabled = await fetchPushSubscriptionStatus(token);
                if (isExpoGo) {
                    if (isMounted) setPushEnabled(enabled);
                    return;
                }

                const Notifications = await import('expo-notifications');
                const permission = await Notifications.getPermissionsAsync();
                if (isMounted) setPushEnabled(enabled && permission.status === 'granted');
            } catch (loadError) {
                if (isMounted) {
                    showMessage(loadError instanceof Error ? loadError.message : 'وضعیت اعلان‌ها دریافت نشد.', 'error');
                }
            }
        };

        void loadPushStatus();
        return () => {
            isMounted = false;
        };
    }, [user]);

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
                    showMessage(loadError instanceof Error ? loadError.message : 'وضعیت تأیید دومرحله‌ای دریافت نشد.', 'error');
                }
            }
        };

        void loadTwoFactorStatus();
        return () => {
            isMounted = false;
        };
    }, [user]);

    const togglePushNotifications = async () => {
        if (pushBusy) return;
        setPushBusy(true);
        try {
            const token = await getStoredAuthToken();
            if (!token) throw new Error('برای مدیریت اعلان‌ها ابتدا دوباره وارد حساب شوید.');

            if (pushEnabled) {
                await removePushSubscription(token);
                setPushEnabled(false);
                showMessage('اعلان‌ها برای این دستگاه خاموش شدند.', 'success');
                return;
            }

            if (isExpoGo) {
                throw new Error('برای فعال‌سازی اعلان‌های راه‌دور، برنامه را با development build اجرا کنید؛ Expo Go در اندروید از این قابلیت پشتیبانی نمی‌کند.');
            }

            if (Platform.OS !== 'android' && Platform.OS !== 'ios') {
                throw new Error('اعلان‌های موبایل در نسخهٔ وب در دسترس نیستند.');
            }
            if (!Device.isDevice) {
                throw new Error('برای فعال‌سازی اعلان‌ها از دستگاه واقعی استفاده کنید.');
            }

            const Notifications = await import('expo-notifications');
            let permission = await Notifications.getPermissionsAsync();
            if (permission.status !== 'granted') {
                permission = await Notifications.requestPermissionsAsync();
            }
            if (permission.status !== 'granted') {
                throw new Error('مجوز اعلان داده نشد. می‌توانید آن را از تنظیمات دستگاه فعال کنید.');
            }

            if (Platform.OS === 'android') {
                await Notifications.setNotificationChannelAsync('default', {
                    name: 'اعلان‌های پهناورکار',
                    importance: Notifications.AndroidImportance.DEFAULT,
                });
            }

            const projectId = Constants.expoConfig?.extra?.eas?.projectId;
            if (!projectId) {
                throw new Error('شناسهٔ پروژهٔ Expo تنظیم نشده است.');
            }
            const pushToken = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
            await savePushSubscription(token, pushToken, Platform.OS);
            setPushEnabled(true);
            showMessage('اعلان‌ها برای این دستگاه فعال شدند.', 'success');
        } catch (pushError) {
            showMessage(pushError instanceof Error ? pushError.message : 'تغییر تنظیم اعلان‌ها ناموفق بود.', 'error');
        } finally {
            setPushBusy(false);
        }
    };

    const beginTwoFactorSetup = async () => {
        setTwoFactorBusy(true);
        try {
            const token = await getStoredAuthToken();
            if (!token) throw new Error('برای تغییر امنیت حساب دوباره وارد شوید.');
            setTwoFactorEnrollment(await beginTwoFactorEnrollment(token));
            setTwoFactorCode('');
            setTwoFactorRecoveryCodes([]);
        } catch (setupError) {
            showMessage(setupError instanceof Error ? setupError.message : 'شروع راه‌اندازی ناموفق بود.', 'error');
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
            showMessage(setupError instanceof Error ? setupError.message : 'تأیید راه‌اندازی ناموفق بود.', 'error');
        } finally {
            setTwoFactorBusy(false);
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
            showMessage(disableError instanceof Error ? disableError.message : 'خاموش‌کردن تأیید دومرحله‌ای ناموفق بود.', 'error');
        } finally {
            setTwoFactorBusy(false);
        }
    };

    const requestPhoneCode = async () => {
        const normalizedPhone = normalizeIranianPhone(phoneInput);
        if (!normalizedPhone) {
            showMessage('شمارهٔ موبایل معتبر وارد کنید.', 'error');
            return;
        }
        if (normalizedPhone === user?.phone) {
            showMessage('این شماره هم‌اکنون به حساب شما متصل است.', 'error');
            return;
        }

        setBusy(true);
        setBusyAction('phone');
        try {
            await sendOtp({ phone: normalizedPhone, type: 'login' });
            setPhoneInput(normalizedPhone.slice(3));
            setPhoneCode('');
            setPhoneCodeSent(true);
            showMessage('اگر امکان استفاده از این درخواست وجود داشته باشد، کد تأیید ارسال می‌شود.');
        } catch (requestError) {
            showMessage(requestError instanceof Error ? requestError.message : 'ارسال کد ناموفق بود.', 'error');
        } finally {
            setBusy(false);
            setBusyAction(null);
        }
    };

    const verifyPhoneChange = async (submittedCode = phoneCode) => {
        if (busy || isVerifyingPhoneChange.current) return;
        const normalizedPhone = normalizeIranianPhone(phoneInput);
        const normalizedCode = normalizeOtpCode(submittedCode);
        if (!normalizedPhone || !/^\d{6}$/.test(normalizedCode)) {
            showMessage('شماره و کد شش‌رقمی را بررسی کنید.', 'error');
            return;
        }

        isVerifyingPhoneChange.current = true;
        setBusy(true);
        setBusyAction('phone');
        try {
            await changePhone(normalizedPhone, normalizedCode);
            setPhoneInput('');
            setPhoneCode('');
            setPhoneCodeSent(false);
            showMessage('شمارهٔ حساب با موفقیت تغییر کرد.', 'success');
        } catch (changeError) {
            showMessage(changeError instanceof Error ? changeError.message : 'تغییر شماره ناموفق بود.', 'error');
        } finally {
            isVerifyingPhoneChange.current = false;
            setBusy(false);
            setBusyAction(null);
        }
    };

    const chooseInactivityDeletionPeriod = async (period: 6 | 12 | 18 | null) => {
        if (busy || period === user?.inactivity_deletion_period_months) return;

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
            showMessage(updateError instanceof Error ? updateError.message : 'ذخیرهٔ تنظیم حذف خودکار ناموفق بود.', 'error');
        } finally {
            setBusy(false);
            setBusyAction(null);
            setPendingInactivityPeriod(null);
        }
    };

    const requestDeleteCode = async () => {
        if (!user?.phone) {
            showMessage('شمارهٔ تأییدشده‌ای برای حساب پیدا نشد.', 'error');
            return;
        }

        setBusy(true);
        setBusyAction('delete-code');
        try {
            await sendOtp({ phone: user.phone, type: 'login' });
            setDeleteCode('');
            setDeleteCodeSent(true);
            showMessage('برای تأیید حذف حساب، کد به شمارهٔ ثبت‌شده ارسال شد.');
        } catch (requestError) {
            showMessage(requestError instanceof Error ? requestError.message : 'ارسال کد ناموفق بود.', 'error');
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
            showMessage(revokeError instanceof Error ? revokeError.message : 'غیرفعال‌کردن دستگاه ناموفق بود.', 'error');
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
            showMessage(signOutError instanceof Error ? signOutError.message : 'خروج از این دستگاه ناموفق بود.', 'error');
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
                showMessage(deleteError instanceof Error ? deleteError.message : 'حذف حساب ناموفق بود.', 'error');
                setConfirmationAction(null);
            } finally {
                setBusy(false);
            }
            return;
        }

        if (confirmationAction.type === 'sign-out-all') {
            setBusy(true);
            try {
                await signOutAll();
                setConfirmationAction(null);
                router.replace('/auth');
            } catch (signOutError) {
                showMessage(signOutError instanceof Error ? signOutError.message : 'خروج از همهٔ دستگاه‌ها ناموفق بود.', 'error');
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
        : confirmationAction?.type === 'sign-out-all'
            ? 'خروج از همهٔ دستگاه‌ها؟'
            : confirmationAction?.type === 'sign-out-current'
                ? 'خروج از این دستگاه؟'
                : 'لغو این نشست؟';
    const confirmationMessage = confirmationAction?.type === 'delete-account'
        ? 'حساب، اطلاعات پروفایل، نشست‌ها و داده‌های مرتبط حذف می‌شوند. این کار قابل بازگشت نیست.'
        : confirmationAction?.type === 'sign-out-all'
            ? 'نشست شما در همهٔ دستگاه‌ها لغو می‌شود و برای استفادهٔ دوباره باید وارد شوید.'
            : confirmationAction?.type === 'sign-out-current'
                ? 'از این دستگاه خارج می‌شوید. برای استفادهٔ دوباره باید وارد حساب شوید.'
                : confirmationAction?.type === 'revoke-device'
                    ? `دسترسی ${confirmationAction.device.device_name || platformLabel(confirmationAction.device.platform)} فوراً لغو می‌شود.`
                    : '';
    const confirmationLabel = confirmationAction?.type === 'delete-account'
        ? 'حذف دائمی'
        : confirmationAction?.type === 'sign-out-all'
            ? 'خروج از همه'
            : confirmationAction?.type === 'sign-out-current'
                ? 'خروج'
                : 'لغو نشست';
    const confirmationIcon = confirmationAction?.type === 'delete-account'
        ? 'delete-outline'
        : 'logout';

    return (
        <ThemedView style={styles.container}>
            <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
                <View style={[styles.introCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                    <View style={[styles.introIcon, { backgroundColor: theme.primaryContainer }]}>
                        <MaterialCommunityIcons name="shield-lock-outline" size={25} color={theme.primaryText} />
                    </View>
                    <ThemedText type="subtitle" style={styles.introTitle}>امنیت حساب شما</ThemedText>
                    <ThemedText type="small" style={[styles.introText, { color: theme.textSecondary }]}>
                        نشست‌ها، شمارهٔ تلفن و داده‌های شخصی خود را مدیریت کنید.
                    </ThemedText>
                </View>

                <Section title="اعلان‌ها" icon="bell-outline" theme={theme}>
                    <ThemedText type="small" style={{ color: theme.textSecondary }}>
                        دریافت اعلان روی این دستگاه فقط پس از انتخاب شما فعال می‌شود.
                    </ThemedText>
                    {isExpoGo && !pushEnabled ? (
                        <ThemedText type="small" style={{ color: theme.textSecondary }}>
                            برای فعال‌سازی اعلان‌های راه‌دور در Android، از development build استفاده کنید؛ Expo Go این قابلیت را ندارد.
                        </ThemedText>
                    ) : null}
                    <Pressable
                        accessibilityRole="button"
                        disabled={pushBusy || (isExpoGo && !pushEnabled)}
                        onPress={() => void togglePushNotifications()}
                        style={({ pressed }) => [
                            styles.notificationButton,
                            {
                                backgroundColor: pushEnabled ? theme.surfaceVariant : theme.primary,
                                borderColor: theme.border,
                                opacity: pressed || pushBusy ? 0.72 : 1,
                            },
                        ]}
                    >
                        {pushBusy ? <ActivityIndicator size="small" color={pushEnabled ? theme.text : theme.onPrimary} /> : null}
                        <ThemedText type="smallBold" style={{ color: pushEnabled ? theme.text : theme.onPrimary }}>
                            {pushEnabled ? 'خاموش‌کردن اعلان‌ها' : 'فعال‌کردن اعلان‌ها'}
                        </ThemedText>
                    </Pressable>
                </Section>

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
                                    <ThemedText selectable type="code" style={[styles.twoFactorSecret, { color: theme.text }]}>
                                        {twoFactorEnrollment.secret}
                                    </ThemedText>
                                    <OtpCodeInput
                                        accessibilityLabel="کد برنامه برای فعال‌سازی تأیید دومرحله‌ای"
                                        disabled={twoFactorBusy}
                                        label="کد ۶ رقمی برنامه"
                                        onChangeText={setTwoFactorCode}
                                        value={twoFactorCode}
                                    />
                                    <ActionButton
                                        label="تأیید و فعال‌سازی"
                                        icon="check"
                                        busy={twoFactorBusy}
                                        disabled={twoFactorCode.length !== 6}
                                        onPress={() => void confirmTwoFactorSetup()}
                                        theme={theme}
                                    />
                                </>
                            ) : (
                                <ActionButton
                                    label="راه‌اندازی تأیید دومرحله‌ای"
                                    icon="shield-key-outline"
                                    busy={twoFactorBusy || twoFactorStatus === null}
                                    disabled={twoFactorStatus === null}
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
                </Section>

                <Section title="امنیت حساب" icon="cellphone-key" theme={theme}>
                    <View style={[styles.currentPhone, { backgroundColor: theme.surfaceVariant }]}>
                        <View style={[styles.currentPhoneIcon, { backgroundColor: theme.primaryContainer }]}>
                            <MaterialCommunityIcons name="cellphone" size={19} color={theme.primaryText} />
                        </View>
                        <View style={styles.currentPhoneText}>
                            <ThemedText type="small" style={{ color: theme.textSecondary }}>شمارهٔ فعلی</ThemedText>
                            <ThemedText type="body" style={[styles.phoneValue, { color: theme.text }]}>{user.phone}</ThemedText>
                        </View>
                        <MaterialCommunityIcons name="check-decagram-outline" size={20} color={theme.success} />
                    </View>
                    <View style={styles.fieldGroup}>
                        <ThemedText type="smallBold" style={styles.fieldLabel}>تغییر شمارهٔ تلفن</ThemedText>
                        <ThemedText type="small" style={{ color: theme.textSecondary }}>
                            کد به شمارهٔ جدید فرستاده می‌شود؛ تغییر فقط پس از تأیید موفق اعمال خواهد شد.
                        </ThemedText>
                        <IranianPhoneInput
                            accessibilityLabel="شمارهٔ تلفن جدید"
                            onChangeText={(value) => {
                                setPhoneInput(value);
                                setPhoneCode('');
                                setPhoneCodeSent(false);
                            }}
                            value={phoneInput}
                        />
                    </View>
                    {phoneCodeSent ? (
                        <OtpCodeInput
                            accessibilityLabel="کد تأیید شمارهٔ جدید"
                            disabled={busy}
                            label="کد ۶ رقمی پیامک‌شده"
                            onChangeText={setPhoneCode}
                            onComplete={(value) => void verifyPhoneChange(value)}
                            value={phoneCode}
                        />
                    ) : null}
                    <ActionButton
                        label={phoneCodeSent ? 'تأیید و تغییر شماره' : 'ارسال کد به شمارهٔ جدید'}
                        icon={phoneCodeSent ? 'check' : 'message-text-outline'}
                        busy={busyAction === 'phone'}
                        disabled={busy}
                        onPress={() => void (phoneCodeSent ? verifyPhoneChange() : requestPhoneCode())}
                        theme={theme}
                    />
                    {phoneCodeSent ? (
                        <Pressable
                            accessibilityRole="button"
                            disabled={busy}
                            onPress={() => void requestPhoneCode()}
                            style={styles.linkButton}
                        >
                            <ThemedText type="smallBold" style={{ color: theme.primaryText }}>ارسال دوبارهٔ کد</ThemedText>
                        </Pressable>
                    ) : null}
                </Section>

                <Section title="نشست‌ها و دستگاه‌ها" icon="devices" theme={theme}>
                    <ThemedText type="small" style={{ color: theme.textSecondary }}>
                        حداکثر ۳ نشست فعال نگهداری می‌شود. نشست پس از ۳۰ روز بی‌فعالیتی خودکار منقضی و دسترسی آن لغو می‌شود؛ نشست‌های بدون فعالیت بیش از ۷ روز نیز با برچسب «قدیمی» مشخص می‌شوند.
                    </ThemedText>
                    {devices.map((device) => (
                        <View key={device.id} style={[styles.deviceCard, { backgroundColor: theme.surfaceVariant }]}>
                            <View style={styles.deviceHeader}>
                                <View style={[styles.devicePlatformIcon, { backgroundColor: theme.primaryContainer }]}>
                                    <MaterialCommunityIcons name={platformIcon(device.platform)} size={20} color={theme.primaryText} />
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
                                        disabled={busy}
                                        onPress={() => setConfirmationAction({ type: 'revoke-device', device })}
                                        style={({ pressed }) => [
                                            styles.revokeDeviceButton,
                                            {
                                                borderColor: theme.border,
                                                backgroundColor: theme.primaryContainer,
                                                opacity: pressed || busy ? 0.72 : 1,
                                            },
                                        ]}
                                    >
                                        <MaterialCommunityIcons name="logout" size={19} color={theme.primaryText} />
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
                                        {device.last_activity ? new Date(device.last_activity).toLocaleString('fa-IR') : 'نامشخص'}
                                    </ThemedText>
                                </View>
                                {device.expires_at ? (
                                    <View style={styles.deviceDetailRow}>
                                        <MaterialCommunityIcons name="calendar-clock-outline" size={16} color={theme.textMuted} />
                                        <ThemedText type="small" style={[styles.deviceDetailLabel, { color: theme.textSecondary }]}>
                                            انقضای نشست:
                                        </ThemedText>
                                        <ThemedText type="small" style={[styles.deviceDetailValue, { color: theme.text }]}>
                                            {new Date(device.expires_at).toLocaleString('fa-IR')}
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
                    <View style={[styles.noticeCard, { backgroundColor: theme.primaryContainer }]}>
                        <MaterialCommunityIcons name="information-outline" size={20} color={theme.primaryText} />
                        <ThemedText type="small" style={[styles.noticeText, { color: theme.text }]}>
                            اطلاعات پروفایل شما فقط در حساب خودتان نمایش داده می‌شود و نمایهٔ عمومی کاربران فعال نیست.
                        </ThemedText>
                    </View>
                    <View style={[styles.divider, { backgroundColor: theme.border }]} />
                    <View style={styles.inactivityHeader}>
                        <View style={[styles.inactivityIcon, { backgroundColor: theme.primaryContainer }]}>
                            <MaterialCommunityIcons name="timer-sand" size={20} color={theme.primaryText} />
                        </View>
                        <View style={styles.inactivityHeaderText}>
                            <ThemedText type="smallBold">حذف خودکار حساب</ThemedText>
                            <ThemedText type="small" style={[styles.noticeText, { color: theme.textSecondary }]}>
                                در صورت بی‌فعالیتی طولانی، حساب با هشدار قبلی حذف می‌شود.
                            </ThemedText>
                        </View>
                    </View>
                    <ThemedText type="small" style={{ color: theme.textSecondary }}>
                        پس از دورهٔ انتخاب‌شدهٔ بی‌فعالیتی، در صورت ارسال موفق هشدار پیامکی به شمارهٔ تلفن تأییدشده، حذف حساب برای ۳۰ روز بعد زمان‌بندی می‌شود. ورود دوباره یا خاموش‌کردن این گزینه، فرایند حذف را لغو می‌کند. فعال‌سازی این قابلیت به پیکربندی پیامک در سرور نیاز دارد.
                    </ThemedText>
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
                                حذف حساب برای {new Date(user.inactivity_deletion_scheduled_at).toLocaleDateString('fa-IR')} زمان‌بندی شده است. برای لغو، وارد حساب بمانید یا گزینهٔ حذف خودکار را خاموش کنید.
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
                            const optionDisabled = busy || (
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
                </Section>

                <Section title="حذف حساب" icon="delete-outline" theme={theme}>
                    <View style={[styles.noticeCard, { backgroundColor: theme.warningFill }]}>
                        <MaterialCommunityIcons name="alert-outline" size={19} color={theme.onWarning} />
                        <ThemedText type="small" style={[styles.noticeText, { color: theme.onWarning }]}>
                            حذف حساب دائمی است و پس از انجام، قابل بازگشت نیست. برای تأیید، کد به شمارهٔ ثبت‌شده ارسال می‌شود.
                        </ThemedText>
                    </View>
                    {deleteCodeSent ? (
                        <OtpCodeInput
                            accessibilityLabel="کد تأیید حذف حساب"
                            onChangeText={setDeleteCode}
                            value={deleteCode}
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
                    {deleteCodeSent ? (
                        <Pressable
                            accessibilityRole="button"
                            disabled={busy}
                            onPress={() => void requestDeleteCode()}
                            style={styles.linkButton}
                        >
                            <ThemedText type="smallBold" style={{ color: theme.primaryText }}>ارسال دوبارهٔ کد حذف</ThemedText>
                        </Pressable>
                    ) : null}
                </Section>

            </ScrollView>
            <ConfirmationModal
                visible={confirmationAction !== null}
                title={confirmationTitle}
                message={confirmationMessage}
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
                <View style={[styles.sectionIcon, { backgroundColor: theme.primaryContainer }]}>
                    <MaterialCommunityIcons name={icon} size={20} color={theme.primaryText} />
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
    const color = theme.primaryText;

    return (
        <Pressable
            accessibilityRole="button"
            disabled={busy || disabled}
            onPress={onPress}
            style={({ pressed }) => [
                styles.actionButton,
                {
                    backgroundColor: theme.primaryContainer,
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
    notificationButton: { minHeight: 48, borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: Spacing.three, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.two },
    twoFactorSecret: { borderRadius: Radius.md, padding: Spacing.three, backgroundColor: '#0000000D', textAlign: 'center', letterSpacing: 2 },
    recoveryCodes: { borderRadius: Radius.md, padding: Spacing.three, gap: Spacing.two },
    profileInput: { minHeight: 54, borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: Spacing.three, fontSize: 16 },
    currentPhone: { minHeight: 64, borderRadius: Radius.md, paddingHorizontal: Spacing.two, paddingVertical: Spacing.two, flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
    currentPhoneIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
    currentPhoneText: { flex: 1, gap: 2 },
    phoneValue: { writingDirection: 'ltr', textAlign: 'left' },
    fieldGroup: { gap: Spacing.one },
    fieldLabel: { paddingHorizontal: Spacing.one },
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
