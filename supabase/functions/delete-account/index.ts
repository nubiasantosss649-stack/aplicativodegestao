// Edge Function: exclusão definitiva da conta (Google Play, App Store e LGPD).
// 1. Confirma a identidade (JWT) e a frase de confirmação.
// 2. Se houver assinatura ativa, exige ciência explícita (a cobrança é da loja).
// 3. Apaga negócios e dados (delete_user_data), fotos do Storage,
//    o cliente no RevenueCat (se configurado) e o usuário do Auth.
// Segredos: REVENUECAT_SECRET_API_KEY (opcional).
// Deploy: supabase functions deploy delete-account
import { createClient } from 'npm:@supabase/supabase-js@2';

import { corsHeaders, json } from '../_shared/http.ts';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

export const CONFIRMATION_PHRASE = 'EXCLUIR';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: auth, error: authError } = await admin.auth.getUser(token);
  if (authError || !auth.user) return json({ error: 'unauthorized' }, 401);
  const userId = auth.user.id;

  let body: { confirmation?: string; acknowledge_subscription?: boolean };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }
  if ((body.confirmation ?? '').trim().toUpperCase() !== CONFIRMATION_PHRASE) {
    return json({ error: 'confirmation_required', message: `Digite ${CONFIRMATION_PHRASE} para confirmar.` }, 400);
  }

  const { data: hasPro } = await admin.rpc('user_has_pro', { p_user_id: userId });
  if (hasPro && !body.acknowledge_subscription) {
    return json(
      {
        error: 'active_subscription',
        message:
          'Você tem uma assinatura Pro ativa. Excluir a conta NÃO cancela a cobrança na loja: cancele na Google Play ou App Store antes, ou confirme que está ciente.',
      },
      409,
    );
  }

  const { data: businessIds, error: deleteError } = await admin.rpc('delete_user_data', { p_user_id: userId });
  if (deleteError) {
    console.error('delete_user_data', deleteError.message);
    return json({ error: 'delete_failed', message: 'Não foi possível excluir os dados. Tente novamente.' }, 500);
  }

  // Fotos dos produtos (pasta = id do negócio)
  for (const businessId of (businessIds as string[] | null) ?? []) {
    try {
      for (;;) {
        const { data: files } = await admin.storage.from('product-photos').list(businessId, { limit: 100 });
        if (!files || files.length === 0) break;
        await admin.storage.from('product-photos').remove(files.map((f) => `${businessId}/${f.name}`));
        if (files.length < 100) break;
      }
    } catch (e) {
      console.error('storage cleanup', businessId, (e as Error).message);
    }
  }

  // Dados do cliente no RevenueCat (o histórico de compras permanece na loja)
  const rcKey = Deno.env.get('REVENUECAT_SECRET_API_KEY');
  if (rcKey) {
    try {
      await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${rcKey}` },
      });
    } catch (e) {
      console.error('revenuecat delete', (e as Error).message);
    }
  }

  const { error: authDeleteError } = await admin.auth.admin.deleteUser(userId);
  if (authDeleteError) {
    console.error('auth delete', authDeleteError.message);
    return json({ error: 'auth_delete_failed', message: 'Seus dados foram apagados, mas houve falha ao remover o login. Contate o suporte.' }, 500);
  }

  return json({ ok: true, businesses_deleted: ((businessIds as string[] | null) ?? []).length });
});
