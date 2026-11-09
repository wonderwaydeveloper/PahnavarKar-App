import { useCallback, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { Portal } from 'react-native-paper';
import { AppSnackbar as Snackbar } from '@/components/app-snackbar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import {
    AppFeedbackContext,
    type AppFeedbackOptions,
    type AppFeedbackVariant,
} from '@/context/app-feedback.context';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface VisibleFeedback extends AppFeedbackOptions {
    id: number;
    variant: AppFeedbackVariant;
}

const DEFAULT_DURATIONS: Record<AppFeedbackVariant, number> = {
    info: 4000,
    success: 3000,
    warning: 5000,
    error: 6000,
};

export function AppFeedbackProvider({ children }: PropsWithChildren) {
    const theme = useTheme();
    const insets = useSafeAreaInsets();
    const nextId = useRef(0);
    const [feedback, setFeedback] = useState<VisibleFeedback | null>(null);

    const dismissFeedback = useCallback(() => setFeedback(null), []);
    const showFeedback = useCallback((options: AppFeedbackOptions) => {
        const message = options.message.trim();
        if (!message) return;
        const variant = options.variant ?? 'info';
        setFeedback({
            ...options,
            message,
            variant,
            id: ++nextId.current,
        });
    }, []);
    const contextValue = useMemo(() => ({ showFeedback, dismissFeedback }), [dismissFeedback, showFeedback]);

    const backgroundColor = feedback?.variant === 'error'
        ? theme.errorFill
        : feedback?.variant === 'success'
            ? theme.successFill
            : feedback?.variant === 'warning' ? theme.warningFill : theme.infoFill;
    const textColor = feedback?.variant === 'error'
        ? theme.onErrorFill
        : feedback?.variant === 'success'
            ? theme.onSuccess
            : feedback?.variant === 'warning' ? theme.onWarning : theme.onInfo;

    return (
        <AppFeedbackContext.Provider value={contextValue}>
            <Portal.Host>
                {children}
                <Portal>
                    <Snackbar variant="error"
                        key={feedback?.id ?? 'app-feedback'}
                        visible={feedback !== null}
                        onDismiss={dismissFeedback}
                        duration={feedback ? feedback.duration ?? DEFAULT_DURATIONS[feedback.variant] : DEFAULT_DURATIONS.info}
                        wrapperStyle={{ bottom: insets.bottom + Spacing.two }}
                        style={{ backgroundColor, borderRadius: Radius.md }}
                        action={feedback?.action ? {
                            label: feedback.action.label,
                            onPress: () => {
                                const action = feedback.action;
                                dismissFeedback();
                                action?.onPress();
                            },
                            labelStyle: { color: textColor },
                        } : undefined}
                    >
                        <ThemedText
                            type="small"
                            accessibilityRole={feedback?.variant === 'error' ? 'alert' : undefined}
                            accessibilityLiveRegion={feedback?.variant === 'error' ? 'polite' : undefined}
                            style={{ color: textColor }}
                        >
                            {feedback?.message ?? ''}
                        </ThemedText>
                    </Snackbar>
                </Portal>
            </Portal.Host>
        </AppFeedbackContext.Provider>
    );
}
