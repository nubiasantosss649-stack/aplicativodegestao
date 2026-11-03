import { businessExportToSheets, salesReportToPdf, salesReportToSheets } from '@/features/reports/export';
import type { SalesReport } from '@/features/reports/api';

const report: SalesReport = {
  period: { from: '2026-10-01', to: '2026-10-14' },
  summary: {
    sales_count: 3, revenue_cents: 3000, discount_cents: 0, credit_sales_cents: 1000, average_ticket_cents: 1000, items_sold: 3,
    cogs_cents: 1800, gross_profit_cents: 1200, gross_margin_pct: 40, canceled_count: 0, canceled_cents: 0,
  },
  previous_period: { revenue_cents: 2000, sales_count: 2, revenue_change_pct: 50 },
  by_product: [{ product_id: 'p', name: 'Arroz', quantity: 3, revenue_cents: 3000, cost_cents: 1800, profit_cents: 1200, margin_pct: 40 }],
  by_category: [],
  by_payment_method: [{ method: 'pix', total_cents: 2000, sales_count: 2 }],
  by_weekday: [{ weekday: 1, revenue_cents: 3000, sales_count: 3 }],
  by_hour: [],
  top_customers: [],
};

describe('exportação de relatórios', () => {
  it('gera abas do relatório de vendas com moeda', () => {
    const sheets = salesReportToSheets(report);
    expect(sheets.map((s) => s.name)).toContain('Produtos');
    expect(sheets[0]!.rows).toContainEqual(['Faturamento', { money: 3000 }]);
    expect(sheets.find((s) => s.name === 'Dias da semana')!.rows[0]![0]).toBe('Seg');
    expect(sheets.find((s) => s.name === 'Pagamentos')!.rows[0]![0]).toBe('Pix');
  });

  it('PDF oculta lucro quando o usuário não tem acesso (vendedor)', () => {
    const seller = { ...report, summary: { ...report.summary, cogs_cents: null, gross_profit_cents: null, gross_margin_pct: null } };
    expect(salesReportToPdf(report).summary.map((s) => s.label)).toContain('Lucro bruto');
    const pdf = salesReportToPdf(seller);
    expect(pdf.summary.map((s) => s.label)).not.toContain('Lucro bruto');
    expect(pdf.tables[0]!.columns).toEqual(['Produto', 'Qtd.', 'Faturamento']);
  });

  it('exportação completa resolve nomes de clientes e números de venda', () => {
    const sheets = businessExportToSheets({
      customers: [{ id: 'c1', name: 'Ana', active: true }],
      products: [{ id: 'p1', name: 'Arroz', active: true, cost_cents: 100, price_cents: 200 }],
      sales: [{ id: 's1', number: 7, customer_id: 'c1', status: 'completed', total_cents: 200 }],
      sale_items: [{ sale_id: 's1', product_name: 'Arroz', quantity: 1, total_cents: 200 }],
      stock_movements: [{ product_id: 'p1', type: 'sale', quantity: -1 }],
    });
    expect(sheets).toHaveLength(10);
    expect(sheets.find((s) => s.name === 'Vendas')!.rows[0]!.slice(0, 4)).toEqual([7, null, 'Ana', 'Concluída']);
    expect(sheets.find((s) => s.name === 'Itens das vendas')!.rows[0]![0]).toBe(7);
    expect(sheets.find((s) => s.name === 'Movimentações de estoque')!.rows[0]![0]).toBe('Arroz');
    expect(sheets.find((s) => s.name === 'Fiados')!.rows).toEqual([]);
  });
});
