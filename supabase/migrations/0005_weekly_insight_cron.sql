-- Feature: weekly insights generated every Sunday.
-- Requires the Supabase pg_cron extension enabled for the project.

create extension if not exists pg_cron;

create unique index if not exists insights_user_weekly_date
  on public.insights(user_id, date, type)
  where type = 'weekly';

create or replace function public.generate_weekly_insights()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.insights (user_id, date, type, title, body, correlations, source)
  select
    p.id,
    current_date,
    'weekly'::insight_type,
    case
      when s.avg_sleep_min < 360
        then 'Sono curto virou eixo da semana'
      when c.avg_skin < 6
        then 'A pele pediu barreira'
      when m.meal_logs < 8
        then 'A dieta ficou irregular'
      else 'Constância em construção'
    end,
    case
      when s.avg_sleep_min < 360
        then 'Nos últimos sete dias, o sono médio ficou abaixo de seis horas. Priorize rotina noturna, hidratação e menos ativos fortes na pele.'
      when c.avg_skin < 6
        then 'A pele apareceu mais sensível nos check-ins. Uma semana de barreira, protetor e limpeza suave tende a sustentar melhor o ritual.'
      when m.meal_logs < 8
        then 'Poucas refeições foram registradas. Fotos simples das refeições ajudam a IA a conectar dieta, energia e pele com mais precisão.'
      else 'A semana deixou dados suficientes para ajustar sem rigidez: mantenha sono, água e check-ins como base do próximo ciclo.'
    end,
    jsonb_build_object(
      'avg_sleep_min', s.avg_sleep_min,
      'avg_energy', c.avg_energy,
      'avg_skin', c.avg_skin,
      'meal_logs', m.meal_logs
    ),
    'rule'
  from public.profiles p
  cross join lateral (
    select avg(duration_min) as avg_sleep_min
    from public.sleep_logs
    where user_id = p.id and date >= current_date - 7
  ) s
  cross join lateral (
    select avg(energy) as avg_energy, avg(skin_state) as avg_skin
    from public.checkins
    where user_id = p.id and date >= current_date - 7
  ) c
  cross join lateral (
    select count(*) as meal_logs
    from public.meal_logs
    where user_id = p.id and date >= current_date - 7
  ) m
  on conflict do nothing;
end;
$$;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'weekly-insight') then
    perform cron.unschedule('weekly-insight');
  end if;
end $$;

select cron.schedule(
  'weekly-insight',
  '0 9 * * 0',
  $$select public.generate_weekly_insights();$$
);
