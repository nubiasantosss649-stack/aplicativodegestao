# Banco de dados

Migrations em `supabase/migrations` (aplicadas em ordem):

| Arquivo | Conteúdo |
|---|---|
| `…0100_core_schema.sql` | Tipos, tabelas, índices, gatilhos `updated_at`, criação automática de perfil |
| `…0200_rls_and_grants.sql` | RLS em todas as tabelas, privilégios por coluna, funções de autorização |
| `…0300_business_functions.sql` | RPCs transacionais e relatórios |
| `…0400_storage.sql` | Bucket privado `product-photos` e políticas por negócio |

## Tabelas

| Tabela | Finalidade |
|---|---|
| `profiles` | Perfil 1:1 com `auth.users` |
| `businesses` | Negócio (CPF/CNPJ opcional, fuso, regras de venda) |
| `business_members` | Permissões (owner/manager/seller) |
| `product_categories`, `products` | Catálogo; `stock_qty` só muda via função |
| `stock_movements` | Razão de estoque (inicial, entrada, ajuste, venda, cancelamento) com saldo após |
| `customers` | Clientes (dados mínimos, LGPD) |
| `sales`, `sale_items`, `sale_payments` | Vendas com snapshot de preço/custo e formas de pagamento |
| `receivables`, `receivable_payments` | Fiados, parcelas recebidas e estornos |
| `finance_categories`, `financial_entries` | Receitas avulsas, despesas e contas a pagar |
| `quotes`, `quote_items`, `documents` | Orçamentos e histórico de documentos (UI na Fase 3) |
| `subscriptions` | Estado da assinatura (escrita só pelo backend — Fase 2) |
| `ai_usage` | Consumo mensal de IA (Fase 3) |
| `audit_logs` | Auditoria (vendas, cancelamentos, estoque, recebimentos) |
| `business_counters` | Numeração sequencial por negócio |

## Funções (RPC)

| Função | Quem | Descrição |
|---|---|---|
| `create_business` | autenticado | Cria negócio, vínculo de dono e categorias padrão |
| `create_product` | dono/gerente | Produto + estoque inicial atômico |
| `register_stock_movement` | dono/gerente | Entrada ou ajuste (justificativa obrigatória), idempotente, bloqueia negativo |
| `complete_sale` | membro | Venda atômica e idempotente: preços do banco, baixa de estoque, pagamentos, fiado |
| `cancel_sale` | dono/gerente | Cancela, devolve estoque, cancela fiado; bloqueia se houver pagamento de fiado não estornado |
| `create_receivable` | membro | Fiado manual |
| `receive_payment` | membro | Recebimento parcial/total, rateio FIFO, idempotente |
| `reverse_receivable_payment` | dono/gerente | Estorno de recebimento |
| `pay_financial_entry` | dono/gerente | Quita conta a pagar |
| `dashboard_summary` | membro | Indicadores do período (lucro/despesas ocultos para vendedor) |
| `finance_summary` | dono/gerente | Fluxo de caixa e resultado |
| `customer_balances` | membro | Saldo devedor, atraso, total gasto, última compra |

## Testes

`npm run test:db` cria um PostgreSQL temporário, aplica um *shim* mínimo do Supabase
(`supabase/tests/00_supabase_shim.sql`: papéis, `auth.uid()`, `storage`), as migrations e executa
`supabase/tests/10_core_flow.sql`, que cobre: perfil automático, normalização de documento, bloqueio de escrita
direta, venda mista, idempotência, rollback por falta de estoque, pagamento divergente, fiado sem cliente,
entrada/ajuste de estoque, recebimento FIFO, estorno, cancelamento, faturamento × recebido × lucro,
isolamento entre usuários (RLS), limites do vendedor e políticas do Storage.
