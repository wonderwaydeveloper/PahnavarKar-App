import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const AUTH_TOKEN_KEY = 'pahnavarkar.auth.token';
const DEVICE_ID_KEY = 'pahnavarkar.auth.device-id';

export interface AuthenticatedUser {
    id: number;
    name: string;
    email: string;
    phone: string;
    phone_verified_at: string | null;
}

export interface AuthDevice {
    id: number;
    device_id: string;
    device_name: string | null;
    last_activity: string | null;
    created_at: string;
}

interface ApiErrorPayload {
    message?: string;
    errors?: Record<string, string[]>;
}

interface SessionResponse {
    token: string;
    token_type: 'Bearer';
    expires_at: string;
    user: AuthenticatedUser;
}

export class AuthApiError extends Error {
    constructor(message: string, public readonly status: number) {
        super(message);
        this.name = 'AuthApiError';
    }
}

function getApiBaseUrl(): string {
    const baseUrl = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, '');
    if (!baseUrl) {
        throw new Error('نشانی API تنظیم نشده است. مقدار EXPO_PUBLIC_API_URL را در فایل .env اپ وارد کنید.');
    }

    return baseUrl;
}

async function request<T>(
    path: string,
    options: {
        method?: 'GET' | 'POST' | 'DELETE';
        token?: string;
        body?: Record<string, unknown>;
        deviceId?: string;
    } = {},
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
            const validationMessage = Object.values(errorPayload.errors ?? {})
                .flat()
                .find((message) => typeof message === 'string');
            throw new AuthApiError(
                validationMessage ?? errorPayload.message ?? 'درخواست احراز هویت ناموفق بود.',
                response.status,
            );
        }

        return payload as T;
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

export async function storeAuthToken(token: string): Promise<void> {
    if (Platform.OS === 'web') {
        throw new Error('ورود امن فعلاً فقط در نسخهٔ موبایل پشتیبانی می‌شود.');
    }

    await SecureStore.setItemAsync(AUTH_TOKEN_KEY, token);
}

export async function removeStoredAuthToken(): Promise<void> {
    if (Platform.OS !== 'web') {
        await SecureStore.deleteItemAsync(AUTH_TOKEN_KEY);
    }
}

export async function sendOtp(input: {
    phone: string;
    type: 'login' | 'register';
    name?: string;
    email?: string;
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
    email?: string;
}): Promise<SessionResponse> {
    const deviceId = await getDeviceId();
    const deviceName = `${Platform.OS} device`;

    return request('/auth/otp/verify', {
        method: 'POST',
        deviceId,
        body: {
            ...input,
            device_id: deviceId,
            device_name: deviceName,
            platform: Platform.OS === 'ios' ? 'ios' : 'android',
        },
    });
}

export async function fetchCurrentUser(token: string): Promise<AuthenticatedUser> {
    const response = await request<{ user: AuthenticatedUser }>('/auth/me', { token });
    return response.user;
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
