const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const LATIN_DIGITS = '0123456789';
const ARABIC_DIACRITICS_PATTERN = /[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g;
const SEARCH_WHITESPACE_PATTERN = /[\u200C\u200D\s]+/g;

export function normalizeSearchText(value: string): string {
    return value
        .normalize('NFKC')
        .toLocaleLowerCase('fa-IR')
        .replace(/[يى]/g, 'ی')
        .replace(/ك/g, 'ک')
        .replace(ARABIC_DIACRITICS_PATTERN, '')
        .replace(/[۰-۹]/g, (digit) => LATIN_DIGITS[PERSIAN_DIGITS.indexOf(digit)])
        .replace(SEARCH_WHITESPACE_PATTERN, ' ')
        .trim();
}
