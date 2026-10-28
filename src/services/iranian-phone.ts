export function toLatinDigits(value: string): string {
    return value.replace(/[۰-۹٠-٩]/g, (digit) =>
        String.fromCharCode(
            digit.charCodeAt(0) >= 0x06f0 && digit.charCodeAt(0) <= 0x06f9
                ? digit.charCodeAt(0) - 0x06f0 + 48
                : digit.charCodeAt(0) - 0x0660 + 48,
        ),
    );
}

export function normalizeOtpCode(value: string): string {
    return toLatinDigits(value).replace(/\D/g, '').slice(0, 6);
}

export function sanitizePhoneInput(value: string): string {
    return toLatinDigits(value).replace(/\D/g, '');
}

export function getIranianNationalNumber(value: string): string {
    let digits = sanitizePhoneInput(value);

    if (digits.startsWith('0098')) {
        digits = digits.slice(4);
    } else if (digits.startsWith('98')) {
        digits = digits.slice(2);
    }
    if (digits.startsWith('0') && digits.length > 1) {
        digits = digits.slice(1);
    }

    return digits;
}

export function normalizeIranianPhone(value: string): string | null {
    const nationalNumber = getIranianNationalNumber(value);
    return /^9\d{9}$/.test(nationalNumber) ? `+98${nationalNumber}` : null;
}
