import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ProGate } from '@/components/ProGate';
import { Badge, Chips, Screen, Text } from '@/components/ui';
import { SUGGESTED_QUESTIONS, askAssistant, useAiUsage, type ChatMessage } from '@/features/assistant/api';
import { errorMessage } from '@/lib/errors';
import { useCurrentBusiness } from '@/providers/BusinessProvider';
import { radius, spacing } from '@/theme/colors';
import { useTheme } from '@/theme/ThemeProvider';

function Chat() {
  const business = useCurrentBusiness();
  const { colors } = useTheme();
  const qc = useQueryClient();
  const usage = useAiUsage(business.id);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scroll = useRef<ScrollView>(null);

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || sending) return;
    setError(null);
    setInput('');
    const history = messages;
    setMessages([...history, { role: 'user', content: question }]);
    setSending(true);
    try {
      const { answer } = await askAssistant(business.id, question, history);
      setMessages((m) => [...m, { role: 'assistant', content: answer }]);
    } catch (e) {
      setError(errorMessage(e));
      // remove a pergunta sem resposta para manter o histórico consistente
      setMessages(history);
      setInput(question);
    } finally {
      setSending(false);
      qc.invalidateQueries({ queryKey: ['entitlements', business.id, 'ai-usage'] });
    }
  };

  const remaining = usage.data?.remaining;

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: colors.background }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
        <ScrollView
          ref={scroll}
          contentContainerStyle={styles.list}
          onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
          keyboardShouldPersistTaps="handled"
        >
          {messages.length === 0 ? (
            <View style={{ gap: spacing.md }}>
              <View style={[styles.hello, { backgroundColor: colors.primarySoft }]}>
                <Ionicons name="sparkles" size={28} color={colors.primary} />
                <Text variant="subtitle">Olá! Sou o Assistente Gestão Fácil IA.</Text>
                <Text tone="muted">
                  Pergunte sobre vendas, lucro, estoque, fiados e despesas. Eu consulto os dados do seu negócio e explico os números.
                </Text>
              </View>
              <Text variant="label">Experimente perguntar:</Text>
              <View style={styles.suggestions}>
                <Chips
                  scroll={false}
                  options={SUGGESTED_QUESTIONS.map((q) => ({ value: q, label: q }))}
                  value={null}
                  onChange={send}
                />
              </View>
            </View>
          ) : (
            messages.map((m, i) => (
              <View
                key={i}
                style={[
                  styles.bubble,
                  m.role === 'user'
                    ? { alignSelf: 'flex-end', backgroundColor: colors.primary }
                    : { alignSelf: 'flex-start', backgroundColor: colors.surface, borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth },
                ]}
              >
                <Text selectable style={{ color: m.role === 'user' ? colors.onPrimary : colors.text }}>
                  {m.content}
                </Text>
              </View>
            ))
          )}
          {sending ? (
            <View style={[styles.bubble, { alignSelf: 'flex-start', backgroundColor: colors.surface, flexDirection: 'row', gap: 8 }]}>
              <ActivityIndicator color={colors.primary} />
              <Text tone="muted">Consultando seus dados...</Text>
            </View>
          ) : null}
          {error ? <Text tone="danger">{error}</Text> : null}
        </ScrollView>

        <View style={[styles.inputBar, { borderTopColor: colors.border, backgroundColor: colors.surface }]}>
          <View style={styles.meta}>
            <Text variant="caption" tone="muted">Respostas geradas por IA com base nos seus dados. Confira valores importantes nos relatórios.</Text>
            {remaining != null ? <Badge label={`${remaining} perguntas restantes no mês`} tone={remaining > 10 ? 'primary' : 'warning'} /> : null}
          </View>
          <View style={styles.row}>
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder="Escreva sua pergunta..."
              placeholderTextColor={colors.textMuted}
              multiline
              maxLength={1000}
              accessibilityLabel="Pergunta para o assistente"
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Enviar pergunta"
              disabled={!input.trim() || sending || remaining === 0}
              onPress={() => send(input)}
              style={[styles.send, { backgroundColor: colors.primary, opacity: !input.trim() || sending || remaining === 0 ? 0.5 : 1 }]}
            >
              <Ionicons name="send" size={20} color="#fff" />
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export default function AssistantScreen() {
  return (
    <ProGateScreen>
      <Chat />
    </ProGateScreen>
  );
}

function ProGateScreen({ children }: { children: React.ReactNode }) {
  const business = useCurrentBusiness();
  const usage = useAiUsage(business.id);
  if (usage.data && usage.data.limit > 0) return <>{children}</>;
  return (
    <Screen>
      <ProGate
        feature="ai_assistant"
        title="Assistente Gestão Fácil IA"
        description="Pergunte em português “Quanto vendi hoje?”, “Quem está me devendo?” ou “Como posso melhorar minhas vendas?” e receba respostas com base nos números reais do seu negócio."
      >
        {children}
      </ProGate>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.lg, gap: spacing.sm, maxWidth: 760, width: '100%', alignSelf: 'center', flexGrow: 1 },
  hello: { borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
  suggestions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  bubble: { maxWidth: '88%', padding: spacing.md, borderRadius: radius.lg },
  inputBar: { borderTopWidth: StyleSheet.hairlineWidth, padding: spacing.md, gap: spacing.sm },
  meta: { gap: 4, maxWidth: 760, width: '100%', alignSelf: 'center' },
  row: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-end', maxWidth: 760, width: '100%', alignSelf: 'center' },
  input: { flex: 1, minHeight: 48, maxHeight: 140, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 12, fontSize: 16 },
  send: { width: 48, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
});
