import { StyleSheet, type TextProps } from 'react-native';

import { AppText } from '@/components/app-text';
import { ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedTextProps = TextProps & {
  type?: 'default' | 'title' | 'small' | 'smallBold' | 'subtitle' | 'link' | 'linkPrimary' | 'code' | 'largeTitle' | 'description' | 'body' | 'bodyBold' | 'labelBold';
  themeColor?: ThemeColor;
};

export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();

  return (
    <AppText
      style={[
        { color: type === 'linkPrimary' ? theme.primaryText : theme[themeColor ?? 'text'] },
        type === 'default' && styles.default,
        type === 'title' && styles.title,
        type === 'small' && styles.small,
        type === 'smallBold' && styles.smallBold,
        type === 'subtitle' && styles.subtitle,
        type === 'link' && styles.link,
        type === 'linkPrimary' && styles.linkPrimary,
        type === 'code' && styles.code,
        type === 'largeTitle' && styles.largeTitle,
        type === 'description' && styles.description,
        type === 'body' && styles.body,
        type === 'bodyBold' && styles.bodyBold,
        type === 'labelBold' && styles.labelBold,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  small: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: 'AppFont-Regular',
  },
  smallBold: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: 'AppFont-Bold',
  },
  default: {
    fontSize: 16,
    lineHeight: 24,
    fontFamily: 'AppFont-Regular',
  },
  title: {
    fontSize: 48,
    lineHeight: 52,
    fontFamily: 'AppFont-Bold',
  },
  subtitle: {
    fontSize: 32,
    lineHeight: 44,
    fontFamily: 'AppFont-SemiBold',
  },
  link: {
    lineHeight: 30,
    fontSize: 14,
    fontFamily: 'AppFont-Regular',
  },
  linkPrimary: {
    lineHeight: 30,
    fontSize: 14,
    fontFamily: 'AppFont-SemiBold',
  },
  code: {
    fontFamily: 'AppFont-SemiBold',
    fontSize: 12,
  },
  largeTitle: {
    fontSize: 24,
    lineHeight: 32,
    fontFamily: 'AppFont-Bold',
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: 'AppFont-Regular',
    opacity: 0.7,
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
    fontFamily: 'AppFont-Regular',
  },
  bodyBold: {
    fontSize: 16,
    lineHeight: 24,
    fontFamily: 'AppFont-Bold',
  },
  labelBold: {
    fontSize: 15,
    lineHeight: 22,
    fontFamily: 'AppFont-Bold',
  },
});
