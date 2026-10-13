import { useQuery } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { prefs } from '@/lib/storage';
import { supabase, unwrap } from '@/lib/supabase';
import type { Business, BusinessMembership, BusinessRole } from '@/types/database';

import { useAuth } from './AuthProvider';

interface BusinessContextValue {
  memberships: BusinessMembership[];
  business: Business | null;
  role: BusinessRole | null;
  isManager: boolean;
  loading: boolean;
  error: unknown;
  selectBusiness: (id: string) => void;
  refetch: () => Promise<unknown>;
}

const BusinessContext = createContext<BusinessContextValue | null>(null);

export const membershipsKey = (userId: string | undefined) => ['memberships', userId] as const;

export function BusinessProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    prefs.get('business').then(setSelectedId);
  }, []);

  const query = useQuery({
    queryKey: membershipsKey(user?.id),
    enabled: !!user,
    queryFn: async () =>
      unwrap<BusinessMembership[]>(
        await supabase
          .from('business_members')
          .select('business_id, user_id, role, businesses(*)')
          .eq('user_id', user!.id)
          .order('created_at'),
      ),
  });

  const memberships = useMemo(() => query.data ?? [], [query.data]);
  const current = memberships.find((m) => m.business_id === selectedId) ?? memberships[0] ?? null;

  const selectBusiness = useCallback((id: string) => {
    setSelectedId(id);
    prefs.set('business', id);
  }, []);

  const value = useMemo<BusinessContextValue>(
    () => ({
      memberships,
      business: current?.businesses ?? null,
      role: current?.role ?? null,
      isManager: current?.role === 'owner' || current?.role === 'manager',
      loading: !!user && query.isPending,
      error: query.error,
      selectBusiness,
      refetch: query.refetch,
    }),
    [memberships, current, user, query.isPending, query.error, query.refetch, selectBusiness],
  );

  return <BusinessContext.Provider value={value}>{children}</BusinessContext.Provider>;
}

export function useBusiness(): BusinessContextValue {
  const ctx = useContext(BusinessContext);
  if (!ctx) throw new Error('useBusiness deve ser usado dentro de BusinessProvider');
  return ctx;
}

/** Negócio atual garantido (usar apenas em telas protegidas por negócio). */
export function useCurrentBusiness(): Business & { isManager: boolean; role: BusinessRole } {
  const { business, isManager, role } = useBusiness();
  if (!business || !role) throw new Error('Nenhum negócio selecionado');
  return { ...business, isManager, role };
}
