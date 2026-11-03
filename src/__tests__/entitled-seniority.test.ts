import { describe, expect, it } from '@jest/globals';

import {
    calculateEntitledSeniorityForDateRangeFromPeriodData,
    parseDateInput,
} from '@/utils/salary-calculation';

describe('entitled seniority date-range calculation', () => {
    it('keeps employment date as the seniority anchor and limits totals to the selected range', () => {
        const employmentDate = parseDateInput('1399/05/10');
        const firstRangeStart = parseDateInput('1400/05/10');
        const secondRangeStart = parseDateInput('1400/06/01');
        const endDate = parseDateInput('1400/06/20');

        if (!employmentDate || !firstRangeStart || !secondRangeStart || !endDate) {
            throw new Error('Test dates must be valid Jalali dates.');
        }

        const periodBuckets = [{
            year: 1400,
            periods: [{
                period_index: 1,
                month_count: 12,
                daily_minimum_wage: 0,
                percent_increase: 1,
                seniority_base: 50000,
            }],
        }];

        const fullSelection = calculateEntitledSeniorityForDateRangeFromPeriodData(
            employmentDate,
            firstRangeStart,
            endDate,
            periodBuckets,
            'unclassified',
        );
        const shortenedSelection = calculateEntitledSeniorityForDateRangeFromPeriodData(
            employmentDate,
            secondRangeStart,
            endDate,
            periodBuckets,
            'unclassified',
        );

        expect(fullSelection.breakdown[0]).toMatchObject({
            startDate: firstRangeStart,
            endDate,
            entitlement: 50000,
        });
        expect(shortenedSelection.breakdown[0]).toMatchObject({
            startDate: secondRangeStart,
            endDate,
            entitlement: 50000,
        });
        expect(shortenedSelection.totalAmount).toBeLessThan(fullSelection.totalAmount);
        expect(fullSelection.finalEntitlement).toBe(shortenedSelection.finalEntitlement);
    });
});
