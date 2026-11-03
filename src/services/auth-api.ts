import * as Crypto from 'expo-crypto';
import * as Device from 'expo-device';
import { File } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { CACHE_POLICY } from '@/services/cache-policy';

const AUTH_TOKEN_KEY = 'pahnavarkar.auth.token';
const AUTH_USER_CACHE_KEY = CACHE_POLICY.storage.authenticatedUser.key;
const DEVICE_ID_KEY = 'pahnavarkar.auth.device-id';
export const OFFLINE_ACCESS_GRACE_PERIOD_MS = CACHE_POLICY.access.gracePeriodMs;
const MAX_READ_REQUEST_RETRIES = 1;
const READ_REQUEST_RETRY_DELAY_MS = 500;

export interface AuthenticatedUser {
    id: number;
    name: string;
    phone: string;
    profile_photo_path: string | null;
    phone_verified_at: string | null;
    last_active_at: string | null;
    inactivity_deletion_period_months: 6 | 12 | 18 | null;
    inactivity_deletion_scheduled_at: string | null;
    restricted_capabilities?: ('financial' | 'profile' | 'security')[] | null;
    restriction_reason?: string | null;
    restricted_until?: string | null;
}

export interface PlanAccess {
    key: string;
    name: string;
    features: Record<string, boolean>;
    is_unlimited?: boolean;
}

export interface PlanDuration {
    key: string;
    name: string;
    duration_days: number;
}

export interface PlanOffer {
    key: string;
    tier: string;
    duration: string;
    duration_days: number;
    price: number;
    is_available: boolean;
}

export interface PlanCatalog {
    tiers: PlanAccess[];
    durations: PlanDuration[];
    offers: PlanOffer[];
    feature_catalog: Record<string, { label: string; description?: string; group: string }>;
}

export type SubscriptionPaymentMethod = 'wallet' | 'combined' | 'gateway';

export interface SubscriptionQuote {
    plan_key: string;
    tier: string;
    duration: string;
    duration_days: number;
    change_type: 'purchase' | 'upgrade' | 'scheduled';
    source_subscription_id: number | null;
    source_plan_key: string | null;
    payment_method: SubscriptionPaymentMethod;
    gross_amount: number;
    credit_amount: number;
    discount_amount: number;
    payable_amount: number;
    wallet_amount: number;
    gateway_amount: number;
    starts_at: string;
    ends_at: string;
}

export interface SubscriptionPurchaseInput {
    plan_key: string;
    discount_code?: string;
    payment_method: SubscriptionPaymentMethod;
    app_return_url: string;
    expected_quote: Pick<
        SubscriptionQuote,
        | 'gross_amount'
        | 'credit_amount'
        | 'discount_amount'
        | 'payable_amount'
        | 'wallet_amount'
        | 'gateway_amount'
        | 'duration_days'
        | 'change_type'
        | 'source_subscription_id'
        | 'source_plan_key'
    >;
}

export interface PaymentOrderStatus {
    order: {
        id: number;
        reference: string;
        kind: string;
        subscription_change_type: 'purchase' | 'upgrade' | 'scheduled';
        plan_key: string;
        plan_name: string | null;
        status: 'pending' | 'processing' | 'succeeded' | 'failed';
        failure_code: string | null;
        gross_amount: number;
        discount_amount: number;
        plan_credit_amount: number;
        wallet_amount: number;
        gateway_amount: number;
        refunded_amount: number;
        currency: string;
        expires_at: string;
        completed_at: string | null;
    };
    payments: { id: number; gateway: string; status: string; redirect_url: string | null }[];
    refund_transactions: {
        id: number;
        type: string;
        status: string;
        amount: number;
        gateway: string | null;
        reference_id: string | null;
    }[];
    subscription: unknown;
}

export interface PaginatedResult<T> {
    data: T[];
    meta: {
        current_page: number;
        last_page: number;
        per_page: number;
        total: number;
    };
}

export interface WalletTransactionHistoryItem {
    id: number;
    type: string;
    status: string;
    amount: number;
    balance_after: number;
    currency: string;
    gateway: string | null;
    tracking_reference: string | null;
    description: string | null;
    created_at: string;
}

export interface WithdrawalHistoryItem {
    id: number;
    request_reference: string;
    amount: number;
    currency: string;
    status: string;
    payout_mode: string;
    review_note: string | null;
    payout_reference: string | null;
    reviewed_at: string | null;
    paid_at: string | null;
    created_at: string;
    bank_account_iban_masked: string | null;
    payout_method: 'iban' | 'card';
    bank_account_card_masked: string | null;
}

export type NotificationCategory =
    | 'account_access'
    | 'security'
    | 'finance'
    | 'subscription'
    | 'service'
    | 'announcement';

export type NotificationPriority = 'normal' | 'important' | 'urgent';

export interface InboxNotification {
    id: number;
    category: NotificationCategory;
    priority: NotificationPriority;
    title: string;
    body: string;
    event: string | null;
    data: Record<string, unknown> | null;
    read_at: string | null;
    created_at: string;
}

export interface NotificationDeletionResult {
    deleted_count: number;
    undo_token: string | null;
    undo_expires_at: string | null;
}

export interface NotificationCounts {
    unread_count: number;
    read_count: number;
}

export interface WalletOverview {
    balance: number;
    currency: string;
    unit: string;
    bank_account_iban_masked: string | null;
    top_up_min_amount: number;
    top_up_max_amount: number;
    withdrawals: {
        enabled: boolean;
        max_per_request: number;
        max_per_day: number;
    };
}

export interface PaymentOrderHistoryItem {
    id: number;
    source: 'order' | 'wallet_top_up';
    reference: string | null;
    kind: string;
    plan_key: string | null;
    plan_name: string | null;
    status: string;
    gross_amount: number;
    discount_amount: number;
    wallet_amount: number;
    gateway_amount: number;
    currency: string;
    expires_at: string | null;
    completed_at: string | null;
    created_at: string;
    payments: { id: number; gateway: string; status: string; tracking_reference: string | null }[];
}

export interface ScheduledSubscription {
    id: number;
    plan_key: string;
    starts_at: string;
    ends_at: string;
}

export interface SubscriptionRecord {
    id: number;
    plan_key: string;
    type: string;
    status: string;
    starts_at: string;
    ends_at: string;
    reservation_created_at?: string;
    cancelled_at: string | null;
    cancellation_scheduled: boolean;
    auto_renew: boolean;
    auto_renew_failed_at: string | null;
    auto_renew_failure_reason: string | null;
    is_active: boolean;
    replaced_by?: {
        id: number;
        plan_key: string;
        replaced_at: string;
    } | null;
    refundable_amount?: number;
    refund_amount?: number;
}

export interface AuthDevice {
    id: number;
    device_id: string;
    device_name: string | null;
    device_model: string | null;
    platform: 'ios' | 'android' | 'web' | 'windows' | 'macos' | 'linux' | 'desktop' | 'unknown';
    last_activity: string | null;
    created_at: string;
    expires_at: string | null;
    is_current: boolean;
    is_stale: boolean;
}

export interface TwoFactorStatus {
    enabled: boolean;
    enabled_at: string | null;
    recovery_codes_remaining: number;
}

export interface TwoFactorEnrollment {
    secret: string;
    provisioning_uri: string;
}

export interface AuthSession {
    token: string;
    token_type: 'Bearer';
    expires_at: string;
    user: AuthenticatedUser;
}

export async function fetchPushSubscriptionStatus(token: string): Promise<boolean> {
    const response = await request<{ enabled: boolean }>('/auth/notifications/push-token', { token });
    return response.enabled;
}

export function fetchNotificationInbox(
    token: string,
    input: { page?: number; category?: NotificationCategory; unreadOnly?: boolean } = {},
): Promise<PaginatedResult<InboxNotification>> {
    const params = new URLSearchParams({ per_page: '20', page: String(input.page ?? 1) });
    if (input.category) params.set('category', input.category);
    if (input.unreadOnly) params.set('read', '0');
    return request(`/auth/notifications?${params.toString()}`, { token });
}

export async function fetchNotificationUnreadCount(token: string): Promise<number> {
    const response = await fetchNotificationCounts(token);
    return response.unread_count;
}

export function fetchNotificationCounts(token: string): Promise<NotificationCounts> {
    return request('/auth/notifications/unread-count', { token });
}

export async function markNotificationRead(token: string, notificationId: number): Promise<void> {
    await request(`/auth/notifications/${notificationId}/read`, { method: 'POST', token });
}

export async function markAllNotificationsRead(token: string): Promise<void> {
    await request('/auth/notifications/read-all', { method: 'POST', token });
}

export function deleteNotification(token: string, notificationId: number): Promise<NotificationDeletionResult> {
    return request(`/auth/notifications/${notificationId}`, { method: 'DELETE', token });
}

export function deleteReadNotifications(token: string): Promise<NotificationDeletionResult> {
    return request('/auth/notifications/read/delete', { method: 'POST', token });
}

export async function restoreDeletedNotifications(token: string, undoToken: string): Promise<number> {
    const response = await request<{ restored_count: number }>('/auth/notifications/restore', {
        method: 'POST',
        token,
        body: { undo_token: undoToken },
    });
    return response.restored_count;
}

export async function savePushSubscription(
    token: string,
    pushToken: string,
    platform: 'android' | 'ios',
): Promise<void> {
    await request('/auth/notifications/push-token', {
        method: 'PUT',
        token,
        body: { push_token: pushToken, platform },
    });
}

export async function removePushSubscription(token: string): Promise<void> {
    await request('/auth/notifications/push-token', { method: 'DELETE', token });
}

interface ApiErrorPayload {
    message?: string;
    detail?: string;
    code?: string;
    capability?: string;
    restriction_reason?: string | null;
    suspended_until?: string | null;
    restricted_until?: string | null;
    retry_after?: number;
    errors?: Record<string, string[]>;
}

interface SessionResponse {
    token: string;
    token_type: 'Bearer';
    expires_at: string;
    user: AuthenticatedUser;
}

export type OtpVerificationResult =
    | { status: 'profile_required' }
    | { status: 'two_factor_required'; challenge_token: string; expires_at: string }
    | ({ status: 'authenticated' } & SessionResponse);

export class AuthApiError extends Error {
    constructor(
        message: string,
        public readonly status: number,
        public readonly retryAfterSeconds: number | null = null,
        public readonly code: string | null = null,
        public readonly capability: string | null = null,
        public readonly reason: string | null = null,
        public readonly restrictedUntil: string | null = null,
        public readonly fieldErrors: Record<string, string[]> = {},
    ) {
        super(message);
        this.name = 'AuthApiError';
    }
}

export function isTemporaryApiFailure(error: unknown): boolean {
    return error instanceof AuthApiError
        ? error.status === 0 || error.status === 408 || error.status === 429 || error.status >= 500
        : error instanceof TypeError || (error instanceof Error && error.name === 'AbortError');
}

export function shouldRetryApiQuery(error: unknown): boolean {
    return !(error instanceof AuthApiError && error.status === 429);
}

function getRetryAfterSeconds(header: string | null, payloadSeconds?: number): number | null {
    if (header !== null) {
        const seconds = Number(header);
        if (Number.isFinite(seconds) && seconds >= 0) {
            return Math.ceil(seconds);
        }

        const retryAt = Date.parse(header);
        if (!Number.isNaN(retryAt)) {
            return Math.max(0, Math.ceil((retryAt - Date.now()) / 1000));
        }
    }

    return typeof payloadSeconds === 'number' && Number.isFinite(payloadSeconds) && payloadSeconds >= 0
        ? Math.ceil(payloadSeconds)
        : null;
}

function formatRetryAfter(seconds: number): string {
    if (seconds < 60) {
        return `${seconds} ثانیه`;
    }

    return `${Math.ceil(seconds / 60)} دقیقه`;
}

function getValidationMessages(errors: unknown): { first: string | null; fields: Record<string, string[]> } {
    if (!errors || typeof errors !== 'object' || Array.isArray(errors)) {
        return { first: null, fields: {} };
    }

    const fields: Record<string, string[]> = {};
    for (const [field, messages] of Object.entries(errors)) {
        if (!Array.isArray(messages)) continue;
        const validMessages = messages.filter((message): message is string => (
            typeof message === 'string' && message.trim().length > 0
        ));
        if (validMessages.length > 0) fields[field] = validMessages;
    }

    return {
        first: Object.values(fields).flat()[0] ?? null,
        fields,
    };
}

function getApiBaseUrl(): string {
    const baseUrl = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, '');
    if (!baseUrl) {
        throw new Error('نشانی API تنظیم نشده است. مقدار EXPO_PUBLIC_API_URL را در فایل .env اپ وارد کنید.');
    }

    return baseUrl;
}

export function getProfilePhotoUrl(path: string | null): string | null {
    if (!path) {
        return null;
    }

    const serverUrl = getApiBaseUrl().replace(/\/api\/v1$/, '');
    const encodedPath = path.split('/').map(encodeURIComponent).join('/');
    return `${serverUrl}/storage/${encodedPath}`;
}

async function request<T>(
    path: string,
    options: {
        method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
        token?: string;
        body?: Record<string, unknown>;
        deviceId?: string;
        idempotencyKey?: string;
    } = {},
    retryCount = 0,
): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const headers: Record<string, string> = {
        Accept: 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
    };

    if (options.body) {
        headers['Content-Type'] = 'application/json';
    }
    if (options.token) {
        headers.Authorization = `Bearer ${options.token}`;
    }
    if (options.deviceId) {
        headers['X-Device-Id'] = options.deviceId;
    }
    if (options.idempotencyKey) {
        headers['Idempotency-Key'] = options.idempotencyKey;
    }

    try {
        const response = await fetch(`${getApiBaseUrl()}${path}`, {
            method: options.method ?? 'GET',
            headers,
            body: options.body ? JSON.stringify(options.body) : undefined,
            signal: controller.signal,
        });

        if (response.status === 204) {
            return undefined as T;
        }

        const responseText = await response.text();
        let payload: ApiErrorPayload | T;
        try {
            payload = responseText ? JSON.parse(responseText) as ApiErrorPayload | T : {};
        } catch (error) {
            if (error instanceof SyntaxError) {
                throw new Error('پاسخ سرور قابل خواندن نیست. نشانی API و پیکربندی بک‌اند را بررسی کنید.');
            }
            throw error;
        }

        if (!response.ok) {
            const errorPayload = payload as ApiErrorPayload;
            const validation = getValidationMessages(errorPayload.errors);
            const retryAfterSeconds = response.status === 429
                ? getRetryAfterSeconds(response.headers.get('Retry-After'), errorPayload.retry_after)
                : null;
            const responseMessage = validation.first
                ?? errorPayload.detail
                ?? errorPayload.message;
            const isGenericRateLimitMessage = responseMessage === 'Too Many Attempts.'
                || responseMessage === 'Too Many Requests';
            const message = response.status !== 429
                ? responseMessage ?? 'درخواست ناموفق بود.'
                : [
                    isGenericRateLimitMessage || !responseMessage
                        ? 'تعداد درخواست‌ها از حد مجاز بیشتر شده است.'
                        : responseMessage,
                    retryAfterSeconds !== null && retryAfterSeconds > 0
                        ? `حدود ${formatRetryAfter(retryAfterSeconds)} دیگر دوباره تلاش کنید.`
                        : null,
                ].filter(Boolean).join(' ');
            throw new AuthApiError(
                message,
                response.status,
                retryAfterSeconds,
                errorPayload.code ?? null,
                errorPayload.capability ?? null,
                errorPayload.restriction_reason ?? null,
                errorPayload.restricted_until ?? errorPayload.suspended_until ?? null,
                validation.fields,
            );
        }

        return payload as T;
    } catch (error) {
        const requestError = error instanceof AuthApiError
            ? error
            : error instanceof Error && error.name === 'AbortError'
                ? new AuthApiError('زمان انتظار برای پاسخ سرور به پایان رسید. دوباره تلاش کنید.', 408)
                : error instanceof TypeError
                    ? new AuthApiError('ارتباط با سرور برقرار نشد. اتصال اینترنت خود را بررسی کنید و دوباره تلاش کنید.', 0)
                    : error;

        if (
            (options.method ?? 'GET') === 'GET'
            && retryCount < MAX_READ_REQUEST_RETRIES
            && isTemporaryApiFailure(requestError)
            && shouldRetryApiQuery(requestError)
        ) {
            await new Promise<void>((resolve) => setTimeout(resolve, READ_REQUEST_RETRY_DELAY_MS));
            return request(path, options, retryCount + 1);
        }

        throw requestError;
    } finally {
        clearTimeout(timeout);
    }
}

export async function getDeviceId(): Promise<string> {
    if (Platform.OS === 'web') {
        throw new Error('ورود امن فعلاً فقط در نسخهٔ موبایل پشتیبانی می‌شود.');
    }

    const storedDeviceId = await SecureStore.getItemAsync(DEVICE_ID_KEY);
    if (storedDeviceId) {
        return storedDeviceId;
    }

    const deviceId = Crypto.randomUUID();
    await SecureStore.setItemAsync(DEVICE_ID_KEY, deviceId);
    return deviceId;
}

export function getStoredAuthToken(): Promise<string | null> {
    if (Platform.OS === 'web') {
        return Promise.resolve(null);
    }

    return SecureStore.getItemAsync(AUTH_TOKEN_KEY);
}

export async function storeAuthToken(token: string, user: AuthenticatedUser): Promise<void> {
    if (Platform.OS === 'web') {
        throw new Error('ورود امن فعلاً فقط در نسخهٔ موبایل پشتیبانی می‌شود.');
    }

    await storeCachedAuthenticatedUser(user, token);
    await SecureStore.setItemAsync(AUTH_TOKEN_KEY, token);
}

export async function storeCachedAuthenticatedUser(user: AuthenticatedUser, token: string): Promise<void> {
    if (Platform.OS === 'web') {
        return;
    }

    const tokenHash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, token);
    await SecureStore.setItemAsync(AUTH_USER_CACHE_KEY, JSON.stringify({
        user,
        tokenHash,
        verifiedAt: Date.now(),
    }));
}

export async function getCachedAuthenticatedUser(token: string): Promise<AuthenticatedUser | null> {
    if (Platform.OS === 'web') {
        return null;
    }

    const raw = await SecureStore.getItemAsync(AUTH_USER_CACHE_KEY);
    if (!raw) {
        return null;
    }

    let cached: unknown;
    try {
        cached = JSON.parse(raw);
    } catch {
        await SecureStore.deleteItemAsync(AUTH_USER_CACHE_KEY);
        return null;
    }

    if (!cached || typeof cached !== 'object' || !('user' in cached) || !('tokenHash' in cached) || !('verifiedAt' in cached)) {
        await SecureStore.deleteItemAsync(AUTH_USER_CACHE_KEY);
        return null;
    }

    const value = cached as { user: AuthenticatedUser; tokenHash: string; verifiedAt: number };
    const tokenHash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, token);
    if (
        typeof value.tokenHash !== 'string'
        || value.tokenHash !== tokenHash
        || !Number.isFinite(value.verifiedAt)
        || value.verifiedAt > Date.now()
        || Date.now() - value.verifiedAt > CACHE_POLICY.access.gracePeriodMs
        || !value.user
        || typeof value.user.id !== 'number'
        || typeof value.user.name !== 'string'
        || typeof value.user.phone !== 'string'
        || (value.user.profile_photo_path !== null && typeof value.user.profile_photo_path !== 'string')
        || (value.user.phone_verified_at !== null && typeof value.user.phone_verified_at !== 'string')
        || (value.user.last_active_at !== null && typeof value.user.last_active_at !== 'string')
        || ![6, 12, 18, null].includes(value.user.inactivity_deletion_period_months)
        || (value.user.inactivity_deletion_scheduled_at !== null && typeof value.user.inactivity_deletion_scheduled_at !== 'string')
        || (value.user.restricted_capabilities !== undefined
            && value.user.restricted_capabilities !== null
            && (!Array.isArray(value.user.restricted_capabilities)
                || value.user.restricted_capabilities.some((capability) => !['financial', 'profile', 'security'].includes(capability))))
        || (value.user.restriction_reason !== undefined && value.user.restriction_reason !== null && typeof value.user.restriction_reason !== 'string')
        || (value.user.restricted_until !== undefined && value.user.restricted_until !== null && typeof value.user.restricted_until !== 'string')
    ) {
        await SecureStore.deleteItemAsync(AUTH_USER_CACHE_KEY);
        return null;
    }

    return value.user;
}

export async function removeStoredAuthToken(): Promise<void> {
    if (Platform.OS !== 'web') {
        await SecureStore.deleteItemAsync(AUTH_TOKEN_KEY);
        await SecureStore.deleteItemAsync(AUTH_USER_CACHE_KEY);
    }
}

export async function sendOtp(input: {
    phone: string;
    type: 'login' | 'register';
    name?: string;
}): Promise<{ message: string; resend_after: number }> {
    const deviceId = await getDeviceId();

    return request('/auth/otp/send', {
        method: 'POST',
        deviceId,
        body: input,
    });
}

export async function verifyOtp(input: {
    phone: string;
    type: 'login' | 'register';
    code: string;
    name?: string;
}): Promise<OtpVerificationResult> {
    const deviceId = await getDeviceId();
    const deviceName = Device.deviceName?.trim() || null;
    const deviceModel = Device.modelName?.trim() || null;
    const platform = Platform.OS === 'ios' || Platform.OS === 'android' || Platform.OS === 'web'
        ? Platform.OS
        : 'desktop';

    return request('/auth/otp/verify', {
        method: 'POST',
        deviceId,
        body: {
            ...input,
            device_id: deviceId,
            device_name: deviceName?.slice(0, 255) ?? null,
            device_model: deviceModel?.slice(0, 255) ?? null,
            platform,
        },
    });
}

export async function verifyTwoFactorLogin(
    challengeToken: string,
    code: string,
): Promise<AuthSession> {
    return request('/auth/two-factor/verify-login', {
        method: 'POST',
        body: { challenge_token: challengeToken, code },
    });
}

export async function fetchTwoFactorStatus(token: string): Promise<TwoFactorStatus> {
    return request('/auth/two-factor', { token });
}

export async function beginTwoFactorEnrollment(token: string): Promise<TwoFactorEnrollment> {
    return request('/auth/two-factor/setup', { method: 'POST', token });
}

export async function confirmTwoFactorEnrollment(token: string, code: string): Promise<string[]> {
    const response = await request<{ recovery_codes: string[] }>('/auth/two-factor/confirm', {
        method: 'POST',
        token,
        body: { code },
    });
    return response.recovery_codes;
}

export async function disableTwoFactor(token: string, code: string): Promise<void> {
    await request('/auth/two-factor', {
        method: 'DELETE',
        token,
        body: { code },
    });
}

export async function uploadProfilePhoto(token: string, uri: string): Promise<AuthenticatedUser> {
    const formData = new FormData();
    formData.append('photo', new File(uri), 'profile-photo.jpg');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    try {
        const response = await fetch(`${getApiBaseUrl()}/auth/profile/photo`, {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                Authorization: `Bearer ${token}`,
                'X-Requested-With': 'XMLHttpRequest',
            },
            body: formData,
            signal: controller.signal,
        });

        const responseText = await response.text();
        let payload: {
            user?: AuthenticatedUser;
            message?: string;
            code?: string;
            capability?: string;
            restriction_reason?: string | null;
            suspended_until?: string | null;
            restricted_until?: string | null;
            errors?: Record<string, string[]>;
        };

        try {
            payload = responseText
                ? JSON.parse(responseText) as typeof payload
                : {};
        } catch (error) {
            if (error instanceof SyntaxError) {
                throw new Error('پاسخ سرور برای بارگذاری تصویر قابل خواندن نیست.');
            }
            throw error;
        }

        if (!response.ok) {
            const validationMessage = Object.values(payload.errors ?? {})
                .flat()
                .find((message) => typeof message === 'string');
            throw new AuthApiError(
                validationMessage ?? payload.message ?? 'بارگذاری تصویر پروفایل ناموفق بود.',
                response.status,
                null,
                payload.code ?? null,
                payload.capability ?? null,
                payload.restriction_reason ?? null,
                payload.restricted_until ?? payload.suspended_until ?? null,
            );
        }

        if (!payload.user) {
            throw new Error('پاسخ سرور پس از بارگذاری تصویر ناقص است.');
        }

        return payload.user;
    } finally {
        clearTimeout(timeout);
    }
}

export async function deleteProfilePhoto(token: string): Promise<AuthenticatedUser> {
    const response = await request<{ user: AuthenticatedUser }>('/auth/profile/photo', {
        method: 'DELETE',
        token,
    });

    return response.user;
}

export async function fetchCurrentUser(token: string): Promise<AuthenticatedUser> {
    const response = await request<{ user: AuthenticatedUser }>('/auth/me', { token });
    return response.user;
}

export async function fetchPlanCatalog(): Promise<PlanCatalog> {
    return request('/plans');
}

export async function fetchCurrentPlan(token: string): Promise<{
    plan: PlanAccess;
    subscription: SubscriptionRecord | null;
    subscriptions: SubscriptionRecord[];
    scheduled_subscription: ScheduledSubscription | null;
    last_subscription: {
        id: number;
        plan_key: string;
        ends_at: string;
        auto_renew: boolean;
        auto_renew_failure_reason: string | null;
    } | null;
}> {
    return request('/auth/subscription', { token });
}

export async function updateAutoRenew(token: string, enabled: boolean): Promise<void> {
    await request('/auth/subscription/auto-renew', {
        method: 'PUT',
        token,
        body: { enabled },
    });
}

export async function cancelScheduledSubscription(
    token: string,
): Promise<{ subscription: SubscriptionRecord; refund_amount: number }> {
    return request('/auth/subscription/scheduled', {
        method: 'DELETE',
        token,
    });
}

export async function fetchWalletOverview(token: string): Promise<WalletOverview> {
    const response = await request<{ wallet: WalletOverview }>('/auth/wallet', { token });
    return response.wallet;
}

export async function revealWalletBankAccount(token: string): Promise<string> {
    const response = await request<{ iban: string }>('/auth/wallet/bank-account/reveal', {
        method: 'POST',
        token,
    });
    return response.iban;
}

export async function updateWalletBankAccount(token: string, iban: string): Promise<string> {
    const response = await request<{ bank_account_iban_masked: string }>('/auth/wallet/bank-account', {
        method: 'PUT',
        token,
        body: { iban },
    });
    return response.bank_account_iban_masked;
}

export async function startWalletTopUp(
    token: string,
    amount: number,
    idempotencyKey: string,
    appReturnUrl: string,
): Promise<{ payment: {
    id: number;
    status: string;
    amount: number;
    currency: string;
    redirect_url: string | null;
    expires_at: string | null;
    can_cancel_without_gateway: boolean;
} }> {
    return request('/auth/wallet/top-ups', {
        method: 'POST',
        token,
        body: { amount, app_return_url: appReturnUrl },
        idempotencyKey,
    });
}

export function fetchPendingWalletTopUp(
    token: string,
): Promise<{ payment: {
    id: number;
    status: string;
    amount: number;
    can_cancel_without_gateway: boolean;
} | null }> {
    return request('/auth/wallet/pending-top-up', { token });
}

export async function fetchWalletPayment(
    token: string,
    paymentId: number,
): Promise<{ payment: {
    id: number;
    status: string;
    amount: number;
    currency: string;
    redirect_url: string | null;
    expires_at: string | null;
    can_cancel_without_gateway: boolean;
} }> {
    return request(`/auth/payments/${paymentId}`, { token });
}

export async function reconcileWalletTopUp(
    token: string,
    paymentId: number,
): Promise<{ payment: {
    id: number;
    status: string;
    amount: number;
    can_cancel_without_gateway: boolean;
} }> {
    return request(`/auth/payments/${paymentId}/reconcile-wallet-top-up`, {
        method: 'POST',
        token,
    });
}

export async function createWithdrawalRequest(
    token: string,
    amount: number,
    idempotencyKey: string,
    payoutMethod: 'iban' | 'card' = 'iban',
    cardNumber?: string,
): Promise<{ withdrawal_request: WithdrawalHistoryItem; wallet_balance: number }> {
    return request('/auth/wallet/withdrawal-requests', {
        method: 'POST',
        token,
        body: {
            amount,
            idempotency_key: idempotencyKey,
            payout_method: payoutMethod,
            ...(payoutMethod === 'card' && cardNumber ? { card_number: cardNumber } : {}),
        },
    });
}

export async function quoteSubscription(
    token: string,
    input: {
        plan_key: string;
        discount_code?: string;
        payment_method?: SubscriptionPaymentMethod;
    },
): Promise<SubscriptionQuote> {
    const response = await request<{ quote: SubscriptionQuote }>('/auth/subscription/quote', {
        method: 'POST',
        token,
        body: input,
    });
    return response.quote;
}

export async function purchaseSubscription(
    token: string,
    input: SubscriptionPurchaseInput,
    idempotencyKey: string,
): Promise<{
    order: PaymentOrderStatus['order'];
    payment: PaymentOrderStatus['payments'][number] | null;
}> {
    return request('/auth/subscription/purchase', {
        method: 'POST',
        token,
        body: { ...input },
        idempotencyKey,
    });
}

export async function fetchPaymentOrder(token: string, orderId: number): Promise<PaymentOrderStatus> {
    return request(`/auth/payment-orders/${orderId}`, { token });
}

export function reconcileSubscriptionOrder(
    token: string,
    orderId: number,
): Promise<{ payment: { id: number; status: string } }> {
    return request(`/auth/payment-orders/${orderId}/reconcile`, {
        method: 'POST',
        token,
    });
}

export function fetchPaymentOrderHistory(
    token: string,
    page = 1,
    range?: { from?: string; to?: string },
): Promise<PaginatedResult<PaymentOrderHistoryItem>> {
    const params = new URLSearchParams({ per_page: '20', page: String(page) });
    if (range?.from) params.set('from', range.from);
    if (range?.to) params.set('to', range.to);
    return request(`/auth/payment-orders?${params.toString()}`, { token });
}

export function fetchWalletTransactionHistory(
    token: string,
    page = 1,
    range?: { from?: string; to?: string },
): Promise<PaginatedResult<WalletTransactionHistoryItem>> {
    const params = new URLSearchParams({ per_page: '20', page: String(page) });
    if (range?.from) params.set('from', range.from);
    if (range?.to) params.set('to', range.to);
    return request(`/auth/wallet/transactions?${params.toString()}`, { token });
}

export function fetchWithdrawalHistory(
    token: string,
    page = 1,
    range?: { from?: string; to?: string },
): Promise<PaginatedResult<WithdrawalHistoryItem>> {
    const params = new URLSearchParams({ per_page: '20', page: String(page) });
    if (range?.from) params.set('from', range.from);
    if (range?.to) params.set('to', range.to);
    return request(`/auth/wallet/withdrawal-requests?${params.toString()}`, { token });
}

export async function fetchPendingSubscriptionOrder(
    token: string,
): Promise<{
    order: PaymentOrderStatus['order'] | null;
    payments: PaymentOrderStatus['payments'];
}> {
    return request('/auth/subscription/pending-order', { token });
}

export async function updateProfile(
    token: string,
    input: { name: string },
): Promise<AuthenticatedUser> {
    const response = await request<{ user: AuthenticatedUser }>('/auth/profile', {
        method: 'PATCH',
        token,
        body: input,
    });

    return response.user;
}

export async function updateInactivityDeletion(
    token: string,
    periodMonths: 6 | 12 | 18 | null,
): Promise<AuthenticatedUser> {
    const response = await request<{ user: AuthenticatedUser }>('/auth/privacy/inactivity-deletion', {
        method: 'PATCH',
        token,
        body: { period_months: periodMonths },
    });

    return response.user;
}

export async function changePhone(
    token: string,
    phone: string,
    code: string,
): Promise<AuthenticatedUser> {
    const response = await request<{ user: AuthenticatedUser }>('/auth/profile/phone', {
        method: 'POST',
        token,
        body: { phone, code },
    });

    return response.user;
}

export function deleteAccount(token: string, code: string): Promise<void> {
    return request('/auth/account', { method: 'DELETE', token, body: { code } });
}

export function revokeCurrentSession(token: string): Promise<void> {
    return request('/auth/logout', { method: 'POST', token });
}

export function revokeAllSessions(token: string): Promise<void> {
    return request('/auth/logout-all', { method: 'POST', token });
}

export async function fetchDevices(token: string): Promise<AuthDevice[]> {
    const response = await request<{ data: AuthDevice[] }>('/auth/devices', { token });
    return response.data;
}

export function revokeDevice(token: string, deviceId: number): Promise<void> {
    return request(`/auth/devices/${deviceId}`, { method: 'DELETE', token });
}
