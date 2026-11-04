import { Typography } from '@/constants/typography';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export default function SupportScreen() {
    const theme = useTheme();

    return (
        <ThemedView style={styles.container}>
            <View style={[styles.card, { backgroundColor: theme.surface }]}>
                <ThemedText type="largeTitle">پشتیبانی</ThemedText>
                <ThemedText type="body" style={styles.subtitle}>در این صفحه اطلاعات تماس و فرم پشتیبانی در آینده اضافه خواهد شد.</ThemedText>
            </View>
        </ThemedView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, padding: Spacing.four, justifyContent: 'center' },
    card: { borderRadius: Radius.md, padding: Spacing.four, gap: Spacing.two },
    subtitle: { lineHeight: Typography.lineHeight.comfortable },
});
