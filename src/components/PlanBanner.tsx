import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Card, Text } from '@/components/ui';
import { useEntitlements } from '@/features/subscription/api';
import { usageMeters } from '@/features/subscription/plans';
import { radius, spacing } from '@/theme/colors';
import { useTheme } from '@/theme/ThemeProvider';

/** Uso do Plano Grátis (produtos e vendas do mês) com atalho para o Pro. */
export function PlanBanner({ businessId, compact }: { businessId: string; compact?: boolean }) {
  const { colors } = useTheme();
  const { data } = useEntitlements(businessId);
  if (!data || data.plan !== 'free') return null;
  const meters = usageMeters(data);
  const critical = meters.some((m) => m.nearLimit);
  if (compact && !critical) return null;

  return (
    <Card onPress={() => router.push('/subscription')} accessibilityLabel="Ver plano Pro" style={{ gap: spacing.sm }}>
      <View style={styles.row}>
        <Text variant="label">Plano Grátis</Text>
        <Text variant="label" tone="primary">Conhecer o Pro ›</Text>
      </View>
      {meters.map((m) => (
        <View key={m.label} style={{ gap: 4 }}>
          <View style={styles.row}>
            <Text variant="caption" tone="muted">{m.label}</Text>
            <Text variant="caption" bold tone={m.reached ? 'danger' : m.nearLimit ? 'warning' : 'default'}>
              {m.used}/{m.limit}
            </Text>
          </View>
          <View style={[styles.track, { backgroundColor: colors.surfaceAlt }]}>
            <View
              style={[
                styles.fill,
                {
                  width: `${Math.round(m.ratio * 100)}%`,
                  backgroundColor: m.reached ? colors.danger : m.nearLimit ? colors.warning : colors.primary,
                },
              ]}
            />
          </View>
        </View>
      ))}
      {critical ? (
        <Text variant="caption" tone="warning">Você está perto do limite. Com o Pro, produtos e vendas são ilimitados.</Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  track: { height: 8, borderRadius: radius.full, overflow: 'hidden' },
  fill: { height: 8, borderRadius: radius.full },
});
