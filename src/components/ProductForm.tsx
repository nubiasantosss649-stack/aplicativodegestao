import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Pressable, Switch, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { BarcodeScanner } from '@/components/BarcodeScanner';
import { Button, Card, Chips, FormField, KeyValue, Text, TextField, useToast } from '@/components/ui';
import { useCreateCategory, useProductCategories } from '@/features/products/api';
import { PRODUCT_UNITS, productSchema, type ProductForm as ProductFormValues } from '@/features/schemas';
import { errorMessage } from '@/lib/errors';
import { formatBRL, formatPercent, marginPercent, maskMoneyDigits, parseBRL, suggestPrice } from '@/lib/money';
import { spacing } from '@/theme/colors';
import { useTheme } from '@/theme/ThemeProvider';

interface Props {
  businessId: string;
  defaultValues: ProductFormValues;
  isEdit?: boolean;
  submitLabel: string;
  onSubmit: (values: ProductFormValues) => Promise<void>;
}

export function ProductForm({ businessId, defaultValues, isEdit, submitLabel, onSubmit }: Props) {
  const { colors } = useTheme();
  const toast = useToast();
  const categories = useProductCategories(businessId);
  const createCategory = useCreateCategory(businessId);
  const [newCategory, setNewCategory] = useState('');
  const [scanning, setScanning] = useState(false);
  const [targetMargin, setTargetMargin] = useState('40');
  const { control, handleSubmit, setValue, formState } = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues,
  });
  const [cost, price, trackStock] = useWatch({ control, name: ['cost', 'price', 'trackStock'] });
  const costCents = parseBRL(cost) ?? 0;
  const priceCents = parseBRL(price) ?? 0;
  const margin = marginPercent(costCents, priceCents);
  const suggestion = suggestPrice(costCents, Number(targetMargin.replace(',', '.')) || 0);

  return (
    <View style={{ gap: spacing.lg }}>
      <FormField control={control} name="name" label="Nome do produto ou serviço" placeholder="Ex.: Arroz 5kg" />

      <View style={{ gap: spacing.sm }}>
        <Text variant="label">Categoria</Text>
        <Controller
          control={control}
          name="categoryId"
          render={({ field }) => (
            <Chips
              options={[{ value: '', label: 'Sem categoria' }, ...(categories.data ?? []).map((c) => ({ value: c.id, label: c.name }))]}
              value={field.value ?? ''}
              onChange={(v) => field.onChange(v || null)}
            />
          )}
        />
        <TextField
          placeholder="Nova categoria"
          value={newCategory}
          onChangeText={setNewCategory}
          right={
            newCategory.trim() ? (
              <Pressable
                accessibilityLabel="Adicionar categoria"
                onPress={async () => {
                  try {
                    const c = await createCategory.mutateAsync(newCategory);
                    setValue('categoryId', c.id);
                    setNewCategory('');
                  } catch (e) {
                    toast.show(errorMessage(e), 'error');
                  }
                }}
              >
                <Ionicons name="add-circle" size={28} color={colors.primary} />
              </Pressable>
            ) : null
          }
        />
      </View>

      <Card style={{ gap: spacing.md }}>
        <Text variant="subtitle">Preços</Text>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <FormField control={control} name="cost" label="Custo" mask="money" placeholder="0,00" />
          </View>
          <View style={{ flex: 1 }}>
            <FormField control={control} name="price" label="Preço de venda" mask="money" placeholder="0,00" />
          </View>
        </View>
        <KeyValue
          label="Margem de lucro"
          value={formatPercent(margin)}
          tone={margin == null ? 'muted' : margin >= 0 ? 'success' : 'danger'}
        />
        {margin != null && margin < 0 ? <Text tone="danger" variant="caption">Atenção: o preço está abaixo do custo (prejuízo).</Text> : null}
        {costCents > 0 ? (
          <View style={{ gap: spacing.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm }}>
              <View style={{ width: 120 }}>
                <TextField label="Margem desejada" value={targetMargin} onChangeText={(t) => setTargetMargin(t.replace(/[^\d,]/g, '').slice(0, 5))} keyboardType="decimal-pad" right={<Text tone="muted">%</Text>} />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  title={suggestion ? `Usar ${formatBRL(suggestion)}` : 'Margem inválida'}
                  size="md"
                  variant="secondary"
                  disabled={!suggestion}
                  onPress={() => suggestion && setValue('price', maskMoneyDigits(String(suggestion)), { shouldValidate: true })}
                />
              </View>
            </View>
            <Text variant="caption" tone="muted">Sugestão de preço calculada sobre o custo para atingir a margem desejada.</Text>
          </View>
        ) : null}
      </Card>

      <Card style={{ gap: spacing.md }}>
        <Text variant="subtitle">Códigos</Text>
        <FormField
          control={control}
          name="barcode"
          label="Código de barras"
          keyboardType="number-pad"
          right={
            <Pressable accessibilityLabel="Ler código de barras" onPress={() => setScanning(true)} hitSlop={8}>
              <Ionicons name="barcode-outline" size={26} color={colors.primary} />
            </Pressable>
          }
        />
        <FormField control={control} name="internalCode" label="Código interno (opcional)" autoCapitalize="characters" />
      </Card>

      <Card style={{ gap: spacing.md }}>
        <Text variant="subtitle">Estoque</Text>
        <Controller
          control={control}
          name="trackStock"
          render={({ field }) => (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <Text>Controlar estoque</Text>
                <Text variant="caption" tone="muted">Desative para serviços</Text>
              </View>
              <Switch value={field.value} onValueChange={field.onChange} trackColor={{ true: colors.primary }} />
            </View>
          )}
        />
        <Controller
          control={control}
          name="unit"
          render={({ field }) => (
            <Chips options={PRODUCT_UNITS.map((u) => ({ value: u, label: u }))} value={field.value} onChange={field.onChange} />
          )}
        />
        {trackStock ? (
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            {!isEdit ? (
              <View style={{ flex: 1 }}>
                <FormField control={control} name="initialStock" label="Estoque inicial" keyboardType="decimal-pad" placeholder="0" />
              </View>
            ) : null}
            <View style={{ flex: 1 }}>
              <FormField control={control} name="minStock" label="Estoque mínimo" keyboardType="decimal-pad" placeholder="0" hint="Alerta quando chegar aqui" />
            </View>
          </View>
        ) : null}
        {isEdit ? <Text variant="caption" tone="muted">Para alterar a quantidade em estoque use “Movimentar estoque”.</Text> : null}
      </Card>

      <FormField control={control} name="description" label="Descrição (opcional)" multiline maxLength={500} />

      <Button title={submitLabel} icon="save" onPress={handleSubmit(onSubmit)} loading={formState.isSubmitting} />

      <BarcodeScanner
        visible={scanning}
        onClose={() => setScanning(false)}
        onScanned={(code) => {
          setScanning(false);
          setValue('barcode', code, { shouldValidate: true });
        }}
      />
    </View>
  );
}
