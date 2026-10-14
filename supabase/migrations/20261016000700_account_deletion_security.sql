-- =====================================================================
-- Fase 4 — Exclusão de conta (exigência Google Play / App Store / LGPD)
-- e endurecimento final de segurança.
-- =====================================================================

-- As FKs de fiados para clientes eram RESTRICT (checadas imediatamente),
-- o que impediria excluir um negócio inteiro em cascata. NO ACTION mantém a
-- proteção contra exclusão isolada de cliente com fiado, mas é verificada
-- no fim do comando, depois das cascatas.
alter table public.receivables drop constraint receivables_customer_id_fkey;
alter table public.receivables
  add constraint receivables_customer_id_fkey foreign key (customer_id) references public.customers (id);
alter table public.receivable_payments drop constraint receivable_payments_customer_id_fkey;
alter table public.receivable_payments
  add constraint receivable_payments_customer_id_fkey foreign key (customer_id) references public.customers (id);

-- Registro mínimo de exclusões (sem dados pessoais além do id já excluído)
create table public.account_deletion_log (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  businesses_deleted integer not null,
  memberships_removed integer not null,
  deleted_at timestamptz not null default now()
);
alter table public.account_deletion_log enable row level security;
-- Sem políticas: acesso apenas pelo backend

-- ---------------------------------------------------------------------
-- delete_user_data: apaga negócios do usuário (e todos os dados deles),
-- vínculos em negócios de terceiros e o perfil. Retorna os ids dos
-- negócios para o backend remover as fotos do Storage.
-- A conta em auth.users é removida em seguida pela Edge Function.
-- ---------------------------------------------------------------------
create or replace function public.delete_user_data(p_user_id uuid)
returns uuid[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_businesses uuid[];
  v_memberships integer;
begin
  if p_user_id is null then
    raise exception 'Usuário inválido' using errcode = '22023';
  end if;

  select coalesce(array_agg(id), '{}') into v_businesses from public.businesses where owner_id = p_user_id;

  delete from public.business_members where user_id = p_user_id and not (business_id = any (v_businesses));
  get diagnostics v_memberships = row_count;

  -- Cascata: produtos, estoque, clientes, vendas, fiados, financeiro,
  -- orçamentos, documentos, uso de IA e auditoria do negócio
  delete from public.businesses where id = any (v_businesses);
  delete from public.ai_usage where user_id = p_user_id;
  delete from public.profiles where id = p_user_id;

  insert into public.account_deletion_log (user_id, businesses_deleted, memberships_removed)
  values (p_user_id, coalesce(array_length(v_businesses, 1), 0), v_memberships);

  return v_businesses;
end;
$$;

revoke execute on function public.delete_user_data(uuid) from public, anon, authenticated;
grant execute on function public.delete_user_data(uuid) to service_role;

-- ---------------------------------------------------------------------
-- Endurecimento: nenhuma função do schema public é executável por PUBLIC
-- (inclui anon). O PostgreSQL concede EXECUTE a PUBLIC por padrão e o
-- "alter default privileges ... in schema" não remove esse padrão global;
-- cada função usada pelo app já tem GRANT explícito para authenticated.
-- ---------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;
alter default privileges revoke execute on functions from public;

-- Histórico de documentos e itens de orçamento não são apagados diretamente
-- (itens saem junto com o orçamento, por cascata).
revoke delete on public.documents, public.quote_items from authenticated;
