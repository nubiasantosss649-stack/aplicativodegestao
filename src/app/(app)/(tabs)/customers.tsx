import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';

import { Badge, Button, Chips, EmptyState, ErrorState, ListItem, LoadingState, SearchBar, Text } from '@/components/ui';
import { useCustomerBalances } from '@/features/customers/api';
import { formatDate } from '@/lib/dates';
import { formatPhone, onlyDigits } from '@/lib/documents';
import { formatBRL } from '@/lib/money';
import { useCurrentBusiness } from '@/providers/BusinessProvider';
import { spacing } from '@/theme/colors';
import { useTheme } from '@/theme/ThemeProvider';

type Sort = 'name' | 'ranking' | 'debt';

export default function Customers() {
  const business = useCurrentBusiness();
  const { colors } = useTheme();
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<Sort>('name');
  const { data, isPending, error, refetch, isRefetching } = useCustomerBalances(business.id);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const digits = onlyDigits(term);
    let list = (data ?? []).filter(
      (c) => !term || c.name.toLowerCase().includes(term) || (digits.length >= 3 && (c.phone ?? '').includes(digits)),
    );
    if (sort === 'debt') list = list.filter((c) => c.balance_cents > 0).sort((a, b) => b.balance_cents - a.balance_cents);
    else if (sort === 'ranking') list = [...list].sort((a, b) => b.total_spent_cents - a.total_spent_cents);
    else list = [...list].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    return list;
  }, [data, search, sort]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ padding: spacing.lg, gap: spacing.md, maxWidth: 760, width: '100%', alignSelf: 'center' }}>
        <SearchBar value={search} onChangeText={setSearch} placeholder="Nome ou telefone" />
        <Chips
          options={[
            { value: 'name', label: 'A–Z' },
            { value: 'ranking', label: 'Ranking de compras' },
            { value: 'debt', label: 'Devendo' },
          ]}
          value={sort}
          onChange={setSort}
        />
      </View>
      {isPending ? (
        <LoadingState />
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(c) => c.customer_id}
          refreshing={isRefetching}
          onRefresh={refetch}
          contentContainerStyle={{ padding: spacing.lg, paddingTop: 0, gap: spacing.sm, maxWidth: 760, width: '100%', alignSelf: 'center', flexGrow: 1 }}
          ListEmptyComponent={
            search || sort === 'debt' ? (
              <EmptyState icon="search" title="Nenhum cliente encontrado" message={sort === 'debt' ? 'Ninguém está devendo. 🎉' : 'Tente outra busca.'} />
            ) : (
              <EmptyState
                icon="people-outline"
                title="Cadastre seus clientes"
                message="Com clientes cadastrados você pode vender fiado, ver o histórico de compras e enviar cobranças."
                actionLabel="Cadastrar cliente"
                onAction={() => router.push('/customers/new')}
              />
            )
          }
          renderItem={({ item: c, index }) => (
            <ListItem
              icon={sort === 'ranking' ? 'trophy' : 'person'}
              iconTone={c.overdue_cents > 0 ? 'danger' : c.balance_cents > 0 ? 'warning' : 'primary'}
              title={sort === 'ranking' ? `${index + 1}. ${c.name}` : c.name}
              subtitle={
                sort === 'ranking'
                  ? `${c.purchases_count} compras · total ${formatBRL(c.total_spent_cents)}`
                  : `${c.phone ? formatPhone(c.phone) : 'Sem telefone'}${c.last_purchase_at ? ` · última compra ${formatDate(c.last_purchase_at)}` : ''}`
              }
              right={
                c.balance_cents > 0 ? (
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Text bold tone={c.overdue_cents > 0 ? 'danger' : 'warning'}>{formatBRL(c.balance_cents)}</Text>
                    {c.overdue_cents > 0 ? <Badge label="Atrasado" tone="danger" /> : null}
                  </View>
                ) : null
              }
              chevron
              onPress={() => router.push(`/customers/${c.customer_id}`)}
            />
          )}
        />
      )}
      <View style={{ padding: spacing.lg, paddingTop: 0 }}>
        <Button title="Novo cliente" icon="person-add" onPress={() => router.push('/customers/new')} />
      </View>
    </View>
  );
}
