import { router } from 'expo-router';
import { View } from 'react-native';

import { PeriodFilter, usePeriod } from '@/components/PeriodFilter';
import { PlanBanner } from '@/components/PlanBanner';
import { ProGate } from '@/components/ProGate';
import {
  BarChart,
  Card,
  EmptyState,
  ErrorState,
  KeyValue,
  ListItem,
  LoadingState,
  Row,
  Screen,
  Section,
  StatCard,
  Text,
} from '@/components/ui';
import { useDashboard } from '@/features/dashboard/api';
import { useBusinessAlerts } from '@/features/reports/api';
import { useEntitlements } from '@/features/subscription/api';
import { hasFeature } from '@/features/subscription/plans';
import { formatDateTime, formatShortDay } from '@/lib/dates';
import { formatBRL, formatQuantity } from '@/lib/money';
import { useCurrentBusiness } from '@/providers/BusinessProvider';
import { spacing } from '@/theme/colors';

const RECENT_ICONS = {
  sale: 'cart',
  receivable_payment: 'cash',
  income: 'arrow-down-circle',
  expense: 'arrow-up-circle',
} as const;

export default function Dashboard() {
  const business = useCurrentBusiness();
  const [period, setPeriod] = usePeriod('month');
  const { data, isPending, error, refetch, isRefetching } = useDashboard(business.id, period.range);

  return (
    <Screen refreshing={isRefetching} onRefresh={refetch}>
      <View style={{ gap: 2 }}>
        <Text tone="muted">Olá! Este é o resumo de</Text>
        <Text variant="title">{business.name}</Text>
      </View>

      {isPending ? (
        <LoadingState />
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : (
        <>
          <Card
            style={{ gap: spacing.xs }}
            onPress={() => router.push('/sales')}
            accessibilityLabel="Vendas de hoje"
          >
            <Text tone="muted">Vendas de hoje</Text>
            <Text variant="hero" tone="primary">
              {formatBRL(data.today.revenue_cents)}
            </Text>
            <Text variant="caption" tone="muted">
              {data.today.sales_count} {data.today.sales_count === 1 ? 'venda' : 'vendas'} hoje
            </Text>
          </Card>

          <PlanBanner businessId={business.id} compact />

          <Card onPress={() => router.push('/assistant')} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }} accessibilityLabel="Abrir Assistente IA">
            <Text variant="title">✨</Text>
            <View style={{ flex: 1 }}>
              <Text bold>Pergunte ao Assistente IA</Text>
              <Text variant="caption" tone="muted">“Qual foi meu lucro neste mês?” · “Quem está me devendo?”</Text>
            </View>
          </Card>
          {business.isManager ? <AlertsCard businessId={business.id} /> : null}

          <PeriodFilter value={period} onChange={setPeriod} />

          <Row wrap>
            <StatCard
              label="Faturamento"
              value={formatBRL(data.revenue_cents)}
              icon="trending-up"
              caption={`${data.sales_count} vendas · ticket ${formatBRL(data.average_ticket_cents)}`}
            />
            <StatCard
              label="Recebido"
              value={formatBRL(data.received_cents)}
              icon="wallet"
              tone="success"
              caption="Dinheiro que entrou"
              onPress={business.isManager ? () => router.push('/finance') : undefined}
            />
          </Row>
          {business.isManager ? (
            <Row wrap>
              <StatCard
                label="Despesas"
                value={formatBRL(data.expenses_cents)}
                icon="trending-down"
                tone="danger"
                onPress={() => router.push({ pathname: '/finance/entries', params: { kind: 'expense' } })}
              />
              <StatCard
                label="Lucro estimado"
                value={formatBRL(data.estimated_profit_cents)}
                icon="analytics"
                tone={(data.estimated_profit_cents ?? 0) >= 0 ? 'success' : 'danger'}
                caption="Faturamento − custo − despesas"
              />
            </Row>
          ) : null}
          <Row wrap>
            <StatCard
              label="A receber (fiado)"
              value={formatBRL(data.receivables_open_cents)}
              icon="time"
              tone="warning"
              onPress={() => router.push('/receivables')}
            />
            <StatCard
              label="Fiados vencidos"
              value={formatBRL(data.receivables_overdue_cents)}
              icon="alert-circle"
              tone={data.receivables_overdue_cents > 0 ? 'danger' : 'neutral'}
              caption={`${data.overdue_customers} ${data.overdue_customers === 1 ? 'cliente' : 'clientes'}`}
              onPress={() => router.push({ pathname: '/receivables', params: { filter: 'overdue' } })}
            />
          </Row>

          <ProGate
            feature="advanced_dashboard"
            title="Gráfico e produtos campeões"
            description="Veja a evolução das vendas dia a dia e quais produtos mais faturam."
          >
            <Card style={{ gap: spacing.md }}>
              <Text variant="subtitle">Vendas no período</Text>
              <BarChart
                data={data.daily.map((d) => ({
                  label: formatShortDay(d.day),
                  value: d.total_cents,
                  detail: `${d.sales_count} vendas`,
                }))}
                formatValue={formatBRL}
              />
            </Card>
          </ProGate>

          <Section title="Estoque baixo" actionLabel="Ver estoque" onAction={() => router.push('/stock')}>
            {data.low_stock.length === 0 ? (
              <Card>
                <Text tone="muted">Nenhum produto abaixo do estoque mínimo. 👍</Text>
              </Card>
            ) : (
              data.low_stock
                .slice(0, 5)
                .map((p) => (
                  <ListItem
                    key={p.id}
                    icon="warning"
                    iconTone="danger"
                    title={p.name}
                    subtitle={`Em estoque: ${formatQuantity(p.stock_qty, p.unit)} · mínimo ${formatQuantity(p.min_stock, p.unit)}`}
                    chevron
                    onPress={() => router.push(`/products/${p.id}`)}
                  />
                ))
            )}
          </Section>

          <ProGate
            feature="advanced_dashboard"
            title="Mais vendidos"
            description="Descubra quais produtos trazem mais dinheiro para o seu negócio."
          >
            <Section title="Mais vendidos">
              {data.top_products.length === 0 ? (
                <EmptyState
                  icon="cart-outline"
                  title="Nenhuma venda no período"
                  message="Registre sua primeira venda para ver os produtos campeões aqui."
                  actionLabel="Nova venda"
                  onAction={() => router.push('/sell')}
                />
              ) : (
                <Card padded>
                  {data.top_products.map((p, i) => (
                    <KeyValue
                      key={p.product_id ?? i}
                      label={`${i + 1}. ${p.name} (${Number(p.quantity)})`}
                      value={formatBRL(p.total_cents)}
                    />
                  ))}
                </Card>
              )}
            </Section>
          </ProGate>

          <Section title="Últimas movimentações">
            {data.recent.length === 0 ? (
              <Card>
                <Text tone="muted">Ainda não há movimentações.</Text>
              </Card>
            ) : (
              data.recent.map((r) => (
                <ListItem
                  key={`${r.kind}-${r.id}`}
                  icon={RECENT_ICONS[r.kind]}
                  iconTone={
                    r.kind === 'expense' || r.status === 'canceled' || r.status === 'reversed'
                      ? 'danger'
                      : 'success'
                  }
                  title={r.description}
                  subtitle={`${formatDateTime(r.at)}${r.status === 'canceled' ? ' · cancelada' : r.status === 'reversed' ? ' · estornado' : r.status === 'pending' ? ' · pendente' : ''}`}
                  right={
                    <Text bold tone={r.kind === 'expense' ? 'danger' : 'default'}>
                      {r.kind === 'expense' ? '-' : ''}
                      {formatBRL(r.amount_cents)}
                    </Text>
                  }
                  onPress={r.kind === 'sale' ? () => router.push(`/sales/${r.id}`) : undefined}
                />
              ))
            )}
          </Section>
        </>
      )}
    </Screen>
  );
}

/** Alertas de possíveis prejuízos (Pro). */
function AlertsCard({ businessId }: { businessId: string }) {
  const entitlements = useEntitlements(businessId);
  const enabled = hasFeature(entitlements.data, 'insights');
  const { data } = useBusinessAlerts(businessId, enabled);
  if (!enabled || !data || data.length === 0) return null;
  const high = data.filter((a) => a.severity === 'high').length;
  return (
    <Card onPress={() => router.push('/insights')} style={{ gap: 4 }} accessibilityLabel="Ver alertas">
      <Text bold tone={high ? 'danger' : 'warning'}>
        ⚠️ {data.length} {data.length === 1 ? 'alerta' : 'alertas'} de possível prejuízo
      </Text>
      <Text variant="caption" tone="muted" numberOfLines={2}>
        {data.slice(0, 2).map((a) => a.title).join(' · ')}
      </Text>
    </Card>
  );
}
