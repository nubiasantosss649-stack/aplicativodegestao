import { useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Button, Card, Screen, Section, Text } from '@/components/ui';
import { spacing } from '@/theme/colors';
import { useTheme } from '@/theme/ThemeProvider';

const SUPPORT_EMAIL = 'suporte@gestaofacilia.com.br';

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
            Para exportação ou exclusão de dados (LGPD), envie uma solicitação para {SUPPORT_EMAIL}.
          </Text>
        </Pressable>
      </Section>
    </Screen>
  );
}
