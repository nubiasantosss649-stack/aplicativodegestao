import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Badge, Button, Card, Text } from '@/components/ui';
import { useEntitlements } from '@/features/subscription/api';
import { hasFeature, type ProFeature } from '@/features/subscription/plans';
import { useBusiness } from '@/providers/BusinessProvider';
import { spacing } from '@/theme/colors';
import { useTheme } from '@/theme/ThemeProvider';

interface Props {
  feature: ProFeature;
  title: string;
  description: string;
  children: ReactNode;
}

/**
 * Exibe o recurso Pro ou um convite para assinar. Recursos Pro são
 * visualizações/relatórios: os dados do usuário continuam acessíveis
 * nas demais telas, mesmo no Plano Grátis.
 */
export function ProGate({ feature, title, description, children }: Props) {
  const { business } = useBusiness();
  const { colors } = useTheme();
  const { data, isPending } = useEntitlements(business?.id);
  if (isPending) return null;
  if (hasFeature(data, feature)) return <>{children}</>;
  return (
    <Card style={{ gap: spacing.sm, borderColor: colors.primary, borderWidth: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Ionicons name="lock-closed" size={18} color={colors.primary} />
        <Text variant="subtitle" style={{ flex: 1 }}>{title}</Text>
        <Badge label="PRO" />
      </View>
      <Text tone="muted">{description}</Text>
      <Button title="Conhecer o Pro IA" icon="diamond" size="md" onPress={() => router.push('/subscription')} />
    </Card>
  );
}
