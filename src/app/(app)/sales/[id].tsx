import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Badge, Button, Card, ErrorState, KeyValue, LoadingState, Screen, Section, Text, TextField, confirm, useToast } from '@/components/ui';
import { useCancelSale, useSale } from '@/features/sales/api';
import { PAYMENT_LABELS } from '@/features/sales/cart';
import { buildSaleReceiptHtml } from '@/features/sales/receipt';
import { shareHtmlAsPdf } from '@/features/sales/share';
import { formatDateTime } from '@/lib/dates';
import { errorMessage } from '@/lib/errors';
import { formatBRL, formatQuantity } from '@/lib/money';
import { useCurrentBusiness } from '@/providers/BusinessProvider';
import { spacing } from '@/theme/colors';

export default function SaleDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const business = useCurrentBusiness();
  const toast = useToast();
  const { data: sale, isPending, error, refetch } = useSale(id);
  const cancel = useCancelSale(business.id);
  const [reason, setReason] = useState('');
  const [showCancel, setShowCancel] = useState(false);
  const [sharing, setSharing] = useState(false);

  if (isPending) return <LoadingState />;
  if (error || !sale) return <ErrorState error={error} onRetry={refetch} />;

  const canceled = sale.status === 'canceled';

  return (
    <Screen>
      <Card style={{ gap: spacing.xs }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text variant="title">Venda #{sale.number}</Text>
          {canceled ? <Badge label="Cancelada" tone="danger" /> : <Badge label="Concluída" tone="success" />}
        </View>
        <Text tone="muted">{formatDateTime(sale.created_at)}</Text>
        {sale.customers ? (
          <Text tone="primary" bold onPress={() => router.push(`/customers/${sale.customers!.id}`)}>
            Cliente: {sale.customers.name}
          </Text>
        ) : null}
        {canceled ? (
          <Text tone="danger">
            Cancelada em {formatDateTime(sale.canceled_at)} — {sale.cancel_reason}
          </Text>
        ) : null}
      </Card>

      <Section title="Itens">
        <Card>
          {sale.sale_items.map((i) => (
            <View key={i.id} style={{ paddingVertical: 6, gap: 2 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm }}>
                <Text style={{ flex: 1 }}>{i.product_name}</Text>
                <Text bold>{formatBRL(i.total_cents)}</Text>
              </View>
              <Text variant="caption" tone="muted">
                {formatQuantity(i.quantity, '')} x {formatBRL(i.unit_price_cents)}
                {i.discount_cents > 0 ? ` · desconto ${formatBRL(i.discount_cents)}` : ''}
              </Text>
            </View>
          ))}
        </Card>
      </Section>

      <Card>
        <KeyValue label="Subtotal" value={formatBRL(sale.subtotal_cents)} />
        {sale.discount_cents > 0 ? <KeyValue label="Descontos" value={`-${formatBRL(sale.discount_cents)}`} tone="danger" /> : null}
        <KeyValue label="Total" value={formatBRL(sale.total_cents)} tone="primary" />
        {sale.sale_payments.map((p) => (
          <KeyValue key={p.id} label={PAYMENT_LABELS[p.method]} value={formatBRL(p.amount_cents)} />
        ))}
        {business.isManager ? (
          <KeyValue label="Lucro bruto da venda" value={formatBRL(sale.total_cents - sale.cost_cents)} tone={sale.total_cents >= sale.cost_cents ? 'success' : 'danger'} />
        ) : null}
      </Card>
      {sale.notes ? <Text tone="muted">Obs.: {sale.notes}</Text> : null}

      <Button
        title="Compartilhar comprovante (PDF)"
        icon="share-social"
        loading={sharing}
        onPress={async () => {
          try {
            setSharing(true);
            await shareHtmlAsPdf(buildSaleReceiptHtml(business, sale), `Comprovante venda #${sale.number}`);
          } catch (e) {
            toast.show(errorMessage(e), 'error');
          } finally {
            setSharing(false);
          }
        }}
      />
      <Text variant="caption" tone="muted" center>
        Comprovante não fiscal.
      </Text>

      {!canceled && business.isManager ? (
        showCancel ? (
          <Card style={{ gap: spacing.md }}>
            <Text bold>Cancelar venda</Text>
            <Text tone="muted">
              O estoque dos produtos será devolvido e o fiado (se houver) será cancelado. A ação fica registrada na auditoria.
            </Text>
            <TextField label="Motivo do cancelamento" value={reason} onChangeText={setReason} maxLength={300} />
            <Button
              title="Confirmar cancelamento"
              variant="danger"
              icon="close-circle"
              loading={cancel.isPending}
              disabled={reason.trim().length < 3}
              onPress={async () => {
                if (!(await confirm('Cancelar venda', `Cancelar a venda #${sale.number}?`, 'Cancelar venda', true))) return;
                try {
                  await cancel.mutateAsync({ saleId: sale.id, reason: reason.trim() });
                  toast.show('Venda cancelada e estoque devolvido.');
                  setShowCancel(false);
                } catch (e) {
                  toast.show(errorMessage(e), 'error');
                }
              }}
            />
            <Button title="Voltar" variant="ghost" onPress={() => setShowCancel(false)} />
          </Card>
        ) : (
          <Button title="Cancelar venda" variant="outline" icon="close-circle-outline" onPress={() => setShowCancel(true)} />
        )
      ) : null}

      <Button title="Nova venda" variant="secondary" icon="cart" onPress={() => router.replace('/sell')} />
    </Screen>
  );
}
