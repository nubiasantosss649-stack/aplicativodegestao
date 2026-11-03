import {
  cartReducer,
  computeTotals,
  emptyCart,
  normalizePayments,
  stockIssues,
  validatePayments,
  type CartState,
} from '@/features/sales/cart';

const arroz = { id: 'p1', name: 'Arroz', unit: 'un', price_cents: 2500, stock_qty: 3, track_stock: true };
const queijo = { id: 'p2', name: 'Queijo', unit: 'kg', price_cents: 4990, stock_qty: 10, track_stock: true };

function build(...actions: Parameters<typeof cartReducer>[1][]): CartState {
  return actions.reduce(cartReducer, emptyCart);
}

describe('carrinho', () => {
  it('adiciona, soma quantidade e calcula totais', () => {
    const state = build(
      { type: 'add', product: arroz },
      { type: 'add', product: arroz },
      { type: 'add', product: queijo, quantity: 0.5 },
    );
    expect(state.items).toHaveLength(2);
    expect(state.items[0]?.quantity).toBe(2);
    const totals = computeTotals(state);
    // 2 * 2500 + round(4990 * 0.5) = 5000 + 2495
    expect(totals.subtotalCents).toBe(7495);
    expect(totals.totalCents).toBe(7495);
  });

  it('aplica descontos sem deixar total negativo', () => {
    const state = build(
      { type: 'add', product: arroz },
      { type: 'setItemDiscount', productId: 'p1', discountCents: 99999 },
      { type: 'setDiscount', discountCents: 500 },
    );
    expect(state.items[0]?.discountCents).toBe(2500);
    expect(computeTotals(state).totalCents).toBe(0);
  });

  it('remove item ao zerar quantidade e detecta falta de estoque', () => {
    let state = build({ type: 'add', product: arroz, quantity: 5 }, { type: 'add', product: queijo });
    expect(stockIssues(state).map((i) => i.productId)).toEqual(['p1']);
    state = cartReducer(state, { type: 'setQuantity', productId: 'p1', quantity: 0 });
    expect(state.items.map((i) => i.productId)).toEqual(['p2']);
    expect(cartReducer(state, { type: 'clear' })).toEqual(emptyCart);
  });
});

describe('pagamentos', () => {
  it('exige cliente para fiado', () => {
    expect(validatePayments(1000, [{ method: 'credit', amountCents: 1000 }], false)).toEqual({
      ok: false,
      reason: 'Selecione um cliente para vender fiado.',
    });
    expect(validatePayments(1000, [{ method: 'credit', amountCents: 1000 }], true)).toEqual({
      ok: true,
      changeCents: 0,
    });
  });

  it('calcula troco em dinheiro e normaliza valores enviados', () => {
    const payments = [
      { method: 'pix' as const, amountCents: 1000 },
      { method: 'cash' as const, amountCents: 2000 },
    ];
    expect(validatePayments(2500, payments, false)).toEqual({ ok: true, changeCents: 500 });
    expect(normalizePayments(2500, payments)).toEqual([
      { method: 'pix', amountCents: 1000 },
      { method: 'cash', amountCents: 1500 },
    ]);
  });

  it('rejeita pagamento insuficiente ou cartão acima do total', () => {
    expect(validatePayments(2500, [{ method: 'pix', amountCents: 1000 }], false).ok).toBe(false);
    expect(validatePayments(2500, [{ method: 'card', amountCents: 3000 }], false).ok).toBe(false);
    expect(validatePayments(2500, [], false).ok).toBe(false);
  });
});
