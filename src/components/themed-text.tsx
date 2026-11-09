import { Typography } from '@/constants/typography';
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
        {
          color: type === 'linkPrimary'
            ? theme.primaryText
            : theme[themeColor ?? (type === 'description' ? 'textSecondary' : 'text')],
        },
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
    fontSize: Typography.fontSize.bodySmall,
    lineHeight: Typography.lineHeight.body,
    fontFamily: 'AppFont-Regular',
  },
  smallBold: {
    fontSize: Typography.fontSize.bodySmall,
    lineHeight: Typography.lineHeight.body,
    fontFamily: 'AppFont-Bold',
  },
  default: {
    fontSize: Typography.fontSize.bodyLarge,
    lineHeight: Typography.lineHeight.comfortable,
    fontFamily: 'AppFont-Regular',
  },
  title: {
    fontSize: Typography.fontSize.hero,
    lineHeight: Typography.lineHeight.hero,
    fontFamily: 'AppFont-Bold',
  },
  subtitle: {
    fontSize: Typography.fontSize.displaySmall,
    lineHeight: Typography.lineHeight.display,
    fontFamily: 'AppFont-SemiBold',
  },
  link: {
    lineHeight: Typography.lineHeight.title,
    fontSize: Typography.fontSize.bodySmall,
    fontFamily: 'AppFont-Regular',
  },
  linkPrimary: {
    lineHeight: Typography.lineHeight.title,
    fontSize: Typography.fontSize.bodySmall,
    fontFamily: 'AppFont-SemiBold',
  },
  code: {
    fontFamily: 'AppFont-SemiBold',
    fontSize: Typography.fontSize.footnote,
  },
  largeTitle: {
    fontSize: Typography.fontSize.titleLarge,
    lineHeight: Typography.lineHeight.titleLarge,
    fontFamily: 'AppFont-Bold',
  },
  description: {
    fontSize: Typography.fontSize.bodySmall,
    lineHeight: Typography.lineHeight.body,
    fontFamily: 'AppFont-Regular',
  },
  body: {
    fontSize: Typography.fontSize.bodyLarge,
    lineHeight: Typography.lineHeight.comfortable,
    fontFamily: 'AppFont-Regular',
  },
  bodyBold: {
    fontSize: Typography.fontSize.bodyLarge,
    lineHeight: Typography.lineHeight.comfortable,
    fontFamily: 'AppFont-Bold',
  },
  labelBold: {
    fontSize: Typography.fontSize.body,
    lineHeight: Typography.lineHeight.label,
    fontFamily: 'AppFont-Bold',
  },
});
