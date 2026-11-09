import { describe, expect, it } from '@jest/globals';

import {
    calculateEntitledSeniorityForDateRangeFromPeriodData,
    calculateEntitledSeniorityFromPeriodData,
    parseDateInput,
} from '@/utils/salary-calculation';

describe('entitled seniority date-range calculation', () => {
    it('uses the 1 Farvardin settlement anniversary for the entire year after settlement through 1391', () => {
        const employmentDate = parseDateInput('1390/04/03');
        const yearStart = parseDateInput('1405/01/01');
        const yearEnd = parseDateInput('1405/12/29');

        if (!employmentDate || !yearStart || !yearEnd) {
            throw new Error('Test dates must be valid Jalali dates.');
        }

        const annualValues: [number, number, number][] = [
            [1392, 3000, 1.1],
            [1393, 5000, 1.12],
            [1394, 10000, 1.17],
            [1395, 10000, 1.14],
            [1396, 17000, 1.12],
            [1397, 17000, 1.104],
            [1398, 23333, 1.13],
            [1399, 33333, 1.15],
            [1400, 46667, 1.26],
            [1401, 70000, 1.38],
            [1402, 70000, 1.21],
            [1403, 70000, 1.22],
            [1404, 94000, 1.32],
            [1405, 166667, 1.45],
        ];
        const periodBuckets = annualValues.map(([year, seniorityBase, percentIncrease]) => ({
            year,
            periods: [{
                period_index: 1,
                month_count: 12,
                daily_minimum_wage: 0,
                percent_increase: percentIncrease,
                seniority_base: seniorityBase,
            }],
        }));

        const result = calculateEntitledSeniorityForDateRangeFromPeriodData(
            employmentDate,
            yearStart,
            yearEnd,
            periodBuckets,
            'unclassified',
            undefined,
            true,
        );

        expect(result.finalEntitlement).toBe(1_761_042);
        expect(result.breakdown).toHaveLength(1);
        expect(result.breakdown[0]).toMatchObject({
            startDate: yearStart,
            endDate: yearEnd,
            entitlement: 1_761_042,
        });
    });

    it('keeps the original employment anniversary when employment began after 1 Farvardin 1391', () => {
        const employmentDate = parseDateInput('1391/04/03');
        const endDate = parseDateInput('1393/12/29');

        if (!employmentDate || !endDate) {
            throw new Error('Test dates must be valid Jalali dates.');
        }

        const periodBuckets = [1392, 1393].map((year) => ({
            year,
            periods: [{
                period_index: 1,
                month_count: 12,
                daily_minimum_wage: 0,
                percent_increase: 1,
                seniority_base: 5000,
            }],
        }));
        const result = calculateEntitledSeniorityFromPeriodData(
            employmentDate,
            endDate,
            periodBuckets,
            'unclassified',
            undefined,
            true,
        );

        expect(result.breakdown.some((item) => item.startDate.year === 1393
            && item.startDate.month === 4
            && item.startDate.day === 3)).toBe(true);
    });

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
