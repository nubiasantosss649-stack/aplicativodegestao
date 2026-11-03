-- Dados de DEMONSTRAÇÃO para capturas de tela das lojas (ambiente local).
-- Requer o usuário demo já criado via Auth; :uid é passado pelo psql.
\set ON_ERROR_STOP 1
select set_config('request.jwt.claim.sub', :'uid', false);
select set_config('request.jwt.claims', json_build_object('sub', :'uid', 'role', 'authenticated')::text, false);

-- Assinatura Pro (somente neste ambiente local de demonstração)
select public.upsert_subscription_state(:'uid'::uuid, 'production', 'pro', 'active', 'gestao_pro_mensal', 'PLAY_STORE',
  'NORMAL', now() + interval '25 days', null, true, null, null);

create temp table demo_dates (sale_id uuid primary key, at timestamp not null);
grant all on demo_dates to authenticated;

set role authenticated;
do $$
declare
  v_b public.businesses;
  v_cat_bebidas uuid; v_cat_mercearia uuid; v_cat_limpeza uuid; v_cat_padaria uuid;
  v_products uuid[] := '{}';
  v_customers uuid[] := '{}';
  v_p public.products;
  v_s public.sales;
  v_c uuid;
  d int; n int; i int; q int; idx int;
  v_method text;
  v_price bigint;
begin
  perform setseed(0.42);
  v_b := public.create_business('Mercadinho da Maria', 'grocery', 'cnpj', '11222333000181', '11988887777');
  insert into public.product_categories (business_id, name) values (v_b.id, 'Bebidas') returning id into v_cat_bebidas;
  insert into public.product_categories (business_id, name) values (v_b.id, 'Mercearia') returning id into v_cat_mercearia;
  insert into public.product_categories (business_id, name) values (v_b.id, 'Limpeza') returning id into v_cat_limpeza;
  insert into public.product_categories (business_id, name) values (v_b.id, 'Padaria') returning id into v_cat_padaria;

  v_p := public.create_product(v_b.id, 'Arroz Tipo 1 5kg', 2590, 1890, 80, 10, 'un', v_cat_mercearia, null, 'ARZ5', '7891234500011'); v_products := v_products || v_p.id;
  v_p := public.create_product(v_b.id, 'Feijão Carioca 1kg', 899, 620, 70, 10, 'un', v_cat_mercearia, null, 'FJC1', '7891234500028'); v_products := v_products || v_p.id;
  v_p := public.create_product(v_b.id, 'Café Torrado 500g', 1890, 1320, 40, 8, 'un', v_cat_mercearia, null, 'CAF5', '7891234500035'); v_products := v_products || v_p.id;
  v_p := public.create_product(v_b.id, 'Refrigerante 2L', 999, 640, 90, 12, 'un', v_cat_bebidas, null, 'REF2', '7891234500042'); v_products := v_products || v_p.id;
  v_p := public.create_product(v_b.id, 'Água Mineral 1,5L', 350, 180, 120, 24, 'un', v_cat_bebidas, null, 'AGU1', '7891234500059'); v_products := v_products || v_p.id;
  v_p := public.create_product(v_b.id, 'Leite Integral 1L', 549, 410, 60, 18, 'un', v_cat_mercearia, null, 'LEI1', '7891234500066'); v_products := v_products || v_p.id;
  v_p := public.create_product(v_b.id, 'Pão Francês (kg)', 1690, 820, 40, 5, 'kg', v_cat_padaria, null, 'PAO1', null); v_products := v_products || v_p.id;
  v_p := public.create_product(v_b.id, 'Detergente 500ml', 299, 175, 50, 10, 'un', v_cat_limpeza, null, 'DET5', '7891234500073'); v_products := v_products || v_p.id;
  v_p := public.create_product(v_b.id, 'Sabão em Pó 1kg', 1490, 1080, 25, 6, 'un', v_cat_limpeza, null, 'SAB1', '7891234500080'); v_products := v_products || v_p.id;
  v_p := public.create_product(v_b.id, 'Óleo de Soja 900ml', 799, 610, 45, 10, 'un', v_cat_mercearia, null, 'OLE9', '7891234500097'); v_products := v_products || v_p.id;
  v_p := public.create_product(v_b.id, 'Açúcar Refinado 1kg', 489, 450, 35, 8, 'un', v_cat_mercearia, null, 'ACU1', '7891234500103'); v_products := v_products || v_p.id;
  v_p := public.create_product(v_b.id, 'Biscoito Recheado', 349, 360, 30, 6, 'un', v_cat_mercearia, null, 'BIS1', '7891234500110'); v_products := v_products || v_p.id;
  -- produto parado (sem vendas) para recomendação
  perform public.create_product(v_b.id, 'Panela Antiaderente', 8990, 5200, 4, 1, 'un', null, null, 'PAN1', null);

  insert into public.customers (business_id, name, phone, notes) values
    (v_b.id, 'Carlos Pereira', '11977776666', 'Paga sempre no dia 10'),
    (v_b.id, 'Ana Lúcia Santos', '11966665555', null),
    (v_b.id, 'João da Silva', '11955554444', null),
    (v_b.id, 'Dona Cida', '11944443333', 'Vizinha, compra fiado'),
    (v_b.id, 'Roberto Lima', '11933332222', null),
    (v_b.id, 'Patrícia Gomes', '11922221111', null);
  select array_agg(id order by created_at, name) into v_customers from public.customers where business_id = v_b.id;

  -- 14 dias de vendas
  for d in 0..13 loop
    n := 6 + floor(random() * 8)::int + case when extract(isodow from current_date - d) in (5, 6) then 5 else 0 end;
    for i in 1..n loop
      q := 1 + floor(random() * 3)::int;
      idx := 1 + floor(power(random(), 1.6) * array_length(v_products, 1))::int;
      if idx > array_length(v_products, 1) then idx := array_length(v_products, 1); end if;
      select price_cents into v_price from public.products where id = v_products[idx];
      v_method := (array['cash', 'pix', 'pix', 'card', 'card', 'credit'])[1 + floor(random() * 6)::int];
      v_c := case when v_method = 'credit' or random() < 0.25 then v_customers[1 + floor(random() * 6)::int] else null end;
      v_s := public.complete_sale(v_b.id, gen_random_uuid(),
        jsonb_build_array(jsonb_build_object('product_id', v_products[idx], 'quantity', q)),
        jsonb_build_array(jsonb_build_object('method', v_method, 'amount_cents', v_price * q)),
        v_c, 0, current_date - d + 30);
      -- espalha no dia (8h às 20h)
      insert into demo_dates values (v_s.id, (current_date - d)::timestamp + make_interval(hours => 8 + floor(random() * 12)::int, mins => floor(random() * 60)::int));
    end loop;
  end loop;

  perform set_config('demo.bid', v_b.id::text, false);
end $$;
reset role;

-- Datas retroativas das vendas e movimentações (somente para demonstração)
update public.sales s set created_at = (d.at at time zone 'America/Sao_Paulo')
from demo_dates d where d.sale_id = s.id;
update public.sale_payments p set created_at = s.created_at from public.sales s where s.id = p.sale_id and s.business_id = current_setting('demo.bid')::uuid;
update public.stock_movements m set created_at = s.created_at from public.sales s where s.id = m.sale_id;
update public.receivables r set created_at = s.created_at, due_date = (s.created_at at time zone 'America/Sao_Paulo')::date + 10
from public.sales s where s.id = r.sale_id;

set role authenticated;
do $$
declare
  v_bid uuid := current_setting('demo.bid')::uuid;
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  r record;
begin
  -- Alguns recebimentos de fiado
  for r in select distinct customer_id from public.receivables where business_id = v_bid limit 3 loop
    perform public.receive_payment(v_bid, r.customer_id, 2000, 'pix', gen_random_uuid());
  end loop;
  -- Despesas e contas a pagar
  insert into public.financial_entries (business_id, kind, category_id, description, amount_cents, competence_date, status, paid_at, method)
  select v_bid, 'expense', c.id, x.descr, x.amount, v_today - x.days, 'paid', now() - make_interval(days => x.days), 'pix'
  from (values ('Aluguel', 'Aluguel (quinzena)', 45000, 9), ('Água e luz', 'Conta de luz', 18990, 4),
               ('Internet e telefone', 'Internet', 9990, 2), ('Transporte', 'Frete de mercadorias', 6500, 6)) as x(cat, descr, amount, days)
  join public.finance_categories c on c.business_id = v_bid and c.name = x.cat;
  insert into public.financial_entries (business_id, kind, description, amount_cents, competence_date, due_date, status)
  values (v_bid, 'expense', 'Boleto distribuidora (mercadoria do próximo mês)', 74500, v_today + 20, v_today + 5, 'pending'),
         (v_bid, 'expense', 'Contador', 25000, v_today, v_today - 1, 'pending');
  -- Orçamento
  perform public.save_quote(v_bid, jsonb_build_array(
    jsonb_build_object('description', 'Cesta básica completa', 'quantity', 10, 'unit_price_cents', 15990),
    jsonb_build_object('description', 'Entrega', 'quantity', 1, 'unit_price_cents', 2000)),
    (select id from public.customers where business_id = v_bid and name = 'Roberto Lima'), 5000, null, 'Pagamento em até 2x no Pix');
end $$;
reset role;
