import { useContext } from 'react';
import { PlanAccessContext } from '@/context/plan-access.context';

export function usePlanAccess() {
    const context = useContext(PlanAccessContext);
    if (!context) {
        throw new Error('usePlanAccess باید داخل PlanAccessProvider استفاده شود.');
    }

    return context;
}
