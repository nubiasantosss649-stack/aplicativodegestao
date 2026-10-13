import {
  fetchSubscriber,
  safeEqual,
  stateToRpcParams,
  subscriberToState,
  verifyWebhookAuthorization,
  type RcSubscriber,
} from '../../supabase/functions/_shared/revenuecat';

const NOW = new Date('2026-10-14T12:00:00Z');
const future = '2026-11-14T12:00:00Z';
const past = '2026-10-01T12:00:00Z';

function subscriber(sub: Partial<NonNullable<RcSubscriber['subscriptions']>[string]>, ent: Partial<NonNullable<RcSubscriber['entitlements']>[string]> = {}): RcSubscriber {
  return {
    entitlements: { pro: { expires_date: future, product_identifier: 'gestao_pro_mensal', ...ent } },
    subscriptions: { gestao_pro_mensal: { expires_date: future, period_type: 'normal', store: 'play_store', is_sandbox: false, ...sub } },
  };
}

describe('subscriberToState', () => {
  it('retorna null sem o entitlement', () => {
    expect(subscriberToState({ entitlements: {} }, 'pro', NOW)).toBeNull();
  });

  it('assinatura ativa em produção', () => {
    const s = subscriberToState(subscriber({}), 'pro', NOW)!;
    expect(s).toMatchObject({ status: 'active', environment: 'production', willRenew: true, productId: 'gestao_pro_mensal' });
  });

  it('teste grátis', () => {
    expect(subscriberToState(subscriber({ period_type: 'trial' }), 'pro', NOW)!.status).toBe('trialing');
  });

  it('sandbox é identificado', () => {
    expect(subscriberToState(subscriber({ is_sandbox: true }), 'pro', NOW)!.environment).toBe('sandbox');
  });

  it('cancelada mas vigente', () => {
    const s = subscriberToState(subscriber({ unsubscribe_detected_at: past }), 'pro', NOW)!;
    expect(s.status).toBe('canceled');
    expect(s.willRenew).toBe(false);
  });

  it('problema de cobrança dentro do período de tolerância', () => {
    const s = subscriberToState(
      subscriber({ billing_issues_detected_at: past }, { expires_date: past, grace_period_expires_date: future }),
      'pro',
      NOW,
    )!;
    expect(s.status).toBe('grace_period');
    expect(s.gracePeriodEnd).toBe(new Date(future).toISOString());
  });

  it('problema de cobrança ainda no período pago', () => {
    expect(subscriberToState(subscriber({ billing_issues_detected_at: past }), 'pro', NOW)!.status).toBe('billing_issue');
  });

  it('expirada', () => {
    const s = subscriberToState(subscriber({}, { expires_date: past }), 'pro', NOW)!;
    expect(s.status).toBe('expired');
    expect(s.willRenew).toBe(false);
  });

  it('converte para parâmetros da RPC', () => {
    const p = stateToRpcParams('u1', subscriberToState(subscriber({}), 'pro', NOW)!);
    expect(p).toMatchObject({ p_user_id: 'u1', p_status: 'active', p_environment: 'production', p_entitlement: 'pro' });
  });
});

describe('autorização do webhook', () => {
  const secret = 'segredo-muito-longo-123';
  it('aceita somente o segredo correto', () => {
    expect(verifyWebhookAuthorization(`Bearer ${secret}`, secret)).toBe(true);
    expect(verifyWebhookAuthorization(secret, secret)).toBe(true);
    expect(verifyWebhookAuthorization('Bearer errado', secret)).toBe(false);
    expect(verifyWebhookAuthorization(null, secret)).toBe(false);
  });
  it('recusa quando o segredo não está configurado ou é fraco', () => {
    expect(verifyWebhookAuthorization('Bearer x', undefined)).toBe(false);
    expect(verifyWebhookAuthorization('Bearer curto', 'curto')).toBe(false);
  });
  it('comparação segura', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
});

describe('fetchSubscriber', () => {
  it('chama a API v1 com a chave secreta', async () => {
    const calls: { url: string; auth?: string }[] = [];
    const fake = async (url: string, init?: { headers?: Record<string, string> }) => {
      calls.push({ url, auth: init?.headers?.Authorization });
      return { ok: true, status: 200, json: async () => ({ subscriber: subscriber({}) }) };
    };
    const s = await fetchSubscriber('user 1', 'sk_x', fake);
    expect(calls[0]).toEqual({ url: 'https://api.revenuecat.com/v1/subscribers/user%201', auth: 'Bearer sk_x' });
    expect(s.entitlements?.pro).toBeDefined();
  });
  it('propaga erro HTTP', async () => {
    const fake = async () => ({ ok: false, status: 401, json: async () => ({}) });
    await expect(fetchSubscriber('u', 'k', fake)).rejects.toThrow('401');
  });
});
