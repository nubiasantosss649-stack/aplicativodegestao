import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { supabase, unwrap } from '@/lib/supabase';

import type { Entitlements } from './plans';

export const entitlementsKey = (businessId: string) => ['entitlements', businessId] as const;

/** Plano, limites e uso calculados no servidor (fonte da verdade). */
export function useEntitlements(businessId: string | undefined) {
  return useQuery({
    queryKey: entitlementsKey(businessId ?? ''),
    enabled: !!businessId,
    staleTime: 60_000,
    queryFn: async () =>
      unwrap<Entitlements>(await supabase.rpc('get_entitlements', { p_business_id: businessId! })),
  });
}

export function useInvalidateEntitlements() {
  const qc = useQueryClient();
  return useCallback(() => qc.invalidateQueries({ queryKey: ['entitlements'] }), [qc]);
}

/**
 * Pede ao backend para consultar o RevenueCat e atualizar a assinatura.
 * Usado após compra/restauração, sem depender da chegada do webhook.
 */
export async function syncSubscription(): Promise<{ has_pro: boolean; status: string | null } | null> {
  const { data, error } = await supabase.functions.invoke('sync-subscription', { method: 'POST' });
  if (error) throw error;
  return data as { has_pro: boolean; status: string | null };
}
