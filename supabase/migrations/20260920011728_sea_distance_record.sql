-- Records count arrived distance, including known arrivals before this migration.
alter table public.characters add column max_sea_distance integer not null default 0;
update public.characters set max_sea_distance=greatest(sea_step,
  case when travel_kind in ('depart','onward') and travel_arrives_at<=statement_timestamp()
    then travel_target_step else 0 end);
alter table public.characters add constraint characters_max_sea_distance_check
  check(max_sea_distance>=0 and max_sea_distance>=sea_step);

-- A scheduled record lets public readers resolve an offline arrival without writes.
alter table public.character_profiles
  add column max_sea_distance integer not null default 0 check(max_sea_distance>=0),
  add column arrival_max_sea_distance integer check(arrival_max_sea_distance>0);
update public.character_profiles p set max_sea_distance=c.max_sea_distance,
  arrival_max_sea_distance=case when c.travel_kind in ('depart','onward')
    and c.travel_target_step>c.max_sea_distance then c.travel_target_step end
  from public.characters c where p.character_id=c.id;
