-- =====================================================================
-- Storage: fotos de produtos (bucket privado)
-- Caminho obrigatório: {business_id}/{arquivo}
-- =====================================================================

insert into storage.buckets (id, name, public)
values ('product-photos', 'product-photos', false)
on conflict (id) do nothing;

create or replace function public.storage_business_id(p_name text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return split_part(p_name, '/', 1)::uuid;
exception when others then
  return null;
end;
$$;
grant execute on function public.storage_business_id(text) to authenticated;

create policy product_photos_select on storage.objects
  for select to authenticated
  using (bucket_id = 'product-photos' and public.is_business_member(public.storage_business_id(name)));

create policy product_photos_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'product-photos' and public.is_business_manager(public.storage_business_id(name)));

create policy product_photos_update on storage.objects
  for update to authenticated
  using (bucket_id = 'product-photos' and public.is_business_manager(public.storage_business_id(name)));

create policy product_photos_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'product-photos' and public.is_business_manager(public.storage_business_id(name)));
