import { describe, expect, it } from '@jest/globals';

import { PLAN_FEATURE_DETAILS } from '@/constants/generated-plan-feature-details';
import { TOOL_DEFINITIONS } from '@/constants/tool-definitions';
import { filterHomeActions, HOME_ROUTES } from '@/utils/home-tabs';

describe('home tab definitions and filters', () => {
    it('uses the generated plan catalog descriptions for every home tool', () => {
        expect(Object.fromEntries(TOOL_DEFINITIONS.map(({ key, detail }) => [key, detail])))
            .toEqual(PLAN_FEATURE_DETAILS);
    });

    it('defines each tab key once and keeps rules as a separate access-gated tab', () => {
        const keys = HOME_ROUTES.map((route) => route.key);

        expect(new Set(keys).size).toBe(keys.length);
        expect(keys).toEqual([
            'all',
            'wageContinuous',
            'wageNonContinuous',
            'nonWage',
            'yearlyInfo',
            'rules',
        ]);
        expect(filterHomeActions(TOOL_DEFINITIONS, 'rules')).toEqual([]);
    });

    it('shows every available tool exactly once in the all tab', () => {
        const allActions = filterHomeActions(TOOL_DEFINITIONS, 'all');

        expect(allActions.map((action) => action.key)).toEqual(
            TOOL_DEFINITIONS.map((action) => action.key),
        );
        expect(new Set(allActions.map((action) => action.key)).size).toBe(allActions.length);
    });

    it.each([
        ['wageContinuous', 'wageContinuous'],
        ['wageNonContinuous', 'wageNonContinuous'],
        ['nonWage', 'nonWage'],
        ['yearlyInfo', 'yearlyInfo'],
    ] as const)('filters the %s tab to its matching category', (tab, category) => {
        const filteredActions = filterHomeActions(TOOL_DEFINITIONS, tab);

        expect(filteredActions.length).toBeGreaterThan(0);
        expect(filteredActions.every((action) => action.category === category)).toBe(true);
        expect(filteredActions.map((action) => action.key)).toEqual(
            TOOL_DEFINITIONS
                .filter((action) => action.category === category)
                .map((action) => action.key),
        );
    });
});
