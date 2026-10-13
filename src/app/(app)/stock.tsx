import { router } from 'expo-router';
import { useState } from 'react';

import { Badge, Card, Chips, EmptyState, ErrorState, KeyValue, ListItem, LoadingState, Screen, Text } from '@/components/ui';
import { useProducts } from '@/features/products/api';
import { formatBRL, formatQuantity, lineTotal } from '@/lib/money';
import { useCurrentBusiness } from '@/providers/BusinessProvider';

/** Visão geral do estoque: valor parado em mercadoria e alertas de estoque baixo. */
export default function Stock() {
  const business = useCurrentBusiness();
  const [filter, setFilter] = useState<'low' | 'all'>('low');
  const { data, isPending, error, refetch, isRefetching } = useProducts(business.id);

  if (isPending) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;

  const tracked = data.filter((p) => p.track_stock);
  const low = tracked.filter((p) => Number(p.stock_qty) <= Number(p.min_stock));
  const costValue = tracked.reduce((a, p) => a + lineTotal(p.cost_cents, Math.max(0, Number(p.stock_qty))), 0);
  const saleValue = tracked.reduce((a, p) => a + lineTotal(p.price_cents, Math.max(0, Number(p.stock_qty))), 0);
  const rows = (filter === 'low' ? low : tracked).sort((a, b) => Number(a.stock_qty) - Number(b.stock_qty));

  return (
    <Screen refreshing={isRefetching} onRefresh={refetch}>
      <Card>
        <KeyValue label="Produtos com estoque controlado" value={String(tracked.length)} />
        <KeyValue label="Abaixo do mínimo" value={String(low.length)} tone={low.length ? 'danger' : 'success'} />
        {business.isManager ? <KeyValue label="Valor em estoque (custo)" value={formatBRL(costValue)} /> : null}
        <KeyValue label="Valor em estoque (venda)" value={formatBRL(saleValue)} tone="primary" />
      </Card>
      <Chips
        options={[
          { value: 'low', label: `Estoque baixo (${low.length})` },
          { value: 'all', label: 'Todos' },
        ]}
        value={filter}
        onChange={setFilter}
      />
      {rows.length === 0 ? (
        <EmptyState icon="checkmark-done-circle" title={filter === 'low' ? 'Tudo em dia!' : 'Nenhum produto'} message={filter === 'low' ? 'Nenhum produto abaixo do estoque mínimo.' : 'Cadastre produtos para controlar o estoque.'} />
      ) : (
        rows.map((p) => {
          const isLow = Number(p.stock_qty) <= Number(p.min_stock);
          return (
            <ListItem
              key={p.id}
              icon="cube"
              iconTone={isLow ? 'danger' : 'primary'}
              title={p.name}
              subtitle={`Mínimo ${formatQuantity(p.min_stock, p.unit)}${isLow && Number(p.min_stock) > Number(p.stock_qty) ? ` · repor ${formatQuantity(Number(p.min_stock) - Number(p.stock_qty), p.unit)}` : ''}`}
              right={isLow ? <Badge label={formatQuantity(p.stock_qty, p.unit)} tone="danger" /> : <Text bold>{formatQuantity(p.stock_qty, p.unit)}</Text>}
              chevron
              onPress={() => router.push(`/products/${p.id}`)}
            />
          );
        })
      )}
    </Screen>
  );
}
