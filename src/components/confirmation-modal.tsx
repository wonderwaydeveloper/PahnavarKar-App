import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Modal, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface ConfirmationModalProps {
    visible: boolean;
    title: string;
    message: string;
    messageItems?: string[];
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
    messageItems,
    confirmLabel,
    icon,
    busy = false,
    onCancel,
    onConfirm,
}: ConfirmationModalProps) {
    const theme = useTheme();
    const { height } = useWindowDimensions();
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
                    style={[
                        styles.card,
                        {
                            backgroundColor: theme.surface,
                            borderColor: theme.border,
                            maxHeight: height * 0.85,
                        },
                    ]}
                >
                    <View style={styles.header}>
                        <View style={[styles.iconWrap, { backgroundColor: theme.primaryContainer }]}>
                            <MaterialCommunityIcons name={icon} size={24} color={actionColor} />
                        </View>
                        <ThemedText type="largeTitle" style={styles.title}>{title}</ThemedText>
                    </View>
                    <ScrollView
                        style={styles.content}
                        contentContainerStyle={styles.contentContainer}
                        showsVerticalScrollIndicator
                    >
                        <ThemedText type="body" style={[styles.message, { color: theme.textSecondary }]}>
                            {message}
                        </ThemedText>
                        {messageItems?.length ? (
                            <View style={styles.messageItems}>
                                {messageItems.map((item) => (
                                    <View key={item} style={styles.messageItem}>
                                        <View style={[styles.messageItemBullet, { backgroundColor: theme.textSecondary }]} />
                                        <ThemedText type="body" style={[styles.messageItemText, { color: theme.textSecondary }]}>
                                            {item}
                                        </ThemedText>
                                    </View>
                                ))}
                            </View>
                        ) : null}
                    </ScrollView>
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
        maxHeight: '85%',
        borderWidth: 1,
        borderRadius: Radius.lg,
        padding: Spacing.four,
        alignItems: 'center',
        gap: Spacing.two,
        elevation: 8,
    },
    header: {
        width: '100%',
        flexShrink: 0,
        alignItems: 'center',
        gap: Spacing.two,
    },
    content: {
        width: '100%',
        minHeight: 0,
        flexShrink: 1,
    },
    contentContainer: {
        alignItems: 'center',
        gap: Spacing.two,
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
    messageItems: { width: '100%', gap: Spacing.two },
    messageItem: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
    messageItemBullet: { width: 6, height: 6, borderRadius: 3, marginTop: 9 },
    messageItemText: { flex: 1, lineHeight: 24, textAlign: 'auto' },
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
