import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
    cancelAnimation,
    Easing,
    runOnJS,
    useAnimatedStyle,
    useReducedMotion,
    useSharedValue,
    withDelay,
    withTiming,
} from 'react-native-reanimated';

import { AppText } from '@/components/app-text';
import { useAppContext } from '@/hooks/use-app-context';

const STARTUP_ANIMATION_DURATION = 2000;
const STARTUP_DISPLAY_DURATION = 1000;
const REDUCED_MOTION_DISPLAY_DURATION = 1000;
const STARTUP_FADE_DURATION = 500;
const LOGO_ANIMATION_DURATION = 560;
const RING_ANIMATION_DURATION = 1000;

interface StartupLogoAnimationProps {
    startAnimation: boolean;
    onComplete: () => void;
}

export function StartupLogoAnimation({ startAnimation, onComplete }: StartupLogoAnimationProps) {
    const { colors, theme } = useAppContext();
    const reduceMotion = useReducedMotion();
    const [brandNameWidth, setBrandNameWidth] = useState(0);
    const logoProgress = useSharedValue(0);
    const firstRingProgress = useSharedValue(0);
    const secondRingProgress = useSharedValue(0);
    const overlayProgress = useSharedValue(1);

    useEffect(() => {
        if (!startAnimation) return;

        if (reduceMotion) {
            const finishTimer = setTimeout(onComplete, REDUCED_MOTION_DISPLAY_DURATION);
            return () => clearTimeout(finishTimer);
        }

        const finishTimer = setTimeout(() => {
            overlayProgress.value = withTiming(0, { duration: STARTUP_FADE_DURATION }, (finished) => {
                if (finished) runOnJS(onComplete)();
            });
        }, STARTUP_ANIMATION_DURATION + STARTUP_DISPLAY_DURATION);

        logoProgress.value = withDelay(
            90,
            withTiming(1, { duration: LOGO_ANIMATION_DURATION, easing: Easing.out(Easing.cubic) }),
        );
        firstRingProgress.value = withTiming(1, {
            duration: RING_ANIMATION_DURATION,
            easing: Easing.out(Easing.cubic),
        });
        secondRingProgress.value = withDelay(
            190,
            withTiming(1, { duration: RING_ANIMATION_DURATION, easing: Easing.out(Easing.cubic) }),
        );

        return () => {
            clearTimeout(finishTimer);
            cancelAnimation(logoProgress);
            cancelAnimation(firstRingProgress);
            cancelAnimation(secondRingProgress);
            cancelAnimation(overlayProgress);
        };
    }, [
        firstRingProgress,
        logoProgress,
        onComplete,
        overlayProgress,
        reduceMotion,
        secondRingProgress,
        startAnimation,
    ]);

    const logoStyle = useAnimatedStyle(() => ({
        opacity: reduceMotion ? 1 : logoProgress.value,
        transform: reduceMotion
            ? [{ translateY: 0 }, { scale: 1 }]
            : [
                { translateY: 8 * (1 - logoProgress.value) },
                { scale: 0.9 + logoProgress.value * 0.1 },
            ],
    }));
    const firstRingStyle = useAnimatedStyle(() => ({
        opacity: 0.46 * (1 - firstRingProgress.value),
        transform: [{ scale: 0.92 + firstRingProgress.value * 0.34 }],
    }));
    const secondRingStyle = useAnimatedStyle(() => ({
        opacity: 0.3 * (1 - secondRingProgress.value),
        transform: [{ scale: 0.92 + secondRingProgress.value * 0.34 }],
    }));
    const glowStyle = useAnimatedStyle(() => ({
        opacity: 0.12 * (1 - firstRingProgress.value),
        transform: [{ scale: 0.82 + firstRingProgress.value * 0.36 }],
    }));
    const overlayStyle = useAnimatedStyle(() => ({ opacity: overlayProgress.value }));

    return (
        <Animated.View
            accessibilityRole="progressbar"
            accessibilityLabel="در حال آماده‌سازی پهناور کار"
            style={[styles.container, { backgroundColor: colors.background }, overlayStyle]}
        >
            <View style={styles.content}>
                <View style={styles.logoStage}>
                    <Animated.View
                        pointerEvents="none"
                        style={[styles.glow, { backgroundColor: colors.primary }, glowStyle]}
                    />
                    <Animated.View
                        pointerEvents="none"
                        style={[styles.ring, { borderColor: colors.primary }, firstRingStyle]}
                    />
                    <Animated.View
                        pointerEvents="none"
                        style={[styles.ring, { borderColor: colors.primary }, secondRingStyle]}
                    />
                    <Animated.Image
                        source={theme === 'dark'
                            ? require('../../assets/images/logo-white.png')
                            : require('../../assets/images/logo-teal.png')}
                        resizeMode="contain"
                        style={[styles.logo, logoStyle]}
                    />
                </View>
                <Animated.View style={[styles.brandCopy, logoStyle]}>
                    <AppText
                        onLayout={(event) => {
                            const width = event.nativeEvent.layout.width;
                            setBrandNameWidth((currentWidth) => currentWidth === width ? currentWidth : width);
                        }}
                        style={[styles.brandName, { color: colors.text }]}
                    >
                        Pahnavar Kar
                    </AppText>
                    <View style={[styles.separator, { width: brandNameWidth ? brandNameWidth * 0.72 : 38 }]}>
                        <View style={[styles.separatorLine, { backgroundColor: colors.primary }]} />
                        <View style={[styles.separatorDot, { backgroundColor: colors.primary }]} />
                        <View style={[styles.separatorLine, { backgroundColor: colors.primary }]} />
                    </View>
                    <AppText style={[styles.tagline, { color: colors.text }]}>
                        Serving the Working Community
                    </AppText>
                </Animated.View>
            </View>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        zIndex: 100,
        elevation: 100,
        alignItems: 'center',
        justifyContent: 'center',
    },
    content: { width: '100%', alignItems: 'center', justifyContent: 'center', gap: 8 },
    logoStage: {
        width: 196,
        height: 196,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
    },
    glow: {
        position: 'absolute',
        width: 140,
        height: 140,
        borderRadius: 70,
    },
    ring: {
        position: 'absolute',
        width: 168,
        height: 168,
        borderRadius: 84,
        borderWidth: 1.5,
    },
    logo: {
        width: 132,
        height: 132,
        maxWidth: '100%',
        maxHeight: '100%',
    },
    brandCopy: { maxWidth: '90%', alignItems: 'center', gap: 5 },
    brandName: { fontSize: 16, fontFamily: 'AppFont-Medium', letterSpacing: 0.2 },
    separator: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, marginVertical: 3 },
    separatorLine: { flex: 1, height: 1, borderRadius: 1 },
    separatorDot: { width: 4, height: 4, borderRadius: 2 },
    tagline: { fontSize: 16, fontFamily: 'AppFont-Medium', letterSpacing: 0.2, textAlign: 'center' },
});
