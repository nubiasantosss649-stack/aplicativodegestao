// Edge Function: recebe webhooks do RevenueCat e atualiza a assinatura.
// Segredos (configurar com `supabase secrets set`):
//   REVENUECAT_WEBHOOK_AUTH      — mesmo valor do "Authorization header" no painel do RevenueCat
//   REVENUECAT_SECRET_API_KEY    — (opcional) chave secreta v1 para sincronizar transferências
//   PRO_ENTITLEMENT_ID           — (opcional) padrão "pro"
// Deploy: supabase functions deploy revenuecat-webhook --no-verify-jwt
import { createClient } from 'npm:@supabase/supabase-js@2';

import { json } from '../_shared/http.ts';
import {
  UUID_RE,
  fetchSubscriber,
  stateToRpcParams,
  subscriberToState,
  verifyWebhookAuthorization,
} from '../_shared/revenuecat.ts';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  if (!verifyWebhookAuthorization(req.headers.get('authorization'), Deno.env.get('REVENUECAT_WEBHOOK_AUTH'))) {
    return json({ error: 'unauthorized' }, 401);
  }

  let payload: { event?: { type?: string; transferred_to?: string[] } };
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const { data, error } = await admin.rpc('apply_revenuecat_event', { p_payload: payload });
  if (error) {
    console.error('apply_revenuecat_event', error.message);
    // 5xx faz o RevenueCat tentar novamente
    return json({ error: 'processing_failed' }, 500);
  }

  // Transferência: sincroniza quem recebeu a assinatura pela API REST
  const secretKey = Deno.env.get('REVENUECAT_SECRET_API_KEY');
  if (payload.event?.type === 'TRANSFER' && secretKey) {
    const entitlement = Deno.env.get('PRO_ENTITLEMENT_ID') ?? 'pro';
    for (const userId of payload.event.transferred_to ?? []) {
      if (!UUID_RE.test(userId)) continue;
      try {
        const state = subscriberToState(await fetchSubscriber(userId, secretKey, fetch), entitlement);
        if (state) await admin.rpc('upsert_subscription_state', stateToRpcParams(userId, state));
      } catch (e) {
        console.error('transfer sync', userId, (e as Error).message);
      }
    }
  }

  return json({ ok: true, result: data });
});
