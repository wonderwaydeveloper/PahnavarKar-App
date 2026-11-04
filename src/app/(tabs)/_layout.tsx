import { Typography } from '@/constants/typography';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { ColorValue } from 'react-native';

import { useAppContext } from '@/hooks/use-app-context';
import { useTheme } from '@/hooks/use-theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getAppFontStyle } from '@/services/font-service';

function getTabBarIcon(
    name: 'home' | 'search' | 'account',
    color: ColorValue,
    theme: { text: string },
    size: number,
) {
    const iconColor = typeof color === 'string' ? color : theme.text;

    switch (name) {
        case 'home':
            return <MaterialCommunityIcons name="home" color={iconColor} size={size} />;
        case 'search':
            return <MaterialCommunityIcons name="magnify" color={iconColor} size={size} />;
        case 'account':
            return <MaterialCommunityIcons name="account" color={iconColor} size={size} />;
        default:
            return null;
    }
}

function getTabBarLabel(name: 'home' | 'search' | 'account') {
    switch (name) {
        case 'home':
            return 'خانه';
        case 'search':
            return 'جستجو';
        case 'account':
            return 'پروفایل';
        default:
            return '';
    }
}

export default function TabsLayout() {
    const theme = useTheme();
    const { fontPreference, fontSizePreference } = useAppContext();
    const insets = useSafeAreaInsets();

    return (
        <Tabs
            screenOptions={({ route }) => ({
                headerShown: false,
                popToTopOnBlur: true,
                tabBarStyle: {
                    backgroundColor: theme.surface,
                    borderTopColor: theme.border,
                    height: 64 + insets.bottom,
                },
                tabBarActiveTintColor: theme.primary,
                tabBarInactiveTintColor: theme.textSecondary,
                tabBarLabelStyle: {
                    ...getAppFontStyle(
                        { fontFamily: 'AppFont-Medium', fontSize: Typography.fontSize.footnote },
                        fontPreference,
                        undefined,
                        fontSizePreference,
                    ),
                },
                tabBarIcon: ({ color, size }) =>
                    getTabBarIcon(route.name as 'home' | 'search' | 'account', color, theme, size),
                tabBarLabel: getTabBarLabel(route.name as 'home' | 'search' | 'account'),
            })}
        >
            <Tabs.Screen name="home" />
            <Tabs.Screen name="search" />
            <Tabs.Screen name="account" />
        </Tabs>
    );
}
