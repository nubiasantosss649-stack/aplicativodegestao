import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, View } from 'react-native';

import { Badge, Button, Card, Chips, ErrorState, KeyValue, LoadingState, Screen, Section, Text, confirm, useToast } from '@/components/ui';
import { QUOTE_STATUS, registerDocument, useQuote, useUpdateQuoteStatus, type Quote } from '@/features/documents/api';
import { buildQuoteHtml } from '@/features/documents/templates';
import { toWhatsAppNumber } from '@/features/receivables/charge';
import { shareHtmlAsPdf } from '@/features/sales/share';
import { useProducts } from '@/features/products/api';
import { formatDate, formatDateTime } from '@/lib/dates';
import { errorMessage } from '@/lib/errors';
import { formatBRL, formatQuantity } from '@/lib/money';
import { useCurrentBusiness } from '@/providers/BusinessProvider';
import { useCart } from '@/providers/CartProvider';
import { spacing } from '@/theme/colors';

export default function QuoteDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const business = useCurrentBusiness();
  const toast = useToast();
  const { dispatch, cart } = useCart();
  const { data: q, isPending, error, refetch } = useQuote(id);
  const updateStatus = useUpdateQuoteStatus(business.id, id);
  const products = useProducts(business.id);
  const [sharing, setSharing] = useState(false);

  if (isPending) return <LoadingState />;
  if (error || !q) return <ErrorState error={error} onRetry={refetch} />;

  const share = async () => {
    try {
      setSharing(true);
      await shareHtmlAsPdf(
        buildQuoteHtml(business, {
          ...q,
          customer: q.customers,
          items: q.quote_items.map((i) => ({ ...i, quantity: Number(i.quantity) })),
        }),
        `Orçamento nº ${q.number}`,
      );
      await registerDocument(business.id, 'quote', q.id, `Orçamento nº ${q.number}`, q.total_cents).catch(() => null);
      if (q.status === 'draft') await updateStatus.mutateAsync('sent');
    } catch (e) {
      toast.show(errorMessage(e), 'error');
    } finally {
      setSharing(false);
    }
  };

  const toSale = async () => {
    const linked = q.quote_items.filter((i) => i.product_id);
    const loose = q.quote_items.length - linked.length;
    if (linked.length === 0) return toast.show('Este orçamento não tem produtos cadastrados para vender.', 'error');
    if (cart.items.length > 0 && !(await confirm('Carrinho em uso', 'O carrinho atual será substituído pelos itens do orçamento.', 'Substituir'))) return;
    dispatch({ type: 'clear' });
    for (const item of linked) {
      const product = products.data?.find((p) => p.id === item.product_id);
      if (product) dispatch({ type: 'add', product, quantity: Number(item.quantity) });
    }
    if (q.customers) dispatch({ type: 'setCustomer', customerId: q.customers.id, customerName: q.customers.name });
    toast.show(
      loose > 0
        ? `Itens carregados. ${loose} item(ns) avulso(s) não entram na venda. Os preços seguem o cadastro atual.`
        : 'Itens carregados no carrinho. Os preços seguem o cadastro atual dos produtos.',
      'info',
    );
    if (q.status !== 'approved') updateStatus.mutate('approved');
    router.push('/sell');
  };

  const wa = toWhatsAppNumber(q.customers?.phone);

  return (
    <Screen>
      <Card style={{ gap: 4 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text variant="title">Orçamento nº {q.number}</Text>
          <Badge label={QUOTE_STATUS[q.status].label} tone={QUOTE_STATUS[q.status].tone} />
        </View>
        <Text tone="muted">Criado em {formatDateTime(q.created_at)}</Text>
        {q.valid_until ? <Text tone="muted">Válido até {formatDate(q.valid_until)}</Text> : null}
        {q.customers ? <Text bold tone="primary">Cliente: {q.customers.name}</Text> : null}
      </Card>

      <Section title="Itens">
        <Card>
          {q.quote_items.map((i) => (
            <View key={i.id} style={{ paddingVertical: 6 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm }}>
                <Text style={{ flex: 1 }}>{i.description}</Text>
                <Text bold>{formatBRL(i.total_cents)}</Text>
              </View>
              <Text variant="caption" tone="muted">
                {formatQuantity(Number(i.quantity), '').trim()} x {formatBRL(i.unit_price_cents)}
                {i.product_id ? '' : ' · item avulso'}
              </Text>
            </View>
          ))}
        </Card>
      </Section>

      <Card>
        <KeyValue label="Subtotal" value={formatBRL(q.subtotal_cents)} />
        {q.discount_cents > 0 ? <KeyValue label="Desconto" value={`-${formatBRL(q.discount_cents)}`} tone="danger" /> : null}
        <KeyValue label="Total" value={formatBRL(q.total_cents)} tone="primary" />
      </Card>
      {q.notes ? <Text tone="muted">Obs.: {q.notes}</Text> : null}

      <Button title="Compartilhar PDF" icon="share-social" loading={sharing} onPress={share} />
      {wa ? (
        <Button
          title="Avisar cliente no WhatsApp"
          icon="logo-whatsapp"
          variant="secondary"
          onPress={() =>
            Linking.openURL(
              `https://wa.me/${wa}?text=${encodeURIComponent(
                `Olá, ${q.customers!.name.split(' ')[0]}! Segue o orçamento nº ${q.number} da ${business.name}, no valor de ${formatBRL(q.total_cents)}${q.valid_until ? `, válido até ${formatDate(q.valid_until)}` : ''}. Vou te enviar o PDF.`,
              )}`,
            )
          }
        />
      ) : null}
      <Button title="Converter em venda" icon="cart" variant="success" onPress={toSale} />

      <Section title="Situação">
        <Chips<Quote['status']>
          options={(Object.keys(QUOTE_STATUS) as Quote['status'][]).map((s) => ({ value: s, label: QUOTE_STATUS[s].label }))}
          value={q.status}
          onChange={(s) => updateStatus.mutate(s, { onError: (e) => toast.show(errorMessage(e), 'error') })}
        />
      </Section>
    </Screen>
  );
}
