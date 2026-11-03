import { useCallback, useContext } from 'react';

import { AppFeedbackContext } from '@/context/app-feedback.context';
import { getUserFacingErrorMessage } from '@/services/user-facing-error';

export function useAppFeedback() {
    const context = useContext(AppFeedbackContext);
    if (!context) {
        throw new Error('useAppFeedback باید داخل AppFeedbackProvider استفاده شود.');
    }

    const { showFeedback, dismissFeedback } = context;
    const showError = useCallback((error: unknown, fallback: string) => {
        showFeedback({
            message: getUserFacingErrorMessage(error, fallback),
            variant: 'error',
        });
    }, [showFeedback]);

    return { showFeedback, dismissFeedback, showError };
}
