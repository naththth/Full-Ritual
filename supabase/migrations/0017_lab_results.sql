-- Resultados de exames laboratoriais
create table lab_results (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  date        date not null,
  lab_name    text,
  photo_url   text,
  markers     jsonb not null default '{}',
  -- markers: { "ferritina": { value: 45, unit: "ng/mL", ref_min: 20, ref_max: 200, status: "normal" } }
  notes       text,
  created_at  timestamptz default now()
);

create index lab_results_user_date on lab_results(user_id, date desc);

alter table lab_results enable row level security;
create policy "own row" on lab_results for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
