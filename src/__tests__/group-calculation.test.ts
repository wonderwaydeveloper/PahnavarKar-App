import { describe, expect, it } from '@jest/globals';

import {
    calculateWorkerClaimsAfterPayments,
    INSURANCE_CALCULATION_KEYS,
} from '@/utils/group-calculation';

describe('insurance-covered group calculation items', () => {
    it('matches only the ten items designated for insurance deductions', () => {
        expect(INSURANCE_CALCULATION_KEYS).toEqual([
            'base-salary',
            'entitled-seniority',
            'housing-allowance',
            'monthly-allowance',
            'spousal-allowance',
            'overtime-entitlement',
            'night-shift-entitlement',
            'monthly-shift-work',
            'official-holiday-work',
            'friday-work',
        ]);
    });
});

describe('calculateWorkerClaimsAfterPayments', () => {
    it('does not deduct the worker insurance share when exempt', () => {
        expect(calculateWorkerClaimsAfterPayments(2_000, 1_000, 100, true)).toEqual({
            remainingClaim: 1_900,
            workerInsuranceAmount: 0,
            finalClaim: 1_900,
        });
    });

    it('deducts the worker insurance share when not exempt', () => {
        expect(calculateWorkerClaimsAfterPayments(2_000, 1_000, 100, false)).toEqual({
            remainingClaim: 1_900,
            workerInsuranceAmount: 70,
            finalClaim: 1_830,
        });
    });

    it('does not deduct worker insurance when the covered base is zero', () => {
        expect(calculateWorkerClaimsAfterPayments(2_000, 0, 100, false)).toEqual({
            remainingClaim: 1_900,
            workerInsuranceAmount: 0,
            finalClaim: 1_900,
        });
    });

    it('preserves validation errors', () => {
        expect(calculateWorkerClaimsAfterPayments(1_000, 500, -1, true)).toMatchObject({
            error: 'مبلغ پرداخت‌شده باید عدد صحیح و نامنفی باشد.',
        });
    });
});
