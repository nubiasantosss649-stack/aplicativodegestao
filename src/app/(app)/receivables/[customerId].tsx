import { zodResolver } from '@hookform/resolvers/zod';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Linking, View } from 'react-native';

import {
  Badge,
  Button,
  Card,
  Chips,
  ErrorState,
  FormField,
  KeyValue,
  ListItem,
  LoadingState,
  Screen,
  Section,
  Text,
  TextField,
  confirm,
  useToast,
} from '@/components/ui';
import { useCustomer } from '@/features/customers/api';
import { useEntitlements } from '@/features/subscription/api';
import { hasFeature } from '@/features/subscription/plans';
import { METHOD_OPTIONS } from '@/features/finance/api';
import {
  useCreateReceivable,
  useCustomerPayments,
  useCustomerReceivables,
  useReceivePayment,
  useReversePayment,
} from '@/features/receivables/api';
import { buildChargeMessage, whatsappUrl } from '@/features/receivables/charge';
import { PAYMENT_LABELS } from '@/features/sales/cart';
import {
  manualReceivableSchema,
  receivePaymentSchema,
  type ManualReceivableForm,
  type ReceivePaymentForm,
} from '@/features/schemas';
import { daysOverdue, formatDate, formatDateTime, parseBRDate } from '@/lib/dates';
import { errorMessage } from '@/lib/errors';
import { newIdempotencyKey } from '@/lib/id';
import { formatBRL, maskMoneyDigits, parseBRL } from '@/lib/money';
import { useCurrentBusiness } from '@/providers/BusinessProvider';
import { spacing } from '@/theme/colors';

const STATUS = {
  open: { label: 'Em aberto', tone: 'warning' },
  partial: { label: 'Parcial', tone: 'warning' },
  paid: { label: 'Pago', tone: 'success' },
  canceled: { label: 'Cancelado', tone: 'neutral' },
} as const;

export default function CustomerCharge() {
  const { customerId } = useLocalSearchParams<{ customerId: string }>();
  const business = useCurrentBusiness();
  const toast = useToast();
  const customer = useCustomer(customerId);
  const receivables = useCustomerReceivables(business.id, customerId);
  const payments = useCustomerPayments(business.id, customerId);
  const receive = useReceivePayment(business.id, customerId);
  const createReceivable = useCreateReceivable(business.id, customerId);
  const reverse = useReversePayment(business.id, customerId);
  const entitlements = useEntitlements(business.id);
  const [payKey, setPayKey] = useState(newIdempotencyKey);
  const [panel, setPanel] = useState<'none' | 'receive' | 'new' | 'message'>('none');
  const [message, setMessage] = useState('');

  const payForm = useForm<ReceivePaymentForm>({
    resolver: zodResolver(receivePaymentSchema),
    defaultValues: { amount: '', method: 'pix', notes: '' },
  });
  const newForm = useForm<ManualReceivableForm>({
    resolver: zodResolver(manualReceivableSchema),
    defaultValues: { description: '', amount: '', dueDate: '' },
  });

  const open = (receivables.data ?? []).filter((r) => r.status === 'open' || r.status === 'partial');
  const balance = open.reduce((a, r) => a + r.amount_cents - r.paid_cents, 0);
  const oldest = open[0]?.due_date ?? null;
  const overdueDays = oldest ? daysOverdue(oldest) : 0;

  if (customer.isPending || receivables.isPending) return <LoadingState />;
  if (customer.error || !customer.data)
    return <ErrorState error={customer.error} onRetry={customer.refetch} />;
  const c = customer.data;

  return (
    <Screen
      refreshing={receivables.isRefetching}
      onRefresh={() => {
        receivables.refetch();
        payments.refetch();
      }}
    >
      <Card style={{ gap: spacing.xs }}>
        <Text variant="title">{c.name}</Text>
        <Text tone="muted">Saldo devedor</Text>
        <Text variant="hero" tone={balance > 0 ? 'danger' : 'success'}>
          {formatBRL(balance)}
        </Text>
        {overdueDays > 0 ? (
          <Badge label={`${overdueDays} ${overdueDays === 1 ? 'dia' : 'dias'} de atraso`} tone="danger" />
        ) : oldest ? (
          <Text variant="caption" tone="muted">
            Próximo vencimento: {formatDate(oldest)}
          </Text>
        ) : null}
      </Card>

      <View style={{ gap: spacing.sm }}>
        {balance > 0 ? (
          <Button
            title="Registrar pagamento"
            icon="cash"
            variant="success"
            onPress={() => setPanel(panel === 'receive' ? 'none' : 'receive')}
          />
        ) : null}
        {balance > 0 ? (
          <Button
            title="Cobrar pelo WhatsApp"
            icon="logo-whatsapp"
            variant="secondary"
            onPress={() => {
              if (!hasFeature(entitlements.data, 'charge_messages')) {
                router.push({ pathname: '/subscription', params: { reason: 'charge' } });
                return;
              }
              if (panel !== 'message') {
                setMessage(
                  buildChargeMessage({
                    customerName: c.name,
                    businessName: business.name,
                    balanceCents: balance,
                    oldestDueDate: oldest,
                    overdueDays,
                  }),
                );
              }
              setPanel(panel === 'message' ? 'none' : 'message');
            }}
          />
        ) : null}
        <Button
          title="Lançar fiado manual"
          icon="add-circle"
          variant="outline"
          onPress={() => setPanel(panel === 'new' ? 'none' : 'new')}
        />
      </View>

      {panel === 'receive' ? (
        <Card style={{ gap: spacing.md }}>
          <Text variant="subtitle">Receber pagamento</Text>
          <FormField
            control={payForm.control}
            name="amount"
            label="Valor recebido"
            mask="money"
            placeholder="0,00"
          />
          <Button
            title={`Valor total: ${formatBRL(balance)}`}
            size="sm"
            variant="ghost"
            fullWidth={false}
            onPress={() => payForm.setValue('amount', maskMoneyDigits(String(balance)))}
          />
          <Controller
            control={payForm.control}
            name="method"
            render={({ field }) => (
              <Chips options={METHOD_OPTIONS} value={field.value} onChange={field.onChange} />
            )}
          />
          <FormField control={payForm.control} name="notes" label="Observação (opcional)" />
          <Text variant="caption" tone="muted">
            Pagamentos parciais abatem primeiro os fiados mais antigos.
          </Text>
          <Button
            title="Confirmar recebimento"
            icon="checkmark"
            loading={payForm.formState.isSubmitting}
            onPress={payForm.handleSubmit(async (v) => {
              const amount = parseBRL(v.amount) ?? 0;
              if (amount > balance) return toast.show(`O valor máximo é ${formatBRL(balance)}.`, 'error');
              try {
                await receive.mutateAsync({
                  amountCents: amount,
                  method: v.method,
                  notes: v.notes.trim() || null,
                  idempotencyKey: payKey,
                });
                setPayKey(newIdempotencyKey());
                payForm.reset();
                setPanel('none');
                toast.show(
                  amount === balance ? 'Dívida quitada! 🎉' : `Pagamento de ${formatBRL(amount)} registrado.`,
                );
              } catch (e) {
                toast.show(errorMessage(e), 'error');
              }
            })}
          />
        </Card>
      ) : null}

      {panel === 'message' ? (
        <Card style={{ gap: spacing.md }}>
          <Text variant="subtitle">Mensagem de cobrança</Text>
          <TextField value={message} onChangeText={setMessage} multiline style={{ minHeight: 180 }} />
          {!c.phone ? (
            <Text variant="caption" tone="warning">
              Cliente sem telefone: você escolherá o contato no WhatsApp.
            </Text>
          ) : null}
          <Button
            title="Abrir no WhatsApp"
            icon="logo-whatsapp"
            variant="success"
            onPress={() =>
              Linking.openURL(whatsappUrl(c.phone, message)).catch(() =>
                toast.show('Não foi possível abrir o WhatsApp.', 'error'),
              )
            }
          />
          <Text variant="caption" tone="muted">
            A mensagem só é enviada quando você tocar em enviar no WhatsApp.
          </Text>
        </Card>
      ) : null}

      {panel === 'new' ? (
        <Card style={{ gap: spacing.md }}>
          <Text variant="subtitle">Novo fiado manual</Text>
          <Text variant="caption" tone="muted">
            Use para dívidas anteriores ao app. Vendas fiado criam o registro automaticamente.
          </Text>
          <FormField
            control={newForm.control}
            name="description"
            label="Descrição"
            placeholder="Ex.: Compras de setembro"
          />
          <FormField control={newForm.control} name="amount" label="Valor" mask="money" placeholder="0,00" />
          <FormField
            control={newForm.control}
            name="dueDate"
            label="Vencimento"
            mask="date"
            placeholder="DD/MM/AAAA"
            hint="Vazio = hoje"
          />
          <Button
            title="Salvar fiado"
            icon="save"
            loading={newForm.formState.isSubmitting}
            onPress={newForm.handleSubmit(async (v) => {
              try {
                await createReceivable.mutateAsync({
                  description: v.description,
                  amountCents: parseBRL(v.amount) ?? 0,
                  dueDate: v.dueDate ? parseBRDate(v.dueDate) : null,
                });
                newForm.reset();
                setPanel('none');
                toast.show('Fiado lançado.');
              } catch (e) {
                toast.show(errorMessage(e), 'error');
              }
            })}
          />
        </Card>
      ) : null}

      <Section title="Fiados">
        {(receivables.data ?? []).length === 0 ? (
          <Text tone="muted">Nenhum fiado registrado para este cliente.</Text>
        ) : (
          (receivables.data ?? []).map((r) => {
            const late = (r.status === 'open' || r.status === 'partial') && daysOverdue(r.due_date) > 0;
            return (
              <Card key={r.id} style={{ gap: 4 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm }}>
                  <Text bold style={{ flex: 1 }}>
                    {r.description}
                  </Text>
                  <Badge
                    label={late ? 'Atrasado' : STATUS[r.status].label}
                    tone={late ? 'danger' : STATUS[r.status].tone}
                  />
                </View>
                <KeyValue label="Valor" value={formatBRL(r.amount_cents)} />
                {r.paid_cents > 0 ? (
                  <KeyValue label="Pago" value={formatBRL(r.paid_cents)} tone="success" />
                ) : null}
                {r.status !== 'paid' ? (
                  <KeyValue label="Restante" value={formatBRL(r.amount_cents - r.paid_cents)} tone="danger" />
                ) : null}
                <Text variant="caption" tone="muted">
                  Vencimento {formatDate(r.due_date)}
                </Text>
              </Card>
            );
          })
        )}
      </Section>

      <Section title="Histórico de pagamentos">
        {(payments.data ?? []).length === 0 ? (
          <Text tone="muted">Nenhum pagamento recebido ainda.</Text>
        ) : (
          (payments.data ?? []).map((p) => (
            <ListItem
              key={p.id}
              icon={p.reversed_at ? 'arrow-undo' : 'cash'}
              iconTone={p.reversed_at ? 'danger' : 'success'}
              title={`${formatBRL(p.amount_cents)} · ${PAYMENT_LABELS[p.method]}`}
              subtitle={`${formatDateTime(p.paid_at)}${p.reversed_at ? ` · ESTORNADO (${p.reversal_reason})` : ''}${p.notes ? ` · ${p.notes}` : ''}`}
              onPress={
                !p.reversed_at && business.isManager
                  ? async () => {
                      if (
                        !(await confirm(
                          'Estornar pagamento',
                          `Estornar ${formatBRL(p.amount_cents)}? O valor volta a ficar em aberto.`,
                          'Estornar',
                          true,
                        ))
                      )
                        return;
                      try {
                        await reverse.mutateAsync({
                          paymentId: p.id,
                          reason: 'Estorno solicitado pelo usuário',
                        });
                        toast.show('Pagamento estornado.');
                      } catch (e) {
                        toast.show(errorMessage(e), 'error');
                      }
                    }
                  : undefined
              }
            />
          ))
        )}
        {business.isManager && (payments.data ?? []).some((p) => !p.reversed_at) ? (
          <Text variant="caption" tone="muted">
            Toque em um pagamento para estorná-lo.
          </Text>
        ) : null}
      </Section>
    </Screen>
  );
}
