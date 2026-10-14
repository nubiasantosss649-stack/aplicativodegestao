import { formatDate, formatDateTime } from '@/lib/dates';
import { formatDocument, formatPhone } from '@/lib/documents';
import { valorPorExtenso } from '@/lib/extenso';
import { formatBRL, formatQuantity } from '@/lib/money';
import { escapeHtml } from '@/features/sales/receipt';
import type { Business, PaymentMethod } from '@/types/database';

import { PAYMENT_LABELS } from '@/features/sales/cart';

/** Modelos HTML (convertidos em PDF) de documentos NÃO FISCAIS. */

const BASE_STYLE = `
  body { font-family: -apple-system, Roboto, Arial, sans-serif; color: #111827; padding: 28px; max-width: 720px; margin: auto; font-size: 13px; }
  h1 { font-size: 20px; margin: 0 0 4px; color: #1E40AF; }
  h2 { font-size: 16px; margin: 18px 0 8px; }
  .muted { color: #6B7280; font-size: 12px; }
  .badge { display:inline-block; border:1px solid #DC2626; color:#DC2626; padding:3px 8px; border-radius:6px; font-size:11px; font-weight:700; margin:10px 0; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th { text-align: left; font-size: 12px; color: #374151; border-bottom: 2px solid #E5E7EB; padding: 6px 4px; }
  td { padding: 6px 4px; border-bottom: 1px solid #F1F5F9; vertical-align: top; }
  .r { text-align: right; white-space: nowrap; }
  .total td { font-weight: 700; font-size: 15px; border-bottom: none; }
  .box { border: 1px solid #E5E7EB; border-radius: 10px; padding: 14px; margin-top: 12px; }
  .sign { margin-top: 48px; text-align: center; }
  .sign div { border-top: 1px solid #111827; width: 260px; margin: 0 auto 4px; }
  footer { margin-top: 24px; text-align: center; }
  .neg { color: #DC2626; } .pos { color: #059669; }
`;

function header(business: Business, docTitle: string): string {
  return `
  <h1>${escapeHtml(business.name)}</h1>
  <div class="muted">
    ${business.document ? `${business.document_type === 'cnpj' ? 'CNPJ' : 'CPF'}: ${formatDocument(business.document)} · ` : ''}
    ${business.phone ? `Tel/WhatsApp: ${formatPhone(business.phone)}` : ''}
  </div>
  <div class="badge">DOCUMENTO NÃO FISCAL</div>
  <div><strong>${escapeHtml(docTitle)}</strong></div>`;
}

function page(title: string, body: string): string {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/><title>${escapeHtml(title)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1"/><style>${BASE_STYLE}</style></head>
<body>${body}<footer class="muted">Este documento não possui valor fiscal. Gerado por Gestão Fácil IA.</footer></body></html>`;
}

export interface QuoteDoc {
  number: number;
  created_at: string;
  valid_until: string | null;
  status: string;
  subtotal_cents: number;
  discount_cents: number;
  total_cents: number;
  notes: string | null;
  customer: { name: string; phone: string | null } | null;
  items: { description: string; quantity: number; unit_price_cents: number; total_cents: number }[];
}

export function buildQuoteHtml(business: Business, q: QuoteDoc): string {
  const rows = q.items
    .map(
      (i) => `<tr><td>${escapeHtml(i.description)}</td><td class="r">${formatQuantity(i.quantity, '').trim()}</td>
      <td class="r">${formatBRL(i.unit_price_cents)}</td><td class="r">${formatBRL(i.total_cents)}</td></tr>`,
    )
    .join('');
  return page(
    `Orçamento ${q.number}`,
    `${header(business, `Orçamento nº ${q.number}`)}
    <div class="muted">Emitido em ${formatDateTime(q.created_at)}${q.valid_until ? ` · Válido até ${formatDate(q.valid_until)}` : ''}</div>
    ${q.customer ? `<div class="box"><strong>Cliente:</strong> ${escapeHtml(q.customer.name)}${q.customer.phone ? ` · ${formatPhone(q.customer.phone)}` : ''}</div>` : ''}
    <table><thead><tr><th>Item</th><th class="r">Qtd.</th><th class="r">Valor unit.</th><th class="r">Total</th></tr></thead><tbody>${rows}</tbody></table>
    <table>
      <tr><td>Subtotal</td><td class="r">${formatBRL(q.subtotal_cents)}</td></tr>
      ${q.discount_cents > 0 ? `<tr><td>Desconto</td><td class="r">-${formatBRL(q.discount_cents)}</td></tr>` : ''}
      <tr class="total"><td>Total</td><td class="r">${formatBRL(q.total_cents)}</td></tr>
    </table>
    ${q.notes ? `<div class="box"><strong>Observações:</strong> ${escapeHtml(q.notes)}</div>` : ''}
    <p class="muted">Orçamento sujeito a confirmação de disponibilidade. Valores válidos até a data indicada.</p>`,
  );
}

export interface ReceiptDoc {
  number: number | null;
  date: string;
  payerName: string;
  payerDocument?: string | null;
  amountCents: number;
  description: string;
  method?: Exclude<PaymentMethod, 'credit'> | null;
  city?: string | null;
}

/** Recibo de pagamento (fiado recebido ou serviço prestado). */
export function buildReceiptHtml(business: Business, r: ReceiptDoc): string {
  return page(
    `Recibo ${r.number ?? ''}`,
    `${header(business, `Recibo${r.number ? ` nº ${r.number}` : ''} — ${formatBRL(r.amountCents)}`)}
    <div class="box" style="font-size:15px; line-height:1.6">
      Recebi(emos) de <strong>${escapeHtml(r.payerName)}</strong>${r.payerDocument ? `, CPF/CNPJ ${escapeHtml(formatDocument(r.payerDocument))}` : ''},
      a quantia de <strong>${formatBRL(r.amountCents)}</strong> (${escapeHtml(valorPorExtenso(r.amountCents))}),
      referente a <strong>${escapeHtml(r.description)}</strong>${r.method ? `, pago em ${PAYMENT_LABELS[r.method].toLowerCase()}` : ''}.
    </div>
    <p>Para clareza, firmo(amos) o presente recibo.</p>
    <p>${r.city ? `${escapeHtml(r.city)}, ` : ''}${formatDate(r.date)}.</p>
    <div class="sign"><div></div>${escapeHtml(business.name)}</div>`,
  );
}

export interface ReportTable {
  title: string;
  columns: string[];
  rows: (string | number)[][];
  alignRight?: number[];
}

/** Relatório genérico em PDF (resumo + tabelas). */
export function buildReportHtml(
  business: Business,
  title: string,
  period: string,
  summary: { label: string; value: string }[],
  tables: ReportTable[],
): string {
  const sum = summary.map((s) => `<tr><td>${escapeHtml(s.label)}</td><td class="r"><strong>${escapeHtml(s.value)}</strong></td></tr>`).join('');
  const tbls = tables
    .filter((t) => t.rows.length > 0)
    .map((t) => {
      const right = new Set(t.alignRight ?? []);
      return `<h2>${escapeHtml(t.title)}</h2><table><thead><tr>${t.columns
        .map((c, i) => `<th${right.has(i) ? ' class="r"' : ''}>${escapeHtml(c)}</th>`)
        .join('')}</tr></thead><tbody>${t.rows
        .map((r) => `<tr>${r.map((v, i) => `<td${right.has(i) ? ' class="r"' : ''}>${escapeHtml(String(v))}</td>`).join('')}</tr>`)
        .join('')}</tbody></table>`;
    })
    .join('');
  return page(
    title,
    `<h1>${escapeHtml(business.name)}</h1><div><strong>${escapeHtml(title)}</strong></div>
    <div class="muted">${escapeHtml(period)} · gerado em ${formatDateTime(new Date())}</div>
    <h2>Resumo</h2><table>${sum}</table>${tbls}`,
  );
}
