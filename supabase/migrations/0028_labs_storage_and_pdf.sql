-- Cria bucket labs (PDFs e fotos de laudos, pasta por user_id)
insert into storage.buckets (id, name, public)
values ('labs', 'labs', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "labs own folder insert" on storage.objects;
drop policy if exists "labs own folder delete" on storage.objects;
drop policy if exists "labs public read" on storage.objects;

create policy "labs own folder insert" on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'labs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "labs own folder delete" on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'labs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "labs public read" on storage.objects for select
  to public
  using (bucket_id = 'labs');

-- Distingue foto, PDF e entrada manual na tabela de exames
alter table lab_results
  add column if not exists file_type text not null default 'photo'
    check (file_type in ('photo', 'pdf', 'manual'));
