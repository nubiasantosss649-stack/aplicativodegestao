// Edge Function: sincroniza a assinatura do usuário autenticado com o RevenueCat.
// Chamada pelo app após compra ou restauração (o webhook pode demorar alguns segundos).
// Segredos: REVENUECAT_SECRET_API_KEY (obrigatório), PRO_ENTITLEMENT_ID (opcional).
// Deploy: supabase functions deploy sync-subscription
import { createClient } from 'npm:@supabase/supabase-js@2';

import { corsHeaders, json } from '../_shared/http.ts';
import { fetchSubscriber, stateToRpcParams, subscriberToState } from '../_shared/revenuecat.ts';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: auth, error: authError } = await admin.auth.getUser(token);
  if (authError || !auth.user) return json({ error: 'unauthorized' }, 401);

  const secretKey = Deno.env.get('REVENUECAT_SECRET_API_KEY');
  if (!secretKey) return json({ error: 'billing_not_configured' }, 503);

  try {
    const entitlement = Deno.env.get('PRO_ENTITLEMENT_ID') ?? 'pro';
    // O app identifica o usuário no RevenueCat com o mesmo id do Supabase (Purchases.logIn)
    const state = subscriberToState(await fetchSubscriber(auth.user.id, secretKey, fetch), entitlement);
    if (state) {
      const { error } = await admin.rpc('upsert_subscription_state', stateToRpcParams(auth.user.id, state));
      if (error) throw new Error(error.message);
    }
    const { data: hasPro } = await admin.rpc('user_has_pro', { p_user_id: auth.user.id });
    return json({ ok: true, status: state?.status ?? null, environment: state?.environment ?? null, has_pro: !!hasPro });
  } catch (e) {
    console.error('sync-subscription', (e as Error).message);
    return json({ error: 'sync_failed' }, 502);
  }
});
