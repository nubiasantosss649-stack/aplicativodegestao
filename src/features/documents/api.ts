import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase, unwrap } from '@/lib/supabase';

export interface Quote {
  id: string;
  business_id: string;
  customer_id: string | null;
  number: number;
  status: 'draft' | 'sent' | 'approved' | 'rejected' | 'expired';
  valid_until: string | null;
  subtotal_cents: number;
  discount_cents: number;
  total_cents: number;
  notes: string | null;
  created_at: string;
  customers: { id: string; name: string; phone: string | null } | null;
}

export interface QuoteItem {
  id: string;
  product_id: string | null;
  description: string;
  quantity: number;
  unit_price_cents: number;
  total_cents: number;
}

export interface DocumentRecord {
  id: string;
  kind: 'sale_receipt' | 'payment_receipt' | 'service_receipt' | 'quote';
  reference_id: string | null;
  number: number | null;
  title: string | null;
  amount_cents: number | null;
  data: Record<string, unknown>;
  created_at: string;
}

export const QUOTE_STATUS = {
  draft: { label: 'Rascunho', tone: 'neutral' },
  sent: { label: 'Enviado', tone: 'primary' },
  approved: { label: 'Aprovado', tone: 'success' },
  rejected: { label: 'Recusado', tone: 'danger' },
  expired: { label: 'Expirado', tone: 'warning' },
} as const;

export function useQuotes(businessId: string) {
  return useQuery({
    queryKey: ['quotes', businessId],
    queryFn: async () =>
      unwrap<Quote[]>(
        await supabase
          .from('quotes')
          .select('*, customers(id, name, phone)')
          .eq('business_id', businessId)
          .order('created_at', { ascending: false })
          .limit(200),
      ),
  });
}

export function useQuote(id: string | undefined) {
  return useQuery({
    queryKey: ['quote', id],
    enabled: !!id,
    queryFn: async () =>
      unwrap<Quote & { quote_items: QuoteItem[] }>(
        await supabase.from('quotes').select('*, customers(id, name, phone), quote_items(*)').eq('id', id!).single(),
      ),
  });
}

export interface QuoteInput {
  customerId: string | null;
  items: { productId: string | null; description: string; quantity: number; unitPriceCents: number }[];
  discountCents: number;
  validUntil: string | null;
  notes: string | null;
}

export function useSaveQuote(businessId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (q: QuoteInput) =>
      unwrap<Quote>(
        await supabase.rpc('save_quote', {
          p_business_id: businessId,
          p_items: q.items.map((i) => ({
            product_id: i.productId,
            description: i.description,
            quantity: i.quantity,
            unit_price_cents: i.unitPriceCents,
          })),
          p_customer_id: q.customerId,
          p_discount_cents: q.discountCents,
          p_valid_until: q.validUntil,
          p_notes: q.notes,
        }),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quotes', businessId] }),
  });
}

export function useUpdateQuoteStatus(businessId: string, id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (status: Quote['status']) =>
      unwrap<Quote>(await supabase.from('quotes').update({ status }).eq('id', id).select().single()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quote', id] });
      qc.invalidateQueries({ queryKey: ['quotes', businessId] });
    },
  });
}

export function useDocuments(businessId: string) {
  return useQuery({
    queryKey: ['documents', businessId],
    queryFn: async () =>
      unwrap<DocumentRecord[]>(
        await supabase
          .from('documents')
          .select('*')
          .eq('business_id', businessId)
          .order('created_at', { ascending: false })
          .limit(200),
      ),
  });
}

/** Registra o documento gerado no histórico (e numera recibos). */
export async function registerDocument(
  businessId: string,
  kind: DocumentRecord['kind'],
  referenceId: string | null,
  title: string,
  amountCents: number | null,
  data: Record<string, unknown> = {},
): Promise<DocumentRecord> {
  return unwrap<DocumentRecord>(
    await supabase.rpc('register_document', {
      p_business_id: businessId,
      p_kind: kind,
      p_reference_id: referenceId,
      p_title: title,
      p_amount_cents: amountCents,
      p_data: data,
    }),
  );
}
