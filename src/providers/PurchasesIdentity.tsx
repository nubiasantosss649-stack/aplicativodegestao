import { useEffect } from 'react';

import { identifyPurchasesUser, resetPurchasesUser } from '@/lib/purchases';

import { useAuth } from './AuthProvider';

/** Mantém o usuário do RevenueCat igual ao usuário do Supabase. */
export function PurchasesIdentity() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  useEffect(() => {
    (userId ? identifyPurchasesUser(userId) : resetPurchasesUser()).catch((e) =>
      console.warn('RevenueCat', e instanceof Error ? e.message : e),
    );
  }, [userId]);
  return null;
}
