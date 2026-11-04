import { describe, expect, it } from '@jest/globals';

import { getPlanAccessValidUntil } from '@/services/plan-access-cache';
import { CACHE_POLICY } from '@/services/cache-policy';

describe('verified offline plan access', () => {
    const verifiedAt = Date.parse('2026-01-01T00:00:00.000Z');
    const accessGracePeriod = CACHE_POLICY.access.gracePeriodMs;

    it('allows access for at most 30 days after online verification when there is no active subscription expiry', () => {
        expect(getPlanAccessValidUntil(null, verifiedAt)).toBe(verifiedAt + accessGracePeriod);
    });

    it('ends access at the current subscription expiry when it is sooner than the offline limit', () => {
        const subscriptionEndsAt = new Date(verifiedAt + 10 * 24 * 60 * 60 * 1000).toISOString();

        expect(getPlanAccessValidUntil(subscriptionEndsAt, verifiedAt)).toBe(Date.parse(subscriptionEndsAt));
    });

    it('keeps the 30-day offline limit when the current subscription expires later', () => {
        const subscriptionEndsAt = new Date(verifiedAt + 40 * 24 * 60 * 60 * 1000).toISOString();

        expect(getPlanAccessValidUntil(subscriptionEndsAt, verifiedAt)).toBe(verifiedAt + accessGracePeriod);
    });

    it('rejects invalid current subscription expiry values', () => {
        expect(() => getPlanAccessValidUntil('not-a-date', verifiedAt)).toThrow(
            'زمان پایان اشتراک از سرور معتبر نیست',
        );
    });
});
