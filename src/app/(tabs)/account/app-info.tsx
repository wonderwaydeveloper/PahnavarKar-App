import { ScrollView, StyleSheet, View } from 'react-native';

import appConfig from '@/../app.json';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export default function AppInfoScreen() {
    const theme = useTheme();
    const appVersion = appConfig.expo?.version ?? '1.0.0';

    const appInfo = [
        { label: 'نام برنامه', value: 'پهناور کار' },
        { label: 'نسخه برنامه', value: appVersion },
        { label: 'کاربرد', value: 'محاسبه حقوق و دستمزد' },
    ];

    return (
        <ThemedView style={styles.container}>
            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                <View style={[styles.headerCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                    <ThemedText type="smallBold" style={[styles.headerTitle, { color: theme.text }]}>اطلاعات برنامه</ThemedText>
                    <ThemedText type="small" style={[styles.headerDescription, { color: theme.textSecondary }]}>
                        نسخه و اطلاعات اصلی پهناور کار را در این بخش مشاهده کنید.
                    </ThemedText>
                </View>

                <View style={[styles.infoCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                    {appInfo.map((item, index) => (
                        <View
                            key={item.label}
                            style={[
                                styles.infoRow,
                                index !== 0 && styles.infoRowSeparated,
                                { borderTopColor: theme.border },
                            ]}
                        >
                            <ThemedText type="small" style={[styles.infoLabel, { color: theme.textSecondary }]}>
                                {item.label}
                            </ThemedText>
                            <ThemedText type="smallBold" style={[styles.infoValue, { color: theme.text }]}>
                                {item.value}
                            </ThemedText>
                        </View>
                    ))}
                </View>
            </ScrollView>
        </ThemedView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    scrollContent: { flexGrow: 1, padding: Spacing.four, gap: Spacing.three },
    headerCard: {
        borderRadius: Radius.md,
        borderWidth: 1,
        padding: Spacing.three,
        gap: Spacing.two,
    },
    headerTitle: {
        fontSize: 14,
        lineHeight: 20,
    },
    headerDescription: {
        lineHeight: 20,
    },
    infoCard: {
        borderRadius: Radius.md,
        borderWidth: 1,
        paddingHorizontal: Spacing.three,
        paddingVertical: Spacing.one,
    },
    infoRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: Spacing.three,
    },
    infoRowSeparated: {
        borderTopWidth: 1,
    },
    infoLabel: {},
    infoValue: {},
});
