import { create } from 'zustand';
import type { AuthenticatedUser } from '@/services/auth-api';

interface AuthSessionState {
    user: AuthenticatedUser | null;
    token: string | null;
    isLoading: boolean;
    sessionError: string | null;
    setUser: (user: AuthenticatedUser | null) => void;
    setToken: (token: string | null) => void;
    setLoading: (isLoading: boolean) => void;
    setSessionError: (sessionError: string | null) => void;
    clearSession: () => void;
}

export const useAuthSessionStore = create<AuthSessionState>((set) => ({
    user: null,
    token: null,
    isLoading: true,
    sessionError: null,
    setUser: (user) => set({ user }),
    setToken: (token) => set({ token }),
    setLoading: (isLoading) => set({ isLoading }),
    setSessionError: (sessionError) => set({ sessionError }),
    clearSession: () => set({ user: null, token: null, sessionError: null }),
}));
