import { describe, expect, it } from '@jest/globals';

import { calculateGroupItems, type GroupCalculationKey } from '@/utils/group-calculation';
import {
    calculateBonusEntitlementFromPeriodData,
    calculateEndOfServiceYearsFromPeriodData,
    calculateEntitledSeniorityForDateRangeFromPeriodData,
    calculateEntitledSeniorityFromPeriodData,
    calculateFridayWorkFromPeriodData,
    calculateMissionAllowanceFromPeriodData,
    calculateMonthlyShiftWorkFromPeriodData,
    calculateNightShiftEntitlementFromPeriodData,
    calculateOfficialHolidayWorkFromPeriodData,
    calculateOvertimeEntitlementFromPeriodData,
    calculateSuspensionWageFromPeriodData,
    calculateUnusedLeaveWageFromPeriodData,
    parseDateInput,
    type SalaryPeriodBucket,
} from '@/utils/salary-calculation';

const EXPECTED_DAILY_SENIORITY_1405 = 1_761_042;

function getSettlementExampleDates() {
    const employmentStartDate = parseDateInput('1390/04/03');
    const startDate = parseDateInput('1405/01/01');
    const endDate = parseDateInput('1405/12/29');
    if (!employmentStartDate || !startDate || !endDate) {
        throw new Error('Settlement example dates must be valid Jalali dates.');
    }

    return { employmentStartDate, startDate, endDate };
}

function getSettlementExamplePeriodBuckets(): SalaryPeriodBucket[] {
    const annualPeriods: Record<number, [number, number, number][]> = {
        1392: [[4, 3000, 1.1], [8, 3000, 1.1]],
        1393: [[12, 5000, 1.12]],
        1394: [[12, 10000, 1.17]],
        1395: [[6, 10000, 1.14], [6, 10000, 1.14]],
        1396: [[12, 17000, 1.12]],
        1397: [[12, 17000, 1.104]],
        1398: [[12, 23333, 1.13]],
        1399: [[3, 58333, 1.15], [9, 33333, 1.15]],
        1400: [[12, 46667, 1.26]],
        1401: [[12, 70000, 1.38]],
        1402: [[12, 70000, 1.21]],
        1403: [[12, 70000, 1.22]],
        1404: [[12, 94000, 1.32]],
        1405: [[12, 166667, 1.45]],
    };

    return Object.entries(annualPeriods).map(([year, periods]) => ({
        year: Number(year),
        periods: periods.map(([month_count, seniority_base, percent_increase], index) => ({
            period_index: index + 1,
            month_count,
            daily_minimum_wage: 1_000_000,
            percent_increase,
            seniority_base,
            monthly_housing_single: 0,
            monthly_housing_married: 0,
            monthly_single_allowance: 0,
            monthly_married_allowance: 0,
            child_allowance: 0,
            marital_allowance: 0,
        })),
    }));
}

function expectSeniorityInBreakdown(
    breakdown: { dailySeniority?: number; seniorityBase?: number }[],
) {
    expect(breakdown.length).toBeGreaterThan(0);
    expect(breakdown.every((item) => (
        Math.round(item.dailySeniority ?? item.seniorityBase ?? 0) === EXPECTED_DAILY_SENIORITY_1405
    ))).toBe(true);
}

describe('cards that use entitled seniority', () => {
    it('uses the last covered day seniority in each Persian year on the bonus card only', () => {
        const employmentStartDate = parseDateInput('1399/07/01');
        const startDate = parseDateInput('1400/01/01');
        const endDate = parseDateInput('1400/12/29');
        if (!employmentStartDate || !startDate || !endDate) {
            throw new Error('Bonus seniority example dates must be valid Jalali dates.');
        }

        const periodBuckets: SalaryPeriodBucket[] = [
            {
                year: 1399,
                periods: [{
                    period_index: 1,
                    month_count: 12,
                    daily_minimum_wage: 900,
                    percent_increase: 1,
                    seniority_base: 50,
                }],
            },
            {
                year: 1400,
                periods: [
                    {
                        period_index: 1,
                        month_count: 6,
                        daily_minimum_wage: 1_000,
                        percent_increase: 1,
                        seniority_base: 100,
                    },
                    {
                        period_index: 2,
                        month_count: 6,
                        daily_minimum_wage: 1_200,
                        percent_increase: 1,
                        seniority_base: 200,
                    },
                ],
            },
        ];

        const anniversaryBasedBonus = calculateBonusEntitlementFromPeriodData(
            startDate,
            endDate,
            employmentStartDate,
            periodBuckets,
        );
        const yearEndBasedBonus = calculateBonusEntitlementFromPeriodData(
            startDate,
            endDate,
            employmentStartDate,
            periodBuckets,
            'unclassified',
            undefined,
            false,
            'persian-year-end',
        );

        expect(anniversaryBasedBonus.breakdown.map((item) => item.dailySeniority)).toEqual([0, 200]);
        expect(yearEndBasedBonus.breakdown.map((item) => item.dailySeniority)).toEqual([200, 200]);
        expect(yearEndBasedBonus.breakdown.map((item) => item.phase)).toEqual([
            'calendar-year-end',
            'calendar-year-end',
        ]);
        expect(yearEndBasedBonus.totalEntitlementAmount).toBe(78_000);
        expect(anniversaryBasedBonus.totalEntitlementAmount).toBe(72_000);

        const midyearEndDate = parseDateInput('1400/06/31');
        if (!midyearEndDate) {
            throw new Error('Bonus partial-year end date must be a valid Jalali date.');
        }
        const partialYearBonus = calculateBonusEntitlementFromPeriodData(
            startDate,
            midyearEndDate,
            employmentStartDate,
            periodBuckets,
            'unclassified',
            undefined,
            false,
            'persian-year-end',
        );
        expect(partialYearBonus.breakdown.map((item) => item.dailySeniority)).toEqual([0]);
        expect(partialYearBonus.totalEntitlementAmount).toBe(30_000);
    });

    it('does not apply 1405 seniority before the selected end date reaches the employment anniversary', () => {
        const employmentStartDate = parseDateInput('1404/03/02');
        const startDate = parseDateInput('1404/03/02');
        const beforeAnniversaryEndDate = parseDateInput('1405/02/02');
        const anniversaryEndDate = parseDateInput('1405/03/02');
        if (!employmentStartDate || !startDate || !beforeAnniversaryEndDate || !anniversaryEndDate) {
            throw new Error('Bonus anniversary example dates must be valid Jalali dates.');
        }

        const periodBuckets: SalaryPeriodBucket[] = [
            {
                year: 1404,
                periods: [{
                    period_index: 1,
                    month_count: 12,
                    daily_minimum_wage: 3_463_656,
                    percent_increase: 1.32,
                    seniority_base: 94_000,
                }],
            },
            {
                year: 1405,
                periods: [{
                    period_index: 1,
                    month_count: 12,
                    daily_minimum_wage: 5_541_850,
                    percent_increase: 1.45,
                    seniority_base: 166_667,
                }],
            },
        ];

        const beforeAnniversaryBonus = calculateBonusEntitlementFromPeriodData(
            startDate,
            beforeAnniversaryEndDate,
            employmentStartDate,
            periodBuckets,
            'unclassified',
            undefined,
            false,
            'persian-year-end',
        );
        expect(beforeAnniversaryBonus.breakdown.map((item) => item.dailySeniority)).toEqual([0, 0]);
        expect(beforeAnniversaryBonus.totalEntitlementAmount).toBe(202_121_090);

        const anniversaryBonus = calculateBonusEntitlementFromPeriodData(
            startDate,
            anniversaryEndDate,
            employmentStartDate,
            periodBuckets,
            'unclassified',
            undefined,
            false,
            'persian-year-end',
        );
        expect(anniversaryBonus.breakdown.at(-1)?.dailySeniority).toBe(166_667);
    });

    it('uses the minimum wage applicable on the last covered day of each year for the bonus card', () => {
        const employmentStartDate = parseDateInput('1399/02/02');
        const startDate = parseDateInput('1399/02/02');
        const yearEndDate = parseDateInput('1399/12/29');
        const partialYearEndDate = parseDateInput('1399/03/02');
        if (!employmentStartDate || !startDate || !yearEndDate || !partialYearEndDate) {
            throw new Error('Bonus minimum-wage example dates must be valid Jalali dates.');
        }

        const periodBuckets: SalaryPeriodBucket[] = [{
            year: 1399,
            periods: [
                {
                    period_index: 1,
                    month_count: 3,
                    daily_minimum_wage: 611_809,
                    percent_increase: 1,
                    seniority_base: 58_333,
                },
                {
                    period_index: 2,
                    month_count: 9,
                    daily_minimum_wage: 636_809,
                    percent_increase: 1,
                    seniority_base: 33_333,
                },
            ],
        }];

        const lastCoveredDayBonus = calculateBonusEntitlementFromPeriodData(
            startDate,
            yearEndDate,
            employmentStartDate,
            periodBuckets,
            'unclassified',
            undefined,
            false,
            'persian-year-end',
            'last-covered-day-of-year',
        );
        expect(lastCoveredDayBonus.breakdown.map((item) => item.dailyMinimumWage)).toEqual([
            636_809,
            636_809,
        ]);
        expect(lastCoveredDayBonus.totalEntitlementAmount).toBe(34_815_649);

        const midPeriodEndBonus = calculateBonusEntitlementFromPeriodData(
            startDate,
            partialYearEndDate,
            employmentStartDate,
            periodBuckets,
            'unclassified',
            undefined,
            false,
            'persian-year-end',
            'last-covered-day-of-year',
        );
        expect(midPeriodEndBonus.breakdown.map((item) => item.dailyMinimumWage)).toEqual([611_809]);
        expect(midPeriodEndBonus.totalEntitlementAmount).toBe(3_157_724);
    });

    it('applies the settled 1 Farvardin anniversary to every dependent standalone card', () => {
        const { employmentStartDate, startDate, endDate } = getSettlementExampleDates();
        const periodBuckets = getSettlementExamplePeriodBuckets();
        const seniority = calculateEntitledSeniorityFromPeriodData(
            employmentStartDate,
            endDate,
            periodBuckets,
            'unclassified',
            undefined,
            true,
        );
        const seniorityByPeriod = Object.fromEntries(
            seniority.breakdown.map((item) => [`${item.year}:${item.periodIndex}`, item.entitlement]),
        );

        const entitledSeniority = calculateEntitledSeniorityForDateRangeFromPeriodData(
            employmentStartDate,
            startDate,
            endDate,
            periodBuckets,
            'unclassified',
            undefined,
            true,
        );
        expect(entitledSeniority.breakdown).toHaveLength(1);
        expect(entitledSeniority.breakdown[0].entitlement).toBe(EXPECTED_DAILY_SENIORITY_1405);

        const endOfService = calculateEndOfServiceYearsFromPeriodData(
            startDate,
            endDate,
            periodBuckets,
            seniority.finalEntitlement,
            seniorityByPeriod,
        );
        expect(Math.round(endOfService.finalDailySeniority)).toBe(EXPECTED_DAILY_SENIORITY_1405);
        expect(endOfService.breakdown.every((item) => (
            Math.round(item.dailySeniority) === EXPECTED_DAILY_SENIORITY_1405
        ))).toBe(true);

        const bonus = calculateBonusEntitlementFromPeriodData(
            startDate,
            endDate,
            employmentStartDate,
            periodBuckets,
            'unclassified',
            undefined,
            true,
        );
        expectSeniorityInBreakdown(bonus.breakdown);

        const unusedLeaveWage = calculateUnusedLeaveWageFromPeriodData(
            startDate,
            endDate,
            periodBuckets,
            'single',
            0,
            seniority.finalEntitlement,
            1,
        );
        expect(unusedLeaveWage?.dailySeniority).toBe(EXPECTED_DAILY_SENIORITY_1405);

        const overtime = calculateOvertimeEntitlementFromPeriodData(
            startDate,
            endDate,
            employmentStartDate,
            periodBuckets,
            1,
            'unclassified',
            undefined,
            true,
        );
        expectSeniorityInBreakdown(overtime.breakdown);

        const nightShift = calculateNightShiftEntitlementFromPeriodData(
            startDate,
            endDate,
            employmentStartDate,
            periodBuckets,
            'unclassified',
            undefined,
            true,
        );
        expectSeniorityInBreakdown(nightShift.breakdown);

        const monthlyShift = calculateMonthlyShiftWorkFromPeriodData(
            startDate,
            endDate,
            employmentStartDate,
            periodBuckets,
            'morning-evening',
            'unclassified',
            undefined,
            true,
        );
        expectSeniorityInBreakdown(monthlyShift.breakdown);

        const officialHolidayWork = calculateOfficialHolidayWorkFromPeriodData(
            startDate,
            endDate,
            employmentStartDate,
            periodBuckets,
            ['1405/01/01'],
            'unclassified',
            undefined,
            true,
        );
        expectSeniorityInBreakdown(officialHolidayWork.breakdown);

        const fridayWork = calculateFridayWorkFromPeriodData(
            startDate,
            endDate,
            employmentStartDate,
            periodBuckets,
            { '1405:1': 1 },
            'unclassified',
            undefined,
            true,
        );
        expectSeniorityInBreakdown(fridayWork.breakdown);

        const missionAllowance = calculateMissionAllowanceFromPeriodData(
            employmentStartDate,
            startDate,
            endDate,
            { '1405:1': 1 },
            periodBuckets,
            'unclassified',
            undefined,
            true,
        );
        expect(missionAllowance).not.toBeNull();
        expectSeniorityInBreakdown(missionAllowance!.breakdown);

        const suspensionWage = calculateSuspensionWageFromPeriodData(
            startDate,
            endDate,
            employmentStartDate,
            periodBuckets,
            'unclassified',
            undefined,
            true,
        );
        expectSeniorityInBreakdown(suspensionWage.breakdown);
    });

    it('passes the settlement example through every dependent group-calculation card', () => {
        const { employmentStartDate, startDate, endDate } = getSettlementExampleDates();
        const selectedKeys: GroupCalculationKey[] = [
            'entitled-seniority',
            'overtime-entitlement',
            'night-shift-entitlement',
            'monthly-shift-work',
            'end-of-service-years',
            'bonus-entitlement',
            'official-holiday-work',
            'friday-work',
            'mission-allowance',
            'unused-leave-wage',
        ];
        const results = calculateGroupItems(selectedKeys, {
            startDate,
            endDate,
            missionStartDate: startDate,
            missionEndDate: endDate,
            periodBuckets: getSettlementExamplePeriodBuckets(),
            officialHolidayDates: ['1405/01/01'],
            maritalStatus: 'single',
            childrenCount: 0,
            dailyWorkMinutes: 440,
            dailyWorkHours: 440 / 60,
            employmentStartDate,
            workshopType: 'unclassified',
            settledThrough1391: true,
            dailyOvertimeHours: 1,
            shiftType: 'morning-evening',
            fridayWorkDaysByPeriod: { '1405:1': 1 },
            missionDaysByPeriod: { '1405:1': 1 },
            usedLeaveDaysBySegment: [0],
            initialSavedLeaveDays: 0,
        });

        expect(results.map((result) => result.key)).toEqual(selectedKeys);
        expect(results.every((result) => !result.error)).toBe(true);
        expect(results.find((result) => result.key === 'entitled-seniority')?.value)
            .toBe(EXPECTED_DAILY_SENIORITY_1405);
        expect(results.find((result) => result.key === 'end-of-service-years')?.breakdown)
            .toEqual(expect.arrayContaining([
                expect.objectContaining({ dailySeniority: expect.any(Number) }),
            ]));
        const endOfServiceBreakdown = results.find((result) => result.key === 'end-of-service-years')?.breakdown;
        expect(Math.round(Number((endOfServiceBreakdown?.[0] as { dailySeniority?: number } | undefined)?.dailySeniority)))
            .toBe(EXPECTED_DAILY_SENIORITY_1405);
    });
});
