import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { radius, spacing } from '@/theme/colors';
import { useTheme } from '@/theme/ThemeProvider';

import type { IconName } from './Button';
import { Text } from './Text';

interface ListItemProps {
  title: string;
  subtitle?: string;
  icon?: IconName;
  iconTone?: 'primary' | 'success' | 'danger' | 'warning';
  right?: ReactNode;
  onPress?: () => void;
  chevron?: boolean;
  testID?: string;
}

export function ListItem({ title, subtitle, icon, iconTone = 'primary', right, onPress, chevron, testID }: ListItemProps) {
  const { colors } = useTheme();
  const tone = {
    primary: [colors.primary, colors.primarySoft],
    success: [colors.success, colors.successSoft],
    danger: [colors.danger, colors.dangerSoft],
    warning: [colors.warning, colors.warningSoft],
  }[iconTone];
  return (
    <Pressable
      testID={testID}
      disabled={!onPress}
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: colors.surface, borderColor: colors.border },
        pressed && { backgroundColor: colors.surfaceAlt },
      ]}
    >
      {icon ? (
        <View style={[styles.icon, { backgroundColor: tone[1] }]}>
          <Ionicons name={icon} size={20} color={tone[0]} />
        </View>
      ) : null}
      <View style={styles.texts}>
        <Text variant="body" bold numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" tone="muted" numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
      {chevron ? <Ionicons name="chevron-forward" size={18} color={colors.textMuted} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 64,
  },
  icon: { width: 40, height: 40, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  texts: { flex: 1, gap: 2 },
});
