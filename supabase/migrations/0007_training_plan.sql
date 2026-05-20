-- =====================================================================
-- FULL RITUAL · TREINO (Body dimension)
-- Onboarding de treino, plano semanal e workouts importados do Garmin.
-- =====================================================================

create type training_modality   as enum ('corrida','pedal','musculacao','lpo');
create type pedal_type          as enum ('roadbike','mtb','indoor');
create type strength_location   as enum ('gym','home','outdoor');
create type strength_split      as enum ('fullbody','upper_lower','ppl','bro_split','other');
create type training_goal       as enum ('fat_loss','muscle_gain','performance','maintenance','event');
create type consistency_band    as enum ('under_6m','6m_1y','1y_3y','over_3y');
create type preferred_time      as enum ('morning','afternoon','evening','flexible');
create type run_location        as enum ('street','treadmill','both');
create type lpo_movements       as enum ('basics','full_oly');
create type plan_source         as enum ('onboarding','feedback','manual');

-- =====================================================================
-- TRAINING PROFILE (1 por usuário)
-- =====================================================================
create table training_profile (
  user_id uuid primary key references auth.users(id) on delete cascade,

  -- Bloco geral
  modalities training_modality[] default '{}',
  available_days text[] default '{}',          -- ['mon','tue',...]
  preferred_time preferred_time default 'flexible',
  session_minutes int default 60,
  main_goal training_goal default 'maintenance',
  consistency_band consistency_band,
  limitations text,

  -- Corrida
  corrida_pace_min_per_km text,
  corrida_max_distance_km numeric,
  corrida_has_race boolean default false,
  corrida_race_info text,
  corrida_location run_location,

  -- Pedal
  pedal_type pedal_type,
  pedal_weekly_km numeric,
  pedal_has_event boolean default false,
  pedal_event_info text,

  -- Musculação
  strength_location strength_location,
  strength_equipment text,
  strength_split strength_split,

  -- LPO
  lpo_saturday_9am boolean default true,
  lpo_has_coach boolean default false,
  lpo_movements lpo_movements,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create trigger training_profile_updated before update on training_profile
  for each row execute function set_updated_at();

-- =====================================================================
-- TRAINING PLANS (semanal, JSON)
-- plan_json: [{ day_index, date, modality, title, details, duration_min, intensity, notes }]
-- =====================================================================
create table training_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start_date date not null,
  plan_json jsonb not null,
  generated_at timestamptz default now(),
  generated_from plan_source not null,
  is_active boolean default true
);
create index training_plans_user_active on training_plans(user_id, week_start_date desc) where is_active;

-- =====================================================================
-- GARMIN WORKOUTS (uploads .fit + parsed + ai feedback)
-- =====================================================================
create table garmin_workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  modality training_modality not null,
  file_url text,
  parsed_data jsonb,                 -- {distance_km, duration_min, avg_hr, max_hr, calories, ...}
  ai_feedback text,
  created_at timestamptz default now()
);
create index garmin_workouts_user_date on garmin_workouts(user_id, date desc);

-- =====================================================================
-- RLS
-- =====================================================================
alter table training_profile enable row level security;
alter table training_plans   enable row level security;
alter table garmin_workouts  enable row level security;

create policy "own row select" on training_profile for select using (auth.uid() = user_id);
create policy "own row insert" on training_profile for insert with check (auth.uid() = user_id);
create policy "own row update" on training_profile for update using (auth.uid() = user_id);
create policy "own row delete" on training_profile for delete using (auth.uid() = user_id);

do $$
declare
  t text;
begin
  for t in select unnest(array['training_plans','garmin_workouts'])
  loop
    execute format('create policy "own row select" on %I for select using (auth.uid() = user_id);', t);
    execute format('create policy "own row insert" on %I for insert with check (auth.uid() = user_id);', t);
    execute format('create policy "own row update" on %I for update using (auth.uid() = user_id);', t);
    execute format('create policy "own row delete" on %I for delete using (auth.uid() = user_id);', t);
  end loop;
end $$;
