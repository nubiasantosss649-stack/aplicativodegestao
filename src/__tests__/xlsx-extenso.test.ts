import { strFromU8, unzipSync } from 'fflate';

import { buildQuoteHtml, buildReceiptHtml, buildReportHtml } from '@/features/documents/templates';
import { valorPorExtenso } from '@/lib/extenso';
import { buildXlsx, columnName, safeSheetName } from '@/lib/xlsx';
import type { Business } from '@/types/database';

describe('valor por extenso', () => {
  it.each([
    [100, 'um real'],
    [5, 'cinco centavos'],
    [15050, 'cento e cinquenta reais e cinquenta centavos'],
    [10000, 'cem reais'],
    [100000, 'mil reais'],
    [110000, 'mil e cem reais'],
    [123456, 'mil duzentos e trinta e quatro reais e cinquenta e seis centavos'],
    [2100050, 'vinte e um mil reais e cinquenta centavos'],
    [200000000, 'dois milhões de reais'],
    [0, 'zero real'],
  ])('%d centavos', (cents, text) => {
    expect(valorPorExtenso(cents)).toBe(text);
  });
});

describe('xlsx', () => {
  it('nomeia colunas como o Excel', () => {
    expect(columnName(0)).toBe('A');
    expect(columnName(25)).toBe('Z');
    expect(columnName(26)).toBe('AA');
    expect(columnName(701)).toBe('ZZ');
  });

  it('gera nomes de aba válidos e únicos', () => {
    const used = new Set<string>();
    expect(safeSheetName('Vendas/2026', used)).toBe('Vendas 2026');
    expect(safeSheetName('Vendas 2026', used)).toBe('Vendas 2026 (2)');
    expect(safeSheetName('x'.repeat(40), used)).toHaveLength(31);
  });

  it('gera um pacote xlsx com abas, textos escapados, números e moeda', () => {
    const bytes = buildXlsx([
      { name: 'Produtos', columns: ['Nome', 'Preço', 'Estoque'], rows: [['Arroz <5kg> & cia', { money: 2550 }, 10], ['Feijão', null, 2.5]] },
      { name: 'Clientes', columns: ['Nome'], rows: [['Ana']] },
    ]);
    const files = unzipSync(bytes);
    expect(Object.keys(files)).toEqual(
      expect.arrayContaining(['[Content_Types].xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml', 'xl/styles.xml']),
    );
    const wb = strFromU8(files['xl/workbook.xml']!);
    expect(wb).toContain('name="Produtos"');
    expect(wb).toContain('name="Clientes"');
    const s1 = strFromU8(files['xl/worksheets/sheet1.xml']!);
    expect(s1).toContain('Arroz &lt;5kg&gt; &amp; cia');
    expect(s1).toContain('<c r="B2" s="2"><v>25.50</v></c>');
    expect(s1).toContain('<c r="C3"><v>2.5</v></c>');
    expect(s1).not.toContain('r="B3"');
    expect(() => buildXlsx([])).toThrow();
  });
});

describe('documentos em PDF (HTML)', () => {
  const business = { name: 'Salão Bela & Cia', document_type: 'cnpj', document: '11222333000181', phone: '11988887777' } as Business;

  it('recibo com valor por extenso e identificação não fiscal', () => {
    const html = buildReceiptHtml(business, {
      number: 7, date: '2026-10-14', payerName: 'Maria <b>', amountCents: 15050, description: 'Corte e escova', method: 'pix',
    });
    expect(html).toContain('DOCUMENTO NÃO FISCAL');
    expect(html).toContain('Recibo nº 7');
    expect(html).toContain('cento e cinquenta reais e cinquenta centavos');
    expect(html).toContain('Maria &lt;b&gt;');
    expect(html).toContain('pago em pix');
    expect(html).toContain('11.222.333/0001-81');
  });

  it('orçamento com itens, desconto e validade', () => {
    const html = buildQuoteHtml(business, {
      number: 3, created_at: '2026-10-14T12:00:00Z', valid_until: '2026-10-29', status: 'draft',
      subtotal_cents: 9000, discount_cents: 500, total_cents: 8500, notes: null, customer: { name: 'Ana', phone: null },
      items: [{ description: 'Coloração', quantity: 1, unit_price_cents: 9000, total_cents: 9000 }],
    });
    expect(html).toContain('Orçamento nº 3');
    expect(html).toContain('Válido até 29/10/2026');
    expect(html).toContain('R$ 85,00');
    expect(html).toContain('DOCUMENTO NÃO FISCAL');
  });

  it('relatório omite tabelas vazias', () => {
    const html = buildReportHtml(business, 'Relatório de vendas', '01/10/2026 a 14/10/2026', [{ label: 'Faturamento', value: 'R$ 10,00' }], [
      { title: 'Por produto', columns: ['Produto'], rows: [['Arroz']] },
      { title: 'Vazia', columns: ['X'], rows: [] },
    ]);
    expect(html).toContain('Por produto');
    expect(html).not.toContain('Vazia');
  });
});
