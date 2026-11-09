import type { ToolCategory, ToolDefinition } from '@/constants/tool-definitions';

export type HomeTab = 'all' | 'wageContinuous' | 'wageNonContinuous' | 'nonWage' | 'yearlyInfo' | 'rules';
export type HomeActionGroups<T extends ToolDefinition> = Record<ToolCategory, T[]>;

export type HomeRoute = {
    key: HomeTab;
    label: string;
};

export const HOME_ROUTES: HomeRoute[] = [
    { key: 'all', label: 'همه' },
    { key: 'wageContinuous', label: 'اقلام مزدی مستمر' },
    { key: 'wageNonContinuous', label: 'اقلام مزدی غیرمستمر' },
    { key: 'nonWage', label: 'اقلام غیر مزدی' },
    { key: 'yearlyInfo', label: 'اطلاعات سال کارکرد' },
    { key: 'rules', label: 'قوانین و مقررات' },
];

export function filterHomeActions<T extends ToolDefinition>(actions: readonly T[], tab: HomeTab): T[] {
    if (tab === 'all') return [...actions];
    if (tab === 'rules') return [];
    return actions.filter((action) => action.category === tab);
}

export function groupHomeActions<T extends ToolDefinition>(
    actions: readonly T[],
    tab: HomeTab,
): HomeActionGroups<T> {
    const groups: HomeActionGroups<T> = {
        wageContinuous: [],
        wageNonContinuous: [],
        nonWage: [],
        yearlyInfo: [],
    };

    for (const action of actions) {
        if (tab !== 'all' && action.category !== tab) continue;
        groups[action.category].push(action);
    }

    return groups;
}
