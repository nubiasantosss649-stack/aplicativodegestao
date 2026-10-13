# Arquitetura — Gestão Fácil IA

## Visão geral

```
┌──────────────────────────────┐        HTTPS (JWT do usuário)        ┌──────────────────────────────┐
│  App Expo (React Native/TS)  │ ───────────────────────────────────▶ │  Supabase                    │
│  • Expo Router (telas)       │   PostgREST: leituras com RLS        │  • Auth (e-mail/senha, PKCE) │
│  • TanStack Query (cache)    │   RPC: operações transacionais       │  • PostgreSQL + RLS          │
│  • RHF + Zod (formulários)   │   Storage: fotos (bucket privado)    │  • Storage                   │
│  • SecureStore (sessão)      │                                      │  • Edge Functions (Fase 2/3) │
└──────────────────────────────┘                                      └──────────────────────────────┘
                                                                         ▲ webhooks (Fase 2: RevenueCat)
                                                                         ▲ IA via backend (Fase 3)
```

Princípios:

1. **O banco é a fonte da verdade.** Toda regra que envolve dinheiro, estoque ou permissões roda no PostgreSQL
   (funções `SECURITY DEFINER` com `search_path` vazio), nunca só no app.
2. **Escrita crítica só por RPC.** O papel `authenticated` não tem `INSERT/UPDATE` em `sales`, `sale_items`,
   `sale_payments`, `stock_movements`, `receivable_payments`, nem na coluna `products.stock_qty`.
3. **Atomicidade e idempotência.** Vendas, recebimentos e movimentações de estoque recebem uma chave de
   idempotência (UUID gerado no app). Repetir a chamada devolve o mesmo resultado sem duplicar.
4. **Preço vem do banco.** O app envia apenas `product_id`, quantidade e desconto; preço e custo são lidos do
   banco no momento da venda. Descontos acima do limite do vendedor são recusados.
5. **Centavos inteiros.** Dinheiro é `bigint` em centavos; quantidades são `numeric(14,3)`.
6. **Nenhum segredo no app.** Somente URL e chave pública (anon) do Supabase. Chaves de IA, RevenueCat
   (webhook secret) e `service_role` ficam em Edge Functions.

## Estrutura de pastas

```
src/
  app/                     # Rotas (Expo Router) — cada arquivo é uma tela
    _layout.tsx            # Providers + guardas de navegação (Stack.Protected)
    welcome.tsx            # Apresentação inicial
    (auth)/                # Login, cadastro, recuperação de senha
    auth/callback.tsx      # Retorno dos links de e-mail (PKCE)
    reset-password.tsx     # Nova senha
    business-setup.tsx     # Cadastro do negócio
    terms.tsx, privacy.tsx # Termos e privacidade (minutas)
    (app)/                 # Área autenticada com negócio
      (tabs)/              # Início (dashboard), Vender, Produtos, Clientes, Mais
      products/ sales/ customers/ receivables/ finance/ settings/ stock.tsx help.tsx
  components/              # Componentes de tela reutilizáveis (formulários, scanner, filtros)
    ui/                    # Design system (Button, Card, TextField, StatCard, BarChart, Toast...)
  features/<módulo>/       # api.ts (queries/mutations), lógica pura (cart, charge, receipt)
  features/schemas.ts      # Schemas Zod dos formulários
  lib/                     # money, documents (CPF/CNPJ), dates, errors, supabase, storage seguro
  providers/               # Auth, Business (negócio/papel atual), Cart
  theme/                   # Paleta (azul royal, verde, vermelho, cinzas) e modo claro/escuro
  types/database.ts        # Tipos das tabelas
  __tests__/               # Testes unitários (Jest)
supabase/
  migrations/              # Esquema, RLS, funções, storage
  tests/                   # Testes SQL de integração (RLS, atomicidade, idempotência)
scripts/test-db.sh         # Sobe um Postgres descartável e roda migrations + testes
docs/                      # Esta documentação
```

## Papéis e permissões

| Papel    | Vender | Clientes | Receber fiado | Produtos/estoque | Cancelar venda / estornar | Financeiro |
|----------|:------:|:--------:|:-------------:|:----------------:|:-------------------------:|:----------:|
| owner    | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| manager  | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| seller   | ✔ (desconto limitado) | ✔ | ✔ | leitura | ✖ | ✖ (dashboard sem lucro/despesas) |

A gestão de membros (convidar vendedores) está prevista para uma fase posterior; o esquema já suporta.

## Conceitos financeiros

| Indicador | Definição |
|---|---|
| Faturamento | Soma das vendas concluídas no período (inclui fiado) |
| Recebido | Pagamentos no ato (exceto fiado) + recebimentos de fiado (não estornados) + receitas avulsas pagas |
| CMV | Custo dos produtos vendidos, congelado no momento da venda |
| Despesas | Lançamentos de despesa não cancelados por data de competência |
| Lucro estimado | Faturamento − CMV − Despesas |
| Fluxo de caixa | Entradas efetivas − despesas efetivamente pagas |

Uma venda fiado **nunca** conta como dinheiro recebido até o pagamento ser registrado.

## Plano de fases

- **Fase 1 (esta entrega):** estrutura, design, navegação, autenticação, banco + RLS, negócio, produtos e
  estoque, clientes, vendas, fiados, financeiro básico, dashboard, testes.
- **Fase 2:** planos Grátis/Pro, RevenueCat (Android/iOS), paywall, teste grátis, limites por plano no banco,
  restauração de compras, webhook seguro (Edge Function) gravando em `subscriptions`.
- **Fase 3:** Assistente IA (Edge Function + consultas determinísticas + controle de cota em `ai_usage`),
  relatórios avançados, exportação PDF/Excel, recibos e orçamentos, sugestões.
- **Fase 4:** builds EAS, ícone/splash finais, capturas, políticas revisadas, exclusão de conta (Edge Function),
  testes de segurança, publicação.
