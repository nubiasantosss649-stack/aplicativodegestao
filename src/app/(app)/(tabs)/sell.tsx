import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { BarcodeScanner } from '@/components/BarcodeScanner';
import { QuantityStepper } from '@/components/QuantityStepper';
import {
  Button,
  Card,
  EmptyState,
  KeyValue,
  ListItem,
  LoadingState,
  Screen,
  SearchBar,
  Section,
  Text,
  TextField,
  confirm,
  useToast,
} from '@/components/ui';
import { findProductByCode, useProducts } from '@/features/products/api';
import { stockIssues } from '@/features/sales/cart';
import { errorMessage } from '@/lib/errors';
import { formatBRL, formatQuantity, lineTotal, parseBRL } from '@/lib/money';
import { useCurrentBusiness } from '@/providers/BusinessProvider';
import { useCart } from '@/providers/CartProvider';
import { spacing } from '@/theme/colors';
import { useTheme } from '@/theme/ThemeProvider';

export default function Sell() {
  const business = useCurrentBusiness();
  const { colors } = useTheme();
  const toast = useToast();
  const { cart, totals, dispatch } = useCart();
  const [search, setSearch] = useState('');
  const [scanning, setScanning] = useState(false);
  const [discountText, setDiscountText] = useState('');
  const products = useProducts(business.id, { search });
  const issues = stockIssues(cart);

  const addByCode = async (code: string) => {
    setScanning(false);
    try {
      const product = await findProductByCode(business.id, code);
      if (!product) {
        toast.show(`Nenhum produto com o código ${code}.`, 'error');
        setSearch(code);
        return;
      }
      dispatch({ type: 'add', product });
      toast.show(`${product.name} adicionado`);
    } catch (e) {
      toast.show(errorMessage(e), 'error');
    }
  };

  return (
    <Screen
      footer={
        cart.items.length > 0 ? (
          <>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text tone="muted">{totals.itemCount} {totals.itemCount === 1 ? 'item' : 'itens'}</Text>
              <Text variant="subtitle" bold>{formatBRL(totals.totalCents)}</Text>
            </View>
            <Button
              title="Ir para pagamento"
              icon="card"
              disabled={issues.length > 0 && !business.allow_negative_stock}
              onPress={() => router.push('/sales/checkout')}
            />
          </>
        ) : undefined
      }
    >
      <SearchBar value={search} onChangeText={setSearch} placeholder="Buscar produto ou código" onScan={() => setScanning(true)} />

      {search.trim() ? (
        <Section title="Resultados">
          {products.isPending ? (
            <LoadingState />
          ) : (products.data ?? []).length === 0 ? (
            <EmptyState
              icon="search"
              title="Nada encontrado"
              message="Confira o nome ou cadastre o produto."
              actionLabel={business.isManager ? 'Cadastrar produto' : undefined}
              onAction={() => router.push({ pathname: '/products/new', params: { barcode: /^\d{6,}$/.test(search) ? search : '' } })}
            />
          ) : (
            (products.data ?? []).slice(0, 15).map((p) => (
              <ListItem
                key={p.id}
                icon="cube"
                title={p.name}
                subtitle={`${formatBRL(p.price_cents)}${p.track_stock ? ` · estoque ${formatQuantity(p.stock_qty, p.unit)}` : ''}`}
                iconTone={p.track_stock && p.stock_qty <= 0 ? 'danger' : 'primary'}
                right={<Ionicons name="add-circle" size={30} color={colors.primary} />}
                onPress={() => {
                  dispatch({ type: 'add', product: p });
                  toast.show(`${p.name} adicionado`);
                }}
              />
            ))
          )}
        </Section>
      ) : null}

      <Section
        title="Carrinho"
        actionLabel={cart.items.length ? 'Limpar' : undefined}
        onAction={async () => {
          if (await confirm('Limpar carrinho', 'Remover todos os itens da venda?', 'Limpar', true)) {
            dispatch({ type: 'clear' });
            setDiscountText('');
          }
        }}
      >
        {cart.items.length === 0 ? (
          <EmptyState
            icon="cart-outline"
            title="Carrinho vazio"
            message="Busque um produto acima ou toque no ícone de código de barras para ler pela câmera."
          />
        ) : (
          cart.items.map((item) => {
            const over = item.trackStock && item.quantity > item.stockQty;
            return (
              <Card key={item.productId} style={{ gap: spacing.sm }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm }}>
                  <View style={{ flex: 1 }}>
                    <Text bold numberOfLines={2}>{item.name}</Text>
                    <Text variant="caption" tone="muted">{formatBRL(item.unitPriceCents)} / {item.unit}</Text>
                  </View>
                  <Pressable
                    accessibilityLabel={`Remover ${item.name}`}
                    hitSlop={10}
                    onPress={() => dispatch({ type: 'remove', productId: item.productId })}
                  >
                    <Ionicons name="trash-outline" size={22} color={colors.danger} />
                  </Pressable>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <QuantityStepper
                    value={item.quantity}
                    unit={item.unit}
                    onChange={(q) => dispatch({ type: 'setQuantity', productId: item.productId, quantity: q })}
                  />
                  <Text bold>{formatBRL(lineTotal(item.unitPriceCents, item.quantity) - item.discountCents)}</Text>
                </View>
                {over ? (
                  <Text variant="caption" tone="danger">
                    Estoque disponível: {formatQuantity(item.stockQty, item.unit)}
                    {business.allow_negative_stock ? ' (estoque negativo permitido)' : ''}
                  </Text>
                ) : null}
              </Card>
            );
          })
        )}
      </Section>

      {cart.items.length > 0 ? (
        <Card style={{ gap: spacing.sm }}>
          <TextField
            label="Desconto na venda"
            mask="money"
            value={discountText}
            placeholder="0,00"
            hint={business.isManager ? undefined : `Vendedores podem dar até ${business.seller_max_discount_percent}% de desconto`}
            onChangeText={(t) => {
              setDiscountText(t);
              dispatch({ type: 'setDiscount', discountCents: parseBRL(t) ?? 0 });
            }}
          />
          <KeyValue label="Subtotal" value={formatBRL(totals.subtotalCents)} />
          {totals.discountCents + totals.itemsDiscountCents > 0 ? (
            <KeyValue label="Descontos" value={`-${formatBRL(totals.discountCents + totals.itemsDiscountCents)}`} tone="danger" />
          ) : null}
          <KeyValue label="Total" value={formatBRL(totals.totalCents)} tone="primary" />
        </Card>
      ) : null}

      <BarcodeScanner visible={scanning} onClose={() => setScanning(false)} onScanned={addByCode} />
    </Screen>
  );
}

