create table private.sea_scouts(
  character_id uuid not null references public.characters(id) on delete cascade,
  request_id uuid not null,
  visit_id uuid not null,
  expected_version uuid not null,
  sea_distance integer not null check(sea_distance>0),
  created_at timestamptz not null default clock_timestamp(),
  result jsonb not null default '{}'::jsonb,
  primary key(character_id,request_id)
);
create index sea_scouts_latest on private.sea_scouts(character_id,visit_id,created_at desc,request_id desc);
create table private.sea_scout_targets(
  character_id uuid not null,
  request_id uuid not null,
  target_id uuid not null references public.characters(id) on delete cascade,
  target_visit_id uuid not null,
  display_name text not null,
  position integer not null check(position>=0),
  primary key(character_id,request_id,target_id),
  foreign key(character_id,request_id) references private.sea_scouts(character_id,request_id) on delete cascade,
  unique(character_id,request_id,position)
);
create index sea_scout_targets_character on private.sea_scout_targets(target_id);
alter table private.sea_scouts enable row level security;
alter table private.sea_scout_targets enable row level security;
revoke all on private.sea_scouts,private.sea_scout_targets from public,anon,authenticated;

create index characters_scout_stops on public.characters(sea_step,id)
  where location='open_sea' and hospital_until is null;
create index characters_scout_arrivals on public.characters(travel_target_step,travel_arrives_at,id)
  where location='traveling' and travel_kind in ('depart','onward') and hospital_until is null;
