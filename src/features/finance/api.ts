import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { DateRange } from '@/lib/dates';
import { supabase, unwrap } from '@/lib/supabase';
import type { FinanceCategory, FinanceKind, FinanceSummary, FinancialEntry, PaymentMethod } from '@/types/database';

export function useFinanceSummary(businessId: string, range: DateRange, enabled = true) {
  return useQuery({
    queryKey: ['finance', businessId, 'summary', range],
    enabled,
    queryFn: async () =>
      unwrap<FinanceSummary>(
        await supabase.rpc('finance_summary', { p_business_id: businessId, p_from: range.from, p_to: range.to }),
      ),
  });
}

export interface EntryFilters {
  kind?: FinanceKind;
  status?: 'pending' | 'paid';
  range?: DateRange;
}

export function useFinancialEntries(businessId: string, filters: EntryFilters) {
  return useQuery({
    queryKey: ['finance', businessId, 'entries', filters],
    queryFn: async () => {
      let q = supabase
        .from('financial_entries')
        .select('*, finance_categories(name)')
        .eq('business_id', businessId)
        .neq('status', 'canceled')
        .limit(300);
      if (filters.kind) q = q.eq('kind', filters.kind);
      if (filters.status) q = q.eq('status', filters.status);
      if (filters.range) q = q.gte('competence_date', filters.range.from).lte('competence_date', filters.range.to);
      q = filters.status === 'pending' ? q.order('due_date') : q.order('competence_date', { ascending: false });
      return unwrap<FinancialEntry[]>(await q);
    },
  });
}

export function useFinanceCategories(businessId: string, kind: FinanceKind) {
  return useQuery({
    queryKey: ['finance', businessId, 'categories', kind],
    queryFn: async () =>
      unwrap<FinanceCategory[]>(
        await supabase.from('finance_categories').select('*').eq('business_id', businessId).eq('kind', kind).order('name'),
      ),
  });
}

export interface EntryInput {
  kind: FinanceKind;
  description: string;
  amountCents: number;
  categoryId: string | null;
  competenceDate: string;
  dueDate: string | null;
  paid: boolean;
  method: Exclude<PaymentMethod, 'credit'> | null;
  notes: string | null;
}

export function useCreateEntry(businessId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: EntryInput) =>
      unwrap<FinancialEntry>(
        await supabase
          .from('financial_entries')
          .insert({
            business_id: businessId,
            kind: input.kind,
            description: input.description.trim(),
            amount_cents: input.amountCents,
            category_id: input.categoryId,
            competence_date: input.competenceDate,
            due_date: input.dueDate,
            status: input.paid ? 'paid' : 'pending',
            paid_at: input.paid ? new Date().toISOString() : null,
            method: input.paid ? input.method : null,
            notes: input.notes,
          })
          .select()
          .single(),
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finance', businessId] });
      qc.invalidateQueries({ queryKey: ['dashboard', businessId] });
    },
  });
}

export function usePayEntry(businessId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, method }: { id: string; method: Exclude<PaymentMethod, 'credit'> }) =>
      unwrap<FinancialEntry>(await supabase.rpc('pay_financial_entry', { p_entry_id: id, p_method: method })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finance', businessId] });
      qc.invalidateQueries({ queryKey: ['dashboard', businessId] });
    },
  });
}

export function useCancelEntry(businessId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      unwrap<FinancialEntry>(
        await supabase
          .from('financial_entries')
          .update({ status: 'canceled', paid_at: null })
          .eq('id', id)
          .select()
          .single(),
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finance', businessId] });
      qc.invalidateQueries({ queryKey: ['dashboard', businessId] });
    },
  });
}

export const METHOD_OPTIONS = [
  { value: 'cash', label: 'Dinheiro' },
  { value: 'pix', label: 'Pix' },
  { value: 'card', label: 'Cartão' },
] as const;
