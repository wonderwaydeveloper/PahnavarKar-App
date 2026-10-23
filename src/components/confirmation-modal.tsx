import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface ConfirmationModalProps {
    visible: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
    busy?: boolean;
    onCancel: () => void;
    onConfirm: () => void | Promise<void>;
}

export function ConfirmationModal({
    visible,
    title,
    message,
    confirmLabel,
    icon,
    busy = false,
    onCancel,
    onConfirm,
}: ConfirmationModalProps) {
    const theme = useTheme();
    const actionColor = theme.primary;
    const actionTextColor = theme.onPrimary;

    return (
        <Modal
            animationType="fade"
            onRequestClose={() => {
                if (!busy) onCancel();
            }}
            statusBarTranslucent
            transparent
            visible={visible}
        >
            <View style={styles.overlay}>
                <Pressable
                    accessibilityLabel="بستن پنجرهٔ تأیید"
                    accessibilityRole="button"
                    disabled={busy}
                    onPress={onCancel}
                    style={StyleSheet.absoluteFill}
                />
                <View
                    accessibilityViewIsModal
                    style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}
                >
                    <View style={[styles.iconWrap, { backgroundColor: theme.primaryContainer }]}>
                        <MaterialCommunityIcons name={icon} size={24} color={actionColor} />
                    </View>
                    <ThemedText type="largeTitle" style={styles.title}>{title}</ThemedText>
                    <ThemedText type="body" style={[styles.message, { color: theme.textSecondary }]}>
                        {message}
                    </ThemedText>
                    <View style={styles.actions}>
                        <Pressable
                            accessibilityRole="button"
                            disabled={busy}
                            onPress={onCancel}
                            style={({ pressed }) => [
                                styles.button,
                                styles.cancelButton,
                                {
                                    borderColor: theme.border,
                                    opacity: pressed || busy ? 0.72 : 1,
                                },
                            ]}
                        >
                            <ThemedText type="smallBold" style={{ color: theme.text }}>انصراف</ThemedText>
                        </Pressable>
                        <Pressable
                            accessibilityRole="button"
                            disabled={busy}
                            onPress={() => void onConfirm()}
                            style={({ pressed }) => [
                                styles.button,
                                {
                                    backgroundColor: actionColor,
                                    opacity: pressed || busy ? 0.72 : 1,
                                },
                            ]}
                        >
                            <ThemedText type="smallBold" style={{ color: actionTextColor }}>
                                {busy ? 'در حال انجام...' : confirmLabel}
                            </ThemedText>
                        </Pressable>
                    </View>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.52)',
        alignItems: 'center',
        justifyContent: 'center',
        padding: Spacing.four,
    },
    card: {
        width: '100%',
        maxWidth: 420,
        borderWidth: 1,
        borderRadius: Radius.lg,
        padding: Spacing.four,
        alignItems: 'center',
        gap: Spacing.two,
        elevation: 8,
    },
    iconWrap: {
        width: 52,
        height: 52,
        borderRadius: 26,
        alignItems: 'center',
        justifyContent: 'center',
    },
    title: { textAlign: 'center' },
    message: { textAlign: 'center', lineHeight: 24 },
    actions: { width: '100%', flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.two },
    button: {
        flex: 1,
        minHeight: 48,
        borderRadius: Radius.md,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: Spacing.two,
    },
    cancelButton: { borderWidth: 1 },
});
