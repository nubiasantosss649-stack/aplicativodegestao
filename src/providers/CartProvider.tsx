import { createContext, useContext, useMemo, useReducer, type Dispatch, type ReactNode } from 'react';

import { cartReducer, computeTotals, emptyCart, type CartAction, type CartState, type CartTotals } from '@/features/sales/cart';

interface CartContextValue {
  cart: CartState;
  totals: CartTotals;
  dispatch: Dispatch<CartAction>;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [cart, dispatch] = useReducer(cartReducer, emptyCart);
  const value = useMemo(() => ({ cart, dispatch, totals: computeTotals(cart) }), [cart]);
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart deve ser usado dentro de CartProvider');
  return ctx;
}
