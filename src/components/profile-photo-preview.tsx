import { Image } from 'expo-image';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useMemo } from 'react';
import { Modal, Pressable, StatusBar, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { ZoomIn, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { Typography } from '@/constants/typography';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAppContext } from '@/hooks/use-app-context';

interface ProfilePhotoPreviewProps {
    uri: string | null;
    visible: boolean;
    onClose: () => void;
}

export function ProfilePhotoPreview({ uri, visible, onClose }: ProfilePhotoPreviewProps) {
    const colors = useTheme();

    return (
        <Modal
            animationType="fade"
            onRequestClose={onClose}
            statusBarTranslucent
            transparent={false}
            visible={visible && uri !== null}
        >
            <SafeAreaProvider style={[styles.modal, { backgroundColor: colors.scrim }]}>
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
    const foregroundColor = isLightTheme ? colors.surface : colors.text;
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
        <GestureHandlerRootView style={[styles.modal, { backgroundColor: colors.scrim }]}>
            <StatusBar barStyle="light-content" />
            <View style={{ height: insets.top }} />
            <View style={styles.topBar}>
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="بازگشت"
                    hitSlop={8}
                    onPress={onClose}
                    style={styles.backButton}
                >
                    <MaterialCommunityIcons name="chevron-right" size={24} color={foregroundColor} />
                </Pressable>
                <AppText
                    numberOfLines={1}
                    ellipsizeMode="tail"
                    style={[
                        styles.title,
                        {
                            color: foregroundColor,
                            fontSize: width >= 420 ? Typography.fontSize.bodyLarge : Typography.fontSize.bodySmall,
                            lineHeight: width >= 420 ? Typography.lineHeight.comfortable : Typography.lineHeight.label,
                        },
                    ]}
                >
                    تصویر
                </AppText>
            </View>
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
    modal: { flex: 1 },
    topBar: {
        flexDirection: 'row',
        direction: 'rtl',
        justifyContent: 'flex-start',
        alignItems: 'center',
        minHeight: 56,
        paddingHorizontal: Spacing.three,
    },
    backButton: {
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
        marginEnd: Spacing.two,
    },
    title: {
        flexShrink: 1,
        fontFamily: 'AppFont-Bold',
        textAlign: 'right',
    },
    previewContent: { flex: 1, minHeight: 0 },
    gestureArea: { flex: 1, overflow: 'hidden' },
});
