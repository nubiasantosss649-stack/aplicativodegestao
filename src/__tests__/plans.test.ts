import { describeIntroOffer, hasFeature, planLimitKind, usageMeters, type Entitlements } from '@/features/subscription/plans';
import { AppError, toAppError } from '@/lib/errors';

const free: Entitlements = {
  plan: 'free',
  plan_name: 'Plano Grátis',
  is_owner: true,
  features: ['basic_dashboard'],
  limits: { max_active_products: 30, max_sales_per_month: 50, max_customers: null, ai_monthly_requests: 0 },
  usage: { active_products: 25, sales_this_month: 50, customers: 300 },
  subscription: null,
};

describe('planos', () => {
  it('calcula medidores apenas para recursos limitados', () => {
    const m = usageMeters(free);
    expect(m.map((x) => x.label)).toEqual(['Produtos ativos', 'Vendas neste mês']);
    expect(m[0]).toMatchObject({ used: 25, limit: 30, reached: false, nearLimit: true });
    expect(m[1]).toMatchObject({ reached: true, ratio: 1 });
    expect(usageMeters({ ...free, limits: { ...free.limits, max_active_products: null, max_sales_per_month: null } })).toEqual([]);
  });

  it('verifica recursos Pro', () => {
    expect(hasFeature(free, 'finance_reports')).toBe(false);
    expect(hasFeature({ ...free, features: ['finance_reports'] }, 'finance_reports')).toBe(true);
    expect(hasFeature(undefined, 'finance_reports')).toBe(false);
  });

  it('identifica erros de limite vindos do banco', () => {
    const err = toAppError({ code: 'P0001', message: 'Limite de 30 produtos', hint: 'plan_limit_products' });
    expect(planLimitKind(err)).toBe('products');
    expect(planLimitKind(new AppError('x', 'P0001', 'plan_limit_sales'))).toBe('sales');
    expect(planLimitKind(new AppError('x', 'P0001', 'insufficient_stock'))).toBeNull();
  });

  it('descreve o teste grátis somente quando a loja informa período gratuito', () => {
    expect(describeIntroOffer({ price: 0, periodUnit: 'DAY', periodNumberOfUnits: 7 })).toBe('7 dias grátis');
    expect(describeIntroOffer({ price: 0, periodUnit: 'WEEK', periodNumberOfUnits: 1 })).toBe('7 dias grátis');
    expect(describeIntroOffer({ price: 0, periodUnit: 'MONTH', periodNumberOfUnits: 1 })).toBe('1 mês grátis');
    expect(describeIntroOffer({ price: 9.9, periodUnit: 'MONTH', periodNumberOfUnits: 1 })).toBeNull();
    expect(describeIntroOffer(null)).toBeNull();
  });
});
