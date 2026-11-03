import { buildChargeMessage, toWhatsAppNumber, whatsappUrl } from '@/features/receivables/charge';
import { buildSaleReceiptHtml, escapeHtml } from '@/features/sales/receipt';
import type { Business, SaleDetail } from '@/types/database';

describe('cobrança', () => {
  it('monta mensagem personalizada com atraso', () => {
    const msg = buildChargeMessage({
      customerName: 'Carlos Silva',
      businessName: 'Mercadinho da Maria',
      balanceCents: 4550,
      oldestDueDate: '2026-10-01',
      overdueDays: 12,
    });
    expect(msg).toContain('Olá, Carlos!');
    expect(msg).toContain('R$ 45,50');
    expect(msg).toContain('01/10/2026 (12 dias de atraso)');
  });

  it('normaliza telefone para o WhatsApp', () => {
    expect(toWhatsAppNumber('(11) 98888-7777')).toBe('5511988887777');
    expect(toWhatsAppNumber('5511988887777')).toBe('5511988887777');
    expect(toWhatsAppNumber('123')).toBeNull();
    expect(whatsappUrl('11988887777', 'Olá & tchau')).toBe('https://wa.me/5511988887777?text=Ol%C3%A1%20%26%20tchau');
    expect(whatsappUrl(null, 'oi')).toBe('https://wa.me/?text=oi');
  });
});

describe('comprovante não fiscal', () => {
  const business = {
    id: 'b', name: 'Loja <Teste>', document_type: 'cpf', document: '52998224725', phone: '11988887777',
    receipt_footer: null,
  } as Business;
  const sale = {
    id: 's', number: 7, status: 'completed', created_at: '2026-10-13T12:00:00Z',
    subtotal_cents: 5000, discount_cents: 500, total_cents: 4500,
    customers: { id: 'c', name: 'Ana', phone: null },
    sale_items: [{ id: 'i', sale_id: 's', product_id: 'p', product_name: 'Arroz "tipo 1"', quantity: 2,
      unit_price_cents: 2500, unit_cost_cents: 0, discount_cents: 0, total_cents: 5000 }],
    sale_payments: [{ id: 'pay', sale_id: 's', method: 'pix', amount_cents: 4500 }],
  } as unknown as SaleDetail;

  it('identifica o documento como não fiscal e escapa HTML', () => {
    const html = buildSaleReceiptHtml(business, sale);
    expect(html).toContain('DOCUMENTO NÃO FISCAL');
    expect(html).toContain('Loja &lt;Teste&gt;');
    expect(html).toContain('Arroz &quot;tipo 1&quot;');
    expect(html).toContain('529.982.247-25');
    expect(html).toContain('R$ 45,00');
    expect(html).toContain('Pix');
    expect(escapeHtml(`<a href='x'>`)).toBe('&lt;a href=&#39;x&#39;&gt;');
  });
});
