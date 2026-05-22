-- FULL RITUAL · contexto de treino para calibração do IA Coach

alter table training_profile
  add column if not exists training_level text check (training_level in ('beginner', 'intermediate', 'advanced')),
  add column if not exists recent_training_summary text,
  add column if not exists weekly_training_hours numeric,
  add column if not exists priority_modality text,
  add column if not exists recovery_status text check (recovery_status in ('good', 'ok', 'poor')),
  add column if not exists target_event_name text,
  add column if not exists target_event_date date,
  add column if not exists target_event_modality text,
  add column if not exists strength_reference_loads text,
  add column if not exists technical_metrics text;
