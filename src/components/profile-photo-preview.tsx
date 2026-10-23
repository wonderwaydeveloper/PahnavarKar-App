import { Image } from 'expo-image';
import { useEffect, useMemo } from 'react';
import { Modal, StatusBar, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { ZoomIn, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Appbar } from 'react-native-paper';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { FontAwareAppbarContent } from '@/components/font-aware-paper';
import { Spacing } from '@/constants/theme';
import { useAppContext } from '@/hooks/use-app-context';

interface ProfilePhotoPreviewProps {
    uri: string | null;
    visible: boolean;
    onClose: () => void;
}

export function ProfilePhotoPreview({ uri, visible, onClose }: ProfilePhotoPreviewProps) {
    return (
        <Modal
            animationType="fade"
            onRequestClose={onClose}
            statusBarTranslucent
            transparent={false}
            visible={visible && uri !== null}
        >
            <SafeAreaProvider style={styles.modal}>
                <ProfilePhotoPreviewContent uri={uri} visible={visible} onClose={onClose} />
            </SafeAreaProvider>
        </Modal>
    );
}

function ProfilePhotoPreviewContent({ uri, visible, onClose }: ProfilePhotoPreviewProps) {
    const insets = useSafeAreaInsets();
    const { width } = useWindowDimensions();
    const { colors, theme } = useAppContext();
    const isLightTheme = theme === 'light';
    const headerBackgroundColor = isLightTheme ? colors.primary : colors.surface;
    const headerTextColor = isLightTheme ? colors.surface : colors.text;
    const scale = useSharedValue(1);
    const savedScale = useSharedValue(1);
    const translateX = useSharedValue(0);
    const translateY = useSharedValue(0);
    const savedTranslateX = useSharedValue(0);
    const savedTranslateY = useSharedValue(0);
    const previewWidth = useSharedValue(0);
    const previewHeight = useSharedValue(0);

    // Reanimated shared values are mutated by gesture worklets.
    /* eslint-disable react-hooks/immutability */
    const imageStyle = useAnimatedStyle(() => ({
        transform: [
            { translateX: translateX.value },
            { translateY: translateY.value },
            { scale: scale.value },
        ],
    }));

    const gestures = useMemo(() => {
        const pinch = Gesture.Pinch()
            .onUpdate((event) => {
                scale.value = Math.min(Math.max(savedScale.value * event.scale, 1), 4);
            })
            .onEnd(() => {
                savedScale.value = scale.value;

                if (scale.value === 1) {
                    translateX.value = withTiming(0);
                    translateY.value = withTiming(0);
                    savedTranslateX.value = 0;
                    savedTranslateY.value = 0;
                } else {
                    const maxX = (previewWidth.value * (scale.value - 1)) / 2;
                    const maxY = (previewHeight.value * (scale.value - 1)) / 2;
                    translateX.value = withTiming(Math.min(Math.max(translateX.value, -maxX), maxX));
                    translateY.value = withTiming(Math.min(Math.max(translateY.value, -maxY), maxY));
                    savedTranslateX.value = translateX.value;
                    savedTranslateY.value = translateY.value;
                }
            });

        const pan = Gesture.Pan()
            .minDistance(8)
            .onUpdate((event) => {
                if (scale.value <= 1) {
                    return;
                }

                const maxX = (previewWidth.value * (scale.value - 1)) / 2;
                const maxY = (previewHeight.value * (scale.value - 1)) / 2;
                translateX.value = Math.min(Math.max(savedTranslateX.value + event.translationX, -maxX), maxX);
                translateY.value = Math.min(Math.max(savedTranslateY.value + event.translationY, -maxY), maxY);
            })
            .onEnd(() => {
                savedTranslateX.value = translateX.value;
                savedTranslateY.value = translateY.value;
            });

        const doubleTap = Gesture.Tap()
            .numberOfTaps(2)
            .maxDuration(300)
            .onEnd(() => {
                const nextScale = scale.value > 1 ? 1 : 2.5;
                scale.value = withTiming(nextScale);
                savedScale.value = nextScale;
                translateX.value = withTiming(0);
                translateY.value = withTiming(0);
                savedTranslateX.value = 0;
                savedTranslateY.value = 0;
            });

        return Gesture.Simultaneous(pinch, pan, doubleTap);
    }, [
        previewHeight,
        previewWidth,
        savedScale,
        savedTranslateX,
        savedTranslateY,
        scale,
        translateX,
        translateY,
    ]);

    useEffect(() => {
        if (visible) {
            scale.value = 1;
            savedScale.value = 1;
            translateX.value = 0;
            translateY.value = 0;
            savedTranslateX.value = 0;
            savedTranslateY.value = 0;
        }
    }, [savedScale, savedTranslateX, savedTranslateY, scale, translateX, translateY, visible]);
    /* eslint-enable react-hooks/immutability */

    return (
        <GestureHandlerRootView style={styles.modal}>
            <StatusBar
                hidden={false}
                barStyle={isLightTheme ? 'dark-content' : 'light-content'}
                backgroundColor={headerBackgroundColor}
            />
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
                <View style={styles.appBarContentRow}>
                    <Appbar.Action
                        accessibilityLabel="بستن پیش‌نمایش"
                        icon="close"
                        color={headerTextColor}
                        onPress={onClose}
                        size={22}
                        style={styles.appBarAction}
                    />
                    <FontAwareAppbarContent
                        title="پیش‌نمایش تصویر پروفایل"
                        color={headerTextColor}
                        titleStyle={[
                            styles.appBarTitle,
                            {
                                fontSize: width >= 420 ? 16 : 14,
                                lineHeight: (width >= 420 ? 16 : 14) + 8,
                            },
                        ]}
                        titleMaxFontSizeMultiplier={1.2}
                    />
                </View>
            </Appbar.Header>
            <Animated.View entering={ZoomIn.duration(220)} style={styles.previewContent}>
                <GestureDetector gesture={gestures}>
                    <View
                        style={styles.gestureArea}
                        onLayout={(event) => {
                            // These dimensions are read only by Reanimated gesture worklets.
                            // eslint-disable-next-line react-hooks/immutability
                            previewWidth.value = event.nativeEvent.layout.width;
                            // These dimensions are read only by Reanimated gesture worklets.
                            // eslint-disable-next-line react-hooks/immutability
                            previewHeight.value = event.nativeEvent.layout.height;
                        }}
                    >
                        <Animated.View style={[StyleSheet.absoluteFill, imageStyle]}>
                            {uri ? (
                                <Image
                                    source={{ uri }}
                                    contentFit="contain"
                                    style={StyleSheet.absoluteFill}
                                />
                            ) : null}
                        </Animated.View>
                    </View>
                </GestureDetector>
            </Animated.View>
        </GestureHandlerRootView>
    );
}

const styles = StyleSheet.create({
    modal: { flex: 1, backgroundColor: '#05080B' },
    appBar: {
        elevation: 4,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
        paddingHorizontal: Spacing.two,
    },
    appBarContentRow: {
        flex: 1,
        flexDirection: 'row',
        direction: 'ltr',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    appBarAction: { width: 40, marginHorizontal: 0 },
    appBarTitle: { fontFamily: 'AppFont-Bold', textAlign: 'right' },
    previewContent: { flex: 1 },
    gestureArea: { flex: 1, overflow: 'hidden' },
});
