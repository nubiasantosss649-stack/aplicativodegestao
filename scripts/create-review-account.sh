#!/usr/bin/env bash
# Cria a conta de teste para os revisores da Google Play e da App Store, com dados de
# demonstração (fictícios) de um mercadinho: produtos, clientes, 14 dias de vendas,
# fiados, despesas e um orçamento. Afeta somente a conta criada.
#
# Uso (rode no SEU computador; nunca versione as chaves):
#   SUPABASE_URL=https://<ref>.supabase.co \
#   SUPABASE_SERVICE_ROLE_KEY=<service_role> \
#   DATABASE_URL='postgresql://postgres.<ref>:<senha>@<host>:5432/postgres' \
#   REVIEW_EMAIL=revisao@seudominio.com.br \
#   ./scripts/create-review-account.sh
#
# Opcional: REVIEW_PASSWORD (senão é gerada), REVIEW_PRO=true (libera o Pro sem compra;
# o padrão é false para o revisor poder testar a assinatura), REVIEW_RESET=1 (recria a conta).
# Requer: curl, node e psql.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
: "${SUPABASE_URL:?defina SUPABASE_URL}"
: "${SUPABASE_SERVICE_ROLE_KEY:?defina SUPABASE_SERVICE_ROLE_KEY}"
: "${DATABASE_URL:?defina DATABASE_URL (Supabase > Project Settings > Database > Connection string)}"
: "${REVIEW_EMAIL:?defina REVIEW_EMAIL}"
REVIEW_PASSWORD="${REVIEW_PASSWORD:-$(node -e 'console.log("Rv-" + require("crypto").randomBytes(9).toString("base64url"))')}"
REVIEW_PRO="${REVIEW_PRO:-false}"
[[ "$REVIEW_PRO" == "true" || "$REVIEW_PRO" == "false" ]] || { echo "REVIEW_PRO deve ser true ou false"; exit 1; }
CURL=(curl -sS --noproxy localhost,127.0.0.1)
AUTH=(-H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY")
PSQL=(psql -X -q -v ON_ERROR_STOP=1 "$DATABASE_URL")

existing=$(printf "select id from auth.users where lower(email) = lower('%s')" "${REVIEW_EMAIL//\'/}" | "${PSQL[@]}" -At | head -1)
if [[ -n "$existing" ]]; then
  if [[ "${REVIEW_RESET:-}" != "1" ]]; then
    echo "❌ Já existe uma conta com $REVIEW_EMAIL. Use REVIEW_RESET=1 para apagá-la e recriar."
    exit 1
  fi
  echo "select public.delete_user_data('$existing'::uuid);" | "${PSQL[@]}" > /dev/null
  "${CURL[@]}" -X DELETE "$SUPABASE_URL/auth/v1/admin/users/$existing" "${AUTH[@]}" > /dev/null
  echo "↺ Conta anterior removida."
fi

body=$(REVIEW_EMAIL="$REVIEW_EMAIL" REVIEW_PASSWORD="$REVIEW_PASSWORD" node -e '
  console.log(JSON.stringify({ email: process.env.REVIEW_EMAIL, password: process.env.REVIEW_PASSWORD,
    email_confirm: true, user_metadata: { full_name: "Revisão das Lojas" } }))')
res=$("${CURL[@]}" -X POST "$SUPABASE_URL/auth/v1/admin/users" "${AUTH[@]}" -H 'content-type: application/json' -d "$body")
uid=$(echo "$res" | node -pe 'const r = JSON.parse(require("fs").readFileSync(0)); r.id || ""')
if [[ -z "$uid" ]]; then
  echo "❌ Não foi possível criar o usuário: $res"
  exit 1
fi

# Se a carga de dados falhar, remove a conta criada para não deixar meio caminho
cleanup() {
  echo "select public.delete_user_data('$uid'::uuid);" | "${PSQL[@]}" > /dev/null 2>&1 || true
  "${CURL[@]}" -X DELETE "$SUPABASE_URL/auth/v1/admin/users/$uid" "${AUTH[@]}" > /dev/null 2>&1 || true
  echo "❌ Falha ao gerar os dados de demonstração; a conta foi removida."
}
trap cleanup ERR

# Plano Grátis: no máximo 30 vendas, deixando o restante do limite mensal para o revisor
MAX_SALES=$([[ "$REVIEW_PRO" == "true" ]] && echo 1000 || echo 30)
"${PSQL[@]}" -v uid="$uid" -v pro="$REVIEW_PRO" -v max_sales="$MAX_SALES" -f "$HERE/../e2e/seed-demo.sql" > /dev/null
trap - ERR

cat <<MSG
✅ Conta de revisão criada com dados de demonstração.

   E-mail: $REVIEW_EMAIL
   Senha:  $REVIEW_PASSWORD
   Plano:  $([[ "$REVIEW_PRO" == "true" ]] && echo "Pro (liberado sem compra)" || echo "Grátis (o revisor pode testar a assinatura em sandbox)")

Informe esses dados em: Google Play Console > Conteúdo do app > Acesso ao app,
e App Store Connect > App Review Information > Sign-in required.
Guarde a senha em local seguro; ela não é salva em lugar nenhum.
MSG
