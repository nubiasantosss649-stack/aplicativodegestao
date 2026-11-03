import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { PurchasesPackage } from 'react-native-purchases';

import { Badge, BarChart, Button, Card, KeyValue, LoadingState, Screen, Section, Text, useToast } from '@/components/ui';
import { syncSubscription, useEntitlements, useInvalidateEntitlements } from '@/features/subscription/api';
import { PRO_BENEFITS, describeIntroOffer, type Entitlements } from '@/features/subscription/plans';
import { env } from '@/lib/env';
import { errorMessage } from '@/lib/errors';
import { formatBRL } from '@/lib/money';
import {
  getCurrentOffering,
  introOfferOf,
  isBillingAvailable,
  isEligibleForIntro,
  monthlyPackage,
  purchase,
  restorePurchases,
} from '@/lib/purchases';
import { useCurrentBusiness } from '@/providers/BusinessProvider';
import { radius, spacing } from '@/theme/colors';
import { useTheme } from '@/theme/ThemeProvider';

const REASONS: Record<string, string> = {
  products: 'Você atingiu o limite de 30 produtos do Plano Grátis.',
  sales: 'Você atingiu o limite de 50 vendas deste mês no Plano Grátis.',
  charge: 'Mensagens de cobrança personalizadas fazem parte do Pro.',
};

// Dados FICTÍCIOS usados apenas como demonstração visual dos relatórios Pro
const DEMO_DAYS = [
  { label: 'Seg', value: 41000 },
  { label: 'Ter', value: 38500 },
  { label: 'Qua', value: 52300 },
  { label: 'Qui', value: 47800 },
  { label: 'Sex', value: 69900 },
  { label: 'Sáb', value: 88400 },
  { label: 'Dom', value: 30200 },
];

/** Aguarda o servidor confirmar o Pro (webhook ou sincronização). */
async function confirmWithServer(refetch: () => Promise<{ data?: Entitlements }>): Promise<boolean> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const result = await syncSubscription();
      if (result?.has_pro) return true;
    } catch {
      // a função pode não estar configurada; o webhook ainda pode confirmar
    }
    const { data } = await refetch();
    if (data?.plan === 'pro') return true;
    await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
  }
  return false;
}

export default function Paywall() {
  const business = useCurrentBusiness();
  const { colors } = useTheme();
  const toast = useToast();
  const { reason } = useLocalSearchParams<{ reason?: string }>();
  const entitlements = useEntitlements(business.id);
  const invalidate = useInvalidateEntitlements();
  const [busy, setBusy] = useState<'buy' | 'restore' | null>(null);
  const [awaiting, setAwaiting] = useState(false);
  const billing = isBillingAvailable();

  const offering = useQuery({
    queryKey: ['rc-offering'],
    enabled: billing,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const current = await getCurrentOffering();
      const pkg = monthlyPackage(current);
      const eligible = pkg ? await isEligibleForIntro(pkg.product.identifier).catch(() => null) : null;
      return { pkg, eligible };
    },
  });

  const pkg: PurchasesPackage | null = offering.data?.pkg ?? null;
  const trial = offering.data?.eligible === false ? null : describeIntroOffer(introOfferOf(pkg));
  const isPro = entitlements.data?.plan === 'pro';
  const isOwner = entitlements.data?.is_owner ?? business.role === 'owner';

  const afterStoreSuccess = async () => {
    setAwaiting(true);
    const ok = await confirmWithServer(entitlements.refetch as () => Promise<{ data?: Entitlements }>);
    setAwaiting(false);
    invalidate();
    if (ok) {
      toast.show('Bem-vindo ao Pro IA! 🎉');
      router.replace('/subscription/manage');
    } else {
      toast.show('Compra recebida. Estamos aguardando a confirmação da loja — isso pode levar alguns minutos.', 'info');
    }
  };

  const buy = async () => {
    if (!pkg) return;
    try {
      setBusy('buy');
      const result = await purchase(pkg);
      if (result.outcome === 'cancelled') return;
      if (result.outcome === 'pending') {
        toast.show('Pagamento pendente na loja. O Pro será liberado quando for aprovado.', 'info');
        return;
      }
      await afterStoreSuccess();
    } catch (e) {
      toast.show(errorMessage(e), 'error');
    } finally {
      setBusy(null);
    }
  };

  const restore = async () => {
    try {
      setBusy('restore');
      const info = await restorePurchases();
      if (Object.keys(info.entitlements.active).length === 0) {
        toast.show('Nenhuma assinatura ativa encontrada nesta conta da loja.', 'info');
        return;
      }
      await afterStoreSuccess();
    } catch (e) {
      toast.show(errorMessage(e), 'error');
    } finally {
      setBusy(null);
    }
  };

  if (entitlements.isPending) return <LoadingState />;

  return (
    <Screen>
      <View style={[styles.hero, { backgroundColor: colors.primary }]}>
        <Badge label="PRO IA" tone="success" />
        <Text variant="title" tone="onPrimary">Descubra onde seu negócio está perdendo dinheiro.</Text>
        <Text tone="onPrimary" style={{ opacity: 0.9 }}>
          Tenha controle total das suas vendas e transforme seus números em decisões inteligentes.
        </Text>
      </View>

      {reason && REASONS[reason] ? (
        <Card style={{ borderColor: colors.warning, borderWidth: 1 }}>
          <Text tone="warning" bold>{REASONS[reason]}</Text>
          <Text variant="caption" tone="muted">Seus dados continuam salvos e acessíveis.</Text>
        </Card>
      ) : null}

      {isPro ? (
        <Card style={{ gap: spacing.sm }}>
          <Text variant="subtitle" tone="success">Seu negócio já é Pro ✓</Text>
          <Button title="Gerenciar assinatura" icon="settings" variant="secondary" onPress={() => router.replace('/subscription/manage')} />
        </Card>
      ) : null}

      <Section title="Exemplo de relatório Pro">
        <Card style={{ gap: spacing.md }}>
          <Badge label="Demonstração com dados fictícios" tone="warning" />
          <Text variant="label">Vendas da semana (exemplo)</Text>
          <BarChart data={DEMO_DAYS} formatValue={formatBRL} height={120} />
          <KeyValue label="Faturamento (exemplo)" value={formatBRL(368100)} tone="primary" />
          <KeyValue label="Lucro estimado (exemplo)" value={formatBRL(97450)} tone="success" />
          <KeyValue label="Despesa que mais cresceu (exemplo)" value="Embalagens +32%" tone="danger" />
          <Text variant="caption" tone="muted">Os valores acima são ilustrativos. No Pro, os relatórios usam os dados reais do seu negócio.</Text>
        </Card>
      </Section>

      <Section title="O que você ganha">
        {PRO_BENEFITS.map((b) => (
          <View key={b.title} style={styles.benefit}>
            <View style={[styles.benefitIcon, { backgroundColor: colors.primarySoft }]}>
              <Ionicons name={b.icon as 'infinite'} size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center', flexWrap: 'wrap' }}>
                <Text bold>{b.title}</Text>
                {!b.available ? <Badge label="Em breve" tone="neutral" /> : null}
              </View>
              <Text variant="caption" tone="muted">{b.text}</Text>
            </View>
          </View>
        ))}
      </Section>

      <Section title="Compare os planos">
        <Card>
          <KeyValue label="Produtos" value="30  ·  Ilimitados no Pro" />
          <KeyValue label="Vendas por mês" value="50  ·  Ilimitadas no Pro" />
          <KeyValue label="Clientes e fiados" value="Ambos os planos" />
          <KeyValue label="Dashboard" value="Simplificado  ·  Completo" />
          <KeyValue label="Relatório financeiro" value="—  ·  Pro" />
          <KeyValue label="Cobrança no WhatsApp" value="—  ·  Pro" />
          <KeyValue label="Assistente IA" value="—  ·  200 perguntas/mês" />
          <KeyValue label="Relatórios e recomendações" value="—  ·  Pro" />
          <KeyValue label="Exportar relatórios PDF/Excel" value="—  ·  Pro" />
          <KeyValue label="Recibos e orçamentos" value="Ambos os planos" />
          <KeyValue label="Exportar todos os seus dados" value="Ambos os planos" />
        </Card>
      </Section>

      {!isPro ? (
        <Card style={{ gap: spacing.md }}>
          {!billing ? (
            <>
              <Text bold>Assinaturas indisponíveis nesta versão</Text>
              <Text tone="muted">
                A assinatura é feita pela Google Play ou App Store no aplicativo instalado no celular.
                {env.revenueCatAndroidKey || env.revenueCatIosKey ? '' : ' (Compras não configuradas neste ambiente.)'}
              </Text>
            </>
          ) : offering.isPending ? (
            <LoadingState message="Carregando preço da loja..." />
          ) : !pkg ? (
            <>
              <Text bold>Plano indisponível no momento</Text>
              <Text tone="muted">Não foi possível carregar o plano na loja. Verifique a conexão e tente novamente.</Text>
              <Button title="Tentar novamente" variant="outline" onPress={() => offering.refetch()} />
            </>
          ) : !isOwner ? (
            <Text tone="muted">Somente o dono do negócio pode assinar o Pro. Peça para ele assinar pelo aplicativo.</Text>
          ) : (
            <>
              <View style={{ alignItems: 'center', gap: 4 }}>
                {trial ? <Badge label={trial} tone="success" /> : null}
                <Text variant="hero" tone="primary">{pkg.product.priceString}</Text>
                <Text tone="muted">por mês{trial ? `, após ${trial.replace(' grátis', '')} de teste` : ''}</Text>
              </View>
              <Button
                title={trial ? `Começar ${trial}` : 'Assinar o Pro IA'}
                icon="diamond"
                variant="success"
                loading={busy === 'buy' || awaiting}
                disabled={busy != null || awaiting}
                onPress={buy}
              />
              {awaiting ? <Text variant="caption" tone="muted" center>Confirmando com a loja...</Text> : null}
            </>
          )}
          {billing ? (
            <Button title="Restaurar compras" variant="ghost" loading={busy === 'restore'} disabled={busy != null} onPress={restore} />
          ) : null}
          {env.appEnv !== 'production' ? (
            <Badge label={`Ambiente de testes (${env.appEnv}) — compras sandbox`} tone="warning" />
          ) : null}
        </Card>
      ) : null}

      <Text variant="caption" tone="muted" center>
        Assinatura mensal com renovação automática, cobrada pela {`Google Play / App Store`} na sua conta da loja.
        Cancele quando quiser nas configurações da loja, com pelo menos 24 horas de antecedência da renovação.
        Ao cancelar, o Pro continua até o fim do período pago e seus dados permanecem disponíveis para consulta e exportação.
      </Text>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: spacing.lg }}>
        <Text variant="caption" tone="primary" onPress={() => router.push('/terms')}>Termos de Uso</Text>
        <Text variant="caption" tone="primary" onPress={() => router.push('/privacy')}>Privacidade</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: radius.lg, padding: spacing.xl, gap: spacing.sm },
  benefit: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  benefitIcon: { width: 40, height: 40, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
});
