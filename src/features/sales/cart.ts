import { formatBRL, lineTotal } from '@/lib/money';
import type { PaymentMethod, Product } from '@/types/database';

/**
 * Carrinho de venda (lógica pura). Os totais aqui são uma PRÉVIA: o servidor
 * recalcula tudo a partir dos preços do banco ao finalizar a venda.
 */

export interface CartItem {
  productId: string;
  name: string;
  unit: string;
  unitPriceCents: number;
  quantity: number;
  discountCents: number;
  stockQty: number;
  trackStock: boolean;
}

export interface CartState {
  items: CartItem[];
  discountCents: number;
  customerId: string | null;
  customerName: string | null;
}

export const emptyCart: CartState = { items: [], discountCents: 0, customerId: null, customerName: null };

export type CartAction =
  | { type: 'add'; product: Pick<Product, 'id' | 'name' | 'unit' | 'price_cents' | 'stock_qty' | 'track_stock'>; quantity?: number }
  | { type: 'setQuantity'; productId: string; quantity: number }
  | { type: 'setItemDiscount'; productId: string; discountCents: number }
  | { type: 'remove'; productId: string }
  | { type: 'setDiscount'; discountCents: number }
  | { type: 'setCustomer'; customerId: string | null; customerName: string | null }
  | { type: 'clear' };

export function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'add': {
      const qty = action.quantity ?? 1;
      const existing = state.items.find((i) => i.productId === action.product.id);
      if (existing) {
        return {
          ...state,
          items: state.items.map((i) =>
            i.productId === action.product.id ? { ...i, quantity: roundQty(i.quantity + qty) } : i,
          ),
        };
      }
      return {
        ...state,
        items: [
          ...state.items,
          {
            productId: action.product.id,
            name: action.product.name,
            unit: action.product.unit,
            unitPriceCents: action.product.price_cents,
            quantity: qty,
            discountCents: 0,
            stockQty: Number(action.product.stock_qty),
            trackStock: action.product.track_stock,
          },
        ],
      };
    }
    case 'setQuantity':
      if (action.quantity <= 0) {
        return { ...state, items: state.items.filter((i) => i.productId !== action.productId) };
      }
      return {
        ...state,
        items: state.items.map((i) =>
          i.productId === action.productId
            ? {
                ...i,
                quantity: roundQty(action.quantity),
                discountCents: Math.min(i.discountCents, lineTotal(i.unitPriceCents, action.quantity)),
              }
            : i,
        ),
      };
    case 'setItemDiscount':
      return {
        ...state,
        items: state.items.map((i) =>
          i.productId === action.productId
            ? {
                ...i,
                discountCents: Math.max(0, Math.min(action.discountCents, lineTotal(i.unitPriceCents, i.quantity))),
              }
            : i,
        ),
      };
    case 'remove':
      return { ...state, items: state.items.filter((i) => i.productId !== action.productId) };
    case 'setDiscount':
      return { ...state, discountCents: Math.max(0, Math.round(action.discountCents)) };
    case 'setCustomer':
      return { ...state, customerId: action.customerId, customerName: action.customerName };
    case 'clear':
      return emptyCart;
  }
}

function roundQty(q: number): number {
  return Math.round(q * 1000) / 1000;
}

export interface CartTotals {
  subtotalCents: number;
  itemsDiscountCents: number;
  discountCents: number;
  totalCents: number;
  itemCount: number;
}

export function computeTotals(state: CartState): CartTotals {
  const subtotalCents = state.items.reduce((acc, i) => acc + lineTotal(i.unitPriceCents, i.quantity), 0);
  const itemsDiscountCents = state.items.reduce((acc, i) => acc + i.discountCents, 0);
  const discountCents = Math.min(state.discountCents, Math.max(0, subtotalCents - itemsDiscountCents));
  return {
    subtotalCents,
    itemsDiscountCents,
    discountCents,
    totalCents: subtotalCents - itemsDiscountCents - discountCents,
    itemCount: state.items.length,
  };
}

/** Itens cuja quantidade excede o estoque disponível. */
export function stockIssues(state: CartState): CartItem[] {
  return state.items.filter((i) => i.trackStock && i.quantity > i.stockQty);
}

export interface PaymentLine {
  method: PaymentMethod;
  amountCents: number;
}

export type PaymentValidation =
  | { ok: true; changeCents: number }
  | { ok: false; reason: string };

/**
 * Valida os pagamentos informados. Em dinheiro, o valor recebido pode ser
 * maior que o devido (gera troco); o valor registrado é limitado ao devido.
 */
export function validatePayments(
  totalCents: number,
  payments: PaymentLine[],
  hasCustomer: boolean,
): PaymentValidation {
  const valid = payments.filter((p) => p.amountCents > 0);
  if (valid.length === 0) return { ok: false, reason: 'Informe a forma de pagamento.' };
  if (valid.some((p) => p.method === 'credit') && !hasCustomer) {
    return { ok: false, reason: 'Selecione um cliente para vender fiado.' };
  }
  const sum = valid.reduce((acc, p) => acc + p.amountCents, 0);
  const nonCash = valid.filter((p) => p.method !== 'cash').reduce((acc, p) => acc + p.amountCents, 0);
  if (nonCash > totalCents) return { ok: false, reason: 'Os pagamentos excedem o total da venda.' };
  if (sum < totalCents) return { ok: false, reason: `Faltam ${formatBRL(totalCents - sum)} para fechar o total.` };
  return { ok: true, changeCents: sum - totalCents };
}

/** Normaliza pagamentos para envio ao servidor: desconta o troco do dinheiro. */
export function normalizePayments(totalCents: number, payments: PaymentLine[]): PaymentLine[] {
  const valid = payments.filter((p) => p.amountCents > 0);
  const nonCash = valid.filter((p) => p.method !== 'cash').reduce((acc, p) => acc + p.amountCents, 0);
  const cashDue = totalCents - nonCash;
  const merged = new Map<PaymentMethod, number>();
  for (const p of valid) {
    if (p.method === 'cash') continue;
    merged.set(p.method, (merged.get(p.method) ?? 0) + p.amountCents);
  }
  if (cashDue > 0) merged.set('cash', cashDue);
  return [...merged.entries()].map(([method, amountCents]) => ({ method, amountCents }));
}

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash: 'Dinheiro',
  pix: 'Pix',
  card: 'Cartão',
  credit: 'Fiado',
};
