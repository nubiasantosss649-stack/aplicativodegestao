import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { ManagerOnly } from '@/components/ManagerOnly';
import { Badge, Button, Card, Chips, EmptyState, ErrorState, KeyValue, LoadingState, Screen, Text, useToast } from '@/components/ui';
import { METHOD_OPTIONS, useFinancialEntries, usePayEntry } from '@/features/finance/api';
import { daysOverdue, formatDate } from '@/lib/dates';
import { errorMessage } from '@/lib/errors';
import { formatBRL } from '@/lib/money';
import { useCurrentBusiness } from '@/providers/BusinessProvider';
import { spacing } from '@/theme/colors';

function Payables() {
  const business = useCurrentBusiness();
  const toast = useToast();
  const { data, isPending, error, refetch, isRefetching } = useFinancialEntries(business.id, { kind: 'expense', status: 'pending' });
  const pay = usePayEntry(business.id);
  const [method, setMethod] = useState<'cash' | 'pix' | 'card'>('pix');

  if (isPending) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  const total = data.reduce((a, e) => a + e.amount_cents, 0);
  const overdue = data.filter((e) => e.due_date && daysOverdue(e.due_date) > 0);

  return (
    <Screen
      refreshing={isRefetching}
      onRefresh={refetch}
      footer={<Button title="Nova conta a pagar" icon="add" onPress={() => router.push({ pathname: '/finance/new', params: { kind: 'expense', pending: '1' } })} />}
    >
      <Card>
        <KeyValue label="Total em aberto" value={formatBRL(total)} tone="primary" />
        <KeyValue label={`Vencidas (${overdue.length})`} value={formatBRL(overdue.reduce((a, e) => a + e.amount_cents, 0))} tone={overdue.length ? 'danger' : 'muted'} />
      </Card>
      {data.length === 0 ? (
        <EmptyState icon="checkmark-done-circle" title="Nenhuma conta a pagar" message="Lance contas futuras (aluguel, fornecedores) para não esquecer os vencimentos." />
      ) : (
        <>
          <Text variant="label">Pagar com:</Text>
          <Chips options={METHOD_OPTIONS} value={method} onChange={setMethod} />
          {data.map((e) => {
            const late = e.due_date ? daysOverdue(e.due_date) : 0;
            return (
              <Card key={e.id} style={{ gap: spacing.sm }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm }}>
                  <Text bold style={{ flex: 1 }}>{e.description}</Text>
                  <Text bold>{formatBRL(e.amount_cents)}</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
                  <Text variant="caption" tone="muted">Vence {formatDate(e.due_date)}</Text>
                  {late > 0 ? <Badge label={`${late} dias de atraso`} tone="danger" /> : null}
                </View>
                <Button
                  title="Marcar como paga"
                  size="sm"
                  variant="success"
                  icon="checkmark"
                  loading={pay.isPending && pay.variables?.id === e.id}
                  onPress={async () => {
                    try {
                      await pay.mutateAsync({ id: e.id, method });
                      toast.show('Conta paga!');
                    } catch (err) {
                      toast.show(errorMessage(err), 'error');
                    }
                  }}
                />
              </Card>
            );
          })}
        </>
      )}
    </Screen>
  );
}

export default function PayablesScreen() {
  return (
    <ManagerOnly>
      <Payables />
    </ManagerOnly>
  );
}
