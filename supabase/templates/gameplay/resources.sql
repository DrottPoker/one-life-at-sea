-- Settle the old recovery model once before replacing its pause metadata.
do $energy_cutover$
declare captain record; cutover_at timestamptz;
begin
  if exists(select 1 from information_schema.columns where table_schema='public'
    and table_name='characters' and column_name='energy_paused_at') then
    lock table public.characters in access exclusive mode;
    cutover_at:=clock_timestamp();
    for captain in select id from public.characters where location='traveling' and travel_arrives_at<=cutover_at loop
      perform private.settle_sea_travel(captain.id,cutover_at);
    end loop;
    update public.characters c set energy=e.energy,energy_updated_at=cutover_at
      from (select p.id,r.energy from public.characters p
        cross join lateral private.character_energy_snapshot(p,cutover_at) r) e where c.id=e.id;
    drop trigger characters_guard_sea_resources on public.characters;
    alter table public.characters drop constraint characters_sea_state_check;
    alter table public.characters drop column energy_paused_at;
    alter table public.characters add constraint characters_sea_state_check check(
      (location='the_harbor' and sea_step=0 and sea_visit_id is null and sea_place_id is null and sea_place_name is null)
      or (location='open_sea' and sea_step>0 and sea_visit_id is not null and sea_place_id is not null and sea_place_name is not null)
      or (location='traveling' and sea_place_id is null and sea_place_name is null));
  end if;
end;
$energy_cutover$;

-- Canonical function bodies; scalar config tokens are substituted by config tooling.
-- Existing rows and reports are preserved; incompatible lower caps abort migration.
alter table public.characters
  alter column energy set default {{gameplay.resources.energyInitial}},
  alter column ship_health set default {{gameplay.resources.shipHealthInitial}},
  alter column crew_health set default {{gameplay.resources.crewHealthInitial}},
  alter column defence_order set default {{gameplay.combat.defaultDefenceOrder}},
  drop constraint characters_energy_check,
  add constraint characters_energy_check check(energy between 0 and {{gameplay.resources.energyStorageMax}}),
  -- Level 100 in a battling skill adds the largest bonus. Constraints run with the client's rights, so no private function is called.
  drop constraint characters_ship_health_check,
  add constraint characters_ship_health_check check(ship_health between 0 and
    {{gameplay.resources.healthMax}}+{{gameplay.equipment.limits.maxShipHealth}}+{{gameplay.skills.battlingHealth.maxLevelBonus}}),
  drop constraint characters_crew_health_check,
  add constraint characters_crew_health_check check(crew_health between 0 and {{gameplay.resources.healthMax}}+{{gameplay.skills.battlingHealth.maxLevelBonus}});
alter table public.characters alter column ship_attack set default {{gameplay.startingStats.ship.attack}};
alter table public.characters alter column ship_defense set default {{gameplay.startingStats.ship.defense}};
alter table public.characters alter column ship_speed set default {{gameplay.startingStats.ship.speed}};
alter table public.characters alter column ship_accuracy set default {{gameplay.startingStats.ship.accuracy}};
alter table public.characters alter column crew_attack set default {{gameplay.startingStats.crew.attack}};
alter table public.characters alter column crew_defense set default {{gameplay.startingStats.crew.defense}};
alter table public.characters alter column crew_speed set default {{gameplay.startingStats.crew.speed}};
alter table public.characters alter column crew_accuracy set default {{gameplay.startingStats.crew.accuracy}};

-- Preserve historical counters when future limits decrease.
alter table private.combat_participants
  alter column defender_ammo set default {{gameplay.combat.startingAmmo}},
  drop constraint combat_participants_round_check,
  add constraint combat_participants_round_check check(round>=0),
  drop constraint combat_participants_defender_ammo_check,
  add constraint combat_participants_defender_ammo_check check(defender_ammo>=0);

-- Count fixed UTC boundaries, never a timer started by the player's last action.
create or replace function private.energy_tick_snapshot(stored_energy integer,anchor timestamptz,observed_at timestamptz,tick_seconds bigint)
returns table(energy integer,energy_updated_at timestamptz)
language sql immutable strict security invoker set search_path='' as $$
  select greatest(stored_energy,least({{gameplay.resources.energyMax}},stored_energy+greatest(0,
    floor(extract(epoch from observed_at)/tick_seconds)-floor(extract(epoch from anchor)/tick_seconds))
    *{{gameplay.resources.energyRecoveryAmount}}))::integer,greatest(anchor,observed_at);
$$;
revoke all on function private.energy_tick_snapshot(integer,timestamptz,timestamptz,bigint) from public,anon,authenticated;

create or replace function private.energy_snapshot(stored_energy integer,anchor timestamptz,observed_at timestamptz)
returns table(energy integer,energy_updated_at timestamptz)
language sql immutable strict security invoker set search_path='' as $$
  select * from private.energy_tick_snapshot(stored_energy,anchor,observed_at,{{gameplay.resources.energyRecoverySeconds}});
$$;

-- Each fixed UTC boundary, such as :00 and :05 for five minutes, restores a share of the captain's own maximum,
-- which equipment and battling levels raise. Shares add up before rounding down, so a fraction is not lost between ticks.
create or replace function private.health_snapshot(value integer, anchor timestamptz, observed_at timestamptz, seconds integer, maximum integer)
returns integer language sql immutable strict security invoker set search_path = ''
as $$
  select least(maximum::numeric, value + floor(least(greatest(0, floor(extract(epoch from observed_at) / seconds) - floor(extract(epoch from anchor) / seconds)),
    ceil(100.0 / {{gameplay.resources.healthRecoveryPercent}})) * maximum * {{gameplay.resources.healthRecoveryPercent}} / 100.0))::integer;
$$;
revoke all on function private.health_snapshot(integer,timestamptz,timestamptz,integer,integer) from public,anon,authenticated;
drop function if exists private.health_tick_anchor(timestamptz,timestamptz,integer);
drop function if exists private.health_snapshot(integer,timestamptz,timestamptz,integer);

-- An overdue return changes the rate at arrival, including a tick exactly at arrival.
create or replace function private.character_energy_snapshot(c public.characters,observed_at timestamptz)
returns table(energy integer,energy_updated_at timestamptz)
language plpgsql stable security invoker set search_path='' as $$
declare recovered record;
begin
  if c.location='traveling' and c.travel_kind='return' and c.travel_arrives_at<=observed_at then
    select * into recovered from private.energy_tick_snapshot(c.energy,c.energy_updated_at,
      greatest(c.energy_updated_at,c.travel_arrives_at-interval '1 microsecond'),{{gameplay.resources.energyRecoverySeconds}}::bigint*2);
    return query select * from private.energy_snapshot(recovered.energy,recovered.energy_updated_at,observed_at);
  else
    return query select * from private.energy_tick_snapshot(c.energy,c.energy_updated_at,observed_at,
      {{gameplay.resources.energyRecoverySeconds}}::bigint*case when c.location='the_harbor' then 1 else 2 end);
  end if;
end;
$$;
revoke all on function private.character_energy_snapshot(public.characters,timestamptz) from public,anon,authenticated;
