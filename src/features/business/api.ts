import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { onlyDigits, detectDocumentType } from '@/lib/documents';
import { supabase, unwrap } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import type { Business, Profile } from '@/types/database';

export interface BusinessInput {
  name: string;
  businessType: string;
  document: string;
  phone: string;
}

export function useCreateBusiness() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: BusinessInput) => {
      const doc = onlyDigits(input.document);
      return unwrap<Business>(
        await supabase.rpc('create_business', {
          p_name: input.name.trim(),
          p_business_type: input.businessType,
          p_document_type: doc ? detectDocumentType(doc) : null,
          p_document: doc || null,
          p_phone: onlyDigits(input.phone) || null,
        }),
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['memberships'] }),
  });
}

export type BusinessSettingsInput = Partial<
  Pick<
    Business,
    | 'name'
    | 'business_type'
    | 'document_type'
    | 'document'
    | 'phone'
    | 'allow_negative_stock'
    | 'seller_max_discount_percent'
    | 'default_credit_days'
    | 'receipt_footer'
  >
>;

export function useUpdateBusiness(businessId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: BusinessSettingsInput) =>
      unwrap<Business>(await supabase.from('businesses').update(patch).eq('id', businessId).select().single()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['memberships'] }),
  });
}

export function useProfile() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['profile', user?.id],
    enabled: !!user,
    queryFn: async () =>
      unwrap<Profile>(await supabase.from('profiles').select('id, full_name, phone').eq('id', user!.id).single()),
  });
}

export function useUpdateProfile() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: { full_name: string; phone: string | null }) =>
      unwrap<Profile>(await supabase.from('profiles').update(patch).eq('id', user!.id).select().single()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profile'] }),
  });
}
