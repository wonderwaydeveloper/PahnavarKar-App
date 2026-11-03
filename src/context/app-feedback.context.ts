import { createContext } from 'react';

export type AppFeedbackVariant = 'info' | 'success' | 'warning' | 'error';

export interface AppFeedbackAction {
    label: string;
    onPress: () => void;
}

export interface AppFeedbackOptions {
    message: string;
    variant?: AppFeedbackVariant;
    duration?: number;
    action?: AppFeedbackAction;
}

export interface AppFeedbackContextType {
    showFeedback: (options: AppFeedbackOptions) => void;
    dismissFeedback: () => void;
}

export const AppFeedbackContext = createContext<AppFeedbackContextType | undefined>(undefined);
