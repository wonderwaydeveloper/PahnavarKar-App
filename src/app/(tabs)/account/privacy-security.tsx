import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Snackbar } from 'react-native-paper';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppTextInput } from '@/components/app-text';
import { ConfirmationModal } from '@/components/confirmation-modal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { useTheme } from '@/hooks/use-theme';
import { getDeviceId, sendOtp, type AuthDevice } from '@/services/auth-api';

function toLatinDigits(value: string) {
    return value.replace(/[۰-۹٠-٩]/g, (digit) =>
        String.fromCharCode(
            digit.charCodeAt(0) >= 0x06f0 && digit.charCodeAt(0) <= 0x06f9
                ? digit.charCodeAt(0) - 0x06f0 + 48
                : digit.charCodeAt(0) - 0x0660 + 48,
        ),
    );
}

function normalizeIranianPhone(value: string): string | null {
    let digits = toLatinDigits(value).replace(/\D/g, '');
    if (digits.startsWith('0098')) digits = digits.slice(4);
    else if (digits.startsWith('98')) digits = digits.slice(2);
    if (digits.startsWith('0')) digits = digits.slice(1);
    return /^9\d{9}$/.test(digits) ? `+98${digits}` : null;
}

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
    const [phoneInputFocused, setPhoneInputFocused] = useState(false);
    const [phoneCodeFocused, setPhoneCodeFocused] = useState(false);
    const [deleteCode, setDeleteCode] = useState('');
    const [deleteCodeFocused, setDeleteCodeFocused] = useState(false);
    const [deleteCodeSent, setDeleteCodeSent] = useState(false);
    const [busy, setBusy] = useState(false);
    const [busyAction, setBusyAction] = useState<BusyAction>(null);
    const [pendingInactivityPeriod, setPendingInactivityPeriod] = useState<InactivityDeletionPeriod>(null);
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

    const verifyPhoneChange = async () => {
        const normalizedPhone = normalizeIranianPhone(phoneInput);
        const normalizedCode = toLatinDigits(phoneCode).replace(/\D/g, '');
        if (!normalizedPhone || !/^\d{6}$/.test(normalizedCode)) {
            showMessage('شماره و کد شش‌رقمی را بررسی کنید.', 'error');
            return;
        }

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
        const normalizedCode = toLatinDigits(deleteCode).replace(/\D/g, '');
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
                        <View
                            style={[
                                styles.phoneInputCard,
                                {
                                    backgroundColor: theme.surface,
                                    borderColor: phoneInputFocused ? theme.primary : theme.border,
                                },
                            ]}
                        >
                            <AppTextInput
                                accessibilityLabel="شمارهٔ تلفن جدید"
                                autoComplete="tel-national"
                                autoCorrect={false}
                                keyboardType="phone-pad"
                                maxLength={10}
                                onBlur={() => setPhoneInputFocused(false)}
                                onChangeText={(value) => {
                                    setPhoneInput(toLatinDigits(value).replace(/\D/g, '').slice(0, 10));
                                    setPhoneCode('');
                                    setPhoneCodeSent(false);
                                }}
                                onFocus={() => setPhoneInputFocused(true)}
                                placeholder="9123456789"
                                placeholderTextColor={theme.textMuted}
                                returnKeyType="done"
                                underlineColorAndroid="transparent"
                                value={phoneInput}
                                style={[styles.phoneInput, { color: theme.text }]}
                            />
                            <View style={[styles.phoneDialCode, { borderColor: theme.border }]}>
                                <ThemedText type="smallBold" style={[styles.dialCodeText, { color: theme.textSecondary }]}>
                                    +98
                                </ThemedText>
                            </View>
                        </View>
                    </View>
                    {phoneCodeSent ? (
                        <View style={styles.fieldGroup}>
                            <ThemedText type="smallBold" style={styles.fieldLabel}>کد ۶ رقمی پیامک‌شده</ThemedText>
                            <AppTextInput
                                accessibilityLabel="کد تأیید شمارهٔ جدید"
                                autoComplete="one-time-code"
                                keyboardType="number-pad"
                                maxLength={6}
                                onBlur={() => setPhoneCodeFocused(false)}
                                onChangeText={(value) => setPhoneCode(toLatinDigits(value).replace(/\D/g, '').slice(0, 6))}
                                onFocus={() => setPhoneCodeFocused(true)}
                                placeholder="••••••"
                                placeholderTextColor={theme.textMuted}
                                textAlign="center"
                                underlineColorAndroid="transparent"
                                value={phoneCode}
                                style={[
                                    styles.codeInput,
                                    {
                                        backgroundColor: theme.surface,
                                        borderColor: phoneCodeFocused ? theme.primary : theme.border,
                                        color: theme.text,
                                    },
                                ]}
                            />
                        </View>
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
                        پس از دورهٔ انتخاب‌شدهٔ بی‌فعالیتی، در صورت ارسال موفق هشدار به ایمیل و شمارهٔ تلفن تأییدشده، حذف حساب برای ۳۰ روز بعد زمان‌بندی می‌شود. ورود دوباره یا خاموش‌کردن این گزینه، فرایند حذف را لغو می‌کند. فعال‌سازی این قابلیت به پیکربندی ایمیل و پیامک در سرور نیاز دارد.
                    </ThemedText>
                    {!user.phone_verified_at || !user.email || !user.email_verified_at ? (
                        <View style={[styles.noticeCard, { backgroundColor: theme.surfaceVariant }]}>
                            <MaterialCommunityIcons name="email-lock-outline" size={19} color={theme.textSecondary} />
                            <ThemedText type="small" style={{ color: theme.textSecondary }}>
                                برای فعال‌سازی این قابلیت، شمارهٔ تلفن و یک ایمیل باید تأیید شده باشند.
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
                                && (!user.email || !user.email_verified_at)
                                && !selected
                            ) || (
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
                        <AppTextInput
                            accessibilityLabel="کد تأیید حذف حساب"
                            autoComplete="one-time-code"
                            keyboardType="number-pad"
                            maxLength={6}
                            onBlur={() => setDeleteCodeFocused(false)}
                            onChangeText={(value) => setDeleteCode(toLatinDigits(value).replace(/\D/g, '').slice(0, 6))}
                            onFocus={() => setDeleteCodeFocused(true)}
                            placeholder="••••••"
                            placeholderTextColor={theme.textMuted}
                            textAlign="center"
                            underlineColorAndroid="transparent"
                            value={deleteCode}
                            style={[
                                styles.codeInput,
                                {
                                    backgroundColor: theme.surface,
                                    borderColor: deleteCodeFocused ? theme.primary : theme.border,
                                    color: theme.text,
                                },
                            ]}
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
    currentPhone: { minHeight: 64, borderRadius: Radius.md, paddingHorizontal: Spacing.two, paddingVertical: Spacing.two, flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
    currentPhoneIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
    currentPhoneText: { flex: 1, gap: 2 },
    phoneValue: { writingDirection: 'ltr', textAlign: 'left' },
    fieldGroup: { gap: Spacing.one },
    fieldLabel: { paddingHorizontal: Spacing.one },
    phoneInputCard: {
        minHeight: 64,
        borderWidth: 1,
        borderRadius: Radius.md,
        paddingHorizontal: Spacing.three,
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.two,
    },
    phoneDialCode: {
        minHeight: 32,
        borderStartWidth: 1,
        paddingStart: Spacing.two,
        alignItems: 'center',
        justifyContent: 'center',
    },
    phoneInput: {
        flex: 1,
        minHeight: 52,
        paddingVertical: 0,
        fontSize: 17,
        direction: 'ltr',
        writingDirection: 'ltr',
        textAlign: 'left',
    },
    dialCodeText: { writingDirection: 'ltr' },
    input: { minHeight: 48, borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: Spacing.three, fontSize: 16 },
    codeInput: {
        minHeight: 58,
        borderWidth: 1,
        borderRadius: Radius.md,
        paddingHorizontal: Spacing.three,
        fontSize: 24,
        letterSpacing: 8,
        direction: 'ltr',
        writingDirection: 'ltr',
        textAlign: 'center',
    },
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
