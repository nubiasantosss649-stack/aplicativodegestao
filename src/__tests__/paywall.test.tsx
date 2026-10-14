import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { ToastProvider } from '@/components/ui';
import type { Entitlements } from '@/features/subscription/plans';
import { ThemeProvider } from '@/theme/ThemeProvider';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({ reason: 'products' }),
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/lib/supabase', () => ({ supabase: {}, unwrap: jest.fn() }));
jest.mock('@/providers/BusinessProvider', () => ({
  useCurrentBusiness: () => ({ id: 'b1', name: 'Loja', role: 'owner', isManager: true }),
}));

const mockEntitlements: { data: Entitlements } = {
  data: {
    plan: 'free',
    plan_name: 'Plano Grátis',
    is_owner: true,
    features: [],
    limits: { max_active_products: 30, max_sales_per_month: 50, max_customers: null, ai_monthly_requests: 0 },
    usage: { active_products: 30, sales_this_month: 10, customers: 2 },
    subscription: null,
  },
};
jest.mock('@/features/subscription/api', () => ({
  useEntitlements: () => ({ ...mockEntitlements, isPending: false, refetch: jest.fn() }),
  useInvalidateEntitlements: () => jest.fn(),
  syncSubscription: jest.fn(),
}));

// eslint-disable-next-line import/first
import Paywall from '@/app/(app)/subscription/index';

async function renderPaywall() {
  const qc = new QueryClient();
  return await render(
    <QueryClientProvider client={qc}>
      <ThemeProvider>
        <ToastProvider>
          <Paywall />
        </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

describe('Tela Pro', () => {
  it('sem loja configurada não oferece compra e identifica dados fictícios', async () => {
    await renderPaywall();
    expect(await screen.findByText('Descubra onde seu negócio está perdendo dinheiro.')).toBeTruthy();
    expect(screen.getByText('Você atingiu o limite de 30 produtos do Plano Grátis.')).toBeTruthy();
    expect(screen.getByText('Demonstração com dados fictícios')).toBeTruthy();
    expect(screen.getByText('Assinaturas indisponíveis nesta versão')).toBeTruthy();
    expect(screen.queryByText('Assinar o Pro IA')).toBeNull();
    expect(screen.queryByText(/grátis$/)).toBeNull();
    expect(screen.queryByText('Em breve')).toBeNull();
    expect(screen.getAllByText('Assistente IA').length).toBeGreaterThan(0);
  });
});
