-- Adiciona feedback estruturado da IA a cada workout importado
alter table garmin_workouts
  add column if not exists ai_adjustments jsonb;
