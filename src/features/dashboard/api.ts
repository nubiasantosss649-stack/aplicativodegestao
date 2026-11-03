import { useQuery } from '@tanstack/react-query';

import type { DateRange } from '@/lib/dates';
import { supabase, unwrap } from '@/lib/supabase';
import type { DashboardSummary } from '@/types/database';

/** Indicadores calculados no banco (determinísticos) para o período. */
export function useDashboard(businessId: string, range: DateRange) {
  return useQuery({
    queryKey: ['dashboard', businessId, range],
    queryFn: async () =>
      unwrap<DashboardSummary>(
        await supabase.rpc('dashboard_summary', { p_business_id: businessId, p_from: range.from, p_to: range.to }),
      ),
  });
}
