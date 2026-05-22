-- Sinais vitais diários (manual + wearable)
create table vitals (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  date            date not null,
  resting_hr      int,            -- bpm
  hrv_ms          numeric(6,1),   -- HRV em ms (RMSSD)
  steps           int,
  spo2_pct        numeric(4,1),   -- SpO2 %
  weight_kg       numeric(5,1),   -- peso do dia (importado do wearable)
  source          text default 'manual',  -- 'manual' | 'garmin' | 'apple_health'
  raw_data        jsonb,          -- dados brutos do export CSV (opcional)
  unique(user_id, date)
);

create index vitals_user_date on vitals(user_id, date desc);
alter table vitals enable row level security;
create policy "own" on vitals for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
