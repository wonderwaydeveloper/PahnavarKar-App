type PersianDateOptions = Omit<Intl.DateTimeFormatOptions, 'calendar' | 'numberingSystem'>;

function parseDate(value: string | Date): Date | null {
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

export function formatPersianDate(
    value: string | Date,
    options: PersianDateOptions = { dateStyle: 'medium' },
): string | null {
    const date = parseDate(value);
    if (!date) return null;

    return new Intl.DateTimeFormat('fa-IR', {
        ...options,
        calendar: 'persian',
        numberingSystem: 'arabext',
    }).format(date);
}
