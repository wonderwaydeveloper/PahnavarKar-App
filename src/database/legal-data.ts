import type { SQLiteBindValue } from 'expo-sqlite';

import { runWithDatabaseLock } from './connection';
import { initDatabase } from './db';
import { normalizeSearchText } from '@/utils/search-text';

export interface LegalCategory {
    id: number;
    title: string;
    sort_order: number;
    legal_title_count: number;
}

export interface LegalTitle {
    id: number;
    title: string;
    sort_order: number;
    chapter_count: number;
    article_count: number;
}

export interface LegalChapter {
    id: number;
    legal_title_id: number;
    title: string;
    sort_order: number;
    topic_count: number;
    article_count: number;
}

export interface LegalTopic {
    id: number;
    chapter_id: number;
    title: string;
    sort_order: number;
    article_count: number;
}

export interface LegalArticle {
    id: number;
    legal_title_id: number;
    chapter_id: number | null;
    topic_id: number | null;
    title: string;
    body: string;
    sort_order: number;
    footnote_count: number;
}

export interface LegalFootnote {
    id: number;
    article_id: number;
    title: string;
    body: string;
    sort_order: number;
}

export type LegalBreadcrumbType = 'category' | 'title' | 'chapter' | 'topic' | 'article';

export interface LegalBreadcrumbItem {
    type: LegalBreadcrumbType;
    id: number;
    title: string;
}

export type LegalSearchResultType = LegalBreadcrumbType | 'footnote';

export interface LegalSearchResult {
    key: string;
    type: LegalSearchResultType;
    title: string;
    subtitle: string;
    routeType: LegalBreadcrumbType;
    routeId: number;
    routeTitle: string;
    footnoteId: number | null;
}

interface LegalCategorySeed {
    id: number;
    title: string;
    sort_order: number;
}

interface LegalTitleSeed {
    id: number;
    regulation_category_id: number;
    title: string;
    sort_order: number;
}

interface LegalChapterSeed {
    id: number;
    legal_title_id: number;
    title: string;
    sort_order: number;
}

interface LegalTopicSeed {
    id: number;
    chapter_id: number;
    title: string;
    sort_order: number;
}

interface LegalArticleSeed {
    id: number;
    legal_title_id: number;
    chapter_id: number | null;
    topic_id: number | null;
    title: string;
    body: string;
    sort_order: number;
}

interface LegalFootnoteSeed {
    id: number;
    article_id: number;
    title: string;
    body: string;
    sort_order: number;
}

interface LegalTitleContents {
    title: LegalTitle | null;
    chapters: LegalChapter[];
    directArticles: LegalArticle[];
}

interface LegalChapterContents {
    chapter: LegalChapter | null;
    topics: LegalTopic[];
    articles: LegalArticle[];
}

interface LegalArticleDetails {
    article: LegalArticle | null;
    legalTitle: string | null;
    chapter: string | null;
    topic: string | null;
    footnotes: LegalFootnote[];
}

interface LegalBreadcrumbRow {
    category_id?: number | null;
    category_title?: string | null;
    title_id?: number | null;
    title_title?: string | null;
    chapter_id?: number | null;
    chapter_title?: string | null;
    topic_id?: number | null;
    topic_title?: string | null;
    article_id?: number | null;
    article_title?: string | null;
}

interface LegalSearchRow {
    id: number;
    title: string;
    subtitle: string;
    route_id: number;
    route_title: string;
    footnote_id: number | null;
    type: LegalSearchResultType;
    route_type: LegalBreadcrumbType;
}

const LEGAL_DATA_SEED = 'seed_001_legal_json_fixtures';

function loadLegalSeedData() {
    return {
        categories: require('../../assets/data-source/legal/regulation-categories.json') as LegalCategorySeed[],
        titles: require('../../assets/data-source/legal/legal-titles.json') as LegalTitleSeed[],
        chapters: require('../../assets/data-source/legal/legal-chapters.json') as LegalChapterSeed[],
        topics: require('../../assets/data-source/legal/legal-topics.json') as LegalTopicSeed[],
        articles: require('../../assets/data-source/legal/legal-articles.json') as LegalArticleSeed[],
        footnotes: require('../../assets/data-source/legal/legal-footnotes.json') as LegalFootnoteSeed[],
    };
}

async function seedLegalDataIfNeeded(): Promise<void> {
    await runWithDatabaseLock(async (database) => {
        const seedMarker = await database.getFirstAsync<{ migration_id: string }>(
            'SELECT migration_id FROM legal_data_migrations WHERE migration_id = ?;',
            LEGAL_DATA_SEED
        );
        if (seedMarker) return;

        const seedData = loadLegalSeedData();
        await database.execAsync('BEGIN IMMEDIATE;');

        try {
            for (const item of seedData.categories) {
                await database.runAsync(
                    'INSERT INTO regulation_categories (id, title, sort_order) VALUES (?, ?, ?);',
                    item.id,
                    item.title,
                    item.sort_order
                );
            }

            for (const item of seedData.titles) {
                await database.runAsync(
                    'INSERT INTO legal_titles (id, regulation_category_id, title, sort_order) VALUES (?, ?, ?, ?);',
                    item.id,
                    item.regulation_category_id,
                    item.title,
                    item.sort_order
                );
            }

            for (const item of seedData.chapters) {
                await database.runAsync(
                    'INSERT INTO legal_chapters (id, legal_title_id, title, sort_order) VALUES (?, ?, ?, ?);',
                    item.id,
                    item.legal_title_id,
                    item.title,
                    item.sort_order
                );
            }

            for (const item of seedData.topics) {
                await database.runAsync(
                    'INSERT INTO legal_topics (id, chapter_id, title, sort_order) VALUES (?, ?, ?, ?);',
                    item.id,
                    item.chapter_id,
                    item.title,
                    item.sort_order
                );
            }

            for (const item of seedData.articles) {
                await database.runAsync(
                    `INSERT INTO legal_articles (
                        id, legal_title_id, chapter_id, topic_id, title, body, sort_order
                    ) VALUES (?, ?, ?, ?, ?, ?, ?);`,
                    item.id,
                    item.legal_title_id,
                    item.chapter_id,
                    item.topic_id,
                    item.title,
                    item.body,
                    item.sort_order
                );
            }

            for (const item of seedData.footnotes) {
                await database.runAsync(
                    'INSERT INTO legal_footnotes (id, article_id, title, body, sort_order) VALUES (?, ?, ?, ?, ?);',
                    item.id,
                    item.article_id,
                    item.title,
                    item.body,
                    item.sort_order
                );
            }

            await database.runAsync(
                'INSERT INTO legal_data_migrations (migration_id) VALUES (?);',
                LEGAL_DATA_SEED
            );
            await database.execAsync('COMMIT;');
        } catch (error) {
            try {
                await database.execAsync('ROLLBACK;');
            } catch {
                // Preserve the original seed error if rollback also fails.
            }
            throw error;
        }
    });
}

async function ensureLegalDataReady(): Promise<void> {
    await initDatabase();
    await seedLegalDataIfNeeded();
}

async function getAll<T>(sql: string, ...params: SQLiteBindValue[]): Promise<T[]> {
    const result = await databaseQuery<T>(sql, params);
    return result;
}

async function databaseQuery<T>(sql: string, params: SQLiteBindValue[]): Promise<T[]> {
    return runWithDatabaseLock(async (database) => {
        return database.getAllAsync<T>(sql, ...params);
    });
}

export async function fetchLegalCategories(): Promise<LegalCategory[]> {
    await ensureLegalDataReady();
    return getAll<LegalCategory>(`
        SELECT
            category.id,
            category.title,
            category.sort_order,
            COUNT(legal_title.id) AS legal_title_count
        FROM regulation_categories AS category
        LEFT JOIN legal_titles AS legal_title
            ON legal_title.regulation_category_id = category.id
        GROUP BY category.id
        ORDER BY category.sort_order;
    `);
}

export async function fetchLegalTitles(categoryId: number): Promise<LegalTitle[]> {
    await ensureLegalDataReady();
    return getAll<LegalTitle>(`
        SELECT
            legal_title.id,
            legal_title.title,
            legal_title.sort_order,
            COUNT(DISTINCT chapter.id) AS chapter_count,
            COUNT(DISTINCT article.id) AS article_count
        FROM legal_titles AS legal_title
        LEFT JOIN legal_chapters AS chapter ON chapter.legal_title_id = legal_title.id
        LEFT JOIN legal_articles AS article ON article.legal_title_id = legal_title.id
        WHERE legal_title.regulation_category_id = ?
        GROUP BY legal_title.id
        ORDER BY legal_title.sort_order;
    `, categoryId);
}

export async function fetchLegalCategory(categoryId: number): Promise<Pick<LegalCategory, 'id' | 'title'> | null> {
    await ensureLegalDataReady();
    const rows = await getAll<Pick<LegalCategory, 'id' | 'title'>>(`
        SELECT id, title
        FROM regulation_categories
        WHERE id = ?;
    `, categoryId);
    return rows[0] ?? null;
}

export async function fetchLegalBreadcrumbs(
    type: LegalBreadcrumbType,
    id: number
): Promise<LegalBreadcrumbItem[]> {
    await ensureLegalDataReady();

    let rows: LegalBreadcrumbRow[];
    switch (type) {
        case 'category':
            rows = await getAll<LegalBreadcrumbRow>(`
                SELECT id AS category_id, title AS category_title
                FROM regulation_categories
                WHERE id = ?;
            `, id);
            break;
        case 'title':
            rows = await getAll<LegalBreadcrumbRow>(`
                SELECT
                    category.id AS category_id,
                    category.title AS category_title,
                    legal_title.id AS title_id,
                    legal_title.title AS title_title
                FROM legal_titles AS legal_title
                JOIN regulation_categories AS category
                    ON category.id = legal_title.regulation_category_id
                WHERE legal_title.id = ?;
            `, id);
            break;
        case 'chapter':
            rows = await getAll<LegalBreadcrumbRow>(`
                SELECT
                    category.id AS category_id,
                    category.title AS category_title,
                    legal_title.id AS title_id,
                    legal_title.title AS title_title,
                    chapter.id AS chapter_id,
                    chapter.title AS chapter_title
                FROM legal_chapters AS chapter
                JOIN legal_titles AS legal_title ON legal_title.id = chapter.legal_title_id
                JOIN regulation_categories AS category
                    ON category.id = legal_title.regulation_category_id
                WHERE chapter.id = ?;
            `, id);
            break;
        case 'topic':
            rows = await getAll<LegalBreadcrumbRow>(`
                SELECT
                    category.id AS category_id,
                    category.title AS category_title,
                    legal_title.id AS title_id,
                    legal_title.title AS title_title,
                    chapter.id AS chapter_id,
                    chapter.title AS chapter_title,
                    topic.id AS topic_id,
                    topic.title AS topic_title
                FROM legal_topics AS topic
                JOIN legal_chapters AS chapter ON chapter.id = topic.chapter_id
                JOIN legal_titles AS legal_title ON legal_title.id = chapter.legal_title_id
                JOIN regulation_categories AS category
                    ON category.id = legal_title.regulation_category_id
                WHERE topic.id = ?;
            `, id);
            break;
        case 'article':
            rows = await getAll<LegalBreadcrumbRow>(`
                SELECT
                    category.id AS category_id,
                    category.title AS category_title,
                    legal_title.id AS title_id,
                    legal_title.title AS title_title,
                    chapter.id AS chapter_id,
                    chapter.title AS chapter_title,
                    topic.id AS topic_id,
                    topic.title AS topic_title,
                    article.id AS article_id,
                    article.title AS article_title
                FROM legal_articles AS article
                JOIN legal_titles AS legal_title ON legal_title.id = article.legal_title_id
                JOIN regulation_categories AS category
                    ON category.id = legal_title.regulation_category_id
                LEFT JOIN legal_topics AS topic ON topic.id = article.topic_id
                LEFT JOIN legal_chapters AS chapter
                    ON chapter.id = COALESCE(article.chapter_id, topic.chapter_id)
                WHERE article.id = ?
            `, id);
            break;
    }

    const row = rows[0];
    if (!row) return [];

    const items: LegalBreadcrumbItem[] = [];
    const append = (
        itemType: LegalBreadcrumbType,
        itemId: number | null | undefined,
        title: string | null | undefined
    ) => {
        if (typeof itemId === 'number' && typeof title === 'string') {
            items.push({ type: itemType, id: itemId, title });
        }
    };

    append('category', row.category_id, row.category_title);
    append('title', row.title_id, row.title_title);
    append('chapter', row.chapter_id, row.chapter_title);
    append('topic', row.topic_id, row.topic_title);
    append('article', row.article_id, row.article_title);

    return items;
}

export async function searchLegalContent(query: string): Promise<LegalSearchResult[]> {
    await ensureLegalDataReady();
    const normalizedQuery = normalizeSearchText(query);
    if (!normalizedQuery) return [];

    const queryVariants = new Set<string>();
    const persianDigits = '۰۱۲۳۴۵۶۷۸۹';
    const arabicDigits = '٠١٢٣٤٥٦٧٨٩';
    const digitVariants = [
        normalizedQuery,
        normalizedQuery.replace(/[0-9]/g, (digit) => persianDigits[Number(digit)]),
        normalizedQuery.replace(/[0-9]/g, (digit) => arabicDigits[Number(digit)]),
    ];
    for (const queryVariant of digitVariants) {
        for (const yehVariant of [
            queryVariant,
            queryVariant.replace(/ی/g, 'ي'),
            queryVariant.replace(/ی/g, 'ى'),
        ]) {
            queryVariants.add(yehVariant);
            queryVariants.add(yehVariant.replace(/ک/g, 'ك'));
        }
    }

    const patterns = [...queryVariants].map((queryVariant) => {
        const escapedQuery = queryVariant
            .replace(/!/g, '!!')
            .replace(/%/g, '!%')
            .replace(/_/g, '!_');
        return `%${escapedQuery.split(' ').join('%')}%`;
    });
    const searchable = (column: string) =>
        `(${patterns.map(() => `lower(${column}) LIKE ? ESCAPE '!'`).join(' OR ')})`;
    const searchParams = () => patterns;

    const rows = await getAll<LegalSearchRow>(`
        SELECT id, title, subtitle, route_id, route_title, footnote_id, type, route_type
        FROM (
            SELECT id, title, 'دستهٔ قوانین و مقررات' AS subtitle,
                id AS route_id, title AS route_title, NULL AS footnote_id,
                'category' AS type, 'category' AS route_type, 0 AS result_order
            FROM regulation_categories
            WHERE ${searchable('title')}

            UNION ALL

            SELECT legal_title.id, legal_title.title, category.title AS subtitle,
                legal_title.id AS route_id, legal_title.title AS route_title, NULL AS footnote_id,
                'title' AS type, 'title' AS route_type, 1 AS result_order
            FROM legal_titles AS legal_title
            JOIN regulation_categories AS category
                ON category.id = legal_title.regulation_category_id
            WHERE ${searchable('legal_title.title')}

            UNION ALL

            SELECT chapter.id, chapter.title, legal_title.title AS subtitle,
                chapter.id AS route_id, chapter.title AS route_title, NULL AS footnote_id,
                'chapter' AS type, 'chapter' AS route_type, 2 AS result_order
            FROM legal_chapters AS chapter
            JOIN legal_titles AS legal_title ON legal_title.id = chapter.legal_title_id
            WHERE ${searchable('chapter.title')}

            UNION ALL

            SELECT topic.id, topic.title,
                legal_title.title || '  ›  ' || chapter.title AS subtitle,
                topic.id AS route_id, topic.title AS route_title, NULL AS footnote_id,
                'topic' AS type, 'topic' AS route_type, 3 AS result_order
            FROM legal_topics AS topic
            JOIN legal_chapters AS chapter ON chapter.id = topic.chapter_id
            JOIN legal_titles AS legal_title ON legal_title.id = chapter.legal_title_id
            WHERE ${searchable('topic.title')}

            UNION ALL

            SELECT article.id, article.title,
                legal_title.title || COALESCE('  ›  ' || chapter.title, '')
                    || COALESCE('  ›  ' || topic.title, '') AS subtitle,
                article.id AS route_id, article.title AS route_title, NULL AS footnote_id,
                'article' AS type, 'article' AS route_type, 4 AS result_order
            FROM legal_articles AS article
            JOIN legal_titles AS legal_title ON legal_title.id = article.legal_title_id
            LEFT JOIN legal_topics AS topic ON topic.id = article.topic_id
            LEFT JOIN legal_chapters AS chapter
                ON chapter.id = COALESCE(article.chapter_id, topic.chapter_id)
            WHERE ${searchable('article.title')}
                OR ${searchable('article.body')}

            UNION ALL

            SELECT footnote.id, footnote.title,
                article.title || '  ›  تبصره' AS subtitle,
                article.id AS route_id, article.title AS route_title,
                footnote.id AS footnote_id,
                'footnote' AS type, 'article' AS route_type, 5 AS result_order
            FROM legal_footnotes AS footnote
            JOIN legal_articles AS article ON article.id = footnote.article_id
            WHERE ${searchable('footnote.title')}
                OR ${searchable('footnote.body')}
        )
        ORDER BY result_order, id;
    `,
        ...searchParams(),
        ...searchParams(),
        ...searchParams(),
        ...searchParams(),
        ...searchParams(),
        ...searchParams(),
        ...searchParams(),
        ...searchParams(),
    );

    return rows.map((row) => ({
        key: `${row.type}-${row.id}`,
        type: row.type,
        title: row.title,
        subtitle: row.subtitle,
        routeType: row.route_type,
        routeId: row.route_id,
        routeTitle: row.route_title,
        footnoteId: row.footnote_id,
    }));
}

export async function fetchLegalTitleContents(titleId: number): Promise<LegalTitleContents> {
    await ensureLegalDataReady();
    const [titleRows, chapters, directArticles] = await Promise.all([
        getAll<LegalTitle>(`
            SELECT
                legal_title.id,
                legal_title.title,
                legal_title.sort_order,
                COUNT(DISTINCT chapter.id) AS chapter_count,
                COUNT(DISTINCT article.id) AS article_count
            FROM legal_titles AS legal_title
            LEFT JOIN legal_chapters AS chapter ON chapter.legal_title_id = legal_title.id
            LEFT JOIN legal_articles AS article ON article.legal_title_id = legal_title.id
            WHERE legal_title.id = ?
            GROUP BY legal_title.id;
        `, titleId),
        getAll<LegalChapter>(`
            SELECT
                chapter.id,
                chapter.legal_title_id,
                chapter.title,
                chapter.sort_order,
                COUNT(DISTINCT topic.id) AS topic_count,
                COUNT(DISTINCT article.id) AS article_count
            FROM legal_chapters AS chapter
            LEFT JOIN legal_topics AS topic ON topic.chapter_id = chapter.id
            LEFT JOIN legal_articles AS article ON article.chapter_id = chapter.id
            WHERE chapter.legal_title_id = ?
            GROUP BY chapter.id
            ORDER BY chapter.sort_order;
        `, titleId),
        getAll<LegalArticle>(`
            SELECT
                article.id,
                article.legal_title_id,
                article.chapter_id,
                article.topic_id,
                article.title,
                article.body,
                article.sort_order,
                COUNT(footnote.id) AS footnote_count
            FROM legal_articles AS article
            LEFT JOIN legal_footnotes AS footnote ON footnote.article_id = article.id
            WHERE article.legal_title_id = ?
                AND article.chapter_id IS NULL
                AND article.topic_id IS NULL
            GROUP BY article.id
            ORDER BY article.sort_order;
        `, titleId),
    ]);

    return { title: titleRows[0] ?? null, chapters, directArticles };
}

export async function fetchLegalChapterContents(chapterId: number): Promise<LegalChapterContents> {
    await ensureLegalDataReady();
    const [chapterRows, topics, articles] = await Promise.all([
        getAll<LegalChapter>(`
            SELECT
                chapter.id,
                chapter.legal_title_id,
                chapter.title,
                chapter.sort_order,
                COUNT(DISTINCT topic.id) AS topic_count,
                COUNT(DISTINCT article.id) AS article_count
            FROM legal_chapters AS chapter
            LEFT JOIN legal_topics AS topic ON topic.chapter_id = chapter.id
            LEFT JOIN legal_articles AS article ON article.chapter_id = chapter.id
            WHERE chapter.id = ?
            GROUP BY chapter.id;
        `, chapterId),
        getAll<LegalTopic>(`
            SELECT
                topic.id,
                topic.chapter_id,
                topic.title,
                topic.sort_order,
                COUNT(article.id) AS article_count
            FROM legal_topics AS topic
            LEFT JOIN legal_articles AS article ON article.topic_id = topic.id
            WHERE topic.chapter_id = ?
            GROUP BY topic.id
            ORDER BY topic.sort_order;
        `, chapterId),
        getAll<LegalArticle>(`
            SELECT
                article.id,
                article.legal_title_id,
                article.chapter_id,
                article.topic_id,
                article.title,
                article.body,
                article.sort_order,
                COUNT(footnote.id) AS footnote_count
            FROM legal_articles AS article
            LEFT JOIN legal_footnotes AS footnote ON footnote.article_id = article.id
            WHERE article.chapter_id = ?
            GROUP BY article.id
            ORDER BY article.sort_order;
        `, chapterId),
    ]);

    return { chapter: chapterRows[0] ?? null, topics, articles };
}

export async function fetchLegalTopic(topicId: number): Promise<LegalTopic | null> {
    await ensureLegalDataReady();
    const rows = await getAll<LegalTopic>(`
        SELECT
            topic.id,
            topic.chapter_id,
            topic.title,
            topic.sort_order,
            COUNT(article.id) AS article_count
        FROM legal_topics AS topic
        LEFT JOIN legal_articles AS article ON article.topic_id = topic.id
        WHERE topic.id = ?
        GROUP BY topic.id;
    `, topicId);
    return rows[0] ?? null;
}

export async function fetchLegalTopicArticles(topicId: number): Promise<LegalArticle[]> {
    await ensureLegalDataReady();
    return getAll<LegalArticle>(`
        SELECT
            article.id,
            article.legal_title_id,
            article.chapter_id,
            article.topic_id,
            article.title,
            article.body,
            article.sort_order,
            COUNT(footnote.id) AS footnote_count
        FROM legal_articles AS article
        LEFT JOIN legal_footnotes AS footnote ON footnote.article_id = article.id
        WHERE article.topic_id = ?
        GROUP BY article.id
        ORDER BY article.sort_order;
    `, topicId);
}

export async function fetchLegalArticleDetails(articleId: number): Promise<LegalArticleDetails> {
    await ensureLegalDataReady();
    const [articleRows, footnotes] = await Promise.all([
        getAll<LegalArticle & { legal_title: string; chapter: string | null; topic: string | null }>(`
            SELECT
                article.id,
                article.legal_title_id,
                article.chapter_id,
                article.topic_id,
                article.title,
                article.body,
                article.sort_order,
                COUNT(DISTINCT footnote.id) AS footnote_count,
                legal_title.title AS legal_title,
                chapter.title AS chapter,
                topic.title AS topic
            FROM legal_articles AS article
            JOIN legal_titles AS legal_title ON legal_title.id = article.legal_title_id
            LEFT JOIN legal_topics AS topic ON topic.id = article.topic_id
            LEFT JOIN legal_chapters AS topic_chapter ON topic_chapter.id = topic.chapter_id
            LEFT JOIN legal_chapters AS chapter
                ON chapter.id = COALESCE(article.chapter_id, topic_chapter.id)
            LEFT JOIN legal_footnotes AS footnote ON footnote.article_id = article.id
            WHERE article.id = ?
            GROUP BY article.id;
        `, articleId),
        getAll<LegalFootnote>(`
            SELECT id, article_id, title, body, sort_order
            FROM legal_footnotes
            WHERE article_id = ?
            ORDER BY sort_order;
        `, articleId),
    ]);
    const articleRecord = articleRows[0];

    if (!articleRecord) {
        return { article: null, legalTitle: null, chapter: null, topic: null, footnotes: [] };
    }

    const { legal_title, chapter, topic, ...article } = articleRecord;
    return { article, legalTitle: legal_title, chapter, topic, footnotes };
}
