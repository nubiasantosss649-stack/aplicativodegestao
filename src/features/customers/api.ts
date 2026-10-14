import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { onlyDigits } from '@/lib/documents';
import { sanitizeSearch } from '@/lib/search';
import { supabase, unwrap } from '@/lib/supabase';
import type { Customer, CustomerBalance, Sale } from '@/types/database';

export const customerKeys = {
  all: (bid: string) => ['customers', bid] as const,
  balances: (bid: string) => ['customers', bid, 'balances'] as const,
  detail: (id: string) => ['customer', id] as const,
  sales: (id: string) => ['customer', id, 'sales'] as const,
};

export function useCustomers(businessId: string, search = '') {
  return useQuery({
    queryKey: [...customerKeys.all(businessId), 'list', search],
    queryFn: async () => {
      let q = supabase.from('customers').select('*').eq('business_id', businessId).eq('active', true).order('name').limit(500);
      const term = sanitizeSearch(search);
      if (term) {
        const digits = onlyDigits(term);
        q = digits.length >= 4 ? q.or(`name.ilike.%${term}%,phone.ilike.%${digits}%`) : q.ilike('name', `%${term}%`);
      }
      return unwrap<Customer[]>(await q);
    },
  });
}

/** Saldo devedor, total gasto e última compra (calculados no banco). */
export function useCustomerBalances(businessId: string) {
  return useQuery({
    queryKey: customerKeys.balances(businessId),
    queryFn: async () => {
      const rows = unwrap<CustomerBalance[]>(await supabase.rpc('customer_balances', { p_business_id: businessId }));
      return rows.map((r) => ({
        ...r,
        balance_cents: Number(r.balance_cents),
        overdue_cents: Number(r.overdue_cents),
        total_spent_cents: Number(r.total_spent_cents),
        purchases_count: Number(r.purchases_count),
      }));
    },
  });
}

export function useCustomer(id: string | undefined) {
  return useQuery({
    queryKey: customerKeys.detail(id ?? ''),
    enabled: !!id,
    queryFn: async () => unwrap<Customer>(await supabase.from('customers').select('*').eq('id', id!).single()),
  });
}

export function useCustomerSales(id: string | undefined) {
  return useQuery({
    queryKey: customerKeys.sales(id ?? ''),
    enabled: !!id,
    queryFn: async () =>
      unwrap<Sale[]>(
        await supabase.from('sales').select('*').eq('customer_id', id!).order('created_at', { ascending: false }).limit(50),
      ),
  });
}

export interface CustomerInput {
  name: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
}

function toRow(input: CustomerInput) {
  return {
    name: input.name.trim(),
    phone: onlyDigits(input.phone) || null,
    email: input.email.trim() || null,
    address: input.address.trim() || null,
    notes: input.notes.trim() || null,
  };
}

export function useCreateCustomer(businessId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CustomerInput) =>
      unwrap<Customer>(
        await supabase.from('customers').insert({ business_id: businessId, ...toRow(input) }).select().single(),
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: customerKeys.all(businessId) });
      qc.invalidateQueries({ queryKey: ['entitlements', businessId] });
    },
  });
}

export function useUpdateCustomer(businessId: string, id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CustomerInput | { active: boolean }) =>
      unwrap<Customer>(
        await supabase
          .from('customers')
          .update('active' in input ? input : toRow(input))
          .eq('id', id)
          .select()
          .single(),
      ),
    onSuccess: (c) => {
      qc.setQueryData(customerKeys.detail(id), c);
      qc.invalidateQueries({ queryKey: customerKeys.all(businessId) });
    },
  });
}
