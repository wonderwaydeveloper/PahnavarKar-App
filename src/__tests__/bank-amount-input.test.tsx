import { fireEvent, render } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';
import type { ComponentProps } from 'react';

import { BankAmountInput } from '@/components/bank-amount-input';

jest.mock('@/components/app-text', () => {
    const React = jest.requireActual<typeof import('react')>('react');
    const { TextInput } = jest.requireActual<typeof import('react-native')>('react-native');

    return {
        AppTextInput: (props: ComponentProps<typeof TextInput>) => React.createElement(TextInput, props),
    };
});

jest.mock('@/components/themed-text', () => {
    const React = jest.requireActual<typeof import('react')>('react');
    const { Text } = jest.requireActual<typeof import('react-native')>('react-native');

    return {
        ThemedText: ({ children, type: _type, ...props }: ComponentProps<typeof Text> & { type?: string }) => (
            React.createElement(Text, props, children)
        ),
    };
});

jest.mock('@/hooks/use-theme', () => ({
    useTheme: () => ({
        surfaceElevated: '#F5FBFC',
        border: '#BBD9DE',
        text: '#102A39',
        textSecondary: '#4B6275',
        textMuted: '#536B79',
    }),
}));

jest.mock('@/constants/theme', () => ({
    Radius: { md: 12 },
    Spacing: { two: 8 },
}));

describe('BankAmountInput', () => {
    it('formats the amount with Persian thousands separators when not focused', async () => {
        const view = await render(
            <BankAmountInput
                accessibilityLabel="مبلغ شارژ"
                onChangeText={jest.fn()}
                value="۱۲۳۴۵۶۷۸"
            />,
        );

        expect(view.getByLabelText('مبلغ شارژ').props.value).toBe('۱۲٬۳۴۵٬۶۷۸');
        expect(view.getByText('تومان')).toBeTruthy();
    });

    it('shows an ungrouped numeric value for editing and normalizes grouped Persian input', async () => {
        const onChangeText = jest.fn();
        const view = await render(
            <BankAmountInput
                accessibilityLabel="مبلغ شارژ"
                onChangeText={onChangeText}
                value="۱۲۳۴۵۶۷"
            />,
        );
        const input = view.getByLabelText('مبلغ شارژ');

        await fireEvent(input, 'focus');
        expect(view.getByLabelText('مبلغ شارژ').props.value).toBe('۱۲۳۴۵۶۷');

        await fireEvent.changeText(input, '۱۲٬۳۴۵٬۶۷۸');
        expect(onChangeText).toHaveBeenLastCalledWith('۱۲۳۴۵۶۷۸');
    });
});
