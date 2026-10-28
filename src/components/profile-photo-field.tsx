import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

interface ProfilePhotoFieldProps {
    disabled?: boolean;
    onPreview: () => void;
    onRemove?: () => void;
    removeAccessibilityLabel?: string;
    onSelect: () => void;
    uri: string | null;
}

export function ProfilePhotoField({
    disabled = false,
    onPreview,
    onRemove,
    removeAccessibilityLabel = 'حذف تصویر پروفایل',
    onSelect,
    uri,
}: ProfilePhotoFieldProps) {
    const theme = useTheme();

    return (
        <View style={[styles.container, { backgroundColor: theme.primaryContainer }]}>
            {uri ? (
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="پیش‌نمایش تصویر پروفایل"
                    disabled={disabled}
                    onPress={onPreview}
                >
                    <Image source={{ uri }} contentFit="cover" style={styles.image} />
                </Pressable>
            ) : (
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="انتخاب تصویر پروفایل"
                    disabled={disabled}
                    onPress={onSelect}
                    style={styles.placeholder}
                >
                    <MaterialCommunityIcons name="account-outline" size={36} color={theme.primaryText} />
                </Pressable>
            )}
            <Pressable
                accessibilityRole="button"
                accessibilityLabel={uri ? 'تغییر تصویر پروفایل' : 'انتخاب تصویر پروفایل'}
                disabled={disabled}
                onPress={onSelect}
                style={[styles.actionBadge, styles.selectBadge, { backgroundColor: theme.primary }]}
            >
                <MaterialCommunityIcons name="camera-outline" size={16} color={theme.onPrimary} />
            </Pressable>
            {uri && onRemove ? (
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={removeAccessibilityLabel}
                    disabled={disabled}
                    onPress={onRemove}
                    style={[styles.actionBadge, styles.removeBadge, { backgroundColor: theme.primary }]}
                >
                    <MaterialCommunityIcons name="trash-can-outline" size={17} color={theme.onPrimary} />
                </Pressable>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        width: 96,
        height: 96,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 48,
    },
    image: { width: 96, height: 96, borderRadius: 48 },
    placeholder: {
        width: 96,
        height: 96,
        alignItems: 'center',
        justifyContent: 'center',
    },
    actionBadge: {
        position: 'absolute',
        bottom: 0,
        width: 30,
        height: 30,
        borderRadius: 15,
        alignItems: 'center',
        justifyContent: 'center',
    },
    selectBadge: { right: 0 },
    removeBadge: { left: 0 },
});
