import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useLayoutEffect } from 'react';
import { View } from 'react-native';

import { ManagerOnly } from '@/components/ManagerOnly';
import { PeriodFilter, usePeriod } from '@/components/PeriodFilter';
import { Badge, Button, Card, EmptyState, ErrorState, KeyValue, ListItem, LoadingState, Screen, Text, confirm, useToast } from '@/components/ui';
import { useCancelEntry, useFinancialEntries } from '@/features/finance/api';
import { formatDate } from '@/lib/dates';
import { errorMessage } from '@/lib/errors';
import { formatBRL } from '@/lib/money';
import { useCurrentBusiness } from '@/providers/BusinessProvider';

function Entries() {
  const { kind: kindParam } = useLocalSearchParams<{ kind?: string }>();
  const kind = kindParam === 'income' ? 'income' : 'expense';
  const navigation = useNavigation();
  const business = useCurrentBusiness();
  const toast = useToast();
  const [period, setPeriod] = usePeriod('month');
  const { data, isPending, error, refetch, isRefetching } = useFinancialEntries(business.id, { kind, range: period.range });
  const cancel = useCancelEntry(business.id);

  useLayoutEffect(() => {
    navigation.setOptions({ title: kind === 'income' ? 'Receitas' : 'Despesas' });
  }, [navigation, kind]);

  const total = (data ?? []).reduce((a, e) => a + e.amount_cents, 0);

  return (
    <Screen
      refreshing={isRefetching}
      onRefresh={refetch}
      footer={
        <Button
          title={kind === 'income' ? 'Nova receita' : 'Nova despesa'}
          icon="add"
          onPress={() => router.push({ pathname: '/finance/new', params: { kind } })}
        />
      }
    >
      <PeriodFilter value={period} onChange={setPeriod} />
      {isPending ? (
        <LoadingState />
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : data.length === 0 ? (
        <EmptyState
          icon={kind === 'income' ? 'trending-up' : 'trending-down'}
          title={kind === 'income' ? 'Nenhuma receita avulsa' : 'Nenhuma despesa no período'}
          message={kind === 'income' ? 'Receitas de vendas entram automaticamente. Aqui ficam receitas extras (serviços avulsos, aportes).' : 'Registre aluguel, luz, fornecedores e outras despesas para calcular o lucro.'}
        />
      ) : (
        <>
          <Card>
            <KeyValue label={`Total (${data.length})`} value={formatBRL(total)} tone={kind === 'income' ? 'success' : 'danger'} />
          </Card>
          {data.map((e) => (
            <ListItem
              key={e.id}
              icon={kind === 'income' ? 'arrow-down-circle' : 'arrow-up-circle'}
              iconTone={kind === 'income' ? 'success' : 'danger'}
              title={e.description}
              subtitle={`${formatDate(e.competence_date)}${e.finance_categories ? ` · ${e.finance_categories.name}` : ''}`}
              right={
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Text bold>{formatBRL(e.amount_cents)}</Text>
                  <Badge label={e.status === 'paid' ? 'Pago' : 'Pendente'} tone={e.status === 'paid' ? 'success' : 'warning'} />
                </View>
              }
              onPress={async () => {
                if (!(await confirm('Excluir lançamento', `Cancelar "${e.description}"? Ele deixará de contar nos relatórios.`, 'Cancelar lançamento', true))) return;
                try {
                  await cancel.mutateAsync(e.id);
                  toast.show('Lançamento cancelado.');
                } catch (err) {
                  toast.show(errorMessage(err), 'error');
                }
              }}
            />
          ))}
          <Text variant="caption" tone="muted" center>Toque em um lançamento para cancelá-lo.</Text>
        </>
      )}
    </Screen>
  );
}

export default function EntriesScreen() {
  return (
    <ManagerOnly>
      <Entries />
    </ManagerOnly>
  );
}
