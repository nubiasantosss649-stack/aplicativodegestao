import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Badge, Button, Chips, EmptyState, ErrorState, ListItem, LoadingState, Row, Screen, Text } from '@/components/ui';
import { QUOTE_STATUS, useDocuments, useQuotes } from '@/features/documents/api';
import { formatDate, formatDateTime } from '@/lib/dates';
import { formatBRL } from '@/lib/money';
import { useCurrentBusiness } from '@/providers/BusinessProvider';
import { spacing } from '@/theme/colors';

const KIND_LABELS = {
  sale_receipt: 'Comprovante de venda',
  payment_receipt: 'Recibo de pagamento',
  service_receipt: 'Recibo',
  quote: 'Orçamento',
} as const;

export default function Documents() {
  const business = useCurrentBusiness();
  const [tab, setTab] = useState<'quotes' | 'history'>('quotes');
  const quotes = useQuotes(business.id);
  const docs = useDocuments(business.id);
  const active = tab === 'quotes' ? quotes : docs;

  return (
    <Screen refreshing={active.isRefetching} onRefresh={active.refetch}>
      <Row>
        <Button title="Novo orçamento" icon="document-text" style={{ flex: 1 }} onPress={() => router.push('/quotes/new')} />
        <Button title="Novo recibo" icon="receipt" variant="secondary" style={{ flex: 1 }} onPress={() => router.push('/receipts/new')} />
      </Row>
      <Text variant="caption" tone="muted">Todos os documentos são não fiscais. Para nota fiscal, use o emissor oficial.</Text>
      <Chips
        options={[
          { value: 'quotes', label: 'Orçamentos' },
          { value: 'history', label: 'Histórico de documentos' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {active.isPending ? (
        <LoadingState />
      ) : active.error ? (
        <ErrorState error={active.error} onRetry={active.refetch} />
      ) : tab === 'quotes' ? (
        (quotes.data ?? []).length === 0 ? (
          <EmptyState icon="document-text-outline" title="Nenhum orçamento" message="Crie orçamentos de produtos e serviços e envie em PDF pelo WhatsApp." />
        ) : (
          <View style={{ gap: spacing.sm }}>
            {(quotes.data ?? []).map((q) => (
              <ListItem
                key={q.id}
                icon="document-text"
                title={`Orçamento nº ${q.number}${q.customers ? ` · ${q.customers.name}` : ''}`}
                subtitle={`${formatDate(q.created_at)}${q.valid_until ? ` · válido até ${formatDate(q.valid_until)}` : ''}`}
                right={
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Text bold>{formatBRL(q.total_cents)}</Text>
                    <Badge label={QUOTE_STATUS[q.status].label} tone={QUOTE_STATUS[q.status].tone} />
                  </View>
                }
                onPress={() => router.push(`/quotes/${q.id}`)}
              />
            ))}
          </View>
        )
      ) : (docs.data ?? []).length === 0 ? (
        <EmptyState icon="folder-open-outline" title="Nenhum documento gerado" message="Recibos, comprovantes e orçamentos compartilhados aparecem aqui." />
      ) : (
        <View style={{ gap: spacing.sm }}>
          {(docs.data ?? []).map((d) => (
            <ListItem
              key={d.id}
              icon={d.kind === 'quote' ? 'document-text' : 'receipt'}
              title={`${KIND_LABELS[d.kind]}${d.number ? ` nº ${d.number}` : ''}`}
              subtitle={`${formatDateTime(d.created_at)}${d.title ? ` · ${d.title}` : ''}`}
              right={d.amount_cents != null ? <Text bold>{formatBRL(d.amount_cents)}</Text> : undefined}
              onPress={
                d.kind === 'quote' && d.reference_id
                  ? () => router.push(`/quotes/${d.reference_id}`)
                  : d.kind === 'sale_receipt' && d.reference_id
                    ? () => router.push(`/sales/${d.reference_id}`)
                    : undefined
              }
            />
          ))}
        </View>
      )}
    </Screen>
  );
}
