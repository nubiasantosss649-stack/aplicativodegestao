# Banco de dados

Migrations em `supabase/migrations` (aplicadas em ordem):

| Arquivo | Conteúdo |
|---|---|
| `…0100_core_schema.sql` | Tipos, tabelas, índices, gatilhos `updated_at`, criação automática de perfil |
| `…0200_rls_and_grants.sql` | RLS em todas as tabelas, privilégios por coluna, funções de autorização |
| `…0300_business_functions.sql` | RPCs transacionais e relatórios |
| `…0400_storage.sql` | Bucket privado `product-photos` e políticas por negócio |
| `…0500_plans_subscriptions.sql` | Planos/limites, cálculo do plano, gatilhos de limite, eventos RevenueCat |
| `…0600_reports_ai_documents.sql` | Relatórios, recomendações, alertas, cota de IA, orçamentos, documentos, exportação, índices |

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
| `app_settings` | Configurações (ambientes de assinatura aceitos, entitlement) |
| `plans` | Limites e recursos de cada plano (configuráveis) |
| `subscription_events` | Log idempotente dos webhooks do RevenueCat |
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
| `get_entitlements` | membro | Plano, limites, uso do mês e situação da assinatura (detalhes só para o dono) |
| `business_plan` | membro | `free` ou `pro` (plano do dono) |
| `sales_report` | membro | Vendas por produto/categoria/pagamento/dia/hora, melhores clientes, comparação (custo/lucro só p/ gerente) |
| `expense_comparison` | dono/gerente | Despesas por categoria: mês atual × anterior |
| `stock_recommendations` | membro | Reposição pelo giro de 30 dias, cobertura em dias, estoque parado |
| `pricing_insights` | dono/gerente | Produtos abaixo do custo/margem e preço sugerido |
| `business_alerts` | dono/gerente | Alertas de possível prejuízo (9 regras) |
| `ai_usage_status` / `ai_reserve_request` | membro | Cota mensal do Assistente IA (reserva atômica) |
| `ai_record_tokens` / `ai_refund_request` | **service_role** | Registro de tokens / devolução da cota em falhas |
| `save_quote` | membro | Orçamento com totais calculados no servidor |
| `register_document` | membro | Histórico de documentos e numeração de recibos |
| `export_business_data` | dono/gerente | Exportação completa (LGPD), em todos os planos |
| `apply_revenuecat_event` | **service_role** | Webhook RevenueCat idempotente e resistente a eventos fora de ordem |
| `upsert_subscription_state` | **service_role** | Estado autoritativo vindo da API REST do RevenueCat |
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

`supabase/tests/20_plans_subscriptions.sql` cobre: limite de 30 produtos (inclusive reativação) e de 50 vendas
no mês, bloqueio de escrita de assinaturas pelo app, compra sandbox recusada em produção, teste grátis,
evento duplicado, evento fora de ordem, cancelamento vigente, reativação, período de tolerância, outro
entitlement, usuário desconhecido, expiração (dados continuam acessíveis), sincronização REST e projeto de
testes aceitando sandbox.
