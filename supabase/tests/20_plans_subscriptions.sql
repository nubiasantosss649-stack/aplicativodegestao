\o /dev/null
-- =====================================================================
-- Testes Fase 2: limites do Plano Grátis, webhooks RevenueCat, ambientes
-- (sandbox x produção), idempotência e permissões.
-- =====================================================================

insert into auth.users (id, email, raw_user_meta_data) values
  ('44444444-4444-4444-4444-444444444444', 'loja@teste.com', '{"full_name":"Loja Free"}'),
  ('55555555-5555-5555-5555-555555555555', 'outro@teste.com', '{"full_name":"Outro"}');

-- Helper de evento (somente para testes)
create or replace function pg_temp.rc_event(
  p_id text, p_type text, p_user text, p_expires timestamptz, p_event_at timestamptz,
  p_env text default 'PRODUCTION', p_period text default 'NORMAL', p_extra jsonb default '{}'::jsonb
) returns jsonb language sql as $$
  select jsonb_build_object('api_version', '1.0', 'event', jsonb_build_object(
    'id', p_id, 'type', p_type, 'app_user_id', p_user,
    'entitlement_ids', jsonb_build_array('pro'),
    'product_id', 'gestao_pro_mensal', 'store', 'PLAY_STORE', 'environment', p_env,
    'period_type', p_period,
    'expiration_at_ms', (extract(epoch from p_expires) * 1000)::bigint,
    'event_timestamp_ms', (extract(epoch from p_event_at) * 1000)::bigint
  ) || p_extra);
$$;
grant execute on function pg_temp.rc_event(text, text, text, timestamptz, timestamptz, text, text, jsonb) to service_role;

-- ---------------------------------------------------------------------
-- Plano Grátis: limite de produtos e de vendas no mês
-- ---------------------------------------------------------------------
set role authenticated;
select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', false);

do $$
declare
  v_b public.businesses;
  v_p public.products;
  v_e jsonb;
  i int;
begin
  v_b := public.create_business('Loja Free', 'retail');
  perform set_config('test.free_bid', v_b.id::text, false);
  assert public.business_plan(v_b.id) = 'free', 'negócio novo deve ser Grátis';

  for i in 1..30 loop
    v_p := public.create_product(v_b.id, 'Produto ' || i, 100, 50, 1000);
  end loop;
  perform set_config('test.free_p', v_p.id::text, false);

  begin
    perform public.create_product(v_b.id, 'Produto 31', 100);
    raise exception 'FALHA: 31º produto aceito no Plano Grátis';
  exception when raise_exception then
    if sqlerrm like 'FALHA%' then raise; end if;
    assert sqlerrm like '%Limite de 30 produtos%', sqlerrm;
  end;

  -- Desativar libera vaga; reativar acima do limite é bloqueado
  update public.products set active = false where id = v_p.id;
  perform public.create_product(v_b.id, 'Produto 31', 100);
  begin
    update public.products set active = true where id = v_p.id;
    raise exception 'FALHA: reativação acima do limite aceita';
  exception when raise_exception then
    if sqlerrm like 'FALHA%' then raise; end if;
  end;
  select id into v_p from public.products where business_id = v_b.id and active limit 1;
  perform set_config('test.free_p', v_p.id::text, false);

  for i in 1..50 loop
    perform public.complete_sale(v_b.id, gen_random_uuid(),
      jsonb_build_array(jsonb_build_object('product_id', v_p.id, 'quantity', 1)),
      jsonb_build_array(jsonb_build_object('method', 'cash', 'amount_cents', 100)));
  end loop;

  begin
    perform public.complete_sale(v_b.id, gen_random_uuid(),
      jsonb_build_array(jsonb_build_object('product_id', v_p.id, 'quantity', 1)),
      jsonb_build_array(jsonb_build_object('method', 'cash', 'amount_cents', 100)));
    raise exception 'FALHA: 51ª venda aceita no Plano Grátis';
  exception when raise_exception then
    if sqlerrm like 'FALHA%' then raise; end if;
    assert sqlerrm like '%50 vendas por mês%', sqlerrm;
  end;
  -- A venda rejeitada não baixou estoque
  assert (select stock_qty from public.products where id = v_p.id) = 950, 'estoque alterado por venda rejeitada';

  v_e := public.get_entitlements(v_b.id);
  assert v_e ->> 'plan' = 'free', 'plano deveria ser free';
  assert (v_e #>> '{usage,sales_this_month}')::int = 50, 'uso de vendas incorreto';
  assert (v_e #>> '{usage,active_products}')::int = 30, 'uso de produtos incorreto';
  assert (v_e #>> '{limits,max_active_products}')::int = 30, 'limite incorreto';
  assert v_e -> 'subscription' = 'null'::jsonb, 'não deveria haver assinatura';
end $$;

-- O app NÃO pode gravar assinaturas nem processar eventos
do $$
begin
  begin
    insert into public.subscriptions (user_id, status) values ('44444444-4444-4444-4444-444444444444', 'active');
    raise exception 'FALHA: app gravou assinatura';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.apply_revenuecat_event('{"event":{"id":"x","type":"INITIAL_PURCHASE"}}'::jsonb);
    raise exception 'FALHA: app processou webhook';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.upsert_subscription_state('44444444-4444-4444-4444-444444444444', 'production', 'pro', 'active',
      'p', 'APP_STORE', 'NORMAL', now() + interval '30 days', null, true, null, null);
    raise exception 'FALHA: app sincronizou assinatura';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ---------------------------------------------------------------------
-- Webhooks (executados como service_role, como na Edge Function)
-- ---------------------------------------------------------------------
reset role;
set role service_role;

do $$
declare
  v_uid text := '44444444-4444-4444-4444-444444444444';
  v_bid uuid := current_setting('test.free_bid')::uuid;
  v_r jsonb;
begin
  -- Compra em SANDBOX não libera Pro em projeto de produção
  v_r := public.apply_revenuecat_event(pg_temp.rc_event('sb-1', 'INITIAL_PURCHASE', v_uid, now() + interval '7 days', now() - interval '10 minutes', 'SANDBOX', 'TRIAL'));
  assert v_r ->> 'outcome' = 'applied', v_r::text;
  assert public.business_plan(v_bid) = 'free', 'sandbox não pode liberar Pro em produção';

  -- Teste grátis em produção
  v_r := public.apply_revenuecat_event(pg_temp.rc_event('ev-1', 'INITIAL_PURCHASE', v_uid, now() + interval '7 days', now() - interval '9 minutes', 'PRODUCTION', 'TRIAL'));
  assert public.business_plan(v_bid) = 'pro', 'teste grátis deveria liberar Pro';
  assert (select status from public.subscriptions where user_id = v_uid::uuid and environment = 'production') = 'trialing', 'status trialing';

  -- Evento duplicado é ignorado
  v_r := public.apply_revenuecat_event(pg_temp.rc_event('ev-1', 'INITIAL_PURCHASE', v_uid, now() + interval '7 days', now() - interval '9 minutes'));
  assert v_r ->> 'outcome' = 'duplicate', 'evento duplicado deveria ser ignorado';

  -- Renovação
  perform public.apply_revenuecat_event(pg_temp.rc_event('ev-2', 'RENEWAL', v_uid, now() + interval '30 days', now() - interval '8 minutes'));
  assert (select status from public.subscriptions where user_id = v_uid::uuid and environment = 'production') = 'active', 'status active';

  -- Evento antigo chegando depois não sobrescreve
  v_r := public.apply_revenuecat_event(pg_temp.rc_event('ev-old', 'EXPIRATION', v_uid, now() - interval '1 day', now() - interval '1 hour'));
  assert v_r ->> 'outcome' = 'stale', 'evento fora de ordem deveria ser ignorado';
  assert public.business_plan(v_bid) = 'pro', 'evento antigo não pode remover o Pro';

  -- Cancelamento: mantém acesso até o fim do período pago
  perform public.apply_revenuecat_event(pg_temp.rc_event('ev-3', 'CANCELLATION', v_uid, now() + interval '30 days', now() - interval '7 minutes'));
  assert public.business_plan(v_bid) = 'pro', 'cancelado ainda vigente deve manter Pro';
  assert (select will_renew from public.subscriptions where user_id = v_uid::uuid and environment = 'production') = false, 'will_renew false';

  -- Reativação
  perform public.apply_revenuecat_event(pg_temp.rc_event('ev-4', 'UNCANCELLATION', v_uid, now() + interval '30 days', now() - interval '6 minutes'));
  assert (select will_renew from public.subscriptions where user_id = v_uid::uuid and environment = 'production'), 'will_renew true';

  -- Problema de cobrança com período de tolerância: mantém acesso
  perform public.apply_revenuecat_event(pg_temp.rc_event('ev-5', 'BILLING_ISSUE', v_uid, now() - interval '1 minute', now() - interval '5 minutes',
    'PRODUCTION', 'NORMAL', jsonb_build_object('grace_period_expiration_at_ms', (extract(epoch from now() + interval '3 days') * 1000)::bigint)));
  assert (select status from public.subscriptions where user_id = v_uid::uuid and environment = 'production') = 'grace_period', 'grace_period';
  assert public.business_plan(v_bid) = 'pro', 'período de tolerância deve manter Pro';

  -- Outro entitlement é ignorado
  v_r := public.apply_revenuecat_event(jsonb_build_object('event', jsonb_build_object(
    'id', 'ev-other', 'type', 'EXPIRATION', 'app_user_id', v_uid, 'entitlement_ids', jsonb_build_array('outro'),
    'environment', 'PRODUCTION', 'event_timestamp_ms', (extract(epoch from now()) * 1000)::bigint)));
  assert v_r ->> 'outcome' = 'ignored_other_entitlement', v_r::text;

  -- Usuário desconhecido é registrado e ignorado
  v_r := public.apply_revenuecat_event(pg_temp.rc_event('ev-unk', 'INITIAL_PURCHASE', '$RCAnonymousID:abc', now() + interval '1 day', now()));
  assert v_r ->> 'outcome' = 'ignored_unknown_user', v_r::text;

  -- Expiração: volta ao Grátis
  perform public.apply_revenuecat_event(pg_temp.rc_event('ev-6', 'EXPIRATION', v_uid, now() - interval '1 minute', now() - interval '4 minutes'));
  assert public.business_plan(v_bid) = 'free', 'expirado deve voltar ao Grátis';

  assert (select count(*) from public.subscription_events) = 10, 'todos os eventos devem ser registrados';
end $$;

-- Após expirar: dados continuam acessíveis; novas vendas acima do limite não
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', false);
do $$
declare
  v_bid uuid := current_setting('test.free_bid')::uuid;
  v_e jsonb;
begin
  assert (select count(*) from public.sales where business_id = v_bid) = 50, 'histórico deve continuar acessível';
  assert (select count(*) from public.products where business_id = v_bid) = 31, 'produtos devem continuar acessíveis';
  perform public.dashboard_summary(v_bid, current_date - 30, current_date);
  v_e := public.get_entitlements(v_bid);
  assert v_e ->> 'plan' = 'free', 'plano free';
  assert v_e #>> '{subscription,status}' = 'expired', 'detalhe da assinatura para o dono';
  assert (v_e #>> '{subscription,has_access}')::boolean = false, 'sem acesso';
end $$;

-- ---------------------------------------------------------------------
-- Sincronização autoritativa (REST) libera Pro e remove os limites
-- ---------------------------------------------------------------------
reset role;
set role service_role;
do $$
begin
  perform public.upsert_subscription_state('44444444-4444-4444-4444-444444444444', 'production', 'pro', 'active',
    'gestao_pro_mensal', 'PLAY_STORE', 'NORMAL', now() + interval '30 days', null, true, null, null);
end $$;

reset role;
set role authenticated;
do $$
declare
  v_bid uuid := current_setting('test.free_bid')::uuid;
  v_p uuid := current_setting('test.free_p')::uuid;
  v_e jsonb;
begin
  assert public.business_plan(v_bid) = 'pro', 'sync deveria liberar Pro';
  perform public.create_product(v_bid, 'Produto Pro', 100);
  perform public.complete_sale(v_bid, gen_random_uuid(),
    jsonb_build_array(jsonb_build_object('product_id', v_p, 'quantity', 1)),
    jsonb_build_array(jsonb_build_object('method', 'pix', 'amount_cents', 100)));
  v_e := public.get_entitlements(v_bid);
  assert v_e ->> 'plan' = 'pro', 'plano pro';
  assert v_e #> '{limits,max_active_products}' = 'null'::jsonb, 'Pro sem limite de produtos';
end $$;

-- Outro usuário não vê assinatura nem entitlements alheios
select set_config('request.jwt.claim.sub', '55555555-5555-5555-5555-555555555555', false);
do $$
begin
  assert (select count(*) from public.subscriptions) = 0, 'não pode ver assinaturas de outros';
  begin
    perform public.get_entitlements(current_setting('test.free_bid')::uuid);
    raise exception 'FALHA: acesso a entitlements de outro negócio';
  exception when insufficient_privilege then null;
  end;
  assert (select count(*) from public.plans) = 2, 'planos são públicos';
end $$;

-- ---------------------------------------------------------------------
-- Projeto de testes: aceitar sandbox libera Pro de compras sandbox
-- ---------------------------------------------------------------------
reset role;
update public.app_settings set value = '["production","sandbox"]' where key = 'accepted_subscription_environments';
insert into public.businesses (owner_id, name) values ('55555555-5555-5555-5555-555555555555', 'Loja Sandbox');
set role service_role;
do $$
begin
  perform public.apply_revenuecat_event(pg_temp.rc_event('sb-2', 'INITIAL_PURCHASE', '55555555-5555-5555-5555-555555555555',
    now() + interval '3 days', now(), 'SANDBOX'));
  assert public.user_has_pro('55555555-5555-5555-5555-555555555555'), 'sandbox aceito em projeto de testes';
end $$;
reset role;
update public.app_settings set value = '["production"]' where key = 'accepted_subscription_environments';
do $$ begin
  assert not public.user_has_pro('55555555-5555-5555-5555-555555555555'), 'produção não aceita sandbox';
end $$;

\echo '   ✔ planos, limites, webhooks RevenueCat, ambientes e permissões'
