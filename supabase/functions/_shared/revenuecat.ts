/**
 * Lógica pura de integração com o RevenueCat (sem dependências do Deno),
 * compartilhada pelas Edge Functions e coberta por testes unitários (Jest).
 */

export type SubscriptionStatus = 'active' | 'trialing' | 'grace_period' | 'billing_issue' | 'canceled' | 'expired';

export interface SubscriptionState {
  environment: 'production' | 'sandbox';
  entitlement: string;
  status: SubscriptionStatus;
  productId: string | null;
  store: string | null;
  periodType: string | null;
  currentPeriodEnd: string | null;
  gracePeriodEnd: string | null;
  willRenew: boolean;
  billingIssueDetectedAt: string | null;
  unsubscribeDetectedAt: string | null;
  originalTransactionId: string | null;
}

/** Formato (parcial) da resposta GET /v1/subscribers/{app_user_id}. */
export interface RcSubscriber {
  entitlements?: Record<
    string,
    {
      expires_date: string | null;
      grace_period_expires_date?: string | null;
      product_identifier: string;
      purchase_date?: string;
    }
  >;
  subscriptions?: Record<
    string,
    {
      expires_date: string | null;
      grace_period_expires_date?: string | null;
      period_type?: string | null;
      store?: string | null;
      is_sandbox?: boolean;
      unsubscribe_detected_at?: string | null;
      billing_issues_detected_at?: string | null;
      store_transaction_id?: string | null;
    }
  >;
}

const time = (iso: string | null | undefined): number | null => (iso ? new Date(iso).getTime() : null);

/**
 * Converte o assinante do RevenueCat no estado salvo no banco.
 * Retorna null quando o usuário nunca teve o entitlement.
 */
export function subscriberToState(
  subscriber: RcSubscriber,
  entitlementId: string,
  now: Date = new Date(),
): SubscriptionState | null {
  const ent = subscriber.entitlements?.[entitlementId];
  if (!ent) return null;
  const sub = subscriber.subscriptions?.[ent.product_identifier];

  const expires = time(ent.expires_date);
  const grace = time(ent.grace_period_expires_date ?? sub?.grace_period_expires_date ?? null);
  const nowMs = now.getTime();
  // expires_date null = compra vitalícia
  const effectiveEnd = expires == null ? Number.POSITIVE_INFINITY : Math.max(expires, grace ?? 0);

  let status: SubscriptionStatus;
  if (effectiveEnd <= nowMs) status = 'expired';
  else if (sub?.billing_issues_detected_at && grace && grace > nowMs && (expires ?? 0) <= nowMs) status = 'grace_period';
  else if (sub?.billing_issues_detected_at) status = 'billing_issue';
  else if (sub?.unsubscribe_detected_at) status = 'canceled';
  else if ((sub?.period_type ?? '').toLowerCase() === 'trial') status = 'trialing';
  else status = 'active';

  return {
    environment: sub?.is_sandbox ? 'sandbox' : 'production',
    entitlement: entitlementId,
    status,
    productId: ent.product_identifier,
    store: sub?.store ?? null,
    periodType: sub?.period_type ? sub.period_type.toUpperCase() : null,
    currentPeriodEnd: ent.expires_date ?? '9999-12-31T00:00:00Z',
    gracePeriodEnd: grace ? new Date(grace).toISOString() : null,
    willRenew: !sub?.unsubscribe_detected_at && status !== 'expired',
    billingIssueDetectedAt: sub?.billing_issues_detected_at ?? null,
    unsubscribeDetectedAt: sub?.unsubscribe_detected_at ?? null,
    originalTransactionId: sub?.store_transaction_id ?? null,
  };
}

/** Parâmetros para a função SQL upsert_subscription_state. */
export function stateToRpcParams(userId: string, s: SubscriptionState) {
  return {
    p_user_id: userId,
    p_environment: s.environment,
    p_entitlement: s.entitlement,
    p_status: s.status,
    p_product_id: s.productId,
    p_store: s.store,
    p_period_type: s.periodType,
    p_current_period_end: s.currentPeriodEnd,
    p_grace_period_end: s.gracePeriodEnd,
    p_will_renew: s.willRenew,
    p_billing_issue_detected_at: s.billingIssueDetectedAt,
    p_unsubscribe_detected_at: s.unsubscribeDetectedAt,
    p_original_transaction_id: s.originalTransactionId,
  };
}

/** Comparação em tempo constante para o segredo do webhook. */
export function safeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

/** Valida o cabeçalho Authorization configurado no painel do RevenueCat. */
export function verifyWebhookAuthorization(header: string | null, secret: string | undefined): boolean {
  if (!secret || secret.length < 16 || !header) return false;
  const value = header.startsWith('Bearer ') ? header.slice(7) : header;
  return safeEqual(value.trim(), secret);
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type FetchLike = (url: string, init?: { headers?: Record<string, string> }) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

/** Consulta o estado autoritativo do assinante na API REST v1 do RevenueCat. */
export async function fetchSubscriber(appUserId: string, secretKey: string, fetchImpl: FetchLike): Promise<RcSubscriber> {
  const res = await fetchImpl(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`, {
    headers: { Authorization: `Bearer ${secretKey}`, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`RevenueCat respondeu ${res.status}`);
  const body = (await res.json()) as { subscriber?: RcSubscriber };
  return body.subscriber ?? {};
}
