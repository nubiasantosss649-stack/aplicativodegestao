\o /dev/null
-- =====================================================================
-- Testes Fase 4: exclusão de conta e auditoria de segurança do banco.
-- =====================================================================

insert into auth.users (id, email, raw_user_meta_data) values
  ('88888888-8888-8888-8888-888888888888', 'sai@teste.com', '{"full_name":"Usuária que sai"}'),
  ('99999999-9999-9999-9999-999999999999', 'fica@teste.com', '{"full_name":"Usuário que fica"}');

-- Dono que fica: negócio onde a usuária que sai é vendedora
set role authenticated;
select set_config('request.jwt.claim.sub', '99999999-9999-9999-9999-999999999999', false);
do $$
declare v_b public.businesses;
begin
  v_b := public.create_business('Negócio que Fica', 'retail');
  perform set_config('test.keep_bid', v_b.id::text, false);
  perform public.create_product(v_b.id, 'Produto que fica', 100, 50, 10);
end $$;
reset role;
insert into public.business_members (business_id, user_id, role)
values (current_setting('test.keep_bid')::uuid, '88888888-8888-8888-8888-888888888888', 'seller');

-- Usuária que sai: negócio com todos os tipos de dado
set role authenticated;
select set_config('request.jwt.claim.sub', '88888888-8888-8888-8888-888888888888', false);
do $$
declare
  v_b public.businesses;
  v_p public.products;
  v_c uuid;
  v_s public.sales;
  v_q public.quotes;
begin
  v_b := public.create_business('Negócio que Sai', 'beauty', 'cpf', '52998224725');
  perform set_config('test.del_bid', v_b.id::text, false);
  v_p := public.create_product(v_b.id, 'Escova', 5000, 1000, 5);
  insert into public.customers (business_id, name, phone) values (v_b.id, 'Cliente Fiel', '11977776666') returning id into v_c;
  v_s := public.complete_sale(v_b.id, gen_random_uuid(),
    jsonb_build_array(jsonb_build_object('product_id', v_p.id, 'quantity', 1)),
    jsonb_build_array(jsonb_build_object('method', 'credit', 'amount_cents', 5000)), v_c);
  perform public.receive_payment(v_b.id, v_c, 2000, 'pix', gen_random_uuid());
  insert into public.financial_entries (business_id, kind, description, amount_cents, status, paid_at, method)
  values (v_b.id, 'expense', 'Aluguel', 10000, 'paid', now(), 'pix');
  v_q := public.save_quote(v_b.id, jsonb_build_array(jsonb_build_object('description', 'Corte', 'quantity', 1, 'unit_price_cents', 4000)), v_c);
  perform public.register_document(v_b.id, 'quote', v_q.id, 'Orçamento', 4000);
  insert into storage.objects (bucket_id, name) values ('product-photos', v_b.id || '/foto.jpg');
end $$;
reset role;

-- Assinatura e uso de IA também devem sumir
set role service_role;
do $$ begin
  perform public.upsert_subscription_state('88888888-8888-8888-8888-888888888888', 'production', 'pro', 'canceled',
    'gestao_pro_mensal', 'PLAY_STORE', 'NORMAL', now() - interval '1 day', null, false, null, now());
end $$;
reset role;

-- O app não pode chamar a exclusão diretamente
set role authenticated;
do $$ begin
  begin
    perform public.delete_user_data('88888888-8888-8888-8888-888888888888');
    raise exception 'FALHA: app executou exclusão de dados';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Exclusão (como a Edge Function: service_role + remoção do usuário do Auth)
set role service_role;
do $$
declare
  v_ids uuid[];
  v_del uuid := current_setting('test.del_bid')::uuid;
begin
  v_ids := public.delete_user_data('88888888-8888-8888-8888-888888888888');
  assert v_ids = array[v_del], 'deve retornar o negócio excluído para limpeza do Storage';
end $$;
reset role;
delete from storage.objects where bucket_id = 'product-photos' and name like current_setting('test.del_bid') || '/%';
delete from auth.users where id = '88888888-8888-8888-8888-888888888888';

do $$
declare
  v_del uuid := current_setting('test.del_bid')::uuid;
  v_keep uuid := current_setting('test.keep_bid')::uuid;
  v_uid uuid := '88888888-8888-8888-8888-888888888888';
  t text;
  n bigint;
begin
  foreach t in array array['products', 'stock_movements', 'customers', 'sales', 'sale_items', 'sale_payments',
    'receivables', 'receivable_payments', 'financial_entries', 'finance_categories', 'quotes', 'quote_items',
    'documents', 'audit_logs', 'business_counters', 'product_categories', 'business_members']
  loop
    execute format('select count(*) from public.%I where business_id = $1', t) into n using v_del;
    assert n = 0, 'restaram dados em ' || t;
  end loop;
  assert not exists (select 1 from public.businesses where id = v_del), 'negócio não excluído';
  assert not exists (select 1 from public.profiles where id = v_uid), 'perfil não excluído';
  assert not exists (select 1 from public.subscriptions where user_id = v_uid), 'assinatura não excluída';
  assert not exists (select 1 from public.business_members where user_id = v_uid), 'vínculo em outro negócio não removido';
  assert not exists (select 1 from storage.objects where name like v_del || '/%'), 'fotos não removidas';
  assert (select count(*) from public.account_deletion_log where user_id = v_uid) = 1, 'exclusão não registrada';
  -- Dados de terceiros intactos
  assert exists (select 1 from public.businesses where id = v_keep), 'negócio de terceiro afetado';
  assert (select count(*) from public.products where business_id = v_keep) = 1, 'produtos de terceiro afetados';
end $$;

-- Cliente com fiado continua protegido contra exclusão isolada
set role authenticated;
select set_config('request.jwt.claim.sub', '99999999-9999-9999-9999-999999999999', false);
do $$
declare
  v_bid uuid := current_setting('test.keep_bid')::uuid;
  v_c uuid;
begin
  insert into public.customers (business_id, name) values (v_bid, 'Devedor') returning id into v_c;
  perform public.create_receivable(v_bid, v_c, 'Dívida', 1000, current_date);
  begin
    delete from public.customers where id = v_c;
    raise exception 'FALHA: cliente com fiado excluído';
  exception when foreign_key_violation then null;
  end;
end $$;
reset role;

-- =====================================================================
-- Auditoria de segurança
-- =====================================================================
do $$
declare
  r record;
  v_internal text[];
begin
  -- 1. RLS habilitado em TODAS as tabelas do schema public
  for r in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
  loop
    raise exception 'FALHA: tabela sem RLS: %', r.relname;
  end loop;

  -- 2. Usuário anônimo sem acesso a tabelas (exceto leitura de planos/configurações públicas)
  for r in select table_name, privilege_type from information_schema.role_table_grants
           where grantee = 'anon' and table_schema = 'public'
             and not (table_name in ('plans', 'app_settings') and privilege_type = 'SELECT')
  loop
    raise exception 'FALHA: anon com % em %', r.privilege_type, r.table_name;
  end loop;

  -- 3. Toda função SECURITY DEFINER fixa o search_path
  for r in select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prosecdef
             and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
  loop
    raise exception 'FALHA: função SECURITY DEFINER sem search_path: %', r.proname;
  end loop;

  -- 4. Funções internas e de backend não executáveis pelo app nem por anon
  select array_agg(p.oid::regprocedure::text) into v_internal
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and (
    p.proname like '\_%' or p.proname in ('apply_revenuecat_event', 'upsert_subscription_state', 'ai_record_tokens',
      'ai_refund_request', 'delete_user_data', 'user_has_pro', 'handle_new_user')
  ) and p.proname not like 'tg\_%';
  for r in select unnest(v_internal) as fn
  loop
    if has_function_privilege('authenticated', r.fn, 'EXECUTE') then
      raise exception 'FALHA: authenticated pode executar %', r.fn;
    end if;
    if has_function_privilege('anon', r.fn, 'EXECUTE') then
      raise exception 'FALHA: anon pode executar %', r.fn;
    end if;
  end loop;

  -- 5. Anon não executa nenhuma função pública
  for r in select p.oid::regprocedure::text as fn from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'EXECUTE')
  loop
    raise exception 'FALHA: anon pode executar %', r.fn;
  end loop;

  -- 6. Tabelas críticas sem escrita direta pelo app
  for r in select t, p from unnest(array['sales', 'sale_items', 'sale_payments', 'stock_movements', 'receivable_payments',
             'subscriptions', 'subscription_events', 'audit_logs', 'ai_usage', 'documents', 'business_counters',
             'account_deletion_log', 'businesses', 'products', 'quotes', 'quote_items']) t,
           unnest(array['INSERT', 'DELETE']) p
  loop
    if r.t in ('quotes') and r.p = 'DELETE' then continue; end if;
    if has_table_privilege('authenticated', 'public.' || r.t, r.p) then
      raise exception 'FALHA: authenticated tem % em %', r.p, r.t;
    end if;
  end loop;

  -- 7. Colunas sensíveis não atualizáveis pelo app
  if has_column_privilege('authenticated', 'public.products', 'stock_qty', 'UPDATE') then
    raise exception 'FALHA: estoque atualizável diretamente';
  end if;
  if has_column_privilege('authenticated', 'public.receivables', 'paid_cents', 'UPDATE')
     or has_column_privilege('authenticated', 'public.receivables', 'status', 'UPDATE') then
    raise exception 'FALHA: pagamentos de fiado atualizáveis diretamente';
  end if;
  if has_column_privilege('authenticated', 'public.businesses', 'owner_id', 'UPDATE') then
    raise exception 'FALHA: dono do negócio alterável';
  end if;
  if has_column_privilege('authenticated', 'public.quotes', 'total_cents', 'UPDATE') then
    raise exception 'FALHA: total de orçamento alterável';
  end if;

  -- 8. Bucket de fotos é privado
  if exists (select 1 from storage.buckets where id = 'product-photos' and public) then
    raise exception 'FALHA: bucket de fotos público';
  end if;
end $$;

\echo '   ✔ exclusão de conta e auditoria de segurança (RLS, privilégios, funções, storage)'
