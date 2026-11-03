-- =====================================================================
-- Row Level Security e privilégios
-- Princípio: o cliente (role "authenticated") só LÊ dados dos negócios dos
-- quais é membro. Operações críticas (vendas, estoque, pagamentos) NÃO
-- possuem permissão de escrita direta: passam obrigatoriamente pelas
-- funções transacionais (SECURITY DEFINER) definidas na próxima migration.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Funções auxiliares de autorização
-- ---------------------------------------------------------------------
create or replace function public.is_business_member(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.business_members m
    where m.business_id = p_business_id and m.user_id = auth.uid()
  );
$$;

create or replace function public.has_business_role(p_business_id uuid, p_roles public.business_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.business_members m
    where m.business_id = p_business_id
      and m.user_id = auth.uid()
      and m.role = any (p_roles)
  );
$$;

create or replace function public.is_business_manager(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_business_role(p_business_id, array['owner', 'manager']::public.business_role[]);
$$;

-- ---------------------------------------------------------------------
-- Remove privilégios padrão e concede apenas o necessário
-- ---------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon;

-- Habilita RLS em todas as tabelas
alter table public.profiles enable row level security;
alter table public.businesses enable row level security;
alter table public.business_members enable row level security;
alter table public.product_categories enable row level security;
alter table public.products enable row level security;
alter table public.stock_movements enable row level security;
alter table public.customers enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.sale_payments enable row level security;
alter table public.receivables enable row level security;
alter table public.receivable_payments enable row level security;
alter table public.finance_categories enable row level security;
alter table public.financial_entries enable row level security;
alter table public.quotes enable row level security;
alter table public.quote_items enable row level security;
alter table public.documents enable row level security;
alter table public.subscriptions enable row level security;
alter table public.ai_usage enable row level security;
alter table public.audit_logs enable row level security;
alter table public.business_counters enable row level security;

-- ---------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------
grant select on public.profiles to authenticated;
grant update (full_name, phone) on public.profiles to authenticated;
create policy profiles_select_own on public.profiles
  for select to authenticated using (id = auth.uid());
create policy profiles_update_own on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- ---------------------------------------------------------------------
-- businesses (criação via RPC create_business)
-- ---------------------------------------------------------------------
grant select on public.businesses to authenticated;
grant update (
  name, business_type, document_type, document, phone, timezone,
  allow_negative_stock, seller_max_discount_percent, default_credit_days, receipt_footer
) on public.businesses to authenticated;
create policy businesses_select_member on public.businesses
  for select to authenticated using (public.is_business_member(id));
create policy businesses_update_manager on public.businesses
  for update to authenticated
  using (public.is_business_manager(id)) with check (public.is_business_manager(id));

-- ---------------------------------------------------------------------
-- business_members
-- ---------------------------------------------------------------------
grant select on public.business_members to authenticated;
create policy members_select on public.business_members
  for select to authenticated using (public.is_business_member(business_id));

-- ---------------------------------------------------------------------
-- product_categories
-- ---------------------------------------------------------------------
grant select, delete on public.product_categories to authenticated;
grant insert (business_id, name) on public.product_categories to authenticated;
grant update (name) on public.product_categories to authenticated;
create policy pcat_select on public.product_categories
  for select to authenticated using (public.is_business_member(business_id));
create policy pcat_insert on public.product_categories
  for insert to authenticated with check (public.is_business_manager(business_id));
create policy pcat_update on public.product_categories
  for update to authenticated
  using (public.is_business_manager(business_id)) with check (public.is_business_manager(business_id));
create policy pcat_delete on public.product_categories
  for delete to authenticated using (public.is_business_manager(business_id));

-- ---------------------------------------------------------------------
-- products (criação via RPC create_product; estoque só via RPC)
-- ---------------------------------------------------------------------
grant select on public.products to authenticated;
grant update (
  category_id, name, description, internal_code, barcode, unit,
  cost_cents, price_cents, min_stock, track_stock, photo_path, active
) on public.products to authenticated;
create policy products_select on public.products
  for select to authenticated using (public.is_business_member(business_id));
create policy products_update on public.products
  for update to authenticated
  using (public.is_business_manager(business_id)) with check (public.is_business_manager(business_id));

-- ---------------------------------------------------------------------
-- stock_movements (somente leitura)
-- ---------------------------------------------------------------------
grant select on public.stock_movements to authenticated;
create policy stock_mov_select on public.stock_movements
  for select to authenticated using (public.is_business_member(business_id));

-- ---------------------------------------------------------------------
-- customers
-- ---------------------------------------------------------------------
grant select, delete on public.customers to authenticated;
grant insert (business_id, name, phone, email, address, notes) on public.customers to authenticated;
grant update (name, phone, email, address, notes, active) on public.customers to authenticated;
create policy customers_select on public.customers
  for select to authenticated using (public.is_business_member(business_id));
create policy customers_insert on public.customers
  for insert to authenticated with check (public.is_business_member(business_id));
create policy customers_update on public.customers
  for update to authenticated
  using (public.is_business_member(business_id)) with check (public.is_business_member(business_id));
create policy customers_delete on public.customers
  for delete to authenticated using (public.is_business_manager(business_id));

-- ---------------------------------------------------------------------
-- sales / sale_items / sale_payments (somente leitura; escrita via RPC)
-- ---------------------------------------------------------------------
grant select on public.sales, public.sale_items, public.sale_payments to authenticated;
create policy sales_select on public.sales
  for select to authenticated using (public.is_business_member(business_id));
create policy sale_items_select on public.sale_items
  for select to authenticated using (public.is_business_member(business_id));
create policy sale_payments_select on public.sale_payments
  for select to authenticated using (public.is_business_member(business_id));

-- ---------------------------------------------------------------------
-- receivables (fiado manual permitido; status/pagamentos só via RPC)
-- ---------------------------------------------------------------------
grant select on public.receivables to authenticated;
grant update (description, due_date) on public.receivables to authenticated;
create policy receivables_select on public.receivables
  for select to authenticated using (public.is_business_member(business_id));
create policy receivables_update on public.receivables
  for update to authenticated
  using (public.is_business_manager(business_id)) with check (public.is_business_manager(business_id));

grant select on public.receivable_payments to authenticated;
create policy receivable_payments_select on public.receivable_payments
  for select to authenticated using (public.is_business_member(business_id));

-- ---------------------------------------------------------------------
-- Financeiro (restrito a dono/gerente)
-- ---------------------------------------------------------------------
grant select, delete on public.finance_categories to authenticated;
grant insert (business_id, kind, name) on public.finance_categories to authenticated;
grant update (name) on public.finance_categories to authenticated;
create policy fcat_select on public.finance_categories
  for select to authenticated using (public.is_business_member(business_id));
create policy fcat_insert on public.finance_categories
  for insert to authenticated with check (public.is_business_manager(business_id));
create policy fcat_update on public.finance_categories
  for update to authenticated
  using (public.is_business_manager(business_id)) with check (public.is_business_manager(business_id));
create policy fcat_delete on public.finance_categories
  for delete to authenticated using (public.is_business_manager(business_id));

grant select, delete on public.financial_entries to authenticated;
grant insert (
  business_id, kind, category_id, description, amount_cents, competence_date,
  due_date, status, paid_at, method, notes
) on public.financial_entries to authenticated;
grant update (
  category_id, description, amount_cents, competence_date, due_date, status, paid_at, method, notes
) on public.financial_entries to authenticated;
create policy fin_select on public.financial_entries
  for select to authenticated using (public.is_business_manager(business_id));
create policy fin_insert on public.financial_entries
  for insert to authenticated with check (public.is_business_manager(business_id));
create policy fin_update on public.financial_entries
  for update to authenticated
  using (public.is_business_manager(business_id)) with check (public.is_business_manager(business_id));
create policy fin_delete on public.financial_entries
  for delete to authenticated using (public.is_business_manager(business_id));

-- ---------------------------------------------------------------------
-- Orçamentos e documentos (UI na Fase 3)
-- ---------------------------------------------------------------------
grant select, insert, update, delete on public.quotes, public.quote_items, public.documents to authenticated;
create policy quotes_all on public.quotes
  for all to authenticated
  using (public.is_business_member(business_id)) with check (public.is_business_member(business_id));
create policy quote_items_all on public.quote_items
  for all to authenticated
  using (public.is_business_member(business_id)) with check (public.is_business_member(business_id));
create policy documents_all on public.documents
  for all to authenticated
  using (public.is_business_member(business_id)) with check (public.is_business_member(business_id));

-- ---------------------------------------------------------------------
-- Assinaturas e IA (somente leitura para o usuário; escrita pelo backend)
-- ---------------------------------------------------------------------
grant select on public.subscriptions to authenticated;
create policy subscriptions_select_own on public.subscriptions
  for select to authenticated using (user_id = auth.uid());

grant select on public.ai_usage to authenticated;
create policy ai_usage_select on public.ai_usage
  for select to authenticated using (public.is_business_member(business_id));

-- ---------------------------------------------------------------------
-- Auditoria (somente leitura para dono/gerente)
-- ---------------------------------------------------------------------
grant select on public.audit_logs to authenticated;
create policy audit_select on public.audit_logs
  for select to authenticated using (public.is_business_manager(business_id));

-- business_counters: sem acesso direto (somente funções internas)

grant execute on function public.is_business_member(uuid) to authenticated;
grant execute on function public.has_business_role(uuid, public.business_role[]) to authenticated;
grant execute on function public.is_business_manager(uuid) to authenticated;
