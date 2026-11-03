# Assinaturas — Plano Grátis e Pro IA

## Como funciona

```
App (react-native-purchases)            RevenueCat                    Supabase
 ├─ Purchases.logIn(user.id) ─────────▶ cliente = id do Supabase
 ├─ getOfferings() ◀────────────────── preço da loja (R$ 39,90 configurado na loja)
 ├─ purchasePackage() ──▶ Google Play / App Store ──▶ RevenueCat
 │                                        ├─ webhook ──────────────▶ Edge Function revenuecat-webhook
 │                                        │                           └─ apply_revenuecat_event() (idempotente)
 └─ functions.invoke('sync-subscription') ─────────────────────────▶ Edge Function sync-subscription
                                          ◀── GET /v1/subscribers ──  └─ upsert_subscription_state()
 get_entitlements(business) ◀─────────────────────────────────────── plano calculado no banco
```

- **A fonte da verdade é o servidor.** O app nunca libera o Pro sozinho; ele só exibe o que `get_entitlements`
  retorna. Uma compra concluída na loja aciona a sincronização e o webhook; só então o Pro é liberado.
- **Limites aplicados no banco:** gatilhos em `products` (30 ativos) e `sales` (50 por mês, no fuso do
  negócio, incluindo canceladas para não permitir contornar o limite). Valores em `public.plans`.
- **O plano é do dono:** a assinatura pertence ao usuário dono; todos os negócios dele ficam Pro.
- **Dados nunca são bloqueados:** ao expirar, nada é apagado nem ocultado. Só a criação acima do limite e as
  telas de relatório Pro ficam indisponíveis.

### Estados

| Estado | Quando | Acesso Pro |
|---|---|---|
| `trialing` | Compra inicial com teste grátis | Sim, até o fim do teste |
| `active` | Compra/renovação | Sim |
| `canceled` | Usuário desativou a renovação | Sim, até o fim do período pago |
| `billing_issue` | Falha de cobrança ainda dentro do período pago | Sim, até o fim do período |
| `grace_period` | Falha de cobrança com período de tolerância da loja | Sim, até o fim da tolerância |
| `expired` | Fim do período/tolerância, reembolso, transferência | Não |

Eventos repetidos (`event.id`) são ignorados; eventos mais antigos que o último aplicado são marcados como
`stale`. Todos ficam registrados em `subscription_events`.

## Recursos por plano

| Recurso | Grátis | Pro IA |
|---|---|---|
| Produtos ativos | 30 | Ilimitados |
| Vendas por mês | 50 | Ilimitadas |
| Clientes, fiados (registro e recebimento) | ✔ | ✔ |
| Registro de despesas e contas a pagar | ✔ | ✔ |
| Dashboard | Indicadores | + gráfico e mais vendidos |
| Relatório financeiro (fluxo de caixa, lucro, categorias) | — | ✔ |
| Mensagens de cobrança pelo WhatsApp | — | ✔ |
| Assistente IA | — | 200 perguntas/mês (configurável) |
| Relatórios detalhados e exportação PDF/Excel | — | ✔ |
| Recomendações (alertas de prejuízo, reposição, preços) | — | ✔ |
| Recibos, orçamentos e exportação completa dos dados (LGPD) | ✔ | ✔ |

## Passo a passo de configuração

### 1. Lojas

**Google Play Console**
1. Crie o app `com.gestaofacilia.app` e envie um build para o teste interno (necessário para listar produtos).
2. Monetização → Assinaturas → crie `gestao_pro_mensal`, plano base mensal com renovação automática, R$ 39,90.
3. (Opcional) Adicione uma oferta de **teste grátis de 7 dias** ao plano base.
4. Configure contas de teste de licença (Configuração → Teste de licença).

**App Store Connect**
1. Crie o app `com.gestaofacilia.app` e um grupo de assinaturas "Gestão Fácil Pro".
2. Crie a assinatura auto-renovável `gestao_pro_mensal`, duração 1 mês, preço R$ 39,90.
3. (Opcional) Oferta introdutória: teste grátis de 1 semana.
4. Crie usuários Sandbox (Usuários e Acesso → Sandbox).

### 2. RevenueCat

1. Crie o projeto e adicione os apps Android e iOS (credenciais de serviço do Google Play e chave In-App Purchase da App Store).
2. Produtos → importe `gestao_pro_mensal` das duas lojas.
3. Entitlements → crie **`pro`** e anexe os produtos.
4. Offerings → oferta `default` (marcada como *current*) com o pacote **Monthly** apontando para os produtos.
5. Integrations → Webhooks:
   - URL: `https://<projeto>.supabase.co/functions/v1/revenuecat-webhook`
   - Authorization header: um segredo longo e aleatório (≥ 16 caracteres)
   - Ambiente: em produção envie apenas eventos de produção; no projeto de testes, ambos.
6. API keys → copie as **chaves públicas** do SDK (Android/iOS) e a **chave secreta v1** (somente backend).

### 3. Supabase

```bash
npx supabase db push                                   # aplica a migration 0500
npx supabase secrets set REVENUECAT_WEBHOOK_AUTH=<segredo-do-webhook>
npx supabase secrets set REVENUECAT_SECRET_API_KEY=<chave-secreta-v1>
npx supabase functions deploy revenuecat-webhook --no-verify-jwt
npx supabase functions deploy sync-subscription
```

### 4. App (`.env` / variáveis do EAS)

```
EXPO_PUBLIC_APP_ENV=production            # staging para o ambiente de testes
EXPO_PUBLIC_REVENUECAT_ANDROID_KEY=goog_...
EXPO_PUBLIC_REVENUECAT_IOS_KEY=appl_...
```

Sem as chaves, o app mostra "Assinaturas indisponíveis nesta versão" e não oferece compra. Compras não
funcionam no Expo Go nem na web: use um *development build* (`npx eas-cli build --profile development`).

## Ambientes separados (produção x testes)

| | Projeto Supabase de **produção** | Projeto Supabase de **testes/staging** |
|---|---|---|
| `app_settings.accepted_subscription_environments` | `["production"]` (padrão) | `["production","sandbox"]` |
| `EXPO_PUBLIC_APP_ENV` | `production` | `staging` |
| Compras sandbox | Registradas, mas **não** liberam o Pro | Liberam o Pro |

No projeto de testes:

```sql
update public.app_settings set value = '["production","sandbox"]'
where key = 'accepted_subscription_environments';
```

Assinaturas sandbox aparecem no app com o selo "Assinatura de TESTE (sandbox)".

## Roteiro de testes em sandbox

1. Instale o development build com `EXPO_PUBLIC_APP_ENV=staging` apontando para o Supabase de testes.
2. Conta nova → cadastre 30 produtos → o 31º deve abrir a tela Pro com o aviso de limite.
3. Assine com usuário sandbox/testador → o app mostra "Confirmando com a loja..." → plano vira Pro.
4. Confira em `subscriptions` (status `trialing`/`active`, `environment = sandbox`) e em `subscription_events`.
5. Renovações aceleradas da loja → eventos `RENEWAL`; cancele na loja → `canceled` com acesso até o fim.
6. Aguarde a expiração → plano volta ao Grátis; produtos e vendas continuam visíveis.
7. Reinstale o app → "Restaurar compras" → plano Pro de volta.
8. Simule falha de cobrança (Play: cartão de teste "sempre recusa") → `grace_period`/`billing_issue` com aviso no app.
9. No painel do RevenueCat, envie um *test event* ao webhook → deve responder 200 e registrar `ignored_test`.
