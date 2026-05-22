-- Suplementos e medicamentos
create table supplements (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  category    text not null default 'suplemento', -- 'suplemento' | 'medicamento' | 'fitoterápico' | 'vitamina'
  dose        text,          -- ex: "500mg", "1 cápsula"
  times       text[],        -- ex: ['manhã', 'noite']
  frequency   text not null default 'diaria',    -- 'diaria' | 'alternada' | 'semanal'
  with_food   boolean default true,
  notes       text,
  active      boolean default true,
  created_at  timestamptz default now()
);

create table supplement_logs (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  supplement_id  uuid not null references supplements(id) on delete cascade,
  date           date not null default current_date,
  taken          boolean not null default false,
  taken_at       timestamptz,
  unique(user_id, supplement_id, date)
);

create index suppl_user on supplements(user_id);
create index suppl_log_user_date on supplement_logs(user_id, date desc);

alter table supplements enable row level security;
alter table supplement_logs enable row level security;
create policy "own" on supplements for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own" on supplement_logs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
