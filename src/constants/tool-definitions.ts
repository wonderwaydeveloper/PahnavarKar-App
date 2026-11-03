import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

import { PLAN_FEATURE_DETAILS } from '@/constants/generated-plan-feature-details';

export type ToolIconName = ComponentProps<typeof MaterialCommunityIcons>['name'];
export type ToolCategory = 'wageContinuous' | 'wageNonContinuous' | 'nonWage' | 'yearlyInfo';

export interface ToolDefinition {
    key: string;
    title: string;
    detail: string;
    icon: ToolIconName;
    accent: string;
    route: string;
    category: ToolCategory;
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
    { key: 'yearly-info', title: 'اطلاعات جامع مزدی از سال ۱۳۶۹ تاکنون', detail: PLAN_FEATURE_DETAILS['yearly-info'], icon: 'calendar-range', accent: '#4338CA', route: '/home/yearly-info', category: 'yearlyInfo' },
    { key: 'base-salary', title: 'حقوق پایه', detail: PLAN_FEATURE_DETAILS['base-salary'], icon: 'calculator-variant', accent: '#047857', route: '/home/base-salary', category: 'wageContinuous' },
    { key: 'entitled-seniority', title: 'پایه سنوات استحقاقی', detail: PLAN_FEATURE_DETAILS['entitled-seniority'], icon: 'cash-plus', accent: '#0F766E', route: '/home/entitled-seniority', category: 'wageContinuous' },
    { key: 'housing-allowance', title: 'حق مسکن', detail: PLAN_FEATURE_DETAILS['housing-allowance'], icon: 'home-city', accent: '#1D4ED8', route: '/home/housing-allowance', category: 'wageContinuous' },
    { key: 'monthly-allowance', title: 'بن کارگری', detail: PLAN_FEATURE_DETAILS['monthly-allowance'], icon: 'cash-multiple', accent: '#6D28D9', route: '/home/monthly-allowance', category: 'wageContinuous' },
    { key: 'spousal-allowance', title: 'حق تاهل', detail: PLAN_FEATURE_DETAILS['spousal-allowance'], icon: 'heart-outline', accent: '#BE123C', route: '/home/spousal-allowance', category: 'wageContinuous' },
    { key: 'family-allowance', title: 'حق عائله مندی', detail: PLAN_FEATURE_DETAILS['family-allowance'], icon: 'family-tree', accent: '#B45309', route: '/home/family-allowance', category: 'wageContinuous' },
    { key: 'unemployment-insurance-allowance', title: 'مبلغ مقرری بیمه بیکاری', detail: PLAN_FEATURE_DETAILS['unemployment-insurance-allowance'], icon: 'cash-clock', accent: '#0F766E', route: '/home/unemployment-insurance-allowance', category: 'wageContinuous' },
    { key: 'overtime-entitlement', title: 'اضافه کاری', detail: PLAN_FEATURE_DETAILS['overtime-entitlement'], icon: 'clock-alert-outline', accent: '#C2410C', route: '/home/overtime-entitlement', category: 'wageNonContinuous' },
    { key: 'night-shift-entitlement', title: 'شب کاری', detail: PLAN_FEATURE_DETAILS['night-shift-entitlement'], icon: 'weather-night', accent: '#0369A1', route: '/home/night-shift-entitlement', category: 'wageNonContinuous' },
    { key: 'monthly-shift-work', title: 'نوبت‌کاری', detail: PLAN_FEATURE_DETAILS['monthly-shift-work'], icon: 'calendar-clock', accent: '#0F766E', route: '/home/monthly-shift-work', category: 'wageNonContinuous' },
    { key: 'minimum-bonus', title: 'حداقل عیدی و پاداش', detail: PLAN_FEATURE_DETAILS['minimum-bonus'], icon: 'gift-outline', accent: '#B91C1C', route: '/home/minimum-bonus', category: 'wageNonContinuous' },
    { key: 'maximum-bonus', title: 'حداکثر عیدی و پاداش', detail: PLAN_FEATURE_DETAILS['maximum-bonus'], icon: 'gift', accent: '#9D174D', route: '/home/maximum-bonus', category: 'wageNonContinuous' },
    { key: 'bonus-entitlement', title: 'عیدی و پاداش استحقاقی', detail: PLAN_FEATURE_DETAILS['bonus-entitlement'], icon: 'gift-open-outline', accent: '#9F1239', route: '/home/bonus-entitlement', category: 'wageNonContinuous' },
    { key: 'end-of-service-years', title: 'سنوات پایان کار', detail: PLAN_FEATURE_DETAILS['end-of-service-years'], icon: 'briefcase-clock', accent: '#0F766E', route: '/home/end-of-service-years', category: 'wageNonContinuous' },
    { key: 'unused-leave-wage', title: 'مزد مرخصی ذخیره شده کارگر', detail: PLAN_FEATURE_DETAILS['unused-leave-wage'], icon: 'cash-clock', accent: '#0E7490', route: '/home/unused-leave-wage', category: 'wageNonContinuous' },
    { key: 'official-holiday-work', title: 'مبلغ تعطیل کاری', detail: PLAN_FEATURE_DETAILS['official-holiday-work'], icon: 'calendar-star', accent: '#C2410C', route: '/home/official-holiday-work', category: 'wageNonContinuous' },
    { key: 'suspension-wage', title: 'حق‌السعی ایام تعلیق', detail: PLAN_FEATURE_DETAILS['suspension-wage'], icon: 'scale-balance', accent: '#0F766E', route: '/home/suspension-wage', category: 'wageNonContinuous' },
    { key: 'mission-allowance', title: 'فوق‌العاده مأموریت', detail: PLAN_FEATURE_DETAILS['mission-allowance'], icon: 'airplane', accent: '#0369A1', route: '/home/mission-allowance', category: 'wageNonContinuous' },
    { key: 'friday-work', title: 'جمعه کاری', detail: PLAN_FEATURE_DETAILS['friday-work'], icon: 'calendar-star', accent: '#B45309', route: '/home/friday-work', category: 'wageNonContinuous' },
    { key: 'unused-leave-entitlement', title: 'میزان مرخصی ذخیره شده کارگر', detail: PLAN_FEATURE_DETAILS['unused-leave-entitlement'], icon: 'calendar-clock', accent: '#BE123C', route: '/home/unused-leave-entitlement', category: 'nonWage' },
    { key: 'insurance-days-entitlement', title: 'تعداد روزهای بیمه استحقاقی', detail: PLAN_FEATURE_DETAILS['insurance-days-entitlement'], icon: 'shield-check', accent: '#15803D', route: '/home/insurance-days-entitlement', category: 'nonWage' },
    { key: 'unemployment-insurance-entitlement', title: 'مدت زمان پرداخت مقرری بیمه بیکاری', detail: PLAN_FEATURE_DETAILS['unemployment-insurance-entitlement'], icon: 'briefcase-account', accent: '#0369A1', route: '/home/unemployment-insurance-entitlement', category: 'nonWage' },
    { key: 'ordinary-work-hours', title: 'کارکرد موظفی کارگر در مشاغل عادی', detail: PLAN_FEATURE_DETAILS['ordinary-work-hours'], icon: 'calendar-check-outline', accent: '#0E7490', route: '/home/ordinary-work-hours', category: 'nonWage' },
    { key: 'hazardous-work-hours', title: 'کارکرد موظفی کارگر در مشاغل سخت و زیان‌آور', detail: PLAN_FEATURE_DETAILS['hazardous-work-hours'], icon: 'hard-hat', accent: '#B45309', route: '/home/hazardous-work-hours', category: 'nonWage' },
    { key: 'young-worker-work-hours', title: 'کارکرد موظفی کارگر نوجوان', detail: PLAN_FEATURE_DETAILS['young-worker-work-hours'], icon: 'account-child', accent: '#9F1239', route: '/home/young-worker-work-hours', category: 'nonWage' },
    { key: 'official-holidays-in-range', title: 'تعداد تعطیلات رسمی در بازه زمانی انتخاب شده', detail: PLAN_FEATURE_DETAILS['official-holidays-in-range'], icon: 'calendar-check-outline', accent: '#0E7490', route: '/home/official-holidays-in-range', category: 'nonWage' },
    { key: 'illegal-foreign-worker-penalty', title: 'مبلغ جریمه به‌کارگیری اتباع بیگانه غیرمجاز', detail: PLAN_FEATURE_DETAILS['illegal-foreign-worker-penalty'], icon: 'account-alert-outline', accent: '#B91C1C', route: '/home/illegal-foreign-worker-penalty', category: 'nonWage' },
    { key: 'article-87', title: 'مبلغ اعمال ماده ۸۷ قانون کار', detail: PLAN_FEATURE_DETAILS['article-87'], icon: 'file-document-edit-outline', accent: '#0369A1', route: '/home/article-87', category: 'nonWage' },
    { key: 'social-security-premium-ceiling', title: 'سقف حق بیمه تامین اجتماعی', detail: PLAN_FEATURE_DETAILS['social-security-premium-ceiling'], icon: 'shield-check-outline', accent: '#047857', route: '/home/social-security-premium-ceiling', category: 'nonWage' },
];
