import { act, fireEvent, render } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';
import { StyleSheet } from 'react-native';
import { OfflineDataNotice } from '@/components/offline-data-notice';
import { OfflinePageStatusBanner } from '@/components/offline-page-status-banner';
import { ColorPalettes } from '@/constants/theme';
import {
    MAX_OFFLINE_PAGE_NOTICE_TITLE_LENGTH,
    setOfflinePageNotice,
} from '@/services/offline-page-status';

jest.mock('@/global.css', () => ({}));

jest.mock('expo-router', () => ({
    usePathname: () => '/account/wallet',
}));

jest.mock('@expo/vector-icons', () => {
    const React = jest.requireActual<typeof import('react')>('react');
    const { Text: NativeText } = jest.requireActual<typeof import('react-native')>('react-native');

    return {
        MaterialCommunityIcons: ({ name }: { name: string }) => (
            React.createElement(NativeText, null, name)
        ),
    };
});

jest.mock('@/components/themed-text', () => {
    const React = jest.requireActual<typeof import('react')>('react');
    const { Text: NativeText } = jest.requireActual<typeof import('react-native')>('react-native');

    return {
        ThemedText: ({ children, ...props }: React.ComponentProps<typeof NativeText>) => (
            React.createElement(NativeText, props, children)
        ),
    };
});

jest.mock('@/hooks/use-theme', () => ({
    useTheme: () => ({
        ...jest.requireActual<typeof import('@/constants/theme')>('@/constants/theme').ColorPalettes.default.light,
    }),
}));

describe('OfflineDataNotice', () => {
    it('accepts the title limit and rejects longer titles', () => {
        const validTitle = 'x'.repeat(MAX_OFFLINE_PAGE_NOTICE_TITLE_LENGTH);
        expect(() => setOfflinePageNotice('max-length-title', '/account/wallet', {
            message: validTitle,
            details: [],
        })).not.toThrow();
        setOfflinePageNotice('max-length-title', '/account/wallet', null);

        expect(() => setOfflinePageNotice('too-long-title', '/account/wallet', {
            message: 'x'.repeat(MAX_OFFLINE_PAGE_NOTICE_TITLE_LENGTH + 1),
            details: [],
        })).toThrow(RangeError);
    });

    it('uses a server icon when live server data is unavailable', async () => {
        const { getByText } = await render(
            <OfflineDataNotice
                theme={ColorPalettes.default.light}
                message="اتصال به سرور برقرار نیست."
                details={['اقدام وابسته به سرور پس از اتصال در دسترس است.']}
            />,
        );

        expect(getByText('cloud-off-outline')).toBeTruthy();
    });

    it('uses a saved-data icon when displaying an offline snapshot', async () => {
        const { getByText } = await render(
            <OfflineDataNotice
                theme={ColorPalettes.default.light}
                message="نسخهٔ ذخیره‌شده نمایش داده می‌شود."
                details={['این داده ممکن است به‌روز نباشد.']}
                hasSavedData
            />,
        );

        expect(getByText('database-clock-outline')).toBeTruthy();
    });

    it('expands a concise list of details on demand and collapses it again', async () => {
        const view = await render(
            <OfflineDataNotice
                theme={ColorPalettes.default.light}
                message="اطلاعات ذخیره‌شده نمایش داده می‌شود."
                details={['این داده ممکن است به‌روز نباشد.', 'برای به‌روزرسانی به سرور متصل شوید.']}
                hasSavedData
            />,
        );
        const toggle = view.getByRole('button', { name: /نمایش جزئیات/ });

        expect(view.queryByText('این داده ممکن است به‌روز نباشد.')).toBeNull();
        expect(toggle.props.accessibilityState).toEqual({ expanded: false });

        await fireEvent.press(toggle);

        expect(view.getByText('این داده ممکن است به‌روز نباشد.')).toBeTruthy();
        expect(view.getByText('برای به‌روزرسانی به سرور متصل شوید.')).toBeTruthy();
        expect(view.getByRole('button', { name: /بستن جزئیات/ }).props.accessibilityState).toEqual({ expanded: true });

        await fireEvent.press(view.getByRole('button', { name: /بستن جزئیات/ }));
        expect(view.queryByText('این داده ممکن است به‌روز نباشد.')).toBeNull();
    });

    it('shows only the notice registered for the active page below the shared header', async () => {
        setOfflinePageNotice('wallet-test', '/account/wallet', {
            message: 'اطلاعات ذخیره‌شدهٔ کیف پول نمایش داده می‌شود.',
            details: ['عملیات مالی تا اتصال سرور غیرفعال است.'],
            hasSavedData: true,
        });
        setOfflinePageNotice('notifications-test', '/account/notifications', {
            message: 'نسخهٔ ذخیره‌شدهٔ اعلان‌ها نمایش داده می‌شود.',
            details: ['برای به‌روزرسانی به سرور متصل شوید.'],
            hasSavedData: true,
        });

        const view = await render(<OfflinePageStatusBanner />);
        expect(view.getByText('اطلاعات ذخیره‌شدهٔ کیف پول نمایش داده می‌شود.')).toBeTruthy();
        expect(view.queryByText('نسخهٔ ذخیره‌شدهٔ اعلان‌ها نمایش داده می‌شود.')).toBeNull();
        const card = view.getByText('اطلاعات ذخیره‌شدهٔ کیف پول نمایش داده می‌شود.').parent?.parent;
        if (!card) throw new Error('Offline notice card was not rendered.');
        expect(StyleSheet.flatten(card.props.style)).toMatchObject({
            width: '100%',
            alignSelf: 'stretch',
            borderRadius: 0,
        });
        expect(StyleSheet.flatten(card.parent?.props.style)).toMatchObject({ width: '100%' });
        expect(StyleSheet.flatten(card.parent?.props.style)).not.toHaveProperty('paddingTop');
        expect(StyleSheet.flatten(card.parent?.props.style)).not.toHaveProperty('paddingBottom');

        await act(async () => {
            setOfflinePageNotice('wallet-test', '/account/wallet', null);
            setOfflinePageNotice('notifications-test', '/account/notifications', null);
        });
    });
});
