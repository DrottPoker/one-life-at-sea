-- Preserve UUID keys and assign existing captains numbers in creation order.
alter table public.characters add column player_number bigint;
with numbered as (
  select id, 100000 + row_number() over (order by created_at, id) as player_number
  from public.characters
)
update public.characters c set player_number=n.player_number from numbered n where n.id=c.id;
alter table public.characters alter column player_number set not null;
alter table public.characters alter column player_number add generated always as identity
  (start with 100001 minvalue 100001 maxvalue 9007199254740991 no cycle);
select setval(pg_get_serial_sequence('public.characters','player_number'),
  coalesce(max(player_number),100001),count(*)>0) from public.characters;
alter table public.characters add constraint characters_player_number_key unique(player_number);
alter table public.characters add constraint characters_player_number_range
  check(player_number between 100001 and 9007199254740991);
revoke all on sequence public.characters_player_number_seq from public,anon,authenticated;

create function private.preserve_player_number()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.player_number is distinct from old.player_number then
    raise exception 'PLAYER_NUMBER_IMMUTABLE' using errcode='23514';
  end if;
  return new;
end;
$$;
revoke all on function private.preserve_player_number() from public,anon,authenticated;
create trigger characters_preserve_player_number before update of player_number on public.characters
for each row execute function private.preserve_player_number();

alter table public.character_profiles add column player_number bigint;
update public.character_profiles p set player_number=c.player_number
from public.characters c where c.id=p.character_id;
alter table public.character_profiles alter column player_number set not null;
alter table public.character_profiles add constraint character_profiles_player_number_key unique(player_number);

-- Keep registration working as soon as this migration commits.
create or replace function private.sync_character_profile()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.character_profiles(character_id,player_number,display_name,location,created_at,arrives_at,arrival_location,
    max_sea_distance,arrival_max_sea_distance)
    values(new.id,new.player_number,new.display_name,new.location,new.created_at,new.travel_arrives_at,
      case when new.location='traveling' then case when new.travel_kind='return' then 'the_harbor' else 'open_sea' end end,
      new.max_sea_distance,case when new.travel_kind in ('depart','onward')
        and new.travel_target_step>new.max_sea_distance then new.travel_target_step end)
    on conflict(character_id) do update set display_name=excluded.display_name,location=excluded.location,
      created_at=excluded.created_at,arrives_at=excluded.arrives_at,arrival_location=excluded.arrival_location,
      max_sea_distance=excluded.max_sea_distance,arrival_max_sea_distance=excluded.arrival_max_sea_distance
    where (character_profiles.display_name,character_profiles.location,character_profiles.created_at,
      character_profiles.arrives_at,character_profiles.arrival_location,
      character_profiles.max_sea_distance,character_profiles.arrival_max_sea_distance) is distinct from
      (excluded.display_name,excluded.location,excluded.created_at,excluded.arrives_at,excluded.arrival_location,
      excluded.max_sea_distance,excluded.arrival_max_sea_distance);
  return new;
end;
$$;
revoke all on function private.sync_character_profile() from public,anon,authenticated;

create extension if not exists pg_trgm with schema extensions;
create index character_profiles_name_search_idx on public.character_profiles
using gin(lower(display_name) extensions.gin_trgm_ops);
comment on column public.characters.player_number is 'Permanent public player ID; UUID remains the internal key. Never reuse or renumber.';
