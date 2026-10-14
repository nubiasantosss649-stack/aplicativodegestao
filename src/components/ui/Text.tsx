import { Text as RNText, type TextProps, type TextStyle } from 'react-native';

import { fontSize } from '@/theme/colors';
import { useTheme } from '@/theme/ThemeProvider';

type Variant = 'hero' | 'title' | 'subtitle' | 'body' | 'label' | 'caption';
type Tone = 'default' | 'muted' | 'primary' | 'success' | 'danger' | 'warning' | 'onPrimary';

const variants: Record<Variant, TextStyle> = {
  hero: { fontSize: fontSize.hero, fontWeight: '800', letterSpacing: -0.5 },
  title: { fontSize: fontSize.xl, fontWeight: '700' },
  subtitle: { fontSize: fontSize.lg, fontWeight: '600' },
  body: { fontSize: fontSize.md },
  label: { fontSize: fontSize.sm, fontWeight: '600' },
  caption: { fontSize: fontSize.xs },
};

export interface AppTextProps extends TextProps {
  variant?: Variant;
  tone?: Tone;
  center?: boolean;
  bold?: boolean;
}

export function Text({ variant = 'body', tone = 'default', center, bold, style, ...rest }: AppTextProps) {
  const { colors } = useTheme();
  const toneColor: Record<Tone, string> = {
    default: colors.text,
    muted: colors.textMuted,
    primary: colors.primary,
    success: colors.success,
    danger: colors.danger,
    warning: colors.warning,
    onPrimary: colors.onPrimary,
  };
  return (
    <RNText
      maxFontSizeMultiplier={1.6}
      style={[
        variants[variant],
        { color: toneColor[tone] },
        center && { textAlign: 'center' },
        bold && { fontWeight: '700' },
        style,
      ]}
      {...rest}
    />
  );
}
