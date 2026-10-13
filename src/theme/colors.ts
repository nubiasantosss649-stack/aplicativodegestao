/** Paleta Gestão Fácil IA: azul royal principal, verde positivo, vermelho alertas. */
export const palette = {
  royal50: '#EFF4FF',
  royal100: '#DBE6FE',
  royal500: '#2F5BEA',
  royal600: '#1E4FD8',
  royal700: '#1E40AF',
  royal900: '#172554',
  green50: '#ECFDF5',
  green600: '#059669',
  green400: '#34D399',
  red50: '#FEF2F2',
  red600: '#DC2626',
  red400: '#F87171',
  amber50: '#FFFBEB',
  amber600: '#D97706',
  amber400: '#FBBF24',
  gray50: '#F8FAFC',
  gray100: '#F1F5F9',
  gray200: '#E2E8F0',
  gray300: '#CBD5E1',
  gray400: '#94A3B8',
  gray500: '#64748B',
  gray700: '#334155',
  gray800: '#1E293B',
  gray900: '#0F172A',
  gray950: '#020617',
  white: '#FFFFFF',
};

export interface ThemeColors {
  background: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  text: string;
  textMuted: string;
  primary: string;
  primaryPressed: string;
  primarySoft: string;
  onPrimary: string;
  success: string;
  successSoft: string;
  danger: string;
  dangerSoft: string;
  warning: string;
  warningSoft: string;
  tabBar: string;
  overlay: string;
}

export const lightColors: ThemeColors = {
  background: palette.gray50,
  surface: palette.white,
  surfaceAlt: palette.gray100,
  border: palette.gray200,
  text: palette.gray900,
  textMuted: palette.gray500,
  primary: palette.royal700,
  primaryPressed: palette.royal900,
  primarySoft: palette.royal50,
  onPrimary: palette.white,
  success: palette.green600,
  successSoft: palette.green50,
  danger: palette.red600,
  dangerSoft: palette.red50,
  warning: palette.amber600,
  warningSoft: palette.amber50,
  tabBar: palette.white,
  overlay: 'rgba(15, 23, 42, 0.5)',
};

export const darkColors: ThemeColors = {
  background: palette.gray950,
  surface: palette.gray900,
  surfaceAlt: palette.gray800,
  border: palette.gray800,
  text: palette.gray50,
  textMuted: palette.gray400,
  primary: palette.royal500,
  primaryPressed: palette.royal600,
  primarySoft: 'rgba(47, 91, 234, 0.18)',
  onPrimary: palette.white,
  success: palette.green400,
  successSoft: 'rgba(52, 211, 153, 0.14)',
  danger: palette.red400,
  dangerSoft: 'rgba(248, 113, 113, 0.14)',
  warning: palette.amber400,
  warningSoft: 'rgba(251, 191, 36, 0.14)',
  tabBar: palette.gray900,
  overlay: 'rgba(0, 0, 0, 0.6)',
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 16, xl: 24, full: 999 } as const;
export const fontSize = { xs: 12, sm: 14, md: 16, lg: 18, xl: 22, xxl: 28, hero: 34 } as const;
