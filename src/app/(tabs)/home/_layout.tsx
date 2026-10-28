import { Stack, usePathname, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

import { AppHeader } from '@/components/app-header';
import { ErrorState } from '@/components/error-state';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { usePlanAccess } from '@/hooks/use-plan-access';
import { useTheme } from '@/hooks/use-theme';
import { hasPlanFeature } from '@/utils/plan-access';

export default function HomeLayout() {
    const pathname = usePathname();
    const router = useRouter();
    const theme = useTheme();
    const { planAccess, isLoading, error, refresh } = usePlanAccess();
    const isLegalRoute = pathname.includes('/rules/');

    if (isLegalRoute && isLoading) {
        return (
            <ThemedView style={styles.accessScreen}>
                <ActivityIndicator color={theme.primary} />
                <ThemedText type="small" themeColor="textSecondary">در حال بررسی دسترسی پلن…</ThemedText>
            </ThemedView>
        );
    }

    if (isLegalRoute && error) {
        return (
            <ErrorState title="بررسی دسترسی انجام نشد" message={error} onRetry={() => void refresh()} />
        );
    }

    if (isLegalRoute && !isLoading && !planAccess) {
        return (
            <ErrorState
                title="بررسی دسترسی ممکن نیست"
                message="اطلاعات دسترسی قوانین و مقررات در دسترس نیست. لطفاً دوباره تلاش کنید."
                onRetry={() => void refresh()}
            />
        );
    }

    if (isLegalRoute && !hasPlanFeature(planAccess, 'legal_library')) {
        return (
            <ThemedView style={styles.accessScreen}>
                <ThemedText type="small" style={styles.message}>دسترسی به قوانین و مقررات در پلن فعلی فعال نیست.</ThemedText>
                <Pressable onPress={() => router.back()} accessibilityRole="button">
                    <ThemedText type="smallBold" themeColor="primaryText">بازگشت</ThemedText>
                </Pressable>
            </ThemedView>
        );
    }

    return (
        <Stack
            screenOptions={({ route }) => ({
                header: () => <AppHeader route={route} />,
                headerShown: true,
            })}
        >
            <Stack.Screen name="index" options={{ title: 'خانه' }} />
        </Stack>
    );
}

const styles = StyleSheet.create({
    accessScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
    message: { textAlign: 'center' },
});
