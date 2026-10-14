/**
 * Lógica pura do Assistente Gestão Fácil IA (sem dependências do Deno/SDK),
 * coberta por testes unitários. Cada ferramenta corresponde a uma função SQL
 * determinística; a IA apenas interpreta e explica os resultados.
 */

export const ASSISTANT_MODEL = 'claude-opus-5-5';
export const MAX_TOOL_ROUNDS = 6;
export const MAX_QUESTION_CHARS = 1000;
export const MAX_HISTORY_MESSAGES = 10;

export const SYSTEM_PROMPT = `Você é o Assistente Gestão Fácil IA, que ajuda donos de pequenos negócios brasileiros (MEIs, mercadinhos, lojas, salões, prestadores de serviço) a entender seus números.

Como responder:
- Responda sempre em português do Brasil, com linguagem simples, direta e amigável, para quem não tem conhecimento técnico ou contábil.
- Use SOMENTE os dados retornados pelas ferramentas. Nunca invente, estime ou arredonde números que não vieram delas. Se a informação não estiver disponível, diga isso claramente e sugira onde o usuário pode registrá-la no aplicativo.
- Os valores em reais já chegam formatados (ex.: "R$ 1.234,56"); repita-os exatamente. Não refaça contas que as ferramentas já fizeram. Quando precisar comparar, use os percentuais e diferenças fornecidos.
- Diferencie faturamento (total vendido, inclui fiado), valor recebido (dinheiro que entrou) e lucro estimado (faturamento − custo dos produtos − despesas).
- Escolha o período adequado à pergunta (hoje, este mês, últimos 7 dias). Se o período não estiver claro, use o mês atual e diga qual período usou.
- Se uma ferramenta retornar erro de permissão, explique que a informação é restrita ao dono ou gerente do negócio.
- Para pedidos de dicas (melhorar vendas, economizar, precificar), baseie as sugestões nos dados consultados e deixe claro o que é sugestão. Não dê aconselhamento jurídico, contábil ou de investimentos.
- Seja breve: até 3 parágrafos curtos ou uma lista de no máximo 6 itens, salvo se o usuário pedir detalhes. Não use tabelas nem títulos em markdown.
- Você não executa ações (não registra vendas, não altera preços, não envia mensagens); apenas consulta e explica.`;

interface JsonSchema {
  type: 'object';
  properties: Record<string, unknown>;
  required: string[];
  additionalProperties: false;
}

export interface ToolSpec {
  name: string;
  description: string;
  input_schema: JsonSchema;
  rpc: string;
  params: (businessId: string, input: Record<string, unknown>) => Record<string, unknown>;
  /** Pós-processamento opcional para reduzir o tamanho da resposta */
  shape?: (data: unknown) => unknown;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const periodSchema: JsonSchema = {
  type: 'object',
  properties: {
    data_inicio: { type: 'string', description: 'Data inicial no formato AAAA-MM-DD' },
    data_fim: { type: 'string', description: 'Data final no formato AAAA-MM-DD (inclusive)' },
  },
  required: ['data_inicio', 'data_fim'],
  additionalProperties: false,
};

const noParams: JsonSchema = { type: 'object', properties: {}, required: [], additionalProperties: false };

export class ToolInputError extends Error {}

export function validatePeriod(input: Record<string, unknown>): { from: string; to: string } {
  const from = String(input.data_inicio ?? '');
  const to = String(input.data_fim ?? '');
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) throw new ToolInputError('Datas devem estar no formato AAAA-MM-DD.');
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) throw new ToolInputError('Data inválida.');
  if (b < a) throw new ToolInputError('A data final deve ser igual ou posterior à inicial.');
  if ((b - a) / 86_400_000 > 366) throw new ToolInputError('O período máximo é de 1 ano.');
  return { from, to };
}

function topN(list: unknown, n: number): unknown {
  return Array.isArray(list) ? list.slice(0, n) : list;
}

export const TOOLS: ToolSpec[] = [
  {
    name: 'resumo_vendas',
    description:
      'Resumo do negócio em um período: vendas de hoje, faturamento, recebido, despesas, lucro estimado, fiados a receber e vencidos, estoque baixo, vendas por dia e produtos mais vendidos.',
    input_schema: periodSchema,
    rpc: 'dashboard_summary',
    params: (bid, i) => {
      const p = validatePeriod(i);
      return { p_business_id: bid, p_from: p.from, p_to: p.to };
    },
    shape: (d) => {
      const x = { ...(d as Record<string, unknown>) };
      delete x.recent;
      return x;
    },
  },
  {
    name: 'relatorio_vendas',
    description:
      'Relatório detalhado de vendas no período: por produto (quantidade, faturamento, lucro e margem), por categoria, forma de pagamento, dia da semana (1=segunda ... 7=domingo), hora, melhores clientes e comparação com o período anterior de mesmo tamanho.',
    input_schema: periodSchema,
    rpc: 'sales_report',
    params: (bid, i) => {
      const p = validatePeriod(i);
      return { p_business_id: bid, p_from: p.from, p_to: p.to };
    },
    shape: (d) => {
      const x = { ...(d as Record<string, unknown>) };
      x.by_product = topN(x.by_product, 15);
      return x;
    },
  },
  {
    name: 'resumo_financeiro',
    description:
      'Fluxo de caixa e resultado no período: entradas por origem, saídas, saldo, faturamento, custo das mercadorias, lucro bruto, despesas, lucro estimado, despesas por categoria e contas a pagar. Restrito a dono/gerente.',
    input_schema: periodSchema,
    rpc: 'finance_summary',
    params: (bid, i) => {
      const p = validatePeriod(i);
      return { p_business_id: bid, p_from: p.from, p_to: p.to };
    },
  },
  {
    name: 'comparar_despesas',
    description:
      'Compara as despesas do mês atual com o mês anterior por categoria (valor, diferença e variação percentual). Restrito a dono/gerente.',
    input_schema: noParams,
    rpc: 'expense_comparison',
    params: (bid) => ({ p_business_id: bid }),
  },
  {
    name: 'recomendacoes_estoque',
    description:
      'Produtos que precisam de atenção no estoque: sem estoque, abaixo do mínimo, acabando (menos de 7 dias de cobertura) ou parados sem venda há 60 dias, com quantidade sugerida de reposição baseada nas vendas dos últimos 30 dias.',
    input_schema: noParams,
    rpc: 'stock_recommendations',
    params: (bid) => ({ p_business_id: bid }),
    shape: (d) => {
      const x = { ...(d as Record<string, unknown>) };
      x.items = topN(x.items, 25);
      return x;
    },
  },
  {
    name: 'analise_precos',
    description:
      'Análise de precificação: produtos vendidos abaixo do custo, com margem abaixo da meta e sem custo cadastrado, com preço sugerido para atingir a margem alvo. Restrito a dono/gerente.',
    input_schema: {
      type: 'object',
      properties: {
        margem_alvo: { type: 'number', description: 'Margem de lucro desejada sobre o preço, em %, entre 1 e 90. Use 30 se o usuário não informar.' },
      },
      required: ['margem_alvo'],
      additionalProperties: false,
    },
    rpc: 'pricing_insights',
    params: (bid, i) => {
      const m = Number(i.margem_alvo);
      if (!Number.isFinite(m) || m < 1 || m > 90) throw new ToolInputError('Margem alvo deve estar entre 1 e 90.');
      return { p_business_id: bid, p_target_margin: m };
    },
    shape: (d) => {
      const x = { ...(d as Record<string, unknown>) };
      x.below_cost = topN(x.below_cost, 15);
      x.low_margin = topN(x.low_margin, 15);
      x.missing_cost = topN(x.missing_cost, 15);
      return x;
    },
  },
  {
    name: 'clientes_devedores',
    description: 'Clientes com fiado em aberto: saldo devedor, valor vencido, vencimento mais antigo, total já comprado e última compra.',
    input_schema: noParams,
    rpc: 'customer_balances',
    params: (bid) => ({ p_business_id: bid }),
    shape: (d) =>
      (Array.isArray(d) ? d : [])
        .filter((c) => Number((c as Record<string, unknown>).balance_cents) > 0)
        .sort((a, b) => Number((b as Record<string, unknown>).balance_cents) - Number((a as Record<string, unknown>).balance_cents))
        .slice(0, 20)
        .map((c) => {
          const x = { ...(c as Record<string, unknown>) };
          delete x.phone; // dado pessoal desnecessário para a análise
          delete x.customer_id;
          return x;
        }),
  },
  {
    name: 'alertas_negocio',
    description:
      'Alertas de possíveis prejuízos calculados por regras: vendas e preços abaixo do custo, despesas em alta, prejuízo no mês, fiados e contas vencidas, descontos elevados, produtos procurados sem estoque e estoque parado. Restrito a dono/gerente.',
    input_schema: noParams,
    rpc: 'business_alerts',
    params: (bid) => ({ p_business_id: bid }),
  },
];

export function findTool(name: string): ToolSpec | undefined {
  return TOOLS.find((t) => t.name === name);
}

/** Definições enviadas à API (sem os campos internos), com schema estrito. */
export function apiToolDefinitions() {
  return TOOLS.map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema, strict: true }));
}

const THOUSANDS = /\B(?=(\d{3})+(?!\d))/g;

export function formatBRL(cents: number): string {
  const v = Math.round(cents);
  const abs = Math.abs(v);
  const reais = Math.floor(abs / 100).toString().replace(THOUSANDS, '.');
  return `${v < 0 ? '-' : ''}R$ ${reais},${(abs % 100).toString().padStart(2, '0')}`;
}

/**
 * Converte recursivamente campos *_cents em textos "R$ x" (campo sem o
 * sufixo), para que a IA nunca precise fazer contas com centavos.
 * Remove identificadores internos (uuid) que não ajudam a resposta.
 */
export function humanizeForModel(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(humanizeForModel);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k === 'id' || k.endsWith('_id')) continue;
      if (k.endsWith('_cents')) {
        out[k.slice(0, -'_cents'.length)] = v == null ? null : formatBRL(Number(v));
      } else {
        out[k] = humanizeForModel(v);
      }
    }
    return out;
  }
  return value;
}

export interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** Sanitiza o histórico vindo do app (somente texto, tamanho limitado, alternância válida). */
export function sanitizeHistory(raw: unknown): HistoryMessage[] {
  if (!Array.isArray(raw)) return [];
  const msgs = raw
    .filter(
      (m): m is HistoryMessage =>
        !!m && typeof m === 'object' && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string',
    )
    .map((m) => ({ role: m.role, content: m.content.trim().slice(0, 2000) }))
    .filter((m) => m.content.length > 0)
    .slice(-MAX_HISTORY_MESSAGES);
  // A conversa precisa começar pelo usuário e alternar papéis
  const out: HistoryMessage[] = [];
  for (const m of msgs) {
    if (out.length === 0 && m.role !== 'user') continue;
    if (out.length > 0 && out[out.length - 1]!.role === m.role) continue;
    out.push(m);
  }
  // A última do histórico deve ser do assistente (a nova pergunta vem em seguida)
  if (out.length > 0 && out[out.length - 1]!.role === 'user') out.pop();
  return out;
}

/** Contexto variável (data e negócio) enviado junto da pergunta, fora do prompt de sistema (preserva o cache). */
export function contextPreamble(today: string, businessName: string, role: string): string {
  return `[Contexto] Hoje é ${today}. Negócio: ${businessName}. Papel do usuário: ${role}.`;
}
