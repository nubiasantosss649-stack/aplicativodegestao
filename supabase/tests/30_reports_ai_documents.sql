\o /dev/null
-- =====================================================================
-- Testes Fase 3: relatórios, recomendações, alertas, cota de IA,
-- orçamentos, documentos e exportação.
-- =====================================================================

insert into auth.users (id, email, raw_user_meta_data) values
  ('66666666-6666-6666-6666-666666666666', 'relatorio@teste.com', '{"full_name":"Dona Relatório"}'),
  ('77777777-7777-7777-7777-777777777777', 'vend3@teste.com', '{"full_name":"Vendedor 3"}');

set role authenticated;
select set_config('request.jwt.claim.sub', '66666666-6666-6666-6666-666666666666', false);

do $$
declare
  v_b public.businesses;
  v_cat uuid;
  v_a public.products;  -- vende bem, estoque baixo
  v_b2 public.products; -- preço abaixo do custo
  v_c public.products;  -- parado
  v_cust uuid;
  v_today date;
  i int;
begin
  v_b := public.create_business('Loja Relatório', 'retail');
  perform set_config('test.rb', v_b.id::text, false);
  v_today := (now() at time zone 'America/Sao_Paulo')::date;

  insert into public.product_categories (business_id, name) values (v_b.id, 'Bebidas') returning id into v_cat;
  v_a := public.create_product(v_b.id, 'Refrigerante', 800, 500, 20, 5, 'un', v_cat);
  v_b2 := public.create_product(v_b.id, 'Promo Errada', 400, 600, 50, 0);
  v_c := public.create_product(v_b.id, 'Produto Parado', 1000, 700, 10, 0);
  perform set_config('test.ra', v_a.id::text, false);
  perform set_config('test.rb2', v_b2.id::text, false);
  insert into public.customers (business_id, name) values (v_b.id, 'Cliente Top') returning id into v_cust;
  perform set_config('test.rcust', v_cust::text, false);

  -- 15 vendas de refrigerante (1 un) e 2 de produto abaixo do custo
  for i in 1..15 loop
    perform public.complete_sale(v_b.id, gen_random_uuid(),
      jsonb_build_array(jsonb_build_object('product_id', v_a.id, 'quantity', 1)),
      jsonb_build_array(jsonb_build_object('method', case when i % 2 = 0 then 'pix' else 'cash' end, 'amount_cents', 800)),
      case when i <= 3 then v_cust else null end);
  end loop;
  for i in 1..2 loop
    perform public.complete_sale(v_b.id, gen_random_uuid(),
      jsonb_build_array(jsonb_build_object('product_id', v_b2.id, 'quantity', 1)),
      jsonb_build_array(jsonb_build_object('method', 'card', 'amount_cents', 400)));
  end loop;

  -- Despesas: mês anterior x mês atual (alta de 100% em Aluguel)
  insert into public.financial_entries (business_id, kind, category_id, description, amount_cents, competence_date, status, paid_at, method)
  select v_b.id, 'expense', c.id, 'Aluguel', 100000, (date_trunc('month', v_today) - interval '1 month')::date, 'paid', now(), 'pix'
  from public.finance_categories c where c.business_id = v_b.id and c.name = 'Aluguel';
  insert into public.financial_entries (business_id, kind, category_id, description, amount_cents, competence_date, status, paid_at, method)
  select v_b.id, 'expense', c.id, 'Aluguel', 200000, v_today, 'paid', now(), 'pix'
  from public.finance_categories c where c.business_id = v_b.id and c.name = 'Aluguel';
end $$;

-- ---------------------------------------------------------------------
-- Relatório de vendas
-- ---------------------------------------------------------------------
do $$
declare
  v_bid uuid := current_setting('test.rb')::uuid;
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  r jsonb;
begin
  r := public.sales_report(v_bid, v_today - 6, v_today);
  assert (r #>> '{summary,sales_count}')::int = 17, 'vendas: ' || (r #>> '{summary,sales_count}');
  assert (r #>> '{summary,revenue_cents}')::bigint = 15 * 800 + 2 * 400, 'faturamento';
  assert (r #>> '{summary,cogs_cents}')::bigint = 15 * 500 + 2 * 600, 'CMV';
  assert (r #>> '{summary,gross_profit_cents}')::bigint = 12800 - 8700, 'lucro bruto';
  assert r #>> '{by_product,0,name}' = 'Refrigerante', 'produto mais vendido';
  assert (r #>> '{by_product,1,profit_cents}')::bigint = -400, 'prejuízo no produto abaixo do custo';
  assert r #>> '{by_category,0,category}' = 'Bebidas', 'categoria';
  assert jsonb_array_length(r -> 'by_payment_method') = 3, 'formas de pagamento';
  assert r #>> '{top_customers,0,name}' = 'Cliente Top', 'melhor cliente';
  assert (r #>> '{top_customers,0,sales_count}')::int = 3, 'compras do melhor cliente';
end $$;

-- ---------------------------------------------------------------------
-- Recomendações de estoque, preços e alertas
-- ---------------------------------------------------------------------
do $$
declare
  v_bid uuid := current_setting('test.rb')::uuid;
  r jsonb;
  v_item jsonb;
  v_codes text[];
begin
  r := public.stock_recommendations(v_bid);
  select value into v_item from jsonb_array_elements(r -> 'items') where value ->> 'name' = 'Refrigerante';
  -- Estoque 5 = mínimo 5 => abaixo do mínimo; giro 15/30 = 0,5/dia; sugestão = ceil(0,5*30 + 5 - 5) = 15
  assert v_item ->> 'status' = 'below_minimum', 'status refrigerante: ' || coalesce(v_item ->> 'status', 'null');
  assert (v_item ->> 'suggested_qty')::numeric = 15, 'sugestão de reposição: ' || (v_item ->> 'suggested_qty');
  assert (v_item ->> 'days_of_cover')::numeric = 10, 'dias de cobertura';

  r := public.pricing_insights(v_bid, 30);
  assert r #>> '{below_cost,0,name}' = 'Promo Errada', 'produto abaixo do custo';
  -- 600 / 0,7 = 857,14 -> 860
  assert (r #>> '{below_cost,0,suggested_price_cents}')::bigint = 860, 'preço sugerido';
  assert (r ->> 'healthy_count')::int = 2, 'produtos saudáveis';

  r := public.business_alerts(v_bid);
  select array_agg(value ->> 'code') into v_codes from jsonb_array_elements(r -> 'alerts');
  assert 'sold_below_cost' = any (v_codes), 'alerta de venda abaixo do custo';
  assert 'price_below_cost' = any (v_codes), 'alerta de preço abaixo do custo';
  assert 'expense_increase' = any (v_codes), 'alerta de despesa em alta: ' || array_to_string(v_codes, ',');
  assert 'negative_profit' = any (v_codes), 'alerta de prejuízo';

  r := public.expense_comparison(v_bid);
  assert (r #>> '{categories,0,change_pct}')::numeric = 100, 'aumento de 100%';
end $$;

-- ---------------------------------------------------------------------
-- Orçamentos e documentos
-- ---------------------------------------------------------------------
do $$
declare
  v_bid uuid := current_setting('test.rb')::uuid;
  q public.quotes;
  d public.documents;
begin
  q := public.save_quote(v_bid,
    jsonb_build_array(
      jsonb_build_object('product_id', current_setting('test.ra'), 'description', 'Refrigerante', 'quantity', 10, 'unit_price_cents', 750),
      jsonb_build_object('description', 'Entrega', 'quantity', 1, 'unit_price_cents', 1500)),
    current_setting('test.rcust')::uuid, 500, null, 'Validade 15 dias');
  assert q.number = 1 and q.subtotal_cents = 9000 and q.total_cents = 8500, 'totais do orçamento';
  assert (select count(*) from public.quote_items where quote_id = q.id) = 2, 'itens do orçamento';

  begin
    update public.quotes set total_cents = 1 where id = q.id;
    raise exception 'FALHA: total do orçamento alterado diretamente';
  exception when insufficient_privilege then null;
  end;
  update public.quotes set status = 'approved' where id = q.id;
  assert (select status from public.quotes where id = q.id) = 'approved', 'status do orçamento';

  begin
    perform public.save_quote(v_bid, '[]'::jsonb);
    raise exception 'FALHA: orçamento vazio aceito';
  exception when invalid_parameter_value then null;
  end;

  d := public.register_document(v_bid, 'service_receipt', null, 'Recibo de serviço', 15000, '{"payer":"Ana"}');
  assert d.number = 1, 'numeração do recibo';
  d := public.register_document(v_bid, 'payment_receipt', gen_random_uuid(), 'Recibo de pagamento', 1000);
  assert d.number = 2, 'numeração sequencial';
  d := public.register_document(v_bid, 'quote', q.id, 'Orçamento 1', 8500);
  assert d.number is null, 'orçamento não consome número de recibo';
  begin
    insert into public.documents (business_id, kind, reference_id) values (v_bid, 'quote', q.id);
    raise exception 'FALHA: documento inserido diretamente';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ---------------------------------------------------------------------
-- Exportação de dados (disponível no Plano Grátis)
-- ---------------------------------------------------------------------
do $$
declare
  v_bid uuid := current_setting('test.rb')::uuid;
  r jsonb;
begin
  assert public.business_plan(v_bid) = 'free', 'negócio no plano grátis';
  r := public.export_business_data(v_bid);
  assert jsonb_array_length(r -> 'products') = 3, 'produtos exportados';
  assert jsonb_array_length(r -> 'sales') = 17, 'vendas exportadas';
  assert jsonb_array_length(r -> 'sale_items') = 17, 'itens exportados';
  assert not (r -> 'business') ? 'owner_id', 'não exporta ids internos de dono';
  assert not (r -> 'sales' -> 0) ? 'idempotency_key', 'não exporta chaves internas';
end $$;

-- ---------------------------------------------------------------------
-- Cota de IA: Grátis bloqueado; Pro limitado por mês
-- ---------------------------------------------------------------------
do $$
declare
  v_bid uuid := current_setting('test.rb')::uuid;
begin
  begin
    perform public.ai_reserve_request(v_bid);
    raise exception 'FALHA: IA liberada no plano grátis';
  exception when raise_exception then
    if sqlerrm like 'FALHA%' then raise; end if;
    assert sqlerrm like '%plano Pro IA%', sqlerrm;
  end;
  assert (public.ai_usage_status(v_bid) ->> 'limit')::int = 0, 'limite zero no grátis';
end $$;

reset role;
update public.plans set ai_monthly_requests = 2 where id = 'pro';
set role service_role;
do $$ begin
  perform public.upsert_subscription_state('66666666-6666-6666-6666-666666666666', 'production', 'pro', 'active',
    'gestao_pro_mensal', 'APP_STORE', 'NORMAL', now() + interval '30 days', null, true, null, null);
end $$;
reset role;
set role authenticated;

do $$
declare
  v_bid uuid := current_setting('test.rb')::uuid;
  r jsonb;
begin
  r := public.ai_reserve_request(v_bid);
  assert (r ->> 'remaining')::int = 1, 'restante após 1ª pergunta';
  r := public.ai_reserve_request(v_bid);
  assert (r ->> 'remaining')::int = 0, 'restante após 2ª pergunta';
  begin
    perform public.ai_reserve_request(v_bid);
    raise exception 'FALHA: cota de IA excedida aceita';
  exception when raise_exception then
    if sqlerrm like 'FALHA%' then raise; end if;
    assert sqlerrm like '%Limite mensal de 2 perguntas%', sqlerrm;
  end;
  assert (public.ai_usage_status(v_bid) ->> 'used')::int = 2, 'uso registrado';
  begin
    perform public.ai_record_tokens(v_bid, auth.uid(), 10, 10);
    raise exception 'FALHA: app registrou tokens';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
set role service_role;
do $$ begin
  perform public.ai_record_tokens((select id from public.businesses where name = 'Loja Relatório'),
    '66666666-6666-6666-6666-666666666666', 1200, 300);
  assert (select input_tokens from public.ai_usage where user_id = '66666666-6666-6666-6666-666666666666') = 1200, 'tokens de entrada';
end $$;
reset role;
update public.plans set ai_monthly_requests = 200 where id = 'pro';

-- ---------------------------------------------------------------------
-- Permissões: vendedor não vê custos/lucro nem alertas financeiros;
-- intruso não acessa nada
-- ---------------------------------------------------------------------
insert into public.business_members (business_id, user_id, role)
values ((select id from public.businesses where name = 'Loja Relatório'), '77777777-7777-7777-7777-777777777777', 'seller');
set role authenticated;
select set_config('request.jwt.claim.sub', '77777777-7777-7777-7777-777777777777', false);
do $$
declare
  v_bid uuid := (select id from public.businesses where name = 'Loja Relatório');
  r jsonb;
begin
  r := public.sales_report(v_bid, current_date - 6, current_date + 1);
  assert r #> '{summary,gross_profit_cents}' = 'null'::jsonb, 'vendedor não vê lucro';
  assert r #> '{by_product,0,cost_cents}' = 'null'::jsonb, 'vendedor não vê custo';
  begin
    perform public.business_alerts(v_bid);
    raise exception 'FALHA: vendedor viu alertas financeiros';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.export_business_data(v_bid);
    raise exception 'FALHA: vendedor exportou dados';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
do $$
declare
  v_bid uuid;
begin
  reset role;
  select id into v_bid from public.businesses where name = 'Loja Relatório';
  set role authenticated;
  begin
    perform public.sales_report(v_bid, current_date, current_date);
    raise exception 'FALHA: intruso acessou relatório';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.ai_reserve_request(v_bid);
    raise exception 'FALHA: intruso usou IA';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

\echo '   ✔ relatórios, recomendações, alertas, cota de IA, orçamentos e exportação'
