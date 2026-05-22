-- Full Ritual · configuração do IA Nutri na dimensão Dieta.

alter table public.diet_plans
  add column if not exists setup_mode text
    check (setup_mode in ('existing_plan', 'needs_ai_nutri')),
  add column if not exists nutri_profile jsonb not null default '{}'::jsonb,
  add column if not exists nutri_configured boolean not null default false;
