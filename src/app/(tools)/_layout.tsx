import { Stack, usePathname, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { AppHeader } from '@/components/app-header';
import { ErrorState } from '@/components/error-state';
import { ThemedText } from '@/components/themed-text';
import { TOOL_DEFINITIONS } from '@/constants/tool-definitions';
import { getToolRoute } from '@/constants/tool-routes';
import { usePlanAccess } from '@/hooks/use-plan-access';
import { useTheme } from '@/hooks/use-theme';
import { hasPlanFeature } from '@/utils/plan-access';

function getRequiredFeature(pathname: string): string | null {
    const normalizedPath = pathname.replace(/\/+$/, '') || '/';
    if (normalizedPath === '/group-calculation') {
        return 'group-calculation';
    }

    return TOOL_DEFINITIONS.find((tool) => getToolRoute(tool.route) === normalizedPath)?.key ?? null;
}

function PlanAccessScreen({ message, onRetry, onBack, loading = false }: {
    message: string;
    onRetry?: () => void;
    onBack?: () => void;
    loading?: boolean;
}) {
    const theme = useTheme();

    return (
        <View style={[styles.accessScreen, { backgroundColor: theme.background }]}>
            {loading ? <ActivityIndicator color={theme.primary} /> : null}
            <ThemedText type="small" style={{ color: theme.text, textAlign: 'center' }}>{message}</ThemedText>
            {onRetry ? (
                <Pressable onPress={onRetry} accessibilityRole="button">
                    <ThemedText type="smallBold" themeColor="primaryText">تلاش دوباره</ThemedText>
                </Pressable>
            ) : null}
            {onBack ? (
                <Pressable onPress={onBack} accessibilityRole="button">
                    <ThemedText type="smallBold" themeColor="primaryText">بازگشت</ThemedText>
                </Pressable>
            ) : null}
        </View>
    );
}

export default function ToolsLayout() {
    const pathname = usePathname();
    const router = useRouter();
    const { planAccess, isLoading, error, refresh } = usePlanAccess();
    const featureKey = getRequiredFeature(pathname);
    const hasAccess = featureKey !== null && hasPlanFeature(planAccess, featureKey);

    useEffect(() => {
        if (featureKey === null) {
            console.error('ابزار بدون نگاشت feature مسدود شد.', { pathname });
            return;
        }
        if (!isLoading && !error && planAccess && typeof planAccess.features[featureKey] !== 'boolean') {
            console.error('قابلیت ابزار در پاسخ entitlement تعریف نشده است.', { pathname, featureKey });
        }
    }, [error, featureKey, isLoading, pathname, planAccess]);

    if (featureKey === null) {
        return (
            <ErrorState
                title="این ابزار در دسترس نیست"
                message="مسیر این ابزار به قابلیت پلن متصل نشده است. لطفاً به صفحهٔ قبل بازگردید."
                onRetry={() => router.back()}
                retryLabel="بازگشت"
            />
        );
    }

    if (isLoading) {
        return <PlanAccessScreen message="در حال بررسی دسترسی پلن…" loading />;
    }

    if (error) {
        return <ErrorState title="بررسی دسترسی انجام نشد" message={error} onRetry={() => void refresh()} />;
    }

    if (typeof planAccess?.features[featureKey] !== 'boolean') {
        return (
            <ErrorState
                title="بررسی دسترسی ممکن نیست"
                message="اطلاعات دسترسی این ابزار در پلن فعلی موجود نیست. لطفاً بعداً دوباره تلاش کنید."
                onRetry={() => void refresh()}
            />
        );
    }

    if (!hasAccess) {
        return <PlanAccessScreen message="دسترسی به این ابزار در پلن فعلی فعال نیست." onBack={() => router.back()} />;
    }

    return (
        <Stack
            screenOptions={({ route }) => ({
                header: () => <AppHeader route={route} />,
                headerShown: true,
            })}
        />
    );
}

const styles = StyleSheet.create({
    accessScreen: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        padding: 24,
    },
});
