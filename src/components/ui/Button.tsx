import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type { ComponentProps } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { radius, spacing } from '@/theme/colors';
import { useTheme } from '@/theme/ThemeProvider';

import { Text } from './Text';

type Variant = 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost' | 'success';
export type IconName = ComponentProps<typeof Ionicons>['name'];

export interface ButtonProps {
  title: string;
  onPress?: () => void;
  variant?: Variant;
  size?: 'md' | 'lg' | 'sm';
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
  accessibilityHint?: string;
  testID?: string;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'lg',
  icon,
  loading,
  disabled,
  fullWidth = true,
  style,
  accessibilityHint,
  testID,
}: ButtonProps) {
  const { colors } = useTheme();
  const bg: Record<Variant, string> = {
    primary: colors.primary,
    secondary: colors.primarySoft,
    outline: 'transparent',
    danger: colors.danger,
    success: colors.success,
    ghost: 'transparent',
  };
  const fg: Record<Variant, string> = {
    primary: colors.onPrimary,
    secondary: colors.primary,
    outline: colors.primary,
    danger: colors.onPrimary,
    success: colors.onPrimary,
    ghost: colors.primary,
  };
  const height = size === 'lg' ? 56 : size === 'md' ? 48 : 38;
  const isDisabled = disabled || loading;

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      disabled={isDisabled}
      onPress={() => {
        if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => undefined);
        onPress?.();
      }}
      style={({ pressed }) => [
        styles.base,
        {
          height,
          backgroundColor: bg[variant],
          borderColor: variant === 'outline' ? colors.primary : 'transparent',
          opacity: isDisabled ? 0.55 : pressed ? 0.85 : 1,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
          paddingHorizontal: size === 'sm' ? spacing.md : spacing.xl,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg[variant]} />
      ) : (
        <View style={styles.row}>
          {icon ? <Ionicons name={icon} size={size === 'sm' ? 16 : 20} color={fg[variant]} /> : null}
          <Text variant={size === 'sm' ? 'label' : 'subtitle'} style={{ color: fg[variant], fontSize: size === 'sm' ? 14 : 16 }}>
            {title}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
