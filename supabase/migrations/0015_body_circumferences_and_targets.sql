-- =====================================================================
-- FULL RITUAL · Circunferências + faixa de meta + prazo + histórico de objetivos
-- =====================================================================

-- circunferências (todas opcionais)
alter table body_metrics
  add column if not exists waist_cm numeric,
  add column if not exists hip_cm numeric,
  add column if not exists chest_cm numeric,
  add column if not exists arm_cm numeric,
  add column if not exists thigh_cm numeric,
  add column if not exists neck_cm numeric;

-- objetivo: faixa + prazo
alter table profiles
  add column if not exists target_weight_kg_max numeric,
  add column if not exists target_date date;

-- histórico de objetivos (cada vez que muda, insere uma linha)
create table if not exists body_targets_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  target_weight_kg numeric,
  target_weight_kg_max numeric,
  target_body_fat_pct numeric,
  target_date date,
  set_at timestamptz default now()
);
create index if not exists body_targets_history_user_set
  on body_targets_history(user_id, set_at desc);

alter table body_targets_history enable row level security;
create policy "own row select" on body_targets_history for select using (auth.uid() = user_id);
create policy "own row insert" on body_targets_history for insert with check (auth.uid() = user_id);
create policy "own row delete" on body_targets_history for delete using (auth.uid() = user_id);
