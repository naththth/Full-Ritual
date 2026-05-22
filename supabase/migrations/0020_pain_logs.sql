-- Log de dor e lesões
create table pain_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  date        date not null default current_date,
  region      text not null,      -- ex: 'joelho esquerdo', 'lombar', 'ombro direito'
  intensity   int check (intensity between 0 and 10),
  pain_type   text,               -- 'aguda' | 'crônica' | 'pós-treino' | 'inflamação' | 'tensão'
  context     text,               -- ex: 'após treino de corrida'
  notes       text,
  resolved    boolean default false,
  resolved_at date,
  created_at  timestamptz default now()
);

create index pain_user_date on pain_logs(user_id, date desc);
alter table pain_logs enable row level security;
create policy "own" on pain_logs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
