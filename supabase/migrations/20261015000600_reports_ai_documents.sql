-- =====================================================================
-- Fase 3 — Relatórios avançados, recomendações, alertas, cota de IA,
-- orçamentos, recibos e exportação de dados.
--
-- Todos os números são calculados aqui, de forma determinística. O
-- assistente de IA apenas consulta estas funções (com o JWT do usuário,
-- portanto sob as mesmas regras de acesso) e explica os resultados.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Índices de desempenho para relatórios
-- ---------------------------------------------------------------------
create index if not exists sales_business_status_created_idx on public.sales (business_id, status, created_at);
create index if not exists sale_items_business_product_idx on public.sale_items (business_id, product_id, sale_id);
create index if not exists receivable_payments_customer_idx on public.receivable_payments (customer_id, paid_at desc);
create index if not exists financial_entries_paid_idx on public.financial_entries (business_id, kind, status, paid_at);
create index if not exists quotes_business_created_idx on public.quotes (business_id, created_at desc);

-- Recursos Pro adicionais
update public.plans
set features = features || '["reports","insights","quotes_pdf"]'::jsonb, updated_at = now()
where id = 'pro';

-- ---------------------------------------------------------------------
-- Utilitário: intervalo de datas locais do negócio
-- ---------------------------------------------------------------------
create or replace function public._range(p_business_id uuid, p_from date, p_to date, out r_from timestamptz, out r_to timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tz text;
begin
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then
    raise exception 'Período inválido (máximo de 1 ano)' using errcode = '22023';
  end if;
  select timezone into v_tz from public.businesses where id = p_business_id;
  r_from := p_from::timestamp at time zone v_tz;
  r_to := (p_to + 1)::timestamp at time zone v_tz;
end;
$$;

-- ---------------------------------------------------------------------
-- sales_report: relatório detalhado de vendas
-- ---------------------------------------------------------------------
create or replace function public.sales_report(p_business_id uuid, p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_from timestamptz;
  v_to timestamptz;
  v_prev_from timestamptz;
  v_tz text;
  v_is_manager boolean;
  v_result jsonb;
begin
  perform public._require_member(p_business_id);
  select r_from, r_to into v_from, v_to from public._range(p_business_id, p_from, p_to);
  v_prev_from := v_from - (v_to - v_from);
  select timezone into v_tz from public.businesses where id = p_business_id;
  v_is_manager := public.is_business_manager(p_business_id);

  with
  ps as (
    select * from public.sales
    where business_id = p_business_id and status = 'completed' and created_at >= v_from and created_at < v_to
  ),
  items as (
    select si.* from public.sale_items si join ps on ps.id = si.sale_id
  ),
  by_product as (
    select i.product_id, max(i.product_name) as name, sum(i.quantity) as quantity,
      sum(i.total_cents) as revenue_cents,
      sum(round(i.unit_cost_cents * i.quantity))::bigint as cost_cents
    from items i group by i.product_id
  ),
  by_category as (
    select coalesce(c.name, 'Sem categoria') as category, sum(i.total_cents) as revenue_cents,
      sum(round(i.unit_cost_cents * i.quantity))::bigint as cost_cents, sum(i.quantity) as quantity
    from items i
    left join public.products p on p.id = i.product_id
    left join public.product_categories c on c.id = p.category_id
    group by 1
  ),
  by_method as (
    select sp.method::text as method, sum(sp.amount_cents) as total_cents, count(distinct sp.sale_id) as sales_count
    from public.sale_payments sp join ps on ps.id = sp.sale_id group by 1
  ),
  by_weekday as (
    select extract(isodow from created_at at time zone v_tz)::int as weekday,
      sum(total_cents) as revenue_cents, count(*) as sales_count
    from ps group by 1
  ),
  by_hour as (
    select extract(hour from created_at at time zone v_tz)::int as hour,
      sum(total_cents) as revenue_cents, count(*) as sales_count
    from ps group by 1
  ),
  top_customers as (
    select c.id as customer_id, c.name, sum(ps.total_cents) as revenue_cents, count(*) as sales_count
    from ps join public.customers c on c.id = ps.customer_id
    group by c.id, c.name order by 4 desc, 3 desc limit 10
  ),
  prev as (
    select coalesce(sum(total_cents), 0) as revenue_cents, count(*) as sales_count,
      coalesce(sum(cost_cents), 0) as cogs_cents
    from public.sales
    where business_id = p_business_id and status = 'completed' and created_at >= v_prev_from and created_at < v_from
  ),
  canceled as (
    select count(*) as n, coalesce(sum(total_cents), 0) as total_cents from public.sales
    where business_id = p_business_id and status = 'canceled' and created_at >= v_from and created_at < v_to
  )
  select jsonb_build_object(
    'period', jsonb_build_object('from', p_from, 'to', p_to),
    'summary', jsonb_build_object(
      'sales_count', (select count(*) from ps),
      'revenue_cents', (select coalesce(sum(total_cents), 0) from ps),
      'discount_cents', (select coalesce(sum(discount_cents), 0) from ps),
      'credit_sales_cents', (select coalesce(sum(credit_cents), 0) from ps),
      'average_ticket_cents', (select coalesce(round(avg(total_cents)), 0) from ps),
      'items_sold', (select coalesce(sum(quantity), 0) from items),
      'cogs_cents', case when v_is_manager then (select coalesce(sum(cost_cents), 0) from ps) end,
      'gross_profit_cents', case when v_is_manager then (select coalesce(sum(total_cents - cost_cents), 0) from ps) end,
      'gross_margin_pct', case when v_is_manager then (
        select case when sum(total_cents) > 0 then round(sum(total_cents - cost_cents) * 100.0 / sum(total_cents), 1) end from ps
      ) end,
      'canceled_count', (select n from canceled),
      'canceled_cents', (select total_cents from canceled)
    ),
    'previous_period', jsonb_build_object(
      'revenue_cents', (select revenue_cents from prev),
      'sales_count', (select sales_count from prev),
      'revenue_change_pct', (
        select case when prev.revenue_cents > 0
          then round(((select coalesce(sum(total_cents), 0) from ps) - prev.revenue_cents) * 100.0 / prev.revenue_cents, 1)
        end from prev
      )
    ),
    'by_product', coalesce((
      select jsonb_agg(jsonb_build_object(
        'product_id', b.product_id, 'name', b.name, 'quantity', b.quantity, 'revenue_cents', b.revenue_cents,
        'cost_cents', case when v_is_manager then b.cost_cents end,
        'profit_cents', case when v_is_manager then b.revenue_cents - b.cost_cents end,
        'margin_pct', case when v_is_manager and b.revenue_cents > 0
          then round((b.revenue_cents - b.cost_cents) * 100.0 / b.revenue_cents, 1) end
      ) order by b.revenue_cents desc)
      from (select * from by_product order by revenue_cents desc limit 50) b
    ), '[]'::jsonb),
    'by_category', coalesce((
      select jsonb_agg(jsonb_build_object(
        'category', c.category, 'quantity', c.quantity, 'revenue_cents', c.revenue_cents,
        'profit_cents', case when v_is_manager then c.revenue_cents - c.cost_cents end
      ) order by c.revenue_cents desc) from by_category c
    ), '[]'::jsonb),
    'by_payment_method', coalesce((select jsonb_agg(to_jsonb(m) order by m.total_cents desc) from by_method m), '[]'::jsonb),
    'by_weekday', coalesce((select jsonb_agg(to_jsonb(w) order by w.weekday) from by_weekday w), '[]'::jsonb),
    'by_hour', coalesce((select jsonb_agg(to_jsonb(h) order by h.hour) from by_hour h), '[]'::jsonb),
    'top_customers', coalesce((select jsonb_agg(to_jsonb(t) order by t.revenue_cents desc) from top_customers t), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------
-- expense_comparison: despesas por categoria, mês atual x mês anterior
-- ---------------------------------------------------------------------
create or replace function public.expense_comparison(p_business_id uuid, p_month date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_cur date;
  v_prev date;
  v_result jsonb;
begin
  perform public._require_manager(p_business_id);
  v_cur := date_trunc('month', coalesce(p_month, public._business_today(p_business_id)))::date;
  v_prev := (v_cur - interval '1 month')::date;

  with e as (
    select coalesce(c.name, 'Sem categoria') as category,
      sum(fe.amount_cents) filter (where fe.competence_date >= v_cur and fe.competence_date < v_cur + interval '1 month') as current_cents,
      sum(fe.amount_cents) filter (where fe.competence_date >= v_prev and fe.competence_date < v_cur) as previous_cents
    from public.financial_entries fe
    left join public.finance_categories c on c.id = fe.category_id
    where fe.business_id = p_business_id and fe.kind = 'expense' and fe.status <> 'canceled'
      and fe.competence_date >= v_prev and fe.competence_date < v_cur + interval '1 month'
    group by 1
  )
  select jsonb_build_object(
    'month', v_cur,
    'previous_month', v_prev,
    'current_total_cents', coalesce((select sum(current_cents) from e), 0),
    'previous_total_cents', coalesce((select sum(previous_cents) from e), 0),
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object(
        'category', category,
        'current_cents', coalesce(current_cents, 0),
        'previous_cents', coalesce(previous_cents, 0),
        'change_cents', coalesce(current_cents, 0) - coalesce(previous_cents, 0),
        'change_pct', case when coalesce(previous_cents, 0) > 0
          then round((coalesce(current_cents, 0) - previous_cents) * 100.0 / previous_cents, 1) end
      ) order by coalesce(current_cents, 0) - coalesce(previous_cents, 0) desc)
      from e
    ), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------
-- stock_recommendations: reposição baseada no giro dos últimos 30 dias
-- ---------------------------------------------------------------------
create or replace function public.stock_recommendations(p_business_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  perform public._require_member(p_business_id);

  with sold as (
    select si.product_id,
      sum(si.quantity) filter (where s.created_at >= now() - interval '30 days') as qty_30d,
      max(s.created_at) as last_sale_at
    from public.sale_items si join public.sales s on s.id = si.sale_id
    where si.business_id = p_business_id and s.status = 'completed' and s.created_at >= now() - interval '180 days'
    group by si.product_id
  ),
  base as (
    select p.id, p.name, p.unit, p.stock_qty, p.min_stock, p.cost_cents, p.price_cents,
      coalesce(sold.qty_30d, 0) as qty_30d,
      round(coalesce(sold.qty_30d, 0) / 30.0, 3) as avg_daily,
      sold.last_sale_at
    from public.products p left join sold on sold.product_id = p.id
    where p.business_id = p_business_id and p.active and p.track_stock
  ),
  classified as (
    select b.*,
      case when b.avg_daily > 0 then round(b.stock_qty / b.avg_daily, 1) end as days_of_cover,
      greatest(0, ceil(b.avg_daily * 30 + b.min_stock - b.stock_qty)) as suggested_qty,
      case
        when b.stock_qty <= 0 and b.qty_30d > 0 then 'out_of_stock'
        when b.stock_qty <= b.min_stock then 'below_minimum'
        when b.avg_daily > 0 and b.stock_qty / b.avg_daily < 7 then 'ending_soon'
        when b.stock_qty > 0 and (b.last_sale_at is null or b.last_sale_at < now() - interval '60 days') then 'stale'
        else 'ok'
      end as status
    from base b
  )
  select jsonb_build_object(
    'generated_at', now(),
    'method', 'Média diária de vendas dos últimos 30 dias; sugestão cobre 30 dias + estoque mínimo.',
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'product_id', id, 'name', name, 'unit', unit, 'status', status,
        'stock_qty', stock_qty, 'min_stock', min_stock, 'sold_30d', qty_30d, 'avg_daily', avg_daily,
        'days_of_cover', days_of_cover,
        'suggested_qty', case when status in ('out_of_stock', 'below_minimum', 'ending_soon') then suggested_qty else 0 end,
        'suggested_cost_cents', case when status in ('out_of_stock', 'below_minimum', 'ending_soon')
          then round(suggested_qty * cost_cents)::bigint else 0 end,
        'stale_value_cents', case when status = 'stale' then round(stock_qty * cost_cents)::bigint else 0 end,
        'last_sale_at', last_sale_at
      ) order by
        case status when 'out_of_stock' then 0 when 'below_minimum' then 1 when 'ending_soon' then 2 when 'stale' then 3 else 4 end,
        days_of_cover nulls last, name)
      from classified where status <> 'ok'
    ), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------
-- pricing_insights: margens e sugestões de preço (dono/gerente)
-- ---------------------------------------------------------------------
create or replace function public.pricing_insights(p_business_id uuid, p_target_margin numeric default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  perform public._require_manager(p_business_id);
  if p_target_margin is null or p_target_margin <= 0 or p_target_margin >= 95 then
    raise exception 'Margem alvo inválida' using errcode = '22023';
  end if;

  with p as (
    select id, name, cost_cents, price_cents,
      case when price_cents > 0 then round((price_cents - cost_cents) * 100.0 / price_cents, 1) end as margin_pct,
      (ceil(cost_cents / (1 - p_target_margin / 100.0) / 10.0) * 10)::bigint as suggested_price_cents
    from public.products
    where business_id = p_business_id and active
  )
  select jsonb_build_object(
    'target_margin_pct', p_target_margin,
    'method', 'Preço sugerido = custo / (1 - margem alvo), arredondado para cima a cada R$ 0,10.',
    'below_cost', coalesce((select jsonb_agg(to_jsonb(x) order by x.margin_pct) from p x
      where x.cost_cents > 0 and x.price_cents < x.cost_cents), '[]'::jsonb),
    'low_margin', coalesce((select jsonb_agg(to_jsonb(x) order by x.margin_pct) from p x
      where x.cost_cents > 0 and x.price_cents >= x.cost_cents and x.margin_pct < p_target_margin), '[]'::jsonb),
    'missing_cost', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name)) from p x
      where x.cost_cents = 0), '[]'::jsonb),
    'healthy_count', (select count(*) from p x where x.cost_cents > 0 and x.margin_pct >= p_target_margin)
  ) into v_result;
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------
-- business_alerts: alertas de possíveis prejuízos (regras determinísticas)
-- ---------------------------------------------------------------------
create or replace function public.business_alerts(p_business_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_alerts jsonb := '[]'::jsonb;
  v_today date;
  v_month_start timestamptz;
  v_n bigint;
  v_cents bigint;
  v_cents2 bigint;
  v_cmp jsonb;
  v_cat jsonb;
  v_fin jsonb;
begin
  perform public._require_manager(p_business_id);
  v_today := public._business_today(p_business_id);
  v_month_start := public._business_month_start(p_business_id);

  -- 1. Vendas abaixo do custo nos últimos 30 dias
  select count(*), coalesce(sum(round((si.unit_cost_cents * si.quantity) - si.total_cents)), 0)::bigint
  into v_n, v_cents
  from public.sale_items si join public.sales s on s.id = si.sale_id
  where si.business_id = p_business_id and s.status = 'completed' and s.created_at >= now() - interval '30 days'
    and si.unit_cost_cents > 0 and si.total_cents < round(si.unit_cost_cents * si.quantity);
  if v_n > 0 then
    v_alerts := v_alerts || jsonb_build_object('severity', 'high', 'code', 'sold_below_cost',
      'title', 'Vendas abaixo do custo',
      'detail', v_n || ' item(ns) vendidos abaixo do custo nos últimos 30 dias.', 'value_cents', v_cents);
  end if;

  -- 2. Produtos ativos com preço abaixo do custo
  select count(*) into v_n from public.products
  where business_id = p_business_id and active and cost_cents > 0 and price_cents < cost_cents;
  if v_n > 0 then
    v_alerts := v_alerts || jsonb_build_object('severity', 'high', 'code', 'price_below_cost',
      'title', 'Preço abaixo do custo',
      'detail', v_n || ' produto(s) com preço de venda menor que o custo.', 'value_cents', null);
  end if;

  -- 3. Despesas que mais cresceram (> 20% e > R$ 50) frente ao mês anterior
  v_cmp := public.expense_comparison(p_business_id);
  for v_cat in select value from jsonb_array_elements(v_cmp -> 'categories')
  loop
    if (v_cat ->> 'previous_cents')::bigint > 0 and (v_cat ->> 'change_pct')::numeric > 20
       and (v_cat ->> 'change_cents')::bigint > 5000 then
      v_alerts := v_alerts || jsonb_build_object('severity', 'medium', 'code', 'expense_increase',
        'title', 'Despesa em alta: ' || (v_cat ->> 'category'),
        'detail', 'Aumento de ' || (v_cat ->> 'change_pct') || '% em relação ao mês anterior.',
        'value_cents', (v_cat ->> 'change_cents')::bigint);
    end if;
  end loop;

  -- 4. Lucro estimado do mês negativo
  v_fin := public.finance_summary(p_business_id, date_trunc('month', v_today)::date, v_today);
  if (v_fin ->> 'net_profit_cents')::bigint < 0 then
    v_alerts := v_alerts || jsonb_build_object('severity', 'high', 'code', 'negative_profit',
      'title', 'Prejuízo estimado no mês',
      'detail', 'Despesas e custos superam o faturamento do mês até agora.',
      'value_cents', (v_fin ->> 'net_profit_cents')::bigint);
  end if;

  -- 5. Fiados vencidos
  select coalesce(sum(amount_cents - paid_cents), 0), count(distinct customer_id) into v_cents, v_n
  from public.receivables
  where business_id = p_business_id and status in ('open', 'partial') and due_date < v_today;
  if v_cents > 0 then
    v_alerts := v_alerts || jsonb_build_object('severity', case when v_cents > 50000 then 'high' else 'medium' end,
      'code', 'overdue_receivables', 'title', 'Fiados vencidos',
      'detail', v_n || ' cliente(s) com pagamentos atrasados.', 'value_cents', v_cents);
  end if;

  -- 6. Contas a pagar vencidas
  select coalesce(sum(amount_cents), 0), count(*) into v_cents, v_n
  from public.financial_entries
  where business_id = p_business_id and kind = 'expense' and status = 'pending' and due_date < v_today;
  if v_n > 0 then
    v_alerts := v_alerts || jsonb_build_object('severity', 'high', 'code', 'overdue_payables',
      'title', 'Contas a pagar vencidas', 'detail', v_n || ' conta(s) em atraso (risco de juros e multa).',
      'value_cents', v_cents);
  end if;

  -- 7. Descontos elevados no mês (> 10% do faturamento bruto)
  select coalesce(sum(discount_cents), 0), coalesce(sum(subtotal_cents), 0) into v_cents, v_cents2
  from public.sales where business_id = p_business_id and status = 'completed' and created_at >= v_month_start;
  if v_cents2 > 0 and v_cents * 100.0 / v_cents2 > 10 then
    v_alerts := v_alerts || jsonb_build_object('severity', 'medium', 'code', 'high_discounts',
      'title', 'Descontos elevados',
      'detail', 'Descontos somam ' || round(v_cents * 100.0 / v_cents2, 1) || '% do valor vendido no mês.',
      'value_cents', v_cents);
  end if;

  -- 8. Produtos sem estoque que venderam recentemente (venda perdida)
  select count(*) into v_n from public.products p
  where p.business_id = p_business_id and p.active and p.track_stock and p.stock_qty <= 0
    and exists (select 1 from public.sale_items si join public.sales s on s.id = si.sale_id
                where si.product_id = p.id and s.status = 'completed' and s.created_at >= now() - interval '30 days');
  if v_n > 0 then
    v_alerts := v_alerts || jsonb_build_object('severity', 'medium', 'code', 'out_of_stock_selling',
      'title', 'Produtos procurados sem estoque',
      'detail', v_n || ' produto(s) zerados que tiveram vendas nos últimos 30 dias.', 'value_cents', null);
  end if;

  -- 9. Dinheiro parado em estoque sem giro (60 dias)
  select coalesce(sum(round(p.stock_qty * p.cost_cents)), 0)::bigint, count(*) into v_cents, v_n
  from public.products p
  where p.business_id = p_business_id and p.active and p.track_stock and p.stock_qty > 0 and p.cost_cents > 0
    and not exists (select 1 from public.sale_items si join public.sales s on s.id = si.sale_id
                    where si.product_id = p.id and s.status = 'completed' and s.created_at >= now() - interval '60 days')
    and p.created_at < now() - interval '60 days';
  if v_n > 0 and v_cents > 0 then
    v_alerts := v_alerts || jsonb_build_object('severity', 'low', 'code', 'stale_stock',
      'title', 'Estoque parado', 'detail', v_n || ' produto(s) sem venda há mais de 60 dias.',
      'value_cents', v_cents);
  end if;

  return jsonb_build_object('generated_at', now(), 'alerts', v_alerts);
end;
$$;

-- ---------------------------------------------------------------------
-- Cota mensal do assistente de IA
-- ---------------------------------------------------------------------
create or replace function public.ai_usage_status(p_business_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limit integer;
  v_used integer;
  v_month date;
begin
  perform public._require_member(p_business_id);
  v_month := date_trunc('month', public._business_today(p_business_id))::date;
  select ai_monthly_requests into v_limit from public.plans where id = public.business_plan(p_business_id);
  select coalesce(sum(request_count), 0) into v_used from public.ai_usage
  where business_id = p_business_id and period_month = v_month;
  return jsonb_build_object('limit', v_limit, 'used', v_used, 'remaining', greatest(0, v_limit - v_used), 'month', v_month);
end;
$$;

-- Reserva uma pergunta (atômico). Chamada pela Edge Function com o JWT do usuário.
create or replace function public.ai_reserve_request(p_business_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer;
  v_used integer;
  v_month date;
begin
  perform public._require_member(p_business_id);
  v_month := date_trunc('month', public._business_today(p_business_id))::date;
  select ai_monthly_requests into v_limit from public.plans where id = public.business_plan(p_business_id);
  if coalesce(v_limit, 0) = 0 then
    raise exception 'O Assistente IA faz parte do plano Pro IA.' using errcode = 'P0001', hint = 'ai_not_in_plan';
  end if;

  -- Serializa reservas do mesmo negócio
  perform pg_advisory_xact_lock(hashtextextended(p_business_id::text || v_month::text, 0));
  select coalesce(sum(request_count), 0) into v_used from public.ai_usage
  where business_id = p_business_id and period_month = v_month;
  if v_used >= v_limit then
    raise exception 'Limite mensal de % perguntas ao Assistente IA atingido. Ele renova no próximo mês.', v_limit
      using errcode = 'P0001', hint = 'ai_quota_exceeded';
  end if;

  insert into public.ai_usage as u (business_id, user_id, period_month, request_count)
  values (p_business_id, auth.uid(), v_month, 1)
  on conflict (business_id, user_id, period_month)
  do update set request_count = u.request_count + 1, updated_at = now();

  return jsonb_build_object('limit', v_limit, 'used', v_used + 1, 'remaining', v_limit - v_used - 1);
end;
$$;

-- Registra tokens consumidos (somente backend)
create or replace function public.ai_record_tokens(p_business_id uuid, p_user_id uuid, p_input bigint, p_output bigint)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.ai_usage
  set input_tokens = input_tokens + greatest(0, coalesce(p_input, 0)),
      output_tokens = output_tokens + greatest(0, coalesce(p_output, 0)),
      updated_at = now()
  where business_id = p_business_id and user_id = p_user_id
    and period_month = date_trunc('month', public._business_today(p_business_id))::date;
$$;

-- ---------------------------------------------------------------------
-- Orçamentos: criação com totais calculados no servidor
-- ---------------------------------------------------------------------
revoke insert, update on public.quotes, public.quote_items from authenticated;
grant update (status, valid_until, notes) on public.quotes to authenticated;

create or replace function public.save_quote(
  p_business_id uuid,
  p_items jsonb,               -- [{product_id?, description, quantity, unit_price_cents}]
  p_customer_id uuid default null,
  p_discount_cents bigint default 0,
  p_valid_until date default null,
  p_notes text default null
)
returns public.quotes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quote public.quotes;
  v_item jsonb;
  v_qty numeric(14,3);
  v_price bigint;
  v_line bigint;
  v_subtotal bigint := 0;
  v_desc text;
  v_product uuid;
begin
  perform public._require_member(p_business_id);
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'O orçamento precisa ter pelo menos um item' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 100 then
    raise exception 'Limite de 100 itens por orçamento' using errcode = '22023';
  end if;
  if p_customer_id is not null and not exists (
    select 1 from public.customers where id = p_customer_id and business_id = p_business_id
  ) then
    raise exception 'Cliente inválido' using errcode = '22023';
  end if;

  insert into public.quotes (business_id, customer_id, number, status, valid_until, notes, created_by)
  values (p_business_id, p_customer_id, public._next_counter(p_business_id, 'quote'), 'draft',
          coalesce(p_valid_until, public._business_today(p_business_id) + 15), nullif(trim(p_notes), ''), auth.uid())
  returning * into v_quote;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_qty := (v_item ->> 'quantity')::numeric;
    v_price := (v_item ->> 'unit_price_cents')::bigint;
    v_desc := trim(coalesce(v_item ->> 'description', ''));
    v_product := nullif(v_item ->> 'product_id', '')::uuid;
    if v_qty is null or v_qty <= 0 or v_price is null or v_price < 0 or v_desc = '' then
      raise exception 'Item de orçamento inválido' using errcode = '22023';
    end if;
    if v_product is not null and not exists (
      select 1 from public.products where id = v_product and business_id = p_business_id
    ) then
      raise exception 'Produto inválido' using errcode = '22023';
    end if;
    v_line := round(v_price * v_qty)::bigint;
    v_subtotal := v_subtotal + v_line;
    insert into public.quote_items (quote_id, business_id, product_id, description, quantity, unit_price_cents, total_cents)
    values (v_quote.id, p_business_id, v_product, left(v_desc, 200), v_qty, v_price, v_line);
  end loop;

  if coalesce(p_discount_cents, 0) < 0 or coalesce(p_discount_cents, 0) > v_subtotal then
    raise exception 'Desconto inválido' using errcode = '22023';
  end if;

  update public.quotes set
    subtotal_cents = v_subtotal,
    discount_cents = coalesce(p_discount_cents, 0),
    total_cents = v_subtotal - coalesce(p_discount_cents, 0)
  where id = v_quote.id
  returning * into v_quote;

  perform public._audit(p_business_id, 'quote.create', 'quote', v_quote.id,
    jsonb_build_object('number', v_quote.number, 'total_cents', v_quote.total_cents));
  return v_quote;
end;
$$;

-- ---------------------------------------------------------------------
-- Documentos (histórico de recibos/orçamentos gerados)
-- ---------------------------------------------------------------------
alter table public.documents drop constraint documents_kind_check;
alter table public.documents
  add constraint documents_kind_check check (kind in ('sale_receipt', 'payment_receipt', 'service_receipt', 'quote')),
  alter column reference_id drop not null,
  add column number bigint,
  add column title text check (title is null or char_length(title) <= 200),
  add column amount_cents bigint check (amount_cents is null or amount_cents >= 0),
  add column data jsonb not null default '{}'::jsonb;

revoke insert, update on public.documents from authenticated;

create or replace function public.register_document(
  p_business_id uuid,
  p_kind text,
  p_reference_id uuid,
  p_title text,
  p_amount_cents bigint,
  p_data jsonb default '{}'::jsonb
)
returns public.documents
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doc public.documents;
begin
  perform public._require_member(p_business_id);
  if p_kind = 'service_receipt' and (p_amount_cents is null or p_amount_cents <= 0) then
    raise exception 'Informe o valor do recibo' using errcode = '22023';
  end if;
  if pg_column_size(coalesce(p_data, '{}'::jsonb)) > 20000 then
    raise exception 'Dados do documento muito grandes' using errcode = '22023';
  end if;
  insert into public.documents (business_id, kind, reference_id, number, title, amount_cents, data, created_by)
  values (
    p_business_id, p_kind, p_reference_id,
    case when p_kind in ('payment_receipt', 'service_receipt') then public._next_counter(p_business_id, 'receipt') end,
    left(p_title, 200), p_amount_cents, coalesce(p_data, '{}'::jsonb), auth.uid()
  )
  returning * into v_doc;
  return v_doc;
end;
$$;

-- ---------------------------------------------------------------------
-- Exportação completa dos dados do negócio (LGPD) — todos os planos
-- ---------------------------------------------------------------------
create or replace function public.export_business_data(p_business_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public._require_manager(p_business_id);
  return jsonb_build_object(
    'exported_at', now(),
    'business', (select to_jsonb(b) - 'owner_id' from public.businesses b where b.id = p_business_id),
    'products', coalesce((select jsonb_agg(to_jsonb(x) order by x.name) from public.products x where x.business_id = p_business_id), '[]'::jsonb),
    'stock_movements', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at) from public.stock_movements x where x.business_id = p_business_id), '[]'::jsonb),
    'customers', coalesce((select jsonb_agg(to_jsonb(x) order by x.name) from public.customers x where x.business_id = p_business_id), '[]'::jsonb),
    'sales', coalesce((select jsonb_agg(to_jsonb(x) - 'idempotency_key' order by x.created_at) from public.sales x where x.business_id = p_business_id), '[]'::jsonb),
    'sale_items', coalesce((select jsonb_agg(to_jsonb(x)) from public.sale_items x where x.business_id = p_business_id), '[]'::jsonb),
    'sale_payments', coalesce((select jsonb_agg(to_jsonb(x)) from public.sale_payments x where x.business_id = p_business_id), '[]'::jsonb),
    'receivables', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at) from public.receivables x where x.business_id = p_business_id), '[]'::jsonb),
    'receivable_payments', coalesce((select jsonb_agg(to_jsonb(x) - 'idempotency_key' order by x.paid_at) from public.receivable_payments x where x.business_id = p_business_id), '[]'::jsonb),
    'financial_entries', coalesce((select jsonb_agg(to_jsonb(x) order by x.competence_date) from public.financial_entries x where x.business_id = p_business_id), '[]'::jsonb),
    'quotes', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at) from public.quotes x where x.business_id = p_business_id), '[]'::jsonb),
    'quote_items', coalesce((select jsonb_agg(to_jsonb(x)) from public.quote_items x where x.business_id = p_business_id), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------
-- Permissões
-- ---------------------------------------------------------------------
revoke execute on function public._range(uuid, date, date) from public, anon, authenticated;
revoke execute on function public.ai_record_tokens(uuid, uuid, bigint, bigint) from public, anon, authenticated;

grant execute on function public.sales_report(uuid, date, date) to authenticated;
grant execute on function public.expense_comparison(uuid, date) to authenticated;
grant execute on function public.stock_recommendations(uuid) to authenticated;
grant execute on function public.pricing_insights(uuid, numeric) to authenticated;
grant execute on function public.business_alerts(uuid) to authenticated;
grant execute on function public.ai_usage_status(uuid) to authenticated;
grant execute on function public.ai_reserve_request(uuid) to authenticated;
grant execute on function public.ai_record_tokens(uuid, uuid, bigint, bigint) to service_role;
grant execute on function public.save_quote(uuid, jsonb, uuid, bigint, date, text) to authenticated;
grant execute on function public.register_document(uuid, text, uuid, text, bigint, jsonb) to authenticated;
grant execute on function public.export_business_data(uuid) to authenticated;

-- Devolve a pergunta reservada quando a chamada à IA falha (somente backend)
create or replace function public.ai_refund_request(p_business_id uuid, p_user_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.ai_usage
  set request_count = greatest(0, request_count - 1), updated_at = now()
  where business_id = p_business_id and user_id = p_user_id
    and period_month = date_trunc('month', public._business_today(p_business_id))::date;
$$;
revoke execute on function public.ai_refund_request(uuid, uuid) from public, anon, authenticated;
grant execute on function public.ai_refund_request(uuid, uuid) to service_role;
