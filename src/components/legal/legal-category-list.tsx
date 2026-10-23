import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, View } from 'react-native';

import { LegalEmptyState, LegalListCard, LegalListRow } from '@/components/legal/legal-browser';
import { getLegalRouteHref } from '@/components/legal/legal-route-utils';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { fetchLegalCategories } from '@/database';
import { useLegalQuery } from '@/hooks/use-legal-query';
import { useTheme } from '@/hooks/use-theme';

export function LegalCategoryList() {
    const router = useRouter();
    const theme = useTheme();
    const loadCategories = useCallback(() => fetchLegalCategories(), []);
    const { value: categories, loading, error, retry } = useLegalQuery(loadCategories);

    if (loading) {
        return <LegalEmptyState message="در حال دریافت دسته‌های قوانین و مقررات…" />;
    }

    if (error) {
        return (
            <View style={{ alignItems: 'center', gap: Spacing.two, padding: Spacing.four }}>
                <ThemedText type="small" themeColor="error" style={{ textAlign: 'center' }}>{error}</ThemedText>
                <Pressable onPress={retry} accessibilityRole="button" style={{ padding: Spacing.two }}>
                    <ThemedText type="smallBold" themeColor="primaryText">تلاش دوباره</ThemedText>
                </Pressable>
            </View>
        );
    }

    return (
        !categories?.length ? (
            <LegalEmptyState message="دسته‌ای برای نمایش ثبت نشده است." />
        ) : (
            <LegalListCard>
                {categories.map((category, index) => (
                    <View key={category.id}>
                        <LegalListRow
                            title={category.title}
                            subtitle={category.legal_title_count > 0
                                ? `${category.legal_title_count} عنوان قانونی`
                                : 'هنوز عنوانی برای این دسته ثبت نشده است'}
                            icon="folder-text-outline"
                            trailingLabel={category.legal_title_count > 0 ? String(category.legal_title_count) : undefined}
                            onPress={() => router.push(getLegalRouteHref('category', category.id, category.title) as never)}
                        />
                        {index < categories.length - 1 ? (
                            <View style={{ height: 1, marginStart: 68, backgroundColor: theme.border }} />
                        ) : null}
                    </View>
                ))}
            </LegalListCard>
        )
    );
}
