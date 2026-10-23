import { Stack } from 'expo-router';

import { AppHeader } from '@/components/app-header';

export default function AccountLayout() {
    return (
        <Stack
            screenOptions={({ route }) => ({
                header: () => <AppHeader route={route} />,
                headerShown: true,
            })}
        >
            <Stack.Screen name="index" options={{ title: 'پروفایل' }} />
            <Stack.Screen name="edit-profile" options={{ title: 'ویرایش پروفایل' }} />
            <Stack.Screen name="privacy-security" options={{ title: 'حریم خصوصی و امنیت' }} />
            <Stack.Screen name="settings" options={{ title: 'تنظیمات' }} />
            <Stack.Screen name="support" options={{ title: 'پشتیبانی' }} />
            <Stack.Screen name="about-us" options={{ title: 'درباره ما' }} />
            <Stack.Screen name="app-info" options={{ title: 'اطلاعات برنامه' }} />
        </Stack>
    );
}
