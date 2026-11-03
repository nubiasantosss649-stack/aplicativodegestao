import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { newIdempotencyKey } from '@/lib/id';
import { sanitizeSearch } from '@/lib/search';
import { supabase, unwrap } from '@/lib/supabase';
import type { Product, ProductCategory, StockMovement } from '@/types/database';

export const productKeys = {
  all: (bid: string) => ['products', bid] as const,
  list: (bid: string, filters: object) => ['products', bid, 'list', filters] as const,
  detail: (id: string) => ['product', id] as const,
  movements: (id: string) => ['product', id, 'movements'] as const,
  categories: (bid: string) => ['product-categories', bid] as const,
};

export interface ProductFilters {
  search?: string;
  lowStockOnly?: boolean;
  includeInactive?: boolean;
  categoryId?: string | null;
}

export function useProducts(businessId: string, filters: ProductFilters = {}) {
  return useQuery({
    queryKey: productKeys.list(businessId, filters),
    queryFn: async () => {
      let q = supabase.from('products').select('*').eq('business_id', businessId).order('name').limit(500);
      if (!filters.includeInactive) q = q.eq('active', true);
      if (filters.categoryId) q = q.eq('category_id', filters.categoryId);
      const term = sanitizeSearch(filters.search ?? '');
      if (term) q = q.or(`name.ilike.%${term}%,barcode.eq.${term},internal_code.ilike.${term}`);
      const rows = unwrap<Product[]>(await q);
      return filters.lowStockOnly ? rows.filter((p) => p.track_stock && Number(p.stock_qty) <= Number(p.min_stock)) : rows;
    },
  });
}

export function useProduct(id: string | undefined) {
  return useQuery({
    queryKey: productKeys.detail(id ?? ''),
    enabled: !!id,
    queryFn: async () => unwrap<Product>(await supabase.from('products').select('*').eq('id', id!).single()),
  });
}

export async function findProductByCode(businessId: string, code: string): Promise<Product | null> {
  const term = sanitizeSearch(code);
  if (!term) return null;
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('business_id', businessId)
    .eq('active', true)
    .or(`barcode.eq.${term},internal_code.eq.${term}`)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as Product | null) ?? null;
}

export function useStockMovements(productId: string | undefined) {
  return useQuery({
    queryKey: productKeys.movements(productId ?? ''),
    enabled: !!productId,
    queryFn: async () =>
      unwrap<StockMovement[]>(
        await supabase
          .from('stock_movements')
          .select('*')
          .eq('product_id', productId!)
          .order('created_at', { ascending: false })
          .limit(100),
      ),
  });
}

export function useProductCategories(businessId: string) {
  return useQuery({
    queryKey: productKeys.categories(businessId),
    queryFn: async () =>
      unwrap<ProductCategory[]>(
        await supabase.from('product_categories').select('*').eq('business_id', businessId).order('name'),
      ),
  });
}

export function useCreateCategory(businessId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) =>
      unwrap<ProductCategory>(
        await supabase.from('product_categories').insert({ business_id: businessId, name: name.trim() }).select().single(),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: productKeys.categories(businessId) }),
  });
}

export interface CreateProductInput {
  name: string;
  priceCents: number;
  costCents: number;
  initialStock: number;
  minStock: number;
  unit: string;
  categoryId: string | null;
  description: string | null;
  internalCode: string | null;
  barcode: string | null;
  trackStock: boolean;
}

export function useCreateProduct(businessId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateProductInput) =>
      unwrap<Product>(
        await supabase.rpc('create_product', {
          p_business_id: businessId,
          p_name: input.name,
          p_price_cents: input.priceCents,
          p_cost_cents: input.costCents,
          p_initial_stock: input.initialStock,
          p_min_stock: input.minStock,
          p_unit: input.unit,
          p_category_id: input.categoryId,
          p_description: input.description,
          p_internal_code: input.internalCode,
          p_barcode: input.barcode,
          p_track_stock: input.trackStock,
        }),
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: productKeys.all(businessId) });
      qc.invalidateQueries({ queryKey: ['entitlements', businessId] });
    },
  });
}

export type ProductPatch = Partial<
  Pick<
    Product,
    | 'name'
    | 'category_id'
    | 'description'
    | 'internal_code'
    | 'barcode'
    | 'unit'
    | 'cost_cents'
    | 'price_cents'
    | 'min_stock'
    | 'track_stock'
    | 'photo_path'
    | 'active'
  >
>;

export function useUpdateProduct(businessId: string, productId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: ProductPatch) =>
      unwrap<Product>(await supabase.from('products').update(patch).eq('id', productId).select().single()),
    onSuccess: (product) => {
      qc.setQueryData(productKeys.detail(productId), product);
      qc.invalidateQueries({ queryKey: productKeys.all(businessId) });
      qc.invalidateQueries({ queryKey: ['entitlements', businessId] });
    },
  });
}

export interface StockMovementInput {
  type: 'purchase' | 'adjustment';
  quantity: number; // com sinal
  reason: string | null;
  unitCostCents: number | null;
  updateCost: boolean;
}

export function useRegisterStockMovement(businessId: string, productId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: StockMovementInput & { idempotencyKey?: string }) =>
      unwrap<StockMovement>(
        await supabase.rpc('register_stock_movement', {
          p_business_id: businessId,
          p_product_id: productId,
          p_type: input.type,
          p_quantity: input.quantity,
          p_reason: input.reason,
          p_unit_cost_cents: input.unitCostCents,
          p_idempotency_key: input.idempotencyKey ?? newIdempotencyKey(),
          p_update_cost: input.updateCost,
        }),
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['product', productId] });
      qc.invalidateQueries({ queryKey: productKeys.all(businessId) });
      qc.invalidateQueries({ queryKey: ['dashboard', businessId] });
    },
  });
}

/** Envia a foto para o bucket privado e retorna o caminho salvo. */
export async function uploadProductPhoto(businessId: string, productId: string, uri: string): Promise<string> {
  const response = await fetch(uri);
  const body = await response.arrayBuffer();
  const path = `${businessId}/${productId}-${Date.now()}.jpg`;
  const { error } = await supabase.storage
    .from('product-photos')
    .upload(path, body, { contentType: 'image/jpeg', upsert: false });
  if (error) throw error;
  return path;
}

export function useProductPhotoUrl(path: string | null | undefined) {
  return useQuery({
    queryKey: ['product-photo', path],
    enabled: !!path,
    staleTime: 50 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from('product-photos').createSignedUrl(path!, 60 * 60);
      if (error) throw error;
      return data.signedUrl;
    },
  });
}
