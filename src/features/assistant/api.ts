import { useQuery } from '@tanstack/react-query';
import { FunctionsHttpError } from '@supabase/supabase-js';

import { AppError } from '@/lib/errors';
import { supabase, unwrap } from '@/lib/supabase';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AiUsage {
  limit: number;
  used: number;
  remaining: number;
}

export function useAiUsage(businessId: string) {
  return useQuery({
    queryKey: ['entitlements', businessId, 'ai-usage'],
    queryFn: async () => unwrap<AiUsage>(await supabase.rpc('ai_usage_status', { p_business_id: businessId })),
  });
}

/** Envia a pergunta ao backend (a chave da IA nunca fica no app). */
export async function askAssistant(
  businessId: string,
  question: string,
  history: ChatMessage[],
): Promise<{ answer: string; remaining: number | null }> {
  const { data, error } = await supabase.functions.invoke('ai-assistant', {
    body: { business_id: businessId, question, history },
  });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      let body: { error?: string; message?: string } = {};
      try {
        body = await (error.context as Response).json();
      } catch {
        // resposta sem JSON
      }
      throw new AppError(body.message ?? 'O assistente não pôde responder agora.', body.error);
    }
    throw new AppError('Não foi possível falar com o assistente. Verifique sua conexão.', 'network');
  }
  return data as { answer: string; remaining: number | null };
}

export const SUGGESTED_QUESTIONS = [
  'Quanto vendi hoje?',
  'Qual foi meu lucro neste mês?',
  'Quais produtos estão acabando?',
  'Quem está me devendo?',
  'Qual produto vende mais?',
  'Quais despesas aumentaram?',
  'Como posso melhorar minhas vendas?',
];
