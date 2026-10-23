import { preload, useAudioPlayer } from 'expo-audio';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { Portal, Snackbar } from 'react-native-paper';

import { ThemedText } from '@/components/themed-text';
import type { CalculationSound } from '@/context/app.context';
import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const MESSAGE_SOUND_SOURCE = require('../../assets/sounds/calculation-message.wav');
const MESSAGE_SOFT_SOUND_SOURCE = require('../../assets/sounds/calculation-message-soft.wav');
const PIANO_SOUND_SOURCE = require('../../assets/sounds/calculation-piano.wav');
const SOUND_PRELOAD = Promise.all([
    Promise.resolve(preload(MESSAGE_SOUND_SOURCE)),
    Promise.resolve(preload(MESSAGE_SOFT_SOUND_SOURCE)),
    Promise.resolve(preload(PIANO_SOUND_SOURCE)),
]);

void SOUND_PRELOAD.catch((error: unknown) => {
    console.error('Unable to preload calculation feedback sounds', error);
});

interface CalculationFeedbackHostProps {
    sound: CalculationSound;
    sequence: number;
    previewSound: Exclude<CalculationSound, 'off'> | null;
    previewSequence: number;
}

export function CalculationFeedbackHost({
    sound,
    sequence,
    previewSound,
    previewSequence,
}: CalculationFeedbackHostProps) {
    const theme = useTheme();
    const messagePlayer = useAudioPlayer(MESSAGE_SOUND_SOURCE);
    const messageSoftPlayer = useAudioPlayer(MESSAGE_SOFT_SOUND_SOURCE);
    const pianoPlayer = useAudioPlayer(PIANO_SOUND_SOURCE);
    const lastHandledSequence = useRef(0);
    const lastHandledPreviewSequence = useRef(0);
    const [visible, setVisible] = useState(false);
    const [message, setMessage] = useState('محاسبه انجام شد');

    const getPlayer = useEffectEvent((selectedSound: Exclude<CalculationSound, 'off'>) => (
        selectedSound === 'message'
            ? messagePlayer
            : selectedSound === 'messageSoft' ? messageSoftPlayer : pianoPlayer
    ));

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

    const playPreview = useEffectEvent(async () => {
        if (!previewSound) return;

        await SOUND_PRELOAD;
        const players = [messagePlayer, messageSoftPlayer, pianoPlayer];
        const selectedPlayer = getPlayer(previewSound);
        players.forEach((player) => {
            if (player !== selectedPlayer) player.pause();
        });
        if (selectedPlayer.currentTime > 0) {
            await selectedPlayer.seekTo(0);
        }
        selectedPlayer.play();
    });

    useEffect(() => {
        if (sequence === 0 || sequence === lastHandledSequence.current) return;

        lastHandledSequence.current = sequence;
        setMessage('محاسبه انجام شد');
        setVisible(true);

        playSound();
    }, [sequence]);

    useEffect(() => {
        if (previewSequence === 0 || previewSequence === lastHandledPreviewSequence.current) return;

        lastHandledPreviewSequence.current = previewSequence;
        void playPreview().catch((error: unknown) => {
            console.error('Unable to play calculation sound preview', error);
            setMessage('پخش نمونهٔ صدای انتخاب‌شده انجام نشد.');
            setVisible(true);
        });
    }, [previewSequence]);

    return (
        <Portal>
            <Snackbar
                visible={visible}
                onDismiss={() => setVisible(false)}
                duration={2800}
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
