-- =====================================================================
-- Fase 2 — Planos, limites e assinaturas (RevenueCat)
--
-- * O plano de um negócio é o plano do seu DONO (a assinatura é por usuário).
-- * Limites do Plano Grátis são aplicados NO BANCO (não só no app).
-- * Assinaturas só são gravadas pelo backend (service_role) a partir de
--   webhooks do RevenueCat ou da sincronização via API REST — nunca pelo app.
-- * Ambientes separados: um projeto de produção aceita apenas transações
--   'production'; um projeto de testes pode aceitar 'sandbox'.
-- * Perder o Pro NUNCA bloqueia a leitura/exportação dos dados existentes.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Configurações da aplicação (somente leitura para o app)
-- ---------------------------------------------------------------------
create table public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

insert into public.app_settings (key, value) values
  -- Em projetos de TESTE altere para '["production","sandbox"]'
  ('accepted_subscription_environments', '["production"]'::jsonb),
  ('pro_entitlement_id', '"pro"'::jsonb);

-- ---------------------------------------------------------------------
-- Planos e limites configuráveis (null = ilimitado)
-- ---------------------------------------------------------------------
create table public.plans (
  id text primary key check (id in ('free', 'pro')),
  name text not null,
  max_active_products integer check (max_active_products is null or max_active_products >= 0),
  max_sales_per_month integer check (max_sales_per_month is null or max_sales_per_month >= 0),
  max_customers integer check (max_customers is null or max_customers >= 0),
  ai_monthly_requests integer not null default 0 check (ai_monthly_requests >= 0),
  features jsonb not null default '[]'::jsonb,
  -- Preço apenas de referência/marketing. O preço cobrado é SEMPRE o da loja
  -- (Google Play / App Store), exibido no app a partir do RevenueCat.
  reference_price_cents integer not null default 0,
  updated_at timestamptz not null default now()
);

insert into public.plans (id, name, max_active_products, max_sales_per_month, max_customers, ai_monthly_requests, features, reference_price_cents)
values
  ('free', 'Plano Grátis', 30, 50, null, 0,
   '["basic_dashboard","basic_receivables","basic_expenses"]'::jsonb, 0),
  ('pro', 'Pro IA', null, null, null, 200,
   '["advanced_dashboard","full_receivables","charge_messages","advanced_stock","finance_reports","exports","ai_assistant","full_history","advanced_charts"]'::jsonb,
   3990);

-- ---------------------------------------------------------------------
-- Assinaturas: colunas adicionais e log de eventos
-- ---------------------------------------------------------------------
alter table public.subscriptions
  add column period_type text,                 -- TRIAL | INTRO | NORMAL
  add column billing_issue_detected_at timestamptz,
  add column unsubscribe_detected_at timestamptz,
  add column last_event_at timestamptz,
  add column source text not null default 'webhook' check (source in ('webhook', 'sync'));

create table public.subscription_events (
  id text primary key,                          -- event.id do RevenueCat (idempotência)
  user_id uuid,
  type text not null,
  environment text,
  event_at timestamptz,
  payload jsonb not null,
  outcome text not null,                        -- applied | ignored_* | stale
  received_at timestamptz not null default now()
);
create index subscription_events_user_idx on public.subscription_events (user_id, received_at desc);

alter table public.app_settings enable row level security;
alter table public.plans enable row level security;
alter table public.subscription_events enable row level security;

grant select on public.app_settings, public.plans to authenticated, anon;
create policy app_settings_read on public.app_settings for select to authenticated, anon using (true);
create policy plans_read on public.plans for select to authenticated, anon using (true);
-- subscription_events: sem acesso para o app (apenas service_role)

-- ---------------------------------------------------------------------
-- Regras de acesso Pro
-- ---------------------------------------------------------------------
create or replace function public._accepted_environments()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select array(select jsonb_array_elements_text(value)) from public.app_settings
     where key = 'accepted_subscription_environments'),
    array['production']
  );
$$;

-- Uma assinatura dá acesso enquanto não expirou (inclui período de
-- tolerância por problema de cobrança e cancelamentos ainda vigentes).
create or replace function public._subscription_grants_access(s public.subscriptions)
returns boolean
language sql
stable
set search_path = ''
as $$
  select s.status <> 'expired'
    and greatest(coalesce(s.current_period_end, '-infinity'), coalesce(s.grace_period_end, '-infinity')) > now()
    and s.environment = any (public._accepted_environments());
$$;

create or replace function public.user_has_pro(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.subscriptions s
    where s.user_id = p_user_id
      and s.entitlement = (select value #>> '{}' from public.app_settings where key = 'pro_entitlement_id')
      and public._subscription_grants_access(s)
  );
$$;

create or replace function public.business_plan(p_business_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case when public.user_has_pro(b.owner_id) then 'pro' else 'free' end
  from public.businesses b where b.id = p_business_id;
$$;

-- Início do mês corrente no fuso do negócio
create or replace function public._business_month_start(p_business_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select date_trunc('month', now() at time zone b.timezone) at time zone b.timezone
  from public.businesses b where b.id = p_business_id;
$$;

-- ---------------------------------------------------------------------
-- get_entitlements: plano, limites, uso atual e situação da assinatura
-- ---------------------------------------------------------------------
create or replace function public.get_entitlements(p_business_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_plan text;
  v_limits public.plans;
  v_owner uuid;
  v_sub public.subscriptions;
  v_products integer;
  v_sales integer;
  v_customers integer;
begin
  perform public._require_member(p_business_id);
  select owner_id into v_owner from public.businesses where id = p_business_id;
  v_plan := public.business_plan(p_business_id);
  select * into v_limits from public.plans where id = v_plan;

  select count(*) into v_products from public.products where business_id = p_business_id and active;
  select count(*) into v_sales from public.sales
    where business_id = p_business_id and created_at >= public._business_month_start(p_business_id);
  select count(*) into v_customers from public.customers where business_id = p_business_id and active;

  -- Detalhes da assinatura só para o próprio dono
  if v_owner = auth.uid() then
    select * into v_sub from public.subscriptions
    where user_id = v_owner and environment = any (public._accepted_environments())
    order by greatest(coalesce(current_period_end, '-infinity'), coalesce(grace_period_end, '-infinity')) desc
    limit 1;
  end if;

  return jsonb_build_object(
    'plan', v_plan,
    'plan_name', v_limits.name,
    'is_owner', v_owner = auth.uid(),
    'features', v_limits.features,
    'limits', jsonb_build_object(
      'max_active_products', v_limits.max_active_products,
      'max_sales_per_month', v_limits.max_sales_per_month,
      'max_customers', v_limits.max_customers,
      'ai_monthly_requests', v_limits.ai_monthly_requests
    ),
    'usage', jsonb_build_object(
      'active_products', v_products,
      'sales_this_month', v_sales,
      'customers', v_customers
    ),
    'subscription', case when v_sub.id is null then null else jsonb_build_object(
      'status', v_sub.status,
      'product_id', v_sub.product_id,
      'store', v_sub.store,
      'environment', v_sub.environment,
      'period_type', v_sub.period_type,
      'current_period_end', v_sub.current_period_end,
      'grace_period_end', v_sub.grace_period_end,
      'will_renew', v_sub.will_renew,
      'billing_issue_detected_at', v_sub.billing_issue_detected_at,
      'has_access', public._subscription_grants_access(v_sub),
      'updated_at', v_sub.updated_at
    ) end
  );
end;
$$;

-- ---------------------------------------------------------------------
-- Aplicação dos limites do plano
-- ---------------------------------------------------------------------
create or replace function public._assert_product_limit(p_business_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_max integer;
  v_count integer;
begin
  select max_active_products into v_max from public.plans where id = public.business_plan(p_business_id);
  if v_max is null then return; end if;
  select count(*) into v_count from public.products where business_id = p_business_id and active;
  if v_count >= v_max then
    raise exception 'Limite de % produtos ativos do Plano Grátis atingido. Assine o Pro para cadastrar produtos ilimitados.', v_max
      using errcode = 'P0001', hint = 'plan_limit_products';
  end if;
end;
$$;

create or replace function public._assert_sales_limit(p_business_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_max integer;
  v_count integer;
begin
  select max_sales_per_month into v_max from public.plans where id = public.business_plan(p_business_id);
  if v_max is null then return; end if;
  select count(*) into v_count from public.sales
  where business_id = p_business_id and created_at >= public._business_month_start(p_business_id);
  if v_count >= v_max then
    raise exception 'Limite de % vendas por mês do Plano Grátis atingido. Assine o Pro para vendas ilimitadas.', v_max
      using errcode = 'P0001', hint = 'plan_limit_sales';
  end if;
end;
$$;

-- Produtos: bloqueia criação/reativação acima do limite
create or replace function public.tg_products_plan_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.active and (tg_op = 'INSERT' or not old.active) then
    perform public._assert_product_limit(new.business_id);
  end if;
  return new;
end;
$$;

create trigger products_plan_limit
  before insert or update of active on public.products
  for each row execute function public.tg_products_plan_limit();

-- Vendas: verificação antes de inserir a venda (cancelamentos ainda contam
-- no mês, evitando contornar o limite cancelando e refazendo vendas)
create or replace function public.tg_sales_plan_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public._assert_sales_limit(new.business_id);
  return new;
end;
$$;

create trigger sales_plan_limit
  before insert on public.sales
  for each row execute function public.tg_sales_plan_limit();

-- ---------------------------------------------------------------------
-- upsert_subscription_state: estado autoritativo (via API REST do RevenueCat)
-- Chamado SOMENTE pelo backend (service_role).
-- ---------------------------------------------------------------------
create or replace function public.upsert_subscription_state(
  p_user_id uuid,
  p_environment text,
  p_entitlement text,
  p_status public.subscription_status,
  p_product_id text,
  p_store text,
  p_period_type text,
  p_current_period_end timestamptz,
  p_grace_period_end timestamptz,
  p_will_renew boolean,
  p_billing_issue_detected_at timestamptz,
  p_unsubscribe_detected_at timestamptz,
  p_original_transaction_id text default null
)
returns public.subscriptions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub public.subscriptions;
begin
  if p_environment not in ('production', 'sandbox') then
    raise exception 'Ambiente inválido' using errcode = '22023';
  end if;
  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'Usuário inexistente' using errcode = '22023';
  end if;

  insert into public.subscriptions as s (
    user_id, provider, environment, entitlement, product_id, store, status, period_type,
    current_period_end, grace_period_end, will_renew, billing_issue_detected_at,
    unsubscribe_detected_at, original_transaction_id, last_event_at, source
  ) values (
    p_user_id, 'revenuecat', p_environment, p_entitlement, p_product_id, p_store, p_status, p_period_type,
    p_current_period_end, p_grace_period_end, p_will_renew, p_billing_issue_detected_at,
    p_unsubscribe_detected_at, p_original_transaction_id, now(), 'sync'
  )
  on conflict (user_id, provider, entitlement, environment) do update set
    product_id = excluded.product_id,
    store = excluded.store,
    status = excluded.status,
    period_type = excluded.period_type,
    current_period_end = excluded.current_period_end,
    grace_period_end = excluded.grace_period_end,
    will_renew = excluded.will_renew,
    billing_issue_detected_at = excluded.billing_issue_detected_at,
    unsubscribe_detected_at = excluded.unsubscribe_detected_at,
    original_transaction_id = coalesce(excluded.original_transaction_id, s.original_transaction_id),
    last_event_at = now(),
    source = 'sync'
  returning * into v_sub;

  return v_sub;
end;
$$;

-- ---------------------------------------------------------------------
-- apply_revenuecat_event: processa um webhook do RevenueCat
-- Idempotente (event.id) e resistente a eventos fora de ordem.
-- Chamado SOMENTE pelo backend (service_role) após validar a autorização.
-- ---------------------------------------------------------------------
create or replace function public.apply_revenuecat_event(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  e jsonb := coalesce(p_payload -> 'event', p_payload);
  v_id text := e ->> 'id';
  v_type text := e ->> 'type';
  v_env text := case when upper(coalesce(e ->> 'environment', '')) = 'SANDBOX' then 'sandbox' else 'production' end;
  v_event_at timestamptz := to_timestamp(nullif(e ->> 'event_timestamp_ms', '')::bigint / 1000.0);
  v_expires timestamptz := to_timestamp(nullif(e ->> 'expiration_at_ms', '')::bigint / 1000.0);
  v_grace timestamptz := to_timestamp(nullif(e ->> 'grace_period_expiration_at_ms', '')::bigint / 1000.0);
  v_period_type text := upper(e ->> 'period_type');
  v_entitlement text := (select value #>> '{}' from public.app_settings where key = 'pro_entitlement_id');
  v_user uuid;
  v_existing public.subscriptions;
  v_outcome text := 'applied';
  v_status public.subscription_status;
  v_from text;
begin
  if v_id is null or v_type is null then
    raise exception 'Evento inválido' using errcode = '22023';
  end if;

  -- Idempotência: evento já processado
  if exists (select 1 from public.subscription_events where id = v_id) then
    return jsonb_build_object('outcome', 'duplicate', 'event_id', v_id);
  end if;

  begin
    v_user := (e ->> 'app_user_id')::uuid;
  exception when others then
    v_user := null;
  end;

  if v_type = 'TEST' then
    v_outcome := 'ignored_test';
  elsif v_type = 'TRANSFER' then
    -- Compras transferidas: remove o acesso de quem perdeu a assinatura.
    -- Quem recebeu é sincronizado pelo backend via API REST.
    for v_from in select jsonb_array_elements_text(coalesce(e -> 'transferred_from', '[]'::jsonb))
    loop
      begin
        update public.subscriptions set status = 'expired', will_renew = false, last_event_at = v_event_at
        where user_id = v_from::uuid and entitlement = v_entitlement and environment = v_env;
      exception when invalid_text_representation then null;
      end;
    end loop;
    v_outcome := 'applied_transfer';
  elsif v_user is null or not exists (select 1 from auth.users where id = v_user) then
    v_outcome := 'ignored_unknown_user';
  elsif e ? 'entitlement_ids' and jsonb_typeof(e -> 'entitlement_ids') = 'array'
        and not (e -> 'entitlement_ids') ? v_entitlement then
    v_outcome := 'ignored_other_entitlement';
  else
    select * into v_existing from public.subscriptions
    where user_id = v_user and entitlement = v_entitlement and environment = v_env and provider = 'revenuecat'
    for update;

    if found and v_existing.last_event_at is not null and v_event_at is not null
       and v_event_at < v_existing.last_event_at then
      v_outcome := 'stale';
    else
      v_status := case v_type
        when 'INITIAL_PURCHASE' then case when v_period_type = 'TRIAL' then 'trialing' else 'active' end
        when 'RENEWAL' then case when v_period_type = 'TRIAL' then 'trialing' else 'active' end
        when 'PRODUCT_CHANGE' then case when v_period_type = 'TRIAL' then 'trialing' else 'active' end
        when 'UNCANCELLATION' then case when v_period_type = 'TRIAL' then 'trialing' else 'active' end
        when 'SUBSCRIPTION_EXTENDED' then 'active'
        when 'TEMPORARY_ENTITLEMENT_GRANT' then 'active'
        when 'REFUND_REVERSED' then 'active'
        when 'NON_RENEWING_PURCHASE' then 'active'
        when 'CANCELLATION' then 'canceled'
        when 'SUBSCRIPTION_PAUSED' then coalesce(v_existing.status::text, 'active')
        when 'BILLING_ISSUE' then case when v_grace is not null and v_grace > now() then 'grace_period' else 'billing_issue' end
        when 'EXPIRATION' then 'expired'
        else null
      end::public.subscription_status;

      if v_status is null then
        v_outcome := 'ignored_type';
      else
        insert into public.subscriptions as s (
          user_id, provider, environment, entitlement, product_id, store, status, period_type,
          current_period_end, grace_period_end, will_renew, billing_issue_detected_at,
          unsubscribe_detected_at, original_transaction_id, last_event_id, raw_event, last_event_at, source
        ) values (
          v_user, 'revenuecat', v_env, v_entitlement, e ->> 'product_id', e ->> 'store', v_status, v_period_type,
          v_expires,
          case when v_type = 'BILLING_ISSUE' then v_grace else null end,
          v_type not in ('CANCELLATION', 'EXPIRATION', 'SUBSCRIPTION_PAUSED', 'NON_RENEWING_PURCHASE'),
          case when v_type = 'BILLING_ISSUE' then coalesce(v_event_at, now()) else null end,
          case when v_type = 'CANCELLATION' then coalesce(v_event_at, now()) else null end,
          e ->> 'original_transaction_id', v_id, e, v_event_at, 'webhook'
        )
        on conflict (user_id, provider, entitlement, environment) do update set
          status = excluded.status,
          product_id = coalesce(excluded.product_id, s.product_id),
          store = coalesce(excluded.store, s.store),
          period_type = coalesce(excluded.period_type, s.period_type),
          -- Cancelamento/pausa mantêm o acesso até o fim do período já pago
          current_period_end = coalesce(excluded.current_period_end, s.current_period_end),
          grace_period_end = case
            when v_type = 'BILLING_ISSUE' then excluded.grace_period_end
            when v_type in ('RENEWAL', 'INITIAL_PURCHASE', 'UNCANCELLATION', 'PRODUCT_CHANGE') then null
            else s.grace_period_end end,
          will_renew = excluded.will_renew,
          billing_issue_detected_at = case
            when v_type = 'BILLING_ISSUE' then excluded.billing_issue_detected_at
            when v_type in ('RENEWAL', 'INITIAL_PURCHASE', 'UNCANCELLATION') then null
            else s.billing_issue_detected_at end,
          unsubscribe_detected_at = case
            when v_type = 'CANCELLATION' then excluded.unsubscribe_detected_at
            when v_type in ('UNCANCELLATION', 'INITIAL_PURCHASE', 'RENEWAL') then null
            else s.unsubscribe_detected_at end,
          original_transaction_id = coalesce(excluded.original_transaction_id, s.original_transaction_id),
          last_event_id = excluded.last_event_id,
          raw_event = excluded.raw_event,
          last_event_at = excluded.last_event_at,
          source = 'webhook';
      end if;
    end if;
  end if;

  insert into public.subscription_events (id, user_id, type, environment, event_at, payload, outcome)
  values (v_id, v_user, v_type, v_env, v_event_at, p_payload, v_outcome);

  return jsonb_build_object('outcome', v_outcome, 'event_id', v_id, 'user_id', v_user);
end;
$$;

-- ---------------------------------------------------------------------
-- Permissões
-- ---------------------------------------------------------------------
revoke execute on function public._accepted_environments() from public, anon, authenticated;
revoke execute on function public._subscription_grants_access(public.subscriptions) from public, anon, authenticated;
revoke execute on function public.user_has_pro(uuid) from public, anon, authenticated;
revoke execute on function public._business_month_start(uuid) from public, anon, authenticated;
revoke execute on function public._assert_product_limit(uuid) from public, anon, authenticated;
revoke execute on function public._assert_sales_limit(uuid) from public, anon, authenticated;
revoke execute on function public.tg_products_plan_limit() from public, anon, authenticated;
revoke execute on function public.tg_sales_plan_limit() from public, anon, authenticated;
revoke execute on function public.upsert_subscription_state(uuid, text, text, public.subscription_status, text, text, text, timestamptz, timestamptz, boolean, timestamptz, timestamptz, text) from public, anon, authenticated;
revoke execute on function public.apply_revenuecat_event(jsonb) from public, anon, authenticated;

grant execute on function public.business_plan(uuid) to authenticated, service_role;
grant execute on function public.user_has_pro(uuid) to service_role;
grant execute on function public.get_entitlements(uuid) to authenticated;
grant execute on function public.upsert_subscription_state(uuid, text, text, public.subscription_status, text, text, text, timestamptz, timestamptz, boolean, timestamptz, timestamptz, text) to service_role;
grant execute on function public.apply_revenuecat_event(jsonb) to service_role;
