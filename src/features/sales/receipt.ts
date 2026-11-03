import { formatDateTime } from '@/lib/dates';
import { formatDocument, formatPhone } from '@/lib/documents';
import { formatBRL, formatQuantity } from '@/lib/money';
import type { Business, SaleDetail } from '@/types/database';

import { PAYMENT_LABELS } from './cart';

export function escapeHtml(value: string | null | undefined): string {
  return (value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** HTML do comprovante NÃO FISCAL de venda (usado para gerar PDF). */
export function buildSaleReceiptHtml(business: Business, sale: SaleDetail): string {
  const rows = sale.sale_items
    .map(
      (i) => `<tr>
        <td>${escapeHtml(i.product_name)}<br/><small>${formatQuantity(i.quantity, '')} x ${formatBRL(i.unit_price_cents)}${
          i.discount_cents > 0 ? ` (desc. ${formatBRL(i.discount_cents)})` : ''
        }</small></td>
        <td class="r">${formatBRL(i.total_cents)}</td>
      </tr>`,
    )
    .join('');
  const payments = sale.sale_payments
    .map((p) => `<tr><td>${PAYMENT_LABELS[p.method]}</td><td class="r">${formatBRL(p.amount_cents)}</td></tr>`)
    .join('');

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<style>
  body { font-family: -apple-system, Roboto, Arial, sans-serif; color: #111827; padding: 24px; max-width: 420px; margin: auto; }
  h1 { font-size: 20px; margin: 0; color: #1E40AF; }
  .muted { color: #6B7280; font-size: 12px; }
  .badge { display:inline-block; border:1px solid #DC2626; color:#DC2626; padding:4px 8px; border-radius:6px; font-size:11px; font-weight:700; margin:12px 0; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  td { padding: 6px 0; border-bottom: 1px dashed #E5E7EB; font-size: 13px; vertical-align: top; }
  .r { text-align: right; white-space: nowrap; }
  .total td { font-weight: 700; font-size: 16px; border-bottom: none; }
  .canceled { color:#DC2626; font-weight:700; font-size:16px; }
  footer { margin-top: 16px; text-align:center; }
</style></head>
<body>
  <h1>${escapeHtml(business.name)}</h1>
  <div class="muted">
    ${business.document ? `${business.document_type === 'cnpj' ? 'CNPJ' : 'CPF'}: ${formatDocument(business.document)}<br/>` : ''}
    ${business.phone ? `Tel: ${formatPhone(business.phone)}` : ''}
  </div>
  <div class="badge">DOCUMENTO NÃO FISCAL</div>
  <div><strong>Comprovante de venda #${sale.number}</strong></div>
  <div class="muted">${formatDateTime(sale.created_at)}</div>
  ${sale.customers ? `<div class="muted">Cliente: ${escapeHtml(sale.customers.name)}</div>` : ''}
  ${sale.status === 'canceled' ? `<p class="canceled">VENDA CANCELADA</p>` : ''}
  <table>${rows}</table>
  <table>
    <tr><td>Subtotal</td><td class="r">${formatBRL(sale.subtotal_cents)}</td></tr>
    ${sale.discount_cents > 0 ? `<tr><td>Descontos</td><td class="r">-${formatBRL(sale.discount_cents)}</td></tr>` : ''}
    <tr class="total"><td>Total</td><td class="r">${formatBRL(sale.total_cents)}</td></tr>
  </table>
  <table>${payments}</table>
  <footer class="muted">
    ${escapeHtml(business.receipt_footer ?? 'Obrigado pela preferência!')}<br/>
    Este documento não possui valor fiscal.<br/>Gerado por Gestão Fácil IA
  </footer>
</body></html>`;
}
