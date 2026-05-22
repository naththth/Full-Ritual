-- =====================================================================
-- FULL RITUAL · Medidas corporais (peso, altura, %gordura) + análise IA
-- Foto não é persistida: vai pra IA, salvamos só a análise textual.
-- Sem data fixa de pesagem — usuário registra quando quiser.
-- =====================================================================

create table if not exists body_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null default current_date,
  weight_kg numeric,                 -- peso em kg
  height_cm numeric,                 -- altura em cm (snapshot — geralmente constante)
  body_fat_pct numeric,              -- opcional · % gordura corporal
  ai_analysis jsonb,                 -- { fat_distribution[], trend, observations[], suggestions_training[], suggestions_diet[] }
  note text,
  created_at timestamptz default now()
);

create index if not exists body_metrics_user_date
  on body_metrics(user_id, date desc, created_at desc);

alter table body_metrics enable row level security;
create policy "own row select" on body_metrics for select using (auth.uid() = user_id);
create policy "own row insert" on body_metrics for insert with check (auth.uid() = user_id);
create policy "own row update" on body_metrics for update using (auth.uid() = user_id);
create policy "own row delete" on body_metrics for delete using (auth.uid() = user_id);
