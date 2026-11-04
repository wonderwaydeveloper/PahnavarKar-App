import {
    Appbar as PaperAppbar,
    Button as PaperButton,
    Menu as PaperMenu,
    TextInput as PaperTextInput,
} from 'react-native-paper';
import type { StyleProp, TextStyle } from 'react-native';

import { useAppContext } from '@/hooks/use-app-context';
import { getAppFontStyle } from '@/services/font-service';

export function FontAwareButton(props: React.ComponentProps<typeof PaperButton>) {
    const { fontPreference, fontSizePreference } = useAppContext();

    return (
        <PaperButton
            {...props}
            labelStyle={getAppFontStyle(props.labelStyle, fontPreference, undefined, fontSizePreference)}
        />
    );
}

export function FontAwareMenuItem(props: React.ComponentProps<typeof PaperMenu.Item>) {
    const { fontPreference, fontSizePreference } = useAppContext();

    return (
        <PaperMenu.Item
            {...props}
            titleStyle={getAppFontStyle(props.titleStyle, fontPreference, undefined, fontSizePreference)}
        />
    );
}

export function FontAwarePaperTextInput(props: React.ComponentProps<typeof PaperTextInput>) {
    const { fontPreference, fontSizePreference } = useAppContext();

    return (
        <PaperTextInput
            {...props}
            contentStyle={getAppFontStyle(props.contentStyle, fontPreference, undefined, fontSizePreference)}
        />
    );
}

type FontAwareAppbarContentProps = Omit<
    React.ComponentProps<typeof PaperAppbar.Content>,
    'title' | 'titleStyle'
> & {
    title: string;
    titleStyle?: StyleProp<TextStyle>;
};

export function FontAwareAppbarContent(props: FontAwareAppbarContentProps) {
    const { fontPreference, fontSizePreference } = useAppContext();

    return (
        <PaperAppbar.Content
            {...props}
            titleStyle={getAppFontStyle(props.titleStyle, fontPreference, undefined, fontSizePreference)}
        />
    );
}
