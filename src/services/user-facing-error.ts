import { AuthApiError } from '@/services/auth-api';

export function getUserFacingErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof AuthApiError) {
        if (error.status === 0) {
            return 'ارتباط با سرور برقرار نشد. اتصال اینترنت خود را بررسی کنید و دوباره تلاش کنید.';
        }
        if (error.status === 408) {
            return 'زمان انتظار برای پاسخ سرور به پایان رسید. دوباره تلاش کنید.';
        }
        if (error.status === 401) {
            return 'نشست شما معتبر نیست. دوباره وارد حساب کاربری شوید.';
        }
        if (error.status === 403) {
            return 'برای انجام این کار دسترسی ندارید.';
        }
        if (error.status >= 500) {
            return 'در حال حاضر سرور پاسخ‌گو نیست. کمی بعد دوباره تلاش کنید.';
        }
        return error.message || fallback;
    }

    if (error instanceof Error && error.name === 'AbortError') {
        return 'زمان انتظار برای پاسخ به پایان رسید. دوباره تلاش کنید.';
    }
    if (error instanceof TypeError) {
        return fallback;
    }

    return error instanceof Error && error.message.trim() ? error.message : fallback;
}
