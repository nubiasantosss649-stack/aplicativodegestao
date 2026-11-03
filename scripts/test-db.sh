#!/usr/bin/env bash
# Executa as migrations e os testes SQL (RLS + funções transacionais) em um
# PostgreSQL local descartável. Uso: npm run test:db
# Opcional: DATABASE_URL=postgres://... para usar um banco existente (vazio).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PG_BIN="${PG_BIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
PSQL="psql -v ON_ERROR_STOP=1 -q -X"

cleanup() {
  if [[ -n "${PGTMP:-}" ]]; then
    as_pg "$PG_BIN/pg_ctl" -D "$PGTMP/data" -m immediate stop >/dev/null 2>&1 || true
    rm -rf "$PGTMP"
  fi
}

as_pg() {
  if [[ "$(id -u)" == "0" ]]; then runuser -u postgres -- "$@"; else "$@"; fi
}

if [[ -z "${DATABASE_URL:-}" ]]; then
  PGTMP="$(mktemp -d)"
  trap cleanup EXIT
  chmod 777 "$PGTMP"
  as_pg "$PG_BIN/initdb" -D "$PGTMP/data" -U postgres -A trust >/dev/null
  PORT="${PGPORT_TEST:-54329}"
  as_pg "$PG_BIN/pg_ctl" -D "$PGTMP/data" -o "-p $PORT -k $PGTMP -c listen_addresses=''" -w start >/dev/null
  DATABASE_URL="postgresql://postgres@/postgres?host=$PGTMP&port=$PORT"
fi

echo "▶ Aplicando shim do Supabase"
$PSQL "$DATABASE_URL" -f "$ROOT/supabase/tests/00_supabase_shim.sql"

for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "▶ Migration $(basename "$f")"
  $PSQL "$DATABASE_URL" -f "$f"
done

status=0
for f in "$ROOT"/supabase/tests/[1-9]*.sql; do
  echo "▶ Teste $(basename "$f")"
  if ! $PSQL "$DATABASE_URL" -f "$f"; then status=1; fi
done

if [[ $status -eq 0 ]]; then echo "✅ Testes de banco aprovados"; else echo "❌ Falhas nos testes de banco"; fi
exit $status
