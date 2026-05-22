-- =====================================================================
-- FULL RITUAL · Metas corporais (peso e %gordura objetivo)
-- =====================================================================

alter table profiles
  add column if not exists target_weight_kg numeric,
  add column if not exists target_body_fat_pct numeric;
