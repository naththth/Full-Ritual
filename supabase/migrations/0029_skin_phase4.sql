-- =====================================================================
-- FULL RITUAL · Migration 0029 · Fase 4 Pele — IA CARE
-- Tabelas: skin_profiles, skin_products, skin_routines,
--          skin_routine_items, skin_ai_logs
-- =====================================================================

create table if not exists public.skin_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  skin_types text[] default '{}',
  sensitivity text,
  allergies text,
  goals text[] default '{}',
  morning_time text,
  night_time text,
  routine_preference text,
  budget text,
  uses_actives boolean default false,
  uses_prescription boolean default false,
  dermatology_followup text,
  pregnancy_lactation_status text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id)
);

create table if not exists public.skin_products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  brand text,
  category text,
  area text check (area in ('face', 'body', 'aromas')),
  current_frequency text,
  causes_irritation boolean default false,
  is_prescription boolean default false,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.skin_routines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  routine_json jsonb not null default '{}',
  risk_level text,
  generated_by text default 'ia_care',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.skin_routine_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  routine_id uuid references public.skin_routines(id) on delete cascade,
  product_id uuid references public.skin_products(id) on delete set null,
  product_name text not null,
  brand text,
  category text,
  area text check (area in ('face', 'body', 'aromas')),
  period text check (period in ('day', 'night')),
  order_index integer not null,
  frequency text,
  instructions text,
  safety_note text,
  is_prescription boolean default false,
  is_checked boolean default false,
  checked_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.skin_ai_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  input_snapshot jsonb,
  output_snapshot jsonb,
  safety_warnings jsonb,
  created_at timestamptz default now()
);

-- RLS
alter table public.skin_profiles enable row level security;
alter table public.skin_products enable row level security;
alter table public.skin_routines enable row level security;
alter table public.skin_routine_items enable row level security;
alter table public.skin_ai_logs enable row level security;

-- skin_profiles policies
create policy "skin_profiles_select" on public.skin_profiles
  for select using (auth.uid() = user_id);
create policy "skin_profiles_insert" on public.skin_profiles
  for insert with check (auth.uid() = user_id);
create policy "skin_profiles_update" on public.skin_profiles
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "skin_profiles_delete" on public.skin_profiles
  for delete using (auth.uid() = user_id);

-- skin_products policies
create policy "skin_products_select" on public.skin_products
  for select using (auth.uid() = user_id);
create policy "skin_products_insert" on public.skin_products
  for insert with check (auth.uid() = user_id);
create policy "skin_products_update" on public.skin_products
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "skin_products_delete" on public.skin_products
  for delete using (auth.uid() = user_id);

-- skin_routines policies
create policy "skin_routines_select" on public.skin_routines
  for select using (auth.uid() = user_id);
create policy "skin_routines_insert" on public.skin_routines
  for insert with check (auth.uid() = user_id);
create policy "skin_routines_update" on public.skin_routines
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "skin_routines_delete" on public.skin_routines
  for delete using (auth.uid() = user_id);

-- skin_routine_items policies
create policy "skin_routine_items_select" on public.skin_routine_items
  for select using (auth.uid() = user_id);
create policy "skin_routine_items_insert" on public.skin_routine_items
  for insert with check (auth.uid() = user_id);
create policy "skin_routine_items_update" on public.skin_routine_items
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "skin_routine_items_delete" on public.skin_routine_items
  for delete using (auth.uid() = user_id);

-- skin_ai_logs policies
create policy "skin_ai_logs_select" on public.skin_ai_logs
  for select using (auth.uid() = user_id);
create policy "skin_ai_logs_insert" on public.skin_ai_logs
  for insert with check (auth.uid() = user_id);
