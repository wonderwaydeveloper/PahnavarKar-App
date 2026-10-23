import { MaterialCommunityIcons } from '@expo/vector-icons';
import { type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppTextInput } from '@/components/app-text';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface LegalScreenProps {
    loading: boolean;
    error: string | null;
    onRetry: () => void;
    children: ReactNode;
}

export function LegalScreen({ loading, error, onRetry, children }: LegalScreenProps) {
    const theme = useTheme();

    return (
        <ThemedView style={styles.screen}>
            <ScrollView
                contentContainerStyle={styles.content}
                showsVerticalScrollIndicator={false}
            >
                {loading ? (
                    <View style={[styles.statusCard, { backgroundColor: theme.surface }]}>
                        <ThemedText type="small" themeColor="textSecondary">در حال دریافت اطلاعات…</ThemedText>
                    </View>
                ) : error ? (
                    <View style={[styles.statusCard, { backgroundColor: theme.surface }]}>
                        <MaterialCommunityIcons name="alert-circle-outline" size={28} color={theme.error} />
                        <ThemedText type="small" style={{ color: theme.text, textAlign: 'center' }}>{error}</ThemedText>
                        <Pressable
                            accessibilityRole="button"
                            onPress={onRetry}
                            style={({ pressed }) => [
                                styles.retryButton,
                                { backgroundColor: pressed ? theme.surfaceVariant : theme.primaryContainer },
                            ]}
                        >
                            <ThemedText type="smallBold" style={{ color: theme.primaryText }}>تلاش دوباره</ThemedText>
                        </Pressable>
                    </View>
                ) : children}
            </ScrollView>
        </ThemedView>
    );
}

interface LegalListRowProps {
    title: string;
    subtitle?: string;
    icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
    onPress: () => void;
    trailingLabel?: string;
}

export function LegalListRow({ title, subtitle, icon, onPress, trailingLabel }: LegalListRowProps) {
    const theme = useTheme();

    return (
        <Pressable
            accessibilityRole="button"
            onPress={onPress}
            style={({ pressed }) => [
                styles.listRow,
                { backgroundColor: pressed ? theme.surfaceVariant : theme.surface },
            ]}
        >
            <View style={[styles.rowIcon, { backgroundColor: theme.primaryContainer }]}>
                <MaterialCommunityIcons name={icon} size={22} color={theme.primaryText} />
            </View>
            <View style={styles.rowText}>
                <ThemedText type="smallBold" style={{ color: theme.text }}>{title}</ThemedText>
                {subtitle ? (
                    <ThemedText type="small" style={{ color: theme.textSecondary, fontSize: 13, lineHeight: 19 }}>
                        {subtitle}
                    </ThemedText>
                ) : null}
            </View>
            {trailingLabel ? (
                <ThemedText type="small" style={{ color: theme.textMuted, fontSize: 12 }}>{trailingLabel}</ThemedText>
            ) : null}
            <MaterialCommunityIcons name="chevron-left" size={22} color={theme.textMuted} />
        </Pressable>
    );
}

export function LegalListCard({ children }: { children: ReactNode }) {
    const theme = useTheme();
    return (
        <View style={[styles.listCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            {children}
        </View>
    );
}

export function LegalEmptyState({ message }: { message: string }) {
    const theme = useTheme();
    return (
        <View style={[styles.statusCard, { backgroundColor: theme.surface }]}>
            <MaterialCommunityIcons name="book-open-page-variant-outline" size={30} color={theme.textMuted} />
            <ThemedText type="smallBold" style={{ color: theme.text, textAlign: 'center' }}>{message}</ThemedText>
        </View>
    );
}

export function LegalSectionTitle({ children }: { children: ReactNode }) {
    const theme = useTheme();
    return <ThemedText type="smallBold" style={[styles.sectionTitle, { color: theme.textSecondary }]}>{children}</ThemedText>;
}

export function LegalDescriptionCard({ children }: { children: ReactNode }) {
    const theme = useTheme();

    return (
        <View style={[styles.descriptionCard, { backgroundColor: theme.primaryContainer, borderColor: theme.border }]}>
            <MaterialCommunityIcons name="information-outline" size={20} color={theme.primaryText} />
            <ThemedText type="small" style={{ color: theme.text, flex: 1 }}>
                {children}
            </ThemedText>
        </View>
    );
}

export function LegalSearchInput({
    value,
    onChangeText,
    placeholder,
}: {
    value: string;
    onChangeText: (value: string) => void;
    placeholder: string;
}) {
    const theme = useTheme();

    return (
        <View
            style={[
                styles.searchInput,
                { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
        >
            <MaterialCommunityIcons name="magnify" size={22} color={theme.textMuted} />
            <AppTextInput
                value={value}
                onChangeText={onChangeText}
                placeholder={placeholder}
                placeholderTextColor={theme.textMuted}
                accessibilityLabel={placeholder}
                returnKeyType="search"
                style={[styles.searchText, { color: theme.text }]}
            />
            {value.length > 0 ? (
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="پاک کردن جست‌وجو"
                    onPress={() => onChangeText('')}
                    hitSlop={8}
                >
                    <MaterialCommunityIcons name="close-circle" size={20} color={theme.textMuted} />
                </Pressable>
            ) : null}
        </View>
    );
}

export function LegalBodyCard({ children }: { children: ReactNode }) {
    const theme = useTheme();
    return <View style={[styles.bodyCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>{children}</View>;
}

export function LegalDemoNotice() {
    const theme = useTheme();
    return (
        <View style={[styles.demoNotice, { backgroundColor: theme.warning + '1A', borderColor: theme.warning + '55' }]}>
            <MaterialCommunityIcons name="information-outline" size={20} color={theme.warning} />
            <ThemedText type="small" style={{ color: theme.text, flex: 1 }}>
                متن‌های این بخش آزمایشی هستند و متن رسمی قوانین نیستند.
            </ThemedText>
        </View>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1 },
    content: {
        flexGrow: 1,
        width: '100%',
        maxWidth: 800,
        alignSelf: 'center',
        paddingHorizontal: Spacing.three,
        paddingTop: Spacing.three,
        paddingBottom: Spacing.five,
        gap: Spacing.three,
    },
    listCard: {
        overflow: 'hidden',
        borderRadius: Radius.md,
        borderWidth: StyleSheet.hairlineWidth,
    },
    listRow: {
        minHeight: 68,
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.two,
        paddingHorizontal: Spacing.three,
        paddingVertical: Spacing.two,
    },
    rowIcon: {
        width: 38,
        height: 38,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    rowText: { flex: 1, minWidth: 0, gap: Spacing.one },
    statusCard: {
        minHeight: 170,
        alignItems: 'center',
        justifyContent: 'center',
        gap: Spacing.two,
        padding: Spacing.four,
        borderRadius: Radius.md,
    },
    retryButton: {
        minHeight: 42,
        justifyContent: 'center',
        paddingHorizontal: Spacing.four,
        borderRadius: 12,
    },
    sectionTitle: { paddingHorizontal: Spacing.one },
    descriptionCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.two,
        paddingHorizontal: Spacing.three,
        paddingVertical: Spacing.three,
        borderRadius: Radius.md,
        borderWidth: StyleSheet.hairlineWidth,
    },
    searchInput: {
        minHeight: 48,
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.two,
        paddingHorizontal: Spacing.three,
        borderRadius: 12,
        borderWidth: StyleSheet.hairlineWidth,
    },
    searchText: {
        flex: 1,
        minWidth: 0,
        paddingVertical: Spacing.two,
        textAlign: 'right',
    },
    bodyCard: {
        padding: Spacing.three,
        borderRadius: Radius.md,
        borderWidth: StyleSheet.hairlineWidth,
        gap: Spacing.two,
    },
    demoNotice: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.two,
        padding: Spacing.three,
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: 14,
    },
});
