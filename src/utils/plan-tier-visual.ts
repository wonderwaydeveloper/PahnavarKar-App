import type { ThemeType } from '@/context/app.context';

export type PlanTierIcon = 'medal' | 'gift-outline';

const PLAN_TIER_COLORS: Record<string, Record<ThemeType, string>> = {
    free: { light: '#16794B', dark: '#72D4A5' },
    bronze: { light: '#A44E20', dark: '#F0A676' },
    silver: { light: '#586575', dark: '#C5D0DC' },
    gold: { light: '#956900', dark: '#F5D46A' },
};

const PLAN_TIER_LOGO_BACKGROUNDS: Record<string, Record<ThemeType, string>> = {
    free: { light: '#DCFCE7', dark: '#173B2A' },
    bronze: { light: '#C98550', dark: '#6A3F2B' },
    silver: { light: '#B6C0CB', dark: '#4D5967' },
    gold: { light: '#FFE76A', dark: '#665C00' },
};

const PLAN_TIER_LOGO_DARK_FOREGROUND = '#102A39';
const PLAN_TIER_LOGO_LIGHT_FOREGROUND = '#FFFFFF';

function getRelativeLuminance(color: string): number {
    const [red, green, blue] = [1, 3, 5].map((offset) => {
        const channel = Number.parseInt(color.slice(offset, offset + 2), 16) / 255;
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });

    return 0.2126 * red! + 0.7152 * green! + 0.0722 * blue!;
}

function getContrastRatio(firstColor: string, secondColor: string): number {
    const [lighter, darker] = [getRelativeLuminance(firstColor), getRelativeLuminance(secondColor)]
        .sort((a, b) => b - a);

    return (lighter! + 0.05) / (darker! + 0.05);
}

export function getPlanTierIcon(tier: string): PlanTierIcon {
    switch (tier) {
        case 'bronze':
        case 'silver':
        case 'gold':
            return 'medal';
        default:
            return 'gift-outline';
    }
}

export function getPlanTierColor(tier: string, theme: ThemeType): string {
    return PLAN_TIER_COLORS[tier]?.[theme] ?? PLAN_TIER_COLORS.free[theme];
}

export function getPlanTierLogoBackground(tier: string, theme: ThemeType): string {
    return PLAN_TIER_LOGO_BACKGROUNDS[tier]?.[theme] ?? PLAN_TIER_LOGO_BACKGROUNDS.free[theme];
}

export function getPlanTierLogoForeground(tier: string, theme: ThemeType): string {
    const background = getPlanTierLogoBackground(tier, theme);
    const darkContrast = getContrastRatio(PLAN_TIER_LOGO_DARK_FOREGROUND, background);
    const lightContrast = getContrastRatio(PLAN_TIER_LOGO_LIGHT_FOREGROUND, background);

    return darkContrast >= lightContrast
        ? PLAN_TIER_LOGO_DARK_FOREGROUND
        : PLAN_TIER_LOGO_LIGHT_FOREGROUND;
}
