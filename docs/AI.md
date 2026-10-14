# Assistente Gestão Fácil IA

## Como funciona

```
App ──(pergunta + histórico curto, JWT do usuário)──▶ Edge Function ai-assistant
                                                        ├─ ai_reserve_request()  ← cota do plano (atômica)
                                                        ├─ Claude (Messages API, tool use, loop manual ≤ 6 rodadas)
                                                        │    └─ ferramentas ──▶ funções SQL com o JWT do usuário (RLS)
                                                        └─ ai_record_tokens()    ← custo registrado em ai_usage
```

- **Números determinísticos.** Toda conta é feita no PostgreSQL (`dashboard_summary`, `sales_report`,
  `finance_summary`, `expense_comparison`, `stock_recommendations`, `pricing_insights`, `customer_balances`,
  `business_alerts`). Antes de chegar ao modelo, os campos `*_cents` são convertidos em texto `"R$ 1.234,56"`
  (`humanizeForModel`), e o prompt proíbe refazer contas ou inventar valores.
- **Mesmas permissões do app.** A função consulta o banco com o token do próprio usuário: um vendedor não vê
  lucro/financeiro pela IA, e ninguém acessa dados de outro negócio.
- **Sem ações.** O assistente só consulta; não registra vendas, não altera preços e não envia mensagens.
- **Privacidade.** Telefones e ids internos não são enviados ao modelo. Nomes de clientes devedores e de
  produtos são enviados quando a pergunta exige (ver Política de Privacidade).
- **Chave secreta só no backend:** `ANTHROPIC_API_KEY` é um segredo da Edge Function, nunca do app.

## Modelo e custo

| Parâmetro | Valor | Motivo |
|---|---|---|
| Modelo | `claude-opus-5-5` | Modelo padrão atual da Anthropic |
| Esforço (`output_config.effort`) | `low` | Perguntas de chat; reduz custo e latência |
| Cache de prompt | automático (`cache_control`) | Prompt de sistema e ferramentas são fixos; data e negócio vão na mensagem |
| `fallbacks: "default"` | ativado | Se o modelo recusar por política, a API tenta o modelo recomendado |
| Rodadas de ferramentas | máx. 6 | Evita loops longos |
| Pergunta | máx. 1.000 caracteres; histórico máx. 10 mensagens de 2.000 caracteres | Limita tokens de entrada |
| Cota | `plans.ai_monthly_requests` (Pro: 200/mês por negócio; Grátis: 0) | Configurável no banco |

Perguntas que falham por erro da API são devolvidas à cota (`ai_refund_request`). O consumo de tokens por
negócio/usuário/mês fica em `ai_usage` para acompanhar o custo:

```sql
select b.name, u.period_month, sum(u.request_count) perguntas,
       sum(u.input_tokens) tokens_entrada, sum(u.output_tokens) tokens_saida
from ai_usage u join businesses b on b.id = u.business_id
group by 1, 2 order by 2 desc, 3 desc;
```

Para alterar a cota: `update plans set ai_monthly_requests = 300 where id = 'pro';`

## Configuração

```bash
npx supabase db push
npx supabase secrets set ANTHROPIC_API_KEY=<sua-chave>
npx supabase functions deploy ai-assistant
```

## Exemplos de perguntas

"Quanto vendi hoje?", "Qual foi meu lucro neste mês?", "Quais produtos estão acabando?", "Quem está me devendo?",
"Qual produto vende mais?", "Quais despesas aumentaram?", "Como posso melhorar minhas vendas?"

## Testes

- `src/__tests__/assistant.test.ts`: ferramentas com schema estrito, validação de períodos, parâmetros sempre
  com o negócio do usuário, remoção de telefones/ids, conversão de centavos, saneamento do histórico,
  prompt de sistema estável (sem data, para cache).
- `supabase/tests/30_reports_ai_documents.sql`: cálculos das funções usadas pela IA, cota (Grátis bloqueado,
  Pro limitado, excedente recusado), tokens só gravados pelo backend, vendedor sem acesso a lucro/alertas,
  intruso bloqueado.
- A chamada real ao Claude **não** é executada nos testes automatizados (exige chave e gera custo). Valide em
  staging com o roteiro: perguntar cada exemplo acima e conferir os números com a tela de Relatórios.
