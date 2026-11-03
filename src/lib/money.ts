/**
 * Utilitários monetários. Todos os valores trafegam em CENTAVOS (inteiros)
 * para evitar erros de ponto flutuante.
 */

const THOUSANDS = /\B(?=(\d{3})+(?!\d))/g;

/** Formata centavos como moeda brasileira: 123456 -> "R$ 1.234,56" */
export function formatBRL(cents: number | null | undefined): string {
  const value = Math.round(cents ?? 0);
  const negative = value < 0;
  const abs = Math.abs(value);
  const reais = Math.floor(abs / 100)
    .toString()
    .replace(THOUSANDS, '.');
  const centavos = (abs % 100).toString().padStart(2, '0');
  return `${negative ? '-' : ''}R$ ${reais},${centavos}`;
}

/**
 * Converte texto digitado em centavos. Aceita "12,50", "1.234,56", "12.5",
 * "R$ 10" etc. Retorna null quando o texto não é um valor válido.
 */
export function parseBRL(input: string | null | undefined): number | null {
  if (input == null) return null;
  let text = input.replace(/R\$|\s/g, '').trim();
  if (!text) return null;
  const negative = text.startsWith('-');
  if (negative) text = text.slice(1);
  if (!/^[\d.,]+$/.test(text)) return null;

  let normalized: string;
  if (text.includes(',')) {
    // Padrão brasileiro: ponto = milhar, vírgula = decimal
    if (text.indexOf(',') !== text.lastIndexOf(',')) return null;
    normalized = text.replace(/\./g, '').replace(',', '.');
  } else {
    const parts = text.split('.');
    const last = parts[parts.length - 1] ?? '';
    // "12.5" ou "12.50" => decimal; "1.234" => milhar
    normalized = parts.length === 2 && last.length <= 2 ? text : text.replace(/\./g, '');
  }
  const [intPart = '', decPart = ''] = normalized.split('.');
  if (!intPart && !decPart) return null;
  if (decPart.length > 2) return null;
  const cents = Number(intPart || '0') * 100 + Number(decPart.padEnd(2, '0') || '0');
  if (!Number.isFinite(cents)) return null;
  return negative ? -cents : cents;
}

/** Máscara de digitação: considera apenas dígitos como centavos ("1250" -> "12,50"). */
export function maskMoneyDigits(input: string): string {
  const digits = input.replace(/\D/g, '').replace(/^0+/, '').slice(0, 13);
  const cents = Number(digits || '0');
  return formatBRL(cents).replace('R$ ', '');
}

/** Margem de lucro sobre o preço de venda, em %. */
export function marginPercent(costCents: number, priceCents: number): number | null {
  if (priceCents <= 0) return null;
  return ((priceCents - costCents) / priceCents) * 100;
}

/** Markup sobre o custo, em %. */
export function markupPercent(costCents: number, priceCents: number): number | null {
  if (costCents <= 0) return null;
  return ((priceCents - costCents) / costCents) * 100;
}

/**
 * Sugere preço de venda para atingir a margem desejada sobre o preço:
 * preço = custo / (1 - margem). Arredonda para cima ao próximo múltiplo de 10 centavos.
 */
export function suggestPrice(costCents: number, targetMarginPercent: number): number | null {
  if (costCents <= 0 || targetMarginPercent <= 0 || targetMarginPercent >= 100) return null;
  const raw = costCents / (1 - targetMarginPercent / 100);
  return Math.ceil(raw / 10) * 10;
}

/** Multiplica preço unitário por quantidade (que pode ser fracionada) com o mesmo arredondamento do banco. */
export function lineTotal(unitCents: number, quantity: number): number {
  return Math.round(unitCents * quantity);
}

export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${value.toFixed(digits).replace('.', ',')}%`;
}

export function formatQuantity(qty: number | string | null | undefined, unit = 'un'): string {
  const n = Number(qty ?? 0);
  const text = Number.isInteger(n) ? n.toString() : n.toFixed(3).replace(/0+$/, '').replace('.', ',');
  return `${text} ${unit}`;
}

/** Converte texto de quantidade ("1,5" ou "2") para número. */
export function parseQuantity(input: string): number | null {
  const text = input.trim().replace(',', '.');
  if (!/^\d+(\.\d{1,3})?$/.test(text)) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}
