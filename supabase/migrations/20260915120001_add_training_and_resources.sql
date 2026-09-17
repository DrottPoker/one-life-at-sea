alter table public.characters
  add column energy integer not null default 100 check (energy between 0 and 100),
  add column energy_updated_at timestamptz not null default now(),
  add column ship_health integer not null default 100 check (ship_health between 0 and 100),
  add column crew_health integer not null default 100 check (crew_health between 0 and 100),
  add column ship_attack integer not null default 1 check (ship_attack >= 1),
  add column ship_defense integer not null default 1 check (ship_defense >= 1),
  add column ship_speed integer not null default 1 check (ship_speed >= 1),
  add column ship_accuracy integer not null default 1 check (ship_accuracy >= 1),
  add column crew_attack integer not null default 1 check (crew_attack >= 1),
  add column crew_defense integer not null default 1 check (crew_defense >= 1),
  add column crew_speed integer not null default 1 check (crew_speed >= 1),
  add column crew_accuracy integer not null default 1 check (crew_accuracy >= 1);

-- Preserve partial intervals; time at full energy cannot be banked.
create function private.energy_snapshot(stored_energy integer, anchor timestamptz, observed_at timestamptz)
returns table (energy integer, energy_updated_at timestamptz)
language sql immutable strict security invoker set search_path = ''
as $$
  with recovery as (
    select least(100 - stored_energy,
      greatest(0, floor(extract(epoch from (observed_at - anchor)) / 300)))::integer as gained
  )
  select stored_energy + gained,
    case when stored_energy + gained = 100 then observed_at
      else anchor + gained * interval '5 minutes' end
  from recovery;
$$;
revoke all on function private.energy_snapshot(integer, timestamptz, timestamptz) from public, anon;
grant execute on function private.energy_snapshot(integer, timestamptz, timestamptz) to authenticated;

create function public.get_game_state()
returns jsonb
language sql stable security invoker set search_path = ''
as $$
  select jsonb_build_object(
    'energy', e.energy,
    'energy_next_at', case when e.energy < 100 then e.energy_updated_at + interval '5 minutes' end,
    'observed_at', statement_timestamp(),
    'ship_health', c.ship_health, 'crew_health', c.crew_health,
    'ship_attack', c.ship_attack, 'ship_defense', c.ship_defense,
    'ship_speed', c.ship_speed, 'ship_accuracy', c.ship_accuracy,
    'crew_attack', c.crew_attack, 'crew_defense', c.crew_defense,
    'crew_speed', c.crew_speed, 'crew_accuracy', c.crew_accuracy
  )
  from public.characters c
  cross join lateral private.energy_snapshot(c.energy, c.energy_updated_at, statement_timestamp()) e
  where c.user_id = (select auth.uid());
$$;
revoke all on function public.get_game_state() from public, anon;
grant execute on function public.get_game_state() to authenticated;

-- Clients have no UPDATE grant; this operation owns energy spending.
create function private.train_stat(training_group text, stat text)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  captain public.characters%rowtype;
  recovered record;
begin
  if auth.uid() is null or not private.is_registered_player() then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  if training_group is null or training_group not in ('ship', 'crew')
    or stat is null or stat not in ('attack', 'defense', 'speed', 'accuracy') then
    raise exception 'INVALID_STAT' using errcode = '22023';
  end if;
  select * into captain from public.characters where user_id = auth.uid() for update;
  if not found then
    raise exception 'CHARACTER_NOT_FOUND' using errcode = 'P0002';
  end if;
  select * into recovered from private.energy_snapshot(
    captain.energy, captain.energy_updated_at, clock_timestamp()
  );
  if recovered.energy < 5 then
    raise exception 'NOT_ENOUGH_ENERGY' using errcode = 'P0001';
  end if;
  update public.characters set
    energy = recovered.energy - 5,
    energy_updated_at = recovered.energy_updated_at,
    ship_attack = ship_attack + case when training_group = 'ship' and stat = 'attack' then 1 else 0 end,
    ship_defense = ship_defense + case when training_group = 'ship' and stat = 'defense' then 1 else 0 end,
    ship_speed = ship_speed + case when training_group = 'ship' and stat = 'speed' then 1 else 0 end,
    ship_accuracy = ship_accuracy + case when training_group = 'ship' and stat = 'accuracy' then 1 else 0 end,
    crew_attack = crew_attack + case when training_group = 'crew' and stat = 'attack' then 1 else 0 end,
    crew_defense = crew_defense + case when training_group = 'crew' and stat = 'defense' then 1 else 0 end,
    crew_speed = crew_speed + case when training_group = 'crew' and stat = 'speed' then 1 else 0 end,
    crew_accuracy = crew_accuracy + case when training_group = 'crew' and stat = 'accuracy' then 1 else 0 end
  where id = captain.id;
end;
$$;
revoke all on function private.train_stat(text, text) from public, anon;
grant execute on function private.train_stat(text, text) to authenticated;

create function public.train_stat(training_group text, stat text)
returns void
language sql volatile security invoker set search_path = ''
as $$ select private.train_stat(training_group, stat); $$;
revoke all on function public.train_stat(text, text) from public, anon;
grant execute on function public.train_stat(text, text) to authenticated;

comment on column public.characters.energy_updated_at is 'Anchor for complete five-minute energy recovery intervals.';
comment on function public.train_stat(text, text) is 'Spend five energy for one point in one of eight stats owned by the current player.';
