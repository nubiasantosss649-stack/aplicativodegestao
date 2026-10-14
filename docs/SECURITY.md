# Revisão de segurança — Gestão Fácil IA (Fase 4)

Data: 16/10/2026. Escopo: app (Expo), banco (migrations/RLS/funções), Edge Functions, dependências, configuração das lojas.

## Controles verificados automaticamente

| Controle | Como é verificado |
|---|---|
| RLS habilitado em **todas** as tabelas do schema `public` | `supabase/tests/40_account_deletion_security.sql` (falha se alguma tabela nova vier sem RLS) |
| Usuário anônimo sem acesso a tabelas (exceto leitura de `plans` e `app_settings`) e sem executar funções | idem |
| Toda função `SECURITY DEFINER` com `search_path` fixo | idem |
| Funções internas e de backend (`_*`, webhook, sync, tokens de IA, exclusão) não executáveis pelo app | idem |
| Sem escrita direta em vendas, pagamentos, estoque, fiados recebidos, assinaturas, auditoria, documentos e contadores | idem + privilégios por coluna (`products.stock_qty`, `receivables.paid_cents/status`, `businesses.owner_id`, `quotes.total_cents`) |
| Isolamento entre negócios e papéis (dono/gerente/vendedor) | `10_core_flow.sql`, `20_*`, `30_*` |
| Operações financeiras atômicas e idempotentes | `10_core_flow.sql` |
| Bucket de fotos privado, acesso por negócio | `10_core_flow.sql`, `40_*` |
| Exclusão de conta completa sem afetar terceiros | `40_*` e E2E (`e2e/flow.e2e.js`) |
| Nenhum segredo versionado; nenhuma variável `EXPO_PUBLIC_` com chave secreta | `scripts/check-release.js` + revisão manual (grep) |

## Achados desta revisão (corrigidos)

1. **Funções executáveis por `PUBLIC`** (médio → corrigido). O PostgreSQL concede `EXECUTE` a `PUBLIC` em
   funções novas e o `ALTER DEFAULT PRIVILEGES ... IN SCHEMA` não remove esse padrão global. Funções RPC criadas
   após a migration de RLS eram executáveis por `anon`. Impacto real baixo (todas exigem `auth.uid()` e falham
   sem login), mas foi corrigido: `revoke ... from public` + `alter default privileges revoke execute on functions from public`
   (migration 0700). O teste de auditoria impede regressões.
2. **`DELETE` direto em `documents` e `quote_items`** (baixo → corrigido). Permitia apagar o histórico de documentos;
   revogado na migration 0700.
3. **FK `RESTRICT` impedia exclusão de conta** (funcional → corrigido): fiados → clientes agora `NO ACTION`
   (continua impedindo excluir um cliente com fiado isoladamente; teste incluído).
4. **Após sair da conta o app abria a apresentação inicial** (UX → corrigido): o `index` passou a ser a primeira rota
   do navegador raiz.

## Modelo de ameaças (resumo)

| Ameaça | Mitigação |
|---|---|
| Usuário lê/altera dados de outro negócio | RLS por `business_members`; RPCs validam membro/papel; testes de intrusão |
| App adulterado envia preço/total falso | Preço e custo lidos do banco em `complete_sale`; totais de orçamento calculados no servidor |
| Repetição de requisição (toque duplo, rede instável) | Chaves de idempotência em vendas, estoque e recebimentos |
| Vendedor concede desconto abusivo | Limite de desconto por papel validado no banco |
| Assinatura falsificada pelo app | Pro só via webhook autenticado (segredo, comparação em tempo constante) ou sync com chave secreta no backend; sandbox recusado em produção |
| Abuso/custo da IA | Cota mensal atômica, limites de tamanho, máx. 6 rodadas, tokens registrados, chave só no backend |
| Injeção de prompt para ler dados de outros | A IA consulta com o JWT do usuário (RLS); ferramentas sempre usam o negócio validado; sem ferramentas de escrita |
| Vazamento de sessão no aparelho | Sessão no Keychain/Keystore (expo-secure-store); `android:allowBackup=false` |
| XSS em PDFs/recibos | Todo texto do usuário escapado (`escapeHtml`), testado |
| Exposição de dados pessoais à IA | Telefones e ids removidos antes do envio |

## Dependências (`npm audit --omit=dev`)

62 avisos (0 críticos). As origens são: `node-forge` (assinatura de código do Expo CLI), `braces`, `sprintf-js`
e `uuid` (ferramentas de build: Metro, Jest, `xcode`) — **não entram no app**. A única dependência presente no
bundle é `decode-uri-component@0.2.2` (via `query-string`, do expo-router): negação de serviço local ao decodificar
uma URL malformada no próprio aparelho; risco baixo, aceito até o expo-router atualizar a dependência.
Reavaliar a cada atualização do Expo SDK (`npx expo install --fix` + `npm audit`).

## Pendências recomendadas antes do lançamento

- Habilitar no Supabase: proteção contra senhas vazadas, CAPTCHA no cadastro (hCaptcha/Turnstile), limites de taxa
  de e-mail e SMTP próprio (domínio verificado com SPF/DKIM).
- Ativar backups/PITR do banco e alertas de uso.
- Rotacionar `REVENUECAT_WEBHOOK_AUTH` se compartilhado fora do painel.
- Pentest externo após o lançamento beta.
