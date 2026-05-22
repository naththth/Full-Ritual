-- Full Ritual · plano alimentar pessoal por usuario.

create table if not exists public.diet_plans (
  user_id uuid primary key references auth.users(id) on delete cascade,
  manual_foods jsonb not null default '[]'::jsonb,
  pdf_url text,
  pdf_name text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists diet_plans_updated on public.diet_plans;
create trigger diet_plans_updated before update on public.diet_plans
  for each row execute function public.set_updated_at();

alter table public.diet_plans enable row level security;

drop policy if exists "own diet plans select" on public.diet_plans;
drop policy if exists "own diet plans insert" on public.diet_plans;
drop policy if exists "own diet plans update" on public.diet_plans;
drop policy if exists "own diet plans delete" on public.diet_plans;

create policy "own diet plans select" on public.diet_plans
  for select using (auth.uid() = user_id);
create policy "own diet plans insert" on public.diet_plans
  for insert with check (auth.uid() = user_id);
create policy "own diet plans update" on public.diet_plans
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own diet plans delete" on public.diet_plans
  for delete using (auth.uid() = user_id);

insert into storage.buckets (id, name, public)
values ('diet', 'diet', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "diet own folder" on storage.objects;
create policy "diet own folder" on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'diet'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "diet files public read" on storage.objects;
create policy "diet files public read" on storage.objects for select
  to public
  using (bucket_id = 'diet');
