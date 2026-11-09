import { createContext } from 'react';
import type { PlanAccess } from '@/services/auth-api';

export interface PlanAccessContextType {
    planAccess: PlanAccess | null;
    isUsingOfflineData: boolean;
    isLoading: boolean;
    error: string | null;
    refresh: () => Promise<boolean>;
}

export const PlanAccessContext = createContext<PlanAccessContextType | undefined>(undefined);
