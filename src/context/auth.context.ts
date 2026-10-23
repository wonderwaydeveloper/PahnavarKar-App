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
    }) => Promise<'profile_required' | 'authenticated'>;
    uploadProfilePhoto: (uri: string) => Promise<void>;
    removeProfilePhoto: () => Promise<void>;
    updateProfile: (input: { name: string; email: string | null }) => Promise<void>;
    updateInactivityDeletion: (periodMonths: 6 | 12 | 18 | null) => Promise<void>;
    sendEmailVerificationCode: () => Promise<{ resend_after: number }>;
    verifyEmail: (code: string) => Promise<void>;
    changePhone: (phone: string, code: string) => Promise<void>;
    deleteAccount: (code: string) => Promise<void>;
    signOut: () => Promise<void>;
    signOutAll: () => Promise<void>;
    getDevices: () => Promise<AuthDevice[]>;
    revokeUserDevice: (deviceId: number) => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);
