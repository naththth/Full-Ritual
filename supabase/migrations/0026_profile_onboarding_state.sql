-- Fase 2: onboarding canônico via Supabase.
-- Adiciona coluna que marca quando o onboarding foi concluído.

alter table public.profiles
  add column if not exists onboarding_completed_at timestamptz;

-- Backfill: usuários que já têm skin_type ou sport_modalities preenchidos
-- são considerados com onboarding completo.
update public.profiles
  set onboarding_completed_at = coalesce(updated_at, created_at, now())
  where onboarding_completed_at is null
    and (skin_type is not null or (sport_modalities is not null and array_length(sport_modalities, 1) > 0));
