import { isValidJalaaliDate, jalaaliMonthLength, toGregorian, toJalaali } from 'jalaali-js';

export interface SalaryCalculationBreakdownItem {
    year: number;
    periodIndex: number;
    daysCovered: number;
    dailyMinimumWage: number | null;
    dailyWorkMinutes: number;
    amount: number;
}

export interface SalaryCalculationResult {
    totalAmount: number;
    breakdown: SalaryCalculationBreakdownItem[];
}

export interface SuspensionWageCalculationBreakdownItem {
    year: number;
    periodIndex: number;
    phase: 'before-anniversary' | 'after-anniversary';
    startDate: ParsedDateInput;
    endDate: ParsedDateInput;
    daysCovered: number;
    dailyMinimumWage: number;
    dailySeniority: number;
    dailyHousingAllowance: number;
    dailyChildAllowance: number;
    dailyMonthlyAllowance: number;
    dailyMaritalAllowance: number;
    dailyWage: number;
    amount: number;
}

export interface SuspensionWageCalculationResult {
    totalAmount: number;
    breakdown: SuspensionWageCalculationBreakdownItem[];
}

export interface OrdinaryWorkHoursBreakdownItem {
    year: number;
    periodIndex: number;
    daysCovered: number;
    officialHolidays: number;
    fridays: number;
    workingDays: number;
    requiredHours: number;
}

export interface OrdinaryWorkHoursCalculationResult {
    totalHours: number;
    breakdown: OrdinaryWorkHoursBreakdownItem[];
}

export interface YoungWorkerWorkHoursCalculationResult {
    totalHours: number;
    breakdown: OrdinaryWorkHoursBreakdownItem[];
}

export interface FridayWorkCalculationBreakdownItem {
    year: number;
    periodIndex: number;
    phase: 'before-anniversary' | 'after-anniversary';
    startDate: ParsedDateInput;
    endDate: ParsedDateInput;
    daysCovered: number;
    fridaysInPeriod: number;
    fridayWorkDays: number;
    fridayWorkRate: number | null;
    dailyMinimumWage: number;
    dailySeniority: number;
    amount: number;
}

export interface FridayWorkCalculationResult {
    totalAmount: number;
    breakdown: FridayWorkCalculationBreakdownItem[];
}

export interface OfficialHolidayWorkBreakdownItem {
    year: number;
    periodIndex: number;
    phase: 'before-anniversary' | 'after-anniversary';
    startDate: ParsedDateInput;
    endDate: ParsedDateInput;
    daysCovered: number;
    dailyMinimumWage: number;
    seniorityBase: number;
    holidayWorkRate: number;
    amount: number;
}

export interface OfficialHolidayWorkCalculationResult {
    totalAmount: number;
    breakdown: OfficialHolidayWorkBreakdownItem[];
}

export interface OfficialHolidaysInDateRangeResult {
    totalHolidays: number;
    breakdown: OfficialHolidaysInDateRangeBreakdownItem[];
}

export interface OfficialHolidaysInDateRangeBreakdownItem {
    year: number;
    startDate: ParsedDateInput;
    endDate: ParsedDateInput;
    totalHolidays: number;
}

export function calculateOfficialHolidaysInDateRange(
    startDate: ParsedDateInput,
    endDate: ParsedDateInput,
    officialHolidayDates: string[],
): OfficialHolidaysInDateRangeResult {
    if (compareParsedDates(startDate, endDate) > 0) {
        return { totalHolidays: 0, breakdown: [] };
    }

    const holidayDates = officialHolidayDates.filter((holidayDate) => {
        const holiday = parseDateInput(holidayDate);
        if (!holiday || compareParsedDates(holiday, startDate) < 0 || compareParsedDates(holiday, endDate) > 0) {
            return false;
        }

        const gregorian = toGregorian(holiday.year, holiday.month, holiday.day);
        return new Date(Date.UTC(gregorian.gy, gregorian.gm - 1, gregorian.gd)).getUTCDay() !== 5;
    }).sort();

    const breakdown: OfficialHolidaysInDateRangeBreakdownItem[] = [];
    for (let year = startDate.year; year <= endDate.year; year += 1) {
        const periodStart = year === startDate.year ? startDate : { year, month: 1, day: 1 };
        const periodEnd = year === endDate.year
            ? endDate
            : { year, month: 12, day: jalaaliMonthLength(year, 12) };
        const periodHolidayDates = holidayDates.filter((holidayDate) => {
            const holiday = parseDateInput(holidayDate);
            return holiday !== null
                && compareParsedDates(holiday, periodStart) >= 0
                && compareParsedDates(holiday, periodEnd) <= 0;
        });

        breakdown.push({
            year,
            startDate: periodStart,
            endDate: periodEnd,
            totalHolidays: periodHolidayDates.length,
        });
    }

    return { totalHolidays: holidayDates.length, breakdown };
}

export interface IllegalForeignWorkerPenaltyBreakdownItem {
    year: number;
    periodIndex: number;
    daysCovered: number;
    workerCount: number;
    dailyMinimumWage: number;
    amount: number;
}

export interface IllegalForeignWorkerPenaltyCalculationResult {
    totalAmount: number;
    breakdown: IllegalForeignWorkerPenaltyBreakdownItem[];
}

export interface SalaryPeriodBucket {
    year: number;
    periods: {
        period_index: number;
        month_count: number | null;
        daily_minimum_wage: number | null;
        percent_increase?: number | null;
        seniority_base?: number | null;
        seniority_base_by_group?: Record<number, number>;
        friday_work_per_day?: number | null;
        overtime_per_hour?: number | null;
        night_work_per_hour?: number | null;
        child_allowance?: number | null;
        monthly_single_allowance?: number | null;
        monthly_married_allowance?: number | null;
        monthly_housing_single?: number | null;
        monthly_housing_married?: number | null;
        marital_allowance?: number | null;
        monthly_shift_work_morning_evening_10?: number | null;
        monthly_shift_work_morning_evening_night_15?: number | null;
        monthly_shift_work_morning_night_or_evening_night_225?: number | null;
    }[];
}

export interface EntitledSeniorityCalculationBreakdownItem {
    year: number;
    periodIndex: number;
    startDate: ParsedDateInput;
    endDate: ParsedDateInput;
    daysCovered: number;
    phase: 'before-anniversary' | 'after-anniversary';
    entitlement: number;
    currentBase: number;
    previousEntitlement: number;
}

export interface EntitledSeniorityCalculationResult {
    totalAmount: number;
    finalEntitlement: number;
    breakdown: EntitledSeniorityCalculationBreakdownItem[];
}

export type EntitledSeniorityWorkshopType = 'classified' | 'unclassified';

export function calculateEntitledSeniorityFromPeriodData(
    employmentStartDate: ParsedDateInput,
    endDate: ParsedDateInput,
    periodBuckets: SalaryPeriodBucket[],
    workshopType: EntitledSeniorityWorkshopType,
    jobGroupNumber?: number,
    settledThrough1391 = false,
): EntitledSeniorityCalculationResult {
    if (compareParsedDates(employmentStartDate, endDate) > 0) {
        return { totalAmount: 0, finalEntitlement: 0, breakdown: [] };
    }

    const sortedBuckets = [...periodBuckets].sort((left, right) => left.year - right.year);
    const appliesSettlementPath = settledThrough1391 && employmentStartDate.year <= 1391;
    const firstCalculationYear = appliesSettlementPath ? 1392 : employmentStartDate.year;
    const calculationStartDate = appliesSettlementPath
        ? { year: 1392, month: 1, day: 1 }
        : employmentStartDate;
    const breakdown: EntitledSeniorityCalculationBreakdownItem[] = [];
    let previousEntitlement = 0;
    const firstEntitlementYear = appliesSettlementPath ? 1392 : employmentStartDate.year + 1;

    for (const bucket of sortedBuckets) {
        if (bucket.year < firstCalculationYear || bucket.year > endDate.year) {
            continue;
        }

        const sortedPeriods = [...bucket.periods].sort((left, right) => left.period_index - right.period_index);
        let monthOffset = 0;
        const previousEntitlementAtYearStart = previousEntitlement;
        let entitlementAtYearEnd = previousEntitlement;
        const anniversaryYear = bucket.year;
        const settledEmploymentAfterStartOf1391 = compareParsedDates(employmentStartDate, { year: 1391, month: 1, day: 1 }) > 0;
        const anniversaryDate = {
            year: anniversaryYear,
            month: appliesSettlementPath && bucket.year === 1392 && !settledEmploymentAfterStartOf1391 ? 1 : employmentStartDate.month,
            day: appliesSettlementPath && bucket.year === 1392 && !settledEmploymentAfterStartOf1391
                ? 1
                : Math.min(employmentStartDate.day, jalaaliMonthLength(anniversaryYear, employmentStartDate.month)),
        };

        for (const period of sortedPeriods) {
            const periodLength = Number(period.month_count ?? 0);
            if (!Number.isFinite(periodLength) || periodLength <= 0) {
                continue;
            }

            const periodStartMonth = monthOffset + 1;
            const periodEndMonth = monthOffset + periodLength;
            const periodStart = { year: bucket.year, month: periodStartMonth, day: 1 };
            const periodEnd = { year: bucket.year, month: periodEndMonth, day: jalaaliMonthLength(bucket.year, periodEndMonth) };
            const overlapStart = getLaterDate(calculationStartDate, periodStart);
            const overlapEnd = getEarlierDate(endDate, periodEnd);

            if (compareParsedDates(overlapStart, overlapEnd) > 0) {
                monthOffset = periodEndMonth;
                continue;
            }

            const currentBase = workshopType === 'classified'
                ? Number(period.seniority_base_by_group?.[jobGroupNumber ?? -1] ?? 0)
                : Number(period.seniority_base ?? 0);
            const isBeforeAnniversary = compareParsedDates(overlapEnd, anniversaryDate) < 0;
            const hasReachedFirstAnniversary = bucket.year >= firstEntitlementYear;

            if (!hasReachedFirstAnniversary && !appliesSettlementPath) {
                const daysCovered = Math.round(toDayNumber(overlapEnd) - toDayNumber(overlapStart) + 1);
                if (daysCovered > 0) {
                    breakdown.push({
                        year: bucket.year,
                        periodIndex: period.period_index,
                        startDate: overlapStart,
                        endDate: overlapEnd,
                        daysCovered,
                        phase: 'before-anniversary',
                        entitlement: 0,
                        currentBase,
                        previousEntitlement,
                    });
                }
                monthOffset = periodEndMonth;
                continue;
            }

            const annualIncrease = Number(period.percent_increase ?? 1);
            const beforeEntitlement = bucket.year > firstEntitlementYear
                ? previousEntitlementAtYearStart * annualIncrease
                : 0;
            const afterEntitlement = bucket.year === firstEntitlementYear
                ? currentBase
                : currentBase + beforeEntitlement;

            const addSegment = (segmentStart: ParsedDateInput, segmentEnd: ParsedDateInput, phase: 'before-anniversary' | 'after-anniversary', entitlement: number) => {
                const daysCovered = Math.round(toDayNumber(segmentEnd) - toDayNumber(segmentStart) + 1);
                if (daysCovered > 0) {
                    breakdown.push({
                        year: bucket.year,
                        periodIndex: period.period_index,
                        startDate: segmentStart,
                        endDate: segmentEnd,
                        daysCovered,
                        phase,
                        entitlement,
                        currentBase,
                        previousEntitlement,
                    });
                }
            };

            if (isBeforeAnniversary) {
                addSegment(overlapStart, overlapEnd, 'before-anniversary', beforeEntitlement);
            } else if (bucket.year >= firstEntitlementYear && compareParsedDates(overlapStart, anniversaryDate) < 0) {
                addSegment(overlapStart, getPreviousDate(anniversaryDate), 'before-anniversary', beforeEntitlement);
                addSegment(anniversaryDate, overlapEnd, 'after-anniversary', afterEntitlement);
            } else {
                addSegment(overlapStart, overlapEnd, 'after-anniversary', afterEntitlement);
            }

            if (compareParsedDates(overlapEnd, anniversaryDate) >= 0) {
                entitlementAtYearEnd = afterEntitlement;
            }

            monthOffset = periodEndMonth;
        }

        previousEntitlement = entitlementAtYearEnd;
    }

    const finalEntitlement = breakdown.at(-1)?.entitlement ?? previousEntitlement;
    return {
        totalAmount: Math.round(finalEntitlement),
        finalEntitlement: Math.round(finalEntitlement),
        breakdown,
    };
}

export function calculateEntitledSeniorityForDateRangeFromPeriodData(
    employmentStartDate: ParsedDateInput,
    startDate: ParsedDateInput,
    endDate: ParsedDateInput,
    periodBuckets: SalaryPeriodBucket[],
    workshopType: EntitledSeniorityWorkshopType,
    jobGroupNumber?: number,
    settledThrough1391 = false,
): EntitledSeniorityCalculationResult {
    if (compareParsedDates(startDate, endDate) > 0) {
        return { totalAmount: 0, finalEntitlement: 0, breakdown: [] };
    }

    const seniority = calculateEntitledSeniorityFromPeriodData(
        employmentStartDate,
        endDate,
        periodBuckets,
        workshopType,
        jobGroupNumber,
        settledThrough1391,
    );
    const breakdown: EntitledSeniorityCalculationBreakdownItem[] = [];
    let totalAmount = 0;

    for (const item of seniority.breakdown) {
        const overlapStart = getLaterDate(item.startDate, startDate);
        const overlapEnd = getEarlierDate(item.endDate, endDate);
        if (compareParsedDates(overlapStart, overlapEnd) > 0) continue;

        const daysCovered = Math.round(toDayNumber(overlapEnd) - toDayNumber(overlapStart) + 1);
        if (daysCovered <= 0) continue;

        const entitlement = Math.round(item.entitlement);
        totalAmount += daysCovered * entitlement;
        breakdown.push({
            ...item,
            startDate: overlapStart,
            endDate: overlapEnd,
            daysCovered,
            entitlement,
        });
    }

    return {
        totalAmount,
        finalEntitlement: breakdown.at(-1)?.entitlement ?? 0,
        breakdown,
    };
}

export interface MissionAllowanceCalculationBreakdownItem {
    year: number;
    periodIndex: number;
    phase: 'before-anniversary' | 'after-anniversary' | 'settled-through-1391';
    startDate: ParsedDateInput;
    endDate: ParsedDateInput;
    daysCovered: number;
    missionDays: number;
    dailyMinimumWage: number;
    dailySeniority: number;
    amount: number;
}

export interface MissionAllowanceCalculationResult {
    totalMissionDays: number;
    totalAmount: number;
    breakdown: MissionAllowanceCalculationBreakdownItem[];
}

export interface MissionAllowancePeriodRange {
    year: number;
    periodIndex: number;
    startDate: ParsedDateInput;
    endDate: ParsedDateInput;
    availableDays: number;
}

export function getMissionAllowancePeriodRanges(
    missionStartDate: ParsedDateInput,
    missionEndDate: ParsedDateInput,
    periodBuckets: SalaryPeriodBucket[],
): MissionAllowancePeriodRange[] {
    if (compareParsedDates(missionStartDate, missionEndDate) > 0) {
        return [];
    }

    const ranges: MissionAllowancePeriodRange[] = [];
    for (const bucket of [...periodBuckets].sort((left, right) => left.year - right.year)) {
        for (const periodSegment of getPeriodSegments(bucket)) {
            const startDate = getLaterDate(missionStartDate, periodSegment.start);
            const endDate = getEarlierDate(missionEndDate, periodSegment.end);
            if (compareParsedDates(startDate, endDate) > 0) {
                continue;
            }

            ranges.push({
                year: bucket.year,
                periodIndex: periodSegment.period.period_index,
                startDate,
                endDate,
                availableDays: Math.round(toDayNumber(endDate) - toDayNumber(startDate) + 1),
            });
        }
    }

    return ranges;
}

export function calculateMissionAllowanceFromPeriodData(
    employmentStartDate: ParsedDateInput,
    missionStartDate: ParsedDateInput,
    missionEndDate: ParsedDateInput,
    missionDaysByPeriod: Record<string, number>,
    periodBuckets: SalaryPeriodBucket[],
    workshopType: EntitledSeniorityWorkshopType,
    jobGroupNumber?: number,
    settledThrough1391 = false,
): MissionAllowanceCalculationResult | null {
    if (
        compareParsedDates(employmentStartDate, missionStartDate) > 0
        || compareParsedDates(missionStartDate, missionEndDate) > 0
    ) {
        return null;
    }

    const seniorityCalculation = calculateEntitledSeniorityFromPeriodData(
        employmentStartDate,
        missionEndDate,
        periodBuckets,
        workshopType,
        jobGroupNumber,
        settledThrough1391,
    );
    const appliesSettlementPath = settledThrough1391 && employmentStartDate.year <= 1391;
    const breakdown: MissionAllowanceCalculationBreakdownItem[] = [];

    for (const bucket of [...periodBuckets].sort((left, right) => left.year - right.year)) {
        for (const periodSegment of getPeriodSegments(bucket)) {
            const overlapStart = getLaterDate(missionStartDate, periodSegment.start);
            const overlapEnd = getEarlierDate(missionEndDate, periodSegment.end);
            if (compareParsedDates(overlapStart, overlapEnd) > 0) {
                continue;
            }

            const dailyMinimumWage = Number(periodSegment.period.daily_minimum_wage ?? 0);
            if (dailyMinimumWage <= 0) {
                continue;
            }

            const addBreakdownItem = (
                startDate: ParsedDateInput,
                endDate: ParsedDateInput,
                dailySeniority: number,
                phase: MissionAllowanceCalculationBreakdownItem['phase'],
            ) => {
                const daysCovered = Math.round(toDayNumber(endDate) - toDayNumber(startDate) + 1);
                if (daysCovered <= 0) {
                    return;
                }

                breakdown.push({
                    year: bucket.year,
                    periodIndex: periodSegment.period.period_index,
                    phase,
                    startDate,
                    endDate,
                    daysCovered,
                    missionDays: 0,
                    dailyMinimumWage,
                    dailySeniority,
                    amount: 0,
                });
            };

            if (appliesSettlementPath && bucket.year <= 1391) {
                addBreakdownItem(overlapStart, overlapEnd, 0, 'settled-through-1391');
                continue;
            }

            for (const senioritySegment of seniorityCalculation.breakdown) {
                if (
                    senioritySegment.year !== bucket.year
                    || senioritySegment.periodIndex !== periodSegment.period.period_index
                ) {
                    continue;
                }

                const segmentStart = getLaterDate(overlapStart, senioritySegment.startDate);
                const segmentEnd = getEarlierDate(overlapEnd, senioritySegment.endDate);
                if (compareParsedDates(segmentStart, segmentEnd) <= 0) {
                    addBreakdownItem(
                        segmentStart,
                        segmentEnd,
                        Math.max(0, Number(senioritySegment.entitlement) || 0),
                        senioritySegment.phase,
                    );
                }
            }
        }
    }

    const periodRanges = getMissionAllowancePeriodRanges(missionStartDate, missionEndDate, periodBuckets);
    const totalAvailableDays = periodRanges.reduce((total, range) => total + range.availableDays, 0);
    const totalRangeDays = Math.round(toDayNumber(missionEndDate) - toDayNumber(missionStartDate) + 1);
    if (totalAvailableDays !== totalRangeDays) {
        return null;
    }

    let totalMissionDays = 0;
    for (const periodRange of periodRanges) {
        const periodKey = `${periodRange.year}:${periodRange.periodIndex}`;
        const missionDays = Number(missionDaysByPeriod[periodKey]);
        const periodSegments = breakdown.filter((item) => (
            item.year === periodRange.year && item.periodIndex === periodRange.periodIndex
        ));
        const coveredDays = periodSegments.reduce((total, item) => total + item.daysCovered, 0);

        if (
            coveredDays !== periodRange.availableDays
            || !Number.isInteger(missionDays)
            || missionDays < 0
            || missionDays > periodRange.availableDays
        ) {
            return null;
        }

        totalMissionDays += missionDays;
        if (missionDays === 0) continue;

        const allocations = periodSegments.map((item) => ({
            item,
            exact: missionDays * item.daysCovered / periodRange.availableDays,
        }));
        let allocatedDays = 0;

        for (const allocation of allocations) {
            allocation.item.missionDays = Math.floor(allocation.exact);
            allocatedDays += allocation.item.missionDays;
        }

        const remainingDays = missionDays - allocatedDays;
        allocations
            .sort((left, right) => {
                const leftRemainder = left.exact - Math.floor(left.exact);
                const rightRemainder = right.exact - Math.floor(right.exact);
                return rightRemainder - leftRemainder
                    || compareParsedDates(left.item.startDate, right.item.startDate);
            })
            .slice(0, remainingDays)
            .forEach((allocation) => {
                allocation.item.missionDays += 1;
            });
    }

    if (totalMissionDays === 0) return null;

    const breakdownWithMissionDays = breakdown
        .filter((item) => item.missionDays > 0)
        .map((item) => ({
            ...item,
            amount: Math.round(item.missionDays * (item.dailyMinimumWage + item.dailySeniority)),
        }));

    return {
        totalMissionDays,
        totalAmount: breakdownWithMissionDays.reduce((total, item) => total + item.amount, 0),
        breakdown: breakdownWithMissionDays,
    };
}

export interface FamilyAllowanceCalculationBreakdownItem {
    year: number;
    periodIndex: number;
    monthsCovered: number;
    daysCovered: number;
    childAllowance: number | null;
    amount: number;
}

export interface HousingAllowanceCalculationBreakdownItem {
    year: number;
    periodIndex: number;
    monthsCovered: number;
    daysCovered: number;
    monthlyAllowance: number | null;
    amount: number;
}

export interface FamilyAllowanceCalculationResult {
    totalAmount: number;
    breakdown: FamilyAllowanceCalculationBreakdownItem[];
}

export interface HousingAllowanceCalculationResult {
    totalAmount: number;
    breakdown: HousingAllowanceCalculationBreakdownItem[];
}

export interface MinimumBonusAndEntitlementBreakdownItem {
    year: number;
    periodIndex: number;
    monthsCovered: number;
    daysCovered: number;
    dailyMinimumWage: number | null;
    amount: number;
}

export interface MinimumBonusAndEntitlementCalculationResult {
    totalAmount: number;
    breakdown: MinimumBonusAndEntitlementBreakdownItem[];
}

export interface MonthlyAllowanceCalculationBreakdownItem {
    year: number;
    periodIndex: number;
    monthsCovered: number;
    daysCovered: number;
    monthlyAllowance: number | null;
    amount: number;
}

export interface MonthlyAllowanceCalculationResult {
    totalAmount: number;
    breakdown: MonthlyAllowanceCalculationBreakdownItem[];
}

export interface MaximumBonusAndEntitlementBreakdownItem {
    year: number;
    periodIndex: number;
    monthsCovered: number;
    daysCovered: number;
    dailyMinimumWage: number | null;
    amount: number;
}

export interface MaximumBonusAndEntitlementCalculationResult {
    totalAmount: number;
    breakdown: MaximumBonusAndEntitlementBreakdownItem[];
}

export interface BonusEntitlementBreakdownItem {
    year: number;
    periodIndex: number;
    startDate: ParsedDateInput;
    endDate: ParsedDateInput;
    phase: 'before-anniversary' | 'after-anniversary';
    monthsCovered: number;
    dailyMinimumWage: number;
    dailySeniority: number;
    calculatedAmount: number;
    minimumAmount: number;
    maximumAmount: number;
    entitlementAmount: number;
}

export interface BonusEntitlementCalculationResult {
    totalCalculatedAmount: number;
    totalMinimumAmount: number;
    totalMaximumAmount: number;
    totalEntitlementAmount: number;
    breakdown: BonusEntitlementBreakdownItem[];
}

export interface SpousalAllowanceCalculationBreakdownItem {
    year: number;
    periodIndex: number;
    monthsCovered: number;
    daysCovered: number;
    spousalAllowance: number | null;
    amount: number;
}

export interface SpousalAllowanceCalculationResult {
    totalAmount: number;
    breakdown: SpousalAllowanceCalculationBreakdownItem[];
}

export interface OvertimeEntitlementBreakdownItem {
    year: number;
    periodIndex: number;
    phase: 'before-anniversary' | 'after-anniversary';
    startDate: ParsedDateInput;
    endDate: ParsedDateInput;
    daysCovered: number;
    totalOvertimeHours: number;
    dailyMinimumWage: number;
    dailySeniority: number;
    overtimeRate: number;
    amount: number;
}

export interface OvertimeEntitlementCalculationResult {
    totalAmount: number;
    breakdown: OvertimeEntitlementBreakdownItem[];
}

export interface NightShiftEntitlementBreakdownItem {
    year: number;
    periodIndex: number;
    phase: 'before-anniversary' | 'after-anniversary';
    startDate: ParsedDateInput;
    endDate: ParsedDateInput;
    daysCovered: number;
    nightWorkDays: number;
    dailyMinimumWage: number;
    dailySeniority: number;
    nightShiftRate: number;
    amount: number;
}

export interface NightShiftEntitlementCalculationResult {
    totalAmount: number;
    breakdown: NightShiftEntitlementBreakdownItem[];
}

export interface EndOfServiceYearsBreakdownItem {
    year: number;
    periodIndex: number;
    monthsCovered: number;
    daysCovered: number;
    dailyMinimumWage: number | null;
    dailySeniority: number;
    monthEquivalent: number;
    amount: number;
}

export interface EndOfServiceYearsCalculationResult {
    totalAmount: number;
    totalMonthEquivalent: number;
    finalDailyMinimumWage: number;
    finalDailySeniority: number;
    finalDailyWage: number;
    breakdown: EndOfServiceYearsBreakdownItem[];
}

export interface InsuranceDaysEntitlementBreakdownItem {
    year: number;
    periodIndex: number;
    daysCovered: number;
    dailyHours: number;
    calculationType: 'month-full' | 'partial';
    daysCalculated: number;
}

export interface InsuranceDaysEntitlementCalculationResult {
    totalDays: number;
    breakdown: InsuranceDaysEntitlementBreakdownItem[];
}

export type UnusedLeaveWageMaritalStatus = 'single' | 'married';

export interface UnusedLeaveWageCalculationResult {
    unusedLeaveDays: number;
    calendarDaysInLastMonth: number;
    dailyWage: number;
    dailyMinimumWage: number;
    dailySeniority: number;
    dailyHousingAllowance: number;
    dailyChildAllowance: number;
    dailyMonthlyAllowance: number;
    dailyMaritalAllowance: number;
    year: number;
    periodIndex: number;
}

export type MonthlyShiftWorkType =
    | 'morning-evening'
    | 'morning-evening-night'
    | 'morning-night-or-evening-night';

export interface MonthlyShiftWorkBreakdownItem {
    year: number;
    periodIndex: number;
    phase: 'before-anniversary' | 'after-anniversary';
    startDate: ParsedDateInput;
    endDate: ParsedDateInput;
    daysCovered: number;
    shiftType: MonthlyShiftWorkType;
    coefficient: number;
    dailyBase: number | null;
    dailySeniority: number;
    amount: number;
}

export interface MonthlyShiftWorkCalculationResult {
    totalAmount: number;
    breakdown: MonthlyShiftWorkBreakdownItem[];
}

export interface ParsedDateInput {
    year: number;
    month: number;
    day: number;
}

const persianDigits = '۰۱۲۳۴۵۶۷۸۹';
const latinDigits = '0123456789';

function normalizeDigits(value: string) {
    return value.replace(/[۰-۹]/g, (digit) => latinDigits[persianDigits.indexOf(digit)]);
}

export function parseDateInput(value: string): ParsedDateInput | null {
    const normalized = normalizeDigits(value.trim());
    if (!normalized) {
        return null;
    }

    const match = normalized.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/);
    if (!match) {
        return null;
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);

    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
        return null;
    }

    if (month < 1 || month > 12) {
        return null;
    }

    if (!isValidJalaaliDate(year, month, day)) {
        return null;
    }

    return { year, month, day };
}

function compareParsedDates(left: ParsedDateInput, right: ParsedDateInput): number {
    const leftValue = left.year * 10000 + left.month * 100 + left.day;
    const rightValue = right.year * 10000 + right.month * 100 + right.day;

    if (leftValue < rightValue) {
        return -1;
    }

    if (leftValue > rightValue) {
        return 1;
    }

    return 0;
}

export function calculateUnusedLeaveMonths(
    startDate: ParsedDateInput,
    endDate: ParsedDateInput,
): number | null {
    if (compareParsedDates(startDate, endDate) > 0) {
        return null;
    }

    const isCalendarYearStart = startDate.month === 1 && startDate.day === 1;
    const isCalendarYearEnd = endDate.month === 12 && endDate.day === jalaaliMonthLength(endDate.year, 12);

    if (isCalendarYearStart && isCalendarYearEnd) {
        return (endDate.year - startDate.year + 1) * 12;
    }

    let completeYears = endDate.year - startDate.year;
    let anniversaryDate = {
        year: startDate.year + completeYears,
        month: startDate.month,
        day: Math.min(startDate.day, jalaaliMonthLength(startDate.year + completeYears, startDate.month)),
    };

    if (compareParsedDates(anniversaryDate, endDate) > 0) {
        completeYears -= 1;
        anniversaryDate = {
            year: startDate.year + completeYears,
            month: startDate.month,
            day: Math.min(startDate.day, jalaaliMonthLength(startDate.year + completeYears, startDate.month)),
        };
    }

    const partialStartDate = completeYears > 0 ? anniversaryDate : startDate;
    let completeMonths = (endDate.year - partialStartDate.year) * 12
        + endDate.month
        - partialStartDate.month;
    let monthAnniversary = {
        year: partialStartDate.year + Math.floor((partialStartDate.month - 1 + completeMonths) / 12),
        month: ((partialStartDate.month - 1 + completeMonths) % 12) + 1,
        day: partialStartDate.day,
    };
    monthAnniversary.day = Math.min(
        monthAnniversary.day,
        jalaaliMonthLength(monthAnniversary.year, monthAnniversary.month),
    );

    if (compareParsedDates(monthAnniversary, endDate) > 0) {
        completeMonths -= 1;
        monthAnniversary = {
            year: partialStartDate.year + Math.floor((partialStartDate.month - 1 + completeMonths) / 12),
            month: ((partialStartDate.month - 1 + completeMonths) % 12) + 1,
            day: Math.min(
                partialStartDate.day,
                jalaaliMonthLength(
                    partialStartDate.year + Math.floor((partialStartDate.month - 1 + completeMonths) / 12),
                    ((partialStartDate.month - 1 + completeMonths) % 12) + 1,
                ),
            ),
        };
    }

    const endsAtMonthEnd = endDate.day === jalaaliMonthLength(endDate.year, endDate.month);
    if (partialStartDate.day === 1 && endsAtMonthEnd) {
        return completeYears * 12 + Math.max(0, completeMonths + 1);
    }

    const monthAnniversaryGregorian = toGregorian(monthAnniversary.year, monthAnniversary.month, monthAnniversary.day);
    const endGregorian = toGregorian(endDate.year, endDate.month, endDate.day);
    const monthAnniversaryDayNumber = Date.UTC(monthAnniversaryGregorian.gy, monthAnniversaryGregorian.gm - 1, monthAnniversaryGregorian.gd);
    const endDayNumber = Date.UTC(endGregorian.gy, endGregorian.gm - 1, endGregorian.gd);
    const remainingDays = Math.max(0, (endDayNumber - monthAnniversaryDayNumber) / 86400000);
    const averageDaysPerMonth = 365 / 12;

    return completeYears * 12 + Math.max(0, completeMonths) + remainingDays / averageDaysPerMonth;
}

export function calculateUnusedLeaveDays(totalMonthsWorked: number): number {
    if (!Number.isFinite(totalMonthsWorked) || totalMonthsWorked <= 0) {
        return 0;
    }

    if (totalMonthsWorked <= 12) {
        if (totalMonthsWorked === 12) {
            return 26;
        }

        return totalMonthsWorked * 2.17;
    }

    const fullYears = totalMonthsWorked > 12 ? Math.floor(totalMonthsWorked / 12) : 0;
    const remainingMonths = totalMonthsWorked > 12 ? totalMonthsWorked % 12 : totalMonthsWorked;
    return fullYears * 9 + remainingMonths * 2.17;
}

export interface UnusedLeaveEntitlementBreakdownItem {
    segmentIndex: number;
    monthsWorked: number;
    entitlementDays: number;
    usedLeaveDays: number;
    savedLeaveDays: number;
    excessUsedDays: number;
    carryBefore: number;
    carryAfter: number;
    isPartial: boolean;
}

export interface UnusedLeaveEntitlementCalculationResult {
    totalEntitlementDays: number;
    totalUsedLeaveDays: number;
    totalSavedLeaveDays: number;
    breakdown: UnusedLeaveEntitlementBreakdownItem[];
}

export function calculateUnusedLeaveEntitlement(
    startDate: ParsedDateInput,
    endDate: ParsedDateInput,
    usedLeaveDaysBySegment: number[] = [],
    initialSavedLeaveDays = 0,
): UnusedLeaveEntitlementCalculationResult | null {
    const totalMonthsWorked = calculateUnusedLeaveMonths(startDate, endDate);
    if (totalMonthsWorked === null) {
        return null;
    }

    const fullYears = totalMonthsWorked > 12 ? Math.floor(totalMonthsWorked / 12) : 0;
    const remainingMonths = totalMonthsWorked > 12 ? totalMonthsWorked % 12 : totalMonthsWorked;
    const segmentCount = fullYears + (remainingMonths > 0 ? 1 : 0);
    const breakdown: UnusedLeaveEntitlementBreakdownItem[] = [];
    const normalizedInitialSavedLeaveDays = Number.isFinite(initialSavedLeaveDays)
        ? Math.max(0, initialSavedLeaveDays)
        : 0;
    let carryAfter = normalizedInitialSavedLeaveDays;

    for (let index = 0; index < segmentCount; index += 1) {
        const isPartial = index >= fullYears;
        const monthsWorked = isPartial ? remainingMonths : 12;
        const entitlementDays = isPartial
            ? monthsWorked === 12
                ? 26
                : monthsWorked * 2.17
            : 9;
        const usedLeaveDays = Math.max(0, Number(usedLeaveDaysBySegment[index] ?? 0));
        const carryBefore = carryAfter;
        let savedLeaveDays = 0;
        let excessUsedDays = 0;

        if (!isPartial) {
            const fullYearEntitlementCap = 26;
            savedLeaveDays = usedLeaveDays <= 17
                ? 9
                : Math.min(fullYearEntitlementCap, Math.max(0, fullYearEntitlementCap - usedLeaveDays));
            carryAfter += savedLeaveDays;
        } else if (usedLeaveDays <= entitlementDays) {
            savedLeaveDays = Math.max(0, entitlementDays - usedLeaveDays);
            carryAfter += savedLeaveDays;
        } else {
            excessUsedDays = usedLeaveDays - entitlementDays;
            carryAfter = Math.max(0, carryAfter - excessUsedDays);
            savedLeaveDays = 0;
        }

        breakdown.push({
            segmentIndex: index + 1,
            monthsWorked,
            entitlementDays,
            usedLeaveDays,
            savedLeaveDays,
            excessUsedDays,
            carryBefore,
            carryAfter,
            isPartial,
        });
    }

    return {
        totalEntitlementDays: breakdown.reduce((sum, item) => sum + item.entitlementDays, 0),
        totalUsedLeaveDays: breakdown.reduce((sum, item) => sum + item.usedLeaveDays, 0),
        totalSavedLeaveDays: carryAfter,
        breakdown,
    };
}

export function calculateUnusedLeaveWageFromPeriodData(
    startDate: ParsedDateInput,
    endDate: ParsedDateInput,
    periodBuckets: SalaryPeriodBucket[],
    maritalStatus: UnusedLeaveWageMaritalStatus = 'single',
    childrenCount = 1,
    dailySeniority = 0,
    unusedLeaveDaysOverride?: number,
): UnusedLeaveWageCalculationResult | null {
    const totalMonthsWorked = calculateUnusedLeaveMonths(startDate, endDate);
    if (totalMonthsWorked === null) {
        return null;
    }
    const unusedLeaveDays = Number.isFinite(unusedLeaveDaysOverride)
        ? Math.max(0, unusedLeaveDaysOverride as number)
        : calculateUnusedLeaveDays(totalMonthsWorked);

    const bucket = periodBuckets.find((item) => item.year === endDate.year);
    if (!bucket) {
        return null;
    }

    let monthOffset = 0;
    const period = [...bucket.periods]
        .sort((left, right) => left.period_index - right.period_index)
        .find((item) => {
            const periodLength = Number(item.month_count ?? 0);
            const startsAt = monthOffset + 1;
            const endsAt = monthOffset + periodLength;
            monthOffset = endsAt;
            return periodLength > 0 && endDate.month >= startsAt && endDate.month <= endsAt;
        });

    if (!period) {
        return null;
    }

    const dailyMinimumWage = Number(period.daily_minimum_wage ?? 0);
    const calendarDaysInLastMonth = jalaaliMonthLength(endDate.year, endDate.month);
    const monthlyHousingAllowance = maritalStatus === 'married'
        ? Number(period.monthly_housing_married ?? 0)
        : Number(period.monthly_housing_single ?? 0);
    const monthlyAllowance = maritalStatus === 'married'
        ? Number(period.monthly_married_allowance ?? 0)
        : Number(period.monthly_single_allowance ?? 0);
    const childAllowance = Number(period.child_allowance ?? 0) * Math.max(0, Math.trunc(childrenCount));
    const maritalAllowance = maritalStatus === 'married' ? Number(period.marital_allowance ?? 0) : 0;
    const dailyHousingAllowance = monthlyHousingAllowance / calendarDaysInLastMonth;
    const dailyChildAllowance = childAllowance / calendarDaysInLastMonth;
    const dailyMonthlyAllowance = monthlyAllowance / calendarDaysInLastMonth;
    const dailyMaritalAllowance = maritalAllowance / calendarDaysInLastMonth;
    const dailyWage = dailyMinimumWage + dailySeniority + dailyHousingAllowance + dailyChildAllowance + dailyMonthlyAllowance + dailyMaritalAllowance;

    return {
        unusedLeaveDays,
        calendarDaysInLastMonth,
        dailyWage,
        dailyMinimumWage,
        dailySeniority,
        dailyHousingAllowance,
        dailyChildAllowance,
        dailyMonthlyAllowance,
        dailyMaritalAllowance,
        year: bucket.year,
        periodIndex: period.period_index,
    };
}

function getAnniversaryDate(startDate: ParsedDateInput, year: number): ParsedDateInput {
    const monthDays = jalaaliMonthLength(year, startDate.month);
    return {
        year,
        month: startDate.month,
        day: Math.min(startDate.day, monthDays),
    };
}

function getPreviousDate(date: ParsedDateInput): ParsedDateInput {
    const gregorianDate = toGregorian(date.year, date.month, date.day);
    const previousDate = new Date(Date.UTC(gregorianDate.gy, gregorianDate.gm - 1, gregorianDate.gd) - 86400000);
    const previousJalaaliDate = toJalaali(
        previousDate.getUTCFullYear(),
        previousDate.getUTCMonth() + 1,
        previousDate.getUTCDate(),
    );

    return {
        year: previousJalaaliDate.jy,
        month: previousJalaaliDate.jm,
        day: previousJalaaliDate.jd,
    };
}

function getPeriodSegments(bucket: SalaryPeriodBucket) {
    let monthOffset = 0;

    return [...bucket.periods]
        .sort((left, right) => left.period_index - right.period_index)
        .map((period) => {
            const periodLength = Number(period.month_count ?? 0);
            const startMonth = monthOffset + 1;
            const endMonth = monthOffset + periodLength;
            monthOffset = endMonth;

            return {
                period,
                start: { year: bucket.year, month: startMonth, day: 1 },
                end: { year: bucket.year, month: endMonth, day: jalaaliMonthLength(bucket.year, endMonth) },
            };
        })
        .filter((segment) => segment.start.month <= 12 && segment.end.month >= segment.start.month);
}

function getLaterDate(left: ParsedDateInput, right: ParsedDateInput): ParsedDateInput {
    return compareParsedDates(left, right) >= 0 ? left : right;
}

function getEarlierDate(left: ParsedDateInput, right: ParsedDateInput): ParsedDateInput {
    return compareParsedDates(left, right) <= 0 ? left : right;
}

function toDayNumber(date: ParsedDateInput): number {
    const gregorianDate = toGregorian(date.year, date.month, date.day);
    return Date.UTC(gregorianDate.gy, gregorianDate.gm - 1, gregorianDate.gd) / 86400000;
}

function getDaysInPersianMonth(year: number, month: number): number {
    return jalaaliMonthLength(year, month);
}

function getOverlapDaysForMonth(
    selectedStartDate: ParsedDateInput,
    selectedEndDate: ParsedDateInput,
    year: number,
    month: number,
): number {
    const monthStart = { year, month, day: 1 };
    const monthEnd = { year, month, day: getDaysInPersianMonth(year, month) };

    const selectedStartDay = toDayNumber(selectedStartDate);
    const selectedEndDay = toDayNumber(selectedEndDate);
    const monthStartDay = toDayNumber(monthStart);
    const monthEndDay = toDayNumber(monthEnd);

    const overlapStart = Math.max(selectedStartDay, monthStartDay);
    const overlapEnd = Math.min(selectedEndDay, monthEndDay);

    if (overlapEnd < overlapStart) {
        return 0;
    }

    return overlapEnd - overlapStart + 1;
}

function getFridaysInMonthOverlap(
    selectedStartDate: ParsedDateInput,
    selectedEndDate: ParsedDateInput,
    year: number,
    month: number,
): number {
    const monthStartDay = toDayNumber({ year, month, day: 1 });
    const monthEndDay = toDayNumber({ year, month, day: getDaysInPersianMonth(year, month) });
    const selectedStartDay = toDayNumber(selectedStartDate);
    const selectedEndDay = toDayNumber(selectedEndDate);
    const overlapStart = Math.max(selectedStartDay, monthStartDay);
    const overlapEnd = Math.min(selectedEndDay, monthEndDay);

    if (overlapEnd < overlapStart) {
        return 0;
    }

    let fridays = 0;
    for (let dayNumber = overlapStart; dayNumber <= overlapEnd; dayNumber += 1) {
        if (new Date(dayNumber * 86400000).getUTCDay() === 5) {
            fridays += 1;
        }
    }

    return fridays;
}

export function calculateAvailableFridaysByYear(
    startDate: ParsedDateInput,
    endDate: ParsedDateInput,
): Record<number, number> {
    if (compareParsedDates(startDate, endDate) > 0) {
        return {};
    }

    const availableFridaysByYear: Record<number, number> = {};

    for (let year = startDate.year; year <= endDate.year; year += 1) {
        let fridaysInYear = 0;
        const firstMonth = year === startDate.year ? startDate.month : 1;
        const lastMonth = year === endDate.year ? endDate.month : 12;

        for (let month = firstMonth; month <= lastMonth; month += 1) {
            fridaysInYear += getFridaysInMonthOverlap(startDate, endDate, year, month);
        }

        availableFridaysByYear[year] = fridaysInYear;
    }

    return availableFridaysByYear;
}

export interface AvailableFridaysByPeriod {
    year: number;
    periodIndex: number;
    availableFridays: number;
}

export function calculateAvailableFridaysByPeriod(
    startDate: ParsedDateInput,
    endDate: ParsedDateInput,
    periodBuckets: SalaryPeriodBucket[],
): AvailableFridaysByPeriod[] {
    if (compareParsedDates(startDate, endDate) > 0) {
        return [];
    }

    const availableFridaysByPeriod: AvailableFridaysByPeriod[] = [];

    for (const bucket of [...periodBuckets].sort((left, right) => left.year - right.year)) {
        for (const periodSegment of getPeriodSegments(bucket)) {
            const overlapStart = getLaterDate(startDate, periodSegment.start);
            const overlapEnd = getEarlierDate(endDate, periodSegment.end);

            if (compareParsedDates(overlapStart, overlapEnd) > 0) {
                continue;
            }

            let availableFridays = 0;
            for (let monthIndex = periodSegment.start.month; monthIndex <= periodSegment.end.month; monthIndex += 1) {
                const calendarYear = bucket.year + Math.floor((monthIndex - 1) / 12);
                const calendarMonth = ((monthIndex - 1) % 12) + 1;
                availableFridays += getFridaysInMonthOverlap(overlapStart, overlapEnd, calendarYear, calendarMonth);
            }

            availableFridaysByPeriod.push({
                year: bucket.year,
                periodIndex: periodSegment.period.period_index,
                availableFridays,
            });
        }
    }

    return availableFridaysByPeriod;
}

export function calculateSalaryFromPeriodData(
    startDate: ParsedDateInput,
    endDate: ParsedDateInput,
    periodBuckets: SalaryPeriodBucket[],
    dailyWorkMinutes = 440,
): SalaryCalculationResult {
    if (compareParsedDates(startDate, endDate) > 0) {
        return { totalAmount: 0, breakdown: [] };
    }

    const breakdown: SalaryCalculationBreakdownItem[] = [];
    const normalizedDailyWorkMinutes = Math.min(440, Math.max(0, Number(dailyWorkMinutes) || 0));
    const dailyWorkRatio = normalizedDailyWorkMinutes / 440;

    for (const bucket of [...periodBuckets].sort((a, b) => a.year - b.year)) {
        const sortedPeriods = [...bucket.periods].sort((a, b) => a.period_index - b.period_index);
        let monthOffset = 0;

        for (const period of sortedPeriods) {
            const periodLength = Number(period.month_count ?? 0);
            if (!Number.isFinite(periodLength) || periodLength <= 0) {
                continue;
            }

            const periodStartMonth = monthOffset + 1;
            const periodEndMonth = monthOffset + periodLength;
            let daysCovered = 0;

            for (let monthIndex = periodStartMonth; monthIndex <= periodEndMonth; monthIndex += 1) {
                const calendarYear = bucket.year + Math.floor((monthIndex - 1) / 12);
                const calendarMonth = ((monthIndex - 1) % 12) + 1;
                daysCovered += getOverlapDaysForMonth(startDate, endDate, calendarYear, calendarMonth);
            }

            if (daysCovered > 0 && (period.daily_minimum_wage ?? 0) > 0) {
                breakdown.push({
                    year: bucket.year,
                    periodIndex: period.period_index,
                    daysCovered,
                    dailyMinimumWage: period.daily_minimum_wage,
                    dailyWorkMinutes: normalizedDailyWorkMinutes,
                    amount: (period.daily_minimum_wage ?? 0) * daysCovered * dailyWorkRatio,
                });
            }
        }
    }

    return {
        totalAmount: breakdown.reduce((sum, item) => sum + item.amount, 0),
        breakdown,
    };
}

export function calculateSuspensionWageFromPeriodData(
    suspensionStartDate: ParsedDateInput,
    suspensionEndDate: ParsedDateInput,
    employmentStartDate: ParsedDateInput,
    periodBuckets: SalaryPeriodBucket[],
    workshopType: EntitledSeniorityWorkshopType = 'unclassified',
    jobGroupNumber?: number,
    settledThrough1391 = false,
    maritalStatus: UnusedLeaveWageMaritalStatus = 'single',
    childrenCount = 0,
): SuspensionWageCalculationResult {
    if (compareParsedDates(suspensionStartDate, suspensionEndDate) > 0) {
        return { totalAmount: 0, breakdown: [] };
    }

    const seniorityResult = calculateEntitledSeniorityFromPeriodData(
        employmentStartDate,
        suspensionEndDate,
        periodBuckets,
        workshopType,
        jobGroupNumber,
        settledThrough1391,
    );
    const periodMap = new Map<string, SalaryPeriodBucket['periods'][number]>();

    for (const bucket of periodBuckets) {
        for (const period of bucket.periods) {
            periodMap.set(`${bucket.year}:${period.period_index}`, period);
        }
    }

    const breakdown: SuspensionWageCalculationBreakdownItem[] = [];
    const normalizedChildrenCount = Math.max(0, Math.trunc(Number(childrenCount) || 0));

    const addOrMergeBreakdownItem = (item: SuspensionWageCalculationBreakdownItem) => {
        const previous = breakdown.at(-1);
        const isAdjacent = previous
            && previous.year === item.year
            && previous.periodIndex === item.periodIndex
            && previous.dailySeniority === item.dailySeniority
            && Math.round(toDayNumber(item.startDate) - toDayNumber(previous.endDate)) === 1;

        if (!isAdjacent || !previous) {
            breakdown.push(item);
            return;
        }

        const previousDays = previous.daysCovered;
        const totalDays = previousDays + item.daysCovered;
        const weightedAverage = (left: number, right: number) => (
            (left * previousDays + right * item.daysCovered) / totalDays
        );

        previous.endDate = item.endDate;
        previous.daysCovered = totalDays;
        previous.dailyMinimumWage = weightedAverage(previous.dailyMinimumWage, item.dailyMinimumWage);
        previous.dailyHousingAllowance = weightedAverage(previous.dailyHousingAllowance, item.dailyHousingAllowance);
        previous.dailyChildAllowance = weightedAverage(previous.dailyChildAllowance, item.dailyChildAllowance);
        previous.dailyMonthlyAllowance = weightedAverage(previous.dailyMonthlyAllowance, item.dailyMonthlyAllowance);
        previous.dailyMaritalAllowance = weightedAverage(previous.dailyMaritalAllowance, item.dailyMaritalAllowance);
        previous.dailyWage = weightedAverage(previous.dailyWage, item.dailyWage);
        previous.amount += item.amount;
    };

    for (const senioritySegment of seniorityResult.breakdown) {
        const overlapStart = getLaterDate(suspensionStartDate, senioritySegment.startDate);
        const overlapEnd = getEarlierDate(suspensionEndDate, senioritySegment.endDate);
        if (compareParsedDates(overlapStart, overlapEnd) > 0) {
            continue;
        }

        const period = periodMap.get(`${senioritySegment.year}:${senioritySegment.periodIndex}`);
        if (!period) {
            continue;
        }

        let cursor = { year: overlapStart.year, month: overlapStart.month };
        while (cursor.year < overlapEnd.year || (cursor.year === overlapEnd.year && cursor.month <= overlapEnd.month)) {
            const monthDays = jalaaliMonthLength(cursor.year, cursor.month);
            const monthStart = { year: cursor.year, month: cursor.month, day: 1 };
            const monthEnd = { year: cursor.year, month: cursor.month, day: monthDays };
            const monthOverlapStart = getLaterDate(overlapStart, monthStart);
            const monthOverlapEnd = getEarlierDate(overlapEnd, monthEnd);

            if (compareParsedDates(monthOverlapStart, monthOverlapEnd) <= 0) {
                const coveredDays = Math.round(toDayNumber(monthOverlapEnd) - toDayNumber(monthOverlapStart) + 1);
                const monthlyHousingAllowance = maritalStatus === 'married'
                    ? Number(period.monthly_housing_married ?? 0)
                    : Number(period.monthly_housing_single ?? 0);
                const monthlyAllowance = maritalStatus === 'married'
                    ? Number(period.monthly_married_allowance ?? 0)
                    : Number(period.monthly_single_allowance ?? 0);
                const monthlyChildAllowance = Number(period.child_allowance ?? 0) * normalizedChildrenCount;
                const monthlyMaritalAllowance = maritalStatus === 'married'
                    ? Number(period.marital_allowance ?? 0)
                    : 0;
                const dailyMinimumWage = Number(period.daily_minimum_wage ?? 0);
                const dailySeniority = Math.max(0, Number(senioritySegment.entitlement) || 0);
                const dailyHousingAllowance = monthlyHousingAllowance / monthDays;
                const dailyChildAllowance = monthlyChildAllowance / monthDays;
                const dailyMonthlyAllowance = monthlyAllowance / monthDays;
                const dailyMaritalAllowance = monthlyMaritalAllowance / monthDays;
                const dailyWage = dailyMinimumWage + dailySeniority + dailyHousingAllowance
                    + dailyChildAllowance + dailyMonthlyAllowance + dailyMaritalAllowance;

                addOrMergeBreakdownItem({
                    year: senioritySegment.year,
                    periodIndex: senioritySegment.periodIndex,
                    phase: senioritySegment.phase,
                    startDate: monthOverlapStart,
                    endDate: monthOverlapEnd,
                    daysCovered: coveredDays,
                    dailyMinimumWage,
                    dailySeniority,
                    dailyHousingAllowance,
                    dailyChildAllowance,
                    dailyMonthlyAllowance,
                    dailyMaritalAllowance,
                    dailyWage,
                    amount: Math.round(dailyWage * coveredDays),
                });
            }

            cursor.month += 1;
            if (cursor.month > 12) {
                cursor.month = 1;
                cursor.year += 1;
            }
        }

    }

    return {
        totalAmount: breakdown.reduce((sum, item) => sum + item.amount, 0),
        breakdown,
    };
}

export function calculateOrdinaryWorkHoursFromPeriodData(
    startDate: ParsedDateInput,
    endDate: ParsedDateInput,
    periodBuckets: SalaryPeriodBucket[],
    officialHolidayDates: string[],
    dailyHoursCoefficient = 7.33,
): OrdinaryWorkHoursCalculationResult {
    if (compareParsedDates(startDate, endDate) > 0) {
        return { totalHours: 0, breakdown: [] };
    }

    const holidaySet = new Set(officialHolidayDates);
    const breakdown: OrdinaryWorkHoursBreakdownItem[] = [];

    for (const bucket of [...periodBuckets].sort((left, right) => left.year - right.year)) {
        let monthOffset = 0;

        for (const period of [...bucket.periods].sort((left, right) => left.period_index - right.period_index)) {
            const periodLength = Number(period.month_count ?? 0);
            if (!Number.isFinite(periodLength) || periodLength <= 0) {
                continue;
            }

            const periodStartMonth = monthOffset + 1;
            const periodEndMonth = monthOffset + periodLength;
            const periodStart = { year: bucket.year, month: periodStartMonth, day: 1 };
            const periodEnd = { year: bucket.year, month: periodEndMonth, day: jalaaliMonthLength(bucket.year, periodEndMonth) };
            const overlapStart = getLaterDate(startDate, periodStart);
            const overlapEnd = getEarlierDate(endDate, periodEnd);

            if (compareParsedDates(overlapStart, overlapEnd) > 0) {
                monthOffset = periodEndMonth;
                continue;
            }

            let daysCovered = 0;
            let officialHolidays = 0;
            let fridays = 0;

            for (let monthIndex = periodStartMonth; monthIndex <= periodEndMonth; monthIndex += 1) {
                const calendarYear = bucket.year + Math.floor((monthIndex - 1) / 12);
                const calendarMonth = ((monthIndex - 1) % 12) + 1;
                const monthDays = jalaaliMonthLength(calendarYear, calendarMonth);
                const monthStart = { year: calendarYear, month: calendarMonth, day: 1 };
                const monthEnd = { year: calendarYear, month: calendarMonth, day: monthDays };
                const monthOverlapStart = getLaterDate(overlapStart, monthStart);
                const monthOverlapEnd = getEarlierDate(overlapEnd, monthEnd);

                if (compareParsedDates(monthOverlapStart, monthOverlapEnd) > 0) {
                    continue;
                }

                const overlapDays = Math.round(toDayNumber(monthOverlapEnd) - toDayNumber(monthOverlapStart) + 1);
                daysCovered += overlapDays;
                fridays += getFridaysInMonthOverlap(overlapStart, overlapEnd, calendarYear, calendarMonth);

                for (let day = 1; day <= monthDays; day += 1) {
                    const date = { year: calendarYear, month: calendarMonth, day };
                    if (compareParsedDates(date, monthOverlapStart) >= 0 && compareParsedDates(date, monthOverlapEnd) <= 0) {
                        const dateKey = `${calendarYear}/${String(calendarMonth).padStart(2, '0')}/${String(day).padStart(2, '0')}`;
                        if (holidaySet.has(dateKey)) {
                            officialHolidays += 1;
                        }
                    }
                }
            }

            const workingDays = Math.max(0, daysCovered - officialHolidays - fridays);
            breakdown.push({
                year: bucket.year,
                periodIndex: period.period_index,
                daysCovered,
                officialHolidays,
                fridays,
                workingDays,
                requiredHours: Number((workingDays * dailyHoursCoefficient).toFixed(2)),
            });

        }
    }

    return {
        totalHours: Number(breakdown.reduce((sum, item) => sum + item.requiredHours, 0).toFixed(2)),
        breakdown,
    };
}

export function calculateYoungWorkerWorkHoursFromPeriodData(
    startDate: ParsedDateInput,
    endDate: ParsedDateInput,
    periodBuckets: SalaryPeriodBucket[],
    officialHolidayDates: string[],
): YoungWorkerWorkHoursCalculationResult {
    const ordinaryResult = calculateOrdinaryWorkHoursFromPeriodData(
        startDate,
        endDate,
        periodBuckets,
        officialHolidayDates,
    );

    const breakdown = ordinaryResult.breakdown.map((item) => ({
        ...item,
        requiredHours: Number((item.workingDays * 7.33 - item.daysCovered * 0.5).toFixed(2)),
    }));

    return {
        totalHours: Number(breakdown.reduce((sum, item) => sum + item.requiredHours, 0).toFixed(2)),
        breakdown,
    };
}

export function calculateOfficialHolidayWorkFromPeriodData(
    startDate: ParsedDateInput,
    endDate: ParsedDateInput,
    employmentStartDate: ParsedDateInput,
    periodBuckets: SalaryPeriodBucket[],
    officialHolidayDates: string[],
    workshopType: EntitledSeniorityWorkshopType = 'unclassified',
    jobGroupNumber?: number,
    settledThrough1391 = false,
): OfficialHolidayWorkCalculationResult {
    if (compareParsedDates(startDate, endDate) > 0) {
        return { totalAmount: 0, breakdown: [] };
    }

    const breakdown: OfficialHolidayWorkBreakdownItem[] = [];
    const holidaySet = new Set(officialHolidayDates);
    const seniorityResult = calculateEntitledSeniorityFromPeriodData(
        employmentStartDate,
        endDate,
        periodBuckets,
        workshopType,
        jobGroupNumber,
        settledThrough1391,
    );

    for (const bucket of [...periodBuckets].sort((left, right) => left.year - right.year)) {
        const sortedPeriods = [...bucket.periods].sort((left, right) => left.period_index - right.period_index);
        let monthOffset = 0;

        for (const period of sortedPeriods) {
            const periodLength = Number(period.month_count ?? 0);
            if (!Number.isFinite(periodLength) || periodLength <= 0) {
                continue;
            }

            const periodStartMonth = monthOffset + 1;
            const periodEndMonth = monthOffset + periodLength;
            const dailyMinimumWage = Number(period.daily_minimum_wage ?? 0);
            const senioritySegments = seniorityResult.breakdown.filter((segment) => (
                segment.year === bucket.year && segment.periodIndex === period.period_index
            ));

            for (const segment of senioritySegments) {
                const periodStart = { year: bucket.year, month: periodStartMonth, day: 1 };
                const periodEnd = { year: bucket.year, month: periodEndMonth, day: jalaaliMonthLength(bucket.year, periodEndMonth) };
                const overlapStart = getLaterDate(startDate, getLaterDate(segment.startDate, periodStart));
                const overlapEnd = getEarlierDate(endDate, getEarlierDate(segment.endDate, periodEnd));

                if (compareParsedDates(overlapStart, overlapEnd) > 0) {
                    continue;
                }

                let daysCovered = 0;
                let cursor = { year: overlapStart.year, month: overlapStart.month };
                while (cursor.year < overlapEnd.year || (cursor.year === overlapEnd.year && cursor.month <= overlapEnd.month)) {
                    const monthDays = jalaaliMonthLength(cursor.year, cursor.month);
                    const monthStart = { year: cursor.year, month: cursor.month, day: 1 };
                    const monthEnd = { year: cursor.year, month: cursor.month, day: monthDays };
                    const monthOverlapStart = getLaterDate(overlapStart, monthStart);
                    const monthOverlapEnd = getEarlierDate(overlapEnd, monthEnd);

                    for (let day = monthOverlapStart.day; day <= monthOverlapEnd.day; day += 1) {
                        const dateKey = `${cursor.year}/${String(cursor.month).padStart(2, '0')}/${String(day).padStart(2, '0')}`;
                        if (holidaySet.has(dateKey)) {
                            daysCovered += 1;
                        }
                    }

                    cursor.month += 1;
                    if (cursor.month > 12) {
                        cursor.month = 1;
                        cursor.year += 1;
                    }
                }

                const seniorityBase = Math.max(0, Number(segment.entitlement) || 0);
                const holidayWorkRate = Math.round(1.4 * (dailyMinimumWage + seniorityBase));

                if (daysCovered > 0 && holidayWorkRate > 0) {
                    breakdown.push({
                        year: bucket.year,
                        periodIndex: period.period_index,
                        phase: segment.phase,
                        startDate: overlapStart,
                        endDate: overlapEnd,
                        daysCovered,
                        dailyMinimumWage,
                        seniorityBase,
                        holidayWorkRate,
                        amount: Math.round(daysCovered * 7.33 * 1.4 * ((dailyMinimumWage + seniorityBase) / 7.33)),
                    });
                }
            }

            monthOffset = periodEndMonth;
        }
    }

    return {
        totalAmount: breakdown.reduce((sum, item) => sum + item.amount, 0),
        breakdown,
    };
}

export function calculateArticle87WorkPermitFee(squareMeters: number): number {
    if (!Number.isFinite(squareMeters) || squareMeters < 0) {
        return 0;
    }

    return Math.round(squareMeters * 55000);
}

export interface SocialSecurityPremiumCeilingBreakdownItem {
    year: number;
    periodIndex: number;
    daysCovered: number;
    dailyMinimumWage: number;
    amount: number;
}

export interface SocialSecurityPremiumCeilingCalculationResult {
    totalAmount: number;
    breakdown: SocialSecurityPremiumCeilingBreakdownItem[];
}

export function calculateSocialSecurityPremiumCeiling(dailyMinimumWage: number, monthDays: number): number {
    if (!Number.isFinite(dailyMinimumWage) || dailyMinimumWage <= 0 || !Number.isFinite(monthDays) || monthDays <= 0) {
        return 0;
    }

    return Math.round(7 * dailyMinimumWage * monthDays);
}

export function calculateSocialSecurityPremiumCeilingFromPeriodData(
    startDate: ParsedDateInput,
    endDate: ParsedDateInput,
    periodBuckets: SalaryPeriodBucket[],
): SocialSecurityPremiumCeilingCalculationResult {
    if (compareParsedDates(startDate, endDate) > 0) {
        return { totalAmount: 0, breakdown: [] };
    }

    const breakdown: SocialSecurityPremiumCeilingBreakdownItem[] = [];

    for (const bucket of [...periodBuckets].sort((left, right) => left.year - right.year)) {
        const sortedPeriods = [...bucket.periods].sort((left, right) => left.period_index - right.period_index);
        let monthOffset = 0;

        for (const period of sortedPeriods) {
            const periodLength = Number(period.month_count ?? 0);
            if (!Number.isFinite(periodLength) || periodLength <= 0) {
                continue;
            }

            const periodStartMonth = monthOffset + 1;
            const periodEndMonth = monthOffset + periodLength;
            let daysCovered = 0;
            const dailyMinimumWage = Number(period.daily_minimum_wage ?? 0);

            for (let monthIndex = periodStartMonth; monthIndex <= periodEndMonth; monthIndex += 1) {
                const calendarYear = bucket.year + Math.floor((monthIndex - 1) / 12);
                const calendarMonth = ((monthIndex - 1) % 12) + 1;
                const monthOverlapDays = getOverlapDaysForMonth(startDate, endDate, calendarYear, calendarMonth);

                if (monthOverlapDays > 0) {
                    daysCovered += monthOverlapDays;
                }
            }

            if (daysCovered > 0 && dailyMinimumWage > 0) {
                breakdown.push({
                    year: bucket.year,
                    periodIndex: period.period_index,
                    daysCovered,
                    dailyMinimumWage,
                    amount: Math.round(daysCovered * 7 * dailyMinimumWage),
                });
            }

            monthOffset = periodEndMonth;
        }
    }

    return {
        totalAmount: breakdown.reduce((sum, item) => sum + item.amount, 0),
        breakdown,
    };
}

export function calculateIllegalForeignWorkerPenaltyFromPeriodData(
    startDate: ParsedDateInput,
    endDate: ParsedDateInput,
    periodBuckets: SalaryPeriodBucket[],
    workerCount: number,
): IllegalForeignWorkerPenaltyCalculationResult {
    if (compareParsedDates(startDate, endDate) > 0 || !Number.isFinite(workerCount) || workerCount <= 0) {
        return { totalAmount: 0, breakdown: [] };
    }

    const breakdown: IllegalForeignWorkerPenaltyBreakdownItem[] = [];

    for (const bucket of [...periodBuckets].sort((left, right) => left.year - right.year)) {
        const sortedPeriods = [...bucket.periods].sort((left, right) => left.period_index - right.period_index);
        let monthOffset = 0;

        for (const period of sortedPeriods) {
            const periodLength = Number(period.month_count ?? 0);
            if (!Number.isFinite(periodLength) || periodLength <= 0) {
                continue;
            }

            const periodStartMonth = monthOffset + 1;
            const periodEndMonth = monthOffset + periodLength;
            let daysCovered = 0;
            const dailyMinimumWage = Number(period.daily_minimum_wage ?? 0);

            for (let monthIndex = periodStartMonth; monthIndex <= periodEndMonth; monthIndex += 1) {
                const calendarYear = bucket.year + Math.floor((monthIndex - 1) / 12);
                const calendarMonth = ((monthIndex - 1) % 12) + 1;
                const monthStart = { year: calendarYear, month: calendarMonth, day: 1 };
                const monthEnd = { year: calendarYear, month: calendarMonth, day: jalaaliMonthLength(calendarYear, calendarMonth) };
                const overlapStart = getLaterDate(startDate, monthStart);
                const overlapEnd = getEarlierDate(endDate, monthEnd);

                if (compareParsedDates(overlapStart, overlapEnd) <= 0) {
                    daysCovered += Math.round(toDayNumber(overlapEnd) - toDayNumber(overlapStart) + 1);
                }
            }

            if (daysCovered > 0 && dailyMinimumWage > 0) {
                breakdown.push({
                    year: bucket.year,
                    periodIndex: period.period_index,
                    daysCovered,
                    workerCount,
                    dailyMinimumWage,
                    amount: Math.round(daysCovered * dailyMinimumWage * 5 * workerCount),
                });
            }

            monthOffset = periodEndMonth;
        }
    }

    return {
        totalAmount: breakdown.reduce((sum, item) => sum + item.amount, 0),
        breakdown,
    };
}

export function calculateFridayWorkFromPeriodData(
    startDate: ParsedDateInput,
    endDate: ParsedDateInput,
    employmentStartDate: ParsedDateInput,
    periodBuckets: SalaryPeriodBucket[],
    fridayWorkDaysByPeriod: Record<string, number>,
    workshopType: EntitledSeniorityWorkshopType = 'unclassified',
    jobGroupNumber?: number,
    settledThrough1391 = false,
): FridayWorkCalculationResult {
    if (compareParsedDates(startDate, endDate) > 0) {
        return { totalAmount: 0, breakdown: [] };
    }

    const breakdown: FridayWorkCalculationBreakdownItem[] = [];
    const seniorityResult = calculateEntitledSeniorityFromPeriodData(
        employmentStartDate,
        endDate,
        periodBuckets,
        workshopType,
        jobGroupNumber,
        settledThrough1391,
    );

    for (const bucket of [...periodBuckets].sort((a, b) => a.year - b.year)) {
        const sortedPeriods = [...bucket.periods].sort((a, b) => a.period_index - b.period_index);
        let monthOffset = 0;

        for (const period of sortedPeriods) {
            const periodLength = Number(period.month_count ?? 0);
            if (!Number.isFinite(periodLength) || periodLength <= 0) {
                continue;
            }

            const periodStartMonth = monthOffset + 1;
            const periodEndMonth = monthOffset + periodLength;

            const senioritySegments = seniorityResult.breakdown.filter((segment) => (
                segment.year === bucket.year && segment.periodIndex === period.period_index
            ));
            const periodDetails: {
                period: SalaryPeriodBucket['periods'][number];
                phase: 'before-anniversary' | 'after-anniversary';
                daysCovered: number;
                fridaysInPeriod: number;
                fridayWorkDays: number;
                dailySeniority: number;
                segmentStart: ParsedDateInput;
                segmentEnd: ParsedDateInput;
            }[] = [];

            for (const segment of senioritySegments) {
                const segmentStart = getLaterDate(startDate, segment.startDate);
                const segmentEnd = getEarlierDate(endDate, segment.endDate);
                const segmentDays = compareParsedDates(segmentStart, segmentEnd) <= 0
                    ? Math.round(toDayNumber(segmentEnd) - toDayNumber(segmentStart) + 1)
                    : 0;

                if (segmentDays > 0) {
                    let segmentFridaysInPeriod = 0;
                    for (let monthIndex = periodStartMonth; monthIndex <= periodEndMonth; monthIndex += 1) {
                        const calendarYear = bucket.year + Math.floor((monthIndex - 1) / 12);
                        const calendarMonth = ((monthIndex - 1) % 12) + 1;
                        segmentFridaysInPeriod += getFridaysInMonthOverlap(segmentStart, segmentEnd, calendarYear, calendarMonth);
                    }
                    periodDetails.push({
                        period,
                        phase: segment.phase,
                        daysCovered: segmentDays,
                        fridaysInPeriod: segmentFridaysInPeriod,
                        fridayWorkDays: 0,
                        dailySeniority: Math.max(0, Number(segment.entitlement) || 0),
                        segmentStart,
                        segmentEnd,
                    });
                }
            }

            const totalAvailableFridays = periodDetails.reduce((sum, item) => sum + item.fridaysInPeriod, 0);
            const periodKey = `${bucket.year}:${period.period_index}`;
            const requestedFridayWorkDays = Number(fridayWorkDaysByPeriod[periodKey] ?? 0);

            if (
                totalAvailableFridays > 0
                && Number.isInteger(requestedFridayWorkDays)
                && requestedFridayWorkDays > 0
            ) {
                const cappedFridayWorkDays = Math.min(requestedFridayWorkDays, totalAvailableFridays);
                const allocations = periodDetails.map((item) => ({
                    item,
                    exact: cappedFridayWorkDays * item.fridaysInPeriod / totalAvailableFridays,
                }));
                let allocatedDays = 0;

                for (const allocation of allocations) {
                    allocation.item.fridayWorkDays = Math.floor(allocation.exact);
                    allocatedDays += allocation.item.fridayWorkDays;
                }

                const remainingDays = cappedFridayWorkDays - allocatedDays;
                allocations
                    .sort((left, right) => {
                        const fractionalDifference = (right.exact - Math.floor(right.exact)) - (left.exact - Math.floor(left.exact));
                        return fractionalDifference
                            || compareParsedDates(left.item.segmentStart, right.item.segmentStart);
                    })
                    .slice(0, remainingDays)
                    .forEach((allocation) => {
                        allocation.item.fridayWorkDays += 1;
                    });

                for (const item of periodDetails) {
                    const dailyMinimumWage = Number(item.period.daily_minimum_wage ?? 0);
                    const fridayWorkRate = 0.4 * (dailyMinimumWage + item.dailySeniority);
                    if (item.fridayWorkDays > 0 && fridayWorkRate > 0) {
                        breakdown.push({
                            year: bucket.year,
                            periodIndex: item.period.period_index,
                            phase: item.phase,
                            startDate: item.segmentStart,
                            endDate: item.segmentEnd,
                            daysCovered: item.daysCovered,
                            fridaysInPeriod: item.fridaysInPeriod,
                            fridayWorkDays: item.fridayWorkDays,
                            fridayWorkRate,
                            dailyMinimumWage,
                            dailySeniority: item.dailySeniority,
                            amount: Math.round(item.fridayWorkDays * 0.4 * (dailyMinimumWage + item.dailySeniority)),
                        });
                    }
                }
            }

            monthOffset = periodEndMonth;
        }
    }

    return {
        totalAmount: breakdown.reduce((sum, item) => sum + item.amount, 0),
        breakdown,
    };
}

export function calculateFamilyAllowanceFromPeriodData(
    startDate: ParsedDateInput,
    endDate: ParsedDateInput,
    periodBuckets: SalaryPeriodBucket[],
    numberOfChildren: number,
    includeDaysCovered = true,
): FamilyAllowanceCalculationResult {
    if (compareParsedDates(startDate, endDate) > 0) {
        return { totalAmount: 0, breakdown: [] };
    }

    const breakdown: FamilyAllowanceCalculationBreakdownItem[] = [];

    for (const bucket of [...periodBuckets].sort((a, b) => a.year - b.year)) {
        const sortedPeriods = [...bucket.periods].sort((a, b) => a.period_index - b.period_index);
        let monthOffset = 0;

        for (const period of sortedPeriods) {
            const periodLength = Number(period.month_count ?? 0);
            if (!Number.isFinite(periodLength) || periodLength <= 0) {
                continue;
            }

            const periodStartMonth = monthOffset + 1;
            const periodEndMonth = monthOffset + periodLength;
            let monthsCovered = 0;
            let daysCovered = 0;
            let periodAmount = 0;
            const monthlyAllowance = Number(period.child_allowance ?? 0) * numberOfChildren;

            for (let monthIndex = periodStartMonth; monthIndex <= periodEndMonth; monthIndex += 1) {
                const calendarYear = bucket.year + Math.floor((monthIndex - 1) / 12);
                const calendarMonth = ((monthIndex - 1) % 12) + 1;
                const monthDays = getDaysInPersianMonth(calendarYear, calendarMonth);
                const overlapDays = getOverlapDaysForMonth(startDate, endDate, calendarYear, calendarMonth);

                if (overlapDays > 0) {
                    if (overlapDays === monthDays) {
                        monthsCovered += 1;
                    } else if (includeDaysCovered) {
                        monthsCovered += overlapDays / monthDays;
                        daysCovered += overlapDays;
                        periodAmount += (monthlyAllowance * overlapDays) / monthDays;
                    }

                    if (overlapDays === monthDays) {
                        periodAmount += monthlyAllowance;
                    }
                }
            }

            if ((monthsCovered > 0 || daysCovered > 0) && monthlyAllowance > 0) {
                breakdown.push({
                    year: bucket.year,
                    periodIndex: period.period_index,
                    monthsCovered,
                    daysCovered,
                    childAllowance: period.child_allowance ?? null,
                    amount: Math.round(periodAmount),
                });
            }

            monthOffset = periodEndMonth;
        }
    }

    return {
        totalAmount: breakdown.reduce((sum, item) => sum + item.amount, 0),
        breakdown,
    };
}

export function calculateHousingAllowanceFromPeriodData(
    startDate: ParsedDateInput,
    endDate: ParsedDateInput,
    periodBuckets: SalaryPeriodBucket[],
    maritalStatus: 'single' | 'married' = 'single',
    includeDaysCovered = true,
): HousingAllowanceCalculationResult {
    if (compareParsedDates(startDate, endDate) > 0) {
        return { totalAmount: 0, breakdown: [] };
    }

    const breakdown: HousingAllowanceCalculationBreakdownItem[] = [];

    for (const bucket of [...periodBuckets].sort((a, b) => a.year - b.year)) {
        const sortedPeriods = [...bucket.periods].sort((a, b) => a.period_index - b.period_index);
        let monthOffset = 0;

        for (const period of sortedPeriods) {
            const periodLength = Number(period.month_count ?? 0);
            if (!Number.isFinite(periodLength) || periodLength <= 0) {
                continue;
            }

            const periodStartMonth = monthOffset + 1;
            const periodEndMonth = monthOffset + periodLength;
            let monthsCovered = 0;
            let daysCovered = 0;
            let periodAmount = 0;
            const housingAllowance =
                maritalStatus === 'married'
                    ? Number(period.monthly_housing_married ?? 0)
                    : Number(period.monthly_housing_single ?? 0);

            for (let monthIndex = periodStartMonth; monthIndex <= periodEndMonth; monthIndex += 1) {
                const calendarYear = bucket.year + Math.floor((monthIndex - 1) / 12);
                const calendarMonth = ((monthIndex - 1) % 12) + 1;
                const overlapDays = getOverlapDaysForMonth(startDate, endDate, calendarYear, calendarMonth);
                const monthDays = getDaysInPersianMonth(calendarYear, calendarMonth);

                if (overlapDays > 0) {
                    if (overlapDays === monthDays) {
                        monthsCovered += 1;
                        periodAmount += housingAllowance;
                    } else if (includeDaysCovered) {
                        monthsCovered += overlapDays / monthDays;
                        const proratedAmount = (housingAllowance * overlapDays) / monthDays;
                        daysCovered += overlapDays;
                        periodAmount += proratedAmount;
                    }
                }
            }

            if ((monthsCovered > 0 || daysCovered > 0 || periodAmount > 0) && housingAllowance > 0) {
                breakdown.push({
                    year: bucket.year,
                    periodIndex: period.period_index,
                    monthsCovered,
                    daysCovered,
                    monthlyAllowance: housingAllowance,
                    amount: Math.round(periodAmount),
                });
            }

            monthOffset = periodEndMonth;
        }
    }

    return {
        totalAmount: breakdown.reduce((sum, item) => sum + item.amount, 0),
        breakdown,
    };
}

export function calculateMonthlyAllowanceFromPeriodData(
    startDate: ParsedDateInput,
    endDate: ParsedDateInput,
    periodBuckets: SalaryPeriodBucket[],
    maritalStatus: 'single' | 'married' = 'single',
    includeDaysCovered = true,
): MonthlyAllowanceCalculationResult {
    if (compareParsedDates(startDate, endDate) > 0) {
        return { totalAmount: 0, breakdown: [] };
    }

    const breakdown: MonthlyAllowanceCalculationBreakdownItem[] = [];

    for (const bucket of [...periodBuckets].sort((a, b) => a.year - b.year)) {
        const sortedPeriods = [...bucket.periods].sort((a, b) => a.period_index - b.period_index);
        let monthOffset = 0;

        for (const period of sortedPeriods) {
            const periodLength = Number(period.month_count ?? 0);
            if (!Number.isFinite(periodLength) || periodLength <= 0) {
                continue;
            }

            const periodStartMonth = monthOffset + 1;
            const periodEndMonth = monthOffset + periodLength;
            let monthsCovered = 0;
            let daysCovered = 0;
            let periodAmount = 0;
            const monthlyAllowance =
                maritalStatus === 'married'
                    ? Number(period.monthly_married_allowance ?? 0)
                    : Number(period.monthly_single_allowance ?? 0);

            for (let monthIndex = periodStartMonth; monthIndex <= periodEndMonth; monthIndex += 1) {
                const calendarYear = bucket.year + Math.floor((monthIndex - 1) / 12);
                const calendarMonth = ((monthIndex - 1) % 12) + 1;
                const overlapDays = getOverlapDaysForMonth(startDate, endDate, calendarYear, calendarMonth);
                const monthDays = getDaysInPersianMonth(calendarYear, calendarMonth);

                if (overlapDays > 0) {
                    if (overlapDays === monthDays) {
                        monthsCovered += 1;
                        periodAmount += monthlyAllowance;
                    } else if (includeDaysCovered) {
                        monthsCovered += overlapDays / monthDays;
                        const proratedAmount = (monthlyAllowance * overlapDays) / monthDays;
                        daysCovered += overlapDays;
                        periodAmount += proratedAmount;
                    }
                }
            }

            if ((monthsCovered > 0 || daysCovered > 0 || periodAmount > 0) && monthlyAllowance > 0) {
                breakdown.push({
                    year: bucket.year,
                    periodIndex: period.period_index,
                    monthsCovered,
                    daysCovered,
                    monthlyAllowance,
                    amount: Math.round(periodAmount),
                });
            }

            monthOffset = periodEndMonth;
        }
    }

    return {
        totalAmount: breakdown.reduce((sum, item) => sum + item.amount, 0),
        breakdown,
    };
}

export function calculateMinimumBonusAndEntitlementFromPeriodData(
    startDate: ParsedDateInput,
    endDate: ParsedDateInput,
    periodBuckets: SalaryPeriodBucket[],
    includeDaysCovered = true,
): MinimumBonusAndEntitlementCalculationResult {
    if (compareParsedDates(startDate, endDate) > 0) {
        return { totalAmount: 0, breakdown: [] };
    }

    const breakdown: MinimumBonusAndEntitlementBreakdownItem[] = [];

    for (const bucket of [...periodBuckets].sort((a, b) => a.year - b.year)) {
        const sortedPeriods = [...bucket.periods].sort((a, b) => a.period_index - b.period_index);
        let monthOffset = 0;

        for (const period of sortedPeriods) {
            const periodLength = Number(period.month_count ?? 0);
            if (!Number.isFinite(periodLength) || periodLength <= 0) {
                continue;
            }

            const periodStartMonth = monthOffset + 1;
            const periodEndMonth = monthOffset + periodLength;
            let monthsCovered = 0;
            let daysCovered = 0;
            let periodAmount = 0;
            const dailyMinimumWage = Number(period.daily_minimum_wage ?? 0);
            const bonusFactor = 5;

            for (let monthIndex = periodStartMonth; monthIndex <= periodEndMonth; monthIndex += 1) {
                const calendarYear = bucket.year + Math.floor((monthIndex - 1) / 12);
                const calendarMonth = ((monthIndex - 1) % 12) + 1;
                const monthDays = getDaysInPersianMonth(calendarYear, calendarMonth);
                const overlapDays = getOverlapDaysForMonth(startDate, endDate, calendarYear, calendarMonth);

                if (overlapDays > 0) {
                    if (overlapDays === monthDays) {
                        monthsCovered += 1;
                        periodAmount += dailyMinimumWage * bonusFactor;
                    } else if (includeDaysCovered) {
                        monthsCovered += overlapDays / monthDays;
                        const proratedAmount = (dailyMinimumWage * bonusFactor * overlapDays) / monthDays;
                        daysCovered += overlapDays;
                        periodAmount += proratedAmount;
                    }
                }
            }

            if ((monthsCovered > 0 || daysCovered > 0 || periodAmount > 0) && dailyMinimumWage > 0) {
                breakdown.push({
                    year: bucket.year,
                    periodIndex: period.period_index,
                    monthsCovered,
                    daysCovered,
                    dailyMinimumWage,
                    amount: Math.round(periodAmount),
                });
            }

            monthOffset = periodEndMonth;
        }
    }

    return {
        totalAmount: breakdown.reduce((sum, item) => sum + item.amount, 0),
        breakdown,
    };
}

export function calculateMaximumBonusAndEntitlementFromPeriodData(
    startDate: ParsedDateInput,
    endDate: ParsedDateInput,
    periodBuckets: SalaryPeriodBucket[],
    includeDaysCovered = true,
): MaximumBonusAndEntitlementCalculationResult {
    if (compareParsedDates(startDate, endDate) > 0) {
        return { totalAmount: 0, breakdown: [] };
    }

    const breakdown: MaximumBonusAndEntitlementBreakdownItem[] = [];

    for (const bucket of [...periodBuckets].sort((a, b) => a.year - b.year)) {
        const sortedPeriods = [...bucket.periods].sort((a, b) => a.period_index - b.period_index);
        let monthOffset = 0;

        for (const period of sortedPeriods) {
            const periodLength = Number(period.month_count ?? 0);
            if (!Number.isFinite(periodLength) || periodLength <= 0) {
                continue;
            }

            const periodStartMonth = monthOffset + 1;
            const periodEndMonth = monthOffset + periodLength;
            let monthsCovered = 0;
            let daysCovered = 0;
            let periodAmount = 0;
            const dailyMinimumWage = Number(period.daily_minimum_wage ?? 0);
            const bonusFactor = 7.5;

            for (let monthIndex = periodStartMonth; monthIndex <= periodEndMonth; monthIndex += 1) {
                const calendarYear = bucket.year + Math.floor((monthIndex - 1) / 12);
                const calendarMonth = ((monthIndex - 1) % 12) + 1;
                const monthDays = getDaysInPersianMonth(calendarYear, calendarMonth);
                const overlapDays = getOverlapDaysForMonth(startDate, endDate, calendarYear, calendarMonth);

                if (overlapDays > 0) {
                    if (overlapDays === monthDays) {
                        monthsCovered += 1;
                        periodAmount += dailyMinimumWage * bonusFactor;
                    } else if (includeDaysCovered) {
                        monthsCovered += overlapDays / monthDays;
                        const proratedAmount = (dailyMinimumWage * bonusFactor * overlapDays) / monthDays;
                        daysCovered += overlapDays;
                        periodAmount += proratedAmount;
                    }
                }
            }

            if ((monthsCovered > 0 || daysCovered > 0 || periodAmount > 0) && dailyMinimumWage > 0) {
                breakdown.push({
                    year: bucket.year,
                    periodIndex: period.period_index,
                    monthsCovered,
                    daysCovered,
                    dailyMinimumWage,
                    amount: Math.round(periodAmount),
                });
            }

            monthOffset = periodEndMonth;
        }
    }

    return {
        totalAmount: breakdown.reduce((sum, item) => sum + item.amount, 0),
        breakdown,
    };
}

export function calculateBonusEntitlementFromPeriodData(
    startDate: ParsedDateInput,
    endDate: ParsedDateInput,
    employmentStartDate: ParsedDateInput,
    periodBuckets: SalaryPeriodBucket[],
    workshopType: EntitledSeniorityWorkshopType = 'unclassified',
    jobGroupNumber?: number,
    settledThrough1391 = false,
): BonusEntitlementCalculationResult {
    const emptyResult = {
        totalCalculatedAmount: 0,
        totalMinimumAmount: 0,
        totalMaximumAmount: 0,
        totalEntitlementAmount: 0,
        breakdown: [],
    };

    if (compareParsedDates(startDate, endDate) > 0) {
        return emptyResult;
    }

    const seniorityResult = calculateEntitledSeniorityFromPeriodData(
        employmentStartDate,
        endDate,
        periodBuckets,
        workshopType,
        jobGroupNumber,
        settledThrough1391,
    );
    const breakdown: BonusEntitlementBreakdownItem[] = [];

    for (const bucket of [...periodBuckets].sort((left, right) => left.year - right.year)) {
        for (const period of [...bucket.periods].sort((left, right) => left.period_index - right.period_index)) {
            const periodLength = Number(period.month_count ?? 0);
            if (!Number.isFinite(periodLength) || periodLength <= 0) {
                continue;
            }

            const periodStartMonth = [...bucket.periods]
                .sort((left, right) => left.period_index - right.period_index)
                .filter((item) => item.period_index < period.period_index)
                .reduce((sum, item) => sum + Number(item.month_count ?? 0), 0) + 1;
            const periodEndMonth = periodStartMonth + periodLength - 1;
            const periodStart = { year: bucket.year, month: periodStartMonth, day: 1 };
            const periodEnd = { year: bucket.year, month: periodEndMonth, day: jalaaliMonthLength(bucket.year, periodEndMonth) };
            const dailyMinimumWage = Number(period.daily_minimum_wage ?? 0);

            for (const senioritySegment of seniorityResult.breakdown.filter((segment) => (
                segment.year === bucket.year && segment.periodIndex === period.period_index
            ))) {
                const overlapStart = getLaterDate(startDate, getLaterDate(periodStart, senioritySegment.startDate));
                const overlapEnd = getEarlierDate(endDate, getEarlierDate(periodEnd, senioritySegment.endDate));
                if (compareParsedDates(overlapStart, overlapEnd) > 0 || dailyMinimumWage <= 0) {
                    continue;
                }

                let monthsCovered = 0;
                let cursor = { year: overlapStart.year, month: overlapStart.month };
                while (cursor.year < overlapEnd.year || (cursor.year === overlapEnd.year && cursor.month <= overlapEnd.month)) {
                    const monthDays = jalaaliMonthLength(cursor.year, cursor.month);
                    const monthStart = { year: cursor.year, month: cursor.month, day: 1 };
                    const monthEnd = { year: cursor.year, month: cursor.month, day: monthDays };
                    const monthOverlapStart = getLaterDate(overlapStart, monthStart);
                    const monthOverlapEnd = getEarlierDate(overlapEnd, monthEnd);
                    if (compareParsedDates(monthOverlapStart, monthOverlapEnd) <= 0) {
                        const coveredDays = Math.round(toDayNumber(monthOverlapEnd) - toDayNumber(monthOverlapStart) + 1);
                        monthsCovered += coveredDays / monthDays;
                    }

                    cursor.month += 1;
                    if (cursor.month > 12) {
                        cursor.month = 1;
                        cursor.year += 1;
                    }
                }

                const dailySeniority = Math.max(0, Number(senioritySegment.entitlement) || 0);
                const calculatedAmount = monthsCovered * 5 * (dailyMinimumWage + dailySeniority);
                const minimumAmount = monthsCovered * 5 * dailyMinimumWage;
                const maximumAmount = monthsCovered * 7.5 * dailyMinimumWage;

                breakdown.push({
                    year: bucket.year,
                    periodIndex: period.period_index,
                    phase: senioritySegment.phase,
                    startDate: overlapStart,
                    endDate: overlapEnd,
                    monthsCovered,
                    dailyMinimumWage,
                    dailySeniority,
                    calculatedAmount: Math.round(calculatedAmount),
                    minimumAmount: Math.round(minimumAmount),
                    maximumAmount: Math.round(maximumAmount),
                    entitlementAmount: Math.round(calculatedAmount),
                });
            }
        }
    }

    const totalCalculatedAmount = Math.round(breakdown.reduce((sum, item) => sum + item.calculatedAmount, 0));
    const totalMinimumAmount = Math.round(breakdown.reduce((sum, item) => sum + item.minimumAmount, 0));
    const totalMaximumAmount = Math.round(breakdown.reduce((sum, item) => sum + item.maximumAmount, 0));
    const totalEntitlementAmount = Math.min(totalCalculatedAmount, totalMaximumAmount);
    const capRatio = totalCalculatedAmount > 0 ? totalEntitlementAmount / totalCalculatedAmount : 0;

    breakdown.forEach((item) => {
        item.entitlementAmount = Math.round(item.calculatedAmount * capRatio);
    });

    const entitlementDifference = totalEntitlementAmount - breakdown.reduce((sum, item) => sum + item.entitlementAmount, 0);
    if (breakdown.length > 0 && entitlementDifference !== 0) {
        breakdown[breakdown.length - 1].entitlementAmount += entitlementDifference;
    }

    return {
        totalCalculatedAmount,
        totalMinimumAmount,
        totalMaximumAmount,
        totalEntitlementAmount,
        breakdown,
    };
}

export function calculateSpousalAllowanceFromPeriodData(
    startDate: ParsedDateInput,
    endDate: ParsedDateInput,
    periodBuckets: SalaryPeriodBucket[],
    includeDaysCovered = true,
): SpousalAllowanceCalculationResult {
    if (compareParsedDates(startDate, endDate) > 0) {
        return { totalAmount: 0, breakdown: [] };
    }

    const breakdown: SpousalAllowanceCalculationBreakdownItem[] = [];

    for (const bucket of [...periodBuckets].sort((a, b) => a.year - b.year)) {
        const sortedPeriods = [...bucket.periods].sort((a, b) => a.period_index - b.period_index);
        let monthOffset = 0;

        for (const period of sortedPeriods) {
            const periodLength = Number(period.month_count ?? 0);
            if (!Number.isFinite(periodLength) || periodLength <= 0) {
                continue;
            }

            const periodStartMonth = monthOffset + 1;
            const periodEndMonth = monthOffset + periodLength;
            let monthsCovered = 0;
            let daysCovered = 0;
            let periodAmount = 0;
            const maritalAllowance = Number(period.marital_allowance ?? 0);

            for (let monthIndex = periodStartMonth; monthIndex <= periodEndMonth; monthIndex += 1) {
                const calendarYear = bucket.year + Math.floor((monthIndex - 1) / 12);
                const calendarMonth = ((monthIndex - 1) % 12) + 1;
                const overlapDays = getOverlapDaysForMonth(startDate, endDate, calendarYear, calendarMonth);
                const monthDays = getDaysInPersianMonth(calendarYear, calendarMonth);

                if (overlapDays > 0) {
                    if (overlapDays === monthDays) {
                        monthsCovered += 1;
                        periodAmount += maritalAllowance;
                    } else if (includeDaysCovered) {
                        const proratedAmount = (maritalAllowance * overlapDays) / monthDays;
                        daysCovered += overlapDays;
                        periodAmount += proratedAmount;
                    }
                }
            }

            if ((monthsCovered > 0 || daysCovered > 0 || periodAmount > 0) && maritalAllowance > 0) {
                breakdown.push({
                    year: bucket.year,
                    periodIndex: period.period_index,
                    monthsCovered,
                    daysCovered,
                    spousalAllowance: maritalAllowance ?? null,
                    amount: Math.round(periodAmount),
                });
            }

            monthOffset = periodEndMonth;
        }
    }

    return {
        totalAmount: breakdown.reduce((sum, item) => sum + item.amount, 0),
        breakdown,
    };
}

export function calculateOvertimeEntitlementFromPeriodData(
    startDate: ParsedDateInput,
    endDate: ParsedDateInput,
    employmentStartDate: ParsedDateInput,
    periodBuckets: SalaryPeriodBucket[],
    dailyOvertimeHours: number,
    workshopType: EntitledSeniorityWorkshopType = 'unclassified',
    jobGroupNumber?: number,
    settledThrough1391 = false,
): OvertimeEntitlementCalculationResult {
    if (compareParsedDates(startDate, endDate) > 0 || !Number.isFinite(dailyOvertimeHours) || dailyOvertimeHours <= 0) {
        return { totalAmount: 0, breakdown: [] };
    }

    const breakdown: OvertimeEntitlementBreakdownItem[] = [];
    const seniorityResult = calculateEntitledSeniorityFromPeriodData(employmentStartDate, endDate, periodBuckets, workshopType, jobGroupNumber, settledThrough1391);

    for (const bucket of [...periodBuckets].sort((a, b) => a.year - b.year)) {
        const sortedPeriods = [...bucket.periods].sort((a, b) => a.period_index - b.period_index);

        for (const period of sortedPeriods) {
            const periodLength = Number(period.month_count ?? 0);
            if (!Number.isFinite(periodLength) || periodLength <= 0) {
                continue;
            }

            for (const segment of seniorityResult.breakdown.filter((item) => item.year === bucket.year && item.periodIndex === period.period_index)) {
                const segmentStart = getLaterDate(startDate, segment.startDate);
                const segmentEnd = getEarlierDate(endDate, segment.endDate);
                if (compareParsedDates(segmentStart, segmentEnd) <= 0) {
                    const daysCovered = Math.round(toDayNumber(segmentEnd) - toDayNumber(segmentStart) + 1);
                    const dailyMinimumWage = Number(period.daily_minimum_wage ?? 0);
                    const dailySeniority = Math.max(0, Number(segment.entitlement) || 0);
                    const overtimeRate = ((dailyMinimumWage + dailySeniority) / 7.33) * 1.4;
                    if (overtimeRate > 0) {
                        breakdown.push({ year: bucket.year, periodIndex: period.period_index, phase: segment.phase, startDate: segmentStart, endDate: segmentEnd, daysCovered, totalOvertimeHours: dailyOvertimeHours * daysCovered, dailyMinimumWage, dailySeniority, overtimeRate, amount: Math.round(dailyOvertimeHours * overtimeRate * daysCovered) });
                    }
                }
            }

        }
    }

    return {
        totalAmount: breakdown.reduce((sum, item) => sum + item.amount, 0),
        breakdown,
    };
}

export function calculateNightShiftEntitlementFromPeriodData(
    startDate: ParsedDateInput,
    endDate: ParsedDateInput,
    employmentStartDate: ParsedDateInput,
    periodBuckets: SalaryPeriodBucket[],
    workshopType: EntitledSeniorityWorkshopType = 'unclassified',
    jobGroupNumber?: number,
    settledThrough1391 = false,
): NightShiftEntitlementCalculationResult {
    if (compareParsedDates(startDate, endDate) > 0) {
        return { totalAmount: 0, breakdown: [] };
    }

    const breakdown: NightShiftEntitlementBreakdownItem[] = [];
    const seniorityResult = calculateEntitledSeniorityFromPeriodData(employmentStartDate, endDate, periodBuckets, workshopType, jobGroupNumber, settledThrough1391);

    for (const bucket of [...periodBuckets].sort((a, b) => a.year - b.year)) {
        const segments: { period: SalaryPeriodBucket['periods'][number]; phase: 'before-anniversary' | 'after-anniversary'; daysCovered: number; nightWorkDays: number; dailySeniority: number; startDate: ParsedDateInput; endDate: ParsedDateInput }[] = [];
        for (const period of [...bucket.periods].sort((a, b) => a.period_index - b.period_index)) {
            for (const segment of seniorityResult.breakdown.filter((item) => item.year === bucket.year && item.periodIndex === period.period_index)) {
                const segmentStart = getLaterDate(startDate, segment.startDate);
                const segmentEnd = getEarlierDate(endDate, segment.endDate);
                if (compareParsedDates(segmentStart, segmentEnd) <= 0) {
                    const daysCovered = Math.round(toDayNumber(segmentEnd) - toDayNumber(segmentStart) + 1);
                    segments.push({ period, phase: segment.phase, daysCovered, nightWorkDays: daysCovered, dailySeniority: Math.max(0, Number(segment.entitlement) || 0), startDate: segmentStart, endDate: segmentEnd });
                }
            }
        }
        for (const segment of segments) {
            const dailyMinimumWage = Number(segment.period.daily_minimum_wage ?? 0);
            const nightShiftRate = Math.round(0.35 * (dailyMinimumWage + segment.dailySeniority));
            if (segment.nightWorkDays > 0 && nightShiftRate > 0) breakdown.push({ year: bucket.year, periodIndex: segment.period.period_index, phase: segment.phase, startDate: segment.startDate, endDate: segment.endDate, daysCovered: segment.daysCovered, nightWorkDays: segment.nightWorkDays, dailyMinimumWage, dailySeniority: segment.dailySeniority, nightShiftRate, amount: Math.round(segment.nightWorkDays * nightShiftRate) });
        }
    }

    return {
        totalAmount: breakdown.reduce((sum, item) => sum + item.amount, 0),
        breakdown,
    };
}

export function calculateEndOfServiceYearsFromPeriodData(
    startDate: ParsedDateInput,
    endDate: ParsedDateInput,
    periodBuckets: SalaryPeriodBucket[],
    dailySeniority = 0,
    dailySeniorityByPeriod: Record<string, number> = {},
): EndOfServiceYearsCalculationResult {
    if (compareParsedDates(startDate, endDate) > 0) {
        return { totalAmount: 0, totalMonthEquivalent: 0, finalDailyMinimumWage: 0, finalDailySeniority: 0, finalDailyWage: 0, breakdown: [] };
    }

    const coveredPeriods: {
        year: number;
        periodIndex: number;
        monthsCovered: number;
        daysCovered: number;
        coveredMonthEquivalent: number;
        dailyMinimumWage: number;
    }[] = [];
    let totalMonthEquivalent = 0;

    for (const bucket of [...periodBuckets].sort((a, b) => a.year - b.year)) {
        const sortedPeriods = [...bucket.periods].sort((a, b) => a.period_index - b.period_index);
        let monthOffset = 0;

        for (const period of sortedPeriods) {
            const periodLength = Number(period.month_count ?? 0);
            if (!Number.isFinite(periodLength) || periodLength <= 0) {
                continue;
            }

            const periodStartMonth = monthOffset + 1;
            const periodEndMonth = monthOffset + periodLength;
            let monthsCovered = 0;
            let daysCovered = 0;
            const dailyMinimumWage = Number(period.daily_minimum_wage ?? 0);
            let coveredMonthEquivalent = 0;

            for (let monthIndex = periodStartMonth; monthIndex <= periodEndMonth; monthIndex += 1) {
                const calendarYear = bucket.year + Math.floor((monthIndex - 1) / 12);
                const calendarMonth = ((monthIndex - 1) % 12) + 1;
                const overlapDays = getOverlapDaysForMonth(startDate, endDate, calendarYear, calendarMonth);
                const monthDays = getDaysInPersianMonth(calendarYear, calendarMonth);

                if (overlapDays > 0) {
                    if (overlapDays === monthDays) {
                        monthsCovered += 1;
                        coveredMonthEquivalent += 1;
                    } else {
                        daysCovered += overlapDays;
                        coveredMonthEquivalent += overlapDays / monthDays;
                    }
                }
            }

            if ((monthsCovered > 0 || daysCovered > 0) && dailyMinimumWage > 0) {
                coveredPeriods.push({
                    year: bucket.year,
                    periodIndex: period.period_index,
                    monthsCovered,
                    daysCovered,
                    coveredMonthEquivalent,
                    dailyMinimumWage,
                });
                totalMonthEquivalent += coveredMonthEquivalent;
            }

            monthOffset = periodEndMonth;
        }
    }

    const lastDailyMinimumWage = coveredPeriods.at(-1)?.dailyMinimumWage ?? 0;
    const normalizedDailySeniority = Number.isFinite(dailySeniority) ? Math.max(0, dailySeniority) : 0;
    const finalPeriod = coveredPeriods.at(-1);
    const finalDailySeniority = finalPeriod
        ? Math.max(0, Number(dailySeniorityByPeriod[`${finalPeriod.year}:${finalPeriod.periodIndex}`] ?? normalizedDailySeniority))
        : normalizedDailySeniority;
    const lastDailyWage = lastDailyMinimumWage + finalDailySeniority;
    const breakdown: EndOfServiceYearsBreakdownItem[] = coveredPeriods.map((period) => {
        const periodDailySeniority = Math.max(0, Number(dailySeniorityByPeriod[`${period.year}:${period.periodIndex}`] ?? normalizedDailySeniority));
        return {
            year: period.year,
            periodIndex: period.periodIndex,
            monthsCovered: period.monthsCovered,
            daysCovered: period.daysCovered,
            dailyMinimumWage: period.dailyMinimumWage,
            dailySeniority: periodDailySeniority,
            monthEquivalent: period.coveredMonthEquivalent,
            amount: Math.round(period.coveredMonthEquivalent * 2.5 * lastDailyWage),
        };
    });

    return {
        totalAmount: Math.round(
            totalMonthEquivalent * 2.5 * lastDailyWage,
        ),
        totalMonthEquivalent,
        finalDailyMinimumWage: lastDailyMinimumWage,
        finalDailySeniority,
        finalDailyWage: lastDailyMinimumWage + finalDailySeniority,
        breakdown,
    };
}

export function calculateInsuranceDaysEntitlementFromPeriodData(
    startDate: ParsedDateInput,
    endDate: ParsedDateInput,
    dailyWorkHours: number,
): InsuranceDaysEntitlementCalculationResult {
    const maximumDailyWorkHours = 7 + 20 / 60;
    if (
        compareParsedDates(startDate, endDate) > 0
        || !Number.isFinite(dailyWorkHours)
        || dailyWorkHours <= 0
        || dailyWorkHours > maximumDailyWorkHours
    ) {
        return { totalDays: 0, breakdown: [] };
    }

    const breakdown: InsuranceDaysEntitlementBreakdownItem[] = [];
    const thresholdHours = maximumDailyWorkHours;
    const monthCursor = { year: startDate.year, month: startDate.month };
    const endCursor = { year: endDate.year, month: endDate.month };

    while (monthCursor.year < endCursor.year || (monthCursor.year === endCursor.year && monthCursor.month <= endCursor.month)) {
        const overlapDays = getOverlapDaysForMonth(startDate, endDate, monthCursor.year, monthCursor.month);

        if (overlapDays > 0) {
            const daysCalculated = dailyWorkHours >= thresholdHours
                ? overlapDays
                : overlapDays * (dailyWorkHours / thresholdHours);

            breakdown.push({
                year: monthCursor.year,
                periodIndex: monthCursor.month,
                daysCovered: overlapDays,
                dailyHours: dailyWorkHours,
                calculationType: dailyWorkHours >= thresholdHours ? 'month-full' : 'partial',
                daysCalculated: Number(daysCalculated.toFixed(2)),
            });
        }

        monthCursor.month += 1;
        if (monthCursor.month > 12) {
            monthCursor.month = 1;
            monthCursor.year += 1;
        }
    }

    return {
        totalDays: Number(breakdown.reduce((sum, item) => sum + item.daysCalculated, 0).toFixed(2)),
        breakdown,
    };
}

export function calculateMonthlyShiftWorkFromPeriodData(
    startDate: ParsedDateInput,
    endDate: ParsedDateInput,
    employmentStartDate: ParsedDateInput,
    periodBuckets: SalaryPeriodBucket[],
    shiftType: MonthlyShiftWorkType,
    workshopType: EntitledSeniorityWorkshopType = 'unclassified',
    jobGroupNumber?: number,
    settledThrough1391 = false,
): MonthlyShiftWorkCalculationResult {
    if (compareParsedDates(startDate, endDate) > 0) {
        return { totalAmount: 0, breakdown: [] };
    }

    const coefficientMap: Record<MonthlyShiftWorkType, number> = {
        'morning-evening': 0.1,
        'morning-evening-night': 0.15,
        'morning-night-or-evening-night': 0.225,
    };

    const coefficient = coefficientMap[shiftType];
    const breakdown: MonthlyShiftWorkBreakdownItem[] = [];
    const seniorityCalculation = calculateEntitledSeniorityFromPeriodData(
        employmentStartDate,
        endDate,
        periodBuckets,
        workshopType,
        jobGroupNumber,
        settledThrough1391,
    );

    for (const bucket of [...periodBuckets].sort((a, b) => a.year - b.year)) {
        const sortedPeriods = [...bucket.periods].sort((a, b) => a.period_index - b.period_index);
        let monthOffset = 0;

        for (const period of sortedPeriods) {
            const periodLength = Number(period.month_count ?? 0);
            if (!Number.isFinite(periodLength) || periodLength <= 0) {
                continue;
            }

            const periodStartMonth = monthOffset + 1;
            const periodEndMonth = monthOffset + periodLength;
            const dailyMinimumWage = Number(period.daily_minimum_wage ?? 0);
            const periodStart = { year: bucket.year, month: periodStartMonth, day: 1 };
            const periodEnd = { year: bucket.year, month: periodEndMonth, day: jalaaliMonthLength(bucket.year, periodEndMonth) };
            const periodSenioritySegments = seniorityCalculation.breakdown.filter((item) =>
                item.year === bucket.year
                && item.periodIndex === period.period_index
                && compareParsedDates(item.endDate, periodStart) >= 0
                && compareParsedDates(item.startDate, periodEnd) <= 0,
            );

            for (const senioritySegment of periodSenioritySegments) {
                const overlapStart = getLaterDate(startDate, senioritySegment.startDate);
                const overlapEnd = getEarlierDate(endDate, senioritySegment.endDate);
                const daysCovered = Math.round(toDayNumber(overlapEnd) - toDayNumber(overlapStart) + 1);

                if (daysCovered <= 0 || dailyMinimumWage <= 0) {
                    continue;
                }

                breakdown.push({
                    year: bucket.year,
                    periodIndex: period.period_index,
                    phase: senioritySegment.phase,
                    startDate: overlapStart,
                    endDate: overlapEnd,
                    daysCovered,
                    shiftType,
                    coefficient,
                    dailyBase: dailyMinimumWage,
                    dailySeniority: senioritySegment.entitlement,
                    amount: Math.round(coefficient * daysCovered * (dailyMinimumWage + senioritySegment.entitlement)),
                });
            }

            monthOffset = periodEndMonth;
        }
    }

    return {
        totalAmount: breakdown.reduce((sum, item) => sum + item.amount, 0),
        breakdown,
    };
}

export type UnemploymentInsuranceMaritalStatus = 'single' | 'married';

export interface UnemploymentInsuranceEntitlementResult {
    insuranceMonths: number;
    usedMonths: number;
    maritalStatus: UnemploymentInsuranceMaritalStatus;
    legalEntitlementMonths: number;
    remainingEntitlementMonths: number;
}

export function calculateUnemploymentInsuranceEntitlement(
    insuranceMonths: number,
    usedMonths: number,
    maritalStatus: UnemploymentInsuranceMaritalStatus,
): UnemploymentInsuranceEntitlementResult {
    const normalizedInsuranceMonths = Number.isFinite(insuranceMonths)
        ? Math.max(0, Math.trunc(insuranceMonths))
        : 0;
    const normalizedUsedMonths = Number.isFinite(usedMonths)
        ? Math.max(0, Math.trunc(usedMonths))
        : 0;

    let legalEntitlementMonths = 0;

    if (normalizedInsuranceMonths >= 6 && normalizedInsuranceMonths <= 24) {
        legalEntitlementMonths = maritalStatus === 'married' ? 12 : 6;
    } else if (normalizedInsuranceMonths <= 120 && normalizedInsuranceMonths >= 25) {
        legalEntitlementMonths = maritalStatus === 'married' ? 18 : 12;
    } else if (normalizedInsuranceMonths <= 180 && normalizedInsuranceMonths >= 121) {
        legalEntitlementMonths = maritalStatus === 'married' ? 26 : 18;
    } else if (normalizedInsuranceMonths <= 240 && normalizedInsuranceMonths >= 181) {
        legalEntitlementMonths = maritalStatus === 'married' ? 36 : 26;
    } else if (normalizedInsuranceMonths >= 241) {
        legalEntitlementMonths = maritalStatus === 'married' ? 50 : 36;
    }

    return {
        insuranceMonths: normalizedInsuranceMonths,
        usedMonths: normalizedUsedMonths,
        maritalStatus,
        legalEntitlementMonths,
        remainingEntitlementMonths: Math.max(0, legalEntitlementMonths - normalizedUsedMonths),
    };
}

export interface UnemploymentInsuranceAllowanceCalculationResult {
    totalWagesLast90Days: number;
    dailyMinimumWage: number;
    dependentsCount: number;
    averageDailyWage: number;
    dailyBaseAmount: number;
    familyShare: number;
    initialDailyAmount: number;
    dailyCeiling: number;
    finalDailyAmount: number;
    monthlyAmount: number;
}

export function calculateUnemploymentInsuranceAllowance(
    totalWagesLast90Days: number,
    dailyMinimumWage: number,
    dependentsCount: number,
): UnemploymentInsuranceAllowanceCalculationResult {
    const normalizedWages = Number.isFinite(totalWagesLast90Days) ? Math.max(0, totalWagesLast90Days) : 0;
    const normalizedMinimumWage = Number.isFinite(dailyMinimumWage) ? Math.max(0, dailyMinimumWage) : 0;
    const normalizedDependents = Number.isFinite(dependentsCount)
        ? Math.min(4, Math.max(0, Math.trunc(dependentsCount)))
        : 0;
    const averageDailyWage = normalizedWages / 90;
    const dailyBaseAmount = averageDailyWage * 0.55;
    const familyShare = normalizedDependents * 0.1 * normalizedMinimumWage;
    const initialDailyAmount = dailyBaseAmount + familyShare;
    const dailyCeiling = averageDailyWage * 0.8;
    const finalDailyAmount = Math.max(normalizedMinimumWage, Math.min(initialDailyAmount, dailyCeiling));

    return {
        totalWagesLast90Days: normalizedWages,
        dailyMinimumWage: normalizedMinimumWage,
        dependentsCount: normalizedDependents,
        averageDailyWage,
        dailyBaseAmount,
        familyShare,
        initialDailyAmount,
        dailyCeiling,
        finalDailyAmount,
        monthlyAmount: finalDailyAmount * 30,
    };
}
