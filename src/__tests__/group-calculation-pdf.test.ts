import { describe, expect, it, jest } from '@jest/globals';

import { getAppColorPalette } from '@/constants/theme';
import { buildGroupCalculationPdfHtml } from '@/utils/group-calculation-pdf';

jest.mock('@/global.css', () => ({}));

describe('group calculation PDF theme colors', () => {
    it('labels the aggregate claim correctly when the worker is exempt', () => {
        const html = buildGroupCalculationPdfHtml(
            [{
                title: 'محاسبه بیمه',
                summaryLabel: 'مبلغ',
                amount: '۱٬۰۰۰',
                insuranceSummary: {
                    baseAmount: '۱٬۰۰۰',
                    workerAmount: '۷۰',
                    employerAmount: '۲۳۰',
                    netAmount: '۹۳۰',
                    workerExempt: false,
                },
                detailsTitle: 'جزئیات',
                details: [],
            }],
            [],
            false,
            { logo: 'logo.svg' },
            {
                amount: '۱٬۰۰۰',
                amountPaid: '۱۰۰',
                remainingClaim: '۹۰۰',
                workerInsuranceAmount: '۰',
                employerInsuranceAmount: '۲۳۰',
                finalClaim: '۹۰۰',
                workerInsuranceExempt: true,
                contractorWorkerCount: '۱',
                excludedBonusItems: [],
                insuranceItems: ['حقوق پایه', 'حق مسکن', '<بن کارگری>'],
            },
        );

        expect(html).toContain('ماندهٔ حقوق و مزایا با اعمال معافیت از سهم بیمهٔ کارگر');
        expect(html).toContain('۷٪ بیمه سهم کارگر از اقلام مشمول (معاف)');
        expect(html).toContain('۲۳٪ بیمه سهم کارفرما از اقلام مشمول');
        expect(html).toContain('۲۳۰');
        expect(html).toContain('۰');
        expect(html).toContain('فهرست اقلام مشمول بیمه');
        expect(html).toContain('<li>حقوق پایه</li>');
        expect(html).toContain('<li>حق مسکن</li>');
        expect(html).toContain('<li>&lt;بن کارگری&gt;</li>');
        expect(html).not.toContain('ماندهٔ حقوق و مزایا پس از کسر ۷٪ سهم بیمهٔ کارگر');
    });

    it('uses an ink-saving monochrome palette with print-friendly structure', () => {
        const html = buildGroupCalculationPdfHtml(
            [{
                title: 'محاسبه بیمه',
                summaryLabel: 'مبلغ',
                amount: '۱٬۰۰۰',
                insuranceSummary: {
                    baseAmount: '۱٬۰۰۰',
                    workerAmount: '۷۰',
                    employerAmount: '۲۳۰',
                    netAmount: '۹۳۰',
                    workerExempt: false,
                },
                detailsTitle: 'جزئیات',
                details: [],
            }],
            [],
            false,
            { logo: 'logo.svg' },
            {
                amount: '۱٬۰۰۰',
                amountPaid: '۱۰۰',
                remainingClaim: '۹۰۰',
                workerInsuranceAmount: '۷۰',
                employerInsuranceAmount: '۲۳۰',
                finalClaim: '۸۳۰',
                workerInsuranceExempt: false,
                contractorWorkerCount: '۱',
                contractorTotal30: '۱٬۲۳۰',
                employerInsurance30: '۲۳۰',
                contractorTotal: '۱٬۲۷۱',
                employerInsurance31: '۲۷۱',
                excludedBonusItems: [],
            },
        );

        expect(html).toContain('--pdf-page-bg: #ffffff');
        expect(html).toContain('--pdf-primary: #111111');
        expect(html).toContain('--pdf-border: #777777');
        expect(html).toContain('background: var(--pdf-page-bg)');
        expect(html).toContain('background: #ffffff');
        expect(html).toContain('-webkit-print-color-adjust: economy');
        expect(html).toContain('print-color-adjust: economy');
        expect(html).toContain('.watermark { display: none; }');
        expect(html).toContain('.header-logo-wrap, .about-logo-frame, .page-footer-logo {\n            border: 1px solid var(--pdf-border);\n            background: #ffffff;');
        expect(html).toContain('.header-logo, .about-logo, .page-footer-logo { filter: none; }');
        expect(html).not.toContain('filter: grayscale(1)');
        expect(html).not.toContain('#087e8b');
        expect(html).toContain('<title>پهناور کار - گزارش حقوق و مزایا</title>');
        expect(html).toContain('<h1>گزارش محاسبات حقوق و مزایا</h1>');
        expect(html).not.toContain('فیش');
        expect(html).toContain('<a class="page-footer-website" href="https://pahnavarkar.ir" aria-label="وب‌سایت پهناورکار: pahnavarkar.ir">pahnavarkar.ir</a>');
        expect(html).toContain('header {\n            display: flex;');
        expect(html).toContain('.header-brand { display: flex; flex: 1; align-items: center; gap: 9px; min-width: 0; }');
        expect(html).toContain('border-right: 3px solid var(--pdf-primary);');
        expect(html).toContain('.page-footer {\n            display: grid;');
        expect(html).toContain('.page-footer-rights { grid-column: 1 / -1;');
        expect(html).toContain('<span class="page-footer-promo">محاسبات حقوق و مزایا با پهناور کار</span>');
        expect(html).toContain('text-decoration: underline;');
        expect(html).toContain('--pdf-result-primary: #111111');
        expect(html).toContain('--pdf-result-header: #333333');
        expect(html).toContain('--pdf-result-on-header: #FFFFFF');
        expect(html).toContain('--pdf-result-primary-container: #E8E8E8');
        expect(html).toContain('--pdf-result-surface-variant: #F2F2F2');
        expect(html).toContain(`.metadata-table {
            width: 100%;
            margin: 14px 0;
            border: 1px solid var(--pdf-border);
            border-collapse: separate;
            border-spacing: 0;
            border-radius: 8px;`);
        expect(html).toContain(`.detail-table {
            width: 100%;
            border: 1px solid var(--pdf-border);
            border-collapse: separate;
            border-spacing: 0;
            border-radius: 8px;
            overflow: hidden;`);
        expect(html).toContain(`.results-summary {
            border: 1px solid var(--pdf-border);
            border-collapse: separate;
            border-spacing: 0;
            border-radius: 8px;`);
        expect(html).toContain(`.results-summary thead th {
            padding: 8px 10px;
            color: var(--pdf-result-on-header);
            background: var(--pdf-result-header);`);
        expect(html).toContain('.results-summary thead th:first-child { width: 58%; }');
        expect(html).toContain('.results-summary thead th:last-child { width: 42%; }');
        expect(html).toContain(`.pdf-section-title {
            margin: 10px 0 5px;
            padding: 4px 8px;
            border: 1px solid var(--pdf-border);
            border-right: 2px solid var(--pdf-primary);
            border-radius: 5px;
            color: var(--pdf-text);
            background: var(--pdf-surface-variant);`);
        expect(html).toContain('.details-section-title { margin-top: 20px; }');
        expect(html).toContain('.results-section-title { margin-top: 20px; }');
        expect(html).toContain('.summary { width: 100%; border-collapse: collapse; margin: 0 0 20px; }');
        expect(html).toContain('.calculation-section + .calculation-section { margin-top: 18px; }');
        expect(html).toContain('margin: 12px 0 0;');
        expect(html).toContain('margin-top: 20px;');
        expect(html).toContain('<tr class="calculation-result-row result-main-row">');
        expect(html).toContain(`.results-summary .calculation-result-row td.amount,
        .results-summary .calculation-result-row td.error-text {
            text-align: left;
            white-space: nowrap;`);
        expect(html).toContain(`.results-summary .result-main-row th,
        .results-summary .result-main-row td {
            color: var(--pdf-result-on-primary-container);
            background: var(--pdf-result-primary-container);
            border-color: var(--pdf-result-border);
            font-weight: bold;`);
        expect(html).toContain(`.results-summary .result-main-row th:first-child,
        .results-summary .result-main-row td[colspan="2"],
        .detail-table .result-main-row th,
        .metadata-table .result-main-row th {
            border-right: 3px solid var(--pdf-result-primary);`);
        expect(html).toContain(`.results-summary .result-subrow-even th,
        .results-summary .result-subrow-even td,
        .results-summary .result-subrow-even td.error-text,
        .detail-table .result-subrow-even th,
        .detail-table .result-subrow-even td,
        .metadata-table .result-subrow-even th,
        .metadata-table .result-subrow-even td {
            color: var(--pdf-result-text);
            background: var(--pdf-result-surface);`);
        expect(html).toContain(`.results-summary .result-subrow-odd th,
        .results-summary .result-subrow-odd td,
        .results-summary .result-subrow-odd td.error-text,
        .detail-table .result-subrow-odd th,
        .detail-table .result-subrow-odd td,
        .metadata-table .result-subrow-odd th,
        .metadata-table .result-subrow-odd td {
            color: var(--pdf-result-text);
            background: var(--pdf-result-surface-variant);`);
        expect(html).toContain(`.results-summary .result-subrow-even th::before,
        .results-summary .result-subrow-odd th::before,
        .detail-table .result-subrow-even th::before,
        .detail-table .result-subrow-odd th::before,
        .metadata-table .result-subrow-even th::before,
        .metadata-table .result-subrow-odd th::before,
        .results-summary tr.result-subrow-even:not(.insurance-items-row) td[colspan="2"]::before,
        .results-summary tr.result-subrow-odd:not(.insurance-items-row) td[colspan="2"]::before,
        .detail-table tr.result-subrow-even td[colspan="2"]::before,
        .detail-table tr.result-subrow-odd td[colspan="2"]::before,
        .metadata-table tr.result-subrow-even td[colspan="2"]::before,
        .metadata-table tr.result-subrow-odd td[colspan="2"]::before {
            position: absolute;
            right: 7px;
            content: "•";`);
        expect(html).toContain('<tr class="insurance-summary-row result-subrow-even">');
        expect(html).toContain('<tr class="insurance-summary-row worker-insurance-row result-subrow-odd">');
        expect(html).not.toContain('.results-summary .calculation-result-row th::before');
        expect(html).toContain('content: "•";');
        expect(html).toContain('<tr class="wage-total-row wage-total-primary result-main-row">');
        expect(html).toContain('<tr class="wage-total-row final-claim-row result-main-row">');
        expect(html).toContain('<tr class="wage-total-row contractor-total-row contractor-total-30 result-main-row">');
        expect(html).toContain('<tr class="wage-total-row contractor-total-row contractor-total-31 result-main-row">');
        expect(html).toContain('<tr class="wage-total-row wage-detail-row result-main-row result-main-list-row">');
        expect(html).toContain('<tr class="wage-total-row worker-insurance-row result-main-row result-main-list-row">');
        expect(html).toContain('<tr class="wage-total-row employer-insurance-row result-main-row result-main-list-row">');
        expect(html).toContain('.results-summary .result-main-list-row th::before');
        expect(html).toContain('<tr class="wage-total-row wage-detail-row result-subrow-even">');
    });

    it('uses the selected theme palette for color output', () => {
        const colors = getAppColorPalette('red', 'light', 50);
        const html = buildGroupCalculationPdfHtml(
            [{
                title: 'محاسبه بیمه',
                summaryLabel: 'مبلغ',
                amount: '۱٬۰۰۰',
                insuranceSummary: {
                    baseAmount: '۱٬۰۰۰',
                    workerAmount: '۷۰',
                    employerAmount: '۲۳۰',
                    netAmount: '۹۳۰',
                    workerExempt: false,
                },
                detailsTitle: 'جزئیات',
                details: [],
            }],
            [],
            false,
            { logo: 'logo.svg' },
            {
                amount: '۱٬۰۰۰',
                amountPaid: '۱۰۰',
                remainingClaim: '۹۰۰',
                workerInsuranceAmount: '۷۰',
                employerInsuranceAmount: '۲۳۰',
                finalClaim: '۸۳۰',
                workerInsuranceExempt: false,
                contractorWorkerCount: '۱',
                contractorTotal30: '۱٬۲۳۰',
                employerInsurance30: '۲۳۰',
                contractorTotal: '۱٬۲۷۱',
                employerInsurance31: '۲۷۱',
                excludedBonusItems: [],
                insuranceItems: ['حقوق پایه', 'حق مسکن'],
            },
            'color',
            'red',
            50,
        );

        expect(html).toContain(`--pdf-primary: ${colors.primary}`);
        expect(html).toContain(`--pdf-on-primary: ${colors.onPrimary}`);
        expect(html).toContain(`--pdf-primary-container: ${colors.primaryContainer}`);
        expect(html).toContain(`--pdf-error: ${colors.primary}`);
        expect(html).toContain(`--pdf-warning: ${colors.primary}`);
        expect(html).toContain(`--pdf-error-fill: ${colors.primaryContainer}`);
        expect(html).toContain('print-color-adjust: exact');
        expect(html).toContain('.header-logo-wrap {\n                    border-color: var(--pdf-primary);\n                    background-color: var(--pdf-primary);');
        expect(html).toContain(`.header-logo-wrap, .about-logo-frame, .page-footer-logo {
                    border-color: var(--pdf-primary);
                    background: var(--pdf-primary);`);
        expect(html).toContain('.header-logo, .about-logo, .page-footer-logo { filter: none; }');
        expect(html).toMatch(/\.watermark\s*\{[^}]*display:\s*block;/);
        expect(html).toContain('-webkit-mask: url("logo.svg") center / contain no-repeat;');
        expect(html).toContain('mask: url("logo.svg") center / contain no-repeat;');
        expect(html).toContain('background-color: var(--pdf-primary);\n                    -webkit-mask:');
        expect(html).toContain('--pdf-about-on-primary: ' + colors.onPrimary);
        expect(html).toContain('<section class="about-section">');
        expect(html).toContain('<img class="about-logo" src="logo.svg" alt="">');
        expect(html).toContain('<div class="about-timeline">');
        expect(html).toContain('<span class="about-marker">۱</span>');
        expect(html).toContain('<h3>ابزارهای محاسباتی حقوق و کار</h3>');
        expect(html).toContain('<h3>اطلاعات مزدی و مبانی محاسبه</h3>');
        expect(html).toContain('<h3>قوانین و مقررات</h3>');
        expect(html).toContain('<h3>امکانات حساب کاربری</h3>');
        expect(html).toContain('class="calculation-result-row result-main-row"');
        expect(html).toContain('class="insurance-summary-row worker-insurance-row result-subrow-odd"');
        expect(html).toContain('class="insurance-summary-row employer-insurance-row result-subrow-even"');
        expect(html).toContain('class="wage-total-row wage-total-primary result-main-row"');
        expect(html).toContain('class="wage-total-row final-claim-row result-main-row"');
        expect(html).toContain('class="wage-total-row contractor-total-row contractor-total-30 result-main-row"');
        expect(html).toContain('class="wage-total-row contractor-total-row contractor-total-31 result-main-row"');
        expect(html).toContain('<strong>فهرست اقلام مشمول بیمه</strong>');
        expect(html).toContain('<li>حقوق پایه</li><li>حق مسکن</li>');
        expect(html).toContain('.results-summary .insurance-items-row ul');
        expect(html).toContain(`--pdf-result-primary: ${colors.primary}`);
        expect(html).toContain(`--pdf-result-header: ${colors.primary}`);
        expect(html).toContain(`--pdf-result-on-header: ${colors.onPrimary}`);
        expect(html).toContain(`--pdf-result-primary-container: ${colors.primaryContainer}`);
        expect(html).toContain(`--pdf-result-on-primary-container: ${colors.onPrimaryContainer}`);
        expect(html).toContain(`.results-summary .result-main-row th,
        .results-summary .result-main-row td {
            color: var(--pdf-result-on-primary-container);
            background: var(--pdf-result-primary-container);
            border-color: var(--pdf-result-border);`);
        expect(html).toContain(`.results-summary .result-subrow-odd th,
        .results-summary .result-subrow-odd td,
        .results-summary .result-subrow-odd td.error-text,
        .detail-table .result-subrow-odd th,
        .detail-table .result-subrow-odd td,
        .metadata-table .result-subrow-odd th,
        .metadata-table .result-subrow-odd td {
            color: var(--pdf-result-text);
            background: var(--pdf-result-surface-variant);`);
        expect(html).toContain(`.results-summary .result-subrow-even th,
        .results-summary .result-subrow-even td,
        .results-summary .result-subrow-even td.error-text,
        .detail-table .result-subrow-even th,
        .detail-table .result-subrow-even td,
        .metadata-table .result-subrow-even th,
        .metadata-table .result-subrow-even td {
            color: var(--pdf-result-text);
            background: var(--pdf-result-surface);`);
        expect(html).toContain('<tr class="wage-total-row final-claim-row result-main-row">');
        expect(html).toContain('<tr class="wage-total-row contractor-total-row contractor-total-31 result-main-row">');
        expect(html).toContain('.metadata-table th, .metadata-table td, .summary th, .summary td {\n            padding: 6px 9px;');
        expect(html).toContain('.metadata-table tbody th[scope="row"] { width: 58%;');
        expect(html).toContain('.summary td:last-child { width: 42%; }');
        expect(html).toContain('.summary thead th { color: var(--pdf-text); background: #ffffff; border-bottom: 2px solid var(--pdf-text); }');
        expect(html).not.toContain('.summary th { color: var(--pdf-text); background: #ffffff; border-bottom: 2px solid var(--pdf-text); }');
        expect(html).not.toContain('--pdf-secondary-container');
        expect(html).not.toContain('--pdf-tertiary-container');
        expect(html).not.toContain('#8A5700');
    });

    it('renders the header and footer logo frames as padded circles like the About screen', () => {
        const html = buildGroupCalculationPdfHtml(
            [],
            [],
            false,
            { logo: 'logo.svg' },
        );

        expect(html).toMatch(/\.header-logo-wrap\s*\{[^}]*width:\s*44px;[^}]*height:\s*44px;[^}]*padding:\s*3px;[^}]*border-radius:\s*50%;/);
        expect(html).toMatch(/\.header-logo\s*\{[^}]*border-radius:\s*50%;/);
        expect(html).toMatch(/\.page-footer-logo\s*\{[^}]*width:\s*24px;[^}]*height:\s*24px;[^}]*padding:\s*2px;[^}]*border-radius:\s*50%;/);
        expect(html).toMatch(/\.about-logo-frame\s*\{[^}]*width:\s*34px;[^}]*height:\s*34px;[^}]*padding:\s*4px;[^}]*border-radius:\s*50%;/);
        expect(html).toContain('<div class="header-copy">');
        expect(html).toContain('<footer class="page-footer">');
        expect(html).toContain('.watermark { display: none; }');
    });

    it('clearly labels the calculation details section when details are included', () => {
        const html = buildGroupCalculationPdfHtml(
            [{
                title: 'محاسبه حقوق',
                summaryLabel: 'جمع',
                amount: '۱٬۰۰۰',
                detailsTitle: 'ریز محاسبات',
                details: [{
                    title: 'فروردین ۱۴۰۵',
                    rows: [
                        { label: 'حقوق پایه', value: '۱٬۰۰۰' },
                        { label: 'حق مسکن', value: '۲۰۰' },
                    ],
                }],
            }],
            [],
            true,
            { logo: 'logo.svg' },
        );

        expect(html).toContain('<h2 class="pdf-section-title details-section-title">جزئیات محاسبات</h2>');
        expect(html).toContain('<h2 class="pdf-section-title">ورودی‌های محاسبه</h2>');
        expect(html).toContain('<h2 class="pdf-section-title results-section-title">نتایج محاسبات</h2>');
        expect(html).toContain('<h3 class="details-title">محاسبه حقوق · ریز محاسبات</h3>');
        expect(html).toContain('<tr class="detail-period-heading result-main-row">');
        expect(html).toContain('<tr class="result-subrow-even">');
        expect(html).toContain('<tr class="result-subrow-odd">');
        expect(html).toContain('.detail-table .result-main-row th');
        expect(html).toContain('.detail-table .result-subrow-even th::before');
        expect(html).toContain(`.details-title {
            margin: 8px 0 5px;
            padding-right: 7px;
            border-right: 2px solid var(--pdf-primary);
            color: var(--pdf-text);
            font-size: 9px;
            line-height: 1.5;
            font-weight: bold;`);
        expect(html).not.toContain('.details-title {\n            margin: 8px 0 6px;');
        expect(html).toContain('فروردین ۱۴۰۵');

        const withoutDetails = buildGroupCalculationPdfHtml(
            [{
                title: 'محاسبه حقوق',
                summaryLabel: 'جمع',
                amount: '۱٬۰۰۰',
                detailsTitle: 'ریز محاسبات',
                details: [],
            }],
            [],
            false,
            { logo: 'logo.svg' },
        );
        expect(withoutDetails).not.toContain('جزئیات محاسبات');
    });

    it('styles grouped calculation inputs like main and alternating result rows', () => {
        const html = buildGroupCalculationPdfHtml(
            [],
            [
                { section: 'مشخصات کارگر', label: 'نام', value: 'کاربر' },
                { section: 'مشخصات کارگر', label: 'سابقه', value: '۵ سال' },
                { section: 'محاسبات بیمه', label: 'نرخ', value: '۷٪' },
            ],
            false,
            { logo: 'logo.svg' },
        );

        expect(html).toContain('<tr class="metadata-section-row result-main-row"><th colspan="2">مشخصات کارگر</th></tr>');
        expect(html).toContain('<tr class="result-subrow-even">');
        expect(html).toContain('<tr class="result-subrow-odd">');
        expect(html).toContain('<tr class="metadata-section-row result-main-row"><th colspan="2">محاسبات بیمه</th></tr>');
        expect(html).toContain(`.metadata-table .result-main-row th {
            color: var(--pdf-result-on-primary-container);
            background: var(--pdf-result-primary-container);
            border-color: var(--pdf-result-border);
            font-weight: bold;`);
        expect(html).toContain('.metadata-table .result-subrow-even th::before');
        expect(html).not.toContain('.metadata-table tbody tr:nth-child(even)');
    });
});
