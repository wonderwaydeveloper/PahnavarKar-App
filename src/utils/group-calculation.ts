import { TOOL_DEFINITIONS } from '@/constants/tool-definitions';
import { scaleWageCalculationResult } from '@/utils/daily-work-ratio';
import {
    calculateBonusEntitlementFromPeriodData,
    calculateEndOfServiceYearsFromPeriodData,
    calculateEntitledSeniorityFromPeriodData,
    calculateEntitledSeniorityForDateRangeFromPeriodData,
    calculateFamilyAllowanceFromPeriodData,
    calculateFridayWorkFromPeriodData,
    calculateHousingAllowanceFromPeriodData,
    calculateInsuranceDaysEntitlementFromPeriodData,
    calculateMaximumBonusAndEntitlementFromPeriodData,
    calculateMinimumBonusAndEntitlementFromPeriodData,
    calculateMissionAllowanceFromPeriodData,
    calculateMonthlyAllowanceFromPeriodData,
    calculateMonthlyShiftWorkFromPeriodData,
    calculateNightShiftEntitlementFromPeriodData,
    calculateOfficialHolidaysInDateRange,
    calculateOfficialHolidayWorkFromPeriodData,
    calculateOrdinaryWorkHoursFromPeriodData,
    calculateOvertimeEntitlementFromPeriodData,
    calculateSalaryFromPeriodData,
    calculateSpousalAllowanceFromPeriodData,
    calculateUnusedLeaveEntitlement,
    calculateUnusedLeaveWageFromPeriodData,
    calculateYoungWorkerWorkHoursFromPeriodData,
    getMissionAllowancePeriodRanges,
    type EntitledSeniorityWorkshopType,
    type MonthlyShiftWorkType,
    type ParsedDateInput,
    type SalaryPeriodBucket,
} from '@/utils/salary-calculation';

export const GROUP_CALCULATION_KEYS = [
    'base-salary',
    'family-allowance',
    'housing-allowance',
    'monthly-allowance',
    'minimum-bonus',
    'maximum-bonus',
    'spousal-allowance',
    'official-holidays-in-range',
    'ordinary-work-hours',
    'hazardous-work-hours',
    'young-worker-work-hours',
    'insurance-days-entitlement',
    'entitled-seniority',
    'overtime-entitlement',
    'night-shift-entitlement',
    'monthly-shift-work',
    'end-of-service-years',
    'bonus-entitlement',
    'official-holiday-work',
    'friday-work',
    'mission-allowance',
    'unused-leave-entitlement',
    'unused-leave-wage',
] as const;

export type GroupCalculationKey = (typeof GROUP_CALCULATION_KEYS)[number];
export type GroupCalculationMaritalStatus = 'single' | 'married';

const WORK_TIME_SCALED_KEYS = new Set<GroupCalculationKey>([
    'family-allowance',
    'housing-allowance',
    'monthly-allowance',
    'minimum-bonus',
    'maximum-bonus',
    'spousal-allowance',
    'entitled-seniority',
    'overtime-entitlement',
    'night-shift-entitlement',
    'monthly-shift-work',
    'end-of-service-years',
    'bonus-entitlement',
    'official-holiday-work',
    'friday-work',
    'unused-leave-wage',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export interface GroupCalculationInput {
    startDate: ParsedDateInput;
    endDate: ParsedDateInput;
    missionStartDate: ParsedDateInput;
    missionEndDate: ParsedDateInput;
    periodBuckets: SalaryPeriodBucket[];
    officialHolidayDates: string[];
    maritalStatus: GroupCalculationMaritalStatus;
    childrenCount: number;
    dailyWorkMinutes: number;
    dailyWorkHours: number;
    employmentStartDate: ParsedDateInput;
    workshopType: EntitledSeniorityWorkshopType;
    jobGroupNumber?: number;
    settledThrough1391: boolean;
    dailyOvertimeHours: number;
    shiftType: MonthlyShiftWorkType;
    fridayWorkDaysByPeriod: Record<string, number>;
    missionDaysByPeriod: Record<string, number>;
    usedLeaveDaysBySegment: number[];
    initialSavedLeaveDays: number;
}

export interface GroupCalculationResult {
    key: GroupCalculationKey;
    title: string;
    value: number;
    unit: 'ریال' | 'روز' | 'ساعت' | 'ماه';
    breakdown: unknown[];
    error?: string;
}

const GROUP_RESULT_UNITS: Partial<Record<GroupCalculationKey, GroupCalculationResult['unit']>> = {
    'official-holidays-in-range': 'روز',
    'ordinary-work-hours': 'ساعت',
    'hazardous-work-hours': 'ساعت',
    'young-worker-work-hours': 'ساعت',
    'insurance-days-entitlement': 'روز',
    'unused-leave-entitlement': 'روز',
};

function calculateOne(key: GroupCalculationKey, input: GroupCalculationInput): Pick<GroupCalculationResult, 'value' | 'unit' | 'breakdown'> {
    switch (key) {
        case 'base-salary': {
            const result = calculateSalaryFromPeriodData(
                input.startDate,
                input.endDate,
                input.periodBuckets,
                input.dailyWorkMinutes,
            );
            return { value: result.totalAmount, unit: 'ریال', breakdown: result.breakdown };
        }
        case 'family-allowance': {
            const result = calculateFamilyAllowanceFromPeriodData(
                input.startDate,
                input.endDate,
                input.periodBuckets,
                input.childrenCount,
            );
            return { value: result.totalAmount, unit: 'ریال', breakdown: result.breakdown };
        }
        case 'housing-allowance': {
            const result = calculateHousingAllowanceFromPeriodData(
                input.startDate,
                input.endDate,
                input.periodBuckets,
                input.maritalStatus,
            );
            return { value: result.totalAmount, unit: 'ریال', breakdown: result.breakdown };
        }
        case 'monthly-allowance': {
            const result = calculateMonthlyAllowanceFromPeriodData(
                input.startDate,
                input.endDate,
                input.periodBuckets,
                input.maritalStatus,
            );
            return { value: result.totalAmount, unit: 'ریال', breakdown: result.breakdown };
        }
        case 'minimum-bonus': {
            const result = calculateMinimumBonusAndEntitlementFromPeriodData(
                input.startDate,
                input.endDate,
                input.periodBuckets,
            );
            return { value: result.totalAmount, unit: 'ریال', breakdown: result.breakdown };
        }
        case 'maximum-bonus': {
            const result = calculateMaximumBonusAndEntitlementFromPeriodData(
                input.startDate,
                input.endDate,
                input.periodBuckets,
            );
            return { value: result.totalAmount, unit: 'ریال', breakdown: result.breakdown };
        }
        case 'spousal-allowance': {
            const result = calculateSpousalAllowanceFromPeriodData(
                input.startDate,
                input.endDate,
                input.periodBuckets,
            );
            return { value: result.totalAmount, unit: 'ریال', breakdown: result.breakdown };
        }
        case 'official-holidays-in-range': {
            const result = calculateOfficialHolidaysInDateRange(
                input.startDate,
                input.endDate,
                input.officialHolidayDates,
            );
            return { value: result.totalHolidays, unit: 'روز', breakdown: result.breakdown };
        }
        case 'ordinary-work-hours': {
            const result = calculateOrdinaryWorkHoursFromPeriodData(
                input.startDate,
                input.endDate,
                input.periodBuckets,
                input.officialHolidayDates,
            );
            return { value: result.totalHours, unit: 'ساعت', breakdown: result.breakdown };
        }
        case 'hazardous-work-hours': {
            const result = calculateOrdinaryWorkHoursFromPeriodData(
                input.startDate,
                input.endDate,
                input.periodBuckets,
                input.officialHolidayDates,
                6,
            );
            return { value: result.totalHours, unit: 'ساعت', breakdown: result.breakdown };
        }
        case 'young-worker-work-hours': {
            const result = calculateYoungWorkerWorkHoursFromPeriodData(
                input.startDate,
                input.endDate,
                input.periodBuckets,
                input.officialHolidayDates,
            );
            return { value: result.totalHours, unit: 'ساعت', breakdown: result.breakdown };
        }
        case 'insurance-days-entitlement': {
            const result = calculateInsuranceDaysEntitlementFromPeriodData(
                input.startDate,
                input.endDate,
                input.dailyWorkHours,
            );
            return { value: result.totalDays, unit: 'روز', breakdown: result.breakdown };
        }
        case 'entitled-seniority': {
            const result = calculateEntitledSeniorityForDateRangeFromPeriodData(
                input.employmentStartDate,
                input.startDate,
                input.endDate,
                input.periodBuckets,
                input.workshopType,
                input.jobGroupNumber,
                input.settledThrough1391,
            );
            return { value: result.totalAmount, unit: 'ریال', breakdown: result.breakdown };
        }
        case 'overtime-entitlement': {
            const result = calculateOvertimeEntitlementFromPeriodData(
                input.startDate,
                input.endDate,
                input.employmentStartDate,
                input.periodBuckets,
                input.dailyOvertimeHours,
                input.workshopType,
                input.jobGroupNumber,
                input.settledThrough1391,
            );
            return { value: result.totalAmount, unit: 'ریال', breakdown: result.breakdown };
        }
        case 'night-shift-entitlement': {
            const result = calculateNightShiftEntitlementFromPeriodData(
                input.startDate,
                input.endDate,
                input.employmentStartDate,
                input.periodBuckets,
                input.workshopType,
                input.jobGroupNumber,
                input.settledThrough1391,
            );
            return { value: result.totalAmount, unit: 'ریال', breakdown: result.breakdown };
        }
        case 'monthly-shift-work': {
            const result = calculateMonthlyShiftWorkFromPeriodData(
                input.startDate,
                input.endDate,
                input.employmentStartDate,
                input.periodBuckets,
                input.shiftType,
                input.workshopType,
                input.jobGroupNumber,
                input.settledThrough1391,
            );
            return { value: result.totalAmount, unit: 'ریال', breakdown: result.breakdown };
        }
        case 'end-of-service-years': {
            const seniority = calculateEntitledSeniorityFromPeriodData(
                input.employmentStartDate,
                input.endDate,
                input.periodBuckets,
                input.workshopType,
                input.jobGroupNumber,
                input.settledThrough1391,
            );
            const seniorityByPeriod = Object.fromEntries(
                seniority.breakdown.map((item) => [`${item.year}:${item.periodIndex}`, item.entitlement]),
            );
            const result = calculateEndOfServiceYearsFromPeriodData(
                input.startDate,
                input.endDate,
                input.periodBuckets,
                seniority.finalEntitlement,
                seniorityByPeriod,
            );
            return { value: result.totalAmount, unit: 'ریال', breakdown: result.breakdown };
        }
        case 'bonus-entitlement': {
            const result = calculateBonusEntitlementFromPeriodData(
                input.startDate,
                input.endDate,
                input.employmentStartDate,
                input.periodBuckets,
                input.workshopType,
                input.jobGroupNumber,
                input.settledThrough1391,
            );
            return { value: result.totalEntitlementAmount, unit: 'ریال', breakdown: result.breakdown };
        }
        case 'official-holiday-work': {
            const result = calculateOfficialHolidayWorkFromPeriodData(
                input.startDate,
                input.endDate,
                input.employmentStartDate,
                input.periodBuckets,
                input.officialHolidayDates,
                input.workshopType,
                input.jobGroupNumber,
                input.settledThrough1391,
            );
            return { value: result.totalAmount, unit: 'ریال', breakdown: result.breakdown };
        }
        case 'friday-work': {
            const result = calculateFridayWorkFromPeriodData(
                input.startDate,
                input.endDate,
                input.employmentStartDate,
                input.periodBuckets,
                input.fridayWorkDaysByPeriod,
                input.workshopType,
                input.jobGroupNumber,
                input.settledThrough1391,
            );
            return { value: result.totalAmount, unit: 'ریال', breakdown: result.breakdown };
        }
        case 'mission-allowance': {
            const ranges = getMissionAllowancePeriodRanges(input.missionStartDate, input.missionEndDate, input.periodBuckets);
            const result = calculateMissionAllowanceFromPeriodData(
                input.employmentStartDate,
                input.missionStartDate,
                input.missionEndDate,
                input.missionDaysByPeriod,
                input.periodBuckets,
                input.workshopType,
                input.jobGroupNumber,
                input.settledThrough1391,
            );
            if (!result || ranges.length === 0) throw new Error('Mission allowance input is incomplete.');
            return { value: result.totalAmount, unit: 'ریال', breakdown: result.breakdown };
        }
        case 'unused-leave-entitlement': {
            const result = calculateUnusedLeaveEntitlement(
                input.startDate,
                input.endDate,
                input.usedLeaveDaysBySegment,
                input.initialSavedLeaveDays,
            );
            if (!result) throw new Error('Unused leave input is invalid.');
            return { value: result.totalSavedLeaveDays, unit: 'روز', breakdown: result.breakdown };
        }
        case 'unused-leave-wage': {
            const leave = calculateUnusedLeaveEntitlement(
                input.startDate,
                input.endDate,
                input.usedLeaveDaysBySegment,
                input.initialSavedLeaveDays,
            );
            if (!leave) throw new Error('Unused leave input is invalid.');
            const seniority = calculateEntitledSeniorityFromPeriodData(
                input.employmentStartDate,
                input.endDate,
                input.periodBuckets,
                input.workshopType,
                input.jobGroupNumber,
                input.settledThrough1391,
            );
            const result = calculateUnusedLeaveWageFromPeriodData(
                input.startDate,
                input.endDate,
                input.periodBuckets,
                input.maritalStatus,
                input.childrenCount,
                seniority.finalEntitlement,
                leave.totalSavedLeaveDays,
            );
            if (!result) throw new Error('Unused leave wage data is missing.');
            const amount = result.dailyWage * result.unusedLeaveDays;
            return { value: amount, unit: 'ریال', breakdown: [{ ...result, amount }] };
        }
    }
}

export function calculateGroupItems(
    selectedKeys: readonly GroupCalculationKey[],
    input: GroupCalculationInput,
): GroupCalculationResult[] {
    return selectedKeys.map((key) => {
        const tool = TOOL_DEFINITIONS.find((item) => item.key === key);

        try {
            const calculated = calculateOne(key, input);
            const dailyWorkRatio = Math.min(440, Math.max(0, Number(input.dailyWorkMinutes) || 0)) / 440;
            const scaled = WORK_TIME_SCALED_KEYS.has(key)
                ? scaleWageCalculationResult({ totalAmount: calculated.value, breakdown: calculated.breakdown }, dailyWorkRatio)
                : null;
            const breakdown = scaled?.breakdown ?? calculated.breakdown;
            const normalizedBreakdown = key === 'unused-leave-wage'
                ? breakdown.map((item) => {
                    if (!isRecord(item)) return item;
                    const scaledItem = { ...item };
                    for (const field of [
                        'dailyWage',
                        'dailyMinimumWage',
                        'dailySeniority',
                        'dailyHousingAllowance',
                        'dailyChildAllowance',
                        'dailyMonthlyAllowance',
                        'dailyMaritalAllowance',
                    ]) {
                        if (typeof scaledItem[field] === 'number') {
                            scaledItem[field] = scaledItem[field] * dailyWorkRatio;
                        }
                    }
                    return scaledItem;
                })
                : breakdown;

            return {
                key,
                title: tool?.title ?? key,
                ...calculated,
                value: scaled?.totalAmount ?? calculated.value,
                breakdown: normalizedBreakdown,
            };
        } catch {
            return {
                key,
                title: tool?.title ?? key,
                value: 0,
                unit: GROUP_RESULT_UNITS[key] ?? 'ریال',
                breakdown: [],
                error: 'محاسبهٔ این مورد انجام نشد.',
            };
        }
    });
}