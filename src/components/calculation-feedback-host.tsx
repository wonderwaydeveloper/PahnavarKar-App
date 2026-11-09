import { preload, useAudioPlayer } from 'expo-audio';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { Portal } from 'react-native-paper';
import { AppSnackbar as Snackbar } from '@/components/app-snackbar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import type { CalculationSound } from '@/context/app.context';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const PIANO_MODERN_BRIGHT_SOUND_SOURCE = require('../../assets/sounds/calculation-piano-modern-bright.wav');
const PIANO_MODERN_SOFT_SOUND_SOURCE = require('../../assets/sounds/calculation-piano-modern-soft.wav');
const PIANO_SOUND_SOURCE = require('../../assets/sounds/calculation-piano.wav');
const PIANO_MELODY_SOUND_SOURCE = require('../../assets/sounds/calculation-piano-melody.wav');
const PIANO_SOULFUL_SOUND_SOURCE = require('../../assets/sounds/calculation-piano-soulful.wav');
const SOUND_PRELOAD = Promise.all([
    Promise.resolve(preload(PIANO_MODERN_BRIGHT_SOUND_SOURCE)),
    Promise.resolve(preload(PIANO_MODERN_SOFT_SOUND_SOURCE)),
    Promise.resolve(preload(PIANO_SOUND_SOURCE)),
    Promise.resolve(preload(PIANO_MELODY_SOUND_SOURCE)),
    Promise.resolve(preload(PIANO_SOULFUL_SOUND_SOURCE)),
]);

void SOUND_PRELOAD.catch((error: unknown) => {
    console.error('Unable to preload calculation feedback sounds', error);
});

interface CalculationFeedbackHostProps {
    sound: CalculationSound;
    sequence: number;
}

export function CalculationFeedbackHost({
    sound,
    sequence,
}: CalculationFeedbackHostProps) {
    const theme = useTheme();
    const insets = useSafeAreaInsets();
    const pianoModernBrightPlayer = useAudioPlayer(PIANO_MODERN_BRIGHT_SOUND_SOURCE);
    const pianoModernSoftPlayer = useAudioPlayer(PIANO_MODERN_SOFT_SOUND_SOURCE);
    const pianoPlayer = useAudioPlayer(PIANO_SOUND_SOURCE);
    const pianoMelodyPlayer = useAudioPlayer(PIANO_MELODY_SOUND_SOURCE);
    const pianoSoulfulPlayer = useAudioPlayer(PIANO_SOULFUL_SOUND_SOURCE);
    const lastHandledSequence = useRef(0);
    const [visible, setVisible] = useState(false);
    const [message, setMessage] = useState('محاسبه انجام شد');

    const getPlayer = useEffectEvent((selectedSound: Exclude<CalculationSound, 'off'>) => {
        switch (selectedSound) {
            case 'pianoModernBright':
                return pianoModernBrightPlayer;
            case 'pianoModernSoft':
                return pianoModernSoftPlayer;
            case 'piano':
                return pianoPlayer;
            case 'pianoMelody':
                return pianoMelodyPlayer;
            case 'pianoSoulful':
                return pianoSoulfulPlayer;
        }
    });

    const playSound = useEffectEvent(() => {
        if (sound === 'off') return;

        const player = getPlayer(sound);
        if (player.currentTime > 0) {
            void player.seekTo(0).catch((error: unknown) => {
                console.error('Unable to rewind calculation completion sound', error);
                setMessage('محاسبه انجام شد؛ اما صدای انتخاب‌شده پخش نشد.');
            });
        }
        player.play();
    });

    useEffect(() => {
        if (sequence === 0 || sequence === lastHandledSequence.current) return;

        lastHandledSequence.current = sequence;
        setMessage('محاسبه انجام شد');
        setVisible(true);

        playSound();
    }, [sequence]);

    return (
        <Portal>
            <Snackbar variant="error"
                visible={visible}
                onDismiss={() => setVisible(false)}
                duration={2800}
                wrapperStyle={{
                    top: insets.top + 64 + Spacing.two,
                    bottom: undefined,
                }}
                style={{ backgroundColor: theme.successFill, borderRadius: Radius.md }}
                action={{
                    label: 'بستن',
                    onPress: () => setVisible(false),
                    labelStyle: { color: theme.onStatus },
                }}
            >
                <ThemedText type="small" style={{ color: theme.onStatus }}>
                    {message}
                </ThemedText>
            </Snackbar>
        </Portal>
    );
}
