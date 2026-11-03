import { create } from 'zustand';
import type { AuthenticatedUser } from '@/services/auth-api';

export interface AccountSuspensionNotice {
    reason: string | null;
    until: string | null;
}

interface AuthSessionState {
    user: AuthenticatedUser | null;
    token: string | null;
    isLoading: boolean;
    sessionError: string | null;
    accountSuspension: AccountSuspensionNotice | null;
    setUser: (user: AuthenticatedUser | null) => void;
    setToken: (token: string | null) => void;
    setLoading: (isLoading: boolean) => void;
    setSessionError: (sessionError: string | null) => void;
    setAccountSuspension: (notice: AccountSuspensionNotice | null) => void;
    clearSession: () => void;
}

export const useAuthSessionStore = create<AuthSessionState>((set) => ({
    user: null,
    token: null,
    isLoading: true,
    sessionError: null,
    accountSuspension: null,
    setUser: (user) => set({ user }),
    setToken: (token) => set({ token }),
    setLoading: (isLoading) => set({ isLoading }),
    setSessionError: (sessionError) => set({ sessionError }),
    setAccountSuspension: (accountSuspension) => set({ accountSuspension }),
    clearSession: () => set({ user: null, token: null, sessionError: null, accountSuspension: null }),
}));
