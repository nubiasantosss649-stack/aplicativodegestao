import { zodResolver } from '@hookform/resolvers/zod';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Switch, View } from 'react-native';

import { Button, Card, Chips, ErrorState, FormField, KeyValue, LoadingState, Screen, Text, useToast } from '@/components/ui';
import { useProduct, useRegisterStockMovement } from '@/features/products/api';
import { stockMovementSchema, type StockMovementForm } from '@/features/schemas';
import { errorMessage } from '@/lib/errors';
import { newIdempotencyKey } from '@/lib/id';
import { formatQuantity, maskMoneyDigits, parseBRL, parseQuantity } from '@/lib/money';
import { useCurrentBusiness } from '@/providers/BusinessProvider';
import { spacing } from '@/theme/colors';
import { useTheme } from '@/theme/ThemeProvider';

export default function StockMovementScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const business = useCurrentBusiness();
  const { colors } = useTheme();
  const toast = useToast();
  const { data: p, isPending, error, refetch } = useProduct(id);
  const register = useRegisterStockMovement(business.id, id);
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);
  const { control, handleSubmit, formState } = useForm<StockMovementForm>({
    resolver: zodResolver(stockMovementSchema),
    defaultValues: { type: 'purchase', direction: 'in', quantity: '', unitCost: '', reason: '', updateCost: true },
  });
  const [type, direction, quantity] = useWatch({ control, name: ['type', 'direction', 'quantity'] });

  if (isPending) return <LoadingState />;
  if (error || !p) return <ErrorState error={error} onRetry={refetch} />;

  const qty = parseQuantity(quantity) ?? 0;
  const delta = type === 'purchase' || direction === 'in' ? qty : -qty;
  const after = Number(p.stock_qty) + delta;

  return (
    <Screen>
      <Card>
        <Text variant="subtitle">{p.name}</Text>
        <KeyValue label="Estoque atual" value={formatQuantity(p.stock_qty, p.unit)} />
        <KeyValue label="Após a movimentação" value={formatQuantity(after, p.unit)} tone={after < 0 ? 'danger' : 'primary'} />
      </Card>
      <Controller
        control={control}
        name="type"
        render={({ field }) => (
          <Chips
            options={[
              { value: 'purchase', label: 'Entrada de mercadoria' },
              { value: 'adjustment', label: 'Ajuste' },
            ]}
            value={field.value}
            onChange={field.onChange}
          />
        )}
      />
      {type === 'adjustment' ? (
        <Controller
          control={control}
          name="direction"
          render={({ field }) => (
            <Chips
              options={[
                { value: 'in', label: 'Adicionar (+)' },
                { value: 'out', label: 'Retirar (−)' },
              ]}
              value={field.value}
              onChange={field.onChange}
            />
          )}
        />
      ) : null}
      <FormField control={control} name="quantity" label={`Quantidade (${p.unit})`} keyboardType="decimal-pad" placeholder="0" />
      {type === 'purchase' ? (
        <>
          <FormField control={control} name="unitCost" label="Custo unitário desta compra (opcional)" mask="money" placeholder={maskMoneyDigits(String(p.cost_cents))} />
          <Controller
            control={control}
            name="updateCost"
            render={({ field }) => (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ flex: 1 }}>Atualizar o custo do produto com este valor</Text>
                <Switch value={field.value} onValueChange={field.onChange} trackColor={{ true: colors.primary }} />
              </View>
            )}
          />
        </>
      ) : null}
      <FormField
        control={control}
        name="reason"
        label={type === 'adjustment' ? 'Justificativa (obrigatória)' : 'Observação (opcional)'}
        placeholder={type === 'adjustment' ? 'Ex.: produto vencido, contagem de inventário' : 'Ex.: fornecedor, nota'}
        multiline
      />
      {after < 0 && !business.allow_negative_stock ? (
        <Text tone="danger">O estoque não pode ficar negativo.</Text>
      ) : null}
      <View style={{ gap: spacing.sm }}>
        <Button
          title="Registrar movimentação"
          icon="checkmark"
          loading={formState.isSubmitting}
          onPress={handleSubmit(async (v) => {
            try {
              const unitCost = parseBRL(v.unitCost);
              await register.mutateAsync({
                type: v.type,
                quantity: delta,
                reason: v.reason.trim() || null,
                unitCostCents: v.type === 'purchase' && unitCost ? unitCost : null,
                updateCost: v.type === 'purchase' && !!unitCost && v.updateCost,
                idempotencyKey,
              });
              toast.show('Estoque atualizado!');
              router.back();
            } catch (e) {
              setIdempotencyKey(newIdempotencyKey());
              toast.show(errorMessage(e), 'error');
            }
          })}
        />
      </View>
    </Screen>
  );
}
