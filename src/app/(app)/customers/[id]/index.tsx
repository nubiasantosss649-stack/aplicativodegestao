import { router, useLocalSearchParams } from 'expo-router';
import { Linking, View } from 'react-native';

import { Badge, Button, Card, ErrorState, KeyValue, ListItem, LoadingState, Row, Screen, Section, Text, confirm, useToast } from '@/components/ui';
import { useCustomer, useCustomerBalances, useCustomerSales, useUpdateCustomer } from '@/features/customers/api';
import { formatDate, formatDateTime } from '@/lib/dates';
import { formatPhone } from '@/lib/documents';
import { errorMessage } from '@/lib/errors';
import { formatBRL } from '@/lib/money';
import { useCurrentBusiness } from '@/providers/BusinessProvider';
import { spacing } from '@/theme/colors';
import { toWhatsAppNumber } from '@/features/receivables/charge';

export default function CustomerDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const business = useCurrentBusiness();
  const toast = useToast();
  const { data: c, isPending, error, refetch } = useCustomer(id);
  const balances = useCustomerBalances(business.id);
  const sales = useCustomerSales(id);
  const update = useUpdateCustomer(business.id, id);

  if (isPending) return <LoadingState />;
  if (error || !c) return <ErrorState error={error} onRetry={refetch} />;
  const b = balances.data?.find((x) => x.customer_id === id);
  const wa = toWhatsAppNumber(c.phone);

  return (
    <Screen refreshing={sales.isRefetching} onRefresh={() => { refetch(); balances.refetch(); sales.refetch(); }}>
      <View style={{ gap: 4 }}>
        <Text variant="title">{c.name}</Text>
        {c.phone ? <Text tone="muted">{formatPhone(c.phone)}</Text> : null}
        {c.email ? <Text tone="muted">{c.email}</Text> : null}
        {c.address ? <Text tone="muted">{c.address}</Text> : null}
      </View>

      <Card>
        <KeyValue label="Saldo devedor" value={formatBRL(b?.balance_cents ?? 0)} tone={(b?.balance_cents ?? 0) > 0 ? 'danger' : 'success'} />
        {(b?.overdue_cents ?? 0) > 0 ? <KeyValue label="Vencido" value={formatBRL(b!.overdue_cents)} tone="danger" /> : null}
        <KeyValue label="Total gasto" value={formatBRL(b?.total_spent_cents ?? 0)} tone="primary" />
        <KeyValue label="Compras" value={String(b?.purchases_count ?? 0)} />
        <KeyValue label="Última compra" value={formatDate(b?.last_purchase_at ?? null)} />
      </Card>

      <View style={{ gap: spacing.sm }}>
        <Button title="Fiados e cobrança" icon="wallet" onPress={() => router.push(`/receivables/${c.id}`)} />
        <Row>
          <Button title="Editar" icon="create" variant="secondary" style={{ flex: 1 }} onPress={() => router.push(`/customers/${c.id}/edit`)} />
          {wa ? (
            <Button title="WhatsApp" icon="logo-whatsapp" variant="secondary" style={{ flex: 1 }} onPress={() => Linking.openURL(`https://wa.me/${wa}`)} />
          ) : null}
        </Row>
      </View>

      {c.notes ? (
        <Card style={{ gap: 4 }}>
          <Text variant="label">Observações internas</Text>
          <Text>{c.notes}</Text>
        </Card>
      ) : null}

      <Section title="Histórico de compras">
        {sales.isPending ? (
          <LoadingState />
        ) : (sales.data ?? []).length === 0 ? (
          <Text tone="muted">Nenhuma compra registrada.</Text>
        ) : (
          (sales.data ?? []).map((s) => (
            <ListItem
              key={s.id}
              icon="receipt"
              iconTone={s.status === 'canceled' ? 'danger' : 'primary'}
              title={`Venda #${s.number}`}
              subtitle={formatDateTime(s.created_at)}
              right={
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Text bold>{formatBRL(s.total_cents)}</Text>
                  {s.status === 'canceled' ? <Badge label="Cancelada" tone="danger" /> : s.credit_cents > 0 ? <Badge label="Fiado" tone="warning" /> : null}
                </View>
              }
              onPress={() => router.push(`/sales/${s.id}`)}
            />
          ))
        )}
      </Section>

      {business.isManager ? (
        <Button
          title="Arquivar cliente"
          variant="ghost"
          icon="archive"
          onPress={async () => {
            if ((b?.balance_cents ?? 0) > 0) return toast.show('Este cliente possui saldo devedor em aberto.', 'error');
            if (!(await confirm('Arquivar cliente', 'O cliente deixa de aparecer nas listas. O histórico é mantido.', 'Arquivar', true))) return;
            try {
              await update.mutateAsync({ active: false });
              toast.show('Cliente arquivado.');
              router.back();
            } catch (e) {
              toast.show(errorMessage(e), 'error');
            }
          }}
        />
      ) : null}
    </Screen>
  );
}
