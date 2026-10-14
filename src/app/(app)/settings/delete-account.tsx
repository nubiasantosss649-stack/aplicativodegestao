import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, View } from 'react-native';

import { Button, Card, Screen, Text, TextField, confirm, useToast } from '@/components/ui';
import { deleteAccount } from '@/features/account/api';
import { toAppError } from '@/lib/errors';
import { managementUrl } from '@/lib/purchases';
import { useAuth } from '@/providers/AuthProvider';
import { useBusiness } from '@/providers/BusinessProvider';
import { spacing } from '@/theme/colors';
import { useTheme } from '@/theme/ThemeProvider';

/** Exclusão de conta dentro do app (exigência das lojas e da LGPD). */
export default function DeleteAccount() {
  const { signOut } = useAuth();
  const { memberships, isManager } = useBusiness();
  const { colors } = useTheme();
  const toast = useToast();
  const [phrase, setPhrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [subscriptionWarning, setSubscriptionWarning] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const owned = memberships.filter((m) => m.role === 'owner').map((m) => m.businesses.name);

  const submit = async () => {
    if (!(await confirm('Excluir conta definitivamente', 'Esta ação não pode ser desfeita. Deseja continuar?', 'Excluir', true))) return;
    try {
      setBusy(true);
      await deleteAccount(phrase, acknowledged);
      toast.show('Sua conta e seus dados foram excluídos.');
      await signOut();
    } catch (e) {
      const err = toAppError(e);
      if (err.code === 'active_subscription') setSubscriptionWarning(err.message);
      else toast.show(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Card style={{ gap: spacing.sm, borderColor: colors.danger, borderWidth: 1 }}>
        <Text variant="subtitle" tone="danger">O que será excluído</Text>
        <Text>• Seu login, perfil e preferências.</Text>
        {owned.length > 0 ? (
          <Text>
            • {owned.length === 1 ? 'O negócio' : 'Os negócios'} {owned.join(', ')} e todos os dados: produtos, estoque, clientes,
            vendas, fiados, financeiro, orçamentos, recibos e fotos.
          </Text>
        ) : null}
        <Text>• Seu acesso a negócios de outras pessoas (os dados deles não são apagados).</Text>
        <Text tone="muted" variant="caption">
          A exclusão é imediata e definitiva. Cópias de segurança do provedor são eliminadas automaticamente no ciclo de retenção.
        </Text>
      </Card>

      {isManager ? (
        <Card style={{ gap: spacing.sm }}>
          <Text bold>Quer guardar uma cópia?</Text>
          <Text tone="muted">Exporte todos os seus dados em Excel antes de excluir.</Text>
          <Button title="Exportar meus dados" icon="download" variant="secondary" size="md" onPress={() => router.push('/settings')} />
        </Card>
      ) : null}

      {subscriptionWarning ? (
        <Card style={{ gap: spacing.sm, borderColor: colors.warning, borderWidth: 1 }}>
          <Text tone="warning" bold>{subscriptionWarning}</Text>
          <Button title="Cancelar assinatura na loja" icon="open-outline" variant="outline" size="md" onPress={async () => Linking.openURL(await managementUrl())} />
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: acknowledged }}
            onPress={() => setAcknowledged((v) => !v)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}
          >
            <Ionicons name={acknowledged ? 'checkbox' : 'square-outline'} size={24} color={colors.primary} />
            <Text style={{ flex: 1 }}>Estou ciente de que preciso cancelar a assinatura na loja.</Text>
          </Pressable>
        </Card>
      ) : null}

      <TextField
        label='Para confirmar, digite "EXCLUIR"'
        value={phrase}
        onChangeText={setPhrase}
        autoCapitalize="characters"
        autoCorrect={false}
      />
      <View style={{ gap: spacing.sm }}>
        <Button
          title="Excluir minha conta"
          icon="trash"
          variant="danger"
          loading={busy}
          disabled={phrase.trim().toUpperCase() !== 'EXCLUIR' || (!!subscriptionWarning && !acknowledged)}
          onPress={submit}
        />
        <Button title="Voltar" variant="ghost" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
