import { describe, expect, it, jest } from '@jest/globals';

import { ColorPalettes, PRODUCT_COLOR_TOKENS } from '@/constants/theme';
import { buildGroupCalculationPdfHtml } from '@/utils/group-calculation-pdf';

jest.mock('@/global.css', () => ({}));

describe('group calculation PDF theme colors', () => {
    it('uses the selected theme palette and centralized document canvas token', () => {
        const colors = ColorPalettes.blue.light;
        const html = buildGroupCalculationPdfHtml(
            [],
            [],
            false,
            { logo: 'logo.svg' },
            'blue',
        );

        expect(html).toContain(`--pdf-page-bg: ${PRODUCT_COLOR_TOKENS.pdfCanvas}`);
        expect(html).toContain(`--pdf-primary: ${colors.primary}`);
        expect(html).toContain(`--pdf-on-primary: ${colors.onPrimary}`);
        expect(html).toContain(`--pdf-error: ${colors.error}`);
        expect(html).toContain('background: var(--pdf-page-bg)');
        expect(html).toContain('background: var(--pdf-primary)');
        expect(html).toMatch(/\.metadata-table \.metadata-section-row th\s*\{\s*color:\s*var\(--pdf-on-primary\);\s*background:\s*var\(--pdf-primary\);/);
        expect(html).toMatch(/\.detail-table \.detail-period-heading th\s*\{[^}]*color:\s*var\(--pdf-on-primary\);[^}]*background:\s*var\(--pdf-primary\);/);
        expect(html).not.toContain('pdf-primary-container');
        expect(html).not.toContain('#087e8b');
        expect(html).not.toContain('#f5f9fa');
    });

    it('renders the header and footer logo frames as padded circles like the About screen', () => {
        const html = buildGroupCalculationPdfHtml(
            [],
            [],
            false,
            { logo: 'logo.svg' },
            'blue',
        );

        expect(html).toMatch(/\.header-logo-wrap\s*\{[^}]*width:\s*38px;[^}]*height:\s*38px;[^}]*padding:\s*4px;[^}]*border-radius:\s*50%;/);
        expect(html).toMatch(/\.header-logo\s*\{[^}]*border-radius:\s*50%;/);
        expect(html).toMatch(/\.page-footer-logo\s*\{[^}]*width:\s*18px;[^}]*height:\s*18px;[^}]*padding:\s*2px;[^}]*border-radius:\s*50%;/);
        expect(html).toMatch(/\.watermark\s*\{[^}]*border-radius:\s*50%;/);
    });
});
