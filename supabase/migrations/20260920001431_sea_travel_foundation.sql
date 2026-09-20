-- Persistent journeys and server-owned route choices.
alter table public.characters
  drop constraint characters_start_location,
  add column sea_step integer not null default 0 check(sea_step>=0),
  add column sea_version uuid not null default gen_random_uuid(),
  add column sea_visit_id uuid,
  add column sea_place_id text,
  add column sea_place_name text,
  add column energy_paused_at timestamptz,
  add column travel_id uuid,
  add column travel_kind text,
  add column travel_target_step integer,
  add column travel_place_id text,
  add column travel_place_name text,
  add column travel_started_at timestamptz,
  add column travel_arrives_at timestamptz,
  add constraint characters_location_check check(location in ('the_harbor','open_sea','traveling')),
  add constraint characters_sea_state_check check(
    (location='the_harbor' and sea_step=0 and sea_visit_id is null and sea_place_id is null
      and sea_place_name is null and energy_paused_at is null)
    or (location='open_sea' and sea_step>0 and sea_visit_id is not null
      and sea_place_id is not null and sea_place_name is not null and energy_paused_at is not null)
    or (location='traveling' and sea_place_id is null and sea_place_name is null and energy_paused_at is not null)
  ),
  add constraint characters_journey_check check(
    (location<>'traveling' and travel_id is null and travel_kind is null and travel_target_step is null
      and travel_place_id is null and travel_place_name is null and travel_started_at is null and travel_arrives_at is null)
    or (location='traveling' and travel_id is not null and travel_kind is not null and travel_target_step is not null
      and travel_place_id is not null and travel_place_name is not null and travel_started_at is not null
      and travel_arrives_at is not null and isfinite(travel_arrives_at) and travel_arrives_at>travel_started_at
      and ((travel_kind='depart' and sea_step=0 and travel_target_step=1 and sea_visit_id is not null)
        or (travel_kind='onward' and sea_step>0 and travel_target_step::bigint=sea_step::bigint+1 and sea_visit_id is not null)
        or (travel_kind='return' and sea_step>0 and travel_target_step=0 and sea_visit_id is null)))
  ),
  add constraint characters_hospital_location_check check(hospital_until is null or location='the_harbor');

create table private.sea_location_types(
  id text primary key,
  name text not null,
  active boolean not null default true
);
create table private.sea_route_options(
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.characters(id) on delete cascade,
  visit_id uuid not null,
  position smallint not null check(position in (0,1)),
  place_id text not null,
  place_name text not null,
  unique(character_id,visit_id,position),
  unique(character_id,visit_id,place_id)
);
create table private.sea_travel_requests(
  character_id uuid not null references public.characters(id) on delete cascade,
  request_id uuid not null,
  action text not null check(action in ('depart','onward','return')),
  expected_version uuid not null,
  option_id uuid,
  result jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key(character_id,request_id)
);
alter table private.sea_location_types enable row level security;
alter table private.sea_route_options enable row level security;
alter table private.sea_travel_requests enable row level security;
revoke all on private.sea_location_types,private.sea_route_options,private.sea_travel_requests from public,anon,authenticated;

-- Public projections carry only identity and scheduled coarse presence.
alter table public.character_profiles
  add column arrives_at timestamptz,
  add column arrival_location text,
  add constraint character_profiles_arrival_check check(
    (arrives_at is null and arrival_location is null)
    or (arrives_at is not null and arrival_location in ('the_harbor','open_sea')));
alter table public.harbor_players add column arrives_at timestamptz;
create index character_profiles_harbor_arrival on public.character_profiles(arrives_at)
  where arrival_location='the_harbor';
drop policy harbor_players_read on public.harbor_players;
create policy harbor_players_read on public.harbor_players for select to authenticated
  using ((select private.is_registered_player()) and (arrives_at is null or arrives_at<=statement_timestamp()));
alter publication supabase_realtime add table public.character_profiles;
