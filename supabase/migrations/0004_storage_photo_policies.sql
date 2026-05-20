-- Fix: allow authenticated users to upload their own meal, skin and product photos.

insert into storage.buckets (id, name, public)
values ('meals', 'meals', true),
       ('skin', 'skin', true),
       ('products', 'products', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "meals own folder" on storage.objects;
drop policy if exists "skin own folder" on storage.objects;
drop policy if exists "products own folder" on storage.objects;
drop policy if exists "ritual photos public read" on storage.objects;

create policy "meals own folder" on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'meals'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "skin own folder" on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'skin'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "products own folder" on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'products'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "ritual photos public read" on storage.objects for select
  to public
  using (bucket_id in ('meals', 'skin', 'products'));
