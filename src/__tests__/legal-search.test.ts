import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { runWithDatabaseLock } from '@/database/connection';
import { searchLegalContent } from '@/database/legal-data';
import { initDatabase } from '@/database/db';
import { normalizeSearchText } from '@/utils/search-text';

jest.mock('@/database/connection', () => ({
    runWithDatabaseLock: jest.fn(),
}));
jest.mock('@/database/db', () => ({
    initDatabase: jest.fn(),
}));

const articleRow = {
    id: 12,
    title: 'ماده ۱',
    subtitle: 'قانون کار',
    route_id: 12,
    route_title: 'ماده ۱',
    footnote_id: null,
    type: 'article',
    route_type: 'article',
    result_order: 4,
};

const mockDatabase = {
    getFirstAsync: jest.fn(async (_sql: string, ..._params: unknown[]) => ({
        migration_id: 'seed_001_legal_json_fixtures',
    })),
    getAllAsync: jest.fn(async (_sql: string, ..._params: unknown[]) => [articleRow]),
};

beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(initDatabase).mockResolvedValue(undefined);
    mockDatabase.getFirstAsync.mockImplementation(async () => ({
        migration_id: 'seed_001_legal_json_fixtures',
    }));
    mockDatabase.getAllAsync.mockImplementation(async () => [articleRow]);
    jest.mocked(runWithDatabaseLock).mockImplementation(async (operation) =>
        operation(mockDatabase as never),
    );
});

describe('legal search', () => {
    it('normalizes Persian and Arabic spelling and digits consistently', () => {
        expect(normalizeSearchText('  كِتاب\u200c يى ۱۲۳ ')).toBe('کتاب یی 123');
    });

    it('loads all legal result types with one database query and preserves route data', async () => {
        const results = await searchLegalContent('ماده ۱');

        expect(mockDatabase.getAllAsync).toHaveBeenCalledTimes(1);
        const [sql, ...parameters] = mockDatabase.getAllAsync.mock.calls[0]!;
        expect(sql).toContain('UNION ALL');
        expect(sql).toContain('FROM legal_footnotes');
        expect((sql.match(/\?/g) ?? []).length).toBe(parameters.length);
        expect(results).toEqual([{
            key: 'article-12',
            type: 'article',
            title: 'ماده ۱',
            subtitle: 'قانون کار',
            routeType: 'article',
            routeId: 12,
            routeTitle: 'ماده ۱',
            footnoteId: null,
        }]);
    });

    it('does not execute a database search for an empty normalized query', async () => {
        const results = await searchLegalContent(' \u200c ');

        expect(results).toEqual([]);
        expect(mockDatabase.getAllAsync).not.toHaveBeenCalled();
    });
});
