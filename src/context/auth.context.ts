import { createContext } from 'react';
import type { AuthDevice, AuthenticatedUser } from '@/services/auth-api';

export interface AuthContextType {
    user: AuthenticatedUser | null;
    isLoading: boolean;
    sessionError: string | null;
    refreshUser: () => Promise<void>;
    signInWithOtp: (input: {
        phone: string;
        type: 'login' | 'register';
        code: string;
        name?: string;
        email?: string;
    }) => Promise<void>;
    signOut: () => Promise<void>;
    signOutAll: () => Promise<void>;
    getDevices: () => Promise<AuthDevice[]>;
    revokeUserDevice: (deviceId: number) => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);
