import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { ProGate } from '@/components/ProGate';
import { Badge, Card, Chips, ErrorState, KeyValue, ListItem, LoadingState, Screen, Section, Text } from '@/components/ui';
import { useBusinessAlerts, usePricingInsights, useStockRecommendations, type StockStatus } from '@/features/reports/api';
import { formatBRL, formatPercent, formatQuantity } from '@/lib/money';
import { useCurrentBusiness } from '@/providers/BusinessProvider';
import { spacing } from '@/theme/colors';

const STOCK_LABELS: Record<StockStatus, { label: string; tone: 'danger' | 'warning' | 'neutral' }> = {
  out_of_stock: { label: 'Sem estoque', tone: 'danger' },
  below_minimum: { label: 'Abaixo do mínimo', tone: 'danger' },
  ending_soon: { label: 'Acabando', tone: 'warning' },
  stale: { label: 'Parado', tone: 'neutral' },
};

const SEVERITY = { high: 'danger', medium: 'warning', low: 'primary' } as const;

function Insights() {
  const business = useCurrentBusiness();
  const [tab, setTab] = useState<'alerts' | 'stock' | 'pricing'>(business.isManager ? 'alerts' : 'stock');
  const [margin, setMargin] = useState('30');
  const alerts = useBusinessAlerts(business.id, business.isManager && tab === 'alerts');
  const stock = useStockRecommendations(business.id, tab === 'stock');
  const pricing = usePricingInsights(business.id, Number(margin), business.isManager && tab === 'pricing');

  const options = business.isManager
    ? ([
        { value: 'alerts', label: 'Alertas' },
        { value: 'stock', label: 'Estoque' },
        { value: 'pricing', label: 'Preços' },
      ] as const)
    : ([{ value: 'stock', label: 'Estoque' }] as const);

  return (
    <Screen>
      <Chips options={options} value={tab} onChange={setTab} />

      {tab === 'alerts' ? (
        alerts.isPending ? (
          <LoadingState />
        ) : alerts.error ? (
          <ErrorState error={alerts.error} onRetry={alerts.refetch} />
        ) : alerts.data.length === 0 ? (
          <Card>
            <Text variant="subtitle" tone="success">Nenhum alerta no momento ✓</Text>
            <Text tone="muted">Não encontramos sinais de prejuízo nas suas vendas, preços, despesas e contas.</Text>
          </Card>
        ) : (
          <Section title="Possíveis prejuízos">
            {alerts.data.map((a) => (
              <Card key={a.code + a.title} style={{ gap: 4 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm }}>
                  <Text bold style={{ flex: 1 }}>{a.title}</Text>
                  <Badge label={a.severity === 'high' ? 'Alta' : a.severity === 'medium' ? 'Média' : 'Baixa'} tone={SEVERITY[a.severity]} />
                </View>
                <Text tone="muted">{a.detail}</Text>
                {a.value_cents != null ? <Text bold tone={SEVERITY[a.severity]}>{formatBRL(a.value_cents)}</Text> : null}
              </Card>
            ))}
          </Section>
        )
      ) : null}

      {tab === 'stock' ? (
        stock.isPending ? (
          <LoadingState />
        ) : stock.error ? (
          <ErrorState error={stock.error} onRetry={stock.refetch} />
        ) : (
          <Section title="Recomendações de estoque">
            <Text variant="caption" tone="muted">{stock.data.method}</Text>
            {stock.data.items.length === 0 ? (
              <Card><Text tone="success">Estoque em dia. Nenhuma reposição necessária. ✓</Text></Card>
            ) : (
              <>
                <Card>
                  <KeyValue
                    label="Investimento sugerido em reposição"
                    value={formatBRL(stock.data.items.reduce((a, i) => a + i.suggested_cost_cents, 0))}
                    tone="primary"
                  />
                  <KeyValue
                    label="Dinheiro parado em estoque sem giro"
                    value={formatBRL(stock.data.items.reduce((a, i) => a + i.stale_value_cents, 0))}
                  />
                </Card>
                {stock.data.items.map((i) => (
                  <ListItem
                    key={i.product_id}
                    icon="cube"
                    iconTone={i.status === 'stale' ? 'primary' : i.status === 'ending_soon' ? 'warning' : 'danger'}
                    title={i.name}
                    subtitle={
                      i.status === 'stale'
                        ? `Sem vendas recentes · ${formatQuantity(i.stock_qty, i.unit)} em estoque (${formatBRL(i.stale_value_cents)})`
                        : `Estoque ${formatQuantity(i.stock_qty, i.unit)} · vende ${Number(i.avg_daily).toFixed(1).replace('.', ',')}/dia${i.days_of_cover != null ? ` · dura ~${Math.floor(Number(i.days_of_cover))} dias` : ''}${i.suggested_qty > 0 ? ` · comprar ${formatQuantity(i.suggested_qty, i.unit)}` : ''}`
                    }
                    right={<Badge label={STOCK_LABELS[i.status].label} tone={STOCK_LABELS[i.status].tone} />}
                    onPress={() => router.push(`/products/${i.product_id}`)}
                  />
                ))}
              </>
            )}
          </Section>
        )
      ) : null}

      {tab === 'pricing' ? (
        <Section title="Sugestões de precificação">
          <Text variant="label">Margem de lucro desejada</Text>
          <Chips
            options={['20', '30', '40', '50'].map((m) => ({ value: m, label: `${m}%` }))}
            value={margin}
            onChange={setMargin}
          />
          {pricing.isPending ? (
            <LoadingState />
          ) : pricing.error ? (
            <ErrorState error={pricing.error} onRetry={pricing.refetch} />
          ) : (
            <>
              <Text variant="caption" tone="muted">{pricing.data.method}</Text>
              <Card>
                <KeyValue label="Produtos com margem saudável" value={String(pricing.data.healthy_count)} tone="success" />
                <KeyValue label="Abaixo do custo" value={String(pricing.data.below_cost.length)} tone={pricing.data.below_cost.length ? 'danger' : 'muted'} />
                <KeyValue label="Margem abaixo da meta" value={String(pricing.data.low_margin.length)} />
                <KeyValue label="Sem custo cadastrado" value={String(pricing.data.missing_cost.length)} />
              </Card>
              {[...pricing.data.below_cost, ...pricing.data.low_margin].map((p) => (
                <ListItem
                  key={p.id}
                  icon={p.price_cents < p.cost_cents ? 'alert-circle' : 'pricetag'}
                  iconTone={p.price_cents < p.cost_cents ? 'danger' : 'warning'}
                  title={p.name}
                  subtitle={`Custo ${formatBRL(p.cost_cents)} · preço ${formatBRL(p.price_cents)} · margem ${formatPercent(p.margin_pct)}`}
                  right={<Text bold tone="success">{formatBRL(p.suggested_price_cents)}</Text>}
                  chevron
                  onPress={() => router.push(`/products/${p.id}/edit`)}
                />
              ))}
              {pricing.data.missing_cost.length > 0 ? (
                <Text variant="caption" tone="muted">
                  Cadastre o custo de {pricing.data.missing_cost.slice(0, 3).map((m) => m.name).join(', ')}
                  {pricing.data.missing_cost.length > 3 ? ' e outros' : ''} para calcular o lucro corretamente.
                </Text>
              ) : null}
              <Text variant="caption" tone="muted">Os preços sugeridos são uma referência. Considere também a concorrência e o perfil dos seus clientes.</Text>
            </>
          )}
        </Section>
      ) : null}
    </Screen>
  );
}

export default function InsightsScreen() {
  return (
    <ProGate
      feature="insights"
      title="Recomendações inteligentes"
      description="Alertas de possíveis prejuízos, reposição de estoque baseada no giro das vendas e sugestões de preço para atingir a margem desejada."
      fallbackScreen
    >
      <Insights />
    </ProGate>
  );
}
