#!/usr/bin/env bash
# Cria a conta de demonstração (demo@gestaofacil.app / demo12345) no backend local.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
source "${STATE_DIR:-/tmp/gestao-local-stack}/.env.local-stack"
U=http://localhost:54321
psql -X -q "postgresql://postgres@127.0.0.1:54330/postgres" -c "delete from auth.users where email = 'demo@gestaofacil.app'" > /dev/null
RES=$(curl -s --noproxy '*' -X POST "$U/auth/v1/signup" -H "apikey: $EXPO_PUBLIC_SUPABASE_ANON_KEY" -H 'content-type: application/json' \
  -d '{"email":"demo@gestaofacil.app","password":"demo12345","data":{"full_name":"Maria Souza"}}')
UID_DEMO=$(echo "$RES" | node -pe 'const r=JSON.parse(require("fs").readFileSync(0));(r.user||r).id')
psql -X -q "postgresql://postgres@127.0.0.1:54330/postgres" -v uid="$UID_DEMO" -f "$HERE/seed-demo.sql" > /dev/null
echo "✅ Conta demo criada: demo@gestaofacil.app / demo12345 ($UID_DEMO)"
