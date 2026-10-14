# Lançamento — Google Play e App Store

Este guia leva o Gestão Fácil IA do repositório às lojas. Itens marcados com 👤 dependem de você (contas,
dados da empresa, pagamentos); o restante já está pronto no repositório.

## 0. O que já está pronto

- [x] Ícone (iOS e adaptativo Android, incluindo monocromático), splash e favicon — `npm run assets`
- [x] `app.json`: identificadores `com.gestaofacilia.app`, textos de permissão, criptografia isenta
      (`ITSAppUsesNonExemptEncryption=false`), manifesto de privacidade iOS, permissões Android mínimas
      (áudio, vídeo e sobreposição bloqueados), backup desativado, somente iPhone (sem iPad na v1)
- [x] `eas.json`: perfis `development`, `preview` (staging) e `production` (AAB), incremento automático de build
- [x] Bloqueio de build de produção com pendências (`scripts/check-release.js`, executado no EAS)
- [x] Exclusão de conta no app + página web de exclusão (`site/excluir-conta.html`)
- [x] Política de privacidade e termos (app + `site/`), com campos `[PREENCHER]`
- [x] Capturas reais e imagens de loja (`store/`), textos e respostas de privacidade (`docs/STORE_LISTING.md`)
- [x] Revisão de segurança (`docs/SECURITY.md`) e testes automatizados (unitários, SQL, E2E)

## 1. 👤 Dados obrigatórios

1. Preencha `src/content/legal.json` → `contact` (responsável com CPF/CNPJ, e-mail de suporte, encarregado/DPO).
2. Revise os textos com assessoria jurídica e rode `npm run build:site`.
3. Publique a pasta `site/` (GitHub Pages, Netlify ou Vercel) e anote as URLs.

## 2. 👤 Backend de produção (Supabase)

1. Projeto **separado** para produção (e outro para staging).
2. `npx supabase link --project-ref <ref>` → `npx supabase db push`.
3. Auth: confirmação de e-mail ativa; *Redirect URLs* `gestaofacil://auth/callback`; SMTP próprio; proteção de
   senhas vazadas e CAPTCHA (ver `docs/SECURITY.md`).
4. Segredos e funções:
   ```bash
   npx supabase secrets set REVENUECAT_WEBHOOK_AUTH=... REVENUECAT_SECRET_API_KEY=... ANTHROPIC_API_KEY=...
   npx supabase functions deploy revenuecat-webhook --no-verify-jwt
   npx supabase functions deploy sync-subscription
   npx supabase functions deploy ai-assistant
   npx supabase functions deploy delete-account
   ```
5. Staging: `update app_settings set value='["production","sandbox"]' where key='accepted_subscription_environments';`

## 3. 👤 Contas e lojas

| Item | Onde |
|---|---|
| Conta Expo/EAS | expo.dev → `npx eas-cli login` → `npx eas-cli init` (grava o `projectId` no app.json) |
| Google Play Console (US$ 25, verificação de identidade) | Criar app “Gestão Fácil IA”, pacote `com.gestaofacilia.app` |
| Apple Developer Program (US$ 99/ano) | App Store Connect → novo app, bundle `com.gestaofacilia.app`; copie o *Apple ID* do app para `eas.json` → `submit.production.ios.ascAppId` |
| Assinaturas e RevenueCat | `docs/SUBSCRIPTIONS.md` |

## 4. Variáveis de build (EAS)

```bash
npx eas-cli env:create --environment production --name EXPO_PUBLIC_SUPABASE_URL --value https://<ref>.supabase.co --visibility plaintext
npx eas-cli env:create --environment production --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value <anon> --visibility plaintext
npx eas-cli env:create --environment production --name EXPO_PUBLIC_REVENUECAT_ANDROID_KEY --value goog_... --visibility plaintext
npx eas-cli env:create --environment production --name EXPO_PUBLIC_REVENUECAT_IOS_KEY --value appl_... --visibility plaintext
```
(Repita para `preview` com o projeto de staging.) Nunca coloque chaves secretas em variáveis `EXPO_PUBLIC_`.

## 5. Builds

```bash
npx eas-cli build --profile preview --platform android       # APK para testes internos
npx eas-cli build --profile development --platform all       # dev client (compras e câmera)
npx eas-cli build --profile production --platform all        # AAB + IPA (falha se houver pendências)
```

## 6. Testes antes de enviar (staging)

- [ ] Roteiro de compras sandbox — `docs/SUBSCRIPTIONS.md` (assinar, restaurar, cancelar, expirar, falha de cobrança)
- [ ] Assistente IA: as 7 perguntas de exemplo, conferindo os números com Relatórios — `docs/AI.md`
- [ ] Câmera: leitura de código de barras em Android e iPhone reais
- [ ] Foto de produto (upload e exibição)
- [ ] PDF/Excel: compartilhar comprovante, orçamento, recibo, relatório e exportação de dados no WhatsApp/e-mail
- [ ] Links de e-mail (confirmação e recuperação de senha) abrindo o app
- [ ] Modo escuro e fonte grande do sistema
- [ ] Exclusão de conta com assinatura ativa (aviso de cancelamento na loja)

## 7. Envio

```bash
npx eas-cli submit --profile production --platform android   # trilha interna, rascunho
npx eas-cli submit --profile production --platform ios       # TestFlight
```

Preencha nas lojas os textos, imagens, URLs, segurança dos dados / rótulos de privacidade, classificação etária,
informações de revisão e a assinatura — tudo em `docs/STORE_LISTING.md`.

## 8. Checklist de aprovação

**Ambas as lojas**
- [ ] Política de privacidade acessível no app (Configurações) e por URL pública
- [ ] Exclusão de conta dentro do app (Configurações → Excluir minha conta)
- [ ] Conta de teste para o revisor com dados de exemplo
- [ ] Nenhuma funcionalidade “em breve” ou quebrada visível (✔ o app só mostra recursos implementados)
- [ ] Documentos identificados como não fiscais (✔)
- [ ] Permissões com justificativa (câmera e fotos) (✔)

**Apple (diretrizes 3.1.1, 3.1.2, 5.1.1)**
- [ ] Compra dentro do app para recursos digitais (✔ RevenueCat/StoreKit; nenhum link externo de pagamento)
- [ ] Tela de assinatura com preço da loja, período, renovação automática, links de Termos e Privacidade e “Restaurar compras” (✔)
- [ ] EULA: usar o padrão da Apple ou o link `termos.html` no App Store Connect
- [ ] Login com Apple **não** é exigido (o app usa apenas e-mail/senha próprios)
- [ ] Manifesto de privacidade (✔ `app.json` → `ios.privacyManifests`)

**Google Play**
- [ ] Formulário de Segurança dos dados (respostas em `docs/STORE_LISTING.md`)
- [ ] URL de exclusão de conta (`site/excluir-conta.html`)
- [ ] Público-alvo: 18+, sem anúncios
- [ ] Teste fechado com **12 testadores por 14 dias** (exigência para contas pessoais novas) antes da produção
- [ ] Declaração de assinaturas e política de cancelamento

## 9. Após aprovação

- Lançamento gradual (Play: 10% → 50% → 100%; App Store: lançamento em fases de 7 dias)
- Acompanhar: erros de Edge Functions (logs do Supabase), `subscription_events`, custo de IA (`docs/AI.md`)
- Responder avaliações e manter `docs/SECURITY.md` atualizado a cada SDK do Expo
