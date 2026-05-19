-- =====================================================================
-- FULL RITUAL · SCHEMA INICIAL
-- Postgres 15 (Supabase). Todas as tabelas com Row Level Security.
-- O modelo é dimensional: uma tabela por eixo de cuidado.
-- =====================================================================

-- ENUMs --------------------------------------------------------------------
create type dimension_key   as enum ('skin','body','mind','diet','spirit');
create type skin_type       as enum ('oleosa','mista','seca','sensivel','normal');
create type sport_modality  as enum ('natacao','ciclismo','corrida','forca','yoga','pilates','mobilidade','caminhada');
create type music_pref      as enum ('focus','ambient','classical','brazilian','electronic','jazz','silence');
create type content_pref    as enum ('longevidade','neurociencia','filosofia','performance','literatura','ciencia','negocios','arte');
create type spirit_theme    as enum ('gratidao','proposito','ancestralidade','presenca','silencio','natureza','criatividade');
create type product_category as enum ('limpeza','tonico','serum','hidratante','protetor_solar','tratamento','esfoliante','mascara','olhos','corpo');
create type product_step     as enum ('manha','noite','ambos');
create type product_frequency as enum ('diaria','alternada','semanal','quinzenal');
create type meal_type        as enum ('manha','almoco','lanche','jantar','ceia');
create type cycle_phase      as enum ('menstrual','folicular','ovulatoria','lutea');
create type insight_type     as enum ('daily','weekly','correlation','suggestion');

-- =====================================================================
-- PROFILES
-- =====================================================================
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  photo_url text,
  birthdate date,
  skin_type skin_type,

  cycle_tracking boolean default false,
  cycle_start date,
  cycle_length int default 28,

  sport_modalities sport_modality[] default '{}',
  music_prefs music_pref[] default '{}',
  content_prefs content_pref[] default '{}',
  spirit_themes spirit_theme[] default '{}',

  ai_enabled boolean default true,
  notifications_enabled boolean default true,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create or replace function set_updated_at() returns trigger as $$
begin new.updated_at := now(); return new; end; $$ language plpgsql;

create trigger profiles_updated before update on profiles
  for each row execute function set_updated_at();

-- =====================================================================
-- PRODUTOS COSMÉTICOS
-- =====================================================================
create table products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  brand text,
  category product_category not null,
  step product_step not null default 'ambos',
  frequency product_frequency not null default 'diaria',
  order_in_routine int default 0,
  notes text,
  photo_url text,
  active boolean default true,
  created_at timestamptz default now()
);
create index products_user_active on products(user_id) where active;

-- =====================================================================
-- LOGS DIMENSIONAIS
-- =====================================================================

create table checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null default current_date,
  energy int check (energy between 0 and 10),
  calm int check (calm between 0 and 10),
  skin_state int check (skin_state between 0 and 10),
  body_state int check (body_state between 0 and 10),
  signals text[] default '{}',
  note text,
  created_at timestamptz default now()
);
create index checkins_user_date on checkins(user_id, date desc);

create table sleep_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  bedtime timestamptz,
  wake_time timestamptz,
  duration_min int,
  quality int check (quality between 0 and 10),
  notes text,
  unique(user_id, date)
);

create table water_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null default current_date,
  amount_ml int not null,
  logged_at timestamptz default now()
);
create index water_user_date on water_logs(user_id, date);

create table meal_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null default current_date,
  meal_type meal_type not null,
  photo_url text,
  ingredients text[] default '{}',
  mood_after int check (mood_after between 0 and 10),
  notes text,
  logged_at timestamptz default now()
);

create table workout_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null default current_date,
  modality sport_modality not null,
  duration_min int not null,
  intensity int check (intensity between 0 and 10),
  type text,
  notes text
);

create table skincare_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null default current_date,
  time_of_day text check (time_of_day in ('manha','noite')) not null,
  products_used uuid[] default '{}',
  skin_signal text,
  photo_url text
);

create table mind_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null default current_date,
  type text check (type in ('leitura','foco','som','meditacao','pausa')) not null,
  duration_min int,
  content_ref text,
  notes text
);

create table spirit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null default current_date,
  intention text,
  gratitude text[] default '{}',
  mood int check (mood between 0 and 10),
  theme spirit_theme,
  notes text
);

create table cycle_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  phase cycle_phase,
  flow int check (flow between 0 and 4),
  mood int check (mood between 0 and 10),
  symptoms text[] default '{}',
  unique(user_id, date)
);

-- =====================================================================
-- INSIGHTS DA IA
-- =====================================================================
create table insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null default current_date,
  type insight_type not null,
  title text not null,
  body text not null,
  correlations jsonb,
  source text default 'gemini',
  created_at timestamptz default now()
);
create index insights_user_date on insights(user_id, date desc);

-- =====================================================================
-- CONVERSAS COM A IA
-- =====================================================================
create table ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  messages jsonb not null default '[]',
  context_summary text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create trigger ai_conv_updated before update on ai_conversations
  for each row execute function set_updated_at();

-- =====================================================================
-- VIEW · DAILY SCORES
-- Calcula score 0-100 por dimensão por dia a partir dos logs.
-- =====================================================================
create or replace view daily_scores as
select
  u.id as user_id,
  d::date as date,
  -- pele: média de skin_state do checkin + se fez skincare manhã e noite
  coalesce((
    select avg(c.skin_state) * 10
    from checkins c
    where c.user_id = u.id and c.date = d::date
  ), 0)::int as score_skin,
  coalesce((
    select avg(c.body_state) * 10
    from checkins c
    where c.user_id = u.id and c.date = d::date
  ), 0)::int as score_body,
  coalesce((
    select avg(c.calm) * 10
    from checkins c
    where c.user_id = u.id and c.date = d::date
  ), 0)::int as score_mind,
  -- dieta: count de refeições registradas, normalizado
  least((
    select count(*) * 25
    from meal_logs m
    where m.user_id = u.id and m.date = d::date
  ), 100)::int as score_diet,
  -- espírito: 100 se houve registro, 0 senão
  coalesce((
    select 100 from spirit_logs s
    where s.user_id = u.id and s.date = d::date
    limit 1
  ), 0)::int as score_spirit
from auth.users u
cross join generate_series(current_date - 60, current_date, '1 day'::interval) d;

-- =====================================================================
-- ROW LEVEL SECURITY · cada usuário só vê o que é dele
-- =====================================================================
alter table profiles       enable row level security;
alter table products       enable row level security;
alter table checkins       enable row level security;
alter table sleep_logs     enable row level security;
alter table water_logs     enable row level security;
alter table meal_logs      enable row level security;
alter table workout_logs   enable row level security;
alter table skincare_logs  enable row level security;
alter table mind_logs      enable row level security;
alter table spirit_logs    enable row level security;
alter table cycle_logs     enable row level security;
alter table insights       enable row level security;
alter table ai_conversations enable row level security;

-- Política única que se aplica a quase todas as tabelas: only owner.
do $$
declare
  t text;
begin
  for t in select unnest(array[
    'profiles','products','checkins','sleep_logs','water_logs','meal_logs',
    'workout_logs','skincare_logs','mind_logs','spirit_logs','cycle_logs',
    'insights','ai_conversations'
  ])
  loop
    -- profiles usa "id" como referência ao auth.uid; as demais usam "user_id"
    if t = 'profiles' then
      execute format('create policy "own row select" on %I for select using (auth.uid() = id);', t);
      execute format('create policy "own row insert" on %I for insert with check (auth.uid() = id);', t);
      execute format('create policy "own row update" on %I for update using (auth.uid() = id);', t);
      execute format('create policy "own row delete" on %I for delete using (auth.uid() = id);', t);
    else
      execute format('create policy "own row select" on %I for select using (auth.uid() = user_id);', t);
      execute format('create policy "own row insert" on %I for insert with check (auth.uid() = user_id);', t);
      execute format('create policy "own row update" on %I for update using (auth.uid() = user_id);', t);
      execute format('create policy "own row delete" on %I for delete using (auth.uid() = user_id);', t);
    end if;
  end loop;
end $$;

-- =====================================================================
-- STORAGE BUCKETS (rodar no SQL ou via Dashboard)
-- =====================================================================
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true),
       ('meals',   'meals',   false),
       ('skin',    'skin',    false),
       ('products','products', false)
on conflict (id) do nothing;

-- Política: cada user só sobe na pasta {auth.uid()}/ do bucket
create policy "avatars own folder" on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "avatars public read" on storage.objects for select
  to public using (bucket_id = 'avatars');

-- =====================================================================
-- TRIGGER · cria profile automaticamente ao criar usuário
-- =====================================================================
create or replace function handle_new_user() returns trigger as $$
begin
  insert into profiles (id, name) values (new.id, coalesce(new.raw_user_meta_data->>'name', 'você'));
  return new;
end; $$ language plpgsql security definer;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();
