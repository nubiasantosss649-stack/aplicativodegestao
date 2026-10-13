# Gestão Fácil IA

**Seu negócio organizado, suas vendas crescendo.**

Aplicativo de gestão para MEIs e pequenos negócios (mercadinhos, lojas de roupas, salões, prestadores de
serviço): vendas, estoque, clientes, fiados e financeiro — com assistente de IA e plano Pro nas próximas fases.

> Status: **Fase 1 (sistema principal) concluída.** Monetização (Fase 2), IA/relatórios (Fase 3) e
> publicação (Fase 4) ainda não foram implementadas.

## Stack

Expo SDK 57 · React Native 0.86 · TypeScript · Expo Router · Supabase (Auth, PostgreSQL com RLS, Storage) ·
TanStack Query · React Hook Form + Zod · Jest.

Documentação: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) e [`docs/DATABASE.md`](docs/DATABASE.md).

## Como executar

### 1. Backend (Supabase)

Opção A — projeto na nuvem:

1. Crie um projeto em https://supabase.com.
2. Aplique as migrations de `supabase/migrations` (em ordem) pelo SQL Editor, ou com o CLI:
   `npx supabase link --project-ref <ref>` e `npx supabase db push`.
3. Em **Authentication → URL Configuration**, adicione às *Redirect URLs*:
   `gestaofacil://auth/callback` (app) e `http://localhost:8081/auth/callback` (web em desenvolvimento).
4. Em **Authentication → Providers → Email**, mantenha a confirmação de e-mail ativada.

Opção B — local (requer Docker): `npx supabase start` (usa `supabase/config.toml` e aplica as migrations).

### 2. App

```bash
cp .env.example .env      # preencha EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_ANON_KEY
npm install
npm start                 # abre o Expo; pressione "w" para web
```

A leitura de código de barras e a seleção de fotos usam módulos nativos: no celular, use um
*development build* (`npx eas-cli build --profile development`) ou `npx expo run:android|ios`.

## Verificações

```bash
npm run typecheck   # TypeScript
npm run lint        # ESLint (eslint-config-expo)
npm test            # testes unitários (Jest)
npm run test:db     # migrations + testes SQL de RLS/transações num Postgres descartável
npm run check       # todos acima
```

`test:db` precisa do PostgreSQL 16 instalado localmente (ou de `DATABASE_URL` apontando para um banco vazio).

## Segurança

- Nenhuma chave secreta no app (somente a chave pública *anon* do Supabase).
- RLS em todas as tabelas; vendas, estoque e pagamentos só são gravados por funções transacionais
  e idempotentes no banco.
- Sessão salva no Keychain/Keystore (expo-secure-store).
- Comprovantes identificados como **não fiscais**. O app apenas registra pagamentos informados — não processa
  cartão nem Pix.
