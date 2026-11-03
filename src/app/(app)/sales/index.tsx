import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { PeriodFilter, usePeriod } from '@/components/PeriodFilter';
import { Badge, Card, Chips, EmptyState, ErrorState, KeyValue, ListItem, LoadingState, Screen, Text } from '@/components/ui';
import { useSales } from '@/features/sales/api';
import { formatDateTime } from '@/lib/dates';
import { formatBRL } from '@/lib/money';
import { useCurrentBusiness } from '@/providers/BusinessProvider';
import { spacing } from '@/theme/colors';

export default function SalesHistory() {
  const business = useCurrentBusiness();
  const [period, setPeriod] = usePeriod('week');
  const [status, setStatus] = useState<'all' | 'completed' | 'canceled'>('all');
  const { data, isPending, error, refetch, isRefetching } = useSales(business.id, period.range, status);
  const completed = (data ?? []).filter((s) => s.status === 'completed');
  const total = completed.reduce((a, s) => a + s.total_cents, 0);

  return (
    <Screen refreshing={isRefetching} onRefresh={refetch}>
      <PeriodFilter value={period} onChange={setPeriod} />
      <Chips
        options={[
          { value: 'all', label: 'Todas' },
          { value: 'completed', label: 'Concluídas' },
          { value: 'canceled', label: 'Canceladas' },
        ]}
        value={status}
        onChange={setStatus}
      />
      {isPending ? (
        <LoadingState />
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : data.length === 0 ? (
        <EmptyState icon="receipt-outline" title="Nenhuma venda no período" message="As vendas finalizadas aparecem aqui." actionLabel="Nova venda" onAction={() => router.push('/sell')} />
      ) : (
        <>
          <Card>
            <KeyValue label="Vendas concluídas" value={String(completed.length)} />
            <KeyValue label="Total vendido" value={formatBRL(total)} tone="primary" />
          </Card>
          <View style={{ gap: spacing.sm }}>
            {data.map((s) => (
              <ListItem
                key={s.id}
                icon={s.status === 'canceled' ? 'close-circle' : s.credit_cents > 0 ? 'time' : 'checkmark-circle'}
                iconTone={s.status === 'canceled' ? 'danger' : s.credit_cents > 0 ? 'warning' : 'success'}
                title={`Venda #${s.number}`}
                subtitle={`${formatDateTime(s.created_at)}${s.customers ? ` · ${s.customers.name}` : ''}`}
                right={
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Text bold style={s.status === 'canceled' ? { textDecorationLine: 'line-through' } : undefined}>
                      {formatBRL(s.total_cents)}
                    </Text>
                    {s.status === 'canceled' ? <Badge label="Cancelada" tone="danger" /> : s.credit_cents > 0 ? <Badge label="Fiado" tone="warning" /> : null}
                  </View>
                }
                onPress={() => router.push(`/sales/${s.id}`)}
              />
            ))}
          </View>
        </>
      )}
    </Screen>
  );
}
