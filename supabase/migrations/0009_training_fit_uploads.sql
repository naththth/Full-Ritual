-- =====================================================================
-- FULL RITUAL · .FIT uploads
-- Bucket privado para arquivos Garmin/MyWhoosh e políticas por usuário.
-- =====================================================================

insert into storage.buckets (id, name, public)
values ('training-fit', 'training-fit', false)
on conflict (id) do update set public = excluded.public;

drop policy if exists "training fit own folder insert" on storage.objects;
drop policy if exists "training fit own folder select" on storage.objects;
drop policy if exists "training fit own folder update" on storage.objects;
drop policy if exists "training fit own folder delete" on storage.objects;

create policy "training fit own folder insert" on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'training-fit'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "training fit own folder select" on storage.objects for select
  to authenticated
  using (
    bucket_id = 'training-fit'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "training fit own folder update" on storage.objects for update
  to authenticated
  using (
    bucket_id = 'training-fit'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'training-fit'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "training fit own folder delete" on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'training-fit'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
