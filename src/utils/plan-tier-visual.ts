import { PRODUCT_COLOR_TOKENS } from '@/constants/product-color-tokens';
import type { ThemeType } from '@/context/app.context';

export type PlanTierIcon = 'medal' | 'shield-star' | 'crown' | 'gift-outline';
type PlanTier = keyof typeof PRODUCT_COLOR_TOKENS.planTierColors;

function isPlanTier(tier: string): tier is PlanTier {
    return Object.prototype.hasOwnProperty.call(PRODUCT_COLOR_TOKENS.planTierColors, tier);
}

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
            return 'medal';
        case 'silver':
            return 'shield-star';
        case 'gold':
            return 'crown';
        default:
            return 'gift-outline';
    }
}

export function getPlanTierColor(tier: string, theme: ThemeType): string {
    return PRODUCT_COLOR_TOKENS.planTierColors[isPlanTier(tier) ? tier : 'free'][theme];
}

export function getPlanTierLogoBackground(tier: string, theme: ThemeType): string {
    const planTier = isPlanTier(tier) ? tier : 'free';
    return PRODUCT_COLOR_TOKENS.planTierLogoBackgrounds[planTier][theme];
}

export function getPlanTierLogoForeground(tier: string, theme: ThemeType): string {
    const background = getPlanTierLogoBackground(tier, theme);
    const darkForeground = PRODUCT_COLOR_TOKENS.planTierLogoForeground.dark;
    const lightForeground = PRODUCT_COLOR_TOKENS.planTierLogoForeground.light;
    const darkContrast = getContrastRatio(darkForeground, background);
    const lightContrast = getContrastRatio(lightForeground, background);

    return darkContrast >= lightContrast
        ? darkForeground
        : lightForeground;
}
