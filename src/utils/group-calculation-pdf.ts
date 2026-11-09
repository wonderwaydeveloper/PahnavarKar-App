import { getAppColorPalette, type ThemePalette, type ThemePaletteTone } from '@/constants/theme';

export interface GroupCalculationPdfDetail {
    title: string;
    rows: { label: string; value: string }[];
}

export interface GroupCalculationPdfSection {
    title: string;
    summaryLabel: string;
    amount: string;
    insuranceSummary?: {
        baseAmount: string;
        workerAmount: string;
        employerAmount: string;
        netAmount: string;
        workerExempt: boolean;
    };
    error?: string;
    detailsTitle: string;
    details: GroupCalculationPdfDetail[];
}

export interface GroupCalculationPdfMetadata {
    label: string;
    value: string;
    section?: string;
}

export interface GroupCalculationPdfAssets {
    logo: string;
    regularFont?: string;
    mediumFont?: string;
    semiBoldFont?: string;
    boldFont?: string;
}

export interface GroupCalculationPdfWageTotal {
    amount: string;
    error?: string;
    amountPaid?: string;
    remainingClaim?: string;
    workerInsuranceAmount?: string;
    employerInsuranceAmount?: string;
    finalClaim?: string;
    workerInsuranceExempt?: boolean;
    claimError?: string;
    contractorTotal30?: string;
    employerInsurance30?: string;
    contractorTotal30Error?: string;
    contractorWorkerCount: string;
    contractorTotal?: string;
    employerInsurance31?: string;
    contractorTotalError?: string;
    excludedBonusItems: string[];
    insuranceItems?: string[];
}

function escapeHtml(value: string) {
    return value.replace(/[&<>"']/g, (character) => {
        const entities: Record<string, string> = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;',
        };
        return entities[character];
    });
}

export function buildGroupCalculationPdfHtml(
    sections: GroupCalculationPdfSection[],
    metadata: GroupCalculationPdfMetadata[],
    includeDetails: boolean,
    assets: GroupCalculationPdfAssets,
    wageTotal?: GroupCalculationPdfWageTotal,
    colorMode: 'monochrome' | 'color' = 'monochrome',
    palette: ThemePalette = 'default',
    paletteTone?: ThemePaletteTone | null,
) {
    const summaryRows = sections.map((section) => `
        <tr class="calculation-result-row result-main-row">
            <th scope="row">${escapeHtml(section.title)}</th>
            <td class="${section.error ? 'error-text' : 'amount'}">${escapeHtml(section.error ?? section.amount)}</td>
        </tr>
        ${section.insuranceSummary && !section.error ? `
            <tr class="insurance-summary-row result-subrow-even">
                <th scope="row">مبنای مشمول بیمه</th>
                <td>${escapeHtml(section.insuranceSummary.baseAmount)}</td>
            </tr>
            <tr class="insurance-summary-row worker-insurance-row result-subrow-odd">
                <th scope="row">سهم بیمهٔ کارگر (۷٪${section.insuranceSummary.workerExempt ? '، معاف' : ''})</th>
                <td>${escapeHtml(section.insuranceSummary.workerAmount)}</td>
            </tr>
            <tr class="insurance-summary-row employer-insurance-row result-subrow-even">
                <th scope="row">سهم بیمهٔ کارفرما (۲۳٪)</th>
                <td>${escapeHtml(section.insuranceSummary.employerAmount)}</td>
            </tr>
            <tr class="insurance-summary-row result-subrow-odd">
                <th scope="row">مبلغ پس از کسر سهم بیمهٔ کارگر</th>
                <td>${escapeHtml(section.insuranceSummary.netAmount)}</td>
            </tr>
        ` : ''}
    `).join('');
    const wageTotalRow = wageTotal ? `
        <tr class="wage-total-row wage-total-primary result-main-row">
            <th>جمع حقوق و مزایای محاسبه‌شده در بازه</th>
            <td class="${wageTotal.error ? 'error-text' : 'amount'}">${escapeHtml(wageTotal.error ?? wageTotal.amount)}</td>
        </tr>
        ${wageTotal.amountPaid !== undefined ? `
            <tr class="wage-total-row wage-detail-row result-subrow-even">
                <th>مبلغ پرداخت‌شده به کارگر در بازهٔ زمانی انتخابی</th>
                <td class="amount">${escapeHtml(wageTotal.amountPaid)}</td>
            </tr>
            <tr class="wage-total-row wage-detail-row result-main-row result-main-list-row">
                <th>ماندهٔ حقوق و مزایا پس از کسر مبلغ پرداخت‌شده</th>
                <td class="${wageTotal.claimError ? 'error-text' : 'amount'}">${escapeHtml(wageTotal.claimError ?? wageTotal.remainingClaim ?? 'محاسبه نشده')}</td>
            </tr>
            <tr class="wage-total-row worker-insurance-row result-main-row result-main-list-row">
                <th>۷٪ بیمه سهم کارگر از اقلام مشمول${wageTotal.workerInsuranceExempt ? ' (معاف)' : ''}</th>
                <td class="${wageTotal.claimError ? 'error-text' : 'amount'}">${escapeHtml(wageTotal.claimError ?? wageTotal.workerInsuranceAmount ?? 'محاسبه نشده')}</td>
            </tr>
            ${wageTotal.employerInsuranceAmount !== undefined ? `
                <tr class="wage-total-row employer-insurance-row result-main-row result-main-list-row">
                    <th>۲۳٪ بیمه سهم کارفرما از اقلام مشمول</th>
                    <td class="amount">${escapeHtml(wageTotal.employerInsuranceAmount)}</td>
                </tr>
            ` : ''}
            ${wageTotal.insuranceItems && wageTotal.insuranceItems.length > 0 ? `
                <tr class="wage-total-note-row insurance-items-row result-subrow-even">
                    <td colspan="2">
                        <strong>فهرست اقلام مشمول بیمه</strong>
                        <ul>${wageTotal.insuranceItems.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
                    </td>
                </tr>
            ` : ''}
            <tr class="wage-total-row final-claim-row result-main-row">
                <th>${wageTotal.workerInsuranceExempt
                    ? 'ماندهٔ حقوق و مزایا با اعمال معافیت از سهم بیمهٔ کارگر'
                    : 'ماندهٔ حقوق و مزایا پس از کسر ۷٪ سهم بیمهٔ کارگر'}</th>
                <td class="${wageTotal.claimError ? 'error-text' : 'amount'}">${escapeHtml(wageTotal.claimError ?? wageTotal.finalClaim ?? 'محاسبه نشده')}</td>
            </tr>
        ` : ''}
        <tr class="wage-total-row contractor-total-row contractor-total-30 result-main-row">
            <th>هزینهٔ ماهانهٔ ۳۰ روز برای ${escapeHtml(wageTotal.contractorWorkerCount)} کارگر، با سهم بیمهٔ کارفرما</th>
            <td class="${wageTotal.contractorTotal30Error ? 'error-text' : 'amount'}">${escapeHtml(wageTotal.contractorTotal30Error ?? wageTotal.contractorTotal30 ?? 'محاسبه نشده')}</td>
        </tr>
        ${wageTotal.employerInsurance30 ? `
            <tr class="wage-total-note-row result-subrow-even">
                <td colspan="2">شامل ۲۳٪ بیمه سهم کارفرما: ${escapeHtml(wageTotal.employerInsurance30)}</td>
            </tr>
        ` : ''}
        <tr class="wage-total-row contractor-total-row contractor-total-31 result-main-row">
            <th>هزینهٔ ماهانهٔ ۳۱ روز برای ${escapeHtml(wageTotal.contractorWorkerCount)} کارگر، با سهم بیمهٔ کارفرما</th>
            <td class="${wageTotal.contractorTotalError ? 'error-text' : 'amount'}">${escapeHtml(wageTotal.contractorTotalError ?? wageTotal.contractorTotal ?? 'محاسبه نشده')}</td>
        </tr>
        ${wageTotal.employerInsurance31 ? `
            <tr class="wage-total-note-row result-subrow-even">
                <td colspan="2">شامل ۲۳٪ بیمه سهم کارفرما: ${escapeHtml(wageTotal.employerInsurance31)}</td>
            </tr>
        ` : ''}
        ${wageTotal.excludedBonusItems.length > 0 ? `
            <tr class="wage-total-note-row result-subrow-even">
                <td colspan="2">این جمع شامل ${wageTotal.excludedBonusItems.map((title) => `«${escapeHtml(title)}»`).join(' و ')} نمی‌شود.</td>
            </tr>
        ` : ''}
    ` : '';
    const hasSectionDetails = includeDetails && sections.some((section) => section.details.length > 0);
    const sectionDetails = hasSectionDetails ? `
        <h2 class="pdf-section-title details-section-title">جزئیات محاسبات</h2>
        ${sections.map((section) => {
        const detailRows = section.details.map((detail) => `
            <tr class="detail-period-heading result-main-row">
                <th colspan="2">${escapeHtml(detail.title)}</th>
            </tr>
            ${detail.rows.map((row, rowIndex) => `
                <tr class="${rowIndex % 2 === 0 ? 'result-subrow-even' : 'result-subrow-odd'}">
                    ${row.label
                        ? `<th scope="row">${escapeHtml(row.label)}</th><td>${escapeHtml(row.value)}</td>`
                        : `<td colspan="2">${escapeHtml(row.value)}</td>`}
                </tr>
            `).join('')}
        `).join('');

        return `
            <section class="calculation-section">
                ${section.details.length > 0 ? `
                    <h3 class="details-title">${escapeHtml(section.title)} · ${escapeHtml(section.detailsTitle)}</h3>
                    <table class="detail-table">
                        <thead><tr><th>عنوان</th><th>مقدار</th></tr></thead>
                        <tbody>${detailRows}</tbody>
                    </table>
                ` : ''}
            </section>
        `;
        }).join('')}
    ` : '';
    const inputMetadata = metadata.filter((item) => item.section !== 'تاریخ تهیه');
    const metadataGroups = inputMetadata.reduce<{ section?: string; items: GroupCalculationPdfMetadata[] }[]>((groups, item) => {
        const currentGroup = groups[groups.length - 1];
        if (currentGroup && currentGroup.section === item.section) {
            currentGroup.items.push(item);
        } else {
            groups.push({ section: item.section, items: [item] });
        }
        return groups;
    }, []);
    const metadataRows = metadataGroups.map((group) => `
        <tbody>
            ${group.section ? `<tr class="metadata-section-row result-main-row"><th colspan="2">${escapeHtml(group.section)}</th></tr>` : ''}
            ${group.items.map((item, index) => `
                <tr class="${index % 2 === 0 ? 'result-subrow-even' : 'result-subrow-odd'}">
                    <th scope="row">${escapeHtml(item.label)}</th>
                    <td>${escapeHtml(item.value)}</td>
                </tr>
            `).join('')}
        </tbody>
    `).join('');
    const fontFaces = assets.regularFont
        ? `
        @font-face {
            font-family: "IRANSansX";
            src: url("${escapeHtml(assets.regularFont)}") format("truetype");
            font-style: normal;
            font-weight: 400;
        }
        @font-face {
            font-family: "IRANSansX";
            src: url("${escapeHtml(assets.mediumFont ?? assets.regularFont)}") format("truetype");
            font-style: normal;
            font-weight: 500;
        }
        @font-face {
            font-family: "IRANSansX";
            src: url("${escapeHtml(assets.semiBoldFont ?? assets.regularFont)}") format("truetype");
            font-style: normal;
            font-weight: 600;
        }
        @font-face {
            font-family: "IRANSansX";
            src: url("${escapeHtml(assets.boldFont ?? assets.regularFont)}") format("truetype");
            font-style: normal;
            font-weight: 700;
        }`
        : '';
    const bodyFontFamily = assets.regularFont ? '"IRANSansX", sans-serif' : 'system-ui, sans-serif';
    const colorStyles = colorMode === 'color'
        ? (() => {
            const colors = getAppColorPalette(palette, 'light', paletteTone);
            return `
                :root {
                    --pdf-text: ${colors.text};
                    --pdf-text-secondary: ${colors.textSecondary};
                    --pdf-text-muted: ${colors.textMuted};
                    --pdf-surface: ${colors.surface};
                    --pdf-surface-variant: ${colors.surfaceVariant};
                    --pdf-surface-container: ${colors.surfaceContainerLow};
                    --pdf-border: ${colors.border};
                    --pdf-border-strong: ${colors.borderStrong};
                    --pdf-primary: ${colors.primary};
                    --pdf-on-primary: ${colors.onPrimary};
                    --pdf-about-on-primary: ${colors.onPrimary};
                    --pdf-primary-container: ${colors.primaryContainer};
                    --pdf-on-primary-container: ${colors.onPrimaryContainer};
                    --pdf-error: ${colors.primary};
                    --pdf-error-fill: ${colors.primaryContainer};
                    --pdf-on-error-fill: ${colors.onPrimaryContainer};
                    --pdf-warning: ${colors.primary};
                    --pdf-warning-fill: ${colors.primaryContainer};
                    --pdf-on-warning: ${colors.onPrimaryContainer};
                }
                body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                .watermark {
                    display: block;
                    position: fixed;
                    z-index: 0;
                    top: 50%;
                    left: 50%;
                    width: 220px;
                    height: 220px;
                    transform: translate(-50%, -50%);
                    background-color: var(--pdf-primary);
                    -webkit-mask: url("${escapeHtml(assets.logo)}") center / contain no-repeat;
                    mask: url("${escapeHtml(assets.logo)}") center / contain no-repeat;
                    opacity: 0.06;
                    pointer-events: none;
                }
                .header-logo-wrap {
                    border-color: var(--pdf-primary);
                    background-color: var(--pdf-primary);
                }
                .header-logo-wrap, .about-logo-frame, .page-footer-logo {
                    border-color: var(--pdf-primary);
                    background: var(--pdf-primary);
                }
                .generated { background: var(--pdf-surface-container); }
                header { background: var(--pdf-surface-container); }
                .page-footer { background: var(--pdf-surface-container); }
                .metadata-table thead th, .summary thead th, .detail-table thead th {
                    color: var(--pdf-on-primary);
                    background: var(--pdf-primary);
                    border-color: var(--pdf-primary);
                }
                .metadata-table .metadata-section-row th {
                    color: var(--pdf-on-primary-container);
                    background: var(--pdf-primary-container);
                    border-color: var(--pdf-border);
                }
                .pdf-section-title, .details-title { color: var(--pdf-primary); }
                .detail-table .detail-period-heading th {
                    color: var(--pdf-on-primary-container);
                    background: var(--pdf-primary-container);
                    border-color: var(--pdf-border);
                }
                .about-section {
                    background: var(--pdf-surface-container);
                    border-top-color: var(--pdf-primary);
                }
                .about-item { background: var(--pdf-surface); }
                .error-text { color: var(--pdf-error); text-decoration-color: var(--pdf-error); }
                .note {
                    border-color: var(--pdf-warning);
                    color: var(--pdf-on-warning);
                    background: var(--pdf-warning-fill);
                }
                .page-footer { border-color: var(--pdf-border-strong); }
                .page-footer-logo {
                    border-color: var(--pdf-primary);
                    background: var(--pdf-primary);
                }
            `;
        })()
        : '';
    const resultColors = colorMode === 'color'
        ? (() => {
            const colors = getAppColorPalette(palette, 'light', paletteTone);
            return {
                primary: colors.primary,
                onPrimary: colors.onPrimary,
                resultHeader: colors.primary,
                onResultHeader: colors.onPrimary,
                primaryContainer: colors.primaryContainer,
                onPrimaryContainer: colors.onPrimaryContainer,
                surface: colors.surface,
                surfaceVariant: colors.surfaceVariant,
                text: colors.text,
                textSecondary: colors.textSecondary,
                border: colors.border,
            };
        })()
        : {
            primary: '#111111',
            onPrimary: '#FFFFFF',
            resultHeader: '#333333',
            onResultHeader: '#FFFFFF',
            primaryContainer: '#E8E8E8',
            onPrimaryContainer: '#111111',
            surface: '#FFFFFF',
            surfaceVariant: '#F2F2F2',
            text: '#111111',
            textSecondary: '#333333',
            border: '#777777',
        };
    const resultStyles = `
        :root {
            --pdf-result-primary: ${resultColors.primary};
            --pdf-result-header: ${resultColors.resultHeader};
            --pdf-result-on-header: ${resultColors.onResultHeader};
            --pdf-result-on-primary: ${resultColors.onPrimary};
            --pdf-result-primary-container: ${resultColors.primaryContainer};
            --pdf-result-on-primary-container: ${resultColors.onPrimaryContainer};
            --pdf-result-surface: ${resultColors.surface};
            --pdf-result-surface-variant: ${resultColors.surfaceVariant};
            --pdf-result-text: ${resultColors.text};
            --pdf-result-text-secondary: ${resultColors.textSecondary};
            --pdf-result-border: ${resultColors.border};
        }
        .results-summary .result-main-row th,
        .results-summary .result-main-row td {
            color: var(--pdf-result-on-primary-container);
            background: var(--pdf-result-primary-container);
            border-color: var(--pdf-result-border);
            font-weight: bold;
        }
        .detail-table .result-main-row th {
            color: var(--pdf-result-on-primary-container);
            background: var(--pdf-result-primary-container);
            border-color: var(--pdf-result-border);
            font-weight: bold;
        }
        .metadata-table .result-main-row th {
            color: var(--pdf-result-on-primary-container);
            background: var(--pdf-result-primary-container);
            border-color: var(--pdf-result-border);
            font-weight: bold;
        }
        .results-summary .result-main-row th:first-child,
        .results-summary .result-main-row td[colspan="2"],
        .detail-table .result-main-row th,
        .metadata-table .result-main-row th {
            border-right: 3px solid var(--pdf-result-primary);
        }
        .results-summary .result-main-row td.error-text {
            color: var(--pdf-result-on-primary-container);
            background: var(--pdf-result-primary-container);
            text-decoration: none;
        }
        .results-summary .result-main-list-row th {
            position: relative;
            padding-right: 20px;
        }
        .results-summary .result-main-list-row th::before {
            position: absolute;
            right: 7px;
            content: "•";
            color: var(--pdf-result-primary);
        }
        .results-summary .result-subrow-even th,
        .results-summary .result-subrow-even td,
        .results-summary .result-subrow-even td.error-text,
        .detail-table .result-subrow-even th,
        .detail-table .result-subrow-even td,
        .metadata-table .result-subrow-even th,
        .metadata-table .result-subrow-even td {
            color: var(--pdf-result-text);
            background: var(--pdf-result-surface);
            border-color: var(--pdf-result-border);
            text-decoration: none;
        }
        .results-summary .result-subrow-odd th,
        .results-summary .result-subrow-odd td,
        .results-summary .result-subrow-odd td.error-text,
        .detail-table .result-subrow-odd th,
        .detail-table .result-subrow-odd td,
        .metadata-table .result-subrow-odd th,
        .metadata-table .result-subrow-odd td {
            color: var(--pdf-result-text);
            background: var(--pdf-result-surface-variant);
            border-color: var(--pdf-result-border);
            text-decoration: none;
        }
        .results-summary .result-subrow-even th,
        .results-summary .result-subrow-odd th,
        .detail-table .result-subrow-even th,
        .detail-table .result-subrow-odd th,
        .metadata-table .result-subrow-even th,
        .metadata-table .result-subrow-odd th { font-weight: normal; }
        .results-summary .result-subrow-even th,
        .results-summary .result-subrow-odd th,
        .detail-table .result-subrow-even th,
        .detail-table .result-subrow-odd th,
        .metadata-table .result-subrow-even th,
        .metadata-table .result-subrow-odd th,
        .results-summary tr.result-subrow-even:not(.insurance-items-row) td[colspan="2"],
        .results-summary tr.result-subrow-odd:not(.insurance-items-row) td[colspan="2"],
        .detail-table tr.result-subrow-even td[colspan="2"],
        .detail-table tr.result-subrow-odd td[colspan="2"],
        .metadata-table tr.result-subrow-even td[colspan="2"],
        .metadata-table tr.result-subrow-odd td[colspan="2"] {
            position: relative;
            padding-right: 20px;
        }
        .results-summary .result-subrow-even th::before,
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
            content: "•";
            color: var(--pdf-result-primary);
        }
        .results-summary {
            border: 1px solid var(--pdf-border);
            border-collapse: separate;
            border-spacing: 0;
            border-radius: 8px;
            overflow: hidden;
        }
        .results-summary thead th {
            padding: 8px 10px;
            color: var(--pdf-result-on-header);
            background: var(--pdf-result-header);
            border-color: var(--pdf-result-header);
            font-weight: bold;
        }
        .results-summary thead th:first-child { width: 58%; }
        .results-summary thead th:last-child { width: 42%; }
        .results-summary .calculation-result-row td.amount,
        .results-summary .calculation-result-row td.error-text {
            text-align: left;
            white-space: nowrap;
        }
        .results-summary .insurance-summary-row th,
        .results-summary .insurance-summary-row td {
            font-size: 10px;
        }
        .results-summary .wage-total-note-row td {
            font-size: 9px;
        }
        .results-summary .insurance-items-row td {
            text-align: right;
        }
        .results-summary .insurance-items-row strong { display: block; margin-bottom: 3px; }
        .results-summary .insurance-items-row ul {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 2px 18px;
            margin: 0;
            padding: 0 18px 0 0;
        }
        .results-summary .insurance-items-row li { padding-right: 1px; }
    `;
    return `<!doctype html>
<html lang="fa" dir="rtl">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>پهناور کار - گزارش حقوق و مزایا</title>
    <style>
        :root {
            color-scheme: light;
            --pdf-page-bg: #ffffff;
            --pdf-text: #111111;
            --pdf-text-secondary: #333333;
            --pdf-text-muted: #444444;
            --pdf-surface-variant: #f2f2f2;
            --pdf-border: #777777;
            --pdf-primary: #111111;
            --pdf-on-primary: #111111;
            --pdf-about-on-primary: #ffffff;
            --pdf-error: #111111;
            --pdf-warning: #111111;
            --pdf-warning-fill: #ffffff;
            --pdf-on-warning: #111111;
        }
        ${fontFaces}
        @page { size: A4; margin: 15mm; }
        * { box-sizing: border-box; }
        body {
            margin: 0;
            color: var(--pdf-text);
            background: var(--pdf-page-bg);
            font-family: ${bodyFontFamily};
            font-size: 11px;
            line-height: 1.9;
            -webkit-print-color-adjust: economy;
            print-color-adjust: economy;
        }
        .watermark { display: none; }
        main { position: relative; z-index: 1; }
        header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            margin-bottom: 14px;
            padding: 10px 12px;
            border: 1px solid var(--pdf-border);
            border-right: 3px solid var(--pdf-primary);
            border-radius: 8px;
            background: var(--pdf-surface-variant);
        }
        .header-brand { display: flex; flex: 1; align-items: center; gap: 9px; min-width: 0; }
        .header-logo-wrap, .about-logo-frame, .page-footer-logo {
            border: 1px solid var(--pdf-border);
            background: #ffffff;
        }
        .header-logo-wrap {
            display: flex;
            width: 44px;
            height: 44px;
            align-items: center;
            justify-content: center;
            padding: 3px;
            overflow: hidden;
            border-radius: 50%;
        }
        .header-logo { width: 100%; height: 100%; border-radius: 50%; object-fit: contain; }
        .header-logo, .about-logo, .page-footer-logo { filter: none; }
        .brand { color: var(--pdf-primary); font-size: 17px; font-weight: bold; }
        h1 { margin: 1px 0 0; color: var(--pdf-text-secondary); font-size: 11px; font-weight: normal; }
        .generated {
            flex: 0 0 auto;
            max-width: 150px;
            padding: 5px 8px;
            border: 1px solid var(--pdf-border);
            border-radius: 6px;
            color: var(--pdf-text-secondary);
            background: var(--pdf-surface-variant);
            text-align: right;
            direction: rtl;
            font-size: 8px;
            line-height: 1.7;
        }
        .generated-label { display: block; margin-bottom: 2px; color: var(--pdf-primary); font-weight: bold; }
        .generated strong { display: block; white-space: nowrap; font-weight: normal; }
        .metadata-table {
            width: 100%;
            margin: 14px 0;
            border: 1px solid var(--pdf-border);
            border-collapse: separate;
            border-spacing: 0;
            border-radius: 8px;
            overflow: hidden;
            page-break-inside: auto;
        }
        .metadata-table th, .metadata-table td, .summary th, .summary td {
            padding: 6px 9px;
            border: 1px solid var(--pdf-border);
            text-align: right;
            vertical-align: top;
            overflow-wrap: anywhere;
        }
        .metadata-table thead { display: table-header-group; }
        .metadata-table thead th { color: var(--pdf-text); background: #ffffff; border-bottom: 2px solid var(--pdf-text); }
        .metadata-table tbody th[scope="row"] { width: 58%; color: var(--pdf-text-muted); font-weight: normal; }
        .metadata-table .metadata-section-row th {
            color: var(--pdf-text);
            background: #ffffff;
            border-top: 1px solid var(--pdf-text);
            font-weight: bold;
        }
        .metadata-table tr { page-break-inside: avoid; }
        .pdf-section-title {
            margin: 10px 0 5px;
            padding: 4px 8px;
            border: 1px solid var(--pdf-border);
            border-right: 2px solid var(--pdf-primary);
            border-radius: 5px;
            color: var(--pdf-text);
            background: var(--pdf-surface-variant);
            font-size: 10px;
            line-height: 1.6;
        }
        .details-section-title { margin-top: 20px; }
        .results-section-title { margin-top: 20px; }
        .summary { width: 100%; border-collapse: collapse; margin: 0 0 20px; }
        .summary thead { display: table-header-group; }
        .summary thead th { color: var(--pdf-text); background: #ffffff; border-bottom: 2px solid var(--pdf-text); }
        .summary td:last-child { width: 42%; }
        .summary .insurance-summary-row th, .summary .insurance-summary-row td {
            color: var(--pdf-text-muted);
            background: var(--pdf-surface-variant);
            font-size: 10px;
        }
        .summary .insurance-summary-row th {
            font-weight: normal;
        }
        .summary .wage-total-row th, .summary .wage-total-row td {
            color: var(--pdf-text);
            background: #ffffff;
            border-top: 1px solid var(--pdf-text);
        }
        .summary .wage-total-row th { font-weight: bold; }
        .summary .wage-total-row td.amount, .summary .wage-total-row td.error-text { color: var(--pdf-text); font-weight: bold; }
        .summary .contractor-total-row th, .summary .contractor-total-row td {
            color: var(--pdf-text);
            background: #ffffff;
            border-top: 2px solid var(--pdf-text);
        }
        .summary .contractor-total-row th { font-weight: bold; }
        .summary .contractor-total-row td.amount, .summary .contractor-total-row td.error-text { color: var(--pdf-text); font-size: 12px; font-weight: bold; }
        .summary .wage-total-note-row td { color: var(--pdf-text-muted); font-size: 9px; }
        .amount { color: var(--pdf-text); font-weight: bold; }
        .error-text { color: var(--pdf-error); font-weight: bold; text-decoration: underline; text-decoration-style: dotted; }
        .calculation-section { margin: 0 0 16px; }
        .calculation-section + .calculation-section { margin-top: 18px; }
        .details-title {
            margin: 8px 0 5px;
            padding-right: 7px;
            border-right: 2px solid var(--pdf-primary);
            color: var(--pdf-text);
            font-size: 9px;
            line-height: 1.5;
            font-weight: bold;
        }
        .detail-table {
            width: 100%;
            border: 1px solid var(--pdf-border);
            border-collapse: separate;
            border-spacing: 0;
            border-radius: 8px;
            overflow: hidden;
            page-break-inside: auto;
            font-size: 9px;
            line-height: 1.5;
        }
        .detail-table thead { display: table-header-group; }
        .detail-table thead th {
            padding: 3px 6px;
            border: 1px solid var(--pdf-border);
            color: var(--pdf-text);
            background: #ffffff;
            border-bottom: 1px solid var(--pdf-text);
            text-align: right;
            font-weight: normal;
        }
        .detail-table th, .detail-table td {
            width: 50%;
            padding: 2px 6px;
            border: 1px solid var(--pdf-border);
            text-align: right;
            vertical-align: top;
            overflow-wrap: anywhere;
        }
        .detail-table tbody th[scope="row"] { color: var(--pdf-text-muted); font-weight: normal; }
        .detail-table .detail-period-heading th {
            padding: 3px 6px;
            color: var(--pdf-text);
            background: #ffffff;
            border-top: 1px solid var(--pdf-text);
            font-weight: bold;
            text-align: right;
        }
        .detail-table tbody tr { page-break-inside: avoid; }
        .note {
            margin-top: 20px;
            padding: 10px 12px;
            border: 1px solid var(--pdf-border);
            border-right: 3px solid var(--pdf-text);
            border-radius: 6px;
            color: var(--pdf-text);
            background: #ffffff;
        }
        .about-section {
            margin-top: 20px;
            padding: 12px;
            border: 1px solid var(--pdf-border);
            border-radius: 8px;
            background: #ffffff;
            page-break-inside: avoid;
        }
        .about-brand-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
        .about-logo-frame {
            display: flex;
            width: 34px;
            height: 34px;
            flex: 0 0 34px;
            align-items: center;
            justify-content: center;
            padding: 4px;
            border-radius: 50%;
        }
        .about-logo { width: 100%; height: 100%; object-fit: contain; }
        .about-brand-copy { flex: 1; }
        .about-brand-name { color: var(--pdf-text); font-size: 10px; font-weight: bold; }
        .about-brand-caption { color: var(--pdf-text-secondary); font-size: 8px; }
        .about-section h2 { margin: 0 0 4px; color: var(--pdf-text); font-size: 14px; }
        .about-intro { margin: 0 0 8px; color: var(--pdf-text-secondary); font-size: 10px; }
        .about-intro-tag {
            display: inline-block;
            margin-bottom: 10px;
            padding: 2px 8px;
            border-radius: 999px;
            color: var(--pdf-about-on-primary);
            background: var(--pdf-primary);
            font-size: 8px;
        }
        .about-timeline { display: flex; flex-direction: column; gap: 6px; }
        .about-entry { display: flex; align-items: stretch; gap: 7px; page-break-inside: avoid; }
        .about-rail { display: flex; width: 26px; flex: 0 0 26px; flex-direction: column; align-items: center; }
        .about-marker {
            display: flex;
            width: 24px;
            height: 24px;
            align-items: center;
            justify-content: center;
            border: 1px solid var(--pdf-primary);
            border-radius: 50%;
            color: var(--pdf-about-on-primary);
            background: var(--pdf-primary);
            font-size: 8px;
            font-weight: bold;
        }
        .about-connector { width: 1px; flex: 1; min-height: 5px; background: var(--pdf-border); }
        .about-entry:last-child .about-connector { display: none; }
        .about-item {
            flex: 1;
            padding: 6px 8px;
            border: 1px solid var(--pdf-border);
            border-radius: 6px;
            background: #ffffff;
            page-break-inside: avoid;
        }
        .about-item-heading { display: flex; flex-direction: column; gap: 1px; margin-bottom: 2px; }
        .about-item-label { color: var(--pdf-primary); font-size: 8px; }
        .about-item h3 { margin: 0; color: var(--pdf-text); font-size: 10px; }
        .about-item p { margin: 0; color: var(--pdf-text-secondary); font-size: 9px; line-height: 1.7; }
        .document-attribution {
            margin: 12px 0 0;
            color: var(--pdf-text-muted);
            font-size: 9px;
            text-align: center;
        }
        .page-footer {
            display: grid;
            grid-template-columns: 1fr auto;
            align-items: center;
            gap: 6px 10px;
            margin-top: 12px;
            padding: 8px 10px;
            border: 1px solid var(--pdf-border);
            border-top: 2px solid var(--pdf-primary);
            border-radius: 7px;
            color: var(--pdf-text-secondary);
            font-size: 8px;
            line-height: 1.5;
            text-align: right;
        }
        .page-footer-brand {
            display: inline-flex;
            flex: 0 0 auto;
            align-items: center;
            gap: 5px;
            color: var(--pdf-primary);
            font-size: 9px;
            font-weight: bold;
            white-space: nowrap;
        }
        .page-footer-logo {
            width: 24px;
            height: 24px;
            padding: 2px;
            border-radius: 50%;
        }
        .page-footer-rights { grid-column: 1 / -1; padding-top: 5px; border-top: 1px solid var(--pdf-border); }
        .page-footer-promo {
            grid-column: 1 / 2;
            color: var(--pdf-primary);
            font-weight: bold;
        }
        .page-footer-website {
            grid-column: 2 / 3;
            grid-row: 1;
            color: var(--pdf-primary);
            direction: ltr;
            unicode-bidi: isolate;
            text-decoration: underline;
            text-underline-offset: 2px;
            font-weight: bold;
            white-space: nowrap;
        }
        ${colorStyles}
        ${resultStyles}
    </style>
</head>
<body>
    <div class="watermark" aria-hidden="true"></div>
    <main>
    <header>
        <div class="header-brand">
            <span class="header-logo-wrap">
                <img class="header-logo" src="${escapeHtml(assets.logo)}" alt="لوگوی پهناور کار">
            </span>
            <div class="header-copy">
                <div class="brand">پهناور کار</div>
                <h1>گزارش محاسبات حقوق و مزایا</h1>
            </div>
        </div>
        <div class="generated">
            <span class="generated-label">تاریخ تهیه</span>
            <strong>شمسی: ${escapeHtml(metadata.find((item) => item.label === 'تاریخ شمسی')?.value ?? '')}</strong>
            <strong>میلادی: ${escapeHtml(metadata.find((item) => item.label === 'تاریخ میلادی')?.value ?? '')}</strong>
            <strong>ساعت: ${escapeHtml(metadata.find((item) => item.label === 'ساعت تهیه')?.value ?? '')}</strong>
        </div>
    </header>
    <h2 class="pdf-section-title">ورودی‌های محاسبه</h2>
    <table class="metadata-table">
        <thead><tr><th>عنوان</th><th>مقدار</th></tr></thead>
        ${metadataRows}
    </table>
    <h2 class="pdf-section-title results-section-title">نتایج محاسبات</h2>
    <table class="summary results-summary">
        <thead><tr><th>عنوان محاسبه</th><th>نتیجه نهایی</th></tr></thead>
        <tbody>${summaryRows}${wageTotalRow}</tbody>
    </table>
    ${sectionDetails}
    <div class="note">
        این سند گزارش محاسبات جامع است و جایگزین سند رسمی صادرشده از سوی کارفرما نیست.
    </div>
    <div class="document-attribution">این گزارش به‌صورت خودکار از نتایج محاسبه‌شده در پهناور کار تهیه شده است.</div>
    <section class="about-section">
        <div class="about-brand-row">
            <span class="about-logo-frame">
                <img class="about-logo" src="${escapeHtml(assets.logo)}" alt="">
            </span>
            <span class="about-brand-copy">
                <span class="about-brand-name">پهناور کار</span><br>
                <span class="about-brand-caption">دربارهٔ ما</span>
            </span>
        </div>
        <h2>ابزارهای محاسباتی حقوق و دستمزد، همراه با اطلاعات مزدی</h2>
        <p class="about-intro">
            پهناور کار مجموعه‌ای از ابزارهای محاسباتی مرتبط با حقوق و مزایا، اطلاعات مصوبات مزدی و امکانات حساب کاربری را در یک برنامه گرد هم آورده است.
        </p>
        <span class="about-intro-tag">محاسبات و اطلاعات حوزهٔ کار</span>
        <div class="about-timeline">
            <div class="about-entry">
                <span class="about-rail"><span class="about-marker">۱</span><span class="about-connector"></span></span>
                <div class="about-item">
                    <div class="about-item-heading"><span class="about-item-label">محاسبه</span><h3>ابزارهای محاسباتی حقوق و کار</h3></div>
                    <p>ابزارهایی برای برآورد حقوق پایه، مزایا، اضافه‌کاری، عیدی، سنوات، مرخصی، بیمه و برخی دیگر از موضوعات مرتبط با کار.</p>
                </div>
            </div>
            <div class="about-entry">
                <span class="about-rail"><span class="about-marker">۲</span><span class="about-connector"></span></span>
                <div class="about-item">
                    <div class="about-item-heading"><span class="about-item-label">اطلاعات</span><h3>اطلاعات مزدی و مبانی محاسبه</h3></div>
                    <p>اطلاعات مصوبات مزدی از سال ۱۳۶۹ تاکنون در کنار ابزارهایی قرار گرفته که بر اساس داده‌های ورودی و مبانی مرتبط، نتیجهٔ محاسبه را نمایش می‌دهند.</p>
                </div>
            </div>
            <div class="about-entry">
                <span class="about-rail"><span class="about-marker">۳</span><span class="about-connector"></span></span>
                <div class="about-item">
                    <div class="about-item-heading"><span class="about-item-label">کتابخانهٔ قوانین</span><h3>قوانین و مقررات</h3></div>
                    <p>کتابخانهٔ قوانین و مقررات مرتبط با کار و تأمین اجتماعی، همراه با امکان مرور دسته‌بندی‌ها و جست‌وجوی متن قوانین؛ دسترسی به این بخش به قابلیت پلن وابسته است.</p>
                </div>
            </div>
            <div class="about-entry">
                <span class="about-rail"><span class="about-marker">۴</span></span>
                <div class="about-item">
                    <div class="about-item-heading"><span class="about-item-label">امکانات</span><h3>امکانات حساب کاربری</h3></div>
                    <p>در کنار ابزارها، برنامه امکان مدیریت اشتراک، مشاهدهٔ سوابق مالی و اعلان‌های حساب، و استفاده از کیف پول برای پرداخت‌های پشتیبانی‌شده را فراهم می‌کند.</p>
                </div>
            </div>
        </div>
    </section>
    </main>
    <footer class="page-footer">
        <span class="page-footer-brand">
            <img class="page-footer-logo" src="${escapeHtml(assets.logo)}" alt="">
            <span>پهناور کار</span>
        </span>
        <a class="page-footer-website" href="https://pahnavarkar.ir" aria-label="وب‌سایت پهناورکار: pahnavarkar.ir">pahnavarkar.ir</a>
        <span class="page-footer-promo">محاسبات حقوق و مزایا با پهناور کار</span>
        <span class="page-footer-rights">حقوق مادی و معنوی قالب و محتوای اختصاصی این گزارش متعلق به پهناور کار است؛ بازنشر بدون اجازه مجاز نیست.</span>
    </footer>
</body>
</html>`;
}
