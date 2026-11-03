// Edge Function: Assistente Gestão Fácil IA.
// - Autentica o usuário (JWT do Supabase) e consulta os dados SEMPRE com o
//   token dele: as funções SQL aplicam as mesmas regras de acesso do app.
// - Números vêm de funções SQL determinísticas; o modelo só interpreta.
// - Cota mensal por plano (ai_reserve_request) e registro de tokens.
// Segredos: ANTHROPIC_API_KEY (obrigatório).
// Deploy: supabase functions deploy ai-assistant
import Anthropic from 'npm:@anthropic-ai/sdk';
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

import {
  ASSISTANT_MODEL,
  MAX_QUESTION_CHARS,
  MAX_TOOL_ROUNDS,
  SYSTEM_PROMPT,
  ToolInputError,
  apiToolDefinitions,
  contextPreamble,
  findTool,
  humanizeForModel,
  sanitizeHistory,
} from '../_shared/assistant.ts';
import { corsHeaders, json } from '../_shared/http.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const admin = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});
const anthropic = new Anthropic(); // lê ANTHROPIC_API_KEY do ambiente

const ROLE_LABELS: Record<string, string> = { owner: 'dono', manager: 'gerente', seller: 'vendedor' };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function runTool(
  userDb: SupabaseClient,
  businessId: string,
  name: string,
  input: unknown,
): Promise<{ content: string; isError: boolean }> {
  const spec = findTool(name);
  if (!spec) return { content: `Ferramenta desconhecida: ${name}`, isError: true };
  try {
    const params = spec.params(businessId, (input ?? {}) as Record<string, unknown>);
    const { data, error } = await userDb.rpc(spec.rpc, params);
    if (error) {
      const denied = error.code === '42501';
      return {
        content: denied ? 'Sem permissão: informação restrita ao dono ou gerente do negócio.' : `Erro ao consultar: ${error.message}`,
        isError: true,
      };
    }
    const shaped = spec.shape ? spec.shape(data) : data;
    return { content: JSON.stringify(humanizeForModel(shaped)), isError: false };
  } catch (e) {
    if (e instanceof ToolInputError) return { content: e.message, isError: true };
    throw e;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const authHeader = req.headers.get('authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const { data: auth, error: authError } = await admin.auth.getUser(token);
  if (authError || !auth.user) return json({ error: 'unauthorized' }, 401);
  const userId = auth.user.id;

  let body: { business_id?: string; question?: string; history?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }
  const businessId = String(body.business_id ?? '');
  const question = String(body.question ?? '').trim();
  if (!UUID_RE.test(businessId)) return json({ error: 'invalid_business' }, 400);
  if (!question || question.length > MAX_QUESTION_CHARS) {
    return json({ error: 'invalid_question', message: `Escreva uma pergunta de até ${MAX_QUESTION_CHARS} caracteres.` }, 400);
  }

  // Cliente com o token do usuário: RLS e verificações de papel valem para a IA
  const userDb = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });

  const { data: membership } = await userDb
    .from('business_members')
    .select('role, businesses(name, timezone)')
    .eq('business_id', businessId)
    .eq('user_id', userId)
    .maybeSingle();
  if (!membership) return json({ error: 'forbidden' }, 403);
  const biz = membership.businesses as unknown as { name: string; timezone: string };

  // Reserva a pergunta na cota mensal (verifica o plano Pro)
  const { data: quota, error: quotaError } = await userDb.rpc('ai_reserve_request', { p_business_id: businessId });
  if (quotaError) {
    const hint = (quotaError as { hint?: string }).hint;
    if (hint === 'ai_not_in_plan' || hint === 'ai_quota_exceeded') {
      return json({ error: hint, message: quotaError.message }, 402);
    }
    return json({ error: 'quota_check_failed' }, 500);
  }

  const today = new Intl.DateTimeFormat('en-CA', { timeZone: biz.timezone || 'America/Sao_Paulo' }).format(new Date());
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...sanitizeHistory(body.history).map((m) => ({ role: m.role, content: m.content })),
    {
      role: 'user',
      content: `${contextPreamble(today, biz.name, ROLE_LABELS[membership.role] ?? membership.role)}\n\n${question}`,
    },
  ];

  const toolsUsed: string[] = [];
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response = await anthropic.beta.messages.create({
        model: ASSISTANT_MODEL,
        max_tokens: 16000,
        // Chat simples: esforço baixo reduz custo e latência
        output_config: { effort: 'low' },
        // Prompt de sistema e ferramentas fixos => cache de prompt
        cache_control: { type: 'ephemeral' },
        system: SYSTEM_PROMPT,
        tools: apiToolDefinitions() as Anthropic.Beta.BetaTool[],
        messages,
        // Se o modelo recusar por política, a API tenta o modelo recomendado
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
      } as unknown as Anthropic.Beta.MessageCreateParamsNonStreaming);

      inputTokens += (response.usage.input_tokens ?? 0) + (response.usage.cache_read_input_tokens ?? 0) +
        (response.usage.cache_creation_input_tokens ?? 0);
      outputTokens += response.usage.output_tokens ?? 0;

      if (response.stop_reason === 'refusal') {
        return finish(
          'Não posso ajudar com esse pedido. Pergunte sobre vendas, estoque, clientes, fiados ou finanças do seu negócio.',
        );
      }

      const toolUses = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use');

      if (response.stop_reason !== 'tool_use' || toolUses.length === 0) {
        const answer = response.content
          .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
          .map((b) => b.text)
          .join('\n')
          .trim();
        if (response.stop_reason === 'max_tokens' && !answer) {
          return finish('A resposta ficou longa demais. Tente uma pergunta mais específica.');
        }
        return finish(answer || 'Não consegui formular uma resposta. Tente reformular a pergunta.');
      }

      messages.push({ role: 'assistant', content: response.content });
      const results: Anthropic.Beta.BetaToolResultBlockParam[] = await Promise.all(
        toolUses.map(async (t) => {
          toolsUsed.push(t.name);
          const r = await runTool(userDb, businessId, t.name, t.input);
          return { type: 'tool_result' as const, tool_use_id: t.id, content: r.content, is_error: r.isError };
        }),
      );
      messages.push({ role: 'user', content: results });
    }
    return finish('Essa pergunta exigiu consultas demais. Tente dividir em perguntas menores.');
  } catch (e) {
    // Falha ao falar com a IA: devolve a pergunta à cota
    await admin.rpc('ai_refund_request', { p_business_id: businessId, p_user_id: userId });
    if (e instanceof Anthropic.RateLimitError) {
      return json({ error: 'ai_busy', message: 'O assistente está ocupado. Tente novamente em instantes.' }, 503);
    }
    if (e instanceof Anthropic.APIError) {
      console.error('anthropic', e.status, e.message);
      return json({ error: 'ai_unavailable', message: 'O assistente está indisponível no momento.' }, 502);
    }
    console.error('ai-assistant', (e as Error).message);
    return json({ error: 'internal_error' }, 500);
  }

  async function finish(answer: string): Promise<Response> {
    await admin.rpc('ai_record_tokens', {
      p_business_id: businessId,
      p_user_id: userId,
      p_input: inputTokens,
      p_output: outputTokens,
    });
    return json({
      answer,
      tools_used: [...new Set(toolsUsed)],
      remaining: (quota as { remaining?: number } | null)?.remaining ?? null,
    });
  }
});
