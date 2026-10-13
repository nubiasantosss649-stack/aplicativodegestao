import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { FlatList, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Text, type IconName } from '@/components/ui';
import { prefs } from '@/lib/storage';
import { spacing } from '@/theme/colors';
import { useTheme } from '@/theme/ThemeProvider';

const SLIDES: { icon: IconName; title: string; text: string }[] = [
  {
    icon: 'storefront',
    title: 'Seu negócio organizado',
    text: 'Vendas, estoque, clientes e fiados em um só lugar — simples, mesmo sem experiência com tecnologia.',
  },
  {
    icon: 'cart',
    title: 'Venda rápida',
    text: 'Busque produtos ou leia o código de barras, receba em dinheiro, Pix, cartão ou fiado e gere o comprovante.',
  },
  {
    icon: 'people',
    title: 'Fiado sob controle',
    text: 'Saiba quem está devendo, receba parcelas e envie a cobrança pelo WhatsApp com um toque.',
  },
  {
    icon: 'trending-up',
    title: 'Suas vendas crescendo',
    text: 'Acompanhe faturamento, despesas e lucro estimado com números reais do seu negócio.',
  },
];

export default function Welcome() {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const listRef = useRef<FlatList>(null);

  const goTo = (i: number) => {
    setIndex(i);
    listRef.current?.scrollToOffset({ offset: i * width, animated: true });
  };

  const finish = async (to: '/sign-up' | '/sign-in') => {
    await prefs.set('welcome-seen', '1');
    router.replace(to);
  };

  const last = index === SLIDES.length - 1;

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: colors.primary }]}>
      <View style={styles.brand}>
        <Text variant="title" tone="onPrimary">
          Gestão Fácil IA
        </Text>
        <Text tone="onPrimary" style={{ opacity: 0.85 }}>
          Seu negócio organizado, suas vendas crescendo.
        </Text>
      </View>
      <FlatList
        ref={listRef}
        data={SLIDES}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(s) => s.title}
        scrollEventThrottle={32}
        onScroll={(e) => {
          const i = Math.round(e.nativeEvent.contentOffset.x / width);
          if (i !== index && i >= 0 && i < SLIDES.length) setIndex(i);
        }}
        renderItem={({ item }) => (
          <View style={[styles.slide, { width }]}>
            <View style={styles.iconCircle}>
              <Ionicons name={item.icon} size={64} color="#fff" />
            </View>
            <Text variant="title" tone="onPrimary" center>
              {item.title}
            </Text>
            <Text tone="onPrimary" center style={{ opacity: 0.9, maxWidth: 420 }}>
              {item.text}
            </Text>
          </View>
        )}
      />
      <View style={styles.dots}>
        {SLIDES.map((s, i) => (
          <View key={s.title} style={[styles.dot, { opacity: i === index ? 1 : 0.35, width: i === index ? 22 : 8 }]} />
        ))}
      </View>
      <View style={[styles.actions, { backgroundColor: colors.surface }]}>
        {last ? (
          <>
            <Button title="Criar minha conta grátis" icon="rocket" onPress={() => finish('/sign-up')} />
            <Button title="Já tenho conta" variant="ghost" onPress={() => finish('/sign-in')} />
          </>
        ) : (
          <>
            <Button
              title="Continuar"
              icon="arrow-forward"
              onPress={() => goTo(Math.min(index + 1, SLIDES.length - 1))}
            />
            <Button title="Pular" variant="ghost" onPress={() => finish('/sign-in')} />
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  brand: { padding: spacing.xl, gap: spacing.xs },
  slide: { alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.lg },
  iconCircle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, paddingVertical: spacing.lg },
  dot: { height: 8, borderRadius: 4, backgroundColor: '#fff' },
  actions: { padding: spacing.xl, gap: spacing.sm, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
});
