import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { CustomerPicker } from '@/components/CustomerPicker';
import { Button, Card, KeyValue, ListItem, Screen, SearchBar, Section, Text, TextField, useToast } from '@/components/ui';
import { useSaveQuote } from '@/features/documents/api';
import { useProducts } from '@/features/products/api';
import { addDays, formatDate, parseBRDate, toISODate } from '@/lib/dates';
import { errorMessage } from '@/lib/errors';
import { formatBRL, lineTotal, maskMoneyDigits, parseBRL, parseQuantity } from '@/lib/money';
import { useCurrentBusiness } from '@/providers/BusinessProvider';
import { spacing } from '@/theme/colors';
import { useTheme } from '@/theme/ThemeProvider';
import type { Customer } from '@/types/database';

interface DraftItem {
  key: string;
  productId: string | null;
  description: string;
  quantity: string;
  price: string;
}

let seq = 0;
const newKey = () => `i${++seq}`;

export default function NewQuote() {
  const business = useCurrentBusiness();
  const { colors } = useTheme();
  const toast = useToast();
  const save = useSaveQuote(business.id);
  const [items, setItems] = useState<DraftItem[]>([]);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [picking, setPicking] = useState(false);
  const [search, setSearch] = useState('');
  const [discount, setDiscount] = useState('');
  const [validUntil, setValidUntil] = useState(formatDate(toISODate(addDays(new Date(), 15))));
  const [notes, setNotes] = useState('');
  const products = useProducts(business.id, { search });

  const lines = items.map((i) => {
    const q = parseQuantity(i.quantity) ?? 0;
    const p = parseBRL(i.price) ?? 0;
    return { ...i, q, p, total: lineTotal(p, q) };
  });
  const subtotal = lines.reduce((a, l) => a + l.total, 0);
  const discountCents = parseBRL(discount) ?? 0;
  const total = Math.max(0, subtotal - discountCents);

  const update = (key: string, patch: Partial<DraftItem>) =>
    setItems((list) => list.map((i) => (i.key === key ? { ...i, ...patch } : i)));

  const submit = async () => {
    if (lines.length === 0) return toast.show('Adicione pelo menos um item.', 'error');
    const invalid = lines.find((l) => !l.description.trim() || l.q <= 0 || l.p < 0);
    if (invalid) return toast.show('Revise os itens: descrição, quantidade e valor são obrigatórios.', 'error');
    if (discountCents > subtotal) return toast.show('O desconto é maior que o subtotal.', 'error');
    const valid = validUntil.trim() ? parseBRDate(validUntil) : null;
    if (validUntil.trim() && !valid) return toast.show('Data de validade inválida.', 'error');
    try {
      const q = await save.mutateAsync({
        customerId: customer?.id ?? null,
        items: lines.map((l) => ({ productId: l.productId, description: l.description.trim(), quantity: l.q, unitPriceCents: l.p })),
        discountCents,
        validUntil: valid,
        notes: notes.trim() || null,
      });
      toast.show(`Orçamento nº ${q.number} criado!`);
      router.replace(`/quotes/${q.id}`);
    } catch (e) {
      toast.show(errorMessage(e), 'error');
    }
  };

  return (
    <Screen
      footer={
        <>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text tone="muted">Total do orçamento</Text>
            <Text variant="subtitle" bold>{formatBRL(total)}</Text>
          </View>
          <Button title="Salvar orçamento" icon="save" loading={save.isPending} onPress={submit} />
        </>
      }
    >
      <Card onPress={() => setPicking(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <Ionicons name="person-circle" size={30} color={colors.primary} />
        <Text style={{ flex: 1 }} bold>{customer?.name ?? 'Selecionar cliente (opcional)'}</Text>
      </Card>

      <Section title="Adicionar produto">
        <SearchBar value={search} onChangeText={setSearch} placeholder="Buscar produto cadastrado" />
        {search.trim()
          ? (products.data ?? []).slice(0, 6).map((p) => (
              <ListItem
                key={p.id}
                icon="cube"
                title={p.name}
                subtitle={formatBRL(p.price_cents)}
                onPress={() => {
                  setItems((l) => [...l, { key: newKey(), productId: p.id, description: p.name, quantity: '1', price: maskMoneyDigits(String(p.price_cents)) }]);
                  setSearch('');
                }}
              />
            ))
          : null}
        <Button
          title="Adicionar item ou serviço avulso"
          icon="add"
          variant="outline"
          size="md"
          onPress={() => setItems((l) => [...l, { key: newKey(), productId: null, description: '', quantity: '1', price: '' }])}
        />
      </Section>

      {lines.length > 0 ? (
        <Section title="Itens">
          {lines.map((l) => (
            <Card key={l.key} style={{ gap: spacing.sm }}>
              <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
                <View style={{ flex: 1 }}>
                  <TextField value={l.description} onChangeText={(t) => update(l.key, { description: t })} placeholder="Descrição" maxLength={200} />
                </View>
                <Pressable accessibilityLabel="Remover item" hitSlop={10} onPress={() => setItems((list) => list.filter((i) => i.key !== l.key))}>
                  <Ionicons name="trash-outline" size={22} color={colors.danger} />
                </Pressable>
              </View>
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <View style={{ width: 100 }}>
                  <TextField label="Qtd." value={l.quantity} onChangeText={(t) => update(l.key, { quantity: t })} keyboardType="decimal-pad" />
                </View>
                <View style={{ flex: 1 }}>
                  <TextField label="Valor unitário" mask="money" value={l.price} onChangeText={(t) => update(l.key, { price: t })} placeholder="0,00" />
                </View>
              </View>
              <Text variant="caption" tone="muted">Total do item: {formatBRL(l.total)}</Text>
            </Card>
          ))}
        </Section>
      ) : null}

      <Card style={{ gap: spacing.sm }}>
        <KeyValue label="Subtotal" value={formatBRL(subtotal)} />
        <TextField label="Desconto" mask="money" value={discount} onChangeText={setDiscount} placeholder="0,00" />
        <TextField label="Válido até" mask="date" value={validUntil} onChangeText={setValidUntil} placeholder="DD/MM/AAAA" />
        <TextField label="Observações (opcional)" value={notes} onChangeText={setNotes} multiline maxLength={1000} placeholder="Condições de pagamento, prazo de entrega..." />
      </Card>

      <CustomerPicker
        businessId={business.id}
        visible={picking}
        onClose={() => setPicking(false)}
        onSelect={(c) => {
          setCustomer(c);
          setPicking(false);
        }}
      />
    </Screen>
  );
}
