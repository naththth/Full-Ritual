-- Fix: remove auth.users reference and use security_invoker
-- Resolves "Exposed Auth Users" and "Security Definer View" warnings.

drop view if exists daily_scores;

create or replace view daily_scores
with (security_invoker = true)
as
select
  auth.uid() as user_id,
  d::date as date,
  coalesce((
    select avg(c.skin_state) * 10
    from checkins c
    where c.user_id = auth.uid() and c.date = d::date
  ), 0)::int as score_skin,
  coalesce((
    select avg(c.body_state) * 10
    from checkins c
    where c.user_id = auth.uid() and c.date = d::date
  ), 0)::int as score_body,
  coalesce((
    select avg(c.calm) * 10
    from checkins c
    where c.user_id = auth.uid() and c.date = d::date
  ), 0)::int as score_mind,
  least((
    select count(*) * 25
    from meal_logs m
    where m.user_id = auth.uid() and m.date = d::date
  ), 100)::int as score_diet,
  coalesce((
    select 100 from spirit_logs s
    where s.user_id = auth.uid() and s.date = d::date
    limit 1
  ), 0)::int as score_spirit
from generate_series(current_date - 60, current_date, '1 day'::interval) d;
