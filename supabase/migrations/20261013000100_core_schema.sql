-- =====================================================================
-- Gestão Fácil IA — Esquema principal
-- Valores monetários são armazenados em CENTAVOS (bigint) para evitar
-- erros de arredondamento de ponto flutuante.
-- Quantidades usam numeric(14,3) para permitir itens fracionados (kg, l).
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------
create type public.business_role as enum ('owner', 'manager', 'seller');
create type public.document_type as enum ('cpf', 'cnpj');
create type public.stock_movement_type as enum (
  'initial',      -- estoque inicial no cadastro
  'purchase',     -- entrada de mercadoria
  'adjustment',   -- ajuste manual (com justificativa)
  'sale',         -- baixa por venda
  'sale_cancel'   -- reversão por cancelamento de venda
);
create type public.sale_status as enum ('completed', 'canceled');
create type public.payment_method as enum ('cash', 'pix', 'card', 'credit');
create type public.receivable_status as enum ('open', 'partial', 'paid', 'canceled');
create type public.finance_kind as enum ('income', 'expense');
create type public.finance_status as enum ('pending', 'paid', 'canceled');
create type public.quote_status as enum ('draft', 'sent', 'approved', 'rejected', 'expired');
create type public.subscription_status as enum (
  'active', 'trialing', 'grace_period', 'billing_issue', 'canceled', 'expired'
);

-- ---------------------------------------------------------------------
-- Função utilitária: updated_at
-- ---------------------------------------------------------------------
create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Perfis (1:1 com auth.users)
-- ---------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 120),
  phone text check (phone is null or char_length(phone) <= 20),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.tg_set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(left(new.raw_user_meta_data ->> 'full_name', 120), ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- Negócios e membros (permissões)
-- ---------------------------------------------------------------------
create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  business_type text not null default 'other' check (char_length(business_type) <= 40),
  document_type public.document_type,
  document text check (document is null or document ~ '^[0-9]{11}$|^[0-9]{14}$'),
  phone text check (phone is null or char_length(phone) <= 20),
  currency char(3) not null default 'BRL',
  timezone text not null default 'America/Sao_Paulo',
  allow_negative_stock boolean not null default false,
  seller_max_discount_percent numeric(5,2) not null default 10
    check (seller_max_discount_percent between 0 and 100),
  default_credit_days integer not null default 30 check (default_credit_days between 0 and 365),
  receipt_footer text check (receipt_footer is null or char_length(receipt_footer) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint businesses_document_consistency check (
    (document is null and document_type is null)
    or (document_type = 'cpf' and char_length(document) = 11)
    or (document_type = 'cnpj' and char_length(document) = 14)
  )
);
create index businesses_owner_idx on public.businesses (owner_id);
create trigger businesses_updated_at before update on public.businesses
  for each row execute function public.tg_set_updated_at();

create table public.business_members (
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.business_role not null default 'seller',
  created_at timestamptz not null default now(),
  primary key (business_id, user_id)
);
create index business_members_user_idx on public.business_members (user_id);

-- ---------------------------------------------------------------------
-- Produtos e estoque
-- ---------------------------------------------------------------------
create table public.product_categories (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  created_at timestamptz not null default now(),
  unique (business_id, name)
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  category_id uuid references public.product_categories (id) on delete set null,
  name text not null check (char_length(name) between 1 and 120),
  description text check (description is null or char_length(description) <= 500),
  internal_code text check (internal_code is null or char_length(internal_code) <= 40),
  barcode text check (barcode is null or barcode ~ '^[0-9A-Za-z-]{4,32}$'),
  unit text not null default 'un' check (unit in ('un', 'kg', 'g', 'l', 'ml', 'm', 'cx', 'pct', 'serv')),
  cost_cents bigint not null default 0 check (cost_cents >= 0),
  price_cents bigint not null default 0 check (price_cents >= 0),
  stock_qty numeric(14,3) not null default 0,
  min_stock numeric(14,3) not null default 0 check (min_stock >= 0),
  track_stock boolean not null default true,
  photo_path text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index products_business_idx on public.products (business_id, active, name);
create unique index products_barcode_uniq on public.products (business_id, barcode) where barcode is not null;
create unique index products_code_uniq on public.products (business_id, internal_code) where internal_code is not null;
create trigger products_updated_at before update on public.products
  for each row execute function public.tg_set_updated_at();

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  type public.stock_movement_type not null,
  quantity numeric(14,3) not null check (quantity <> 0), -- delta com sinal
  balance_after numeric(14,3) not null,
  unit_cost_cents bigint check (unit_cost_cents is null or unit_cost_cents >= 0),
  reason text check (reason is null or char_length(reason) <= 300),
  sale_id uuid, -- FK adicionada após criação de sales
  idempotency_key uuid,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index stock_movements_product_idx on public.stock_movements (product_id, created_at desc);
create index stock_movements_business_idx on public.stock_movements (business_id, created_at desc);
create unique index stock_movements_idem_uniq on public.stock_movements (business_id, idempotency_key)
  where idempotency_key is not null;

-- ---------------------------------------------------------------------
-- Clientes
-- ---------------------------------------------------------------------
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  phone text check (phone is null or phone ~ '^[0-9]{10,13}$'),
  email text check (email is null or char_length(email) <= 160),
  address text check (address is null or char_length(address) <= 300),
  notes text check (notes is null or char_length(notes) <= 1000),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index customers_business_idx on public.customers (business_id, active, name);
create trigger customers_updated_at before update on public.customers
  for each row execute function public.tg_set_updated_at();

-- ---------------------------------------------------------------------
-- Vendas
-- ---------------------------------------------------------------------
create table public.sales (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  number bigint not null,
  customer_id uuid references public.customers (id) on delete set null,
  status public.sale_status not null default 'completed',
  subtotal_cents bigint not null check (subtotal_cents >= 0),
  discount_cents bigint not null default 0 check (discount_cents >= 0),
  total_cents bigint not null check (total_cents >= 0),
  cost_cents bigint not null default 0 check (cost_cents >= 0), -- CMV da venda
  received_cents bigint not null default 0 check (received_cents >= 0), -- pago no ato
  credit_cents bigint not null default 0 check (credit_cents >= 0),     -- fiado
  notes text check (notes is null or char_length(notes) <= 500),
  idempotency_key uuid not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  canceled_at timestamptz,
  canceled_by uuid references auth.users (id) on delete set null,
  cancel_reason text check (cancel_reason is null or char_length(cancel_reason) <= 300),
  unique (business_id, idempotency_key),
  unique (business_id, number),
  check (total_cents = subtotal_cents - discount_cents),
  check (received_cents + credit_cents = total_cents)
);
create index sales_business_created_idx on public.sales (business_id, created_at desc);
create index sales_customer_idx on public.sales (customer_id, created_at desc);

alter table public.stock_movements
  add constraint stock_movements_sale_fk foreign key (sale_id) references public.sales (id) on delete set null;

create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  product_name text not null,
  quantity numeric(14,3) not null check (quantity > 0),
  unit_price_cents bigint not null check (unit_price_cents >= 0),
  unit_cost_cents bigint not null default 0 check (unit_cost_cents >= 0),
  discount_cents bigint not null default 0 check (discount_cents >= 0),
  total_cents bigint not null check (total_cents >= 0)
);
create index sale_items_sale_idx on public.sale_items (sale_id);
create index sale_items_product_idx on public.sale_items (business_id, product_id);

create table public.sale_payments (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  method public.payment_method not null,
  amount_cents bigint not null check (amount_cents > 0),
  created_at timestamptz not null default now()
);
create index sale_payments_sale_idx on public.sale_payments (sale_id);
create index sale_payments_business_idx on public.sale_payments (business_id, created_at);

-- ---------------------------------------------------------------------
-- Fiados (contas a receber) e recebimentos
-- ---------------------------------------------------------------------
create table public.receivables (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete restrict,
  sale_id uuid references public.sales (id) on delete set null,
  description text not null check (char_length(description) between 1 and 200),
  amount_cents bigint not null check (amount_cents > 0),
  paid_cents bigint not null default 0 check (paid_cents >= 0),
  due_date date not null,
  status public.receivable_status not null default 'open',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (paid_cents <= amount_cents)
);
create index receivables_business_status_idx on public.receivables (business_id, status, due_date);
create index receivables_customer_idx on public.receivables (customer_id, status);
create trigger receivables_updated_at before update on public.receivables
  for each row execute function public.tg_set_updated_at();

create table public.receivable_payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  receivable_id uuid not null references public.receivables (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete restrict,
  amount_cents bigint not null check (amount_cents > 0),
  method public.payment_method not null check (method <> 'credit'),
  paid_at timestamptz not null default now(),
  notes text check (notes is null or char_length(notes) <= 300),
  idempotency_key uuid,
  reversed_at timestamptz,
  reversed_by uuid references auth.users (id) on delete set null,
  reversal_reason text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index receivable_payments_receivable_idx on public.receivable_payments (receivable_id);
create index receivable_payments_business_idx on public.receivable_payments (business_id, paid_at);
-- Uma chave de idempotência pode gerar vários registros (rateio FIFO entre
-- fiados do mesmo cliente), por isso a unicidade é por (chave, fiado).
create unique index receivable_payments_idem_uniq
  on public.receivable_payments (business_id, idempotency_key, receivable_id)
  where idempotency_key is not null;

-- ---------------------------------------------------------------------
-- Financeiro: receitas avulsas, despesas e contas a pagar
-- ---------------------------------------------------------------------
create table public.finance_categories (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  kind public.finance_kind not null,
  name text not null check (char_length(name) between 1 and 60),
  created_at timestamptz not null default now(),
  unique (business_id, kind, name)
);

create table public.financial_entries (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  kind public.finance_kind not null,
  category_id uuid references public.finance_categories (id) on delete set null,
  description text not null check (char_length(description) between 1 and 200),
  amount_cents bigint not null check (amount_cents > 0),
  competence_date date not null default current_date, -- data de competência
  due_date date,                                       -- vencimento (contas a pagar)
  status public.finance_status not null default 'paid',
  paid_at timestamptz,
  method public.payment_method check (method is null or method <> 'credit'),
  notes text check (notes is null or char_length(notes) <= 500),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'paid') = (paid_at is not null))
);
create index financial_entries_business_idx on public.financial_entries (business_id, kind, competence_date);
create index financial_entries_due_idx on public.financial_entries (business_id, status, due_date);
create trigger financial_entries_updated_at before update on public.financial_entries
  for each row execute function public.tg_set_updated_at();

-- ---------------------------------------------------------------------
-- Orçamentos e recibos (UI na Fase 3; esquema já preparado)
-- ---------------------------------------------------------------------
create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  customer_id uuid references public.customers (id) on delete set null,
  number bigint not null,
  status public.quote_status not null default 'draft',
  valid_until date,
  subtotal_cents bigint not null default 0 check (subtotal_cents >= 0),
  discount_cents bigint not null default 0 check (discount_cents >= 0),
  total_cents bigint not null default 0 check (total_cents >= 0),
  notes text check (notes is null or char_length(notes) <= 1000),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, number)
);
create trigger quotes_updated_at before update on public.quotes
  for each row execute function public.tg_set_updated_at();

create table public.quote_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  description text not null check (char_length(description) between 1 and 200),
  quantity numeric(14,3) not null check (quantity > 0),
  unit_price_cents bigint not null check (unit_price_cents >= 0),
  total_cents bigint not null check (total_cents >= 0)
);
create index quote_items_quote_idx on public.quote_items (quote_id);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  kind text not null check (kind in ('sale_receipt', 'payment_receipt', 'quote')),
  reference_id uuid not null,
  storage_path text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index documents_business_idx on public.documents (business_id, created_at desc);

-- ---------------------------------------------------------------------
-- Assinaturas (escritas SOMENTE pelo backend via webhook RevenueCat — Fase 2)
-- ---------------------------------------------------------------------
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null default 'revenuecat',
  environment text not null default 'production' check (environment in ('production', 'sandbox')),
  entitlement text not null default 'pro',
  product_id text,
  store text,
  status public.subscription_status not null,
  current_period_end timestamptz,
  grace_period_end timestamptz,
  will_renew boolean,
  original_transaction_id text,
  last_event_id text,
  raw_event jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider, entitlement, environment)
);
create trigger subscriptions_updated_at before update on public.subscriptions
  for each row execute function public.tg_set_updated_at();

-- ---------------------------------------------------------------------
-- Consumo de IA (Fase 3)
-- ---------------------------------------------------------------------
create table public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  period_month date not null, -- primeiro dia do mês
  request_count integer not null default 0 check (request_count >= 0),
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  updated_at timestamptz not null default now(),
  unique (business_id, user_id, period_month)
);

-- ---------------------------------------------------------------------
-- Auditoria (somente inserções via funções SECURITY DEFINER)
-- ---------------------------------------------------------------------
create table public.audit_logs (
  id bigint generated always as identity primary key,
  business_id uuid references public.businesses (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  action text not null,
  entity text not null,
  entity_id uuid,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_business_idx on public.audit_logs (business_id, created_at desc);

-- Contadores sequenciais por negócio (número da venda / orçamento)
create table public.business_counters (
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null,
  value bigint not null default 0,
  primary key (business_id, name)
);
