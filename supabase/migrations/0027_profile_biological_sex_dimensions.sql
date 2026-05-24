-- Fase 3 do perfil: sexo biológico, controle de onboarding e dimensões selecionadas

alter table public.profiles
  add column if not exists biological_sex text
    check (biological_sex in ('feminino', 'masculino', 'outro')),
  add column if not exists onboarding_completed boolean not null default false,
  add column if not exists onboarding_version text,
  add column if not exists selected_dimensions text[] not null default '{skin,body,mind,diet,spirit}';

-- Backfill: quem já tem onboarding_completed_at também marca o boolean
update public.profiles
  set onboarding_completed = true
  where onboarding_completed_at is not null
    and onboarding_completed = false;
