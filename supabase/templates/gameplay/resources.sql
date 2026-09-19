-- Canonical function bodies; scalar config tokens are substituted by config tooling.
-- Existing rows and reports are preserved; incompatible lower caps abort migration.
alter table public.characters
  alter column energy set default {{gameplay.resources.energyInitial}},
  alter column ship_health set default {{gameplay.resources.shipHealthInitial}},
  alter column crew_health set default {{gameplay.resources.crewHealthInitial}},
  alter column defence_order set default {{gameplay.combat.defaultDefenceOrder}},
  drop constraint characters_energy_check,
  add constraint characters_energy_check check(energy between 0 and {{gameplay.resources.energyMax}}),
  drop constraint characters_ship_health_check,
  add constraint characters_ship_health_check check(ship_health between 0 and {{gameplay.resources.healthMax}}),
  drop constraint characters_crew_health_check,
  add constraint characters_crew_health_check check(crew_health between 0 and {{gameplay.resources.healthMax}});
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

create or replace function private.energy_snapshot(stored_energy integer, anchor timestamptz, observed_at timestamptz)
returns table (energy integer, energy_updated_at timestamptz)
language sql immutable strict security invoker set search_path = ''
as $$
  with elapsed as (
    select greatest(0, floor(extract(epoch from (observed_at - anchor)) / {{gameplay.resources.energyRecoverySeconds}})) as intervals
  ), recovery as (
    select intervals, least({{gameplay.resources.energyMax}} - stored_energy,
      intervals * {{gameplay.resources.energyRecoveryAmount}})::integer as gained from elapsed
  )
  select stored_energy + gained,
    case when stored_energy + gained = {{gameplay.resources.energyMax}} then observed_at
      else anchor + intervals * make_interval(secs => {{gameplay.resources.energyRecoverySeconds}}) end
  from recovery;
$$;

create or replace function private.health_snapshot(value integer, anchor timestamptz, observed_at timestamptz, seconds integer)
returns integer language sql immutable strict security invoker set search_path = ''
as $$
  select least({{gameplay.resources.healthMax}}, value + least({{gameplay.resources.healthMax}}, greatest(0, floor(extract(epoch from (observed_at - anchor)) / seconds)))::integer);
$$;

