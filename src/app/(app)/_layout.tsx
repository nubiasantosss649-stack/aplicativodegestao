import { Stack } from 'expo-router';

import { CartProvider } from '@/providers/CartProvider';
import { useTheme } from '@/theme/ThemeProvider';

export default function AppLayout() {
  const { colors } = useTheme();
  return (
    <CartProvider>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.primary,
          headerTitleStyle: { color: colors.text, fontWeight: '700' },
          headerShadowVisible: false,
          headerBackButtonDisplayMode: 'minimal',
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="products/new" options={{ title: 'Novo produto' }} />
        <Stack.Screen name="products/[id]/index" options={{ title: 'Produto' }} />
        <Stack.Screen name="products/[id]/edit" options={{ title: 'Editar produto' }} />
        <Stack.Screen name="products/[id]/stock" options={{ title: 'Movimentar estoque' }} />
        <Stack.Screen name="stock" options={{ title: 'Estoque' }} />
        <Stack.Screen name="sales/checkout" options={{ title: 'Pagamento' }} />
        <Stack.Screen name="sales/index" options={{ title: 'Histórico de vendas' }} />
        <Stack.Screen name="sales/[id]" options={{ title: 'Venda' }} />
        <Stack.Screen name="customers/new" options={{ title: 'Novo cliente' }} />
        <Stack.Screen name="customers/[id]/index" options={{ title: 'Cliente' }} />
        <Stack.Screen name="customers/[id]/edit" options={{ title: 'Editar cliente' }} />
        <Stack.Screen name="receivables/index" options={{ title: 'Fiados' }} />
        <Stack.Screen name="receivables/[customerId]" options={{ title: 'Cobrança' }} />
        <Stack.Screen name="finance/index" options={{ title: 'Financeiro' }} />
        <Stack.Screen name="finance/entries" options={{ title: 'Lançamentos' }} />
        <Stack.Screen name="finance/new" options={{ title: 'Novo lançamento', presentation: 'modal' }} />
        <Stack.Screen name="finance/payables" options={{ title: 'Contas a pagar' }} />
        <Stack.Screen name="settings/index" options={{ title: 'Configurações' }} />
        <Stack.Screen name="settings/business" options={{ title: 'Dados do negócio' }} />
        <Stack.Screen name="settings/profile" options={{ title: 'Meu perfil' }} />
        <Stack.Screen name="help" options={{ title: 'Ajuda e suporte' }} />
        <Stack.Screen name="subscription/index" options={{ title: 'Assinatura Pro', presentation: 'modal' }} />
        <Stack.Screen name="subscription/manage" options={{ title: 'Minha assinatura' }} />
      </Stack>
    </CartProvider>
  );
}
