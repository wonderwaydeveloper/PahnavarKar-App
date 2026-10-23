import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, SectionList, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppHeader } from '@/components/app-header';
import { AppTextInput } from '@/components/app-text';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ToolListItem } from '@/components/tool-list-item';
import { Spacing } from '@/constants/theme';
import { TOOL_DEFINITIONS, type ToolDefinition } from '@/constants/tool-definitions';
import { getToolRoute } from '@/constants/tool-routes';
import { getLegalRouteHref } from '@/components/legal/legal-route-utils';
import type { LegalSearchResult } from '@/database';
import { searchLegalContent } from '@/database';
import { useTheme } from '@/hooks/use-theme';

type SearchAction = ToolDefinition & {
    searchText: string;
    titleSearchText: string;
    detailSearchText: string;
};

type SearchScope = 'all' | 'calculations' | 'laws';

type SearchRow =
    | { kind: 'calculation'; key: string; action: SearchAction }
    | { kind: 'legal'; key: string; result: LegalSearchResult };

type SearchSection = {
    key: 'calculations' | 'laws';
    title: string;
    data: SearchRow[];
};

const persianDigits = '۰۱۲۳۴۵۶۷۸۹';
const latinDigits = '0123456789';
const SEARCH_DEBOUNCE_MS = 300;
const ARABIC_DIACRITICS_PATTERN = /[\u064B-\u065F\u0670\u06D6-\u06ED]/g;
const SEARCH_WHITESPACE_PATTERN = /[\u200C\s]+/g;

function normalizeSearchText(value: string) {
    return value
        .normalize('NFKC')
        .toLocaleLowerCase('fa-IR')
        .replace(/[يى]/g, 'ی')
        .replace(/ك/g, 'ک')
        .replace(ARABIC_DIACRITICS_PATTERN, '')
        .replace(/[۰-۹]/g, (digit) => latinDigits[persianDigits.indexOf(digit)])
        .replace(SEARCH_WHITESPACE_PATTERN, ' ')
        .trim();
}

const ACTION_DEFINITIONS: SearchAction[] = TOOL_DEFINITIONS.map((tool) => ({
    ...tool,
    searchText: normalizeSearchText(`${tool.title} ${tool.detail}`),
    titleSearchText: normalizeSearchText(tool.title),
    detailSearchText: normalizeSearchText(tool.detail),
}));

export default function SearchTabScreen() {
    const theme = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const [query, setQuery] = useState('');
    const [debouncedQuery, setDebouncedQuery] = useState('');
    const [scope, setScope] = useState<SearchScope>('all');
    const [legalSearchRetry, setLegalSearchRetry] = useState(0);
    const [legalSearchState, setLegalSearchState] = useState<{
        query: string;
        retry: number;
        results: LegalSearchResult[];
        error: string | null;
    }>({ query: '', retry: -1, results: [], error: null });

    useEffect(() => {
        const timeoutId = setTimeout(() => {
            setDebouncedQuery(query);
        }, SEARCH_DEBOUNCE_MS);

        return () => clearTimeout(timeoutId);
    }, [query]);

    const normalizedQuery = normalizeSearchText(debouncedQuery);
    const hasLegalSearch = normalizedQuery.length > 0 && scope !== 'calculations';

    useEffect(() => {
        let cancelled = false;

        if (!hasLegalSearch) {
            return () => {
                cancelled = true;
            };
        }

        void searchLegalContent(debouncedQuery)
            .then((results) => {
                if (!cancelled) {
                    setLegalSearchState({
                        query: normalizedQuery,
                        retry: legalSearchRetry,
                        results,
                        error: null,
                    });
                }
            })
            .catch((error: unknown) => {
                if (!cancelled) {
                    setLegalSearchState({
                        query: normalizedQuery,
                        retry: legalSearchRetry,
                        results: [],
                        error: error instanceof Error ? error.message : 'جست‌وجو در قوانین با خطا روبه‌رو شد.',
                    });
                }
            });

        return () => {
            cancelled = true;
        };
    }, [debouncedQuery, hasLegalSearch, legalSearchRetry, normalizedQuery]);

    const hasCurrentLegalSearchState = legalSearchState.query === normalizedQuery
        && legalSearchState.retry === legalSearchRetry;
    const legalSearchLoading = hasLegalSearch && !hasCurrentLegalSearchState;
    const legalSearchError = hasLegalSearch && hasCurrentLegalSearchState
        ? legalSearchState.error
        : null;
    const legalResults = useMemo(
        () => hasCurrentLegalSearchState ? legalSearchState.results : [],
        [hasCurrentLegalSearchState, legalSearchState.results]
    );

    const matchingActions = useMemo(() => {
        const matchingActions = ACTION_DEFINITIONS
            .map((action, originalIndex) => {
                if (!normalizedQuery) {
                    return { action, originalIndex, relevance: 0 };
                }

                const titleMatch = action.titleSearchText.indexOf(normalizedQuery);
                const detailMatch = action.detailSearchText.indexOf(normalizedQuery);

                if (titleMatch === -1 && detailMatch === -1) {
                    return null;
                }

                const relevance = titleMatch === 0
                    ? 0
                    : titleMatch > 0
                        ? 1
                        : detailMatch === 0
                            ? 2
                            : 3;

                return { action, originalIndex, relevance };
            })
            .filter((entry): entry is { action: SearchAction; originalIndex: number; relevance: number } => entry !== null)
            .sort((left, right) => left.relevance - right.relevance || left.originalIndex - right.originalIndex)
            .map((entry) => entry.action);

        return matchingActions;
    }, [normalizedQuery]);

    const sections = useMemo<SearchSection[]>(() => {
        const nextSections: SearchSection[] = [];
        const currentLegalResults = hasLegalSearch ? legalResults : [];
        if (scope !== 'laws' && normalizedQuery) {
            nextSections.push({
                key: 'calculations',
                title: 'کارت‌های محاسباتی',
                data: matchingActions.map((action) => ({
                    kind: 'calculation',
                    key: action.key,
                    action,
                })),
            });
        }
        if (scope !== 'calculations' && normalizedQuery && !legalSearchError) {
            nextSections.push({
                key: 'laws',
                title: 'قوانین و مقررات',
                data: currentLegalResults.map((result) => ({
                    kind: 'legal',
                    key: result.key,
                    result,
                })),
            });
        }
        return nextSections;
    }, [hasLegalSearch, legalResults, legalSearchError, matchingActions, normalizedQuery, scope]);

    const handleClearQuery = useCallback(() => {
        setQuery('');
        setDebouncedQuery('');
    }, []);

    const renderSearchBox = useCallback(() => (
        <View style={[styles.searchBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <MaterialCommunityIcons name="magnify" size={21} color={theme.textSecondary} />
            <AppTextInput
                autoFocus
                value={query}
                onChangeText={setQuery}
                placeholder="جستجو"
                placeholderTextColor={theme.textMuted}
                style={[styles.searchInput, { color: theme.text }]}
                returnKeyType="search"
                accessibilityLabel="جست‌وجوی کارت‌های محاسباتی و قوانین"
            />
            {query.length > 0 ? (
                <Pressable onPress={handleClearQuery} accessibilityRole="button" accessibilityLabel="پاک‌کردن جست‌وجو" hitSlop={8}>
                    <MaterialCommunityIcons name="close-circle" size={19} color={theme.textSecondary} />
                </Pressable>
            ) : null}
        </View>
    ), [handleClearQuery, query, theme.border, theme.surface, theme.text, theme.textMuted, theme.textSecondary]);

    const renderHighlightedText = useCallback((value: string, style: object) => {
        const matchQuery = normalizeSearchText(debouncedQuery);
        const matchIndex = value.toLocaleLowerCase('fa-IR').indexOf(matchQuery);

        if (!matchQuery || matchIndex < 0) {
            return <ThemedText style={style}>{value}</ThemedText>;
        }

        return (
            <ThemedText style={style}>
                {value.slice(0, matchIndex)}
                <ThemedText style={{ color: theme.primaryText, fontFamily: 'AppFont-Bold' }}>
                    {value.slice(matchIndex, matchIndex + matchQuery.length)}
                </ThemedText>
                {value.slice(matchIndex + matchQuery.length)}
            </ThemedText>
        );
    }, [debouncedQuery, theme.primaryText]);

    const renderSearchRow = useCallback(({ item, index, section }: { item: SearchRow; index: number; section: SearchSection }) => {
        if (item.kind === 'calculation') {
            return (
                <ToolListItem
                    tool={item.action}
                    onPress={() => router.push(getToolRoute(item.action.route) as never)}
                    showBottomBorder={index < section.data.length - 1}
                    compactIcon
                    titleContent={renderHighlightedText(item.action.title, {
                        color: theme.text,
                        fontSize: 14,
                        lineHeight: 20,
                        fontFamily: 'AppFont-Bold',
                    })}
                    detailContent={renderHighlightedText(item.action.detail, {
                        color: theme.textSecondary,
                        fontSize: 13,
                        lineHeight: 19,
                        fontFamily: 'AppFont-Regular',
                    })}
                />
            );
        }

        const iconByType: Record<LegalSearchResult['type'], React.ComponentProps<typeof MaterialCommunityIcons>['name']> = {
            category: 'folder-text-outline',
            title: 'file-document-outline',
            chapter: 'bookmark-multiple-outline',
            topic: 'format-list-bulleted',
            article: 'file-document-outline',
            footnote: 'text-box-outline',
        };

        return (
            <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${item.result.title}، ${item.result.subtitle}`}
                onPress={() => router.push(getLegalRouteHref(
                    item.result.routeType,
                    item.result.routeId,
                    item.result.routeTitle,
                    item.result.footnoteId ?? undefined
                ) as never)}
                style={({ pressed }) => [
                    styles.legalResult,
                    {
                        backgroundColor: pressed ? theme.surfaceVariant : theme.surface,
                        borderBottomColor: theme.border,
                    },
                    index < section.data.length - 1 && styles.withBottomBorder,
                ]}
            >
                <View style={[styles.legalResultIcon, { backgroundColor: theme.primaryContainer }]}>
                    <MaterialCommunityIcons name={iconByType[item.result.type]} size={22} color={theme.primaryText} />
                </View>
                <View style={styles.legalResultText}>
                    <ThemedText type="smallBold" style={{ color: theme.text }}>{item.result.title}</ThemedText>
                    <ThemedText type="small" style={{ color: theme.textSecondary, fontSize: 13, lineHeight: 19 }}>
                        {item.result.subtitle}
                    </ThemedText>
                </View>
                <MaterialCommunityIcons name="chevron-left" size={22} color={theme.textMuted} />
            </Pressable>
        );
    }, [renderHighlightedText, router, theme.primaryContainer, theme.primaryText, theme.surface, theme.surfaceVariant, theme.text, theme.textSecondary, theme.textMuted, theme.border]);

    const renderSectionHeader = useCallback(({ section }: { section: SearchSection }) => (
        section.data.length > 0 ? (
            <View style={[styles.sectionHeader, { backgroundColor: theme.background }]}>
                <ThemedText type="smallBold" themeColor="textSecondary">{section.title}</ThemedText>
            </View>
        ) : null
    ), [theme.background]);

    const filterBar = useMemo(() => {
        const filters: { key: SearchScope; title: string }[] = [
            { key: 'all', title: 'همه' },
            { key: 'calculations', title: 'کارت‌های محاسباتی' },
            { key: 'laws', title: 'قوانین و مقررات' },
        ];

        return (
            <View style={styles.listHeader}>
                <View style={styles.filterBar}>
                {filters.map((filter) => {
                        const selected = scope === filter.key;
                        return (
                            <Pressable
                                key={filter.key}
                                accessibilityRole="button"
                                accessibilityState={{ selected }}
                                onPress={() => setScope(filter.key)}
                                style={[
                                    styles.filterChip,
                                    {
                                        backgroundColor: selected ? theme.primaryContainer : theme.surface,
                                        borderColor: selected ? theme.primary : theme.border,
                                    },
                                ]}
                            >
                                <ThemedText
                                    type={selected ? 'smallBold' : 'small'}
                                    style={{ color: selected ? theme.primaryText : theme.textSecondary }}
                                >
                                    {filter.title}
                                </ThemedText>
                            </Pressable>
                        );
                    })}
                </View>
                {legalSearchLoading && hasLegalSearch ? (
                    <ThemedText type="small" themeColor="textSecondary" style={styles.searchStatus}>
                        در حال جست‌وجو در قوانین و مقررات…
                    </ThemedText>
                ) : legalSearchError ? (
                    <View style={styles.searchError}>
                        <ThemedText type="small" themeColor="error" style={{ flex: 1 }}>{legalSearchError}</ThemedText>
                        <Pressable
                            accessibilityRole="button"
                            onPress={() => setLegalSearchRetry((retry) => retry + 1)}
                        >
                            <ThemedText type="smallBold" themeColor="primaryText">تلاش دوباره</ThemedText>
                        </Pressable>
                    </View>
                ) : null}
            </View>
        );
    }, [hasLegalSearch, legalSearchError, legalSearchLoading, scope, theme.border, theme.primary, theme.primaryContainer, theme.primaryText, theme.surface, theme.textSecondary]);

    const emptyState = useMemo(() => (
        <View style={[styles.emptyState, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <MaterialCommunityIcons name="text-search" size={28} color={theme.textMuted} />
            <ThemedText type="smallBold">
                {legalSearchLoading && scope === 'laws'
                    ? 'در حال جست‌وجو در قوانین و مقررات…'
                    : !normalizedQuery
                        ? 'عبارتی برای جست‌وجو وارد کنید'
                        : scope === 'laws'
                        ? 'موردی در قوانین و مقررات پیدا نشد'
                        : scope === 'calculations'
                            ? 'کارت محاسباتی پیدا نشد'
                            : 'نتیجه‌ای پیدا نشد'}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
                {!normalizedQuery
                    ? scope === 'laws'
                        ? 'نام قانون، ماده یا عبارت موردنظر را بنویسید.'
                        : scope === 'calculations'
                            ? 'نام کارت محاسباتی موردنظر را بنویسید.'
                            : 'برای جست‌وجوی کارت‌های محاسباتی یا قوانین، عبارت موردنظر را بنویسید.'
                    : 'عبارت دیگری را جست‌وجو کنید.'}
            </ThemedText>
        </View>
    ), [legalSearchLoading, normalizedQuery, scope, theme.border, theme.surface, theme.textMuted]);

    return (
        <ThemedView style={styles.container}>
            <AppHeader centerContent={renderSearchBox()} />
            {filterBar}
            <SectionList
                style={styles.resultsList}
                sections={sections}
                keyExtractor={(item) => item.key}
                renderItem={renderSearchRow}
                renderSectionHeader={renderSectionHeader}
                ListEmptyComponent={emptyState}
                ListFooterComponent={scope === 'all' && normalizedQuery && !legalSearchLoading
                    && !legalSearchError && legalResults.length === 0 ? (
                    <View style={styles.loadingFooter}>
                        <ThemedText type="small" themeColor="textSecondary">در قوانین و مقررات نتیجه‌ای پیدا نشد.</ThemedText>
                    </View>
                ) : null}
                contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.four }]}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                showsVerticalScrollIndicator={false}
                stickySectionHeadersEnabled={false}
                initialNumToRender={12}
                maxToRenderPerBatch={12}
                windowSize={5}
            />
        </ThemedView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    resultsList: { flex: 1 },
    content: { flexGrow: 1 },
    searchBox: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.two, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth },
    searchInput: { flex: 1, minHeight: 42, paddingVertical: 0, fontFamily: 'AppFont-Regular', fontSize: 15, textAlign: 'right' },
    listHeader: { gap: Spacing.two },
    filterBar: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, paddingHorizontal: Spacing.three, paddingTop: Spacing.three, paddingBottom: Spacing.two },
    filterChip: { minHeight: 38, justifyContent: 'center', paddingHorizontal: Spacing.three, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth },
    searchStatus: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.one },
    searchError: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.three, paddingBottom: Spacing.one },
    sectionHeader: { paddingHorizontal: Spacing.three, paddingTop: Spacing.three, paddingBottom: Spacing.two },
    legalResult: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
    legalResultIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    legalResultText: { flex: 1, minWidth: 0, gap: Spacing.one },
    withBottomBorder: { borderBottomWidth: StyleSheet.hairlineWidth },
    loadingFooter: { alignItems: 'center', padding: Spacing.three },
    emptyState: { flex: 1, minHeight: 180, alignItems: 'center', justifyContent: 'center', gap: Spacing.one, padding: Spacing.four, borderRadius: 16, borderWidth: 1 },
});
