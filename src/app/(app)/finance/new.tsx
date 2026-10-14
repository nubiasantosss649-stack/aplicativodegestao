import { zodResolver } from '@hookform/resolvers/zod';
import { router, useLocalSearchParams } from 'expo-router';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Switch, View } from 'react-native';

import { ManagerOnly } from '@/components/ManagerOnly';
import { Button, Chips, FormField, Screen, Text, useToast } from '@/components/ui';
import { METHOD_OPTIONS, useCreateEntry, useFinanceCategories } from '@/features/finance/api';
import { financialEntrySchema, type FinancialEntryForm } from '@/features/schemas';
import { formatDate, parseBRDate, toISODate } from '@/lib/dates';
import { errorMessage } from '@/lib/errors';
import { parseBRL } from '@/lib/money';
import { useCurrentBusiness } from '@/providers/BusinessProvider';
import { spacing } from '@/theme/colors';
import { useTheme } from '@/theme/ThemeProvider';

function NewEntry() {
  const params = useLocalSearchParams<{ kind?: string; pending?: string }>();
  const business = useCurrentBusiness();
  const { colors } = useTheme();
  const toast = useToast();
  const create = useCreateEntry(business.id);
  const { control, handleSubmit, formState } = useForm<FinancialEntryForm>({
    resolver: zodResolver(financialEntrySchema),
    defaultValues: {
      kind: params.kind === 'income' ? 'income' : 'expense',
      description: '',
      amount: '',
      categoryId: null,
      competenceDate: formatDate(toISODate(new Date())),
      dueDate: '',
      paid: params.pending !== '1',
      method: 'pix',
      notes: '',
    },
  });
  const [kind, paid] = useWatch({ control, name: ['kind', 'paid'] });
  const categories = useFinanceCategories(business.id, kind);

  return (
    <Screen>
      <Controller
        control={control}
        name="kind"
        render={({ field }) => (
          <Chips
            options={[
              { value: 'expense', label: 'Despesa' },
              { value: 'income', label: 'Receita' },
            ]}
            value={field.value}
            onChange={field.onChange}
          />
        )}
      />
      <FormField control={control} name="description" label="Descrição" placeholder={kind === 'expense' ? 'Ex.: Conta de luz' : 'Ex.: Serviço avulso'} />
      <FormField control={control} name="amount" label="Valor" mask="money" placeholder="0,00" />
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
      </View>
      <FormField control={control} name="competenceDate" label="Data de referência" mask="date" placeholder="DD/MM/AAAA" hint="Mês ao qual a despesa/receita pertence" />
      <Controller
        control={control}
        name="paid"
        render={({ field }) => (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text>Já foi {kind === 'expense' ? 'paga' : 'recebida'}</Text>
              <Text variant="caption" tone="muted">Desative para lançar como conta a {kind === 'expense' ? 'pagar' : 'receber'}</Text>
            </View>
            <Switch value={field.value} onValueChange={field.onChange} trackColor={{ true: colors.primary }} />
          </View>
        )}
      />
      {paid ? (
        <Controller
          control={control}
          name="method"
          render={({ field }) => <Chips options={METHOD_OPTIONS} value={field.value} onChange={field.onChange} />}
        />
      ) : (
        <FormField control={control} name="dueDate" label="Vencimento" mask="date" placeholder="DD/MM/AAAA" />
      )}
      <FormField control={control} name="notes" label="Observações (opcional)" multiline />
      <Button
        title="Salvar lançamento"
        icon="save"
        loading={formState.isSubmitting}
        onPress={handleSubmit(async (v) => {
          try {
            await create.mutateAsync({
              kind: v.kind,
              description: v.description,
              amountCents: parseBRL(v.amount) ?? 0,
              categoryId: v.categoryId,
              competenceDate: parseBRDate(v.competenceDate) ?? toISODate(new Date()),
              dueDate: v.dueDate ? parseBRDate(v.dueDate) : null,
              paid: v.paid,
              method: v.paid ? v.method : null,
              notes: v.notes.trim() || null,
            });
            toast.show('Lançamento salvo!');
            router.back();
          } catch (e) {
            toast.show(errorMessage(e), 'error');
          }
        })}
      />
    </Screen>
  );
}

export default function NewEntryScreen() {
  return (
    <ManagerOnly>
      <NewEntry />
    </ManagerOnly>
  );
}
