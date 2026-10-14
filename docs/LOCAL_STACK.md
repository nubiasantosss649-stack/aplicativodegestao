# Backend local sem Docker (testes de ponta a ponta)

`scripts/local-stack/start.sh` sobe um ambiente equivalente ao Supabase usando PostgreSQL 16, os binários oficiais
do **Auth (GoTrue)** e do **PostgREST**, um gateway Node (`/auth/v1`, `/rest/v1`, `/functions/v1`) e, com Deno,
a Edge Function `delete-account`. Storage (fotos) e as funções de IA/assinatura não rodam neste ambiente.

```bash
# binários (uma vez)
mkdir -p ~/gf-bin && cd ~/gf-bin
curl -sSL https://github.com/PostgREST/postgrest/releases/download/v12.2.3/postgrest-v12.2.3-linux-static-x64.tar.xz | tar -xJ
curl -sSL https://github.com/supabase/auth/releases/download/v2.170.0/auth-v2.170.0-x86.tar.gz | tar -xz

# subir, popular a demo e testar
BIN_DIR=~/gf-bin DENO=$(which deno) npm run stack:start
npm run seed:demo                       # demo@gestaofacil.app / demo12345 (Pro, 14 dias de vendas)
source /tmp/gestao-local-stack/.env.local-stack
EXPO_PUBLIC_SUPABASE_URL=$EXPO_PUBLIC_SUPABASE_URL EXPO_PUBLIC_SUPABASE_ANON_KEY=$EXPO_PUBLIC_SUPABASE_ANON_KEY \
  EXPO_PUBLIC_APP_ENV=production npx expo export --platform web --output-dir dist-e2e
node scripts/serve-static.js dist-e2e 8081 &
npm run e2e                             # 14 passos: cadastro → vendas → fiado → cancelamento → exclusão de conta
npm run screenshots                     # capturas reais + imagens prontas para as lojas (store/)
npm run stack:stop
```

O ambiente usa `GOTRUE_MAILER_AUTOCONFIRM=true` (sem e-mail de confirmação) e um segredo JWT fixo — **somente
para testes locais**.
