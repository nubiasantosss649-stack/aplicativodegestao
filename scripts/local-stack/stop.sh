#!/usr/bin/env bash
# Encerra o backend local iniciado por start.sh
STATE="${STATE_DIR:-/tmp/gestao-local-stack}"
for p in $(pgrep -f "$STATE/postgrest.conf"); do kill "$p"; done
for p in $(pgrep -f "local-stack/gateway.js"); do [[ "$p" != "$$" ]] && kill "$p" 2>/dev/null; done
for p in $(pgrep -x auth); do kill "$p"; done
for p in $(pgrep -f "delete-account/index.ts"); do kill "$p"; done
PG_BIN="${PG_BIN:-$(ls -d /usr/lib/postgresql/*/bin | sort -V | tail -1)}"
if [[ "$(id -u)" == "0" ]]; then runuser -u postgres -- "$PG_BIN/pg_ctl" -D "$STATE/data" -m fast stop; else "$PG_BIN/pg_ctl" -D "$STATE/data" -m fast stop; fi
