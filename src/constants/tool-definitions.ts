import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

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
    { key: 'yearly-info', title: 'اطلاعات جامع مزدی از سال ۱۳۶۹ تاکنون', detail: 'جزئیاتی جامع از مصوبات شورای عالی کار از سال ۱۳۶۹ تاکنون', icon: 'calendar-range', accent: '#4338CA', route: '/home/yearly-info', category: 'yearlyInfo' },
    { key: 'base-salary', title: 'حقوق پایه', detail: 'محاسبه حقوق پایه و نمایش جزئیات آن', icon: 'calculator-variant', accent: '#047857', route: '/home/base-salary', category: 'wageContinuous' },
    { key: 'entitled-seniority', title: 'پایه سنوات استحقاقی', detail: 'محاسبه پایه سنوات بر اساس تاریخ استخدام، تصفیه حساب تا پایان ۱۳۹۱ و طرح طبقه‌بندی مشاغل', icon: 'cash-plus', accent: '#0F766E', route: '/home/entitled-seniority', category: 'wageContinuous' },
    { key: 'housing-allowance', title: 'حق مسکن', detail: 'محاسبه حق مسکن ماهیانه موضوع مصوبه هیات وزیران به تناسب بازه زمانی انتخابی', icon: 'home-city', accent: '#1D4ED8', route: '/home/housing-allowance', category: 'wageContinuous' },
    { key: 'monthly-allowance', title: 'بن کارگری', detail: 'محاسبه بن کارگری مصوبه شورای عالی کار به تناسب بازه زمانی انتخابی', icon: 'cash-multiple', accent: '#6D28D9', route: '/home/monthly-allowance', category: 'wageContinuous' },
    { key: 'spousal-allowance', title: 'حق تاهل', detail: 'محاسبه حق تاهل براساس تصریح مصوبات شورای عالی کار از سال ۱۴۰۳', icon: 'heart-outline', accent: '#BE123C', route: '/home/spousal-allowance', category: 'wageContinuous' },
    { key: 'family-allowance', title: 'حق عائله مندی', detail: 'محاسبه حق عائله مندی براساس بند۲ماده ۸۶قانون تامین اجتماعی', icon: 'family-tree', accent: '#B45309', route: '/home/family-allowance', category: 'wageContinuous' },
    { key: 'unemployment-insurance-allowance', title: 'مبلغ مقرری بیمه بیکاری', detail: 'محاسبه مقرری بیمه بیکاری براساس بند ب ماده ۷ قانون بیمه بیکاری', icon: 'cash-clock', accent: '#0F766E', route: '/home/unemployment-insurance-allowance', category: 'wageContinuous' },
    { key: 'overtime-entitlement', title: 'اضافه کاری', detail: 'محاسبه فوق‌العاده اضافه‌کاری براساس شرح ماده ۵۹ قانون کار', icon: 'clock-alert-outline', accent: '#C2410C', route: '/home/overtime-entitlement', category: 'wageNonContinuous' },
    { key: 'night-shift-entitlement', title: 'شب کاری', detail: 'محاسبه فوق‌العاده شب‌کاری براساس شرح ماده ۵۸ قانون کار', icon: 'weather-night', accent: '#0369A1', route: '/home/night-shift-entitlement', category: 'wageNonContinuous' },
    { key: 'monthly-shift-work', title: 'نوبت‌کاری', detail: 'محاسبه نوبت‌کاری موضوع ماده ۵۵ قانون کار بر اساس ماده ۵۶ قانون کار', icon: 'calendar-clock', accent: '#0F766E', route: '/home/monthly-shift-work', category: 'wageNonContinuous' },
    { key: 'minimum-bonus', title: 'حداقل عیدی و پاداش', detail: 'محاسبه حداقل عیدی و پاداش ماهیانه براساس ماده واحده قانون تعیین عیدی و پاداش، مصوب مجلس در سال ۱۳۷۰', icon: 'gift-outline', accent: '#B91C1C', route: '/home/minimum-bonus', category: 'wageNonContinuous' },
    { key: 'maximum-bonus', title: 'حداکثر عیدی و پاداش', detail: 'محاسبه حداکثر عیدی و پاداش ماهیانه براساس ماده واحده قانون تعیین عیدی و پاداش، مصوب مجلس در سال ۱۳۷۰', icon: 'gift', accent: '#9D174D', route: '/home/maximum-bonus', category: 'wageNonContinuous' },
    { key: 'bonus-entitlement', title: 'عیدی و پاداش استحقاقی', detail: 'محاسبه عیدی و پاداش ماهیانه بر اساس ماده واحده قانون تعیین عیدی و پاداش، مصوب مجلس در سال ۱۳۷۰', icon: 'gift-open-outline', accent: '#9F1239', route: '/home/bonus-entitlement', category: 'wageNonContinuous' },
    { key: 'end-of-service-years', title: 'سنوات پایان کار', detail: 'محاسبه سنوات پایان کار براساس ماده ۲۴ قانون کار', icon: 'briefcase-clock', accent: '#0F766E', route: '/home/end-of-service-years', category: 'wageNonContinuous' },
    { key: 'unused-leave-wage', title: 'مزد مرخصی ذخیره شده کارگر', detail: 'محاسبه مزد مرخصی ذخیره شده کارگر بر اساس آخرین ماه کارکرد', icon: 'cash-clock', accent: '#0E7490', route: '/home/unused-leave-wage', category: 'wageNonContinuous' },
    { key: 'official-holiday-work', title: 'مبلغ تعطیل کاری', detail: 'محاسبه مبلغ تعطیل‌کاری‌های مندرج در ماده ۶۳ قانون کار بر اساس پایه سنوات هر دوره', icon: 'calendar-star', accent: '#C2410C', route: '/home/official-holiday-work', category: 'wageNonContinuous' },
    { key: 'suspension-wage', title: 'حق‌السعی ایام تعلیق', detail: 'محاسبه حق‌السعی ایام تعلیق موضوع ماده ۳۴ قانون کار و ماده ۶۷ آیین دادرسی کار', icon: 'scale-balance', accent: '#0F766E', route: '/home/suspension-wage', category: 'wageNonContinuous' },
    { key: 'mission-allowance', title: 'فوق‌العاده مأموریت', detail: 'محاسبه حداقل مبلغ فوق‌العاده مأموریت براساس ماده ۴۶ قانون کار', icon: 'airplane', accent: '#0369A1', route: '/home/mission-allowance', category: 'wageNonContinuous' },
    { key: 'friday-work', title: 'جمعه کاری', detail: 'محاسبه مزد جمعه‌کاری‌های انجام‌شده براساس ماده ۶۲ قانون کار', icon: 'calendar-star', accent: '#B45309', route: '/home/friday-work', category: 'wageNonContinuous' },
    { key: 'unused-leave-entitlement', title: 'میزان مرخصی ذخیره شده کارگر', detail: 'محاسبه تعداد مرخصی ذخیره شده کارگر براساس مواد ۶۴ و ۶۹ قانون کار', icon: 'calendar-clock', accent: '#BE123C', route: '/home/unused-leave-entitlement', category: 'nonWage' },
    { key: 'insurance-days-entitlement', title: 'تعداد روزهای بیمه استحقاقی', detail: 'محاسبه تعداد روزهای بیمه موضوع مفاد مواد ۳۹ و ۱۴۸ قانون کار', icon: 'shield-check', accent: '#15803D', route: '/home/insurance-days-entitlement', category: 'nonWage' },
    { key: 'unemployment-insurance-entitlement', title: 'مدت زمان پرداخت مقرری بیمه بیکاری', detail: 'محاسبه مدت زمان استحقاق دریافت مقرری بیمه بیکاری براساس ماده ۷ قانون بیمه بیکاری', icon: 'briefcase-account', accent: '#0369A1', route: '/home/unemployment-insurance-entitlement', category: 'nonWage' },
    { key: 'ordinary-work-hours', title: 'کارکرد موظفی کارگر در مشاغل عادی', detail: 'محاسبه میزان ساعات کارکرد موظفی کارگر در مشاغل عادی طبق ماده ۵۱ قانون کار', icon: 'calendar-check-outline', accent: '#0E7490', route: '/home/ordinary-work-hours', category: 'nonWage' },
    { key: 'hazardous-work-hours', title: 'کارکرد موظفی کارگر در مشاغل سخت و زیان‌آور', detail: 'تعیین ساعات کارکرد موظفی کارگر طبق ماده ۵۲ قانون کار', icon: 'hard-hat', accent: '#B45309', route: '/home/hazardous-work-hours', category: 'nonWage' },
    { key: 'young-worker-work-hours', title: 'کارکرد موظفی کارگر نوجوان', detail: 'تعیین ساعات کارکرد کارگر نوجوان طبق ماده ۸۰ قانون کار', icon: 'account-child', accent: '#9F1239', route: '/home/young-worker-work-hours', category: 'nonWage' },
    { key: 'official-holidays-in-range', title: 'تعداد تعطیلات رسمی در بازه زمانی انتخاب شده', detail: 'تعیین تعداد روزهای تعطیل موضوع ماده ۶۳ قانون کار بر اساس تقویم رسمی کشور؛ جمعه‌کاری تعطیل‌کاری محسوب نمی‌شود', icon: 'calendar-check-outline', accent: '#0E7490', route: '/home/official-holidays-in-range', category: 'nonWage' },
    { key: 'illegal-foreign-worker-penalty', title: 'مبلغ جریمه به‌کارگیری اتباع بیگانه غیرمجاز', detail: 'محاسبه جریمه به‌کارگیری اتباع بیگانه غیرمجاز بر اساس تعداد کارگران، روزهای بازه و حداقل مزد همان سال', icon: 'account-alert-outline', accent: '#B91C1C', route: '/home/illegal-foreign-worker-penalty', category: 'nonWage' },
    { key: 'article-87', title: 'مبلغ اعمال ماده ۸۷ قانون کار', detail: 'محاسبه مبلغ اعمال ماده ۸۷ قانون کار برای صدور پروانه کسب یا بهره‌برداری بر اساس متراژ زیربنا', icon: 'file-document-edit-outline', accent: '#0369A1', route: '/home/article-87', category: 'nonWage' },
    { key: 'social-security-premium-ceiling', title: 'سقف حق بیمه تامین اجتماعی', detail: 'محاسبه سقف حق بیمه براساس حداقل مزد مصوب شورای عالی کار و تعداد روزهای ماه انتخابی', icon: 'shield-check-outline', accent: '#047857', route: '/home/social-security-premium-ceiling', category: 'nonWage' },
];
