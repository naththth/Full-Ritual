-- =====================================================================
-- FULL RITUAL · IA COACH (treino) + cargas de musculação + adições da IA na dieta
-- =====================================================================

-- ---------------------------------------------------------------------
-- body_coach_messages · histórico de conversa com a IA-treinadora
-- ---------------------------------------------------------------------
create table if not exists body_coach_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user','assistant','system')),
  content text not null,
  metadata jsonb,
  created_at timestamptz default now()
);
create index if not exists body_coach_messages_user_created
  on body_coach_messages(user_id, created_at);

alter table body_coach_messages enable row level security;
create policy "own row select" on body_coach_messages for select using (auth.uid() = user_id);
create policy "own row insert" on body_coach_messages for insert with check (auth.uid() = user_id);
create policy "own row delete" on body_coach_messages for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- workout_loads · carga (kg) registrada em exercícios de musculação
-- chave única: usuário + data + exercício (case-insensitive)
-- ---------------------------------------------------------------------
create table if not exists workout_loads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  exercise_key text not null,        -- slug normalizado (lowercase, sem acento)
  exercise_name text not null,       -- nome exibido
  load_kg numeric not null,          -- carga total média da sessão
  sets int,
  reps int,
  rpe numeric,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create unique index if not exists workout_loads_unique
  on workout_loads(user_id, date, exercise_key);
create index if not exists workout_loads_user_exercise
  on workout_loads(user_id, exercise_key, date desc);

create trigger workout_loads_updated before update on workout_loads
  for each row execute function set_updated_at();

alter table workout_loads enable row level security;
create policy "own row select" on workout_loads for select using (auth.uid() = user_id);
create policy "own row insert" on workout_loads for insert with check (auth.uid() = user_id);
create policy "own row update" on workout_loads for update using (auth.uid() = user_id);
create policy "own row delete" on workout_loads for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- diet_ai_additions · itens adicionados pela IA na dieta (renderizados em roxo)
-- source: 'body_coach' | 'evaluate' | 'plan'
-- ---------------------------------------------------------------------
create table if not exists diet_ai_additions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  meal_type text,             -- manha | almoco | lanche | jantar | ceia | null (geral)
  title text not null,
  note text,
  source text not null default 'body_coach',
  rationale text,
  dismissed boolean default false,
  created_at timestamptz default now()
);
create index if not exists diet_ai_additions_user_date
  on diet_ai_additions(user_id, date desc);

alter table diet_ai_additions enable row level security;
create policy "own row select" on diet_ai_additions for select using (auth.uid() = user_id);
create policy "own row insert" on diet_ai_additions for insert with check (auth.uid() = user_id);
create policy "own row update" on diet_ai_additions for update using (auth.uid() = user_id);
create policy "own row delete" on diet_ai_additions for delete using (auth.uid() = user_id);
