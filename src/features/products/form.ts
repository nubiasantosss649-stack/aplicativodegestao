import type { ProductForm } from '@/features/schemas';
import { maskMoneyDigits, parseBRL, parseQuantity } from '@/lib/money';
import type { Product } from '@/types/database';

import type { CreateProductInput, ProductPatch } from './api';

export const emptyProductForm = (barcode = ''): ProductForm => ({
  name: '',
  categoryId: null,
  description: '',
  internalCode: '',
  barcode,
  unit: 'un',
  cost: '',
  price: '',
  initialStock: '',
  minStock: '',
  trackStock: true,
});

export function productToForm(p: Product): ProductForm {
  return {
    name: p.name,
    categoryId: p.category_id,
    description: p.description ?? '',
    internalCode: p.internal_code ?? '',
    barcode: p.barcode ?? '',
    unit: p.unit,
    cost: maskMoneyDigits(String(p.cost_cents)),
    price: maskMoneyDigits(String(p.price_cents)),
    initialStock: '',
    minStock: String(Number(p.min_stock)).replace('.', ','),
    trackStock: p.track_stock,
  };
}

export function formToCreateInput(v: ProductForm): CreateProductInput {
  return {
    name: v.name.trim(),
    priceCents: parseBRL(v.price) ?? 0,
    costCents: parseBRL(v.cost) ?? 0,
    initialStock: v.trackStock ? (parseQuantity(v.initialStock) ?? 0) : 0,
    minStock: v.trackStock ? (parseQuantity(v.minStock) ?? 0) : 0,
    unit: v.unit,
    categoryId: v.categoryId,
    description: v.description.trim() || null,
    internalCode: v.internalCode.trim() || null,
    barcode: v.barcode.trim() || null,
    trackStock: v.trackStock,
  };
}

export function formToPatch(v: ProductForm): ProductPatch {
  const c = formToCreateInput(v);
  return {
    name: c.name,
    price_cents: c.priceCents,
    cost_cents: c.costCents,
    min_stock: c.minStock,
    unit: c.unit,
    category_id: c.categoryId,
    description: c.description,
    internal_code: c.internalCode,
    barcode: c.barcode,
    track_stock: c.trackStock,
  };
}
