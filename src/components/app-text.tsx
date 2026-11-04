import { forwardRef } from 'react';
import {
    Text,
    TextInput,
    type TextInputInstance,
    type TextInputProps,
    type TextInstance,
    type TextProps,
} from 'react-native';

import { useAppContext } from '@/hooks/use-app-context';
import { Typography } from '@/constants/typography';
import { getAppFontStyle } from '@/services/font-service';

export const AppText = forwardRef<TextInstance, TextProps>(function AppText({ style, ...props }, ref) {
    const { fontPreference, fontSizePreference } = useAppContext();
    const textStyle = [{ fontSize: Typography.fontSize.bodySmall }, style];

    return <Text ref={ref} {...props} style={getAppFontStyle(textStyle, fontPreference, 'Regular', fontSizePreference)} />;
});

export const AppTextInput = forwardRef<TextInputInstance, TextInputProps>(function AppTextInput(
    { style, ...props },
    ref
) {
    const { fontPreference, fontSizePreference } = useAppContext();
    const inputStyle = [{ fontSize: Typography.fontSize.bodySmall }, style];

    return (
        <TextInput
            ref={ref}
            {...props}
            style={getAppFontStyle(inputStyle, fontPreference, 'Regular', fontSizePreference)}
        />
    );
});
