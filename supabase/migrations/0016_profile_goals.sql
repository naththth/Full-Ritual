-- Metas de saúde no perfil (sono, água, meditação, leitura)
alter table profiles
  add column if not exists goal_sleep_h       numeric(4,1) default 8,
  add column if not exists goal_water_l       numeric(4,1) default 2.5,
  add column if not exists goal_meditation_min int         default 10,
  add column if not exists goal_reading_pages  int         default 20;
