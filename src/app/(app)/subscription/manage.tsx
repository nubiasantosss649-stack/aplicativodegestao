import { router } from 'expo-router';
import { useState } from 'react';
import { Linking } from 'react-native';

import { PlanBanner } from '@/components/PlanBanner';
import { Badge, Button, Card, ErrorState, KeyValue, LoadingState, Screen, Text, useToast } from '@/components/ui';
import { syncSubscription, useEntitlements, useInvalidateEntitlements } from '@/features/subscription/api';
import { STORE_LABELS, subscriptionStatusLabel } from '@/features/subscription/plans';
import { formatDate } from '@/lib/dates';
import { errorMessage } from '@/lib/errors';
import { isBillingAvailable, managementUrl, restorePurchases } from '@/lib/purchases';
import { useCurrentBusiness } from '@/providers/BusinessProvider';
import { spacing } from '@/theme/colors';

export default function ManageSubscription() {
  const business = useCurrentBusiness();
  const toast = useToast();
  const { data, isPending, error, refetch, isRefetching } = useEntitlements(business.id);
  const invalidate = useInvalidateEntitlements();
  const [busy, setBusy] = useState<'sync' | 'restore' | null>(null);

  if (isPending) return <LoadingState />;
  if (error || !data) return <ErrorState error={error} onRetry={refetch} />;
  const sub = data.subscription;
  const tone =
    !sub ? 'neutral' : sub.status === 'expired' ? 'danger' : sub.status === 'billing_issue' || sub.status === 'grace_period' ? 'warning' : 'success';

  const doSync = async () => {
    try {
      setBusy('sync');
      await syncSubscription();
      invalidate();
      toast.show('Status da assinatura atualizado.');
    } catch (e) {
      toast.show(errorMessage(e), 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen refreshing={isRefetching} onRefresh={refetch}>
      <Card style={{ gap: spacing.sm }}>
        <Text tone="muted">Plano atual do negócio</Text>
        <Text variant="title" tone={data.plan === 'pro' ? 'primary' : 'default'}>{data.plan_name}</Text>
        {sub ? <Badge label={subscriptionStatusLabel(sub.status)} tone={tone} /> : null}
        {sub?.environment === 'sandbox' ? <Badge label="Assinatura de TESTE (sandbox)" tone="warning" /> : null}
      </Card>

      {!data.is_owner ? (
        <Text tone="muted">O plano é definido pela assinatura do dono do negócio.</Text>
      ) : sub ? (
        <Card>
          {sub.store ? <KeyValue label="Loja" value={STORE_LABELS[sub.store] ?? sub.store} /> : null}
          {sub.status === 'trialing' ? <KeyValue label="Teste grátis até" value={formatDate(sub.current_period_end)} /> : null}
          {sub.status !== 'expired' && sub.status !== 'trialing' ? (
            <KeyValue
              label={sub.will_renew ? 'Próxima renovação' : 'Acesso Pro até'}
              value={formatDate(sub.grace_period_end && sub.status === 'grace_period' ? sub.grace_period_end : sub.current_period_end)}
            />
          ) : null}
          {sub.status === 'expired' ? <KeyValue label="Expirou em" value={formatDate(sub.current_period_end)} tone="danger" /> : null}
          <KeyValue label="Renovação automática" value={sub.will_renew ? 'Ativada' : 'Desativada'} />
        </Card>
      ) : (
        <Text tone="muted">Você ainda não possui assinatura.</Text>
      )}

      {sub && (sub.status === 'billing_issue' || sub.status === 'grace_period') ? (
        <Card style={{ gap: spacing.sm }}>
          <Text tone="warning" bold>Houve um problema ao cobrar sua assinatura.</Text>
          <Text tone="muted">
            Atualize a forma de pagamento na loja para não perder o Pro.
            {sub.grace_period_end ? ` O acesso continua até ${formatDate(sub.grace_period_end)}.` : ''}
          </Text>
        </Card>
      ) : null}

      <PlanBanner businessId={business.id} />

      {data.plan !== 'pro' ? (
        <Button title="Conhecer o Pro IA" icon="diamond" onPress={() => router.push('/subscription')} />
      ) : null}

      {data.is_owner && sub ? (
        <Button
          title="Gerenciar ou cancelar na loja"
          icon="open-outline"
          variant="secondary"
          onPress={async () => Linking.openURL(await managementUrl())}
        />
      ) : null}
      {data.is_owner && isBillingAvailable() ? (
        <Button
          title="Restaurar compras"
          icon="refresh"
          variant="outline"
          loading={busy === 'restore'}
          disabled={busy != null}
          onPress={async () => {
            try {
              setBusy('restore');
              await restorePurchases();
              await syncSubscription().catch(() => null);
              invalidate();
              toast.show('Compras restauradas.');
            } catch (e) {
              toast.show(errorMessage(e), 'error');
            } finally {
              setBusy(null);
            }
          }}
        />
      ) : null}
      {data.is_owner ? (
        <Button title="Atualizar status" icon="sync" variant="ghost" loading={busy === 'sync'} disabled={busy != null} onPress={doSync} />
      ) : null}

      <Text variant="caption" tone="muted" center>
        Mesmo sem o Pro, todos os seus produtos, vendas, clientes e lançamentos continuam disponíveis para consulta.
      </Text>
    </Screen>
  );
}
