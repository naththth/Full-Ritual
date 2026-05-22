-- FULL RITUAL · remove suposição personalizada de LPO aos sábados 9h

alter table training_profile
  alter column lpo_saturday_9am set default false;
