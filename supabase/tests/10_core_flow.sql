\o /dev/null
-- =====================================================================
-- Testes de integração: RLS, vendas atômicas, estoque, fiados e dashboard.
-- Executados por scripts/test-db.sh. Qualquer falha aborta o script.
-- =====================================================================

-- Usuários de teste
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'dona@teste.com', '{"full_name":"Maria Dona"}'),
  ('22222222-2222-2222-2222-222222222222', 'intruso@teste.com', '{"full_name":"João Intruso"}'),
  ('33333333-3333-3333-3333-333333333333', 'vendedor@teste.com', '{"full_name":"Ana Vendedora"}');

do $$ begin
  assert (select full_name from public.profiles where id = '11111111-1111-1111-1111-111111111111') = 'Maria Dona',
    'perfil deve ser criado pelo trigger';
end $$;

-- ---------------------------------------------------------------------
-- Dona cria o negócio e produtos
-- ---------------------------------------------------------------------
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);

do $$
declare
  v_b public.businesses;
  v_p1 public.products;
  v_p2 public.products;
  v_c uuid;
begin
  v_b := public.create_business('Mercadinho da Maria', 'grocery', 'cpf', '529.982.247-25', '(11) 98888-7777');
  assert v_b.document = '52998224725', 'documento deve ser normalizado';
  assert v_b.phone = '11988887777', 'telefone deve ser normalizado';
  perform set_config('test.bid', v_b.id::text, false);

  assert (select count(*) from public.finance_categories where business_id = v_b.id) >= 10,
    'categorias padrão devem ser criadas';

  v_p1 := public.create_product(v_b.id, 'Arroz 5kg', 2500, 1800, 10, 3);
  assert v_p1.stock_qty = 10, 'estoque inicial deve ser 10';
  perform set_config('test.p1', v_p1.id::text, false);

  v_p2 := public.create_product(v_b.id, 'Feijão 1kg', 900, 600, 2, 5, 'un', null, null, 'FJ01', '7891234567890');
  perform set_config('test.p2', v_p2.id::text, false);

  assert (select count(*) from public.stock_movements where product_id = v_p1.id and type = 'initial') = 1,
    'movimentação de estoque inicial deve existir';

  insert into public.customers (business_id, name, phone) values (v_b.id, 'Carlos Cliente', '11977776666')
  returning id into v_c;
  perform set_config('test.cid', v_c::text, false);
end $$;

-- Atualização direta do estoque deve ser negada (privilégio de coluna)
do $$
begin
  begin
    update public.products set stock_qty = 999 where id = current_setting('test.p1')::uuid;
    raise exception 'FALHA: atualização direta de estoque foi permitida';
  exception when insufficient_privilege then null;
  end;
  -- Inserção direta de venda também deve ser negada
  begin
    insert into public.sales (business_id, number, subtotal_cents, total_cents, idempotency_key)
    values (current_setting('test.bid')::uuid, 1, 0, 0, gen_random_uuid());
    raise exception 'FALHA: inserção direta em sales foi permitida';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ---------------------------------------------------------------------
-- Venda mista (dinheiro + fiado), idempotência e baixa de estoque
-- ---------------------------------------------------------------------
do $$
declare
  v_bid uuid := current_setting('test.bid')::uuid;
  v_p1 uuid := current_setting('test.p1')::uuid;
  v_p2 uuid := current_setting('test.p2')::uuid;
  v_cid uuid := current_setting('test.cid')::uuid;
  v_key uuid := gen_random_uuid();
  v_sale public.sales;
  v_again public.sales;
begin
  -- 2x arroz (5000) + 1x feijão (900) = 5900; desconto 400 => 5500
  v_sale := public.complete_sale(
    v_bid, v_key,
    jsonb_build_array(
      jsonb_build_object('product_id', v_p1, 'quantity', 2),
      jsonb_build_object('product_id', v_p2, 'quantity', 1)
    ),
    jsonb_build_array(
      jsonb_build_object('method', 'cash', 'amount_cents', 3000),
      jsonb_build_object('method', 'credit', 'amount_cents', 2500)
    ),
    v_cid, 400, null, 'teste'
  );
  assert v_sale.subtotal_cents = 5900, 'subtotal incorreto: ' || v_sale.subtotal_cents;
  assert v_sale.total_cents = 5500, 'total incorreto';
  assert v_sale.received_cents = 3000, 'recebido incorreto';
  assert v_sale.credit_cents = 2500, 'fiado incorreto';
  assert v_sale.cost_cents = 2 * 1800 + 600, 'CMV incorreto';
  assert v_sale.number = 1, 'número sequencial incorreto';
  perform set_config('test.sale1', v_sale.id::text, false);

  -- Mesma chave => mesma venda, sem duplicar estoque
  v_again := public.complete_sale(
    v_bid, v_key,
    jsonb_build_array(jsonb_build_object('product_id', v_p1, 'quantity', 2)),
    jsonb_build_array(jsonb_build_object('method', 'cash', 'amount_cents', 5000))
  );
  assert v_again.id = v_sale.id, 'idempotência falhou';
  assert (select count(*) from public.sales where business_id = v_bid) = 1, 'venda duplicada';

  assert (select stock_qty from public.products where id = v_p1) = 8, 'estoque arroz deveria ser 8';
  assert (select stock_qty from public.products where id = v_p2) = 1, 'estoque feijão deveria ser 1';

  assert (select amount_cents from public.receivables where sale_id = v_sale.id) = 2500,
    'fiado deve gerar conta a receber';
end $$;

-- Estoque insuficiente bloqueia a venda inteira (atomicidade)
do $$
declare
  v_bid uuid := current_setting('test.bid')::uuid;
  v_p1 uuid := current_setting('test.p1')::uuid;
  v_p2 uuid := current_setting('test.p2')::uuid;
begin
  begin
    perform public.complete_sale(
      v_bid, gen_random_uuid(),
      jsonb_build_array(
        jsonb_build_object('product_id', v_p1, 'quantity', 1),
        jsonb_build_object('product_id', v_p2, 'quantity', 5)
      ),
      jsonb_build_array(jsonb_build_object('method', 'pix', 'amount_cents', 7000))
    );
    raise exception 'FALHA: venda sem estoque foi aceita';
  exception when raise_exception then
    if sqlerrm like 'FALHA%' then raise; end if;
  end;
  assert (select stock_qty from public.products where id = v_p1) = 8, 'rollback do estoque falhou';
  assert (select count(*) from public.sales where business_id = v_bid) = 1, 'venda parcial gravada';

  -- Pagamento divergente do total
  begin
    perform public.complete_sale(
      v_bid, gen_random_uuid(),
      jsonb_build_array(jsonb_build_object('product_id', v_p1, 'quantity', 1)),
      jsonb_build_array(jsonb_build_object('method', 'pix', 'amount_cents', 100))
    );
    raise exception 'FALHA: pagamento divergente aceito';
  exception when invalid_parameter_value then null;
  end;

  -- Fiado sem cliente
  begin
    perform public.complete_sale(
      v_bid, gen_random_uuid(),
      jsonb_build_array(jsonb_build_object('product_id', v_p1, 'quantity', 1)),
      jsonb_build_array(jsonb_build_object('method', 'credit', 'amount_cents', 2500))
    );
    raise exception 'FALHA: fiado sem cliente aceito';
  exception when invalid_parameter_value then null;
  end;
end $$;

-- ---------------------------------------------------------------------
-- Entrada e ajuste de estoque
-- ---------------------------------------------------------------------
do $$
declare
  v_bid uuid := current_setting('test.bid')::uuid;
  v_p2 uuid := current_setting('test.p2')::uuid;
  v_key uuid := gen_random_uuid();
  v_m public.stock_movements;
begin
  v_m := public.register_stock_movement(v_bid, v_p2, 'purchase', 20, 'Compra fornecedor', 650, v_key, true);
  assert v_m.balance_after = 21, 'saldo após entrada incorreto';
  -- idempotente
  perform public.register_stock_movement(v_bid, v_p2, 'purchase', 20, 'Compra fornecedor', 650, v_key, true);
  assert (select stock_qty from public.products where id = v_p2) = 21, 'entrada duplicada';
  assert (select cost_cents from public.products where id = v_p2) = 650, 'custo deveria ser atualizado';

  begin
    perform public.register_stock_movement(v_bid, v_p2, 'adjustment', -1, '');
    raise exception 'FALHA: ajuste sem justificativa aceito';
  exception when invalid_parameter_value then null;
  end;

  begin
    perform public.register_stock_movement(v_bid, v_p2, 'adjustment', -100, 'Perda');
    raise exception 'FALHA: estoque negativo aceito';
  exception when raise_exception then
    if sqlerrm like 'FALHA%' then raise; end if;
  end;

  v_m := public.register_stock_movement(v_bid, v_p2, 'adjustment', -1, 'Produto avariado');
  assert v_m.balance_after = 20, 'ajuste incorreto';
end $$;

-- ---------------------------------------------------------------------
-- Recebimento de fiado parcial + total, idempotência e saldo
-- ---------------------------------------------------------------------
do $$
declare
  v_bid uuid := current_setting('test.bid')::uuid;
  v_cid uuid := current_setting('test.cid')::uuid;
  v_key uuid := gen_random_uuid();
  v_res jsonb;
  v_manual public.receivables;
begin
  v_manual := public.create_receivable(v_bid, v_cid, 'Dívida antiga', 1000, current_date - 5);

  -- Paga 3000: quita a dívida antiga (vence antes) e abate 2000 da venda
  v_res := public.receive_payment(v_bid, v_cid, 3000, 'pix', v_key);
  assert (v_res ->> 'applied_cents')::bigint = 3000, 'valor aplicado incorreto';
  assert (select status from public.receivables where id = v_manual.id) = 'paid', 'dívida antiga deveria estar paga';
  assert (select status from public.receivables where sale_id = current_setting('test.sale1')::uuid) = 'partial',
    'fiado da venda deveria estar parcial';

  v_res := public.receive_payment(v_bid, v_cid, 3000, 'pix', v_key);
  assert (v_res ->> 'duplicate')::boolean, 'recebimento deveria ser idempotente';

  begin
    perform public.receive_payment(v_bid, v_cid, 999999, 'cash', gen_random_uuid());
    raise exception 'FALHA: pagamento acima do saldo aceito';
  exception when invalid_parameter_value then null;
  end;

  assert (select balance_cents from public.customer_balances(v_bid) where customer_id = v_cid) = 500,
    'saldo devedor deveria ser 500';
end $$;

-- Cancelamento bloqueado com pagamento de fiado; após estorno, permitido
do $$
declare
  v_sale uuid := current_setting('test.sale1')::uuid;
  v_payment uuid;
  v_s public.sales;
begin
  begin
    perform public.cancel_sale(v_sale, 'Cliente desistiu');
    raise exception 'FALHA: cancelamento com fiado pago aceito';
  exception when invalid_parameter_value then null;
  end;

  select rp.id into v_payment from public.receivable_payments rp
  join public.receivables r on r.id = rp.receivable_id
  where r.sale_id = v_sale;
  perform public.reverse_receivable_payment(v_payment, 'Estorno para cancelamento');

  v_s := public.cancel_sale(v_sale, 'Cliente desistiu');
  assert v_s.status = 'canceled', 'venda deveria estar cancelada';
  assert (select stock_qty from public.products where id = current_setting('test.p1')::uuid) = 10,
    'estoque do arroz deveria voltar para 10';
  assert (select status from public.receivables where sale_id = v_sale) = 'canceled', 'fiado deveria ser cancelado';
  assert (select count(*) from public.audit_logs where action = 'sale.cancel') = 1, 'auditoria do cancelamento';
end $$;

-- ---------------------------------------------------------------------
-- Dashboard e financeiro: faturamento x recebimento x lucro
-- ---------------------------------------------------------------------
do $$
declare
  v_bid uuid := current_setting('test.bid')::uuid;
  v_p1 uuid := current_setting('test.p1')::uuid;
  v_cid uuid := current_setting('test.cid')::uuid;
  v_d jsonb;
  v_f jsonb;
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  -- Venda 100% fiado: fatura, mas não entra como recebido
  perform public.complete_sale(
    v_bid, gen_random_uuid(),
    jsonb_build_array(jsonb_build_object('product_id', v_p1, 'quantity', 1)),
    jsonb_build_array(jsonb_build_object('method', 'credit', 'amount_cents', 2500)),
    v_cid
  );
  -- Venda à vista no cartão
  perform public.complete_sale(
    v_bid, gen_random_uuid(),
    jsonb_build_array(jsonb_build_object('product_id', v_p1, 'quantity', 2)),
    jsonb_build_array(jsonb_build_object('method', 'card', 'amount_cents', 5000))
  );
  insert into public.financial_entries (business_id, kind, description, amount_cents, competence_date, status, paid_at, method)
  values (v_bid, 'expense', 'Conta de luz', 1200, v_today, 'paid', now(), 'pix');
  insert into public.financial_entries (business_id, kind, description, amount_cents, competence_date, due_date, status)
  values (v_bid, 'expense', 'Aluguel', 50000, v_today, v_today - 1, 'pending');

  v_d := public.dashboard_summary(v_bid, v_today - 6, v_today);
  -- Venda cancelada não conta: 2500 (fiado) + 5000 (cartão)
  assert (v_d ->> 'revenue_cents')::bigint = 7500, 'faturamento incorreto: ' || (v_d ->> 'revenue_cents');
  assert (v_d ->> 'sales_count')::int = 2, 'quantidade de vendas incorreta';
  -- Recebido = cartão 5000 + recebimento de fiado 1000 (o de 2000 foi estornado)
  assert (v_d ->> 'received_cents')::bigint = 6000, 'recebido incorreto: ' || (v_d ->> 'received_cents');
  assert (v_d ->> 'expenses_cents')::bigint = 51200, 'despesas incorretas';
  -- Lucro = 7500 - 3*1800 - 51200
  assert (v_d ->> 'estimated_profit_cents')::bigint = 7500 - 5400 - 51200, 'lucro incorreto';
  assert (v_d ->> 'receivables_open_cents')::bigint = 2500, 'a receber incorreto: ' || (v_d ->> 'receivables_open_cents');
  assert jsonb_array_length(v_d -> 'daily') = 7, 'série diária deveria ter 7 dias';

  v_f := public.finance_summary(v_bid, v_today - 6, v_today);
  assert (v_f ->> 'cash_out_cents')::bigint = 1200, 'saída de caixa incorreta';
  assert (v_f ->> 'payables_overdue_cents')::bigint = 50000, 'contas a pagar vencidas incorretas';
  assert (v_f ->> 'cash_balance_cents')::bigint = 6000 - 1200, 'saldo de caixa incorreto';
end $$;

-- ---------------------------------------------------------------------
-- Isolamento entre usuários (RLS)
-- ---------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);

do $$
declare
  v_bid uuid := current_setting('test.bid')::uuid;
  v_n int;
begin
  select count(*) into v_n from public.businesses;
  assert v_n = 0, 'intruso não pode ver negócios de outros';
  select count(*) into v_n from public.products;
  assert v_n = 0, 'intruso não pode ver produtos';
  select count(*) into v_n from public.customers;
  assert v_n = 0, 'intruso não pode ver clientes';
  select count(*) into v_n from public.sales;
  assert v_n = 0, 'intruso não pode ver vendas';

  update public.customers set name = 'hack' where business_id = v_bid;
  get diagnostics v_n = row_count;
  assert v_n = 0, 'intruso não pode alterar clientes';

  begin
    perform public.dashboard_summary(v_bid, current_date, current_date);
    raise exception 'FALHA: intruso acessou o dashboard';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.complete_sale(v_bid, gen_random_uuid(),
      jsonb_build_array(jsonb_build_object('product_id', current_setting('test.p1')::uuid, 'quantity', 1)),
      jsonb_build_array(jsonb_build_object('method', 'cash', 'amount_cents', 2500)));
    raise exception 'FALHA: intruso registrou venda';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.customers (business_id, name) values (v_bid, 'Invasor');
    raise exception 'FALHA: intruso inseriu cliente';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ---------------------------------------------------------------------
-- Vendedor: vende, mas não altera produtos nem vê financeiro
-- ---------------------------------------------------------------------
reset role;
insert into public.business_members (business_id, user_id, role)
values (current_setting('test.bid')::uuid, '33333333-3333-3333-3333-333333333333', 'seller');
set role authenticated;
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', false);

do $$
declare
  v_bid uuid := current_setting('test.bid')::uuid;
  v_p1 uuid := current_setting('test.p1')::uuid;
  v_n int;
  v_d jsonb;
begin
  perform public.complete_sale(v_bid, gen_random_uuid(),
    jsonb_build_array(jsonb_build_object('product_id', v_p1, 'quantity', 1)),
    jsonb_build_array(jsonb_build_object('method', 'cash', 'amount_cents', 2300)),
    null, 200);  -- 8% de desconto: dentro do limite de 10%

  begin
    perform public.complete_sale(v_bid, gen_random_uuid(),
      jsonb_build_array(jsonb_build_object('product_id', v_p1, 'quantity', 1)),
      jsonb_build_array(jsonb_build_object('method', 'cash', 'amount_cents', 1500)),
      null, 1000);  -- 40%: acima do limite
    raise exception 'FALHA: desconto acima do limite aceito para vendedor';
  exception when insufficient_privilege then null;
  end;

  update public.products set price_cents = 1 where id = v_p1;
  get diagnostics v_n = row_count;
  assert v_n = 0, 'vendedor não pode alterar preço';

  select count(*) into v_n from public.financial_entries;
  assert v_n = 0, 'vendedor não pode ver lançamentos financeiros';

  v_d := public.dashboard_summary(v_bid, current_date - 1, current_date + 1);
  assert v_d -> 'estimated_profit_cents' = 'null'::jsonb, 'vendedor não deve ver lucro';

  begin
    perform public.cancel_sale((select id from public.sales where business_id = v_bid limit 1), 'tentativa');
    raise exception 'FALHA: vendedor cancelou venda';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ---------------------------------------------------------------------
-- Storage: somente membros acessam fotos do próprio negócio
-- ---------------------------------------------------------------------
do $$
declare
  v_bid uuid := current_setting('test.bid')::uuid;
begin
  begin
    insert into storage.objects (bucket_id, name) values ('product-photos', v_bid || '/x.jpg');
    raise exception 'FALHA: vendedor enviou foto';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
do $$
declare
  v_bid uuid := current_setting('test.bid')::uuid;
begin
  insert into storage.objects (bucket_id, name) values ('product-photos', v_bid || '/foto.jpg');
  begin
    insert into storage.objects (bucket_id, name) values ('product-photos', gen_random_uuid() || '/x.jpg');
    raise exception 'FALHA: upload em pasta de outro negócio';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
\echo '   ✔ fluxo principal, RLS, idempotência e atomicidade'
