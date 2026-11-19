-- Receipt photos: private bucket, files at <user id>/<file>.jpg, owner-only access. Touches only v2 objects.
alter table public.v2_transactions add column if not exists receipt_path text;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('v2-receipts', 'v2-receipts', false, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
create policy v2_receipts_select on storage.objects for select to authenticated
  using (bucket_id = 'v2-receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy v2_receipts_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'v2-receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy v2_receipts_update on storage.objects for update to authenticated
  using (bucket_id = 'v2-receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy v2_receipts_delete on storage.objects for delete to authenticated
  using (bucket_id = 'v2-receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);
