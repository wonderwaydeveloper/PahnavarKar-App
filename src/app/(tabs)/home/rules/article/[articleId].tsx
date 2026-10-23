import { useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import {
    LegalBodyCard,
    LegalDescriptionCard,
    LegalDemoNotice,
    LegalEmptyState,
    LegalScreen,
    LegalSearchInput,
    LegalSectionTitle,
} from '@/components/legal/legal-browser';
import { LegalBreadcrumbs } from '@/components/legal/legal-breadcrumbs';
import { parseLegalRouteId } from '@/components/legal/legal-route-utils';
import { matchesLegalSearch, normalizeLegalSearchText } from '@/components/legal/legal-search-utils';
import { ThemedText } from '@/components/themed-text';
import { fetchLegalArticleDetails, fetchLegalBreadcrumbs } from '@/database';
import { useLegalQuery } from '@/hooks/use-legal-query';
import { useTheme } from '@/hooks/use-theme';

export default function LegalArticleScreen() {
    const { articleId: rawArticleId, footnoteId: rawFootnoteId } = useLocalSearchParams<{
        articleId: string;
        footnoteId?: string;
    }>();
    const articleId = parseLegalRouteId(rawArticleId);
    const footnoteId = parseLegalRouteId(rawFootnoteId);
    const [search, setSearch] = useState('');
    const [expandedFootnotes, setExpandedFootnotes] = useState<Record<number, boolean>>({});
    const theme = useTheme();
    const loadArticle = useCallback(async () => {
        if (articleId === null) return Promise.reject(new Error('شناسهٔ ماده معتبر نیست.'));
        const [details, breadcrumbs] = await Promise.all([
            fetchLegalArticleDetails(articleId),
            fetchLegalBreadcrumbs('article', articleId),
        ]);
        return { ...details, breadcrumbs };
    }, [articleId]);
    const { value, loading, error, retry } = useLegalQuery(loadArticle);
    const article = value?.article;
    const hasDemoText = article?.body.startsWith('متن آزمایشی') === true
        || value?.footnotes.some((footnote) => footnote.body.startsWith('متن آزمایشی')) === true;
    const normalizedSearch = normalizeLegalSearchText(search);
    const showArticleBody = article ? matchesLegalSearch(search, article.title, article.body) : false;
    const filteredFootnotes = value?.footnotes.filter((footnote) =>
        matchesLegalSearch(search, footnote.title, footnote.body)
    ) ?? [];
    const hasSearchResults = showArticleBody || filteredFootnotes.length > 0;

    return (
        <LegalScreen loading={loading} error={error} onRetry={retry}>
            {!article ? (
                <LegalEmptyState message="این ماده پیدا نشد." />
            ) : (
                <>
                    <LegalBreadcrumbs items={value.breadcrumbs} />
                    {hasDemoText ? <LegalDemoNotice /> : null}
                    <LegalDescriptionCard>جست‌وجو در متن ماده و تبصره‌های آن</LegalDescriptionCard>
                    <LegalSearchInput
                        value={search}
                        onChangeText={setSearch}
                        placeholder="عبارت موردنظر را جست‌وجو کنید"
                    />
                    {!hasSearchResults ? (
                        <LegalEmptyState message="عبارتی در متن ماده یا تبصره‌های آن پیدا نشد." />
                    ) : null}
                    {showArticleBody ? (
                        <LegalBodyCard>
                            <LegalSectionTitle>متن ماده</LegalSectionTitle>
                            <ThemedText type="body">{article.body}</ThemedText>
                        </LegalBodyCard>
                    ) : null}
                    {filteredFootnotes.length > 0 ? (
                        <View style={styles.footnotes}>
                            <ThemedText type="smallBold" themeColor="textSecondary">تبصره‌ها</ThemedText>
                            {filteredFootnotes.map((footnote) => {
                                const expanded = expandedFootnotes[footnote.id]
                                    ?? (footnote.id === footnoteId || Boolean(normalizedSearch));
                                return (
                                    <View
                                        key={footnote.id}
                                        style={[
                                            styles.footnoteAccordion,
                                            { backgroundColor: theme.surface, borderColor: theme.border },
                                        ]}
                                    >
                                        <Pressable
                                            accessibilityRole="button"
                                            accessibilityLabel={footnote.title}
                                            accessibilityState={{ expanded }}
                                            onPress={() => setExpandedFootnotes((current) => ({
                                                ...current,
                                                [footnote.id]: !expanded,
                                            }))}
                                            style={({ pressed }) => [
                                                styles.footnoteButton,
                                                { backgroundColor: pressed ? theme.surfaceVariant : theme.surface },
                                            ]}
                                        >
                                            <ThemedText type="smallBold" style={{ color: theme.text, flex: 1 }}>
                                                {footnote.title}
                                            </ThemedText>
                                            <MaterialCommunityIcons
                                                name={expanded ? 'chevron-up' : 'chevron-down'}
                                                size={22}
                                                color={theme.primaryText}
                                            />
                                        </Pressable>
                                        {expanded ? (
                                            <View style={[styles.footnoteBody, { borderTopColor: theme.border }]}>
                                                <ThemedText type="body">{footnote.body}</ThemedText>
                                            </View>
                                        ) : null}
                                    </View>
                                );
                            })}
                        </View>
                    ) : null}
                </>
            )}
        </LegalScreen>
    );
}

const styles = StyleSheet.create({
    footnotes: { gap: 8 },
    footnoteAccordion: {
        overflow: 'hidden',
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: 14,
    },
    footnoteButton: {
        minHeight: 56,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 16,
        paddingVertical: 10,
    },
    footnoteBody: {
        padding: 16,
        borderTopWidth: StyleSheet.hairlineWidth,
    },
});
