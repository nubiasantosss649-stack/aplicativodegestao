import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { newIdempotencyKey } from '@/lib/id';
import { supabase, unwrap } from '@/lib/supabase';
import type { PaymentMethod, Receivable, ReceivablePayment } from '@/types/database';

function invalidate(qc: ReturnType<typeof useQueryClient>, businessId: string, customerId: string) {
  qc.invalidateQueries({ queryKey: ['receivables', businessId] });
  qc.invalidateQueries({ queryKey: ['customers', businessId] });
  qc.invalidateQueries({ queryKey: ['dashboard', businessId] });
  qc.invalidateQueries({ queryKey: ['finance', businessId] });
  qc.invalidateQueries({ queryKey: ['customer', customerId] });
}

export function useCustomerReceivables(businessId: string, customerId: string | undefined) {
  return useQuery({
    queryKey: ['receivables', businessId, customerId],
    enabled: !!customerId,
    queryFn: async () =>
      unwrap<Receivable[]>(
        await supabase
          .from('receivables')
          .select('*')
          .eq('customer_id', customerId!)
          .neq('status', 'canceled')
          .order('due_date'),
      ),
  });
}

export function useCustomerPayments(businessId: string, customerId: string | undefined) {
  return useQuery({
    queryKey: ['receivables', businessId, customerId, 'payments'],
    enabled: !!customerId,
    queryFn: async () =>
      unwrap<ReceivablePayment[]>(
        await supabase
          .from('receivable_payments')
          .select('*')
          .eq('customer_id', customerId!)
          .order('paid_at', { ascending: false })
          .limit(100),
      ),
  });
}

export function useReceivePayment(businessId: string, customerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      amountCents: number;
      method: Exclude<PaymentMethod, 'credit'>;
      notes: string | null;
      receivableId?: string | null;
      idempotencyKey?: string;
    }) =>
      unwrap<{ applied_cents: number; payments: number; duplicate: boolean }>(
        await supabase.rpc('receive_payment', {
          p_business_id: businessId,
          p_customer_id: customerId,
          p_amount_cents: input.amountCents,
          p_method: input.method,
          p_idempotency_key: input.idempotencyKey ?? newIdempotencyKey(),
          p_receivable_id: input.receivableId ?? null,
          p_notes: input.notes,
        }),
      ),
    onSuccess: () => invalidate(qc, businessId, customerId),
  });
}

export function useCreateReceivable(businessId: string, customerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { description: string; amountCents: number; dueDate: string | null }) =>
      unwrap<Receivable>(
        await supabase.rpc('create_receivable', {
          p_business_id: businessId,
          p_customer_id: customerId,
          p_description: input.description,
          p_amount_cents: input.amountCents,
          p_due_date: input.dueDate,
        }),
      ),
    onSuccess: () => invalidate(qc, businessId, customerId),
  });
}

export function useReversePayment(businessId: string, customerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ paymentId, reason }: { paymentId: string; reason: string }) =>
      unwrap<ReceivablePayment>(
        await supabase.rpc('reverse_receivable_payment', { p_payment_id: paymentId, p_reason: reason }),
      ),
    onSuccess: () => invalidate(qc, businessId, customerId),
  });
}
