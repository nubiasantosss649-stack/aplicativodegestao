#!/usr/bin/env bash
# Backend local equivalente ao Supabase, sem Docker: PostgreSQL + Auth (GoTrue)
# + PostgREST + gateway (+ Edge Functions via Deno, opcional).
# Uso: BIN_DIR=/caminho/com/postgrest-e-auth ./scripts/local-stack/start.sh
# Requer: PostgreSQL 16, binários `postgrest` e `auth` (GoTrue) em $BIN_DIR; Deno opcional.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
BIN_DIR="${BIN_DIR:?defina BIN_DIR}"
STATE="${STATE_DIR:-/tmp/gestao-local-stack}"
PG_BIN="${PG_BIN:-$(ls -d /usr/lib/postgresql/*/bin | sort -V | tail -1)}"
PGPORT=54330
JWT_SECRET="super-secret-jwt-token-with-at-least-32-characters-long"

as_pg() { if [[ "$(id -u)" == "0" ]]; then runuser -u postgres -- "$@"; else "$@"; fi; }

rm -rf "$STATE" && mkdir -p "$STATE" && chmod 777 "$STATE"
as_pg "$PG_BIN/initdb" -D "$STATE/data" -U postgres -A trust >/dev/null
as_pg "$PG_BIN/pg_ctl" -D "$STATE/data" -o "-p $PGPORT -k $STATE -c listen_addresses=127.0.0.1" -l "$STATE/pg.log" -w start >/dev/null < /dev/null
PSQL="psql -X -q -v ON_ERROR_STOP=1 postgresql://postgres@127.0.0.1:$PGPORT/postgres"
$PSQL -f "$HERE/bootstrap.sql"

# Auth (GoTrue): aplica as próprias migrations no schema auth
export GOTRUE_API_HOST=127.0.0.1 PORT=9999 API_EXTERNAL_URL=http://localhost:54321/auth/v1
export GOTRUE_DB_DRIVER=postgres DB_NAMESPACE=auth
export DATABASE_URL="postgres://supabase_auth_admin:auth@127.0.0.1:$PGPORT/postgres?sslmode=disable"
export GOTRUE_SITE_URL=http://localhost:8081 GOTRUE_URI_ALLOW_LIST='*'
export GOTRUE_JWT_SECRET="$JWT_SECRET" GOTRUE_JWT_EXP=3600 GOTRUE_JWT_AUD=authenticated
export GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated GOTRUE_JWT_ADMIN_ROLES=service_role
export GOTRUE_DISABLE_SIGNUP=false GOTRUE_EXTERNAL_EMAIL_ENABLED=true GOTRUE_MAILER_AUTOCONFIRM=true
export GOTRUE_RATE_LIMIT_EMAIL_SENT=1000 GOTRUE_PASSWORD_MIN_LENGTH=8
(cd "$BIN_DIR" && nohup ./auth > "$STATE/auth.log" 2>&1 < /dev/null &)
for _ in $(seq 1 60); do curl -s -o /dev/null http://127.0.0.1:9999/health && break; sleep 0.5; done

# Migrations do app (as do Supabase já criaram auth.users)
for f in "$ROOT"/supabase/migrations/*.sql; do $PSQL -f "$f"; done

cat > "$STATE/postgrest.conf" <<CONF
db-uri = "postgres://authenticator:authenticator@127.0.0.1:$PGPORT/postgres"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "$JWT_SECRET"
server-port = 3000
server-host = "127.0.0.1"
CONF
nohup "$BIN_DIR/postgrest" "$STATE/postgrest.conf" > "$STATE/postgrest.log" 2>&1 < /dev/null &

eval "$(node "$HERE/jwt.js" "$JWT_SECRET")"
FUNCTIONS='{}'
if [[ -n "${DENO:-}" ]]; then
  # Edge Function de exclusão de conta (Deno.serve escuta na porta 8000)
  (cd "$ROOT/supabase/functions" && SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_ANON_KEY="$ANON_KEY" \
    SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" nohup "$DENO" run --allow-net --allow-env --allow-read --no-lock \
    delete-account/index.ts > "$STATE/fn-delete-account.log" 2>&1 < /dev/null &)
  FUNCTIONS='{"delete-account":8000}'
fi
FUNCTIONS="$FUNCTIONS" nohup node "$HERE/gateway.js" > "$STATE/gateway.log" 2>&1 < /dev/null &
sleep 2
cat > "$STATE/.env.local-stack" <<ENV
EXPO_PUBLIC_SUPABASE_URL=http://localhost:54321
EXPO_PUBLIC_SUPABASE_ANON_KEY=$ANON_KEY
SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY
ENV
echo "✅ Backend local em http://localhost:54321 (variáveis em $STATE/.env.local-stack)"
