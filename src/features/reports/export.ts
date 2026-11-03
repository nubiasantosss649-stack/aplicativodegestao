import type { ReportTable } from '@/features/documents/templates';
import { PAYMENT_LABELS } from '@/features/sales/cart';
import { formatDate, formatDateTime } from '@/lib/dates';
import { formatBRL, formatPercent } from '@/lib/money';
import type { CellValue, Sheet } from '@/lib/xlsx';

import { WEEKDAYS, type SalesReport } from './api';

const money = (cents: number | null | undefined): CellValue => (cents == null ? null : { money: Number(cents) });

/** Relatório de vendas -> abas do Excel. */
export function salesReportToSheets(r: SalesReport): Sheet[] {
  const s = r.summary;
  return [
    {
      name: 'Resumo',
      columns: ['Indicador', 'Valor'],
      rows: [
        ['Período', `${formatDate(r.period.from)} a ${formatDate(r.period.to)}`],
        ['Vendas', s.sales_count],
        ['Faturamento', money(s.revenue_cents)],
        ['Ticket médio', money(s.average_ticket_cents)],
        ['Descontos', money(s.discount_cents)],
        ['Vendas no fiado', money(s.credit_sales_cents)],
        ['Custo das mercadorias', money(s.cogs_cents)],
        ['Lucro bruto', money(s.gross_profit_cents)],
        ['Margem bruta (%)', s.gross_margin_pct],
        ['Vendas canceladas', s.canceled_count],
        ['Faturamento período anterior', money(r.previous_period.revenue_cents)],
        ['Variação (%)', r.previous_period.revenue_change_pct],
      ],
    },
    {
      name: 'Produtos',
      columns: ['Produto', 'Quantidade', 'Faturamento', 'Custo', 'Lucro', 'Margem (%)'],
      rows: r.by_product.map((p) => [p.name, Number(p.quantity), money(p.revenue_cents), money(p.cost_cents), money(p.profit_cents), p.margin_pct]),
    },
    {
      name: 'Categorias',
      columns: ['Categoria', 'Quantidade', 'Faturamento', 'Lucro'],
      rows: r.by_category.map((c) => [c.category, Number(c.quantity), money(c.revenue_cents), money(c.profit_cents)]),
    },
    {
      name: 'Pagamentos',
      columns: ['Forma', 'Vendas', 'Valor'],
      rows: r.by_payment_method.map((m) => [PAYMENT_LABELS[m.method], m.sales_count, money(m.total_cents)]),
    },
    {
      name: 'Dias da semana',
      columns: ['Dia', 'Vendas', 'Faturamento'],
      rows: r.by_weekday.map((d) => [WEEKDAYS[d.weekday] ?? String(d.weekday), d.sales_count, money(d.revenue_cents)]),
    },
    {
      name: 'Melhores clientes',
      columns: ['Cliente', 'Compras', 'Total'],
      rows: r.top_customers.map((c) => [c.name, c.sales_count, money(c.revenue_cents)]),
    },
  ];
}

/** Relatório de vendas -> resumo e tabelas do PDF. */
export function salesReportToPdf(r: SalesReport): { summary: { label: string; value: string }[]; tables: ReportTable[] } {
  const s = r.summary;
  const summary = [
    { label: 'Vendas', value: String(s.sales_count) },
    { label: 'Faturamento', value: formatBRL(s.revenue_cents) },
    { label: 'Ticket médio', value: formatBRL(s.average_ticket_cents) },
    { label: 'Descontos', value: formatBRL(s.discount_cents) },
  ];
  if (s.gross_profit_cents != null) {
    summary.push({ label: 'Custo das mercadorias', value: formatBRL(s.cogs_cents) });
    summary.push({ label: 'Lucro bruto', value: `${formatBRL(s.gross_profit_cents)} (${formatPercent(s.gross_margin_pct)})` });
  }
  if (r.previous_period.revenue_change_pct != null) {
    summary.push({ label: 'Variação vs. período anterior', value: formatPercent(r.previous_period.revenue_change_pct) });
  }
  const showProfit = s.gross_profit_cents != null;
  return {
    summary,
    tables: [
      {
        title: 'Produtos',
        columns: showProfit ? ['Produto', 'Qtd.', 'Faturamento', 'Lucro', 'Margem'] : ['Produto', 'Qtd.', 'Faturamento'],
        alignRight: [1, 2, 3, 4],
        rows: r.by_product.map((p) =>
          showProfit
            ? [p.name, Number(p.quantity), formatBRL(p.revenue_cents), formatBRL(p.profit_cents), formatPercent(p.margin_pct)]
            : [p.name, Number(p.quantity), formatBRL(p.revenue_cents)],
        ),
      },
      {
        title: 'Formas de pagamento',
        columns: ['Forma', 'Vendas', 'Valor'],
        alignRight: [1, 2],
        rows: r.by_payment_method.map((m) => [PAYMENT_LABELS[m.method], m.sales_count, formatBRL(m.total_cents)]),
      },
      {
        title: 'Melhores clientes',
        columns: ['Cliente', 'Compras', 'Total'],
        alignRight: [1, 2],
        rows: r.top_customers.map((c) => [c.name, c.sales_count, formatBRL(c.revenue_cents)]),
      },
    ],
  };
}

type Row = Record<string, unknown>;
const rows = (data: Record<string, unknown>, key: string): Row[] => (Array.isArray(data[key]) ? (data[key] as Row[]) : []);
const str = (v: unknown): CellValue => (v == null ? null : String(v));
const num = (v: unknown): CellValue => (v == null ? null : Number(v));
const dt = (v: unknown): CellValue => (v ? { date: formatDateTime(String(v)) } : null);
const d = (v: unknown): CellValue => (v ? { date: formatDate(String(v)) } : null);

/** Exportação completa (LGPD) -> planilha com uma aba por tipo de dado. */
export function businessExportToSheets(data: Record<string, unknown>): Sheet[] {
  const customers = new Map(rows(data, 'customers').map((c) => [c.id, String(c.name)]));
  const products = new Map(rows(data, 'products').map((p) => [p.id, String(p.name)]));
  const salesById = new Map(rows(data, 'sales').map((s) => [s.id, s.number]));
  return [
    {
      name: 'Produtos',
      columns: ['Nome', 'Código', 'Código de barras', 'Unidade', 'Custo', 'Preço', 'Estoque', 'Estoque mínimo', 'Ativo', 'Criado em'],
      rows: rows(data, 'products').map((p) => [
        str(p.name), str(p.internal_code), str(p.barcode), str(p.unit), money(p.cost_cents as number),
        money(p.price_cents as number), num(p.stock_qty), num(p.min_stock), p.active ? 'Sim' : 'Não', dt(p.created_at),
      ]),
    },
    {
      name: 'Clientes',
      columns: ['Nome', 'Telefone', 'E-mail', 'Endereço', 'Observações', 'Ativo', 'Criado em'],
      rows: rows(data, 'customers').map((c) => [
        str(c.name), str(c.phone), str(c.email), str(c.address), str(c.notes), c.active ? 'Sim' : 'Não', dt(c.created_at),
      ]),
    },
    {
      name: 'Vendas',
      columns: ['Número', 'Data', 'Cliente', 'Situação', 'Subtotal', 'Desconto', 'Total', 'Recebido no ato', 'Fiado', 'Custo', 'Motivo do cancelamento'],
      rows: rows(data, 'sales').map((s) => [
        num(s.number), dt(s.created_at), str(customers.get(s.customer_id) ?? null), s.status === 'canceled' ? 'Cancelada' : 'Concluída',
        money(s.subtotal_cents as number), money(s.discount_cents as number), money(s.total_cents as number),
        money(s.received_cents as number), money(s.credit_cents as number), money(s.cost_cents as number), str(s.cancel_reason),
      ]),
    },
    {
      name: 'Itens das vendas',
      columns: ['Venda', 'Produto', 'Quantidade', 'Preço unit.', 'Custo unit.', 'Desconto', 'Total'],
      rows: rows(data, 'sale_items').map((i) => [
        num(salesById.get(i.sale_id)), str(i.product_name), num(i.quantity), money(i.unit_price_cents as number),
        money(i.unit_cost_cents as number), money(i.discount_cents as number), money(i.total_cents as number),
      ]),
    },
    {
      name: 'Pagamentos das vendas',
      columns: ['Venda', 'Forma', 'Valor'],
      rows: rows(data, 'sale_payments').map((p) => [
        num(salesById.get(p.sale_id)), PAYMENT_LABELS[p.method as keyof typeof PAYMENT_LABELS] ?? str(p.method), money(p.amount_cents as number),
      ]),
    },
    {
      name: 'Fiados',
      columns: ['Cliente', 'Descrição', 'Valor', 'Pago', 'Vencimento', 'Situação', 'Criado em'],
      rows: rows(data, 'receivables').map((r) => [
        str(customers.get(r.customer_id) ?? null), str(r.description), money(r.amount_cents as number), money(r.paid_cents as number),
        d(r.due_date), str(r.status), dt(r.created_at),
      ]),
    },
    {
      name: 'Recebimentos de fiado',
      columns: ['Cliente', 'Valor', 'Forma', 'Data', 'Estornado em', 'Observação'],
      rows: rows(data, 'receivable_payments').map((p) => [
        str(customers.get(p.customer_id) ?? null), money(p.amount_cents as number),
        PAYMENT_LABELS[p.method as keyof typeof PAYMENT_LABELS] ?? str(p.method), dt(p.paid_at), dt(p.reversed_at), str(p.notes),
      ]),
    },
    {
      name: 'Financeiro',
      columns: ['Tipo', 'Descrição', 'Valor', 'Competência', 'Vencimento', 'Situação', 'Pago em'],
      rows: rows(data, 'financial_entries').map((e) => [
        e.kind === 'income' ? 'Receita' : 'Despesa', str(e.description), money(e.amount_cents as number), d(e.competence_date),
        d(e.due_date), str(e.status), dt(e.paid_at),
      ]),
    },
    {
      name: 'Movimentações de estoque',
      columns: ['Produto', 'Tipo', 'Quantidade', 'Saldo após', 'Motivo', 'Data'],
      rows: rows(data, 'stock_movements').map((m) => [
        str(products.get(m.product_id) ?? null), str(m.type), num(m.quantity), num(m.balance_after), str(m.reason), dt(m.created_at),
      ]),
    },
    {
      name: 'Orçamentos',
      columns: ['Número', 'Cliente', 'Situação', 'Total', 'Validade', 'Criado em'],
      rows: rows(data, 'quotes').map((q) => [
        num(q.number), str(customers.get(q.customer_id) ?? null), str(q.status), money(q.total_cents as number), d(q.valid_until), dt(q.created_at),
      ]),
    },
  ];
}
