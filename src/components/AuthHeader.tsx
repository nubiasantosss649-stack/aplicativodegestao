import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { radius, spacing } from '@/theme/colors';
import { useTheme } from '@/theme/ThemeProvider';

export function AuthHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.wrap}>
      <View style={[styles.logo, { backgroundColor: colors.primary }]}>
        <Ionicons name="stats-chart" size={28} color="#fff" />
      </View>
      <Text variant="hero">{title}</Text>
      {subtitle ? <Text tone="muted">{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm, marginBottom: spacing.sm, marginTop: spacing.md },
  logo: { width: 52, height: 52, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
});
