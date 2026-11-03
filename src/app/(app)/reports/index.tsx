import { useState } from 'react';
import { View } from 'react-native';

import { PeriodFilter, usePeriod } from '@/components/PeriodFilter';
import { ProGate } from '@/components/ProGate';
import { BarChart, Button, Card, EmptyState, ErrorState, KeyValue, LoadingState, Row, Screen, Section, StatCard, Text, useToast } from '@/components/ui';
import { buildReportHtml } from '@/features/documents/templates';
import { WEEKDAYS, useSalesReport } from '@/features/reports/api';
import { salesReportToPdf, salesReportToSheets } from '@/features/reports/export';
import { PAYMENT_LABELS } from '@/features/sales/cart';
import { shareHtmlAsPdf } from '@/features/sales/share';
import { formatDate } from '@/lib/dates';
import { errorMessage } from '@/lib/errors';
import { fileStamp, shareBytes } from '@/lib/fileShare';
import { formatBRL, formatPercent } from '@/lib/money';
import { XLSX_MIME, buildXlsx } from '@/lib/xlsx';
import { useCurrentBusiness } from '@/providers/BusinessProvider';
import { spacing } from '@/theme/colors';

function Reports() {
  const business = useCurrentBusiness();
  const toast = useToast();
  const [period, setPeriod] = usePeriod('month');
  const { data, isPending, error, refetch, isRefetching } = useSalesReport(business.id, period.range);
  const [exporting, setExporting] = useState<'pdf' | 'xlsx' | null>(null);
  const periodLabel = `${formatDate(period.range.from)} a ${formatDate(period.range.to)}`;

  const exportPdf = async () => {
    if (!data) return;
    try {
      setExporting('pdf');
      const { summary, tables } = salesReportToPdf(data);
      await shareHtmlAsPdf(buildReportHtml(business, 'Relatório de vendas', periodLabel, summary, tables), 'Relatório de vendas');
    } catch (e) {
      toast.show(errorMessage(e), 'error');
    } finally {
      setExporting(null);
    }
  };

  const exportXlsx = async () => {
    if (!data) return;
    try {
      setExporting('xlsx');
      await shareBytes(`relatorio-vendas-${fileStamp()}.xlsx`, buildXlsx(salesReportToSheets(data)), XLSX_MIME);
    } catch (e) {
      toast.show(errorMessage(e), 'error');
    } finally {
      setExporting(null);
    }
  };

  return (
    <Screen refreshing={isRefetching} onRefresh={refetch}>
      <PeriodFilter value={period} onChange={setPeriod} />
      {isPending ? (
        <LoadingState />
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : data.summary.sales_count === 0 ? (
        <EmptyState icon="bar-chart-outline" title="Sem vendas no período" message="Escolha outro período ou registre vendas para ver os relatórios." />
      ) : (
        <>
          <Row wrap>
            <StatCard
              label="Faturamento"
              value={formatBRL(data.summary.revenue_cents)}
              icon="trending-up"
              caption={
                data.previous_period.revenue_change_pct != null
                  ? `${data.previous_period.revenue_change_pct >= 0 ? '+' : ''}${formatPercent(data.previous_period.revenue_change_pct)} vs. período anterior`
                  : `${data.summary.sales_count} vendas`
              }
            />
            {data.summary.gross_profit_cents != null ? (
              <StatCard
                label="Lucro bruto"
                value={formatBRL(data.summary.gross_profit_cents)}
                icon="cash"
                tone={data.summary.gross_profit_cents >= 0 ? 'success' : 'danger'}
                caption={`Margem ${formatPercent(data.summary.gross_margin_pct)}`}
              />
            ) : null}
          </Row>
          <Card>
            <KeyValue label="Vendas" value={String(data.summary.sales_count)} />
            <KeyValue label="Ticket médio" value={formatBRL(data.summary.average_ticket_cents)} />
            <KeyValue label="Itens vendidos" value={String(Number(data.summary.items_sold))} />
            <KeyValue label="Descontos concedidos" value={formatBRL(data.summary.discount_cents)} />
            <KeyValue label="Vendido no fiado" value={formatBRL(data.summary.credit_sales_cents)} />
            <KeyValue label={`Canceladas (${data.summary.canceled_count})`} value={formatBRL(data.summary.canceled_cents)} tone="danger" />
          </Card>

          <Row>
            <Button title="PDF" icon="document-text" variant="secondary" style={{ flex: 1 }} loading={exporting === 'pdf'} disabled={exporting != null} onPress={exportPdf} />
            <Button title="Excel" icon="grid" variant="secondary" style={{ flex: 1 }} loading={exporting === 'xlsx'} disabled={exporting != null} onPress={exportXlsx} />
          </Row>

          <Section title="Vendas por dia da semana">
            <Card>
              <BarChart
                data={[1, 2, 3, 4, 5, 6, 7].map((w) => {
                  const d = data.by_weekday.find((x) => x.weekday === w);
                  return { label: WEEKDAYS[w]!, value: d?.revenue_cents ?? 0, detail: `${d?.sales_count ?? 0} vendas` };
                })}
                formatValue={formatBRL}
                height={130}
              />
            </Card>
          </Section>

          <Section title="Horários de movimento">
            <Card>
              <BarChart
                data={data.by_hour.map((h) => ({ label: `${h.hour}h`, value: h.revenue_cents, detail: `${h.sales_count} vendas` }))}
                formatValue={formatBRL}
                height={110}
              />
            </Card>
          </Section>

          <Section title="Produtos">
            <Card>
              {data.by_product.slice(0, 20).map((p, i) => (
                <View key={p.product_id ?? i} style={{ paddingVertical: 6, gap: 2 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm }}>
                    <Text style={{ flex: 1 }} numberOfLines={1}>{i + 1}. {p.name}</Text>
                    <Text bold>{formatBRL(p.revenue_cents)}</Text>
                  </View>
                  <Text variant="caption" tone={p.profit_cents != null && p.profit_cents < 0 ? 'danger' : 'muted'}>
                    {Number(p.quantity)} vendidos
                    {p.profit_cents != null ? ` · lucro ${formatBRL(p.profit_cents)} · margem ${formatPercent(p.margin_pct)}` : ''}
                  </Text>
                </View>
              ))}
            </Card>
          </Section>

          {data.by_category.length > 1 ? (
            <Section title="Categorias">
              <Card>
                {data.by_category.map((c) => (
                  <KeyValue key={c.category} label={c.category} value={formatBRL(c.revenue_cents)} />
                ))}
              </Card>
            </Section>
          ) : null}

          <Section title="Formas de pagamento">
            <Card>
              {data.by_payment_method.map((m) => (
                <KeyValue key={m.method} label={`${PAYMENT_LABELS[m.method]} (${m.sales_count})`} value={formatBRL(m.total_cents)} />
              ))}
            </Card>
          </Section>

          {data.top_customers.length > 0 ? (
            <Section title="Melhores clientes">
              <Card>
                {data.top_customers.map((c, i) => (
                  <KeyValue key={c.customer_id} label={`${i + 1}. ${c.name} (${c.sales_count})`} value={formatBRL(c.revenue_cents)} />
                ))}
              </Card>
            </Section>
          ) : null}
        </>
      )}
    </Screen>
  );
}

export default function ReportsScreen() {
  return (
    <ProGateWrapper>
      <Reports />
    </ProGateWrapper>
  );
}

function ProGateWrapper({ children }: { children: React.ReactNode }) {
  return (
    <ProGate
      feature="reports"
      title="Relatórios detalhados"
      description="Lucro por produto, categorias, dias e horários de maior movimento, melhores clientes e exportação em PDF e Excel."
      fallbackScreen
    >
      {children}
    </ProGate>
  );
}
