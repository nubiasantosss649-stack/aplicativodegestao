import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase, unwrap } from '@/lib/supabase';
import type { DateRange } from '@/lib/dates';
import type { PaymentLine } from './cart';
import type { Sale, SaleDetail } from '@/types/database';

function invalidateAfterSale(qc: ReturnType<typeof useQueryClient>, businessId: string) {
  for (const key of ['sales', 'products', 'dashboard', 'customers', 'receivables', 'finance']) {
    qc.invalidateQueries({ queryKey: [key, businessId] });
  }
  qc.invalidateQueries({ queryKey: ['product'] });
  qc.invalidateQueries({ queryKey: ['customer'] });
}

export interface CompleteSaleInput {
  idempotencyKey: string;
  items: { productId: string; quantity: number; discountCents: number }[];
  payments: PaymentLine[];
  customerId: string | null;
  discountCents: number;
  dueDate: string | null;
  notes: string | null;
}

export function useCompleteSale(businessId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CompleteSaleInput) =>
      unwrap<Sale>(
        await supabase.rpc('complete_sale', {
          p_business_id: businessId,
          p_idempotency_key: input.idempotencyKey,
          p_items: input.items.map((i) => ({
            product_id: i.productId,
            quantity: i.quantity,
            discount_cents: i.discountCents,
          })),
          p_payments: input.payments.map((p) => ({ method: p.method, amount_cents: p.amountCents })),
          p_customer_id: input.customerId,
          p_discount_cents: input.discountCents,
          p_due_date: input.dueDate,
          p_notes: input.notes,
        }),
      ),
    onSuccess: () => invalidateAfterSale(qc, businessId),
  });
}

export function useSales(businessId: string, range: DateRange, status: 'all' | 'completed' | 'canceled' = 'all') {
  return useQuery({
    queryKey: ['sales', businessId, range, status],
    queryFn: async () => {
      // Limites do período em horário local do aparelho
      const from = new Date(`${range.from}T00:00:00`).toISOString();
      const to = new Date(new Date(`${range.to}T00:00:00`).getTime() + 86_400_000).toISOString();
      let q = supabase
        .from('sales')
        .select('*, customers(id, name, phone)')
        .eq('business_id', businessId)
        .gte('created_at', from)
        .lt('created_at', to)
        .order('created_at', { ascending: false })
        .limit(300);
      if (status !== 'all') q = q.eq('status', status);
      return unwrap<(Sale & { customers: { id: string; name: string } | null })[]>(await q);
    },
  });
}

export function useSale(id: string | undefined) {
  return useQuery({
    queryKey: ['sale', id],
    enabled: !!id,
    queryFn: async () =>
      unwrap<SaleDetail>(
        await supabase
          .from('sales')
          .select('*, customers(id, name, phone), sale_items(*), sale_payments(*)')
          .eq('id', id!)
          .single(),
      ),
  });
}

export function useCancelSale(businessId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ saleId, reason }: { saleId: string; reason: string }) =>
      unwrap<Sale>(await supabase.rpc('cancel_sale', { p_sale_id: saleId, p_reason: reason })),
    onSuccess: (sale) => {
      qc.invalidateQueries({ queryKey: ['sale', sale.id] });
      invalidateAfterSale(qc, businessId);
    },
  });
}
