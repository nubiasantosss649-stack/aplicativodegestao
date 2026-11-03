import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { ProductPhoto } from '@/components/ProductPhoto';
import { Badge, Button, Card, ErrorState, KeyValue, ListItem, LoadingState, Row, Screen, Section, Text, confirm, useToast } from '@/components/ui';
import { uploadProductPhoto, useProduct, useStockMovements, useUpdateProduct } from '@/features/products/api';
import { formatDateTime } from '@/lib/dates';
import { handlePlanLimitError } from '@/features/subscription/limits';
import { errorMessage } from '@/lib/errors';
import { formatBRL, formatPercent, formatQuantity, marginPercent } from '@/lib/money';
import { useCurrentBusiness } from '@/providers/BusinessProvider';
import { spacing } from '@/theme/colors';
import type { StockMovementType } from '@/types/database';

const MOVEMENT_LABELS: Record<StockMovementType, string> = {
  initial: 'Estoque inicial',
  purchase: 'Entrada de mercadoria',
  adjustment: 'Ajuste',
  sale: 'Venda',
  sale_cancel: 'Cancelamento de venda',
};

export default function ProductDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const business = useCurrentBusiness();
  const toast = useToast();
  const { data: p, isPending, error, refetch } = useProduct(id);
  const movements = useStockMovements(id);
  const update = useUpdateProduct(business.id, id);
  const [uploading, setUploading] = useState(false);

  if (isPending) return <LoadingState />;
  if (error || !p) return <ErrorState error={error} onRetry={refetch} />;

  const low = p.track_stock && Number(p.stock_qty) <= Number(p.min_stock);
  const margin = marginPercent(p.cost_cents, p.price_cents);

  const pickPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return toast.show('Permita o acesso às fotos para adicionar a imagem.', 'error');
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.6,
    });
    const asset = result.canceled ? null : result.assets[0];
    if (!asset) return;
    try {
      setUploading(true);
      const path = await uploadProductPhoto(business.id, p.id, asset.uri);
      await update.mutateAsync({ photo_path: path });
      toast.show('Foto atualizada!');
    } catch (e) {
      toast.show(errorMessage(e), 'error');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Screen refreshing={movements.isRefetching} onRefresh={() => { refetch(); movements.refetch(); }}>
      <Row>
        <ProductPhoto path={p.photo_path} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text variant="title">{p.name}</Text>
          <Text variant="hero" tone="primary" style={{ fontSize: 26 }}>{formatBRL(p.price_cents)}</Text>
          <Row gap={6} wrap>
            {!p.active ? <Badge label="Inativo" tone="neutral" /> : null}
            {low ? <Badge label="Estoque baixo" tone="danger" /> : null}
          </Row>
        </View>
      </Row>

      <Card>
        {p.track_stock ? (
          <>
            <KeyValue label="Em estoque" value={formatQuantity(p.stock_qty, p.unit)} tone={low ? 'danger' : 'success'} />
            <KeyValue label="Estoque mínimo" value={formatQuantity(p.min_stock, p.unit)} />
          </>
        ) : (
          <KeyValue label="Estoque" value="Não controlado" />
        )}
        {business.isManager ? (
          <>
            <KeyValue label="Custo" value={formatBRL(p.cost_cents)} />
            <KeyValue label="Margem" value={formatPercent(margin)} tone={margin != null && margin < 0 ? 'danger' : 'success'} />
          </>
        ) : null}
        {p.barcode ? <KeyValue label="Código de barras" value={p.barcode} /> : null}
        {p.internal_code ? <KeyValue label="Código interno" value={p.internal_code} /> : null}
      </Card>
      {p.description ? <Text tone="muted">{p.description}</Text> : null}

      {business.isManager ? (
        <View style={{ gap: spacing.sm }}>
          {p.track_stock ? (
            <Button title="Movimentar estoque" icon="swap-vertical" onPress={() => router.push(`/products/${p.id}/stock`)} />
          ) : null}
          <Row>
            <Button title="Editar" icon="create" variant="secondary" style={{ flex: 1 }} onPress={() => router.push(`/products/${p.id}/edit`)} />
            <Button title="Foto" icon="camera" variant="secondary" style={{ flex: 1 }} loading={uploading} onPress={pickPhoto} />
          </Row>
          <Button
            title={p.active ? 'Desativar produto' : 'Reativar produto'}
            variant="ghost"
            icon={p.active ? 'eye-off' : 'eye'}
            onPress={async () => {
              if (p.active && !(await confirm('Desativar produto', 'O produto deixa de aparecer nas vendas. O histórico é mantido.', 'Desativar', true))) return;
              try {
                await update.mutateAsync({ active: !p.active });
                toast.show(p.active ? 'Produto desativado' : 'Produto reativado');
              } catch (e) {
                if (handlePlanLimitError(e, toast.show)) return;
                toast.show(errorMessage(e), 'error');
              }
            }}
          />
        </View>
      ) : null}

      {p.track_stock ? (
        <Section title="Histórico de movimentações">
          {movements.isPending ? (
            <LoadingState />
          ) : (movements.data ?? []).length === 0 ? (
            <Text tone="muted">Nenhuma movimentação ainda.</Text>
          ) : (
            (movements.data ?? []).map((m) => (
              <ListItem
                key={m.id}
                icon={Number(m.quantity) > 0 ? 'arrow-down-circle' : 'arrow-up-circle'}
                iconTone={Number(m.quantity) > 0 ? 'success' : 'warning'}
                title={`${MOVEMENT_LABELS[m.type]} · ${Number(m.quantity) > 0 ? '+' : ''}${formatQuantity(m.quantity, p.unit)}`}
                subtitle={`${formatDateTime(m.created_at)} · saldo ${formatQuantity(m.balance_after, p.unit)}${m.reason ? ` · ${m.reason}` : ''}`}
                onPress={m.sale_id ? () => router.push(`/sales/${m.sale_id}`) : undefined}
              />
            ))
          )}
        </Section>
      ) : null}
    </Screen>
  );
}
