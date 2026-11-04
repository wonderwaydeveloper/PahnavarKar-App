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
    route: string;
    category: ToolCategory;
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
    { key: 'yearly-info', title: 'اطلاعات جامع مزدی از سال ۱۳۶۹ تاکنون', detail: PLAN_FEATURE_DETAILS['yearly-info'], icon: 'calendar-range', route: '/home/yearly-info', category: 'yearlyInfo' },
    { key: 'base-salary', title: 'حقوق پایه', detail: PLAN_FEATURE_DETAILS['base-salary'], icon: 'calculator-variant', route: '/home/base-salary', category: 'wageContinuous' },
    { key: 'entitled-seniority', title: 'پایه سنوات استحقاقی', detail: PLAN_FEATURE_DETAILS['entitled-seniority'], icon: 'cash-plus', route: '/home/entitled-seniority', category: 'wageContinuous' },
    { key: 'housing-allowance', title: 'حق مسکن', detail: PLAN_FEATURE_DETAILS['housing-allowance'], icon: 'home-city', route: '/home/housing-allowance', category: 'wageContinuous' },
    { key: 'monthly-allowance', title: 'بن کارگری', detail: PLAN_FEATURE_DETAILS['monthly-allowance'], icon: 'cash-multiple', route: '/home/monthly-allowance', category: 'wageContinuous' },
    { key: 'spousal-allowance', title: 'حق تاهل', detail: PLAN_FEATURE_DETAILS['spousal-allowance'], icon: 'heart-outline', route: '/home/spousal-allowance', category: 'wageContinuous' },
    { key: 'family-allowance', title: 'حق عائله مندی', detail: PLAN_FEATURE_DETAILS['family-allowance'], icon: 'family-tree', route: '/home/family-allowance', category: 'wageContinuous' },
    { key: 'unemployment-insurance-allowance', title: 'مبلغ مقرری بیمه بیکاری', detail: PLAN_FEATURE_DETAILS['unemployment-insurance-allowance'], icon: 'cash-clock', route: '/home/unemployment-insurance-allowance', category: 'wageContinuous' },
    { key: 'overtime-entitlement', title: 'اضافه کاری', detail: PLAN_FEATURE_DETAILS['overtime-entitlement'], icon: 'clock-alert-outline', route: '/home/overtime-entitlement', category: 'wageNonContinuous' },
    { key: 'night-shift-entitlement', title: 'شب کاری', detail: PLAN_FEATURE_DETAILS['night-shift-entitlement'], icon: 'weather-night', route: '/home/night-shift-entitlement', category: 'wageNonContinuous' },
    { key: 'monthly-shift-work', title: 'نوبت‌کاری', detail: PLAN_FEATURE_DETAILS['monthly-shift-work'], icon: 'calendar-clock', route: '/home/monthly-shift-work', category: 'wageNonContinuous' },
    { key: 'minimum-bonus', title: 'حداقل عیدی و پاداش', detail: PLAN_FEATURE_DETAILS['minimum-bonus'], icon: 'gift-outline', route: '/home/minimum-bonus', category: 'wageNonContinuous' },
    { key: 'maximum-bonus', title: 'حداکثر عیدی و پاداش', detail: PLAN_FEATURE_DETAILS['maximum-bonus'], icon: 'gift', route: '/home/maximum-bonus', category: 'wageNonContinuous' },
    { key: 'bonus-entitlement', title: 'عیدی و پاداش استحقاقی', detail: PLAN_FEATURE_DETAILS['bonus-entitlement'], icon: 'gift-open-outline', route: '/home/bonus-entitlement', category: 'wageNonContinuous' },
    { key: 'end-of-service-years', title: 'سنوات پایان کار', detail: PLAN_FEATURE_DETAILS['end-of-service-years'], icon: 'briefcase-clock', route: '/home/end-of-service-years', category: 'wageNonContinuous' },
    { key: 'unused-leave-wage', title: 'مزد مرخصی ذخیره شده کارگر', detail: PLAN_FEATURE_DETAILS['unused-leave-wage'], icon: 'cash-clock', route: '/home/unused-leave-wage', category: 'wageNonContinuous' },
    { key: 'official-holiday-work', title: 'مبلغ تعطیل کاری', detail: PLAN_FEATURE_DETAILS['official-holiday-work'], icon: 'calendar-star', route: '/home/official-holiday-work', category: 'wageNonContinuous' },
    { key: 'suspension-wage', title: 'حق‌السعی ایام تعلیق', detail: PLAN_FEATURE_DETAILS['suspension-wage'], icon: 'scale-balance', route: '/home/suspension-wage', category: 'wageNonContinuous' },
    { key: 'mission-allowance', title: 'فوق‌العاده مأموریت', detail: PLAN_FEATURE_DETAILS['mission-allowance'], icon: 'airplane', route: '/home/mission-allowance', category: 'wageNonContinuous' },
    { key: 'friday-work', title: 'جمعه کاری', detail: PLAN_FEATURE_DETAILS['friday-work'], icon: 'calendar-star', route: '/home/friday-work', category: 'wageNonContinuous' },
    { key: 'unused-leave-entitlement', title: 'میزان مرخصی ذخیره شده کارگر', detail: PLAN_FEATURE_DETAILS['unused-leave-entitlement'], icon: 'calendar-clock', route: '/home/unused-leave-entitlement', category: 'nonWage' },
    { key: 'insurance-days-entitlement', title: 'تعداد روزهای بیمه استحقاقی', detail: PLAN_FEATURE_DETAILS['insurance-days-entitlement'], icon: 'shield-check', route: '/home/insurance-days-entitlement', category: 'nonWage' },
    { key: 'unemployment-insurance-entitlement', title: 'مدت زمان پرداخت مقرری بیمه بیکاری', detail: PLAN_FEATURE_DETAILS['unemployment-insurance-entitlement'], icon: 'briefcase-account', route: '/home/unemployment-insurance-entitlement', category: 'nonWage' },
    { key: 'ordinary-work-hours', title: 'کارکرد موظفی کارگر در مشاغل عادی', detail: PLAN_FEATURE_DETAILS['ordinary-work-hours'], icon: 'calendar-check-outline', route: '/home/ordinary-work-hours', category: 'nonWage' },
    { key: 'hazardous-work-hours', title: 'کارکرد موظفی کارگر در مشاغل سخت و زیان‌آور', detail: PLAN_FEATURE_DETAILS['hazardous-work-hours'], icon: 'hard-hat', route: '/home/hazardous-work-hours', category: 'nonWage' },
    { key: 'young-worker-work-hours', title: 'کارکرد موظفی کارگر نوجوان', detail: PLAN_FEATURE_DETAILS['young-worker-work-hours'], icon: 'account-child', route: '/home/young-worker-work-hours', category: 'nonWage' },
    { key: 'official-holidays-in-range', title: 'تعداد تعطیلات رسمی در بازه زمانی انتخاب شده', detail: PLAN_FEATURE_DETAILS['official-holidays-in-range'], icon: 'calendar-check-outline', route: '/home/official-holidays-in-range', category: 'nonWage' },
    { key: 'illegal-foreign-worker-penalty', title: 'مبلغ جریمه به‌کارگیری اتباع بیگانه غیرمجاز', detail: PLAN_FEATURE_DETAILS['illegal-foreign-worker-penalty'], icon: 'account-alert-outline', route: '/home/illegal-foreign-worker-penalty', category: 'nonWage' },
    { key: 'article-87', title: 'مبلغ اعمال ماده ۸۷ قانون کار', detail: PLAN_FEATURE_DETAILS['article-87'], icon: 'file-document-edit-outline', route: '/home/article-87', category: 'nonWage' },
    { key: 'social-security-premium-ceiling', title: 'سقف حق بیمه تامین اجتماعی', detail: PLAN_FEATURE_DETAILS['social-security-premium-ceiling'], icon: 'shield-check-outline', route: '/home/social-security-premium-ceiling', category: 'nonWage' },
];
