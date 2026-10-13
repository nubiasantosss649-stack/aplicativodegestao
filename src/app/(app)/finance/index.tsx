import { router } from 'expo-router';
import { View } from 'react-native';

import { ManagerOnly } from '@/components/ManagerOnly';
import { PeriodFilter, usePeriod } from '@/components/PeriodFilter';
import { BarChart, Button, Card, ErrorState, KeyValue, LoadingState, Row, Screen, Section, StatCard, Text } from '@/components/ui';
import { useFinanceSummary } from '@/features/finance/api';
import { PAYMENT_LABELS } from '@/features/sales/cart';
import { formatBRL } from '@/lib/money';
import { useCurrentBusiness } from '@/providers/BusinessProvider';
import { spacing } from '@/theme/colors';

function FinanceContent() {
  const business = useCurrentBusiness();
  const [period, setPeriod] = usePeriod('month');
  const { data, isPending, error, refetch, isRefetching } = useFinanceSummary(business.id, period.range);

  return (
    <Screen refreshing={isRefetching} onRefresh={refetch}>
      <PeriodFilter value={period} onChange={setPeriod} />
      {isPending ? (
        <LoadingState />
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : (
        <>
          <Section title="Fluxo de caixa">
            <Row wrap>
              <StatCard label="Entradas" value={formatBRL(data.cash_in_cents)} icon="arrow-down-circle" tone="success" />
              <StatCard label="Saídas" value={formatBRL(data.cash_out_cents)} icon="arrow-up-circle" tone="danger" />
            </Row>
            <Card>
              <KeyValue label="Vendas pagas no ato" value={formatBRL(data.cash_in_breakdown.sales)} />
              <KeyValue label="Fiados recebidos" value={formatBRL(data.cash_in_breakdown.receivables)} />
              <KeyValue label="Outras receitas" value={formatBRL(data.cash_in_breakdown.other_income)} />
              <KeyValue label="Despesas pagas" value={`-${formatBRL(data.cash_out_cents)}`} tone="danger" />
              <KeyValue label="Saldo do período" value={formatBRL(data.cash_balance_cents)} tone={data.cash_balance_cents >= 0 ? 'success' : 'danger'} />
            </Card>
          </Section>

          <Section title="Resultado (lucro estimado)">
            <Card>
              <KeyValue label="Faturamento (vendas)" value={formatBRL(data.revenue_cents)} tone="primary" />
              <KeyValue label="Custo das mercadorias" value={`-${formatBRL(data.cogs_cents)}`} />
              <KeyValue label="Lucro bruto" value={formatBRL(data.gross_profit_cents)} />
              <KeyValue label="Despesas do período" value={`-${formatBRL(data.expenses_cents)}`} tone="danger" />
              <KeyValue label="Lucro estimado" value={formatBRL(data.net_profit_cents)} tone={data.net_profit_cents >= 0 ? 'success' : 'danger'} />
            </Card>
            <Text variant="caption" tone="muted">
              Faturamento inclui vendas fiado; o fluxo de caixa considera apenas o dinheiro que realmente entrou.
            </Text>
          </Section>

          <Section title="Despesas por categoria">
            <Card>
              <BarChart
                data={data.expenses_by_category.map((c) => ({ label: c.category.slice(0, 8), value: c.total_cents, detail: c.category }))}
                formatValue={formatBRL}
                height={130}
                emptyMessage="Nenhuma despesa no período"
              />
            </Card>
          </Section>

          {data.received_by_method.length > 0 ? (
            <Section title="Recebido por forma de pagamento">
              <Card>
                {data.received_by_method.map((m) => (
                  <KeyValue key={m.method} label={PAYMENT_LABELS[m.method]} value={formatBRL(m.total_cents)} />
                ))}
              </Card>
            </Section>
          ) : null}

          <Card onPress={() => router.push('/finance/payables')} style={{ gap: 4 }}>
            <Text variant="subtitle">Contas a pagar</Text>
            <KeyValue label="Em aberto" value={formatBRL(data.payables_open_cents)} />
            <KeyValue label={`Vencidas (${data.payables_overdue_count})`} value={formatBRL(data.payables_overdue_cents)} tone={data.payables_overdue_cents > 0 ? 'danger' : 'muted'} />
          </Card>

          <View style={{ gap: spacing.sm }}>
            <Button title="Nova despesa" icon="remove-circle" variant="danger" onPress={() => router.push({ pathname: '/finance/new', params: { kind: 'expense' } })} />
            <Button title="Nova receita" icon="add-circle" variant="success" onPress={() => router.push({ pathname: '/finance/new', params: { kind: 'income' } })} />
            <Row>
              <Button title="Despesas" variant="secondary" style={{ flex: 1 }} onPress={() => router.push({ pathname: '/finance/entries', params: { kind: 'expense' } })} />
              <Button title="Receitas" variant="secondary" style={{ flex: 1 }} onPress={() => router.push({ pathname: '/finance/entries', params: { kind: 'income' } })} />
            </Row>
          </View>
        </>
      )}
    </Screen>
  );
}

export default function Finance() {
  return (
    <ManagerOnly>
      <FinanceContent />
    </ManagerOnly>
  );
}
