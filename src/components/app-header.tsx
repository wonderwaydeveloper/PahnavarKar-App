import { useAppContext } from '@/hooks/use-app-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useGlobalSearchParams, usePathname, useRouter } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Animated, useWindowDimensions, View, type TextStyle } from 'react-native';
import { Appbar } from 'react-native-paper';

import { ThemedText } from '@/components/themed-text';
import { TOOL_DEFINITIONS } from '@/constants/tool-definitions';

interface AppHeaderProps {
  route?: { name?: string };
  formatYear?: (value: number | string | null | undefined) => string;
  selectedYear?: { year: number | string } | null;
  centerContent?: ReactNode;
}

const HOME_HEADER_TITLES = ['پهناور کار', 'در خدمت جامعه ی کار'];

function RotatingTitle({ titles, style }: { titles: string[]; style: TextStyle }) {
  const [titleIndex, setTitleIndex] = useState(0);
  const [opacity] = useState(() => new Animated.Value(0));
  const [translateY] = useState(() => new Animated.Value(-10));

  useEffect(() => {
    let titleTimeout: ReturnType<typeof setTimeout>;

    const animateTitleIn = () => {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 350,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: 350,
          useNativeDriver: true,
        }),
      ]).start();
    };

    const showNextTitle = () => {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 10,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (!finished) return;

        setTitleIndex((currentIndex) => (currentIndex + 1) % titles.length);
        translateY.setValue(-10);
        animateTitleIn();
        titleTimeout = setTimeout(showNextTitle, 2600);
      });
    };

    animateTitleIn();
    titleTimeout = setTimeout(showNextTitle, 2600);

    return () => {
      clearTimeout(titleTimeout);
      opacity.stopAnimation();
      translateY.stopAnimation();
    };
  }, [opacity, titles.length, translateY]);

  return (
    <Animated.View style={{ opacity, transform: [{ translateY }] }}>
      <ThemedText
        accessibilityLabel={titles.join('، ')}
        numberOfLines={1}
        ellipsizeMode="tail"
        style={style}
      >
        {titles[titleIndex]}
      </ThemedText>
    </Animated.View>
  );
}

export function AppHeader({ route, formatYear, selectedYear, centerContent }: AppHeaderProps) {
  const { colors, theme: appTheme } = useAppContext();
  const pathname = usePathname();
  const { headerTitle: rawHeaderTitle } = useGlobalSearchParams<{ headerTitle?: string | string[] }>();
  const isLightTheme = appTheme === 'light';
  const headerBackgroundColor = isLightTheme ? colors.primary : colors.surface;
  const titleColor = isLightTheme ? colors.surface : colors.text;

  const normalizeRoute = (input?: string) => {
    const value = input ?? pathname ?? route?.name ?? 'home';
    const cleaned = value.replace(/^\/+|\/+$/g, '');
    const segments = cleaned ? cleaned.split('/') : ['home'];
    const rulesIndex = segments.lastIndexOf('rules');
    if (rulesIndex >= 0 && segments[rulesIndex + 1] && segments[rulesIndex + 1] !== 'index') {
      return segments[rulesIndex + 1];
    }
    return segments[segments.length - 1] || 'home';
  };

  const getHeaderConfig = (routeName: string) => {
    const normalized = normalizeRoute(routeName);

    switch (normalized) {
      case 'account':
        return { title: 'پروفایل' };
      case 'edit-profile':
        return { title: 'ویرایش پروفایل' };
      case 'settings':
        return { title: 'تنظیمات' };
      case 'support':
        return { title: 'پشتیبانی' };
      case 'about-us':
        return { title: 'درباره ما' };
      case 'category':
        return { title: 'دستهٔ قوانین و مقررات' };
      case 'title':
        return { title: 'عنوان قانونی' };
      case 'chapter':
        return { title: 'فصل' };
      case 'topic':
        return { title: 'مبحث' };
      case 'article':
        return { title: 'ماده و تبصره‌ها' };
      case 'app-info':
        return { title: 'اطلاعات برنامه' };
      case 'yearly-info':
        return { title: 'اطلاعات جامع مزدی از سال ۱۳۶۹ تاکنون' };
      case 'group-calculation':
        return { title: 'محاسبات جامع' };
      case 'base-salary':
        return { title: 'حقوق پایه' };
      case 'family-allowance':
        return { title: 'حق عائله مندی' };
      case 'housing-allowance':
        return { title: 'حق مسکن' };
      case 'monthly-allowance':
        return { title: 'بن کارگری' };
      case 'minimum-bonus':
        return { title: 'حداقل عیدی و پاداش' };
      case 'maximum-bonus':
        return { title: 'حداکثر عیدی و پاداش' };
      case 'bonus-entitlement':
        return { title: 'عیدی و پاداش استحقاقی' };
      case 'spousal-allowance':
        return { title: 'حق تاهل' };
      case 'monthly-shift-work':
        return { title: 'نوبت‌کاری' };
      case 'overtime-entitlement':
        return { title: 'اضافه کاری' };
      case 'night-shift-entitlement':
        return { title: 'شب کاری' };
      case 'insurance-days-entitlement':
        return { title: 'تعداد روزهای بیمه استحقاقی' };
      case 'unemployment-insurance-entitlement':
        return { title: 'مدت زمان پرداخت مقرری بیمه بیکاری' };
      case 'unemployment-insurance-allowance':
        return { title: 'مبلغ مقرری بیمه بیکاری' };
      case 'unused-leave-entitlement':
        return { title: 'میزان مرخصی ذخیره شده کارگر' };
      case 'unused-leave-wage':
        return { title: 'مزد مرخصی ذخیره شده کارگر' };
      case 'suspension-wage':
        return { title: 'حق‌السعی ایام تعلیق' };
      case 'end-of-service-years':
        return { title: 'سنوات پایان کار' };
      case 'entitled-seniority':
        return { title: 'پایه سنوات استحقاقی' };
      case 'mission-allowance':
        return { title: 'فوق‌العاده مأموریت' };
      case 'friday-work':
        return { title: 'جمعه کاری' };
      case 'official-holiday-work':
        return { title: 'مبلغ تعطیل کاری' };
      case 'official-holidays-in-range':
        return { title: 'تعداد تعطیلات رسمی در بازه زمانی انتخاب شده' };
      case 'illegal-foreign-worker-penalty':
        return { title: 'مبلغ جریمه به‌کارگیری اتباع بیگانه غیرمجاز' };
      case 'article-87':
        return { title: 'مبلغ اعمال ماده ۸۷ قانون کار' };
      case 'social-security-premium-ceiling':
        return { title: 'سقف حق بیمه تامین اجتماعی' };
      case 'ordinary-work-hours':
        return { title: 'کارکرد موظفی کارگر در مشاغل عادی' };
      case 'hazardous-work-hours':
        return { title: 'کارکرد موظفی کارگر در مشاغل سخت و زیان‌آور' };
      case 'young-worker-work-hours':
        return { title: 'کارکرد موظفی کارگر نوجوان' };
      case 'home':
      case 'index':
      default:
        return { title: 'پهناور کار' };
    }
  };

  const router = useRouter();
  const actualRouteName = normalizeRoute(pathname || route?.name);
  const routeTitle = getHeaderConfig(actualRouteName).title;
  const hasLegalRouteTitle = ['category', 'title', 'chapter', 'topic', 'article'].includes(actualRouteName);
  const title = hasLegalRouteTitle && typeof rawHeaderTitle === 'string' && rawHeaderTitle.trim()
    ? rawHeaderTitle
    : routeTitle;
  const isHomeRoute = actualRouteName === 'home' || actualRouteName === 'index';
  const activeTool = TOOL_DEFINITIONS.find((tool) => tool.key === actualRouteName);
  const showBackButton = ['edit-profile', 'settings', 'support', 'about-us', 'app-info', 'yearly-info', 'group-calculation', 'base-salary', 'family-allowance', 'housing-allowance', 'monthly-allowance', 'minimum-bonus', 'maximum-bonus', 'bonus-entitlement', 'spousal-allowance', 'monthly-shift-work', 'overtime-entitlement', 'night-shift-entitlement', 'insurance-days-entitlement', 'unemployment-insurance-entitlement', 'unemployment-insurance-allowance', 'unused-leave-entitlement', 'unused-leave-wage', 'suspension-wage', 'end-of-service-years', 'entitled-seniority', 'mission-allowance', 'friday-work', 'official-holiday-work', 'official-holidays-in-range', 'illegal-foreign-worker-penalty', 'article-87', 'social-security-premium-ceiling', 'ordinary-work-hours', 'hazardous-work-hours', 'young-worker-work-hours', 'category', 'title', 'chapter', 'topic', 'article'].includes(actualRouteName);
  const shouldAlignSecondaryHeaderStart = showBackButton && !centerContent;

  const { width } = useWindowDimensions();
  const titleFontSize = showBackButton
    ? width >= 420 ? 16 : 14
    : width >= 420 ? 18 : 16;

  return (
    <Appbar.Header
      style={{
        backgroundColor: headerBackgroundColor,
        elevation: 4,
        shadowColor: colors.text,
        shadowOpacity: isLightTheme ? 0.16 : 0.08,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
      }}
    >
      {showBackButton ? (
        <Appbar.Action
          icon={'chevron-right'}
          color={titleColor}
          onPress={() => router.back()}
          size={24}
          style={{ width: 40, marginHorizontal: 0 }}
        />
      ) : null}
      <View
        pointerEvents={centerContent ? 'auto' : 'none'}
        style={{
          ...(shouldAlignSecondaryHeaderStart
            ? {
              flex: 1,
              justifyContent: 'center',
              marginStart: 0,
            }
            : {
              position: 'absolute',
              left: 0,
              right: 0,
              top: 0,
              bottom: 0,
              alignItems: 'center',
            }),
          justifyContent: 'center',
          paddingHorizontal: shouldAlignSecondaryHeaderStart ? 0 : centerContent ? 12 : 56,
        }}
      >
        {centerContent ? (
          <View style={{ width: '100%' }}>{centerContent}</View>
        ) : (
          <View
            style={{
              width: '100%',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: shouldAlignSecondaryHeaderStart ? 'flex-start' : 'center',
              gap: 8,
            }}
          >
            {activeTool ? (
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: colors.primaryContainer,
                  borderColor: colors.border,
                  borderWidth: 1,
                }}
              >
                <MaterialCommunityIcons
                  name={activeTool.icon}
                  size={18}
                  color={colors.primaryText}
                />
              </View>
            ) : null}
            {isHomeRoute ? (
              <RotatingTitle
                titles={HOME_HEADER_TITLES}
                style={{
                  flexShrink: 1,
                  minWidth: 0,
                  maxWidth: '100%',
                  fontSize: titleFontSize,
                  lineHeight: titleFontSize + 8,
                  fontFamily: 'AppFont-Bold',
                  color: titleColor,
                  textAlign: shouldAlignSecondaryHeaderStart ? 'right' : 'center',
                }}
              />
            ) : (
              <ThemedText
                numberOfLines={1}
                ellipsizeMode="tail"
                style={{
                flexShrink: 1,
                minWidth: 0,
                maxWidth: '100%',
                fontSize: titleFontSize,
                lineHeight: titleFontSize + 8,
                fontFamily: 'AppFont-Bold',
                color: titleColor,
                textAlign: shouldAlignSecondaryHeaderStart ? 'right' : 'center',
              }}
              >
                {title}
              </ThemedText>
            )}
          </View>
        )}
      </View>
    </Appbar.Header>
  );
}
