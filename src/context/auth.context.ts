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
    }) => Promise<'profile_required' | 'authenticated' | { status: 'two_factor_required'; challengeToken: string }>;
    verifyTwoFactorLogin: (challengeToken: string, code: string) => Promise<void>;
    uploadProfilePhoto: (uri: string) => Promise<void>;
    removeProfilePhoto: () => Promise<void>;
    updateProfile: (input: { name: string }) => Promise<void>;
    updateInactivityDeletion: (periodMonths: 6 | 12 | 18 | null) => Promise<void>;
    changePhone: (phone: string, code: string) => Promise<void>;
    deleteAccount: (code: string) => Promise<void>;
    signOut: () => Promise<void>;
    signOutAll: () => Promise<void>;
    getDevices: () => Promise<AuthDevice[]>;
    revokeUserDevice: (deviceId: number) => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);
