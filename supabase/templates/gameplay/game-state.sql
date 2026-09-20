create or replace function private.get_game_state()
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare c public.characters%rowtype; active private.combats%rowtype; engagement private.combat_engagements%rowtype; observed_at timestamptz;
  recovered record; energy_tick_seconds bigint; ship_hp integer; crew_hp integer; health_next_at timestamptz; last_id uuid;
begin
  if auth.uid() is null or not private.is_registered_player() then return null; end if;
  select * into c from public.characters where user_id=auth.uid();
  if not found then return null; end if;
  perform private.settle_combat_context(array[c.id]);
  observed_at:=clock_timestamp();
  perform private.settle_ship_upgrade(c.id,observed_at);
  select * into c from public.characters where id=c.id;
  select * into engagement from private.combat_engagements where character_id=c.id;
  select * into active from private.combats where id=engagement.combat_id;
  select * into recovered from private.character_energy_snapshot(c,observed_at);
  ship_hp:=case when active.id is not null or c.hospital_until is not null then c.ship_health else private.health_snapshot(c.ship_health,c.ship_recovery_at,observed_at,{{gameplay.resources.shipRecoverySeconds}}) end;
  crew_hp:=case when active.id is not null or c.hospital_until is not null then c.crew_health else private.health_snapshot(c.crew_health,c.crew_recovery_at,observed_at,{{gameplay.resources.crewRecoverySeconds}}) end;
  if active.id is null and c.hospital_until is null then
    health_next_at:=least(case when ship_hp<{{gameplay.resources.healthMax}} then c.ship_recovery_at+(ship_hp-c.ship_health+1)*make_interval(secs => {{gameplay.resources.shipRecoverySeconds}}) end,
      case when crew_hp<{{gameplay.resources.healthMax}} then c.crew_recovery_at+(crew_hp-c.crew_health+1)*make_interval(secs => {{gameplay.resources.crewRecoverySeconds}}) end);
  end if;
  select b.id into last_id from private.combats b where b.defender_id=c.id
    or exists(select 1 from private.combat_participants where combat_id=b.id and character_id=c.id)
    order by b.started_at desc,b.id desc limit 1;
  energy_tick_seconds:={{gameplay.resources.energyRecoverySeconds}}::bigint*case when c.location='the_harbor' then 1 else 2 end;
  return jsonb_build_object('energy',recovered.energy,'energy_next_at',case when recovered.energy<{{gameplay.resources.energyMax}} then
      date_bin(make_interval(secs=>energy_tick_seconds::double precision),greatest(observed_at,recovered.energy_updated_at),'1970-01-01Z'::timestamptz)
        +make_interval(secs=>energy_tick_seconds::double precision) end,
    'sea',private.sea_state(c),'gold_coins',c.gold_coins,'bank_gold_coins',c.bank_gold_coins,'training',private.training_state(c.id),
    'hospital_until',c.hospital_until,'observed_at',observed_at,'ship_health',ship_hp,'crew_health',crew_hp,'health_next_at',health_next_at,
    'active_combat_id',active.id,'combat_next_at',active.deadline,'last_combat_id',last_id,
    'active_attack',case when engagement.role='attacker' then jsonb_build_object('battle_id',active.id,'target_id',active.defender_id) end,
    'defence_order',c.defence_order,'protected_until',case when c.protected_until>observed_at then c.protected_until end,
    'ship_attack',c.ship_attack,'ship_defense',c.ship_defense,'ship_speed',c.ship_speed,'ship_accuracy',c.ship_accuracy,
    'crew_attack',c.crew_attack,'crew_defense',c.crew_defense,'crew_speed',c.crew_speed,'crew_accuracy',c.crew_accuracy);
end;
$$;


create or replace function public.list_harbor_players(requested_page integer default 0)
returns jsonb
language sql stable security invoker set search_path = ''
as $$
  with totals as (
    select count(*)::integer as total from public.harbor_players where arrives_at is null or arrives_at<=statement_timestamp()
  ), paging as (
    select total, least(greatest(coalesce(requested_page, 0), 0),
      greatest(0, (total - 1) / {{gameplay.harbor.pageSize}})) as page from totals
  )
  select jsonb_build_object(
    'total', total, 'page', page, 'observed_at',statement_timestamp(),
    'next_arrival_at',(select min(arrives_at) from public.character_profiles where arrival_location='the_harbor' and arrives_at>statement_timestamp()),
    'players', coalesce((
      select jsonb_agg(to_jsonb(player) order by player.display_name, player.character_id)
      from (
        select character_id, display_name from public.harbor_players where arrives_at is null or arrives_at<=statement_timestamp()
        order by display_name, character_id limit {{gameplay.harbor.pageSize}} offset paging.page * {{gameplay.harbor.pageSize}}
      ) player
    ), '[]'::jsonb)
  ) from paging;
$$;

