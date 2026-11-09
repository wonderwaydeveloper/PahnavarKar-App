import { Snackbar as PaperSnackbar } from 'react-native-paper';
import type { ComponentProps } from 'react';

import { useTheme } from '@/hooks/use-theme';

export type AppSnackbarVariant = 'info' | 'success' | 'warning' | 'error';

type AppSnackbarProps = ComponentProps<typeof PaperSnackbar> & {
    variant?: AppSnackbarVariant;
};

export function AppSnackbar({ variant = 'info', style, ...props }: AppSnackbarProps) {
    const theme = useTheme();
    const backgroundColor = {
        info: theme.infoFill,
        success: theme.successFill,
        warning: theme.warningFill,
        error: theme.errorFill,
    }[variant];

    return (
        <PaperSnackbar
            {...props}
            style={[{ backgroundColor }, style]}
        />
    );
}
