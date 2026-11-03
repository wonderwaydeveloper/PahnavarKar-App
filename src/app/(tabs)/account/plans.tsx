import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { useTheme } from '@/hooks/use-theme';

const destinations = [
    {
        key: 'plan-catalog',
        title: 'خرید اشتراک | ارتقاء پلن',
        subtitle: 'مقایسهٔ امکانات و انتخاب یا ارتقای پلن',
        icon: 'view-grid-outline' as const,
        route: '/(tabs)/account/plan-catalog',
    },
    {
        key: 'purchased-plans',
        title: 'پلن‌های من',
        subtitle: 'مشاهدهٔ پلن فعال، رزروشده و سوابق خرید',
        icon: 'crown-outline' as const,
        route: '/(tabs)/account/purchased-plans',
    },
] as const;

export default function PlansScreen() {
    const theme = useTheme();
    const router = useRouter();
    const { user } = useAuth();

    return (
        <ThemedView style={styles.container}>
            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                {destinations.map((destination) => (
                    <Pressable
                        key={destination.key}
                        accessibilityRole="button"
                        accessibilityLabel={`${destination.title}؛ ${destination.subtitle}`}
                        onPress={() => router.push(
                            destination.key === 'purchased-plans' && !user
                                ? '/auth?returnTo=plans'
                                : destination.route,
                        )}
                        style={({ pressed }) => [
                            styles.destination,
                            {
                                backgroundColor: destination.key === 'plan-catalog' ? theme.primary : theme.surface,
                                borderColor: destination.key === 'plan-catalog' ? theme.primary : theme.border,
                                opacity: pressed ? 0.78 : 1,
                            },
                        ]}
                    >
                        <View style={[styles.iconWrap, { backgroundColor: theme.primaryContainer }]}>
                            <MaterialCommunityIcons
                                name={destination.icon}
                                size={23}
                                color={theme.primaryText}
                            />
                        </View>
                        <View style={styles.copy}>
                            <ThemedText
                                type={destination.key === 'plan-catalog' ? 'bodyBold' : 'smallBold'}
                                style={destination.key === 'plan-catalog' ? { color: theme.onPrimary } : undefined}
                            >
                                {destination.title}
                            </ThemedText>
                            <ThemedText
                                type="small"
                                style={{ color: destination.key === 'plan-catalog' ? theme.onPrimary : theme.textSecondary }}
                            >
                                {destination.subtitle}
                            </ThemedText>
                        </View>
                        <MaterialCommunityIcons
                            name="chevron-left"
                            size={22}
                            color={destination.key === 'plan-catalog' ? theme.onPrimary : theme.textSecondary}
                        />
                    </Pressable>
                ))}
            </ScrollView>
        </ThemedView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    content: { padding: Spacing.three, gap: Spacing.two },
    destination: {
        minHeight: 82,
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.two,
        borderWidth: 1,
        borderRadius: Radius.lg,
        padding: Spacing.two,
    },
    iconWrap: {
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: Radius.md,
    },
    copy: { flex: 1, gap: Spacing.half },
});
