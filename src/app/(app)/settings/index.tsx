import { router } from 'expo-router';
import Constants from 'expo-constants';

import { Button, Chips, ListItem, Screen, Section, Text, confirm, useToast } from '@/components/ui';
import { fetchBusinessExport } from '@/features/reports/api';
import { businessExportToSheets } from '@/features/reports/export';
import { errorMessage } from '@/lib/errors';
import { fileStamp, shareBytes } from '@/lib/fileShare';
import { XLSX_MIME, buildXlsx } from '@/lib/xlsx';
import { BUSINESS_TYPES } from '@/features/schemas';
import { useAuth } from '@/providers/AuthProvider';
import { useBusiness } from '@/providers/BusinessProvider';
import { useTheme, type ThemePreference } from '@/theme/ThemeProvider';

const ROLE_LABELS = { owner: 'Dono', manager: 'Gerente', seller: 'Vendedor' } as const;

export default function Settings() {
  const { user, signOut } = useAuth();
  const { business, role, memberships, selectBusiness, isManager } = useBusiness();
  const { preference, setPreference } = useTheme();
  const toast = useToast();

  const exportData = async () => {
    if (!business) return;
    try {
      toast.show('Preparando sua planilha...', 'info');
      const data = await fetchBusinessExport(business.id);
      await shareBytes(`gestao-facil-dados-${fileStamp()}.xlsx`, buildXlsx(businessExportToSheets(data)), XLSX_MIME);
    } catch (e) {
      toast.show(errorMessage(e), 'error');
    }
  };

  return (
    <Screen>
      <Section title="Negócio">
        {isManager ? (
          <ListItem
            icon="storefront"
            title={business?.name ?? ''}
            subtitle={BUSINESS_TYPES.find((t) => t.value === business?.business_type)?.label ?? 'Dados do negócio'}
            chevron
            onPress={() => router.push('/settings/business')}
          />
        ) : (
          <ListItem icon="storefront" title={business?.name ?? ''} subtitle={role ? `Seu acesso: ${ROLE_LABELS[role]}` : undefined} />
        )}
        {memberships.length > 1 ? (
          <>
            <Text variant="label">Trocar de negócio</Text>
            <Chips
              options={memberships.map((m) => ({ value: m.business_id, label: m.businesses.name }))}
              value={business?.id ?? null}
              onChange={selectBusiness}
            />
          </>
        ) : null}
      </Section>

      <Section title="Conta">
        <ListItem icon="person" title="Meu perfil" subtitle={user?.email ?? ''} chevron onPress={() => router.push('/settings/profile')} />
      </Section>

      <Section title="Aparência">
        <Chips<ThemePreference>
          options={[
            { value: 'system', label: 'Automático' },
            { value: 'light', label: 'Claro' },
            { value: 'dark', label: 'Escuro' },
          ]}
          value={preference}
          onChange={setPreference}
        />
      </Section>

      <Section title="Privacidade">
        {isManager ? (
          <ListItem
            icon="download"
            title="Exportar meus dados (Excel)"
            subtitle="Produtos, clientes, vendas, fiados e financeiro — disponível em todos os planos"
            chevron
            onPress={exportData}
          />
        ) : null}
        <ListItem icon="document-text" title="Termos de Uso" chevron onPress={() => router.push('/terms')} />
        <ListItem icon="shield-checkmark" title="Política de Privacidade" chevron onPress={() => router.push('/privacy')} />
        <ListItem
          icon="trash"
          iconTone="danger"
          title="Excluir minha conta"
          subtitle="Apaga definitivamente sua conta e seus dados"
          chevron
          onPress={() => router.push('/settings/delete-account')}
        />
      </Section>

      <Button
        title="Sair da conta"
        icon="log-out"
        variant="outline"
        onPress={async () => {
          if (await confirm('Sair', 'Deseja sair da sua conta neste aparelho?', 'Sair')) await signOut();
        }}
      />
      <Text variant="caption" tone="muted" center>
        Gestão Fácil IA · versão {Constants.expoConfig?.version ?? '1.0.0'}
      </Text>
    </Screen>
  );
}
