-- Read health and engagement together under the same participant locks.
create or replace function private.get_game_state()
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare c public.characters%rowtype; active private.combats%rowtype; observed_at timestamptz;
  recovered record; ship_hp integer; crew_hp integer; health_next_at timestamptz; last_id uuid;
begin
  if auth.uid() is null or not private.is_registered_player() then return null; end if;
  select * into c from public.characters where user_id=auth.uid();
  if not found then return null; end if;
  perform private.settle_combat_context(array[c.id]);
  select * into c from public.characters where id=c.id;
  select b.* into active from private.combat_engagements e join private.combats b on b.id=e.combat_id where e.character_id=c.id;
  observed_at := clock_timestamp();
  select * into recovered from private.energy_snapshot(c.energy,c.energy_updated_at,observed_at);
  ship_hp := case when active.id is not null then c.ship_health else private.health_snapshot(c.ship_health,c.ship_recovery_at,observed_at,30) end;
  crew_hp := case when active.id is not null then c.crew_health else private.health_snapshot(c.crew_health,c.crew_recovery_at,observed_at,10) end;
  if active.id is null then
    health_next_at := least(
      case when ship_hp<100 then c.ship_recovery_at + (ship_hp-c.ship_health+1)*interval '30 seconds' end,
      case when crew_hp<100 then c.crew_recovery_at + (crew_hp-c.crew_health+1)*interval '10 seconds' end);
  end if;
  select id into last_id from private.combats where c.id in (attacker_id,defender_id) order by started_at desc,id desc limit 1;
  return jsonb_build_object('energy',recovered.energy,
    'energy_next_at',case when recovered.energy<100 then recovered.energy_updated_at+interval '5 minutes' end,
    'observed_at',observed_at,'ship_health',ship_hp,'crew_health',crew_hp,'health_next_at',health_next_at,
    'active_combat_id',active.id,'combat_next_at',active.deadline,'last_combat_id',last_id,'defence_order',c.defence_order,
    'protected_until',case when c.protected_until>observed_at then c.protected_until end,
    'ship_attack',c.ship_attack,'ship_defense',c.ship_defense,'ship_speed',c.ship_speed,'ship_accuracy',c.ship_accuracy,
    'crew_attack',c.crew_attack,'crew_defense',c.crew_defense,'crew_speed',c.crew_speed,'crew_accuracy',c.crew_accuracy);
end;
$$;
