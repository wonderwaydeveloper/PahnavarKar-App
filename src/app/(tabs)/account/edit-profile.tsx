import { Typography } from '@/constants/typography';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Snackbar } from 'react-native-paper';
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
import { useOtpResendCountdown } from '@/hooks/use-otp-resend-countdown';
import { useTheme } from '@/hooks/use-theme';
import { getProfilePhotoUrl, sendOtp } from '@/services/auth-api';
import { normalizeIranianPhone, normalizeOtpCode } from '@/services/iranian-phone';
import { getUserFacingErrorMessage } from '@/services/user-facing-error';

export default function EditProfileScreen() {
    const theme = useTheme();
    const router = useRouter();
    const {
        user,
        updateProfile,
        uploadProfilePhoto,
        removeProfilePhoto,
        changePhone,
    } = useAuth();
    const { showError, showFeedback } = useAppFeedback();
    const profileRestricted = user?.restricted_capabilities?.includes('profile') ?? false;
    const securityRestricted = user?.restricted_capabilities?.includes('security') ?? false;
    const [name, setName] = useState(user?.name ?? '');
    const [photoUri, setPhotoUri] = useState<string | null>(null);
    const [photoPreviewVisible, setPhotoPreviewVisible] = useState(false);
    const [photoRemoved, setPhotoRemoved] = useState(false);
    const [saving, setSaving] = useState(false);
    const [phoneInput, setPhoneInput] = useState('');
    const [phoneCode, setPhoneCode] = useState('');
    const [phoneCodeSent, setPhoneCodeSent] = useState(false);
    const [phoneBusy, setPhoneBusy] = useState(false);
    const { secondsRemaining: resendSeconds, start: startResendCountdown, reset: resetResendCountdown } = useOtpResendCountdown();
    const [snackbar, setSnackbar] = useState('');
    const [snackbarKind, setSnackbarKind] = useState<'success' | 'error'>('success');
    const phoneVerificationInProgress = useRef(false);
    const busy = saving || phoneBusy;

    const showMessage = (message: string, kind: 'success' | 'error' = 'success') => {
        setSnackbarKind(kind);
        setSnackbar(message);
    };

    const hasUnsavedChanges = Boolean(
        user && (
            name.trim() !== user.name ||
            photoUri !== null ||
            photoRemoved
        ),
    );

    const choosePhoto = async () => {
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
        }
    };

    const save = async () => {
        if (!user || busy || !hasUnsavedChanges) {
            return;
        }
        if (!name.trim()) {
            showMessage('نام و نام خانوادگی را وارد کنید.', 'error');
            return;
        }
        setSaving(true);
        setSnackbar('');
        try {
            await updateProfile({ name: name.trim() });
            if (photoUri) {
                try {
                    await uploadProfilePhoto(photoUri);
                } catch (photoError) {
                    showFeedback({
                        message: `اطلاعات متنی ذخیره شد، اما تصویر بارگذاری نشد: ${getUserFacingErrorMessage(photoError, 'خطای نامشخص')}`,
                        variant: 'error',
                    });
                    return;
                }
            } else if (photoRemoved) {
                await removeProfilePhoto();
            }
            router.back();
        } catch (saveError) {
            showError(saveError, 'ذخیرهٔ اطلاعات پروفایل ناموفق بود.');
        } finally {
            setSaving(false);
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
        if (phoneBusy || phoneVerificationInProgress.current) return;
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
            <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
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
                                    setPhotoRemoved(true);
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
                                editable={!profileRestricted}
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
                                disabled={busy || securityRestricted}
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
                                        disabled={busy || securityRestricted}
                                        label="کد ۶ رقمی پیامک‌شده"
                                        onChangeText={setPhoneCode}
                                        onComplete={(value) => void verifyPhoneChange(value)}
                                        value={phoneCode}
                                    />
                                    <OtpResendControl
                                        disabled={phoneBusy || securityRestricted}
                                        onPress={() => void requestPhoneCode()}
                                        secondsRemaining={resendSeconds}
                                    />
                                </>
                            ) : null}
                            <Pressable
                                accessibilityRole="button"
                                disabled={busy || securityRestricted}
                                onPress={() => void (phoneCodeSent ? verifyPhoneChange() : requestPhoneCode())}
                                style={({ pressed }) => [
                                    styles.phoneAction,
                                    {
                                        backgroundColor: theme.primary,
                                        opacity: busy || securityRestricted || pressed ? 0.65 : 1,
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
                    disabled={busy || profileRestricted || !hasUnsavedChanges}
                    onPress={() => void save()}
                    style={({ pressed }) => [
                        styles.saveButton,
                        {
                            backgroundColor: hasUnsavedChanges ? theme.primary : theme.surfaceVariant,
                            opacity: pressed || busy ? 0.72 : 1,
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
            </ScrollView>
            <ProfilePhotoPreview
                uri={photoPreviewUri}
                visible={photoPreviewVisible}
                onClose={() => setPhotoPreviewVisible(false)}
            />
            <Snackbar
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
});
