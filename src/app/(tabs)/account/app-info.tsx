import { Typography } from '@/constants/typography';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { ScrollView, StyleSheet, View } from 'react-native';

import appConfig from '@/../app.json';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const appInfo: {
    label: string;
    value: string;
    icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
}[] = [
    { label: 'نام برنامه', value: 'پهناور کار', icon: 'application-outline' },
    { label: 'نسخه برنامه', value: appConfig.expo?.version ?? '1.0.0', icon: 'tag-outline' },
    { label: 'کاربرد', value: 'محاسبه حقوق و دستمزد', icon: 'calculator-variant-outline' },
];

export default function AppInfoScreen() {
    const theme = useTheme();

    return (
        <ThemedView style={styles.container}>
            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                <View style={[styles.introCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                    <Image
                        source={require('@/assets/images/logo-white.png')}
                        contentFit="contain"
                        allowDownscaling={false}
                        style={[styles.logo, { backgroundColor: theme.primary }]}
                    />
                    <ThemedText type="largeTitle" style={{ color: theme.text }}>پهناور کار</ThemedText>
                    <ThemedText type="small" style={[styles.introDescription, { color: theme.textSecondary }]}>
                        اطلاعات نسخه و کاربرد برنامه
                    </ThemedText>
                </View>

                <View style={[styles.infoCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                    {appInfo.map((item, index) => (
                        <View
                            key={item.label}
                            style={[
                                styles.infoRow,
                                index > 0 && styles.infoRowSeparated,
                                { borderTopColor: theme.border },
                            ]}
                        >
                            <View style={[styles.infoIcon, { backgroundColor: theme.primary }]}>
                                <MaterialCommunityIcons name={item.icon} size={19} color={theme.onPrimary} />
                            </View>
                            <View style={styles.infoCopy}>
                                <ThemedText type="small" style={{ color: theme.textSecondary }}>
                                    {item.label}
                                </ThemedText>
                                <ThemedText type="bodyBold" style={styles.infoValue}>
                                    {item.value}
                                </ThemedText>
                            </View>
                        </View>
                    ))}
                </View>
            </ScrollView>
        </ThemedView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    content: { flexGrow: 1, padding: Spacing.three, paddingBottom: Spacing.five, gap: Spacing.three },
    introCard: {
        alignItems: 'center',
        borderWidth: 1,
        borderRadius: Radius.lg,
        padding: Spacing.four,
        gap: Spacing.one,
    },
    logo: {
        width: 64,
        height: 64,
        borderRadius: 20,
        marginBottom: Spacing.one,
    },
    introDescription: { lineHeight: Typography.lineHeight.body, textAlign: 'center' },
    infoCard: {
        borderWidth: 1,
        borderRadius: Radius.lg,
        paddingHorizontal: Spacing.three,
    },
    infoRow: {
        minHeight: 76,
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.two,
        paddingVertical: Spacing.two,
    },
    infoRowSeparated: { borderTopWidth: StyleSheet.hairlineWidth },
    infoIcon: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    infoCopy: { flex: 1, gap: 2 },
    infoValue: { textAlign: 'left' },
});
