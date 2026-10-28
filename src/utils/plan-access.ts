import type { PlanAccess } from '@/services/auth-api';

export function hasPlanFeature(planAccess: PlanAccess | null | undefined, featureKey: string): boolean {
    return planAccess?.features[featureKey] === true;
}
