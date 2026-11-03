-- =====================================================================
-- Funções transacionais (RPC)
-- Todas são SECURITY DEFINER com search_path vazio e validam a
-- associação do usuário ao negócio antes de qualquer operação.
-- Cada função roda em uma única transação: ou tudo é gravado, ou nada.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Utilitários internos (não expostos ao cliente)
-- ---------------------------------------------------------------------
create or replace function public._require_member(p_business_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Não autenticado' using errcode = '28000';
  end if;
  if not public.is_business_member(p_business_id) then
    raise exception 'Acesso negado a este negócio' using errcode = '42501';
  end if;
end;
$$;

create or replace function public._require_manager(p_business_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public._require_member(p_business_id);
  if not public.is_business_manager(p_business_id) then
    raise exception 'Apenas o dono ou gerente pode realizar esta operação' using errcode = '42501';
  end if;
end;
$$;

create or replace function public._next_counter(p_business_id uuid, p_name text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_value bigint;
begin
  insert into public.business_counters as c (business_id, name, value)
  values (p_business_id, p_name, 1)
  on conflict (business_id, name) do update set value = c.value + 1
  returning c.value into v_value;
  return v_value;
end;
$$;

create or replace function public._audit(
  p_business_id uuid, p_action text, p_entity text, p_entity_id uuid, p_data jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_logs (business_id, actor_id, action, entity, entity_id, data)
  values (p_business_id, auth.uid(), p_action, p_entity, p_entity_id, coalesce(p_data, '{}'::jsonb));
$$;

-- Data "hoje" no fuso do negócio
create or replace function public._business_today(p_business_id uuid)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select (now() at time zone b.timezone)::date from public.businesses b where b.id = p_business_id;
$$;

-- Aplica uma movimentação de estoque (produto já deve estar bloqueado
-- com FOR UPDATE pelo chamador quando houver concorrência).
create or replace function public._apply_stock_movement(
  p_business_id uuid,
  p_product_id uuid,
  p_type public.stock_movement_type,
  p_quantity numeric,
  p_unit_cost_cents bigint,
  p_reason text,
  p_sale_id uuid,
  p_idempotency_key uuid,
  p_allow_negative boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.products%rowtype;
  v_new_qty numeric(14,3);
  v_movement_id uuid;
begin
  select * into v_product from public.products
  where id = p_product_id and business_id = p_business_id
  for update;
  if not found then
    raise exception 'Produto não encontrado' using errcode = 'P0002';
  end if;

  if not v_product.track_stock then
    return null; -- produto sem controle de estoque (ex.: serviço)
  end if;

  v_new_qty := v_product.stock_qty + p_quantity;
  if v_new_qty < 0 and not p_allow_negative then
    raise exception 'Estoque insuficiente para "%": disponível %, solicitado %',
      v_product.name, v_product.stock_qty, abs(p_quantity)
      using errcode = 'P0001', hint = 'insufficient_stock';
  end if;

  update public.products set stock_qty = v_new_qty where id = p_product_id;

  insert into public.stock_movements (
    business_id, product_id, type, quantity, balance_after, unit_cost_cents,
    reason, sale_id, idempotency_key, created_by
  ) values (
    p_business_id, p_product_id, p_type, p_quantity, v_new_qty, p_unit_cost_cents,
    p_reason, p_sale_id, p_idempotency_key, auth.uid()
  )
  returning id into v_movement_id;

  return v_movement_id;
end;
$$;

-- ---------------------------------------------------------------------
-- create_business: cria negócio, vínculo de dono e categorias padrão
-- ---------------------------------------------------------------------
create or replace function public.create_business(
  p_name text,
  p_business_type text default 'other',
  p_document_type public.document_type default null,
  p_document text default null,
  p_phone text default null
)
returns public.businesses
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business public.businesses;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Não autenticado' using errcode = '28000';
  end if;

  insert into public.businesses (owner_id, name, business_type, document_type, document, phone)
  values (
    v_uid, trim(p_name), coalesce(nullif(trim(p_business_type), ''), 'other'),
    case when nullif(p_document, '') is null then null else p_document_type end,
    nullif(regexp_replace(coalesce(p_document, ''), '\D', '', 'g'), ''),
    nullif(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), '')
  )
  returning * into v_business;

  insert into public.business_members (business_id, user_id, role)
  values (v_business.id, v_uid, 'owner');

  insert into public.finance_categories (business_id, kind, name)
  select v_business.id, 'expense'::public.finance_kind, n
  from unnest(array[
    'Aluguel', 'Água e luz', 'Internet e telefone', 'Fornecedores',
    'Salários', 'Impostos e taxas', 'Transporte', 'Marketing', 'Manutenção', 'Outras despesas'
  ]) as n;

  insert into public.finance_categories (business_id, kind, name)
  select v_business.id, 'income'::public.finance_kind, n
  from unnest(array['Serviços avulsos', 'Aportes', 'Outras receitas']) as n;

  perform public._audit(v_business.id, 'business.create', 'business', v_business.id,
    jsonb_build_object('name', v_business.name));

  return v_business;
end;
$$;

-- ---------------------------------------------------------------------
-- create_product: cria produto com estoque inicial em uma única transação
-- ---------------------------------------------------------------------
create or replace function public.create_product(
  p_business_id uuid,
  p_name text,
  p_price_cents bigint,
  p_cost_cents bigint default 0,
  p_initial_stock numeric default 0,
  p_min_stock numeric default 0,
  p_unit text default 'un',
  p_category_id uuid default null,
  p_description text default null,
  p_internal_code text default null,
  p_barcode text default null,
  p_track_stock boolean default true
)
returns public.products
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.products;
begin
  perform public._require_manager(p_business_id);

  if p_initial_stock < 0 then
    raise exception 'Estoque inicial não pode ser negativo' using errcode = '22023';
  end if;

  if p_category_id is not null and not exists (
    select 1 from public.product_categories where id = p_category_id and business_id = p_business_id
  ) then
    raise exception 'Categoria inválida' using errcode = '22023';
  end if;

  insert into public.products (
    business_id, category_id, name, description, internal_code, barcode, unit,
    cost_cents, price_cents, min_stock, track_stock
  ) values (
    p_business_id, p_category_id, trim(p_name), nullif(trim(p_description), ''),
    nullif(trim(p_internal_code), ''), nullif(trim(p_barcode), ''), coalesce(p_unit, 'un'),
    coalesce(p_cost_cents, 0), p_price_cents, coalesce(p_min_stock, 0), coalesce(p_track_stock, true)
  )
  returning * into v_product;

  if coalesce(p_initial_stock, 0) > 0 and v_product.track_stock then
    perform public._apply_stock_movement(
      p_business_id, v_product.id, 'initial', p_initial_stock, v_product.cost_cents,
      'Estoque inicial', null, null, false
    );
    select * into v_product from public.products where id = v_product.id;
  end if;

  perform public._audit(p_business_id, 'product.create', 'product', v_product.id,
    jsonb_build_object('name', v_product.name, 'initial_stock', p_initial_stock));

  return v_product;
end;
$$;

-- ---------------------------------------------------------------------
-- register_stock_movement: entrada de mercadoria ou ajuste com justificativa
-- ---------------------------------------------------------------------
create or replace function public.register_stock_movement(
  p_business_id uuid,
  p_product_id uuid,
  p_type public.stock_movement_type,
  p_quantity numeric,
  p_reason text default null,
  p_unit_cost_cents bigint default null,
  p_idempotency_key uuid default null,
  p_update_cost boolean default false
)
returns public.stock_movements
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.stock_movements;
  v_allow_negative boolean;
  v_movement_id uuid;
  v_result public.stock_movements;
begin
  perform public._require_manager(p_business_id);

  if p_idempotency_key is not null then
    select * into v_existing from public.stock_movements
    where business_id = p_business_id and idempotency_key = p_idempotency_key;
    if found then
      return v_existing;
    end if;
  end if;

  if p_type not in ('purchase', 'adjustment') then
    raise exception 'Tipo de movimentação não permitido manualmente' using errcode = '22023';
  end if;
  if p_quantity is null or p_quantity = 0 then
    raise exception 'Quantidade deve ser diferente de zero' using errcode = '22023';
  end if;
  if p_type = 'purchase' and p_quantity < 0 then
    raise exception 'Entrada de mercadoria deve ter quantidade positiva' using errcode = '22023';
  end if;
  if p_type = 'adjustment' and char_length(coalesce(trim(p_reason), '')) < 3 then
    raise exception 'Informe uma justificativa para o ajuste de estoque' using errcode = '22023';
  end if;

  select allow_negative_stock into v_allow_negative from public.businesses where id = p_business_id;

  v_movement_id := public._apply_stock_movement(
    p_business_id, p_product_id, p_type, p_quantity, p_unit_cost_cents,
    nullif(trim(p_reason), ''), null, p_idempotency_key, v_allow_negative
  );
  if v_movement_id is null then
    raise exception 'Este produto não controla estoque' using errcode = '22023';
  end if;

  if p_type = 'purchase' and p_update_cost and p_unit_cost_cents is not null then
    update public.products set cost_cents = p_unit_cost_cents
    where id = p_product_id and business_id = p_business_id;
  end if;

  select * into v_result from public.stock_movements where id = v_movement_id;

  perform public._audit(p_business_id, 'stock.' || p_type::text, 'product', p_product_id,
    jsonb_build_object('quantity', p_quantity, 'reason', p_reason));

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------
-- complete_sale: venda atômica e idempotente
--   p_items:    [{ "product_id": uuid, "quantity": number, "discount_cents": int }]
--   p_payments: [{ "method": "cash|pix|card|credit", "amount_cents": int }]
-- Preços e custos são SEMPRE lidos do banco (o cliente não define preço).
-- ---------------------------------------------------------------------
create or replace function public.complete_sale(
  p_business_id uuid,
  p_idempotency_key uuid,
  p_items jsonb,
  p_payments jsonb,
  p_customer_id uuid default null,
  p_discount_cents bigint default 0,
  p_due_date date default null,
  p_notes text default null
)
returns public.sales
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sale public.sales;
  v_business public.businesses;
  v_is_manager boolean;
  v_item jsonb;
  v_payment jsonb;
  v_product public.products;
  v_qty numeric(14,3);
  v_item_discount bigint;
  v_line_gross bigint;
  v_subtotal bigint := 0;
  v_gross_total bigint := 0;
  v_items_discount bigint := 0;
  v_total bigint;
  v_cost bigint := 0;
  v_received bigint := 0;
  v_credit bigint := 0;
  v_method public.payment_method;
  v_amount bigint;
  v_customer_name text;
  v_receivable_id uuid;
begin
  perform public._require_member(p_business_id);

  if p_idempotency_key is null then
    raise exception 'Chave de idempotência obrigatória' using errcode = '22023';
  end if;

  -- Idempotência: repetir a mesma requisição retorna a venda já criada
  select * into v_sale from public.sales
  where business_id = p_business_id and idempotency_key = p_idempotency_key;
  if found then
    return v_sale;
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'A venda precisa ter pelo menos um item' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 200 then
    raise exception 'Limite de 200 itens por venda' using errcode = '22023';
  end if;
  if p_payments is null or jsonb_typeof(p_payments) <> 'array' or jsonb_array_length(p_payments) = 0 then
    raise exception 'Informe a forma de pagamento' using errcode = '22023';
  end if;
  if coalesce(p_discount_cents, 0) < 0 then
    raise exception 'Desconto inválido' using errcode = '22023';
  end if;

  -- Bloqueia o negócio contra condições de corrida na mesma chave
  select * into v_business from public.businesses where id = p_business_id for update;
  -- Revalida a idempotência após o bloqueio
  select * into v_sale from public.sales
  where business_id = p_business_id and idempotency_key = p_idempotency_key;
  if found then
    return v_sale;
  end if;

  v_is_manager := public.is_business_manager(p_business_id);

  if p_customer_id is not null and not exists (
    select 1 from public.customers where id = p_customer_id and business_id = p_business_id
  ) then
    raise exception 'Cliente inválido' using errcode = '22023';
  end if;

  -- Cria a venda com totais provisórios (atualizados ao final)
  insert into public.sales (
    business_id, number, customer_id, status, subtotal_cents, discount_cents, total_cents,
    received_cents, credit_cents, notes, idempotency_key, created_by
  ) values (
    p_business_id, public._next_counter(p_business_id, 'sale'), p_customer_id, 'completed',
    0, 0, 0, 0, 0, nullif(trim(p_notes), ''), p_idempotency_key, auth.uid()
  )
  returning * into v_sale;

  -- Itens: processados em ordem de product_id para evitar deadlocks
  for v_item in
    select value from jsonb_array_elements(p_items) order by value ->> 'product_id'
  loop
    v_qty := (v_item ->> 'quantity')::numeric;
    v_item_discount := coalesce((v_item ->> 'discount_cents')::bigint, 0);
    if v_qty is null or v_qty <= 0 then
      raise exception 'Quantidade inválida' using errcode = '22023';
    end if;
    if v_item_discount < 0 then
      raise exception 'Desconto de item inválido' using errcode = '22023';
    end if;

    select * into v_product from public.products
    where id = (v_item ->> 'product_id')::uuid and business_id = p_business_id
    for update;
    if not found then
      raise exception 'Produto não encontrado' using errcode = 'P0002';
    end if;
    if not v_product.active then
      raise exception 'O produto "%" está inativo', v_product.name using errcode = '22023';
    end if;

    v_line_gross := round(v_product.price_cents * v_qty)::bigint;
    if v_item_discount > v_line_gross then
      raise exception 'Desconto maior que o valor do item "%"', v_product.name using errcode = '22023';
    end if;

    insert into public.sale_items (
      sale_id, business_id, product_id, product_name, quantity,
      unit_price_cents, unit_cost_cents, discount_cents, total_cents
    ) values (
      v_sale.id, p_business_id, v_product.id, v_product.name, v_qty,
      v_product.price_cents, v_product.cost_cents, v_item_discount, v_line_gross - v_item_discount
    );

    v_gross_total := v_gross_total + v_line_gross;
    v_items_discount := v_items_discount + v_item_discount;
    v_cost := v_cost + round(v_product.cost_cents * v_qty)::bigint;

    perform public._apply_stock_movement(
      p_business_id, v_product.id, 'sale', -v_qty, v_product.cost_cents,
      'Venda #' || v_sale.number, v_sale.id, null, v_business.allow_negative_stock
    );
  end loop;

  v_subtotal := v_gross_total;
  if coalesce(p_discount_cents, 0) + v_items_discount > v_subtotal then
    raise exception 'Desconto maior que o valor da venda' using errcode = '22023';
  end if;
  v_total := v_subtotal - v_items_discount - coalesce(p_discount_cents, 0);

  -- Descontos acima do limite do vendedor exigem dono/gerente
  if not v_is_manager and v_subtotal > 0
     and (v_items_discount + coalesce(p_discount_cents, 0)) * 100.0 / v_subtotal
         > v_business.seller_max_discount_percent then
    raise exception 'Desconto acima do permitido para vendedores (máximo de %)',
      v_business.seller_max_discount_percent::text || '%'
      using errcode = '42501', hint = 'discount_not_authorized';
  end if;

  -- Pagamentos
  for v_payment in select value from jsonb_array_elements(p_payments)
  loop
    begin
      v_method := (v_payment ->> 'method')::public.payment_method;
    exception when invalid_text_representation then
      raise exception 'Forma de pagamento inválida' using errcode = '22023';
    end;
    v_amount := (v_payment ->> 'amount_cents')::bigint;
    if v_amount is null or v_amount <= 0 then
      raise exception 'Valor de pagamento inválido' using errcode = '22023';
    end if;

    insert into public.sale_payments (sale_id, business_id, method, amount_cents)
    values (v_sale.id, p_business_id, v_method, v_amount);

    if v_method = 'credit' then
      v_credit := v_credit + v_amount;
    else
      v_received := v_received + v_amount;
    end if;
  end loop;

  if v_received + v_credit <> v_total then
    raise exception 'A soma dos pagamentos (%) difere do total da venda (%)', v_received + v_credit, v_total
      using errcode = '22023', hint = 'payment_mismatch';
  end if;

  -- Fiado: exige cliente e gera conta a receber (não conta como recebido)
  if v_credit > 0 then
    if p_customer_id is null then
      raise exception 'Selecione um cliente para vender fiado' using errcode = '22023',
        hint = 'credit_requires_customer';
    end if;
    select name into v_customer_name from public.customers where id = p_customer_id;
    insert into public.receivables (
      business_id, customer_id, sale_id, description, amount_cents, due_date, created_by
    ) values (
      p_business_id, p_customer_id, v_sale.id, 'Venda #' || v_sale.number,
      v_credit,
      coalesce(p_due_date, public._business_today(p_business_id) + v_business.default_credit_days),
      auth.uid()
    )
    returning id into v_receivable_id;
  end if;

  update public.sales set
    subtotal_cents = v_subtotal,
    discount_cents = v_items_discount + coalesce(p_discount_cents, 0),
    total_cents = v_total,
    cost_cents = v_cost,
    received_cents = v_received,
    credit_cents = v_credit
  where id = v_sale.id
  returning * into v_sale;

  perform public._audit(p_business_id, 'sale.complete', 'sale', v_sale.id,
    jsonb_build_object('number', v_sale.number, 'total_cents', v_total, 'credit_cents', v_credit));

  return v_sale;
end;
$$;

-- ---------------------------------------------------------------------
-- cancel_sale: cancela, devolve estoque e cancela o fiado associado
-- ---------------------------------------------------------------------
create or replace function public.cancel_sale(p_sale_id uuid, p_reason text)
returns public.sales
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sale public.sales;
  v_item public.sale_items;
  v_receivable public.receivables;
begin
  select * into v_sale from public.sales where id = p_sale_id for update;
  if not found then
    raise exception 'Venda não encontrada' using errcode = 'P0002';
  end if;
  perform public._require_manager(v_sale.business_id);

  if v_sale.status = 'canceled' then
    return v_sale; -- idempotente
  end if;
  if char_length(coalesce(trim(p_reason), '')) < 3 then
    raise exception 'Informe o motivo do cancelamento' using errcode = '22023';
  end if;

  for v_receivable in
    select * from public.receivables where sale_id = v_sale.id for update
  loop
    if exists (
      select 1 from public.receivable_payments
      where receivable_id = v_receivable.id and reversed_at is null
    ) then
      raise exception 'Esta venda tem pagamentos de fiado registrados. Estorne os pagamentos antes de cancelar.'
        using errcode = '22023', hint = 'receivable_has_payments';
    end if;
    update public.receivables set status = 'canceled' where id = v_receivable.id;
  end loop;

  for v_item in
    select * from public.sale_items where sale_id = v_sale.id and product_id is not null order by product_id
  loop
    perform public._apply_stock_movement(
      v_sale.business_id, v_item.product_id, 'sale_cancel', v_item.quantity, v_item.unit_cost_cents,
      'Cancelamento da venda #' || v_sale.number, v_sale.id, null, true
    );
  end loop;

  update public.sales set
    status = 'canceled', canceled_at = now(), canceled_by = auth.uid(), cancel_reason = trim(p_reason)
  where id = v_sale.id
  returning * into v_sale;

  perform public._audit(v_sale.business_id, 'sale.cancel', 'sale', v_sale.id,
    jsonb_build_object('number', v_sale.number, 'reason', p_reason, 'total_cents', v_sale.total_cents));

  return v_sale;
end;
$$;

-- ---------------------------------------------------------------------
-- create_receivable: fiado manual (ex.: dívida anterior ao app)
-- ---------------------------------------------------------------------
create or replace function public.create_receivable(
  p_business_id uuid,
  p_customer_id uuid,
  p_description text,
  p_amount_cents bigint,
  p_due_date date
)
returns public.receivables
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rec public.receivables;
begin
  perform public._require_member(p_business_id);
  if not exists (select 1 from public.customers where id = p_customer_id and business_id = p_business_id) then
    raise exception 'Cliente inválido' using errcode = '22023';
  end if;
  if coalesce(p_amount_cents, 0) <= 0 then
    raise exception 'Valor deve ser maior que zero' using errcode = '22023';
  end if;
  insert into public.receivables (business_id, customer_id, description, amount_cents, due_date, created_by)
  values (p_business_id, p_customer_id, trim(p_description), p_amount_cents,
          coalesce(p_due_date, public._business_today(p_business_id)), auth.uid())
  returning * into v_rec;
  perform public._audit(p_business_id, 'receivable.create', 'receivable', v_rec.id,
    jsonb_build_object('amount_cents', p_amount_cents));
  return v_rec;
end;
$$;

-- ---------------------------------------------------------------------
-- receive_payment: recebimento de fiado (parcial ou total)
--   Com p_receivable_id: abate apenas daquele fiado.
--   Sem p_receivable_id: distribui do vencimento mais antigo ao mais novo.
-- Retorna o total efetivamente aplicado.
-- ---------------------------------------------------------------------
create or replace function public.receive_payment(
  p_business_id uuid,
  p_customer_id uuid,
  p_amount_cents bigint,
  p_method public.payment_method,
  p_idempotency_key uuid,
  p_receivable_id uuid default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_remaining bigint := p_amount_cents;
  v_open_total bigint;
  v_rec public.receivables;
  v_apply bigint;
  v_applied bigint := 0;
  v_count integer := 0;
begin
  perform public._require_member(p_business_id);

  if p_idempotency_key is null then
    raise exception 'Chave de idempotência obrigatória' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.receivable_payments
    where business_id = p_business_id and idempotency_key = p_idempotency_key
  ) then
    select coalesce(sum(amount_cents), 0), count(*) into v_applied, v_count
    from public.receivable_payments
    where business_id = p_business_id and idempotency_key = p_idempotency_key;
    return jsonb_build_object('applied_cents', v_applied, 'payments', v_count, 'duplicate', true);
  end if;

  if coalesce(p_amount_cents, 0) <= 0 then
    raise exception 'Valor deve ser maior que zero' using errcode = '22023';
  end if;
  if p_method is null or p_method = 'credit' then
    raise exception 'Forma de recebimento inválida' using errcode = '22023';
  end if;

  -- Bloqueia os fiados em aberto do cliente
  perform 1 from public.receivables
  where business_id = p_business_id and customer_id = p_customer_id
    and status in ('open', 'partial')
    and (p_receivable_id is null or id = p_receivable_id)
  for update;

  select coalesce(sum(amount_cents - paid_cents), 0) into v_open_total
  from public.receivables
  where business_id = p_business_id and customer_id = p_customer_id
    and status in ('open', 'partial')
    and (p_receivable_id is null or id = p_receivable_id);

  if v_open_total = 0 then
    raise exception 'Não há valores em aberto para este cliente' using errcode = '22023';
  end if;
  if p_amount_cents > v_open_total then
    raise exception 'Valor maior que o saldo devedor (%)', v_open_total
      using errcode = '22023', hint = 'amount_exceeds_balance';
  end if;

  for v_rec in
    select * from public.receivables
    where business_id = p_business_id and customer_id = p_customer_id
      and status in ('open', 'partial')
      and (p_receivable_id is null or id = p_receivable_id)
    order by due_date, created_at
  loop
    exit when v_remaining <= 0;
    v_apply := least(v_remaining, v_rec.amount_cents - v_rec.paid_cents);

    insert into public.receivable_payments (
      business_id, receivable_id, customer_id, amount_cents, method, notes, idempotency_key, created_by
    ) values (
      p_business_id, v_rec.id, p_customer_id, v_apply, p_method, nullif(trim(p_notes), ''),
      p_idempotency_key, auth.uid()
    );

    update public.receivables set
      paid_cents = paid_cents + v_apply,
      status = case when paid_cents + v_apply >= amount_cents then 'paid' else 'partial' end::public.receivable_status
    where id = v_rec.id;

    v_remaining := v_remaining - v_apply;
    v_applied := v_applied + v_apply;
    v_count := v_count + 1;
  end loop;

  perform public._audit(p_business_id, 'receivable.payment', 'customer', p_customer_id,
    jsonb_build_object('amount_cents', v_applied, 'method', p_method));

  return jsonb_build_object('applied_cents', v_applied, 'payments', v_count, 'duplicate', false);
end;
$$;

-- ---------------------------------------------------------------------
-- reverse_receivable_payment: estorno de recebimento (dono/gerente)
-- ---------------------------------------------------------------------
create or replace function public.reverse_receivable_payment(p_payment_id uuid, p_reason text)
returns public.receivable_payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.receivable_payments;
  v_rec public.receivables;
begin
  select * into v_payment from public.receivable_payments where id = p_payment_id for update;
  if not found then
    raise exception 'Pagamento não encontrado' using errcode = 'P0002';
  end if;
  perform public._require_manager(v_payment.business_id);
  if v_payment.reversed_at is not null then
    return v_payment;
  end if;
  if char_length(coalesce(trim(p_reason), '')) < 3 then
    raise exception 'Informe o motivo do estorno' using errcode = '22023';
  end if;

  select * into v_rec from public.receivables where id = v_payment.receivable_id for update;

  update public.receivable_payments set
    reversed_at = now(), reversed_by = auth.uid(), reversal_reason = trim(p_reason)
  where id = p_payment_id
  returning * into v_payment;

  if v_rec.status <> 'canceled' then
    update public.receivables set
      paid_cents = paid_cents - v_payment.amount_cents,
      status = case when paid_cents - v_payment.amount_cents = 0 then 'open' else 'partial' end::public.receivable_status
    where id = v_rec.id;
  end if;

  perform public._audit(v_payment.business_id, 'receivable.payment_reverse', 'receivable_payment', v_payment.id,
    jsonb_build_object('amount_cents', v_payment.amount_cents, 'reason', p_reason));

  return v_payment;
end;
$$;

-- ---------------------------------------------------------------------
-- dashboard_summary: indicadores calculados de forma determinística
--   Faturamento  = total das vendas concluídas (inclui fiado)
--   Recebimentos = pagamentos no ato (exceto fiado) + recebimentos de fiado
--                  + receitas avulsas pagas
--   Lucro estimado = faturamento - custo das mercadorias vendidas - despesas
-- Período em datas locais do negócio [p_from, p_to] (inclusive).
-- ---------------------------------------------------------------------
create or replace function public.dashboard_summary(p_business_id uuid, p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tz text;
  v_from timestamptz;
  v_to timestamptz;
  v_today date;
  v_result jsonb;
  v_is_manager boolean;
begin
  perform public._require_member(p_business_id);
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'Período inválido' using errcode = '22023';
  end if;
  if p_to - p_from > 366 then
    raise exception 'Período máximo de 1 ano' using errcode = '22023';
  end if;

  select timezone into v_tz from public.businesses where id = p_business_id;
  v_from := p_from::timestamp at time zone v_tz;
  v_to := (p_to + 1)::timestamp at time zone v_tz;
  v_today := (now() at time zone v_tz)::date;
  v_is_manager := public.is_business_manager(p_business_id);

  with
  period_sales as (
    select * from public.sales
    where business_id = p_business_id and status = 'completed'
      and created_at >= v_from and created_at < v_to
  ),
  today_sales as (
    select * from public.sales
    where business_id = p_business_id and status = 'completed'
      and created_at >= v_today::timestamp at time zone v_tz
      and created_at < (v_today + 1)::timestamp at time zone v_tz
  ),
  sale_cash as (
    select coalesce(sum(sp.amount_cents), 0) as v
    from public.sale_payments sp join period_sales s on s.id = sp.sale_id
    where sp.method <> 'credit'
  ),
  receivable_cash as (
    select coalesce(sum(rp.amount_cents), 0) as v
    from public.receivable_payments rp
    where rp.business_id = p_business_id and rp.reversed_at is null
      and rp.paid_at >= v_from and rp.paid_at < v_to
  ),
  other_income as (
    select coalesce(sum(amount_cents), 0) as v from public.financial_entries
    where business_id = p_business_id and kind = 'income' and status = 'paid'
      and paid_at >= v_from and paid_at < v_to
  ),
  expenses as (
    select coalesce(sum(amount_cents), 0) as v from public.financial_entries
    where business_id = p_business_id and kind = 'expense' and status <> 'canceled'
      and competence_date between p_from and p_to
  ),
  open_receivables as (
    select
      coalesce(sum(amount_cents - paid_cents), 0) as total,
      coalesce(sum(amount_cents - paid_cents) filter (where due_date < v_today), 0) as overdue,
      count(distinct customer_id) filter (where due_date < v_today) as overdue_customers
    from public.receivables
    where business_id = p_business_id and status in ('open', 'partial')
  ),
  low_stock as (
    select id, name, stock_qty, min_stock, unit from public.products
    where business_id = p_business_id and active and track_stock and stock_qty <= min_stock
    order by (stock_qty - min_stock), name
    limit 10
  ),
  daily as (
    select d::date as day,
      coalesce((
        select sum(total_cents) from period_sales s
        where (s.created_at at time zone v_tz)::date = d::date
      ), 0) as total_cents,
      coalesce((
        select count(*) from period_sales s
        where (s.created_at at time zone v_tz)::date = d::date
      ), 0) as sales_count
    from generate_series(p_from, p_to, interval '1 day') d
  ),
  top_products as (
    select si.product_id, max(si.product_name) as name,
      sum(si.quantity) as quantity, sum(si.total_cents) as total_cents
    from public.sale_items si join period_sales s on s.id = si.sale_id
    group by si.product_id
    order by sum(si.total_cents) desc
    limit 5
  ),
  recent as (
    select * from (
      select 'sale' as kind, s.id, s.created_at as at, s.total_cents as amount_cents,
        'Venda #' || s.number as description, s.status::text as status
      from public.sales s where s.business_id = p_business_id
      union all
      select 'receivable_payment', rp.id, rp.paid_at, rp.amount_cents,
        'Recebimento de fiado', case when rp.reversed_at is null then 'ok' else 'reversed' end
      from public.receivable_payments rp where rp.business_id = p_business_id
      union all
      select fe.kind::text, fe.id, coalesce(fe.paid_at, fe.created_at), fe.amount_cents,
        fe.description, fe.status::text
      from public.financial_entries fe where fe.business_id = p_business_id and v_is_manager
    ) x
    order by at desc
    limit 8
  )
  select jsonb_build_object(
    'period', jsonb_build_object('from', p_from, 'to', p_to),
    'today', jsonb_build_object(
      'sales_count', (select count(*) from today_sales),
      'revenue_cents', (select coalesce(sum(total_cents), 0) from today_sales)
    ),
    'sales_count', (select count(*) from period_sales),
    'revenue_cents', (select coalesce(sum(total_cents), 0) from period_sales),
    'cogs_cents', (select coalesce(sum(cost_cents), 0) from period_sales),
    'credit_sales_cents', (select coalesce(sum(credit_cents), 0) from period_sales),
    'average_ticket_cents', (select coalesce(round(avg(total_cents)), 0) from period_sales),
    'received_cents', (select v from sale_cash) + (select v from receivable_cash) + (select v from other_income),
    'received_breakdown', jsonb_build_object(
      'sales', (select v from sale_cash),
      'receivables', (select v from receivable_cash),
      'other_income', (select v from other_income)
    ),
    'expenses_cents', case when v_is_manager then (select v from expenses) else null end,
    'estimated_profit_cents', case when v_is_manager then
      (select coalesce(sum(total_cents), 0) - coalesce(sum(cost_cents), 0) from period_sales) - (select v from expenses)
      else null end,
    'receivables_open_cents', (select total from open_receivables),
    'receivables_overdue_cents', (select overdue from open_receivables),
    'overdue_customers', (select overdue_customers from open_receivables),
    'low_stock_count', (
      select count(*) from public.products
      where business_id = p_business_id and active and track_stock and stock_qty <= min_stock
    ),
    'low_stock', coalesce((select jsonb_agg(to_jsonb(l)) from low_stock l), '[]'::jsonb),
    'daily', coalesce((select jsonb_agg(to_jsonb(d) order by d.day) from daily d), '[]'::jsonb),
    'top_products', coalesce((select jsonb_agg(to_jsonb(t)) from top_products t), '[]'::jsonb),
    'recent', coalesce((select jsonb_agg(to_jsonb(r) order by r.at desc) from recent r), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------
-- finance_summary: fluxo de caixa e DRE simplificada (dono/gerente)
-- ---------------------------------------------------------------------
create or replace function public.finance_summary(p_business_id uuid, p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tz text;
  v_from timestamptz;
  v_to timestamptz;
  v_today date;
  v_result jsonb;
begin
  perform public._require_manager(p_business_id);
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then
    raise exception 'Período inválido' using errcode = '22023';
  end if;
  select timezone into v_tz from public.businesses where id = p_business_id;
  v_from := p_from::timestamp at time zone v_tz;
  v_to := (p_to + 1)::timestamp at time zone v_tz;
  v_today := (now() at time zone v_tz)::date;

  with
  ps as (
    select * from public.sales where business_id = p_business_id and status = 'completed'
      and created_at >= v_from and created_at < v_to
  ),
  cash_in_sales as (
    select coalesce(sum(sp.amount_cents), 0) v from public.sale_payments sp join ps on ps.id = sp.sale_id
    where sp.method <> 'credit'
  ),
  cash_in_receivables as (
    select coalesce(sum(amount_cents), 0) v from public.receivable_payments
    where business_id = p_business_id and reversed_at is null and paid_at >= v_from and paid_at < v_to
  ),
  cash_in_other as (
    select coalesce(sum(amount_cents), 0) v from public.financial_entries
    where business_id = p_business_id and kind = 'income' and status = 'paid' and paid_at >= v_from and paid_at < v_to
  ),
  cash_out as (
    select coalesce(sum(amount_cents), 0) v from public.financial_entries
    where business_id = p_business_id and kind = 'expense' and status = 'paid' and paid_at >= v_from and paid_at < v_to
  ),
  expenses_comp as (
    select coalesce(sum(amount_cents), 0) v from public.financial_entries
    where business_id = p_business_id and kind = 'expense' and status <> 'canceled'
      and competence_date between p_from and p_to
  ),
  by_category as (
    select coalesce(c.name, 'Sem categoria') as category, sum(fe.amount_cents) as total_cents
    from public.financial_entries fe left join public.finance_categories c on c.id = fe.category_id
    where fe.business_id = p_business_id and fe.kind = 'expense' and fe.status <> 'canceled'
      and fe.competence_date between p_from and p_to
    group by 1 order by 2 desc
  ),
  payables as (
    select
      coalesce(sum(amount_cents), 0) as open_cents,
      coalesce(sum(amount_cents) filter (where due_date < v_today), 0) as overdue_cents,
      count(*) filter (where due_date < v_today) as overdue_count
    from public.financial_entries
    where business_id = p_business_id and kind = 'expense' and status = 'pending'
  ),
  by_method as (
    select method::text as method, sum(v) as total_cents from (
      select sp.method, sp.amount_cents v from public.sale_payments sp join ps on ps.id = sp.sale_id
      where sp.method <> 'credit'
      union all
      select method, amount_cents from public.receivable_payments
      where business_id = p_business_id and reversed_at is null and paid_at >= v_from and paid_at < v_to
    ) x group by 1 order by 2 desc
  )
  select jsonb_build_object(
    'revenue_cents', (select coalesce(sum(total_cents), 0) from ps),
    'cogs_cents', (select coalesce(sum(cost_cents), 0) from ps),
    'gross_profit_cents', (select coalesce(sum(total_cents - cost_cents), 0) from ps),
    'expenses_cents', (select v from expenses_comp),
    'net_profit_cents', (select coalesce(sum(total_cents - cost_cents), 0) from ps) - (select v from expenses_comp),
    'cash_in_cents', (select v from cash_in_sales) + (select v from cash_in_receivables) + (select v from cash_in_other),
    'cash_in_breakdown', jsonb_build_object(
      'sales', (select v from cash_in_sales),
      'receivables', (select v from cash_in_receivables),
      'other_income', (select v from cash_in_other)
    ),
    'cash_out_cents', (select v from cash_out),
    'cash_balance_cents',
      (select v from cash_in_sales) + (select v from cash_in_receivables) + (select v from cash_in_other)
      - (select v from cash_out),
    'expenses_by_category', coalesce((select jsonb_agg(to_jsonb(b)) from by_category b), '[]'::jsonb),
    'received_by_method', coalesce((select jsonb_agg(to_jsonb(m)) from by_method m), '[]'::jsonb),
    'payables_open_cents', (select open_cents from payables),
    'payables_overdue_cents', (select overdue_cents from payables),
    'payables_overdue_count', (select overdue_count from payables)
  ) into v_result;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------
-- customer_balances: saldo devedor, total gasto e última compra por cliente
-- ---------------------------------------------------------------------
create or replace function public.customer_balances(p_business_id uuid)
returns table (
  customer_id uuid,
  name text,
  phone text,
  balance_cents bigint,
  overdue_cents bigint,
  oldest_due_date date,
  total_spent_cents bigint,
  purchases_count bigint,
  last_purchase_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date;
begin
  perform public._require_member(p_business_id);
  v_today := public._business_today(p_business_id);
  return query
  select c.id, c.name, c.phone,
    coalesce(r.balance, 0)::bigint,
    coalesce(r.overdue, 0)::bigint,
    r.oldest_due,
    coalesce(s.spent, 0)::bigint,
    coalesce(s.cnt, 0)::bigint,
    s.last_at
  from public.customers c
  left join lateral (
    select sum(rc.amount_cents - rc.paid_cents) as balance,
      sum(rc.amount_cents - rc.paid_cents) filter (where rc.due_date < v_today) as overdue,
      min(rc.due_date) as oldest_due
    from public.receivables rc
    where rc.customer_id = c.id and rc.status in ('open', 'partial')
  ) r on true
  left join lateral (
    select sum(sa.total_cents) as spent, count(*) as cnt, max(sa.created_at) as last_at
    from public.sales sa where sa.customer_id = c.id and sa.status = 'completed'
  ) s on true
  where c.business_id = p_business_id and c.active;
end;
$$;

-- ---------------------------------------------------------------------
-- pay_financial_entry: marca conta a pagar/receber como paga
-- ---------------------------------------------------------------------
create or replace function public.pay_financial_entry(
  p_entry_id uuid, p_method public.payment_method, p_paid_at timestamptz default now()
)
returns public.financial_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry public.financial_entries;
begin
  select * into v_entry from public.financial_entries where id = p_entry_id for update;
  if not found then
    raise exception 'Lançamento não encontrado' using errcode = 'P0002';
  end if;
  perform public._require_manager(v_entry.business_id);
  if v_entry.status = 'paid' then
    return v_entry;
  end if;
  if v_entry.status = 'canceled' then
    raise exception 'Lançamento cancelado' using errcode = '22023';
  end if;
  if p_method = 'credit' then
    raise exception 'Forma de pagamento inválida' using errcode = '22023';
  end if;
  update public.financial_entries set status = 'paid', paid_at = coalesce(p_paid_at, now()), method = p_method
  where id = p_entry_id returning * into v_entry;
  perform public._audit(v_entry.business_id, 'finance.pay', 'financial_entry', v_entry.id,
    jsonb_build_object('amount_cents', v_entry.amount_cents));
  return v_entry;
end;
$$;

-- ---------------------------------------------------------------------
-- Permissões de execução: apenas funções públicas da API
-- ---------------------------------------------------------------------
revoke execute on function public._require_member(uuid) from public, anon, authenticated;
revoke execute on function public._require_manager(uuid) from public, anon, authenticated;
revoke execute on function public._next_counter(uuid, text) from public, anon, authenticated;
revoke execute on function public._audit(uuid, text, text, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public._business_today(uuid) from public, anon, authenticated;
revoke execute on function public._apply_stock_movement(uuid, uuid, public.stock_movement_type, numeric, bigint, text, uuid, uuid, boolean) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

grant execute on function public.create_business(text, text, public.document_type, text, text) to authenticated;
grant execute on function public.create_product(uuid, text, bigint, bigint, numeric, numeric, text, uuid, text, text, text, boolean) to authenticated;
grant execute on function public.register_stock_movement(uuid, uuid, public.stock_movement_type, numeric, text, bigint, uuid, boolean) to authenticated;
grant execute on function public.complete_sale(uuid, uuid, jsonb, jsonb, uuid, bigint, date, text) to authenticated;
grant execute on function public.cancel_sale(uuid, text) to authenticated;
grant execute on function public.create_receivable(uuid, uuid, text, bigint, date) to authenticated;
grant execute on function public.receive_payment(uuid, uuid, bigint, public.payment_method, uuid, uuid, text) to authenticated;
grant execute on function public.reverse_receivable_payment(uuid, text) to authenticated;
grant execute on function public.dashboard_summary(uuid, date, date) to authenticated;
grant execute on function public.finance_summary(uuid, date, date) to authenticated;
grant execute on function public.customer_balances(uuid) to authenticated;
grant execute on function public.pay_financial_entry(uuid, public.payment_method, timestamptz) to authenticated;
