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
    finalClaim?: string;
    claimError?: string;
    contractorTotal30?: string;
    employerInsurance30?: string;
    contractorTotal30Error?: string;
    contractorWorkerCount: string;
    contractorTotal?: string;
    employerInsurance31?: string;
    contractorTotalError?: string;
    excludedBonusItems: string[];
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
) {
    const summaryRows = sections.map((section) => `
        <tr>
            <td>${escapeHtml(section.title)}</td>
            <td class="${section.error ? 'error-text' : 'amount'}">${escapeHtml(section.error ?? section.amount)}</td>
        </tr>
        ${section.insuranceSummary && !section.error ? `
            <tr class="insurance-summary-row">
                <th scope="row">مبنای مشمول بیمه</th>
                <td>${escapeHtml(section.insuranceSummary.baseAmount)}</td>
            </tr>
            <tr class="insurance-summary-row">
                <th scope="row">سهم بیمهٔ کارگر (۷٪${section.insuranceSummary.workerExempt ? '، معاف' : ''})</th>
                <td>${escapeHtml(section.insuranceSummary.workerAmount)}</td>
            </tr>
            <tr class="insurance-summary-row">
                <th scope="row">سهم بیمهٔ کارفرما (۲۳٪)</th>
                <td>${escapeHtml(section.insuranceSummary.employerAmount)}</td>
            </tr>
            <tr class="insurance-summary-row">
                <th scope="row">مبلغ پس از کسر سهم بیمهٔ کارگر</th>
                <td>${escapeHtml(section.insuranceSummary.netAmount)}</td>
            </tr>
        ` : ''}
    `).join('');
    const wageTotalRow = wageTotal ? `
        <tr class="wage-total-row">
            <th>جمع حقوق و مزایای محاسبه‌شده در بازه</th>
            <td class="${wageTotal.error ? 'error-text' : 'amount'}">${escapeHtml(wageTotal.error ?? wageTotal.amount)}</td>
        </tr>
        ${wageTotal.amountPaid !== undefined ? `
            <tr class="wage-total-row">
                <th>مبلغ پرداخت‌شده به کارگر در بازهٔ زمانی انتخابی</th>
                <td class="amount">${escapeHtml(wageTotal.amountPaid)}</td>
            </tr>
            <tr class="wage-total-row">
                <th>ماندهٔ حقوق و مزایا پس از کسر مبلغ پرداخت‌شده</th>
                <td class="${wageTotal.claimError ? 'error-text' : 'amount'}">${escapeHtml(wageTotal.claimError ?? wageTotal.remainingClaim ?? 'محاسبه نشده')}</td>
            </tr>
            <tr class="wage-total-row">
                <th>خالص ماندهٔ حقوق و مزایا پس از کسر ۷٪ سهم بیمهٔ کارگر</th>
                <td class="${wageTotal.claimError ? 'error-text' : 'amount'}">${escapeHtml(wageTotal.claimError ?? wageTotal.finalClaim ?? 'محاسبه نشده')}</td>
            </tr>
        ` : ''}
        <tr class="wage-total-row contractor-total-row">
            <th>هزینهٔ ماهانهٔ ۳۰ روز برای ${escapeHtml(wageTotal.contractorWorkerCount)} کارگر، با سهم بیمهٔ کارفرما</th>
            <td class="${wageTotal.contractorTotal30Error ? 'error-text' : 'amount'}">${escapeHtml(wageTotal.contractorTotal30Error ?? wageTotal.contractorTotal30 ?? 'محاسبه نشده')}</td>
        </tr>
        ${wageTotal.employerInsurance30 ? `
            <tr class="wage-total-note-row">
                <td colspan="2">سهم ۲۳٪ بیمهٔ کارفرما در هزینهٔ ماهانهٔ ۳۰ روزه: ${escapeHtml(wageTotal.employerInsurance30)}</td>
            </tr>
        ` : ''}
        <tr class="wage-total-row contractor-total-row">
            <th>هزینهٔ ماهانهٔ ۳۱ روز برای ${escapeHtml(wageTotal.contractorWorkerCount)} کارگر، با سهم بیمهٔ کارفرما</th>
            <td class="${wageTotal.contractorTotalError ? 'error-text' : 'amount'}">${escapeHtml(wageTotal.contractorTotalError ?? wageTotal.contractorTotal ?? 'محاسبه نشده')}</td>
        </tr>
        ${wageTotal.employerInsurance31 ? `
            <tr class="wage-total-note-row">
                <td colspan="2">سهم ۲۳٪ بیمهٔ کارفرما در هزینهٔ ماهانهٔ ۳۱ روزه: ${escapeHtml(wageTotal.employerInsurance31)}</td>
            </tr>
        ` : ''}
        ${wageTotal.excludedBonusItems.length > 0 ? `
            <tr class="wage-total-note-row">
                <td colspan="2">این جمع شامل ${wageTotal.excludedBonusItems.map((title) => `«${escapeHtml(title)}»`).join(' و ')} نمی‌شود.</td>
            </tr>
        ` : ''}
    ` : '';
    const sectionDetails = includeDetails ? sections.map((section) => {
        const detailRows = section.details.map((detail) => `
            <tr class="detail-period-heading">
                <th colspan="2">${escapeHtml(detail.title)}</th>
            </tr>
            ${detail.rows.map((row) => `
                <tr>
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
    }).join('') : '';
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
            ${group.section ? `<tr class="metadata-section-row"><th colspan="2">${escapeHtml(group.section)}</th></tr>` : ''}
            ${group.items.map((item) => `
                <tr>
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

    return `<!doctype html>
<html lang="fa" dir="rtl">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>پهناور کار - فیش حقوقی</title>
    <style>
        ${fontFaces}
        @page { size: A4; margin: 15mm; }
        * { box-sizing: border-box; }
        body {
            margin: 0;
            color: #172b35;
            background: #fff;
            font-family: ${bodyFontFamily};
            font-size: 11px;
            line-height: 1.9;
        }
        .watermark {
            position: fixed;
            z-index: 0;
            top: 50%;
            left: 50%;
            width: 320px;
            height: 320px;
            transform: translate(-50%, -50%);
            background-color: #26C6DA;
            background-image: url("${escapeHtml(assets.logo)}");
            background-position: center;
            background-size: contain;
            background-repeat: no-repeat;
            border-radius: 50%;
            opacity: 0.09;
            pointer-events: none;
        }
        main { position: relative; z-index: 1; }
        header {
            position: relative;
            text-align: center;
            padding: 0 0 16px;
            border-bottom: 3px solid #087e8b;
        }
        .header-brand { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; }
        .header-logo-wrap {
            display: flex;
            width: 38px;
            height: 38px;
            align-items: center;
            justify-content: center;
            overflow: hidden;
            border-radius: 10px;
            background-color: #26C6DA;
        }
        .header-logo { width: 100%; height: 100%; object-fit: contain; }
        .brand { color: #087e8b; font-size: 21px; font-weight: bold; }
        h1 { margin: 2px 0 0; font-size: 18px; }
        .generated {
            position: absolute;
            top: 0;
            left: 0;
            max-width: 150px;
            padding: 6px 9px;
            border: 1px solid #d9e3e6;
            border-radius: 7px;
            color: #4b6275;
            background: #f5f9fa;
            text-align: right;
            direction: rtl;
            font-size: 8px;
            line-height: 1.7;
        }
        .generated-label { display: block; margin-bottom: 2px; color: #087e8b; font-weight: bold; }
        .generated strong { display: block; white-space: nowrap; font-weight: normal; }
        .metadata-table {
            width: 100%;
            margin: 14px 0;
            border-collapse: collapse;
            page-break-inside: auto;
        }
        .metadata-table th, .metadata-table td {
            padding: 6px 9px;
            border: 1px solid #d9e3e6;
            text-align: right;
            vertical-align: top;
            overflow-wrap: anywhere;
        }
        .metadata-table thead { display: table-header-group; }
        .metadata-table thead th { color: #fff; background: #087e8b; }
        .metadata-table tbody tr:nth-child(even) { background: #f5f9fa; }
        .metadata-table tbody th[scope="row"] { width: 38%; color: #5b6d75; font-weight: normal; }
        .metadata-table .metadata-section-row th {
            color: #087e8b;
            background: #edf6f7;
            font-weight: bold;
        }
        .metadata-table tr { page-break-inside: avoid; }
        .pdf-section-title {
            margin: 18px 0 7px;
            padding-right: 8px;
            border-right: 3px solid #087e8b;
            color: #173d4a;
            font-size: 13px;
            line-height: 1.7;
        }
        .summary { width: 100%; border-collapse: collapse; margin: 12px 0 22px; }
        .summary th, .summary td {
            padding: 8px 10px;
            border: 1px solid #d9e3e6;
            text-align: right;
            vertical-align: top;
        }
        .summary thead { display: table-header-group; }
        .summary th { color: #fff; background: #087e8b; }
        .summary tbody tr:nth-child(even) { background: #f5f9fa; }
        .summary td:last-child { width: 42%; }
        .summary .insurance-summary-row th {
            color: #5b6d75;
            background: #f5f9fa;
            font-size: 10px;
            font-weight: normal;
        }
        .summary .insurance-summary-row td { font-size: 10px; }
        .summary .wage-total-row th, .summary .wage-total-row td {
            color: #fff;
            background: #087e8b;
        }
        .summary .wage-total-row th { font-weight: bold; }
        .summary .wage-total-row td.amount, .summary .wage-total-row td.error-text { color: #fff; font-weight: bold; }
        .summary .contractor-total-row th, .summary .contractor-total-row td {
            color: #fff;
            background: #087e8b;
            border-top: 2px solid #fff;
        }
        .summary .contractor-total-row th { font-weight: bold; }
        .summary .contractor-total-row td.amount, .summary .contractor-total-row td.error-text { color: #fff; font-size: 12px; font-weight: bold; }
        .summary .wage-total-note-row td { color: #5b6d75; font-size: 9px; }
        .amount { color: #087e8b; font-weight: bold; }
        .error-text { color: #b42318; }
        .calculation-section { margin: 12px 0; }
        .details-title {
            margin: 10px 0 4px;
            padding-right: 7px;
            border-right: 2px solid #087e8b;
            color: #173d4a;
            font-size: 10px;
            line-height: 1.6;
        }
        .detail-table { width: 100%; border-collapse: collapse; page-break-inside: auto; font-size: 9px; line-height: 1.5; }
        .detail-table thead { display: table-header-group; }
        .detail-table thead th {
            padding: 3px 6px;
            border: 1px solid #d9e3e6;
            color: #fff;
            background: #087e8b;
            text-align: right;
            font-weight: normal;
        }
        .detail-table th, .detail-table td {
            width: 50%;
            padding: 2px 6px;
            border: 1px solid #e2e9eb;
            text-align: right;
            vertical-align: top;
            overflow-wrap: anywhere;
        }
        .detail-table tbody tr:nth-child(even) { background: #f5f9fa; }
        .detail-table tbody th[scope="row"] { color: #5b6d75; font-weight: normal; }
        .detail-table .detail-period-heading th {
            padding: 3px 6px;
            color: #087e8b;
            background: #edf6f7;
            font-weight: bold;
            text-align: right;
        }
        .detail-table tbody tr { page-break-inside: avoid; }
        .note {
            margin-top: 22px;
            padding: 10px 12px;
            border: 1px solid #e4d6ac;
            border-radius: 6px;
            color: #66521b;
            background: #fff9e9;
        }
        .about-section {
            margin-top: 20px;
            padding: 12px;
            border: 1px solid #d9e3e6;
            border-top: 3px solid #087e8b;
            border-radius: 8px;
            background: #f5f9fa;
            page-break-inside: avoid;
        }
        .about-section h2 { margin: 0 0 4px; color: #087e8b; font-size: 14px; }
        .about-intro { margin: 0 0 10px; color: #4b6275; font-size: 10px; }
        .about-items { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px; }
        .about-item { padding: 7px 9px; border: 1px solid #d9e3e6; border-radius: 6px; background: #fff; page-break-inside: avoid; }
        .about-item:last-child:nth-child(odd) { grid-column: 1 / -1; }
        .about-item h3 { margin: 0; color: #173d4a; font-size: 10px; }
        .about-item p { margin: 2px 0 0; color: #4b6275; font-size: 9px; line-height: 1.7; }
        .document-attribution {
            margin-top: 12px;
            color: #697a81;
            font-size: 9px;
            text-align: center;
        }
        .page-footer {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            justify-content: center;
            gap: 8px 12px;
            margin-top: 12px;
            padding: 8px 0 0;
            border-top: 1px solid #c8dde3;
            color: #4b6275;
            font-size: 8px;
            line-height: 1.5;
            text-align: center;
        }
        .page-footer-brand {
            display: inline-flex;
            flex: 0 0 auto;
            align-items: center;
            gap: 5px;
            color: #087e8b;
            font-size: 9px;
            font-weight: bold;
            white-space: nowrap;
        }
        .page-footer-logo {
            width: 18px;
            height: 18px;
            border-radius: 4px;
            background: #26c6da;
        }
        .page-footer-rights { flex: 1 1 220px; }
        .page-footer-promo {
            flex: 0 0 auto;
            color: #087e8b;
            font-weight: bold;
            white-space: nowrap;
        }
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
            <div>
                <div class="brand">پهناور کار</div>
                <h1>فیش محاسبات حقوق و مزایا</h1>
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
    <h2 class="pdf-section-title">نتایج محاسبات</h2>
    <table class="summary">
        <thead><tr><th>عنوان محاسبه</th><th>نتیجه نهایی</th></tr></thead>
        <tbody>${summaryRows}${wageTotalRow}</tbody>
    </table>
    ${sectionDetails}
    <div class="note">
        این سند گزارش محاسبات جامع است و جایگزین فیش صادرشده از سوی کارفرما نیست.
    </div>
    <div class="document-attribution">این گزارش به‌صورت خودکار از نتایج محاسبه‌شده در پهناور کار تهیه شده است.</div>
    <section class="about-section">
        <h2>درباره پهناور کار</h2>
        <p class="about-intro">
            ما با هدف ساده‌سازی محاسبات حقوق و دستمزد، ابزارهایی کاربردی و قابل اعتماد برای کاربران فراهم کرده‌ایم.
        </p>
        <div class="about-items">
            <div class="about-item">
                <h3>ماموریت ما</h3>
                <p>ایجاد تجربه‌ای ساده و قابل اعتماد برای محاسبهٔ حقوق و مزایا و کمک به برنامه‌ریزی منابع انسانی.</p>
            </div>
            <div class="about-item">
                <h3>چرا پهناور کار؟</h3>
                <p>ابزارهایی کاربردی با تمرکز بر دقت محاسبات، تجربهٔ روان و سازگاری با نیازهای کاربران ایرانی.</p>
            </div>
            <div class="about-item">
                <h3>ارزش‌های ما</h3>
                <p>شفافیت، دقت، سادگی و توجه به تجربهٔ فارسی کاربران.</p>
            </div>
        </div>
    </section>
    </main>
    <footer class="page-footer">
        <span class="page-footer-brand">
            <img class="page-footer-logo" src="${escapeHtml(assets.logo)}" alt="">
            <span>پهناور کار</span>
        </span>
        <span class="page-footer-rights">حقوق مادی و معنوی قالب و محتوای اختصاصی این گزارش متعلق به پهناور کار است؛ بازنشر بدون اجازه مجاز نیست.</span>
        <span class="page-footer-promo">محاسبات حقوق و مزایا با پهناور کار</span>
    </footer>
</body>
</html>`;
}
