import { useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Button, Card, Screen, Section, Text } from '@/components/ui';
import { SUPPORT_EMAIL } from '@/content/legal';
import { spacing } from '@/theme/colors';
import { useTheme } from '@/theme/ThemeProvider';


const FAQ = [
  {
    q: 'Como faço uma venda?',
    a: 'Toque em “Vender”, busque o produto (ou leia o código de barras), ajuste as quantidades e toque em “Ir para pagamento”. Escolha a forma de pagamento e finalize.',
  },
  {
    q: 'Como vender fiado?',
    a: 'No pagamento, selecione o cliente e escolha “Fiado” (ou um pagamento misto com parte fiado). O valor vai para Fiados e só conta como recebido quando o cliente pagar.',
  },
  {
    q: 'Como registrar o pagamento de um fiado?',
    a: 'Em Mais → Fiados, abra o cliente e toque em “Registrar pagamento”. Pode ser parcial; o valor abate primeiro os fiados mais antigos.',
  },
  {
    q: 'Errei uma venda. E agora?',
    a: 'Abra a venda no Histórico e toque em “Cancelar venda”, informando o motivo. O estoque é devolvido automaticamente e o cancelamento fica registrado.',
  },
  {
    q: 'Como dar entrada em mercadoria?',
    a: 'Abra o produto e toque em “Movimentar estoque” → “Entrada de mercadoria”. Para corrigir contagens use “Ajuste”, informando a justificativa.',
  },
  {
    q: 'Qual a diferença entre faturamento, recebido e lucro?',
    a: 'Faturamento é o total vendido (inclui fiado). Recebido é o dinheiro que realmente entrou. Lucro estimado é o faturamento menos o custo dos produtos e as despesas.',
  },
  {
    q: 'Como funciona o Plano Pro?',
    a: 'O Plano Grátis permite até 30 produtos ativos e 50 vendas por mês. O Pro IA libera produtos e vendas ilimitados, relatórios e cobranças pelo WhatsApp. A assinatura é feita e cancelada pela Google Play ou App Store. Se cancelar, seus dados continuam salvos e visíveis.',
  },
  {
    q: 'Troquei de celular. Como recupero minha assinatura?',
    a: 'Entre com a mesma conta e use Mais → Plano e assinatura → Restaurar compras (com a mesma conta da loja usada na compra).',
  },
  {
    q: 'O comprovante tem valor fiscal?',
    a: 'Não. O app gera comprovantes não fiscais. Se o seu negócio precisa emitir nota fiscal, utilize o emissor oficial.',
  },
];

export default function Help() {
  const { colors } = useTheme();
  const [open, setOpen] = useState<number | null>(0);
  return (
    <Screen>
      <Section title="Perguntas frequentes">
        {FAQ.map((f, i) => (
          <Card key={f.q} onPress={() => setOpen(open === i ? null : i)} style={{ gap: spacing.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <Text bold style={{ flex: 1 }}>{f.q}</Text>
              <Ionicons name={open === i ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
            </View>
            {open === i ? <Text tone="muted">{f.a}</Text> : null}
          </Card>
        ))}
      </Section>
      <Section title="Fale com a gente">
        <Button
          title="Enviar e-mail ao suporte"
          icon="mail"
          variant="secondary"
          onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Suporte Gestão Fácil IA')}`)}
        />
        <Pressable onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Solicitação LGPD')}`)}>
          <Text variant="caption" tone="muted" center>
            Exporte seus dados em Configurações → Exportar meus dados e exclua a conta em Configurações → Excluir minha conta.
            Outras solicitações de privacidade (LGPD): {SUPPORT_EMAIL}.
          </Text>
        </Pressable>
      </Section>
    </Screen>
  );
}
