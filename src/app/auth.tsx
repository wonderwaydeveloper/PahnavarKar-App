import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
    Alert,
    BackHandler,
    Keyboard,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    View,
} from 'react-native';
import { ActivityIndicator, Appbar } from 'react-native-paper';

import { AppTextInput } from '@/components/app-text';
import { IranianPhoneInput } from '@/components/iranian-phone-input';
import { OtpCodeInput } from '@/components/otp-code-input';
import { OtpResendControl } from '@/components/otp-resend-control';
import { ProfilePhotoField } from '@/components/profile-photo-field';
import { ProfilePhotoPreview } from '@/components/profile-photo-preview';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useAppContext } from '@/hooks/use-app-context';
import { useAppFeedback } from '@/hooks/use-app-feedback';
import { useAuth } from '@/hooks/use-auth';
import { useOtpResendCountdown } from '@/hooks/use-otp-resend-countdown';
import { useTheme } from '@/hooks/use-theme';
import { sendOtp } from '@/services/auth-api';
import { getUserFacingErrorMessage, getUserFacingFieldError } from '@/services/user-facing-error';
import { getIranianNationalNumber, normalizeIranianPhone } from '@/services/iranian-phone';

type AuthStep = 'phone' | 'editPhone' | 'code' | 'profile' | 'twoFactor';
type AuthField = 'phone' | 'name' | 'code';
type AuthError = { field: AuthField; message: string } | null;
type AuthMessageKind = 'success' | 'error';

function getErrorMessage(error: unknown): string {
    return getUserFacingErrorMessage(error, 'خطای نامشخص در ارتباط با سرور رخ داد.');
}

export default function AuthScreen() {
    const theme = useTheme();
    const { theme: appTheme } = useAppContext();
    const { isLoading: authLoading, signInWithOtp, verifyTwoFactorLogin, uploadProfilePhoto, user } = useAuth();
    const { dismissFeedback, showFeedback } = useAppFeedback();
    const router = useRouter();
    const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
    const returnPath = returnTo === 'plans'
        ? '/(tabs)/account/plans'
        : returnTo === 'notifications'
            ? '/(tabs)/account/notifications'
            : '/(tabs)/account';
    const isLightTheme = appTheme === 'light';
    const headerBackgroundColor = isLightTheme ? theme.primary : theme.surface;
    const headerTitleColor = isLightTheme ? theme.surface : theme.text;

    const [step, setStep] = useState<AuthStep>('phone');
    const [returnStep, setReturnStep] = useState<'code' | 'profile'>('code');
    const [phone, setPhone] = useState('');
    const [name, setName] = useState('');
    const [profilePhoto, setProfilePhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
    const [photoPreviewVisible, setPhotoPreviewVisible] = useState(false);
    const [code, setCode] = useState('');
    const [twoFactorChallenge, setTwoFactorChallenge] = useState<string | null>(null);
    const [twoFactorCode, setTwoFactorCode] = useState('');
    const { secondsRemaining: resendSeconds, start: startResendCountdown } = useOtpResendCountdown();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<AuthError>(null);
    const [focusedField, setFocusedField] = useState<AuthField | null>(null);
    const isVerifyingCode = useRef(false);
    const nationalNumber = getIranianNationalNumber(phone);
    const normalizedPhone = normalizeIranianPhone(phone) ?? '';

    useEffect(() => {
        if (!authLoading && !busy && user) {
            router.replace(returnPath);
        }
    }, [authLoading, busy, returnPath, router, user]);

    const clearFieldError = (field: AuthField) => {
        setError((currentError) => currentError?.field === field ? null : currentError);
        dismissFeedback();
    };

    const showMessage = (text: string, kind: AuthMessageKind = 'error') => {
        showFeedback({ message: text, variant: kind });
    };

    const chooseProfilePhoto = async () => {
        try {
            const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (!permission.granted) {
                showMessage('برای انتخاب تصویر پروفایل، دسترسی به تصاویر را مجاز کنید.');
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
                setProfilePhoto(result.assets[0] ?? null);
                setError(null);
                dismissFeedback();
            }
        } catch (pickerError) {
            showMessage(getErrorMessage(pickerError));
        }
    };

    const requestCode = async () => {
        Keyboard.dismiss();

        if (!/^9\d{9}$/.test(nationalNumber)) {
            dismissFeedback();
            setError({ field: 'phone', message: 'شماره تلفن معتبر وارد کنید.' });
            return;
        }
        setBusy(true);
        setError(null);
        dismissFeedback();
        try {
            const response = await sendOtp({
                phone: normalizedPhone,
                type: 'login',
            });
            setCode('');
            startResendCountdown(response.resend_after);
            setStep('code');
            showMessage('کد تأیید از طریق پیامک ارسال شد.', 'success');
        } catch (requestError) {
            const fieldError = getUserFacingFieldError(
                requestError,
                ['phone', 'mobile'],
                'شمارهٔ تلفن واردشده معتبر نیست.',
            );
            if (fieldError) {
                setError({ field: 'phone', message: fieldError });
            } else {
                showMessage(getErrorMessage(requestError));
            }
        } finally {
            setBusy(false);
        }
    };

    const verifyCode = async (submittedCode = code) => {
        if (busy || isVerifyingCode.current) {
            return;
        }
        if (!/^\d{6}$/.test(submittedCode)) {
            dismissFeedback();
            setError({ field: 'code', message: 'کد تأیید باید ۶ رقم باشد.' });
            return;
        }

        isVerifyingCode.current = true;
        setBusy(true);
        setError(null);
        dismissFeedback();
        try {
            const result = await signInWithOtp({
                phone: normalizedPhone,
                type: 'login',
                code: submittedCode,
            });
            if (result === 'profile_required') {
                setStep('profile');
                return;
            }
            if (typeof result === 'object') {
                setTwoFactorChallenge(result.challengeToken);
                setTwoFactorCode('');
                setStep('twoFactor');
                return;
            }

            router.replace(returnPath);
        } catch (verificationError) {
            const fieldError = getUserFacingFieldError(
                verificationError,
                ['code', 'otp', 'verification_code'],
                'کد تأیید واردشده معتبر نیست.',
            );
            if (fieldError) {
                setError({ field: 'code', message: fieldError });
            } else {
                showMessage(getErrorMessage(verificationError));
            }
        } finally {
            isVerifyingCode.current = false;
            setBusy(false);
        }
    };

    const verifyTwoFactorCode = async () => {
        if (!twoFactorChallenge || busy) return;
        const normalizedCode = twoFactorCode.trim().toUpperCase();
        if (!/^(?:[0-9]{6}|[A-F0-9]{10})$/.test(normalizedCode)) {
            showMessage('کد شش‌رقمی برنامه یا کد بازیابی ۱۰حرفی را وارد کنید.');
            return;
        }

        setBusy(true);
        setError(null);
        dismissFeedback();
        try {
            await verifyTwoFactorLogin(twoFactorChallenge, normalizedCode);
            setTwoFactorChallenge(null);
            router.replace(returnPath);
        } catch (verificationError) {
            showMessage(getErrorMessage(verificationError));
        } finally {
            setBusy(false);
        }
    };

    const completeRegistration = async () => {
        Keyboard.dismiss();

        if (!name.trim()) {
            dismissFeedback();
            setError({ field: 'name', message: 'نام و نام خانوادگی را وارد کنید.' });
            return;
        }
        if (!/^\d{6}$/.test(code)) {
            dismissFeedback();
            setError({ field: 'code', message: 'کد تأیید باید ۶ رقم باشد. دوباره شماره را تأیید کنید.' });
            setStep('code');
            return;
        }

        setBusy(true);
        setError(null);
        dismissFeedback();
        let navigatingAfterRegistration = false;
        try {
            const result = await signInWithOtp({
                phone: normalizedPhone,
                type: 'login',
                code,
                name: name.trim(),
            });
            if (result !== 'authenticated') {
                if (typeof result === 'object') {
                    setTwoFactorChallenge(result.challengeToken);
                    setTwoFactorCode('');
                    setStep('twoFactor');
                    return;
                }
                throw new Error('تکمیل حساب انجام نشد. دوباره تلاش کنید.');
            }

            if (profilePhoto) {
                try {
                    await uploadProfilePhoto(profilePhoto.uri);
                } catch (photoError) {
                    Alert.alert(
                        'ثبت‌نام انجام شد',
                        `حساب شما ساخته شد، اما تصویر پروفایل بارگذاری نشد؛ حساب بدون تصویر ذخیره شده است.\n${getErrorMessage(photoError)}`,
                    );
                }
            }
            router.replace(returnPath);
            navigatingAfterRegistration = true;
        } catch (registrationError) {
            const nameError = getUserFacingFieldError(registrationError, ['name'], 'نام واردشده معتبر نیست.');
            const codeError = getUserFacingFieldError(
                registrationError,
                ['code', 'otp', 'verification_code'],
                'کد تأیید واردشده معتبر نیست.',
            );
            if (nameError) {
                setError({ field: 'name', message: nameError });
            } else if (codeError) {
                setError({ field: 'code', message: codeError });
                setStep('code');
            } else {
                showMessage(getErrorMessage(registrationError));
            }
        } finally {
            if (!navigatingAfterRegistration) {
                setBusy(false);
            }
        }
    };

    const goBack = () => {
        if (step === 'twoFactor') {
            setTwoFactorChallenge(null);
            setTwoFactorCode('');
            setCode('');
            setStep('phone');
            setError(null);
            dismissFeedback();
            return;
        }
        if (step === 'code' || step === 'profile') {
            setReturnStep(step);
            setStep('editPhone');
            setError(null);
            dismissFeedback();
            return;
        }
        if (step === 'editPhone') {
            setStep(returnStep);
            setError(null);
            dismissFeedback();
            return;
        }

        if (router.canGoBack()) {
            router.back();
        } else {
            router.replace('/(tabs)/account');
        }
    };

    useEffect(() => {
        if (step === 'phone') {
            return;
        }

        const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
            if (busy) {
                return true;
            }

            setStep((currentStep) => {
                if (currentStep === 'twoFactor') {
                    setTwoFactorChallenge(null);
                    setTwoFactorCode('');
                    return 'phone';
                }
                if (currentStep === 'code' || currentStep === 'profile') {
                    setReturnStep(currentStep);
                    return 'editPhone';
                }

                return returnStep;
            });
            setError(null);
            dismissFeedback();
            return true;
        });

        return () => subscription.remove();
    }, [busy, dismissFeedback, returnStep, step]);

    const appBarTitle = step === 'phone'
        ? 'ورود یا ثبت‌نام'
        : step === 'editPhone' ? 'ویرایش شماره تلفن'
            : step === 'profile' ? 'تکمیل حساب'
                : step === 'twoFactor' ? 'تأیید دومرحله‌ای' : 'تأیید شماره';

    if (authLoading) {
        return (
            <ThemedView style={styles.sessionRestore}>
                <View style={[styles.sessionRestoreCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                    <View style={[styles.sessionRestoreIcon, { backgroundColor: theme.primaryContainer }]}>
                        <MaterialCommunityIcons name="shield-account-outline" size={36} color={theme.primaryText} />
                    </View>
                    <ThemedText type="bodyBold" style={styles.sessionRestoreTitle}>
                        در حال بررسی حساب شما
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary" style={styles.sessionRestoreDescription}>
                        وضعیت ورود را بررسی می‌کنیم تا شما را به صفحهٔ مناسب هدایت کنیم.
                    </ThemedText>
                    <View style={[styles.sessionRestoreProgress, { backgroundColor: theme.surfaceVariant }]}>
                        <ActivityIndicator size="small" color={theme.primaryText} />
                        <ThemedText type="small" themeColor="textSecondary">
                            لطفاً چند لحظه صبر کنید
                        </ThemedText>
                    </View>
                </View>
            </ThemedView>
        );
    }

    return (
        <ThemedView style={styles.container}>
            <KeyboardAvoidingView
                style={styles.flex}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <Appbar.Header
                    style={[
                        styles.appBar,
                        {
                            backgroundColor: headerBackgroundColor,
                            shadowColor: theme.text,
                            shadowOpacity: isLightTheme ? 0.16 : 0.08,
                        },
                    ]}
                >
                    <Appbar.Action
                        accessibilityLabel="بازگشت"
                        icon="chevron-right"
                        color={headerTitleColor}
                        onPress={goBack}
                        size={24}
                        style={styles.appBarAction}
                    />
                    <View style={styles.appBarTitleWrap}>
                        <ThemedText type="title" style={[styles.appBarTitle, { color: headerTitleColor }]}>
                            {appBarTitle}
                        </ThemedText>
                    </View>
                </Appbar.Header>

                <ScrollView
                    contentContainerStyle={styles.scrollContent}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                >
                    <View style={styles.content}>
                        {step === 'phone' || step === 'profile' ? (
                            <View style={styles.form}>
                                <ThemedText type="body" style={{ color: theme.textSecondary }}>
                                    {step === 'phone'
                                        ? 'شمارهٔ موبایل خود را وارد کنید؛ حساب شما پس از تأیید شماره به‌صورت خودکار شناسایی می‌شود.'
                                        : 'شمارهٔ شما تأیید شد. برای ساخت حساب، نام خود را وارد کنید.'}
                                </ThemedText>

                                {step === 'profile' ? (
                                    <>
                                        <View style={[styles.destinationCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                                            <ThemedText type="smallBold" style={styles.destinationPhone}>
                                                {`\u2066+98 ${nationalNumber}\u2069`}
                                            </ThemedText>
                                            <Pressable
                                                accessibilityRole="button"
                                                disabled={busy}
                                                onPress={() => {
                                                    setReturnStep('profile');
                                                    setError(null);
                                                    dismissFeedback();
                                                    setStep('editPhone');
                                                }}
                                            >
                                                <ThemedText type="smallBold" style={{ color: theme.primaryText }}>ویرایش شماره</ThemedText>
                                            </Pressable>
                                        </View>

                                        <View style={styles.fieldGroup}>
                                            <ThemedText type="smallBold" style={styles.fieldLabel}>تصویر پروفایل (اختیاری)</ThemedText>
                                            <View style={[styles.photoCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                                                <ProfilePhotoField
                                                    uri={profilePhoto?.uri ?? null}
                                                    disabled={busy}
                                                    onPreview={() => setPhotoPreviewVisible(true)}
                                                    onSelect={() => void chooseProfilePhoto()}
                                                    onRemove={() => setProfilePhoto(null)}
                                                    removeAccessibilityLabel="حذف تصویر انتخاب‌شده"
                                                />
                                            </View>
                                        </View>

                                        <View style={styles.fieldGroup}>
                                            <ThemedText type="smallBold" style={styles.fieldLabel}>نام و نام خانوادگی</ThemedText>
                                            <AppTextInput
                                                accessibilityLabel="نام و نام خانوادگی"
                                                autoComplete="name"
                                                onBlur={() => setFocusedField(null)}
                                                onChangeText={(value) => {
                                                    setName(value);
                                                    clearFieldError('name');
                                                }}
                                                onFocus={() => setFocusedField('name')}
                                                placeholder="نام و نام خانوادگی"
                                                placeholderTextColor={theme.textMuted}
                                                returnKeyType="next"
                                                underlineColorAndroid="transparent"
                                                value={name}
                                                style={[
                                                    styles.profileInput,
                                                    {
                                                        backgroundColor: theme.surface,
                                                        borderColor: error?.field === 'name'
                                                            ? theme.error
                                                            : focusedField === 'name' ? theme.primary : theme.border,
                                                        color: theme.text,
                                                    },
                                                ]}
                                            />
                                            {error?.field === 'name' ? (
                                                <ThemedText type="small" accessibilityRole="alert" style={{ color: theme.error }}>
                                                    {error.message}
                                                </ThemedText>
                                            ) : null}
                                        </View>

                                    </>
                                ) : null}

                                {step === 'phone' ? (
                                    <IranianPhoneInput
                                        accessibilityLabel="شماره تلفن"
                                        error={error?.field === 'phone' ? error.message : undefined}
                                        label="شماره تلفن"
                                        onChangeText={(value) => {
                                            setPhone(value);
                                            clearFieldError('phone');
                                        }}
                                        value={phone}
                                    />
                                ) : null}

                                <Pressable
                                    accessibilityRole="button"
                                    disabled={busy}
                                    onPress={() => void (step === 'profile' ? completeRegistration() : requestCode())}
                                    style={({ pressed }) => [
                                        styles.primaryButton,
                                        {
                                            backgroundColor: theme.primary,
                                            opacity: pressed || busy ? 0.72 : 1,
                                        },
                                    ]}
                                >
                                    {busy ? <ActivityIndicator color={theme.onPrimary} size="small" /> : null}
                                    <ThemedText type="smallBold" style={[styles.primaryButtonText, { color: theme.onPrimary }]}>
                                        {busy
                                            ? step === 'profile' ? 'در حال ایجاد حساب...' : 'در حال ارسال...'
                                            : step === 'profile' ? 'تکمیل ثبت‌نام' : 'دریافت کد تأیید'}
                                    </ThemedText>
                                    {!busy ? <MaterialCommunityIcons name="arrow-left" size={20} color={theme.onPrimary} /> : null}
                                </Pressable>
                            </View>
                        ) : step === 'editPhone' ? (
                            <View style={styles.form}>
                                <ThemedText type="body" style={{ color: theme.textSecondary }}>
                                    شمارهٔ جدید را وارد کنید تا کد تأیید تازه‌ای برای آن ارسال شود.
                                </ThemedText>
                                <IranianPhoneInput
                                    accessibilityLabel="ویرایش شماره تلفن"
                                    error={error?.field === 'phone' ? error.message : undefined}
                                    label="شماره تلفن"
                                    onChangeText={(value) => {
                                        setPhone(value);
                                        clearFieldError('phone');
                                    }}
                                    value={phone}
                                />
                                <Pressable
                                    accessibilityRole="button"
                                    disabled={busy}
                                    onPress={() => void requestCode()}
                                    style={({ pressed }) => [
                                        styles.primaryButton,
                                        {
                                            backgroundColor: theme.primary,
                                            opacity: pressed || busy ? 0.72 : 1,
                                        },
                                    ]}
                                >
                                    {busy ? <ActivityIndicator color={theme.onPrimary} size="small" /> : null}
                                    <ThemedText type="smallBold" style={[styles.primaryButtonText, { color: theme.onPrimary }]}>
                                        {busy ? 'در حال ارسال...' : 'ارسال کد به این شماره'}
                                    </ThemedText>
                                    {!busy ? <MaterialCommunityIcons name="arrow-left" size={20} color={theme.onPrimary} /> : null}
                                </Pressable>
                            </View>
                        ) : step === 'twoFactor' ? (
                            <View style={styles.form}>
                                <ThemedText type="body" style={{ color: theme.textSecondary }}>
                                    کد برنامهٔ احراز هویت یا یکی از کدهای بازیابی را وارد کنید. تا تأیید این مرحله نشست ورود ساخته نمی‌شود.
                                </ThemedText>
                                <View style={styles.fieldGroup}>
                                    <ThemedText type="smallBold" style={styles.fieldLabel}>کد تأیید یا بازیابی</ThemedText>
                                    <AppTextInput
                                        accessibilityLabel="کد تأیید دومرحله‌ای یا بازیابی"
                                        autoComplete="one-time-code"
                                        autoCapitalize="characters"
                                        autoCorrect={false}
                                        maxLength={10}
                                        onChangeText={(value) => setTwoFactorCode(value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase())}
                                        placeholder="کد ۶ رقمی یا بازیابی"
                                        placeholderTextColor={theme.textMuted}
                                        returnKeyType="done"
                                        onSubmitEditing={() => void verifyTwoFactorCode()}
                                        value={twoFactorCode}
                                        style={[
                                            styles.profileInput,
                                            {
                                                backgroundColor: theme.surface,
                                                borderColor: theme.border,
                                                color: theme.text,
                                                textAlign: 'center',
                                                writingDirection: 'ltr',
                                            },
                                        ]}
                                    />
                                </View>
                                <Pressable
                                    accessibilityRole="button"
                                    disabled={busy}
                                    onPress={() => void verifyTwoFactorCode()}
                                    style={({ pressed }) => [
                                        styles.primaryButton,
                                        { backgroundColor: theme.primary, opacity: pressed || busy ? 0.72 : 1 },
                                    ]}
                                >
                                    {busy ? <ActivityIndicator color={theme.onPrimary} size="small" /> : null}
                                    <ThemedText type="smallBold" style={[styles.primaryButtonText, { color: theme.onPrimary }]}>
                                        {busy ? 'در حال بررسی...' : 'تأیید و ورود'}
                                    </ThemedText>
                                </Pressable>
                            </View>
                        ) : (
                            <View style={styles.form}>
                                <View style={[styles.destinationCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                                    <ThemedText type="smallBold" style={styles.destinationPhone}>
                                        {`\u2066+98 ${nationalNumber}\u2069`}
                                    </ThemedText>
                                    <Pressable
                                        accessibilityRole="button"
                                        disabled={busy}
                                        onPress={() => {
                                            setError(null);
                                            dismissFeedback();
                                            setStep('editPhone');
                                        }}
                                    >
                                        <ThemedText type="smallBold" style={{ color: theme.primaryText }}>ویرایش</ThemedText>
                                    </Pressable>
                                </View>

                                <OtpCodeInput
                                    accessibilityLabel="کد شش رقمی تأیید"
                                    disabled={busy}
                                    error={error?.field === 'code' ? error.message : undefined}
                                    label="کد ۶ رقمی پیامک‌شده"
                                    onChangeText={(value) => {
                                        setCode(value);
                                        clearFieldError('code');
                                    }}
                                    onComplete={(value) => void verifyCode(value)}
                                    value={code}
                                />
                                <OtpResendControl
                                    disabled={busy}
                                    onPress={() => void requestCode()}
                                    secondsRemaining={resendSeconds}
                                />
                                <Pressable
                                    accessibilityRole="button"
                                    disabled={busy}
                                    onPress={() => void verifyCode()}
                                    style={({ pressed }) => [
                                        styles.primaryButton,
                                        { backgroundColor: theme.primary, opacity: pressed || busy ? 0.72 : 1 },
                                    ]}
                                >
                                    {busy ? <ActivityIndicator color={theme.onPrimary} size="small" /> : null}
                                    <ThemedText type="smallBold" style={[styles.primaryButtonText, { color: theme.onPrimary }]}>
                                        {busy ? 'در حال بررسی...' : 'تأیید و ورود'}
                                    </ThemedText>
                                    {!busy ? <MaterialCommunityIcons name="arrow-left" size={20} color={theme.onPrimary} /> : null}
                                </Pressable>

                                <ThemedText type="small" style={[styles.helperText, { color: theme.textMuted }]}>
                                    کد برای مدت محدود معتبر است. هرگز آن را با دیگران به اشتراک نگذارید.
                                </ThemedText>
                            </View>
                        )}
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
            <ProfilePhotoPreview
                uri={profilePhoto?.uri ?? null}
                visible={photoPreviewVisible}
                onClose={() => setPhotoPreviewVisible(false)}
            />
        </ThemedView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    flex: { flex: 1 },
    sessionRestore: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: Spacing.four,
    },
    sessionRestoreCard: {
        width: '100%',
        maxWidth: 440,
        alignItems: 'center',
        gap: Spacing.two,
        borderWidth: 1,
        borderRadius: Radius.lg,
        paddingHorizontal: Spacing.four,
        paddingVertical: Spacing.five,
    },
    sessionRestoreIcon: {
        width: 76,
        height: 76,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 38,
        marginBottom: Spacing.one,
    },
    sessionRestoreTitle: {
        textAlign: 'center',
    },
    sessionRestoreDescription: {
        maxWidth: 320,
        textAlign: 'center',
        lineHeight: 24,
    },
    sessionRestoreProgress: {
        width: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: Spacing.two,
        borderRadius: Radius.md,
        paddingVertical: Spacing.two,
        marginTop: Spacing.one,
    },
    appBar: {
        elevation: 4,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
    },
    appBarAction: { width: 40, marginHorizontal: 0 },
    appBarTitleWrap: {
        flexShrink: 1,
        maxWidth: '75%',
        justifyContent: 'center',
    },
    appBarTitle: {
        fontSize: 16,
        fontFamily: 'AppFont-Bold',
        textAlign: 'right',
    },
    scrollContent: {
        flexGrow: 1,
        width: '100%',
        maxWidth: 560,
        alignSelf: 'center',
        paddingHorizontal: Spacing.four,
        paddingTop: Spacing.three,
        paddingBottom: Spacing.two,
    },
    content: {
        flexGrow: 1,
        justifyContent: 'flex-start',
        gap: Spacing.three,
        paddingVertical: Spacing.three,
    },
    form: { gap: Spacing.two },
    fieldGroup: {
        gap: Spacing.one,
    },
    fieldLabel: {
        paddingHorizontal: Spacing.one,
    },
    modeSwitch: {
        flexDirection: 'row',
        gap: Spacing.two,
        marginVertical: Spacing.one,
    },
    modeButton: {
        flex: 1,
        minHeight: 44,
        borderWidth: 1,
        borderRadius: Radius.md,
        alignItems: 'center',
        justifyContent: 'center',
    },
    primaryButton: {
        minHeight: 52,
        borderRadius: Radius.md,
        paddingHorizontal: Spacing.three,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: Spacing.two,
        marginTop: Spacing.one,
    },
    primaryButtonText: { textAlign: 'center' },
    profileInput: {
        minHeight: 54,
        borderWidth: 1,
        borderRadius: Radius.md,
        paddingHorizontal: Spacing.three,
        fontSize: 16,
    },
    photoCard: {
        borderWidth: 1,
        borderRadius: Radius.md,
        padding: Spacing.three,
        gap: Spacing.two,
        alignItems: 'center',
    },
    destinationCard: {
        minHeight: 52,
        borderWidth: 1,
        borderRadius: Radius.md,
        paddingHorizontal: Spacing.three,
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.two,
    },
    destinationPhone: { flex: 1, writingDirection: 'ltr', textAlign: 'left' },
    helperText: { textAlign: 'center' },
});
