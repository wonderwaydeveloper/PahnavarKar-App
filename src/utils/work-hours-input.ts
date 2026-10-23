import { toGregorian } from 'jalaali-js';

import type { ParsedDateInput } from '@/utils/salary-calculation';

export function normalizeWorkHoursInput(value: string) {
    const latinDigits = value.replace(/[۰-۹٠-٩]/g, (digit) =>
        String.fromCharCode(
            digit.charCodeAt(0) >= 0x06f0 && digit.charCodeAt(0) <= 0x06f9
                ? digit.charCodeAt(0) - 0x06f0 + 48
                : digit.charCodeAt(0) - 0x0660 + 48,
        ),
    );
    const normalizedDecimal = latinDigits.replace(/[٫،,]/g, '.').replace(/[^\d.]/g, '');
    const [integerPart = '', ...fractionParts] = normalizedDecimal.split('.');
    const fraction = fractionParts.join('').slice(0, 2);

    return fractionParts.length > 0 ? `${integerPart}.${fraction}` : integerPart;
}

export function getInclusiveDateCount(startDate: ParsedDateInput, endDate: ParsedDateInput) {
    const gregorianStart = toGregorian(startDate.year, startDate.month, startDate.day);
    const gregorianEnd = toGregorian(endDate.year, endDate.month, endDate.day);
    const startTimestamp = Date.UTC(gregorianStart.gy, gregorianStart.gm - 1, gregorianStart.gd);
    const endTimestamp = Date.UTC(gregorianEnd.gy, gregorianEnd.gm - 1, gregorianEnd.gd);

    return Math.floor((endTimestamp - startTimestamp) / 86400000) + 1;
}

export function getMaximumAllowedWorkHours(requiredHours: number | null, dayCount: number) {
    if (requiredHours === null || dayCount <= 0) {
        return null;
    }

    return Math.floor((requiredHours + dayCount * 4) * 100) / 100;
}
