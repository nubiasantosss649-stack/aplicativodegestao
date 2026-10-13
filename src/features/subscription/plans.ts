import type { AppError } from '@/lib/errors';

/** Resposta da função get_entitlements (calculada no banco). */
export interface Entitlements {
  plan: 'free' | 'pro';
  plan_name: string;
  is_owner: boolean;
  features: string[];
  limits: {
    max_active_products: number | null;
    max_sales_per_month: number | null;
    max_customers: number | null;
    ai_monthly_requests: number;
  };
  usage: { active_products: number; sales_this_month: number; customers: number };
  subscription: {
    status: 'active' | 'trialing' | 'grace_period' | 'billing_issue' | 'canceled' | 'expired';
    product_id: string | null;
    store: string | null;
    environment: 'production' | 'sandbox';
    period_type: string | null;
    current_period_end: string | null;
    grace_period_end: string | null;
    will_renew: boolean | null;
    billing_issue_detected_at: string | null;
    has_access: boolean;
    updated_at: string;
  } | null;
}

export type ProFeature =
  | 'advanced_dashboard'
  | 'full_receivables'
  | 'charge_messages'
  | 'advanced_stock'
  | 'finance_reports'
  | 'exports'
  | 'ai_assistant'
  | 'full_history'
  | 'advanced_charts';

export function hasFeature(e: Entitlements | undefined, feature: ProFeature): boolean {
  return !!e && e.features.includes(feature);
}

export interface UsageMeter {
  label: string;
  used: number;
  limit: number;
  ratio: number;
  reached: boolean;
  nearLimit: boolean;
}

/** Medidores de uso do plano (apenas recursos limitados). */
export function usageMeters(e: Entitlements): UsageMeter[] {
  const meters: UsageMeter[] = [];
  const add = (label: string, used: number, limit: number | null) => {
    if (limit == null) return;
    const ratio = limit === 0 ? 1 : Math.min(1, used / limit);
    meters.push({ label, used, limit, ratio, reached: used >= limit, nearLimit: ratio >= 0.8 });
  };
  add('Produtos ativos', e.usage.active_products, e.limits.max_active_products);
  add('Vendas neste mês', e.usage.sales_this_month, e.limits.max_sales_per_month);
  add('Clientes', e.usage.customers, e.limits.max_customers);
  return meters;
}

export type PlanLimitKind = 'products' | 'sales';

/** Identifica erros de limite do plano lançados pelo banco. */
export function planLimitKind(error: AppError | { hint?: string | null } | null | undefined): PlanLimitKind | null {
  const hint = error?.hint ?? '';
  if (hint === 'plan_limit_products') return 'products';
  if (hint === 'plan_limit_sales') return 'sales';
  return null;
}

const STATUS_LABELS: Record<NonNullable<Entitlements['subscription']>['status'], string> = {
  active: 'Ativa',
  trialing: 'Em teste grátis',
  grace_period: 'Pagamento pendente (acesso mantido)',
  billing_issue: 'Problema na cobrança',
  canceled: 'Cancelada (acesso até o fim do período)',
  expired: 'Expirada',
};

export function subscriptionStatusLabel(status: keyof typeof STATUS_LABELS): string {
  return STATUS_LABELS[status];
}

export const STORE_LABELS: Record<string, string> = {
  PLAY_STORE: 'Google Play',
  APP_STORE: 'App Store',
  MAC_APP_STORE: 'App Store',
  STRIPE: 'Web',
  PROMOTIONAL: 'Promocional',
  TEST_STORE: 'Loja de testes',
};

/** Benefícios exibidos na tela Pro (somente o que existe ou está explicitamente marcado como "em breve"). */
export const PRO_BENEFITS: { icon: string; title: string; text: string; available: boolean }[] = [
  { icon: 'infinite', title: 'Produtos e vendas ilimitados', text: 'Sem o limite de 30 produtos e 50 vendas por mês.', available: true },
  { icon: 'bar-chart', title: 'Dashboard completo', text: 'Gráfico de vendas, produtos campeões e movimentações.', available: true },
  { icon: 'pie-chart', title: 'Relatório financeiro', text: 'Fluxo de caixa, lucro estimado e despesas por categoria.', available: true },
  { icon: 'logo-whatsapp', title: 'Cobranças completas', text: 'Mensagens de cobrança personalizadas pelo WhatsApp.', available: true },
  { icon: 'sparkles', title: 'Assistente IA', text: 'Pergunte sobre vendas, lucro e estoque.', available: false },
  { icon: 'document-text', title: 'Exportação PDF e Excel', text: 'Relatórios para contador e banco.', available: false },
];

/**
 * Descreve a oferta introdutória (teste grátis) de um produto da loja.
 * Só retorna texto quando a loja informa um período gratuito — nunca inventado.
 */
export function describeIntroOffer(intro: { price: number; periodUnit: string; periodNumberOfUnits: number } | null | undefined): string | null {
  if (!intro || intro.price !== 0) return null;
  const n = intro.periodNumberOfUnits;
  const unit = intro.periodUnit.toUpperCase();
  const label =
    unit === 'DAY' ? (n === 1 ? 'dia' : 'dias') :
    unit === 'WEEK' ? (n === 1 ? 'semana' : 'semanas') :
    unit === 'MONTH' ? (n === 1 ? 'mês' : 'meses') :
    unit === 'YEAR' ? (n === 1 ? 'ano' : 'anos') : null;
  if (!label) return null;
  if (unit === 'WEEK' && n === 1) return '7 dias grátis';
  return `${n} ${label} grátis`;
}
