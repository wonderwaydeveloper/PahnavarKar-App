import { MaterialCommunityIcons } from '@expo/vector-icons';
import { type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type AccessibilityRole, type AccessibilityState } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { ToolDefinition } from '@/constants/tool-definitions';
import { useAppContext } from '@/hooks/use-app-context';
import { useTheme } from '@/hooks/use-theme';

interface ToolListItemProps {
    tool: ToolDefinition;
    onPress: () => void;
    titleContent?: ReactNode;
    detailContent?: ReactNode;
    trailingContent?: ReactNode;
    showBottomBorder?: boolean;
    compactIcon?: boolean;
    accessibilityRole?: AccessibilityRole;
    accessibilityState?: AccessibilityState;
}

export function ToolListItem({
    tool,
    onPress,
    titleContent,
    detailContent,
    trailingContent,
    showBottomBorder = false,
    compactIcon = false,
    accessibilityRole = 'button',
    accessibilityState,
}: ToolListItemProps) {
    const theme = useTheme();
    const { colors } = useAppContext();

    return (
        <Pressable
            onPress={onPress}
            style={({ pressed }) => [
                styles.item,
                {
                    backgroundColor: pressed ? theme.surfaceVariant : theme.surface,
                    borderBottomColor: theme.border,
                },
                showBottomBorder && styles.withBottomBorder,
            ]}
            accessibilityRole={accessibilityRole}
            accessibilityState={accessibilityState}
            accessibilityLabel={tool.title}
        >
            <View style={[
                styles.icon,
                compactIcon && styles.compactIcon,
                { backgroundColor: theme.primary, borderColor: theme.primary },
            ]}>
                <MaterialCommunityIcons name={tool.icon} size={compactIcon ? 20 : 23} color={colors.onPrimary} />
            </View>
            <View style={styles.textWrap}>
                {titleContent ?? (
                    <ThemedText type="smallBold" style={{ color: theme.text }}>
                        {tool.title}
                    </ThemedText>
                )}
                {detailContent ?? (
                    <ThemedText type="small" style={{ color: theme.textSecondary, fontSize: 13, lineHeight: 19 }}>
                        {tool.detail}
                    </ThemedText>
                )}
            </View>
            {trailingContent}
        </Pressable>
    );
}

const styles = StyleSheet.create({
    item: {
        minHeight: 84,
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.two,
        paddingHorizontal: Spacing.three,
        paddingVertical: Spacing.three,
    },
    withBottomBorder: {
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    icon: {
        width: 50,
        height: 50,
        borderRadius: 25,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    compactIcon: {
        width: 44,
        height: 44,
        borderRadius: 22,
    },
    textWrap: {
        flex: 1,
        minWidth: 0,
        gap: Spacing.one,
    },
});
