import { Typography } from '@/constants/typography';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const aboutSections: {
    title: string;
    description: string;
    icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
    label: string;
}[] = [
    {
        title: 'ابزارهای محاسباتی حقوق و کار',
        description: 'ابزارهایی برای برآورد حقوق پایه، مزایا، اضافه‌کاری، عیدی، سنوات، مرخصی، بیمه و برخی دیگر از موضوعات مرتبط با کار.',
        icon: 'calculator-variant-outline',
        label: 'محاسبه',
    },
    {
        title: 'اطلاعات مزدی و مبانی محاسبه',
        description: 'اطلاعات مصوبات مزدی از سال ۱۳۶۹ تاکنون در کنار ابزارهایی قرار گرفته که بر اساس داده‌های ورودی و مبانی مرتبط، نتیجهٔ محاسبه را نمایش می‌دهند.',
        icon: 'book-open-page-variant-outline',
        label: 'اطلاعات',
    },
    {
        title: 'قوانین و مقررات',
        description: 'کتابخانهٔ قوانین و مقررات مرتبط با کار و تأمین اجتماعی، همراه با امکان مرور دسته‌بندی‌ها و جست‌وجوی متن قوانین؛ دسترسی به این بخش به قابلیت پلن وابسته است.',
        icon: 'scale-balance',
        label: 'کتابخانهٔ قوانین',
    },
    {
        title: 'امکانات حساب کاربری',
        description: 'در کنار ابزارها، برنامه امکان مدیریت اشتراک، مشاهدهٔ سوابق مالی و اعلان‌های حساب، و استفاده از کیف پول برای پرداخت‌های پشتیبانی‌شده را فراهم می‌کند.',
        icon: 'account-cog-outline',
        label: 'امکانات',
    },
];

export default function AboutUsScreen() {
    const theme = useTheme();

    return (
        <ThemedView style={styles.container}>
            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                <View style={[styles.introCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                    <View style={styles.brandRow}>
                        <Image
                            source={require('@/assets/images/logo-white.png')}
                            contentFit="contain"
                            allowDownscaling={false}
                            style={[styles.logo, { backgroundColor: theme.primary }]}
                        />
                        <View style={styles.brandCopy}>
                            <ThemedText type="smallBold" style={{ color: theme.text }}>پهناور کار</ThemedText>
                            <ThemedText type="small" style={{ color: theme.textSecondary }}>دربارهٔ ما</ThemedText>
                        </View>
                        <MaterialCommunityIcons name="briefcase-outline" size={21} color={theme.primaryText} />
                    </View>
                    <ThemedText type="largeTitle" style={[styles.introTitle, { color: theme.text }]}>
                        ابزارهای محاسباتی حقوق و دستمزد، همراه با اطلاعات مزدی
                    </ThemedText>
                    <ThemedText type="body" style={[styles.introDescription, { color: theme.textSecondary }]}>
                        پهناور کار مجموعه‌ای از ابزارهای محاسباتی مرتبط با حقوق و مزایا، اطلاعات مصوبات مزدی و امکانات حساب کاربری را در یک برنامه گرد هم آورده است.
                    </ThemedText>
                    <View style={[styles.introTag, { backgroundColor: theme.primary }]}>
                        <ThemedText type="smallBold" style={{ color: theme.onPrimary }}>
                            محاسبات و اطلاعات حوزهٔ کار
                        </ThemedText>
                    </View>
                </View>

                <View style={styles.timeline}>
                    {aboutSections.map((section, index) => {
                        const isLast = index === aboutSections.length - 1;
                        return (
                            <View key={section.title} style={styles.timelineEntry}>
                                <View style={styles.rail}>
                                    <View style={[styles.marker, { backgroundColor: theme.primary, borderColor: theme.primary }]}>
                                        <MaterialCommunityIcons name={section.icon} size={19} color={theme.onPrimary} />
                                    </View>
                                    {!isLast ? <View style={[styles.connector, { backgroundColor: theme.border }]} /> : null}
                                </View>
                                <View style={[styles.sectionCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                                    <View style={styles.sectionHeading}>
                                        <ThemedText type="small" style={{ color: theme.primaryText }}>{section.label}</ThemedText>
                                        <ThemedText type="bodyBold" style={{ color: theme.text }}>{section.title}</ThemedText>
                                    </View>
                                    <ThemedText type="body" style={[styles.sectionDescription, { color: theme.textSecondary }]}>
                                        {section.description}
                                    </ThemedText>
                                </View>
                            </View>
                        );
                    })}
                </View>
            </ScrollView>
        </ThemedView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    content: { padding: Spacing.three, paddingBottom: Spacing.five, gap: Spacing.four },
    introCard: {
        borderWidth: 1,
        borderRadius: Radius.lg,
        padding: Spacing.three,
        gap: Spacing.two,
    },
    brandRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.two,
    },
    logo: {
        width: 48,
        height: 48,
        borderRadius: 16,
    },
    brandCopy: { flex: 1, gap: 2 },
    introTitle: { marginTop: Spacing.one },
    introDescription: { lineHeight: Typography.lineHeight.spacious },
    introTag: {
        alignSelf: 'flex-start',
        borderRadius: 999,
        paddingHorizontal: Spacing.two,
        paddingVertical: Spacing.one,
        marginTop: Spacing.one,
    },
    timeline: { gap: 0 },
    timelineEntry: {
        flexDirection: 'row',
        alignItems: 'stretch',
        gap: Spacing.two,
    },
    rail: {
        width: 38,
        alignItems: 'center',
    },
    marker: {
        width: 38,
        height: 38,
        borderRadius: 19,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    connector: {
        width: 2,
        flex: 1,
        minHeight: Spacing.two,
    },
    sectionCard: {
        flex: 1,
        borderWidth: 1,
        borderRadius: Radius.lg,
        padding: Spacing.three,
        marginBottom: Spacing.two,
        gap: Spacing.two,
    },
    sectionHeading: { gap: Spacing.one },
    sectionDescription: { lineHeight: Typography.lineHeight.spacious },
});
