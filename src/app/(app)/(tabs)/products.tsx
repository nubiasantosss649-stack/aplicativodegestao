import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BarcodeScanner } from '@/components/BarcodeScanner';
import { Badge, Button, Chips, EmptyState, ErrorState, ListItem, LoadingState, SearchBar, Text } from '@/components/ui';
import { useProducts } from '@/features/products/api';
import { formatBRL, formatQuantity } from '@/lib/money';
import { useCurrentBusiness } from '@/providers/BusinessProvider';
import { spacing } from '@/theme/colors';
import { useTheme } from '@/theme/ThemeProvider';

export default function Products() {
  const business = useCurrentBusiness();
  const { colors } = useTheme();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'low' | 'inactive'>('all');
  const [scanning, setScanning] = useState(false);
  const { data, isPending, error, refetch, isRefetching } = useProducts(business.id, {
    search,
    lowStockOnly: filter === 'low',
    includeInactive: filter === 'inactive',
  });
  const rows = filter === 'inactive' ? (data ?? []).filter((p) => !p.active) : (data ?? []);

  return (
    <SafeAreaView edges={[]} style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ padding: spacing.lg, gap: spacing.md, maxWidth: 760, width: '100%', alignSelf: 'center' }}>
        <SearchBar value={search} onChangeText={setSearch} placeholder="Nome, código ou código de barras" onScan={() => setScanning(true)} />
        <Chips
          options={[
            { value: 'all', label: 'Ativos' },
            { value: 'low', label: 'Estoque baixo' },
            { value: 'inactive', label: 'Inativos' },
          ]}
          value={filter}
          onChange={setFilter}
        />
      </View>
      {isPending ? (
        <LoadingState />
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(p) => p.id}
          refreshing={isRefetching}
          onRefresh={refetch}
          contentContainerStyle={{ padding: spacing.lg, paddingTop: 0, gap: spacing.sm, maxWidth: 760, width: '100%', alignSelf: 'center', flexGrow: 1 }}
          ListEmptyComponent={
            search || filter !== 'all' ? (
              <EmptyState icon="search" title="Nenhum produto encontrado" message="Tente outra busca ou filtro." />
            ) : (
              <EmptyState
                icon="cube-outline"
                title="Cadastre seu primeiro produto"
                message="Com os produtos cadastrados você vende mais rápido e controla o estoque automaticamente."
                actionLabel={business.isManager ? 'Cadastrar produto' : undefined}
                onAction={() => router.push('/products/new')}
              />
            )
          }
          renderItem={({ item: p }) => {
            const low = p.track_stock && Number(p.stock_qty) <= Number(p.min_stock);
            return (
              <ListItem
                icon={p.track_stock ? 'cube' : 'construct'}
                iconTone={low ? 'danger' : 'primary'}
                title={p.name}
                subtitle={p.track_stock ? `Estoque: ${formatQuantity(p.stock_qty, p.unit)}` : 'Serviço / sem estoque'}
                right={
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Text bold>{formatBRL(p.price_cents)}</Text>
                    {low ? <Badge label="Baixo" tone="danger" /> : null}
                  </View>
                }
                chevron
                onPress={() => router.push(`/products/${p.id}`)}
              />
            );
          }}
        />
      )}
      {business.isManager ? (
        <View style={{ padding: spacing.lg, paddingTop: 0 }}>
          <Button title="Novo produto" icon="add" onPress={() => router.push('/products/new')} />
        </View>
      ) : null}
      <BarcodeScanner
        visible={scanning}
        onClose={() => setScanning(false)}
        onScanned={(code) => {
          setScanning(false);
          setSearch(code);
        }}
      />
    </SafeAreaView>
  );
}
