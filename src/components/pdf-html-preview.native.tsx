import { Typography } from '@/constants/typography';
import { ActivityIndicator, Modal, Pressable, StatusBar, StyleSheet, View } from 'react-native';
import { Appbar } from 'react-native-paper';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { FontAwareAppbarContent } from '@/components/font-aware-paper';
import { PRODUCT_COLOR_TOKENS, Spacing } from '@/constants/theme';
import { useAppContext } from '@/hooks/use-app-context';
import { ThemedText } from '@/components/themed-text';

import type { PdfHtmlPreviewProps } from './pdf-html-preview.types';

function PdfPreviewActionButton({
    label,
    icon,
    onPress,
    loading,
    disabled,
    primaryColor,
    surfaceColor,
    borderColor,
    contained = false,
}: {
    label: string;
    icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
    onPress: () => void;
    loading: boolean;
    disabled: boolean;
    primaryColor: string;
    surfaceColor: string;
    borderColor: string;
    contained?: boolean;
}) {
    const contentColor = contained ? surfaceColor : primaryColor;

    return (
        <Pressable
            onPress={onPress}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityState={{ disabled, busy: loading }}
            style={({ pressed }) => [
                styles.actionButton,
                {
                    backgroundColor: contained ? primaryColor : 'transparent',
                    borderColor: contained ? primaryColor : borderColor,
                    opacity: disabled && !loading ? 0.55 : pressed ? 0.8 : 1,
                },
            ]}
        >
            <View style={styles.actionButtonContent}>
                {loading ? (
                    <ActivityIndicator size={16} color={contentColor} />
                ) : (
                    <MaterialCommunityIcons name={icon} size={18} color={contentColor} />
                )}
                <ThemedText
                    type="smallBold"
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.8}
                    style={[styles.actionButtonLabel, { color: contentColor }]}
                >
                    {label}
                </ThemedText>
            </View>
        </Pressable>
    );
}

export function PdfHtmlPreview({
    visible,
    html,
    action,
    onClose,
    onShare,
    onSave,
}: PdfHtmlPreviewProps) {
    return (
        <Modal
            visible={visible}
            animationType="slide"
            onRequestClose={onClose}
            statusBarTranslucent
        >
            <SafeAreaProvider style={styles.container}>
                <PdfHtmlPreviewContent
                    html={html}
                    action={action}
                    onClose={onClose}
                    onShare={onShare}
                    onSave={onSave}
                />
            </SafeAreaProvider>
        </Modal>
    );
}

function PdfHtmlPreviewContent({
    html,
    action,
    onClose,
    onShare,
    onSave,
}: Omit<PdfHtmlPreviewProps, 'visible'>) {
    const { colors, theme } = useAppContext();
    const insets = useSafeAreaInsets();
    const isLightTheme = theme === 'light';
    const headerBackgroundColor = isLightTheme ? colors.primary : colors.surface;
    const headerTextColor = isLightTheme ? colors.surface : colors.text;
    const previewHtml = html?.replace(
        '</head>',
        '<style>body { padding: 12px; }</style></head>',
    );

    return (
        <>
            <StatusBar
                hidden={false}
                barStyle="light-content"
            />
            <View style={[styles.container, { backgroundColor: colors.background }]}>
                <View style={{ height: insets.top, backgroundColor: headerBackgroundColor }} />
                <Appbar.Header
                    statusBarHeight={0}
                    style={[
                        styles.appBar,
                        {
                            backgroundColor: headerBackgroundColor,
                            shadowColor: colors.text,
                            shadowOpacity: isLightTheme ? 0.16 : 0.08,
                        },
                    ]}
                >
                    <Appbar.Action
                        icon="chevron-right"
                        color={headerTextColor}
                        onPress={onClose}
                        size={24}
                        style={styles.appBarAction}
                        accessibilityLabel="بازگشت از پیش‌نمایش"
                    />
                    <FontAwareAppbarContent
                        title="پیش‌نمایش فیش PDF"
                        color={headerTextColor}
                        titleStyle={styles.appBarTitle}
                        titleMaxFontSizeMultiplier={1.2}
                    />
                    <Appbar.Action
                        icon="close"
                        color={headerTextColor}
                        onPress={onClose}
                        size={22}
                        style={styles.appBarAction}
                        accessibilityLabel="بستن پیش‌نمایش"
                    />
                </Appbar.Header>
                <View
                    style={[
                        styles.content,
                        {
                            paddingTop: Spacing.two,
                            paddingBottom: insets.bottom + Spacing.two,
                        },
                    ]}
                >
                    <View style={[styles.previewFrame, { borderColor: colors.border }]}>
                        {html ? (
                            <WebView
                                originWhitelist={['*']}
                                source={{ html: previewHtml ?? '' }}
                                style={styles.webView}
                                backgroundColor={PRODUCT_COLOR_TOKENS.pdfCanvas}
                                javaScriptEnabled={false}
                                domStorageEnabled={false}
                                setSupportMultipleWindows={false}
                                showsVerticalScrollIndicator
                            />
                        ) : null}
                    </View>
                    <View style={styles.actions}>
                        <View style={styles.actionItem}>
                            <PdfPreviewActionButton
                                label="اشتراک‌گذاری"
                                icon="share-variant"
                                onPress={onShare}
                                loading={action === 'share'}
                                disabled={action !== null}
                                primaryColor={colors.primary}
                                surfaceColor={colors.surface}
                                borderColor={colors.borderStrong}
                                contained
                            />
                        </View>
                        <View style={styles.actionItem}>
                            <PdfPreviewActionButton
                                label="دانلود"
                                icon="download"
                                onPress={onSave}
                                loading={action === 'save'}
                                disabled={action !== null}
                                primaryColor={colors.primary}
                                surfaceColor={colors.surface}
                                borderColor={colors.borderStrong}
                            />
                        </View>
                    </View>
                </View>
            </View>
        </>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    appBar: {
        elevation: 4,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
    },
    appBarAction: { width: 40, marginHorizontal: 0 },
    appBarTitle: { fontFamily: 'AppFont-Bold', fontSize: Typography.fontSize.bodySmall, lineHeight: Typography.lineHeight.label },
    content: { flex: 1, paddingHorizontal: Spacing.three, gap: Spacing.two },
    previewFrame: { flex: 1, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderRadius: 10 },
    webView: { flex: 1, backgroundColor: PRODUCT_COLOR_TOKENS.pdfCanvas },
    actions: { flexDirection: 'row', gap: Spacing.two },
    actionItem: { flex: 1, minWidth: 0 },
    actionButton: { minHeight: 48, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, justifyContent: 'center', paddingHorizontal: Spacing.one },
    actionButtonContent: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.one },
    actionButtonLabel: { flexShrink: 1, minWidth: 0, textAlign: 'center' },
});
