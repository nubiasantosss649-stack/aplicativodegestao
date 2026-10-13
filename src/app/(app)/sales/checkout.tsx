import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

import { CustomerPicker } from '@/components/CustomerPicker';
import { Badge, Button, Card, Chips, EmptyState, KeyValue, Screen, Section, Text, TextField, useToast } from '@/components/ui';
import { PAYMENT_LABELS, normalizePayments, validatePayments, type PaymentLine } from '@/features/sales/cart';
import { useCompleteSale } from '@/features/sales/api';
import { addDays, formatDate, parseBRDate, toISODate } from '@/lib/dates';
import { errorMessage } from '@/lib/errors';
import { newIdempotencyKey } from '@/lib/id';
import { formatBRL, maskMoneyDigits, parseBRL } from '@/lib/money';
import { useCurrentBusiness } from '@/providers/BusinessProvider';
import { useCart } from '@/providers/CartProvider';
import { spacing } from '@/theme/colors';
import { useTheme } from '@/theme/ThemeProvider';
import type { PaymentMethod } from '@/types/database';

const METHODS: PaymentMethod[] = ['cash', 'pix', 'card', 'credit'];
const ICONS = { cash: 'cash', pix: 'flash', card: 'card', credit: 'time' } as const;

export default function Checkout() {
  const business = useCurrentBusiness();
  const { colors } = useTheme();
  const toast = useToast();
  const { cart, totals, dispatch } = useCart();
  const completeSale = useCompleteSale(business.id);
  // Mesma chave enquanto a tela estiver aberta: toques repetidos não duplicam a venda
  const idempotencyKey = useRef(newIdempotencyKey());

  const [mode, setMode] = useState<'single' | 'mixed'>('single');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [cashGiven, setCashGiven] = useState('');
  const [amounts, setAmounts] = useState<Record<PaymentMethod, string>>({ cash: '', pix: '', card: '', credit: '' });
  const [dueDate, setDueDate] = useState(formatDate(toISODate(addDays(new Date(), business.default_credit_days))));
  const [notes, setNotes] = useState('');
  const [picking, setPicking] = useState(false);

  const payments: PaymentLine[] = useMemo(() => {
    if (mode === 'single') {
      if (method === 'cash') {
        const given = parseBRL(cashGiven);
        return [{ method, amountCents: given && given > 0 ? given : totals.totalCents }];
      }
      return [{ method, amountCents: totals.totalCents }];
    }
    return METHODS.map((m) => ({ method: m, amountCents: parseBRL(amounts[m]) ?? 0 }));
  }, [mode, method, cashGiven, amounts, totals.totalCents]);

  const validation = validatePayments(totals.totalCents, payments, !!cart.customerId);
  const hasCredit = payments.some((p) => p.method === 'credit' && p.amountCents > 0);
  const sumMixed = payments.reduce((a, p) => a + p.amountCents, 0);

  if (cart.items.length === 0) {
    return (
      <Screen>
        <EmptyState icon="cart-outline" title="Carrinho vazio" message="Adicione produtos para finalizar a venda." actionLabel="Voltar" onAction={() => router.back()} />
      </Screen>
    );
  }

  const finish = async () => {
    if (!validation.ok) return toast.show(validation.reason, 'error');
    const due = hasCredit ? parseBRDate(dueDate) : null;
    if (hasCredit && !due) return toast.show('Informe um vencimento válido para o fiado.', 'error');
    try {
      const sale = await completeSale.mutateAsync({
        idempotencyKey: idempotencyKey.current,
        items: cart.items.map((i) => ({ productId: i.productId, quantity: i.quantity, discountCents: i.discountCents })),
        payments: normalizePayments(totals.totalCents, payments),
        customerId: cart.customerId,
        discountCents: totals.discountCents,
        dueDate: due,
        notes: notes.trim() || null,
      });
      dispatch({ type: 'clear' });
      idempotencyKey.current = newIdempotencyKey();
      toast.show(`Venda #${sale.number} registrada!${validation.changeCents > 0 ? ` Troco: ${formatBRL(validation.changeCents)}` : ''}`);
      router.replace(`/sales/${sale.id}`);
    } catch (e) {
      toast.show(errorMessage(e), 'error');
    }
  };

  return (
    <Screen
      footer={
        <Button
          title={`Finalizar venda · ${formatBRL(totals.totalCents)}`}
          icon="checkmark-done"
          variant="success"
          loading={completeSale.isPending}
          disabled={!validation.ok}
          onPress={finish}
        />
      }
    >
      <Card style={{ alignItems: 'center', gap: 4 }}>
        <Text tone="muted">Total a pagar</Text>
        <Text variant="hero" tone="primary">{formatBRL(totals.totalCents)}</Text>
        {totals.discountCents + totals.itemsDiscountCents > 0 ? (
          <Text variant="caption" tone="muted">
            Subtotal {formatBRL(totals.subtotalCents)} · desconto {formatBRL(totals.discountCents + totals.itemsDiscountCents)}
          </Text>
        ) : null}
      </Card>

      <Section title="Cliente">
        <Card onPress={() => setPicking(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <Ionicons name="person-circle" size={32} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text bold>{cart.customerName ?? 'Consumidor (sem cliente)'}</Text>
            <Text variant="caption" tone="muted">{cart.customerId ? 'Toque para trocar' : 'Obrigatório para venda fiado'}</Text>
          </View>
          {cart.customerId ? (
            <Pressable accessibilityLabel="Remover cliente" hitSlop={10} onPress={() => dispatch({ type: 'setCustomer', customerId: null, customerName: null })}>
              <Ionicons name="close-circle" size={24} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </Card>
      </Section>

      <Section title="Forma de pagamento">
        <Chips
          options={[
            { value: 'single', label: 'Uma forma' },
            { value: 'mixed', label: 'Pagamento misto' },
          ]}
          value={mode}
          onChange={setMode}
        />
        {mode === 'single' ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {METHODS.map((m) => {
              const active = m === method;
              return (
                <Pressable
                  key={m}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  onPress={() => setMethod(m)}
                  style={{
                    flexBasis: '47%',
                    flexGrow: 1,
                    padding: spacing.lg,
                    borderRadius: 12,
                    borderWidth: 2,
                    borderColor: active ? colors.primary : colors.border,
                    backgroundColor: active ? colors.primarySoft : colors.surface,
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <Ionicons name={ICONS[m]} size={26} color={active ? colors.primary : colors.textMuted} />
                  <Text bold tone={active ? 'primary' : 'default'}>{PAYMENT_LABELS[m]}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <Card style={{ gap: spacing.md }}>
            {METHODS.map((m) => (
              <TextField
                key={m}
                label={PAYMENT_LABELS[m]}
                mask="money"
                placeholder="0,00"
                value={amounts[m]}
                onChangeText={(t) => setAmounts((prev) => ({ ...prev, [m]: t }))}
              />
            ))}
            <KeyValue
              label="Soma informada"
              value={`${formatBRL(sumMixed)} de ${formatBRL(totals.totalCents)}`}
              tone={sumMixed >= totals.totalCents ? 'success' : 'danger'}
            />
          </Card>
        )}

        {mode === 'single' && method === 'cash' ? (
          <Card style={{ gap: spacing.sm }}>
            <TextField
              label="Valor recebido em dinheiro (opcional)"
              mask="money"
              placeholder={maskMoneyDigits(String(totals.totalCents))}
              value={cashGiven}
              onChangeText={setCashGiven}
              hint="Informe para calcular o troco"
            />
            {validation.ok && validation.changeCents > 0 ? (
              <KeyValue label="Troco" value={formatBRL(validation.changeCents)} tone="success" />
            ) : null}
          </Card>
        ) : null}

        {hasCredit ? (
          <Card style={{ gap: spacing.sm }}>
            <Badge label="Fiado não entra como dinheiro recebido" tone="warning" />
            <TextField label="Vencimento do fiado" mask="date" value={dueDate} onChangeText={setDueDate} placeholder="DD/MM/AAAA" />
          </Card>
        ) : null}

        {!validation.ok ? <Text tone="danger">{validation.reason}</Text> : null}
      </Section>

      <TextField label="Observações (opcional)" value={notes} onChangeText={setNotes} multiline maxLength={500} />

      <CustomerPicker
        businessId={business.id}
        visible={picking}
        onClose={() => setPicking(false)}
        onSelect={(c) => {
          dispatch({ type: 'setCustomer', customerId: c.id, customerName: c.name });
          setPicking(false);
        }}
      />
    </Screen>
  );
}
