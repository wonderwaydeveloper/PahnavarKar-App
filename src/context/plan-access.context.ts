import { createContext } from 'react';
import type { PlanAccess } from '@/services/auth-api';

export interface PlanAccessContextType {
    planAccess: PlanAccess | null;
    isLoading: boolean;
    error: string | null;
    refresh: () => Promise<void>;
}

export const PlanAccessContext = createContext<PlanAccessContextType | undefined>(undefined);
