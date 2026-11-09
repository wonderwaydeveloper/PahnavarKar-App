import { Typography } from '@/constants/typography';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useIsFocused, useRouter } from 'expo-router';
import { onlineManager } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator } from 'react-native-paper';
import { AppSnackbar as Snackbar } from '@/components/app-snackbar';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppTextInput } from '@/components/app-text';
import { IranianPhoneInput } from '@/components/iranian-phone-input';
import { OtpCodeInput } from '@/components/otp-code-input';
import { OtpResendControl } from '@/components/otp-resend-control';
import { ProfilePhotoField } from '@/components/profile-photo-field';
import { ProfilePhotoPreview } from '@/components/profile-photo-preview';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { useAppFeedback } from '@/hooks/use-app-feedback';
import { useOfflinePageNotice } from '@/hooks/use-offline-page-notice';
import { useOnlineStatus } from '@/hooks/use-online-status';
import { useOtpResendCountdown } from '@/hooks/use-otp-resend-countdown';
import { useTheme } from '@/hooks/use-theme';
import { getProfilePhotoUrl, sendOtp } from '@/services/auth-api';
import { normalizeIranianPhone, normalizeOtpCode } from '@/services/iranian-phone';
import { getUserFacingErrorMessage } from '@/services/user-facing-error';

export default function EditProfileScreen() {
    const theme = useTheme();
    const router = useRouter();
    const isFocused = useIsFocused();
    const isOnline = useOnlineStatus();
    const {
        user,
        refreshUser,
        updateProfile,
        uploadProfilePhoto,
        removeProfilePhoto,
        changePhone,
    } = useAuth();
    const { showError, showFeedback } = useAppFeedback();
    const profileRestricted = user?.restricted_capabilities?.includes('profile') ?? false;
    const securityRestricted = user?.restricted_capabilities?.includes('security') ?? false;
    const userId = user?.id ?? null;
    const [name, setName] = useState(user?.name ?? '');
    const [photoUri, setPhotoUri] = useState<string | null>(null);
    const [photoPreviewVisible, setPhotoPreviewVisible] = useState(false);
    const [photoRemoved, setPhotoRemoved] = useState(false);
    const [photoPicking, setPhotoPicking] = useState(false);
    const [saving, setSaving] = useState(false);
    const [profileNeedsLiveRefresh, setProfileNeedsLiveRefresh] = useState(() => !onlineManager.isOnline());
    const [profileRefreshBusy, setProfileRefreshBusy] = useState(false);
    const [phoneInput, setPhoneInput] = useState('');
    const [phoneCode, setPhoneCode] = useState('');
    const [phoneCodeSent, setPhoneCodeSent] = useState(false);
    const [phoneBusy, setPhoneBusy] = useState(false);
    const { secondsRemaining: resendSeconds, start: startResendCountdown, reset: resetResendCountdown } = useOtpResendCountdown();
    const [snackbar, setSnackbar] = useState('');
    const [snackbarKind, setSnackbarKind] = useState<'success' | 'error'>('success');
    const phoneVerificationInProgress = useRef(false);
    const profileRefreshInProgress = useRef(false);
    const busy = saving || phoneBusy || photoPicking;

    const showMessage = (message: string, kind: 'success' | 'error' = 'success') => {
        setSnackbarKind(kind);
        setSnackbar(message);
    };

    useOfflinePageNotice(profileNeedsLiveRefresh || !isOnline ? {
        hasSavedData: user !== null,
        message: user
            ? 'اطلاعات پروفایل ممکن است به‌روز نباشد.'
            : 'اتصال به سرور برای اطلاعات پروفایل لازم است.',
        details: user
            ? ['تغییرات ذخیره‌نشده فقط در همین صفحه نگه داشته می‌شوند.', 'پس از اتصال، اطلاعات حساب دوباره از سرور دریافت می‌شود.']
            : ['برای دریافت اطلاعات حساب و ذخیرهٔ تغییرات دوباره متصل شوید.'],
    } : null, isFocused);

    useEffect(() => onlineManager.subscribe((online) => {
        if (!online) setProfileNeedsLiveRefresh(true);
    }), []);

    const refreshProfile = useCallback(async () => {
        if (userId === null || !onlineManager.isOnline() || profileRefreshInProgress.current) return;
        profileRefreshInProgress.current = true;
        setProfileRefreshBusy(true);
        try {
            await refreshUser();
            setProfileNeedsLiveRefresh(false);
        } catch (refreshError) {
            setProfileNeedsLiveRefresh(true);
            showError(refreshError, 'همگام‌سازی اطلاعات پروفایل ناموفق بود.');
        } finally {
            profileRefreshInProgress.current = false;
            setProfileRefreshBusy(false);
        }
    }, [refreshUser, showError, userId]);

    useFocusEffect(useCallback(() => {
        if (isOnline && profileNeedsLiveRefresh) void refreshProfile();
    }, [isOnline, profileNeedsLiveRefresh, refreshProfile]));

    const requireOnline = () => {
        if (onlineManager.isOnline()) return true;
        showMessage('برای ذخیره یا تغییر اطلاعات حساب به اتصال سرور نیاز است.', 'error');
        return false;
    };

    const hasUnsavedChanges = Boolean(
        user && (
            name.trim() !== user.name ||
            photoUri !== null ||
            photoRemoved
        ),
    );

    const choosePhoto = async () => {
        if (busy || profileRestricted) return;

        setPhotoPicking(true);
        setSnackbar('');
        try {
            const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (!permission.granted) {
                showMessage('برای انتخاب تصویر پروفایل، دسترسی به تصاویر را مجاز کنید.', 'error');
                return;
            }

            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                allowsEditing: true,
                aspect: [1, 1],
                quality: 0.85,
                preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
            });

            if (!result.canceled) {
                setPhotoUri(result.assets[0]?.uri ?? null);
                setPhotoRemoved(false);
            }
        } catch (pickerError) {
            showError(pickerError, 'انتخاب تصویر پروفایل ناموفق بود.');
        } finally {
            setPhotoPicking(false);
        }
    };

    const save = async () => {
        if (!user || busy || !hasUnsavedChanges || !requireOnline()) {
            return;
        }
        const trimmedName = name.trim();
        const nameChanged = trimmedName !== user.name;
        if (nameChanged && !trimmedName) {
            showMessage('نام و نام خانوادگی را وارد کنید.', 'error');
            return;
        }
        setSaving(true);
        setSnackbar('');
        let nameSaved = false;
        try {
            if (nameChanged) {
                await updateProfile({ name: trimmedName });
                nameSaved = true;
            }
            if (photoUri) {
                try {
                    await uploadProfilePhoto(photoUri);
                } catch (photoError) {
                    showFeedback({
                        message: `${nameSaved ? 'نام ذخیره شد، اما تصویر بارگذاری نشد' : 'بارگذاری تصویر ناموفق بود'}: ${getUserFacingErrorMessage(photoError, 'خطای نامشخص')}`,
                        variant: 'error',
                    });
                    return;
                }
            } else if (photoRemoved) {
                try {
                    await removeProfilePhoto();
                } catch (photoError) {
                    if (nameSaved) {
                        showFeedback({
                            message: `نام ذخیره شد، اما حذف تصویر ناموفق بود: ${getUserFacingErrorMessage(photoError, 'خطای نامشخص')}`,
                            variant: 'error',
                        });
                    } else {
                        showError(photoError, 'حذف تصویر پروفایل ناموفق بود.');
                    }
                    return;
                }
            }
            router.back();
        } catch (saveError) {
            showError(saveError, 'ذخیرهٔ اطلاعات پروفایل ناموفق بود.');
        } finally {
            setSaving(false);
        }
    };

    const requestPhoneCode = async () => {
        if (!requireOnline()) return;
        const normalizedPhone = normalizeIranianPhone(phoneInput);
        if (!normalizedPhone) {
            showMessage('شمارهٔ موبایل معتبر وارد کنید.', 'error');
            return;
        }
        if (normalizedPhone === user?.phone) {
            showMessage('این شماره هم‌اکنون به حساب شما متصل است.', 'error');
            return;
        }

        setPhoneBusy(true);
        setSnackbar('');
        try {
            const response = await sendOtp({ phone: normalizedPhone, type: 'login' });
            setPhoneInput(normalizedPhone.slice(3));
            setPhoneCode('');
            setPhoneCodeSent(true);
            startResendCountdown(response.resend_after);
            showMessage('کد تأیید از طریق پیامک ارسال شد.');
        } catch (requestError) {
            showError(requestError, 'ارسال کد ناموفق بود.');
        } finally {
            setPhoneBusy(false);
        }
    };

    const verifyPhoneChange = async (submittedCode = phoneCode) => {
        if (phoneBusy || phoneVerificationInProgress.current || !requireOnline()) return;
        const normalizedPhone = normalizeIranianPhone(phoneInput);
        const normalizedCode = normalizeOtpCode(submittedCode);
        if (!normalizedPhone || !/^\d{6}$/.test(normalizedCode)) {
            showMessage('شماره و کد شش‌رقمی را بررسی کنید.', 'error');
            return;
        }

        phoneVerificationInProgress.current = true;
        setPhoneBusy(true);
        setSnackbar('');
        try {
            await changePhone(normalizedPhone, normalizedCode);
            setPhoneInput('');
            setPhoneCode('');
            setPhoneCodeSent(false);
            resetResendCountdown();
            showMessage('شمارهٔ حساب با موفقیت تغییر کرد.', 'success');
        } catch (changeError) {
            showError(changeError, 'تغییر شماره ناموفق بود.');
        } finally {
            phoneVerificationInProgress.current = false;
            setPhoneBusy(false);
        }
    };

    if (!user) {
        return (
            <ThemedView style={styles.container}>
                <ThemedText type="body">برای ویرایش پروفایل ابتدا وارد حساب شوید.</ThemedText>
            </ThemedView>
        );
    }

    const photoPreviewUri = photoUri ?? (photoRemoved ? null : getProfilePhotoUrl(user.profile_photo_path));

    return (
        <ThemedView style={styles.container}>
            <ScrollView
                contentContainerStyle={styles.content}
                keyboardDismissMode="on-drag"
                keyboardShouldPersistTaps="handled"
            >
                <View style={styles.section}>
                    <View style={styles.sectionHeading}>
                        <ThemedText type="smallBold" style={{ color: theme.textSecondary }}>تصویر پروفایل</ThemedText>
                    </View>
                    <View style={[styles.profileHero, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                        <View style={styles.photoField}>
                            <ProfilePhotoField
                                uri={photoPreviewUri}
                                disabled={busy || profileRestricted}
                                onPreview={() => setPhotoPreviewVisible(true)}
                                onSelect={() => void choosePhoto()}
                                onRemove={() => {
                                    setPhotoUri(null);
                                    setPhotoRemoved(Boolean(user.profile_photo_path));
                                }}
                            />
                        </View>
                    </View>
                </View>

                <View style={styles.section}>
                    <View style={styles.sectionHeading}>
                        <ThemedText type="smallBold" style={{ color: theme.textSecondary }}>اطلاعات حساب</ThemedText>
                    </View>
                    <View style={[styles.formCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                        <View style={styles.field}>
                            <ThemedText type="smallBold">نام و نام خانوادگی</ThemedText>
                            <AppTextInput
                                accessibilityLabel="نام و نام خانوادگی"
                                autoComplete="name"
                                autoCapitalize="words"
                                autoCorrect={false}
                                editable={!busy && !profileRestricted}
                                maxLength={255}
                                onChangeText={setName}
                                placeholder="نام و نام خانوادگی"
                                placeholderTextColor={theme.textMuted}
                                value={name}
                                style={[
                                    styles.input,
                                    { backgroundColor: theme.surfaceVariant, borderColor: theme.border, color: theme.text },
                                ]}
                            />
                        </View>

                    </View>
                </View>

                <View style={styles.section}>
                    <View style={styles.sectionHeading}>
                        <ThemedText type="smallBold" style={{ color: theme.textSecondary }}>شمارهٔ تلفن حساب</ThemedText>
                    </View>
                    <View style={[styles.securityCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                        <View style={[styles.currentPhone, { backgroundColor: theme.surfaceVariant }]}>
                            <View style={[styles.currentPhoneIcon, { backgroundColor: theme.primary }]}>
                                <MaterialCommunityIcons name="cellphone" size={19} color={theme.onPrimary} />
                            </View>
                            <View style={styles.currentPhoneText}>
                                <ThemedText type="small" style={{ color: theme.textSecondary }}>شمارهٔ فعلی</ThemedText>
                                <ThemedText type="body" style={[styles.phoneValue, { color: theme.text }]}>{user.phone}</ThemedText>
                            </View>
                            <MaterialCommunityIcons name="check-decagram-outline" size={20} color={theme.success} />
                        </View>
                        <View style={styles.phoneChangeFields}>
                            <ThemedText type="smallBold">شمارهٔ تلفن جدید</ThemedText>
                            <IranianPhoneInput
                                accessibilityLabel="شمارهٔ تلفن جدید"
                                disabled={!isOnline || busy || securityRestricted}
                                onChangeText={(value) => {
                                    setPhoneInput(value);
                                    setPhoneCode('');
                                    setPhoneCodeSent(false);
                                    resetResendCountdown();
                                }}
                                value={phoneInput}
                            />
                            {phoneCodeSent ? (
                                <>
                                    <OtpCodeInput
                                        accessibilityLabel="کد تأیید شمارهٔ جدید"
                                        disabled={!isOnline || busy || securityRestricted}
                                        label="کد ۶ رقمی پیامک‌شده"
                                        onChangeText={setPhoneCode}
                                        onComplete={(value) => void verifyPhoneChange(value)}
                                        value={phoneCode}
                                    />
                                    <OtpResendControl
                                        disabled={!isOnline || phoneBusy || securityRestricted}
                                        onPress={() => void requestPhoneCode()}
                                        secondsRemaining={resendSeconds}
                                    />
                                </>
                            ) : null}
                            <Pressable
                                accessibilityRole="button"
                                accessibilityLabel={phoneCodeSent ? 'تأیید و تغییر شماره' : 'ارسال کد به شمارهٔ جدید'}
                                disabled={!isOnline || busy || securityRestricted}
                                onPress={() => void (phoneCodeSent ? verifyPhoneChange() : requestPhoneCode())}
                                style={({ pressed }) => [
                                    styles.phoneAction,
                                    {
                                        backgroundColor: theme.primary,
                                        opacity: !isOnline || busy || securityRestricted || pressed ? 0.65 : 1,
                                    },
                                ]}
                            >
                                {phoneBusy ? <ActivityIndicator size="small" color={theme.onPrimary} /> : null}
                                <ThemedText type="smallBold" style={{ color: theme.onPrimary }}>
                                    {phoneCodeSent ? 'تأیید و تغییر شماره' : 'ارسال کد به شمارهٔ جدید'}
                                </ThemedText>
                            </Pressable>
                            {securityRestricted ? (
                                <ThemedText type="small" style={{ color: theme.warning }}>
                                    تغییر شمارهٔ تلفن به‌دلیل محدودیت امنیت حساب موقتاً غیرفعال است.
                                </ThemedText>
                            ) : null}
                        </View>
                    </View>
                </View>

                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="ذخیرهٔ تغییرات پروفایل"
                    disabled={!isOnline || busy || profileRestricted || !hasUnsavedChanges}
                    onPress={() => void save()}
                    style={({ pressed }) => [
                        styles.saveButton,
                        {
                            backgroundColor: hasUnsavedChanges ? theme.primary : theme.surfaceVariant,
                            opacity: pressed || busy || !isOnline ? 0.55 : 1,
                        },
                    ]}
                >
                    {saving ? (
                        <ActivityIndicator size="small" color={theme.onPrimary} />
                    ) : null}
                    <ThemedText
                        type="smallBold"
                        style={{ color: hasUnsavedChanges ? theme.onPrimary : theme.textMuted }}
                    >
                        {saving ? 'در حال ذخیره...' : profileRestricted ? 'ویرایش به‌دلیل محدودیت غیرفعال است' : 'ذخیرهٔ تغییرات'}
                    </ThemedText>
                </Pressable>
                {profileNeedsLiveRefresh && isOnline ? (
                    <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="همگام‌سازی دوبارهٔ اطلاعات حساب"
                        disabled={profileRefreshBusy}
                        onPress={() => void refreshProfile()}
                        style={({ pressed }) => [styles.refreshButton, { borderColor: theme.border, opacity: pressed || profileRefreshBusy ? 0.6 : 1 }]}
                    >
                        {profileRefreshBusy
                            ? <ActivityIndicator size="small" color={theme.primaryText} />
                            : <MaterialCommunityIcons name="refresh" size={18} color={theme.primaryText} />}
                        <ThemedText type="smallBold" style={{ color: theme.primaryText }}>
                            {profileRefreshBusy ? 'در حال همگام‌سازی...' : 'همگام‌سازی دوبارهٔ اطلاعات حساب'}
                        </ThemedText>
                    </Pressable>
                ) : null}
            </ScrollView>
            <ProfilePhotoPreview
                uri={photoPreviewUri}
                visible={photoPreviewVisible}
                onClose={() => setPhotoPreviewVisible(false)}
            />
            <Snackbar variant="error"
                visible={Boolean(snackbar)}
                onDismiss={() => setSnackbar('')}
                duration={4500}
                style={{
                    backgroundColor: snackbarKind === 'error' ? theme.errorFill : theme.successFill,
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

const styles = StyleSheet.create({
    container: { flex: 1 },
    content: { padding: Spacing.four, paddingBottom: Spacing.six, gap: Spacing.four },
    profileHero: {
        borderWidth: 1,
        borderRadius: Radius.lg,
        paddingHorizontal: Spacing.four,
        paddingVertical: Spacing.five,
        alignItems: 'center',
        gap: Spacing.two,
    },
    photoField: { marginBottom: Spacing.one },
    section: { gap: Spacing.one },
    sectionHeading: { marginHorizontal: Spacing.one, gap: 2 },
    formCard: { borderWidth: 1, borderRadius: Radius.lg, overflow: 'hidden' },
    field: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.three, gap: Spacing.one },
    input: { minHeight: 48, borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: Spacing.three, fontSize: Typography.fontSize.bodyLarge },
    phoneValue: { writingDirection: 'ltr', textAlign: 'left' },
    securityCard: { borderWidth: 1, borderRadius: Radius.lg, padding: Spacing.three, gap: Spacing.three },
    currentPhone: { minHeight: 64, borderRadius: Radius.md, paddingHorizontal: Spacing.two, paddingVertical: Spacing.two, flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
    currentPhoneIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
    currentPhoneText: { flex: 1, gap: 2 },
    phoneChangeFields: { gap: Spacing.two },
    phoneAction: { minHeight: 48, borderRadius: Radius.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.two },
    saveButton: { minHeight: 50, borderRadius: Radius.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.two },
    refreshButton: { minHeight: 44, borderWidth: 1, borderRadius: Radius.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.two },
});
