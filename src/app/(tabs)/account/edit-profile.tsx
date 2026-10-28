import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Snackbar } from 'react-native-paper';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppTextInput } from '@/components/app-text';
import { ProfilePhotoField } from '@/components/profile-photo-field';
import { ProfilePhotoPreview } from '@/components/profile-photo-preview';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { useTheme } from '@/hooks/use-theme';
import { getProfilePhotoUrl } from '@/services/auth-api';

export default function EditProfileScreen() {
    const theme = useTheme();
    const router = useRouter();
    const {
        user,
        updateProfile,
        uploadProfilePhoto,
        removeProfilePhoto,
    } = useAuth();
    const [name, setName] = useState(user?.name ?? '');
    const [photoUri, setPhotoUri] = useState<string | null>(null);
    const [photoPreviewVisible, setPhotoPreviewVisible] = useState(false);
    const [photoRemoved, setPhotoRemoved] = useState(false);
    const [saving, setSaving] = useState(false);
    const [snackbar, setSnackbar] = useState('');
    const [snackbarKind, setSnackbarKind] = useState<'success' | 'error'>('success');
    const busy = saving;

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
            showMessage(pickerError instanceof Error ? pickerError.message : 'انتخاب تصویر پروفایل ناموفق بود.', 'error');
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
                    showMessage(
                        `اطلاعات متنی ذخیره شد، اما تصویر بارگذاری نشد: ${photoError instanceof Error ? photoError.message : 'خطای نامشخص'}`,
                        'error',
                    );
                    return;
                }
            } else if (photoRemoved) {
                await removeProfilePhoto();
            }
            router.back();
        } catch (saveError) {
            showMessage(saveError instanceof Error ? saveError.message : 'ذخیرهٔ اطلاعات پروفایل ناموفق بود.', 'error');
        } finally {
            setSaving(false);
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
                <View style={[styles.profileHero, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                    <View style={styles.photoField}>
                        <ProfilePhotoField
                            uri={photoPreviewUri}
                            disabled={busy}
                            onPreview={() => setPhotoPreviewVisible(true)}
                            onSelect={() => void choosePhoto()}
                            onRemove={() => {
                                setPhotoUri(null);
                                setPhotoRemoved(true);
                            }}
                        />
                    </View>
                    <ThemedText type="largeTitle" style={styles.heroName}>{user.name}</ThemedText>
                    <View style={styles.heroContact}>
                        <MaterialCommunityIcons name="cellphone" size={17} color={theme.textSecondary} />
                        <ThemedText type="body" style={[styles.heroPhone, { color: theme.textSecondary }]}>
                            {user.phone}
                        </ThemedText>
                    </View>
                </View>

                <View style={styles.section}>
                    <View style={styles.sectionHeading}>
                        <ThemedText type="smallBold" style={{ color: theme.textSecondary }}>اطلاعات حساب</ThemedText>
                        <ThemedText type="small" style={{ color: theme.textMuted }}>
                            نام و شمارهٔ تلفن حساب شما
                        </ThemedText>
                    </View>
                    <View style={[styles.formCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                        <View style={styles.field}>
                            <ThemedText type="smallBold">نام و نام خانوادگی</ThemedText>
                            <AppTextInput
                                accessibilityLabel="نام و نام خانوادگی"
                                autoComplete="name"
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

                        <View style={[styles.field, styles.fieldSeparated, { borderColor: theme.border }]}>
                            <ThemedText type="smallBold">شمارهٔ تأییدشده</ThemedText>
                            <View style={[styles.readOnlyField, { backgroundColor: theme.surfaceVariant }]}>
                                <ThemedText type="body" style={[styles.phoneValue, { color: theme.textSecondary }]}>
                                    {user.phone}
                                </ThemedText>
                                <MaterialCommunityIcons name="check-decagram-outline" size={20} color={theme.success} />
                            </View>
                            <ThemedText type="small" style={{ color: theme.textSecondary }}>
                                تغییر شماره از بخش «حریم خصوصی و امنیت» و پس از تأیید OTP انجام می‌شود.
                            </ThemedText>
                        </View>
                    </View>
                </View>

                <Pressable
                    accessibilityRole="button"
                    disabled={busy || !hasUnsavedChanges}
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
                        {saving ? 'در حال ذخیره...' : 'ذخیرهٔ تغییرات'}
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
    heroName: { textAlign: 'center' },
    heroContact: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
    heroPhone: { writingDirection: 'ltr', textAlign: 'left' },
    section: { gap: Spacing.one },
    sectionHeading: { marginHorizontal: Spacing.one, gap: 2 },
    formCard: { borderWidth: 1, borderRadius: Radius.lg, overflow: 'hidden' },
    field: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.three, gap: Spacing.one },
    fieldSeparated: { borderTopWidth: 1 },
    input: { minHeight: 48, borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: Spacing.three, fontSize: 16 },
    readOnlyField: { minHeight: 48, borderRadius: Radius.md, paddingHorizontal: Spacing.three, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    phoneValue: { writingDirection: 'ltr', textAlign: 'left' },
    saveButton: { minHeight: 50, borderRadius: Radius.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.two },
});
