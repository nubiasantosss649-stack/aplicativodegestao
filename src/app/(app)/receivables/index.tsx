import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Badge, Card, Chips, EmptyState, ErrorState, KeyValue, ListItem, LoadingState, Screen, Text } from '@/components/ui';
import { useCustomerBalances } from '@/features/customers/api';
import { daysOverdue, formatDate } from '@/lib/dates';
import { formatBRL } from '@/lib/money';
import { useCurrentBusiness } from '@/providers/BusinessProvider';

/** Contas a receber (fiados) agrupadas por cliente. */
export default function Receivables() {
  const business = useCurrentBusiness();
  const params = useLocalSearchParams<{ filter?: string }>();
  const [filter, setFilter] = useState<'open' | 'overdue'>(params.filter === 'overdue' ? 'overdue' : 'open');
  const { data, isPending, error, refetch, isRefetching } = useCustomerBalances(business.id);

  if (isPending) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;

  const debtors = data.filter((c) => c.balance_cents > 0);
  const overdue = debtors.filter((c) => c.overdue_cents > 0);
  const rows = (filter === 'overdue' ? overdue : debtors).sort((a, b) =>
    (a.oldest_due_date ?? '').localeCompare(b.oldest_due_date ?? ''),
  );
  const totalOpen = debtors.reduce((a, c) => a + c.balance_cents, 0);
  const totalOverdue = overdue.reduce((a, c) => a + c.overdue_cents, 0);

  return (
    <Screen refreshing={isRefetching} onRefresh={refetch}>
      <Card>
        <KeyValue label="Total a receber" value={formatBRL(totalOpen)} tone="primary" />
        <KeyValue label="Vencido" value={formatBRL(totalOverdue)} tone={totalOverdue > 0 ? 'danger' : 'success'} />
        <KeyValue label="Clientes devendo" value={String(debtors.length)} />
        <KeyValue label="Clientes inadimplentes" value={String(overdue.length)} tone={overdue.length ? 'danger' : 'muted'} />
      </Card>
      <Chips
        options={[
          { value: 'open', label: `Em aberto (${debtors.length})` },
          { value: 'overdue', label: `Atrasados (${overdue.length})` },
        ]}
        value={filter}
        onChange={setFilter}
      />
      {rows.length === 0 ? (
        <EmptyState
          icon="happy-outline"
          title={filter === 'overdue' ? 'Nenhum fiado atrasado' : 'Nenhum fiado em aberto'}
          message="Vendas no fiado aparecem aqui automaticamente. Você também pode lançar um fiado manual no cadastro do cliente."
        />
      ) : (
        rows.map((c) => {
          const days = c.oldest_due_date ? daysOverdue(c.oldest_due_date) : 0;
          return (
            <ListItem
              key={c.customer_id}
              icon="person"
              iconTone={c.overdue_cents > 0 ? 'danger' : 'warning'}
              title={c.name}
              subtitle={
                c.oldest_due_date
                  ? days > 0
                    ? `Venceu em ${formatDate(c.oldest_due_date)} · ${days} ${days === 1 ? 'dia' : 'dias'} de atraso`
                    : `Próximo vencimento ${formatDate(c.oldest_due_date)}`
                  : undefined
              }
              right={
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Text bold tone={c.overdue_cents > 0 ? 'danger' : 'default'}>{formatBRL(c.balance_cents)}</Text>
                  {c.overdue_cents > 0 ? <Badge label="Atrasado" tone="danger" /> : null}
                </View>
              }
              chevron
              onPress={() => router.push(`/receivables/${c.customer_id}`)}
            />
          );
        })
      )}
    </Screen>
  );
}
