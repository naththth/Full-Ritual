-- Integração Garmin Connect e trilha de sincronização.
-- O app apenas consome a tabela `vitals`; conexão, OAuth/webhooks e backfill ficam no backend.

alter table vitals
  alter column source set default 'manual';

create table if not exists wearable_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('garmin_connect')),
  status text not null default 'pending' check (status in ('pending','connected','needs_config','error','disabled')),
  display_name text,
  last_sync_at timestamptz,
  sync_cursor text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, provider)
);

create index if not exists wearable_connections_user_provider
  on wearable_connections(user_id, provider);

alter table wearable_connections enable row level security;

create policy "own wearable connections"
  on wearable_connections for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists vital_sync_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  status text not null check (status in ('success','needs_config','error')),
  imported_count int default 0,
  message text,
  created_at timestamptz default now()
);

create index if not exists vital_sync_events_user_created
  on vital_sync_events(user_id, created_at desc);

alter table vital_sync_events enable row level security;

create policy "own vital sync events"
  on vital_sync_events for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
