import { AuthApiError } from '@/services/auth-api';
import { formatPersianDate } from '@/utils/persian-date';

export type AppErrorCategory =
    | 'network'
    | 'timeout'
    | 'unauthorized'
    | 'forbidden'
    | 'not-found'
    | 'conflict'
    | 'bad-request'
    | 'validation'
    | 'rate-limit'
    | 'server'
    | 'unknown';

function formatRestrictionExpiry(value: string | null): string | null {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return formatPersianDate(date, { dateStyle: 'medium', timeStyle: 'short' });
}

function isPersianMessage(message: string): boolean {
    return /[\u0600-\u06FF]/u.test(message);
}

function getErrorMessage(error: unknown): string | null {
    if (error instanceof Error && error.message.trim()) return error.message.trim();
    return null;
}

export function getAppErrorCategory(error: unknown): AppErrorCategory {
    if (error instanceof AuthApiError) {
        if (error.code === 'account_capability_restricted' || error.status === 403) return 'forbidden';
        if (error.code === 'account_disabled' || error.status === 401) return 'unauthorized';
        if (error.status === 0) return 'network';
        if (error.status === 408) return 'timeout';
        if (error.status === 404) return 'not-found';
        if (error.status === 409) return 'conflict';
        if (error.status === 400) return 'bad-request';
        if (error.status === 422) return 'validation';
        if (error.status === 429) return 'rate-limit';
        if (error.status >= 500) return 'server';
        return 'unknown';
    }

    if (error instanceof Error && error.name === 'AbortError') return 'timeout';
    if (error instanceof TypeError) return 'network';
    return 'unknown';
}

export function getUserFacingFieldError(
    error: unknown,
    fields: string[],
    fallback: string,
): string | null {
    if (!(error instanceof AuthApiError)) return null;
    const category = getAppErrorCategory(error);
    if (category !== 'bad-request' && category !== 'validation') return null;

    const fieldMessages = fields.flatMap((field) => error.fieldErrors[field] ?? []);
    if (fieldMessages.length === 0) return null;

    return fieldMessages.find((message) => isPersianMessage(message))
        ?? fallback;
}

export function getUserFacingErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof AuthApiError) {
        if (error.code === 'account_capability_restricted') {
            const capabilityLabels: Record<string, string> = {
                financial: 'امور مالی',
                profile: 'ویرایش پروفایل',
                security: 'امنیت حساب',
            };
            const expiry = formatRestrictionExpiry(error.restrictedUntil);
            const details = [
                error.reason && isPersianMessage(error.reason) ? `دلیل: ${error.reason}` : null,
                expiry
                    ? `پایان محدودیت: ${expiry}`
                    : 'این محدودیت تا زمان برداشتن دستی فعال است.',
            ].filter(Boolean).join('\n');
            return `دسترسی ${capabilityLabels[error.capability ?? ''] ?? 'این قابلیت'} برای حساب شما محدود شده است.\n${details}`;
        }

        if (error.code === 'account_disabled') {
            const expiry = formatRestrictionExpiry(error.restrictedUntil);
            const details = [
                error.reason && isPersianMessage(error.reason) ? `دلیل: ${error.reason}` : null,
                expiry
                    ? `پایان تعلیق: ${expiry}`
                    : 'تعلیق تا فعال‌سازی دستی ادامه دارد.',
            ].filter(Boolean).join('\n');
            return `دسترسی حساب شما به‌طور کامل تعلیق شده و استفاده از برنامه امکان‌پذیر نیست.\n${details}`;
        }

        const responseMessage = error.message.trim();
        const localizedResponse = isPersianMessage(responseMessage) ? responseMessage : null;
        switch (getAppErrorCategory(error)) {
            case 'network':
                return localizedResponse ?? 'ارتباط با سرور برقرار نشد. دوباره تلاش کنید.';
            case 'timeout':
                return 'زمان انتظار برای پاسخ سرور به پایان رسید. دوباره تلاش کنید.';
            case 'unauthorized':
                return 'نشست شما معتبر نیست. دوباره وارد حساب کاربری شوید.';
            case 'forbidden':
                return localizedResponse ?? 'برای انجام این کار دسترسی ندارید.';
            case 'not-found':
                return localizedResponse ?? 'مورد درخواستی پیدا نشد یا دیگر در دسترس نیست.';
            case 'conflict':
                return localizedResponse
                    ?? 'این درخواست با وضعیت فعلی قابل انجام نیست. اطلاعات را تازه‌سازی و دوباره تلاش کنید.';
            case 'bad-request':
            case 'validation':
                return localizedResponse ?? 'اطلاعات واردشده معتبر نیست؛ موارد را بررسی کنید.';
            case 'rate-limit':
                return localizedResponse ?? 'تعداد درخواست‌ها از حد مجاز بیشتر شده است. کمی بعد دوباره تلاش کنید.';
            case 'server':
                return 'سرور موقتاً با مشکل روبه‌رو شده است. کمی بعد دوباره تلاش کنید.';
            default:
                return localizedResponse ?? fallback;
        }
    }

    const message = getErrorMessage(error);
    if (error instanceof Error && error.name === 'AbortError') {
        return 'زمان انتظار برای پاسخ به پایان رسید. دوباره تلاش کنید.';
    }
    if (error instanceof TypeError) {
        return 'ارتباط با سرور برقرار نشد. دوباره تلاش کنید.';
    }
    return message && isPersianMessage(message) ? message : fallback;
}
