import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { radius, spacing } from '@/theme/colors';
import { useTheme } from '@/theme/ThemeProvider';

import type { IconName } from './Button';
import { Card } from './Card';
import { Text } from './Text';

type Tone = 'primary' | 'success' | 'danger' | 'warning' | 'neutral';

interface StatCardProps {
  label: string;
  value: string;
  icon: IconName;
  tone?: Tone;
  caption?: string;
  onPress?: () => void;
}

export function StatCard({ label, value, icon, tone = 'primary', caption, onPress }: StatCardProps) {
  const { colors } = useTheme();
  const map: Record<Tone, { fg: string; bg: string }> = {
    primary: { fg: colors.primary, bg: colors.primarySoft },
    success: { fg: colors.success, bg: colors.successSoft },
    danger: { fg: colors.danger, bg: colors.dangerSoft },
    warning: { fg: colors.warning, bg: colors.warningSoft },
    neutral: { fg: colors.textMuted, bg: colors.surfaceAlt },
  };
  const c = map[tone];
  return (
    <Card style={styles.card} onPress={onPress} accessibilityLabel={`${label}: ${value}`}>
      <View style={[styles.icon, { backgroundColor: c.bg }]}>
        <Ionicons name={icon} size={20} color={c.fg} />
      </View>
      <Text variant="caption" tone="muted" numberOfLines={1}>
        {label}
      </Text>
      <Text variant="subtitle" bold numberOfLines={1} adjustsFontSizeToFit style={{ color: tone === 'neutral' ? colors.text : c.fg }}>
        {value}
      </Text>
      {caption ? (
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {caption}
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, minWidth: 150, gap: spacing.xs },
  icon: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
});
