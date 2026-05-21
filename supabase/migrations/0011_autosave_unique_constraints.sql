-- =====================================================================
-- FULL RITUAL · uniques para autosave (upsert por (user_id, date[, tipo]))
-- Antes de criar, deduplica mantendo o registro mais recente.
-- =====================================================================

-- checkins · um por dia por usuário ------------------------------------
delete from checkins a
using checkins b
where a.user_id = b.user_id
  and a.date = b.date
  and a.created_at < b.created_at;

alter table checkins
  add constraint checkins_user_date_unique unique (user_id, date);

-- spirit_logs · um por dia por usuário ---------------------------------
delete from spirit_logs a
using spirit_logs b
where a.user_id = b.user_id
  and a.date = b.date
  and a.ctid < b.ctid;

alter table spirit_logs
  add constraint spirit_logs_user_date_unique unique (user_id, date);

-- meal_logs · um por (dia, refeição) -----------------------------------
delete from meal_logs a
using meal_logs b
where a.user_id = b.user_id
  and a.date = b.date
  and a.meal_type = b.meal_type
  and a.logged_at < b.logged_at;

alter table meal_logs
  add constraint meal_logs_user_date_meal_unique unique (user_id, date, meal_type);

-- skincare_logs · um por (dia, manha/noite) ----------------------------
delete from skincare_logs a
using skincare_logs b
where a.user_id = b.user_id
  and a.date = b.date
  and a.time_of_day = b.time_of_day
  and a.ctid < b.ctid;

alter table skincare_logs
  add constraint skincare_logs_user_date_time_unique unique (user_id, date, time_of_day);

-- mind_logs · um por (dia, prática) ------------------------------------
delete from mind_logs a
using mind_logs b
where a.user_id = b.user_id
  and a.date = b.date
  and a.type = b.type
  and a.ctid < b.ctid;

alter table mind_logs
  add constraint mind_logs_user_date_type_unique unique (user_id, date, type);
