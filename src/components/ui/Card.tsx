import { Pressable, StyleSheet, View, type ViewProps, type ViewStyle } from 'react-native';

import { radius, spacing } from '@/theme/colors';
import { useTheme } from '@/theme/ThemeProvider';

interface CardProps extends ViewProps {
  onPress?: () => void;
  padded?: boolean;
  style?: ViewStyle | ViewStyle[];
  accessibilityLabel?: string;
}

export function Card({ onPress, padded = true, style, children, accessibilityLabel, ...rest }: CardProps) {
  const { colors, isDark } = useTheme();
  const base = [
    styles.card,
    {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      shadowOpacity: isDark ? 0 : 0.06,
    },
    padded && { padding: spacing.lg },
    style,
  ];
  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        style={({ pressed }) => [...base, pressed && { opacity: 0.85 }]}
      >
        {children}
      </Pressable>
    );
  }
  return (
    <View style={base} {...rest}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    elevation: 1,
  },
});
