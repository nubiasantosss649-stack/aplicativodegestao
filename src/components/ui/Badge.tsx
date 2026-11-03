import { StyleSheet, View } from 'react-native';

import { radius, spacing } from '@/theme/colors';
import { useTheme } from '@/theme/ThemeProvider';

import { Text } from './Text';

export function Badge({ label, tone = 'primary' }: { label: string; tone?: 'primary' | 'success' | 'danger' | 'warning' | 'neutral' }) {
  const { colors } = useTheme();
  const map = {
    primary: [colors.primary, colors.primarySoft],
    success: [colors.success, colors.successSoft],
    danger: [colors.danger, colors.dangerSoft],
    warning: [colors.warning, colors.warningSoft],
    neutral: [colors.textMuted, colors.surfaceAlt],
  }[tone];
  return (
    <View style={[styles.badge, { backgroundColor: map[1] }]}>
      <Text variant="caption" bold style={{ color: map[0] }}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.full, alignSelf: 'flex-start' },
});
