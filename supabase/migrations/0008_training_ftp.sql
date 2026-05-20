-- Adiciona FTP ao perfil de treino de pedal
alter table training_profile add column if not exists pedal_ftp_watts int;
