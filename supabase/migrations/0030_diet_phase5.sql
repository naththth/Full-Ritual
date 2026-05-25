-- Full Ritual · Fase 5 — Dimensão Dieta
-- Novas tabelas: diet_profiles, diet_documents, diet_meals, diet_foods,
-- nutrition_ai_logs, water_daily
-- Ajuste em diet_plans: adiciona diet_type

-- ── diet_type em diet_plans ───────────────────────────────────────────────────
alter table public.diet_plans
  add column if not exists diet_type text
    check (diet_type in ('ia_nutri', 'dietbox', 'manual'));

-- ── diet_profiles ─────────────────────────────────────────────────────────────
-- Perfil nutricional estruturado (substitui nutri_profile jsonb)
create table if not exists public.diet_profiles (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  -- objetivo e contexto geral
  goal                    text,
  weight_kg               numeric(5,2),
  height_cm               numeric(5,1),
  age                     int,
  sex                     text check (sex in ('masculino','feminino','outro')),
  activity_level          text check (activity_level in ('sedentario','recreativo','treina_regular','atleta')),
  work_routine            text,
  desired_meals_count     int,
  hunger_level            text check (hunger_level in ('baixa','moderada','alta','variavel')),
  -- treino
  training_routine        text,
  training_frequency      text,
  training_schedule       text,
  training_duration_min   int,
  training_intensity      text check (training_intensity in ('leve','moderada','intensa','variavel')),
  fasted_training         boolean default false,
  sports_goal             text,
  -- alimentação atual
  liked_foods             text,
  avoided_foods           text,
  current_water_ml        int,
  supplements             text,
  -- restrições e segurança
  dietary_restrictions    text,
  intolerances            text,
  allergies               text,
  digestive_symptoms      text,
  injuries                text,
  medications             text,
  relevant_exams          text,
  pregnancy_context       text,
  -- orientação profissional existente
  professional_calories   int,
  professional_protein_g  int,
  professional_carbs_g    int,
  professional_fat_g      int,
  professional_notes      text,
  -- extras
  diet_history            text,
  appetite_and_energy     text,
  budget                  text check (budget in ('baixo','medio','alto','flexivel')),
  cooking_skill           text check (cooking_skill in ('nao_cozinha','basico','intermediario','avancado')),
  objective_details       text,
  available_meal_times    text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (user_id)
);

drop trigger if exists diet_profiles_updated on public.diet_profiles;
create trigger diet_profiles_updated before update on public.diet_profiles
  for each row execute function public.set_updated_at();

alter table public.diet_profiles enable row level security;
drop policy if exists "own diet_profiles select" on public.diet_profiles;
drop policy if exists "own diet_profiles insert" on public.diet_profiles;
drop policy if exists "own diet_profiles update" on public.diet_profiles;
drop policy if exists "own diet_profiles delete" on public.diet_profiles;
create policy "own diet_profiles select" on public.diet_profiles for select using (auth.uid() = user_id);
create policy "own diet_profiles insert" on public.diet_profiles for insert with check (auth.uid() = user_id);
create policy "own diet_profiles update" on public.diet_profiles for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own diet_profiles delete" on public.diet_profiles for delete using (auth.uid() = user_id);

-- ── diet_documents ────────────────────────────────────────────────────────────
-- Metadados de PDFs enviados (DietBox ou outros)
create table if not exists public.diet_documents (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  file_name   text not null,
  file_path   text not null,
  file_size   bigint,
  mime_type   text not null default 'application/pdf',
  source      text not null default 'dietbox_pdf'
              check (source in ('dietbox_pdf','manual_pdf','other')),
  status      text not null default 'active'
              check (status in ('active','archived','deleted')),
  notes       text,
  uploaded_at timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists diet_documents_updated on public.diet_documents;
create trigger diet_documents_updated before update on public.diet_documents
  for each row execute function public.set_updated_at();

create index if not exists diet_documents_user_status
  on public.diet_documents(user_id, status, uploaded_at desc);

alter table public.diet_documents enable row level security;
drop policy if exists "own diet_documents select" on public.diet_documents;
drop policy if exists "own diet_documents insert" on public.diet_documents;
drop policy if exists "own diet_documents update" on public.diet_documents;
drop policy if exists "own diet_documents delete" on public.diet_documents;
create policy "own diet_documents select" on public.diet_documents for select using (auth.uid() = user_id);
create policy "own diet_documents insert" on public.diet_documents for insert with check (auth.uid() = user_id);
create policy "own diet_documents update" on public.diet_documents for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own diet_documents delete" on public.diet_documents for delete using (auth.uid() = user_id);

-- ── diet_plans (ajuste storage) ───────────────────────────────────────────────
-- Storage: atualiza bucket diet para restrito + signed URLs
-- (bucket já existe, só atualiza policies de select)
drop policy if exists "diet files public read" on storage.objects;
create policy "diet files own read" on storage.objects for select
  to authenticated
  using (
    bucket_id = 'diet'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Policy de update e delete para o bucket diet
drop policy if exists "diet files own update" on storage.objects;
create policy "diet files own update" on storage.objects for update
  to authenticated
  using (
    bucket_id = 'diet'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "diet files own delete" on storage.objects;
create policy "diet files own delete" on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'diet'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ── diet_meals ────────────────────────────────────────────────────────────────
-- Refeições da dieta manual
create table if not exists public.diet_meals (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  diet_plan_id    uuid references public.diet_plans(user_id) on delete set null,
  name            text not null,
  meal_time       time,
  position        int not null default 0,
  notes           text,
  total_calories  numeric(8,2) not null default 0,
  total_protein   numeric(6,2) not null default 0,
  total_carbs     numeric(6,2) not null default 0,
  total_fat       numeric(6,2) not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

drop trigger if exists diet_meals_updated on public.diet_meals;
create trigger diet_meals_updated before update on public.diet_meals
  for each row execute function public.set_updated_at();

create index if not exists diet_meals_user_position
  on public.diet_meals(user_id, position);

alter table public.diet_meals enable row level security;
drop policy if exists "own diet_meals select" on public.diet_meals;
drop policy if exists "own diet_meals insert" on public.diet_meals;
drop policy if exists "own diet_meals update" on public.diet_meals;
drop policy if exists "own diet_meals delete" on public.diet_meals;
create policy "own diet_meals select" on public.diet_meals for select using (auth.uid() = user_id);
create policy "own diet_meals insert" on public.diet_meals for insert with check (auth.uid() = user_id);
create policy "own diet_meals update" on public.diet_meals for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own diet_meals delete" on public.diet_meals for delete using (auth.uid() = user_id);

-- ── diet_foods ────────────────────────────────────────────────────────────────
-- Alimentos por refeição
create table if not exists public.diet_foods (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  diet_meal_id    uuid not null references public.diet_meals(id) on delete cascade,
  name            text not null,
  quantity        numeric(8,2) not null default 100,
  unit            text not null default 'g',
  calories        numeric(8,2) not null default 0,
  protein         numeric(6,2) not null default 0,
  carbs           numeric(6,2) not null default 0,
  fat             numeric(6,2) not null default 0,
  notes           text,
  position        int not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

drop trigger if exists diet_foods_updated on public.diet_foods;
create trigger diet_foods_updated before update on public.diet_foods
  for each row execute function public.set_updated_at();

create index if not exists diet_foods_meal
  on public.diet_foods(diet_meal_id, position);

alter table public.diet_foods enable row level security;
drop policy if exists "own diet_foods select" on public.diet_foods;
drop policy if exists "own diet_foods insert" on public.diet_foods;
drop policy if exists "own diet_foods update" on public.diet_foods;
drop policy if exists "own diet_foods delete" on public.diet_foods;
create policy "own diet_foods select" on public.diet_foods for select using (auth.uid() = user_id);
create policy "own diet_foods insert" on public.diet_foods for insert with check (auth.uid() = user_id);
create policy "own diet_foods update" on public.diet_foods for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own diet_foods delete" on public.diet_foods for delete using (auth.uid() = user_id);

-- ── nutrition_ai_logs ─────────────────────────────────────────────────────────
-- Histórico de interações com a IA NUTRI
create table if not exists public.nutrition_ai_logs (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  diet_profile_id   uuid references public.diet_profiles(id) on delete set null,
  prompt_summary    text,
  response          text not null,
  model             text,
  created_at        timestamptz not null default now()
);

create index if not exists nutrition_ai_logs_user_created
  on public.nutrition_ai_logs(user_id, created_at desc);

alter table public.nutrition_ai_logs enable row level security;
drop policy if exists "own nutrition_ai_logs select" on public.nutrition_ai_logs;
drop policy if exists "own nutrition_ai_logs insert" on public.nutrition_ai_logs;
create policy "own nutrition_ai_logs select" on public.nutrition_ai_logs for select using (auth.uid() = user_id);
create policy "own nutrition_ai_logs insert" on public.nutrition_ai_logs for insert with check (auth.uid() = user_id);

-- ── water_daily ───────────────────────────────────────────────────────────────
-- Resumo diário de água (meta + consumido por dia)
create table if not exists public.water_daily (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  log_date     date not null default current_date,
  target_ml    int not null default 2500,
  consumed_ml  int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, log_date)
);

drop trigger if exists water_daily_updated on public.water_daily;
create trigger water_daily_updated before update on public.water_daily
  for each row execute function public.set_updated_at();

create index if not exists water_daily_user_date
  on public.water_daily(user_id, log_date desc);

alter table public.water_daily enable row level security;
drop policy if exists "own water_daily select" on public.water_daily;
drop policy if exists "own water_daily insert" on public.water_daily;
drop policy if exists "own water_daily update" on public.water_daily;
drop policy if exists "own water_daily delete" on public.water_daily;
create policy "own water_daily select" on public.water_daily for select using (auth.uid() = user_id);
create policy "own water_daily insert" on public.water_daily for insert with check (auth.uid() = user_id);
create policy "own water_daily update" on public.water_daily for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own water_daily delete" on public.water_daily for delete using (auth.uid() = user_id);
