-- Preserve existing stats and job snapshots while supporting fractional improvements.
begin;
alter table public.characters
  alter column ship_attack type numeric using ship_attack::numeric,
  alter column ship_defense type numeric using ship_defense::numeric,
  alter column ship_speed type numeric using ship_speed::numeric,
  alter column ship_accuracy type numeric using ship_accuracy::numeric;
alter table private.ship_upgrade_jobs
  alter column size_id drop not null,
  alter column stat_gain type numeric using stat_gain::numeric,
  drop constraint ship_upgrade_jobs_stat_gain_check,
  add constraint ship_upgrade_jobs_stat_gain_check check(stat_gain>0 and stat_gain<=9007199254740991);
-- Historical size labels/catalog remain available to administration.
drop function public.start_ship_upgrade(text,text,text,uuid);
commit;
