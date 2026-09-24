create or replace function private.combat_snapshot(c public.characters, observed_at timestamptz)
returns jsonb language sql stable security invoker set search_path = ''
as $$
  select jsonb_build_object(
    'id', c.id, 'player_number', c.player_number, 'name', c.display_name, 'ammo', {{gameplay.combat.startingAmmo}}, 'defence_order', c.defence_order,
    'shots', coalesce((l.loadout->'firearm'->>'shots')::integer, 0), 'loadout', l.loadout,
    'ship_health', private.health_snapshot(c.ship_health, c.ship_recovery_at, observed_at, {{gameplay.resources.shipRecoverySeconds}}, l.ship_max),
    'ship_health_max', l.ship_max,
    'crew_health', private.health_snapshot(c.crew_health, c.crew_recovery_at, observed_at, {{gameplay.resources.crewRecoverySeconds}}),
    'ship', jsonb_build_object('attack',c.ship_attack,'defense',c.ship_defense,
      'speed',trim_scale(c.ship_speed*(1+coalesce((l.loadout->'sails'->>'speed')::numeric,0)/100)),'accuracy',c.ship_accuracy),
    'crew_morale',m.morale,'morale_multiplier',private.morale_multiplier(m.morale,{{gameplay.morale.statBonusBps}}),
    'crew', jsonb_build_object(
      'attack',trim_scale(c.crew_attack*private.morale_multiplier(m.morale,{{gameplay.morale.statBonusBps}})),
      'defense',trim_scale(c.crew_defense*private.morale_multiplier(m.morale,{{gameplay.morale.statBonusBps}})),
      'speed',trim_scale(c.crew_speed*private.morale_multiplier(m.morale,{{gameplay.morale.statBonusBps}})),
      'accuracy',trim_scale(c.crew_accuracy*private.morale_multiplier(m.morale,{{gameplay.morale.statBonusBps}})))
  ) from private.morale_snapshot(c.crew_morale,c.morale_updated_at,observed_at) m
  cross join lateral (select e.loadout,{{gameplay.resources.healthMax}}+coalesce((e.loadout->'hull'->>'health')::integer,0) ship_max
    from (select coalesce(jsonb_object_agg(key,value-'entry_id'-'image_path'),'{}'::jsonb) loadout
      from jsonb_each(private.character_loadout(c.id))) e) l;
$$;

-- Opponents see equipment names once the fight has started, never their stats.
create or replace function private.visible_combatant(snapshot jsonb, own boolean, revealed boolean)
returns jsonb language sql stable security invoker set search_path = ''
as $$
  select jsonb_build_object(
    'id',snapshot->'id','name',snapshot->'name',
    'player_number',coalesce(snapshot->'player_number',
      (select to_jsonb(player_number) from public.characters where id=(snapshot->>'id')::uuid)),
    'ship_health',snapshot->'ship_health','crew_health',snapshot->'crew_health',
    'ship_health_max',coalesce(snapshot->'ship_health_max',to_jsonb({{gameplay.resources.healthMax}})),
    'ammo',case when own then snapshot->'ammo' end,
    'shots',case when own then coalesce(snapshot->'shots','0'::jsonb) end,
    'ship',case when own then snapshot->'ship' end,
    'crew',case when own then snapshot->'crew' end,
    'crew_morale',case when own then snapshot->'crew_morale' end,
    'morale_multiplier',case when own then snapshot->'morale_multiplier' end,
    'loadout',case when own then coalesce(snapshot->'loadout','{}'::jsonb)
      when revealed then (select coalesce(jsonb_object_agg(key,jsonb_build_object('name',value->'name')),'{}'::jsonb)
        from jsonb_each(coalesce(snapshot->'loadout','{}'::jsonb))) end);
$$;

create or replace function private.combat_hit_chance(accuracy numeric, speed numeric)
returns double precision language plpgsql immutable strict security invoker set search_path='' as $$
declare ratio double precision;
  extreme constant double precision := {{gameplay.combat.hitChance.extremeRatio}};
  exponent constant double precision := {{gameplay.combat.hitChance.exponent}};
  factor double precision := power(extreme,exponent);
begin
  if accuracy<=0 or speed<=0 then raise exception 'INVALID_COMBAT_STAT' using errcode='22023'; end if;
  ratio:=(accuracy/speed)::double precision;
  if ratio<=1/extreme then return 0; end if;
  if ratio>=extreme then return 1; end if;
  if ratio<=1 then return (factor*power(ratio,exponent)-1)/(2*(factor-1)); end if;
  return 1-(factor*power(1/ratio,exponent)-1)/(2*(factor-1));
end;
$$;

create or replace function private.combat_damage_reduction(attack numeric, defense numeric)
returns numeric language plpgsql immutable strict security invoker set search_path='' as $$
declare ratio numeric;
  zero_ratio constant numeric := {{gameplay.combat.mitigation.zeroReductionAttackRatio}};
  full_ratio constant numeric := {{gameplay.combat.mitigation.fullReductionDefenseRatio}};
  equal_reduction constant numeric := {{gameplay.combat.mitigation.equalStatsReduction}};
begin
  if attack<=0 or defense<=0 then raise exception 'INVALID_COMBAT_STAT' using errcode='22023'; end if;
  ratio:=defense/attack;
  if ratio<=1/zero_ratio then return 0; end if;
  if ratio>=full_ratio then return 1; end if;
  if ratio<=1 then return equal_reduction*(1+ln(ratio)/ln(zero_ratio)); end if;
  return equal_reduction+(1-equal_reduction)*ln(ratio)/ln(full_ratio);
end;
$$;

-- Weapon Precision shifts the stat-based chance most at even odds and never at certainty.
create or replace function private.combat_precision_chance(chance double precision, weapon_precision numeric)
returns double precision language sql immutable strict security invoker set search_path='' as $$
  select chance+(weapon_precision::double precision-50)/100*(1-abs(2*chance-1));
$$;

-- Weapon Damage over the weapon scale, the zone multiplier and armor scale the stat damage.
create or replace function private.combat_damage(attack numeric, defense numeric, weapon_damage numeric, zone_multiplier numeric, armor numeric)
returns integer language plpgsql immutable strict security invoker set search_path='' as $$
declare reduction numeric; strength_log numeric;
begin
  reduction:=private.combat_damage_reduction(attack,defense);
  if reduction>=1 then return 0; end if;
  strength_log:=log(greatest(1::numeric,attack/{{gameplay.combat.damage.statScale}}));
  return greatest({{gameplay.combat.damage.minimum}},round(
    ({{gameplay.combat.damage.quadratic}}*strength_log*strength_log+
     {{gameplay.combat.damage.linear}}*strength_log+{{gameplay.combat.damage.constant}})*(1-reduction)
    *weapon_damage/{{gameplay.equipment.weaponScale}}*zone_multiplier*(1-armor/100)))::integer;
end;
$$;

create or replace function private.combat_damage(attack numeric, defense numeric)
returns integer language sql immutable strict security invoker set search_path='' as $$
  select private.combat_damage(attack,defense,{{gameplay.equipment.weaponScale}},1,0);
$$;

create or replace function private.combat_zone(zone_group text, roll double precision)
returns table(zone text, multiplier numeric, armor_slot text, critical boolean)
language sql immutable strict security invoker set search_path='' as $$
  with zones(zone_group,position,zone,weight,multiplier,armor_slot,critical) as (values {{equipment.zonesSql}}),
  bounds as (select z.*,sum(z.weight) over(order by z.position)::double precision/sum(z.weight) over() upper_bound
    from zones z where z.zone_group=combat_zone.zone_group)
  select b.zone,b.multiplier,b.armor_slot,b.critical from bounds b where roll<b.upper_bound order by b.position limit 1;
$$;

-- Empty melee and cannon slots fall back to neutral weapons; an empty firearm slot has no weapon.
create or replace function private.combat_weapon(snapshot jsonb, weapon_slot text)
returns jsonb language sql stable security invoker set search_path='' as $$
  select coalesce(snapshot->'loadout'->weapon_slot,case weapon_slot
    when 'melee' then jsonb_build_object('name',{{gameplay.equipment.fallbackWeapons.melee.name}},
      'damage',{{gameplay.equipment.fallbackWeapons.melee.damage}},'precision',{{gameplay.equipment.fallbackWeapons.melee.precision}})
    when 'cannons' then jsonb_build_object('name',{{gameplay.equipment.fallbackWeapons.cannons.name}},
      'damage',{{gameplay.equipment.fallbackWeapons.cannons.damage}},'precision',{{gameplay.equipment.fallbackWeapons.cannons.precision}}) end);
$$;

-- One strike from one side: hit roll, zone roll and the target's armor for that zone.
create or replace function private.combat_strike(striker jsonb, target jsonb, group_name text, weapon jsonb, hit_roll double precision, zone_roll double precision)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare chance double precision; struck record; damage integer;
begin
  chance:=private.combat_precision_chance(private.combat_hit_chance((striker->group_name->>'accuracy')::numeric,(target->group_name->>'speed')::numeric),
    (weapon->>'precision')::numeric);
  if hit_roll>=chance then return jsonb_build_object('hit',false,'damage',0,'weapon',weapon->>'name'); end if;
  select * into struck from private.combat_zone(group_name,zone_roll);
  damage:=least((target->>(group_name||'_health'))::integer,private.combat_damage((striker->group_name->>'attack')::numeric,
    (target->group_name->>'defense')::numeric,(weapon->>'damage')::numeric,struck.multiplier,
    coalesce((target->'loadout'->struck.armor_slot->>'armor')::numeric,0)));
  return jsonb_build_object('hit',true,'damage',damage,'weapon',weapon->>'name','zone',struck.zone,'critical',struck.critical);
end;
$$;

revoke all on function private.combat_precision_chance(double precision,numeric),private.combat_damage(numeric,numeric,numeric,numeric,numeric),
  private.combat_zone(text,double precision),private.combat_weapon(jsonb,text),
  private.combat_strike(jsonb,jsonb,text,jsonb,double precision,double precision) from public,anon,authenticated;

create or replace function private.resolve_combat_round(input_state jsonb, player_order text, rolls double precision[])
returns jsonb language plpgsql stable security invoker set search_path = ''
as $$
declare
  a jsonb := input_state->'attacker';
  d jsonb := input_state->'defender';
  phase text := input_state->>'phase';
  group_name text := case when phase = 'sea' then 'ship' else 'crew' end;
  health_key text := group_name || '_health';
  defender_order text;
  next_phase text := phase;
  round_no integer := (input_state->>'round')::integer + 1;
  a_strike jsonb := '{"hit":false,"damage":0}'::jsonb;
  d_strike jsonb := '{"hit":false,"damage":0}'::jsonb;
  chance double precision;
  a_down boolean; d_down boolean;
  outcome text; winner text; transition text;
  boarded boolean;
  result_state jsonb;
begin
  if input_state->>'status' <> 'active' or round_no > {{gameplay.combat.maxRounds}} then raise exception 'COMBAT_FINISHED'; end if;
  if player_order is null or
    (phase = 'sea' and player_order not in ('fire', 'board', 'retreat')) or
    (phase = 'boarding' and player_order not in ('crew_shoot', 'crew_attack', 'disengage', 'retreat')) then
    raise exception 'INVALID_ORDER' using errcode = '22023';
  end if;
  -- Rolls: attacker hit, defender hit, boarding, attacker zone, defender zone.
  if cardinality(rolls) <> 5 or exists(select 1 from unnest(rolls) r where r is null or r < 0 or r >= 1) then
    raise exception 'INVALID_ROLLS';
  end if;
  defender_order := case when phase = 'boarding' then
      case when d->'loadout'->'firearm' is not null and coalesce((d->>'shots')::integer, 0) >= 1 then 'crew_shoot' else 'crew_attack' end
    when d->>'defence_order' = 'cannon' and (d->>'ammo')::integer >= {{gameplay.combat.ammoPerShot}} then 'fire' else 'board' end;
  if player_order = 'fire' and (a->>'ammo')::integer < {{gameplay.combat.ammoPerShot}} then raise exception 'NO_AMMO'; end if;
  if player_order = 'crew_shoot' and (a->'loadout'->'firearm' is null or coalesce((a->>'shots')::integer, 0) < 1) then raise exception 'NO_SHOTS'; end if;
  if player_order in ('fire', 'crew_shoot', 'crew_attack') then
    a_strike := private.combat_strike(a, d, group_name, private.combat_weapon(a, case player_order when 'fire' then 'cannons'
      when 'crew_shoot' then 'firearm' else 'melee' end), rolls[1], rolls[4]);
  end if;
  if defender_order in ('fire', 'crew_shoot', 'crew_attack') then
    d_strike := private.combat_strike(d, a, group_name, private.combat_weapon(d, case defender_order when 'fire' then 'cannons'
      when 'crew_shoot' then 'firearm' else 'melee' end), rolls[2], rolls[5]);
  end if;
  a := a || jsonb_build_object(health_key, (a->>health_key)::integer - (d_strike->>'damage')::integer,
    'ammo', (a->>'ammo')::integer - case when player_order = 'fire' then {{gameplay.combat.ammoPerShot}} else 0 end,
    'shots', coalesce((a->>'shots')::integer, 0) - case when player_order = 'crew_shoot' then 1 else 0 end);
  d := d || jsonb_build_object(health_key, (d->>health_key)::integer - (a_strike->>'damage')::integer,
    'ammo', (d->>'ammo')::integer - case when defender_order = 'fire' then {{gameplay.combat.ammoPerShot}} else 0 end,
    'shots', coalesce((d->>'shots')::integer, 0) - case when defender_order = 'crew_shoot' then 1 else 0 end);
  if (a->>'ship_health')::integer=0 then a:=a || jsonb_build_object('crew_health',0); end if;
  if (d->>'ship_health')::integer=0 then d:=d || jsonb_build_object('crew_health',0); end if;
  a_down := (a->>'ship_health')::integer = 0 or (a->>'crew_health')::integer = 0;
  d_down := (d->>'ship_health')::integer = 0 or (d->>'crew_health')::integer = 0;
  if a_down and d_down then outcome := 'draw';
  elsif a_down or d_down then
    outcome := case when phase = 'sea' then 'hull_victory' else 'boarding_victory' end;
    winner := case when a_down then d->>'id' else a->>'id' end;
  elsif player_order = 'retreat' then outcome := 'retreated';
  elsif round_no >= {{gameplay.combat.maxRounds}} then outcome := 'draw';
  elsif phase = 'boarding' and player_order = 'disengage' then
    next_phase := 'sea'; transition := 'disengaged';
  elsif phase = 'sea' and (player_order = 'board' or defender_order = 'board') then
    if player_order = 'board' and defender_order = 'board' then boarded := true;
    else
      chance := greatest({{gameplay.combat.boarding.minimumChance}}, least({{gameplay.combat.boarding.maximumChance}}, {{gameplay.combat.boarding.baseChance}} + {{gameplay.combat.boarding.speedInfluence}} *
        ((a->'ship'->>'speed')::double precision - (d->'ship'->>'speed')::double precision) /
        ((a->'ship'->>'speed')::double precision + (d->'ship'->>'speed')::double precision) *
        case when player_order = 'board' then 1 else -1 end));
      boarded := rolls[3] < chance;
    end if;
    transition := case when boarded then 'boarded' else 'boarding_failed' end;
    if boarded then next_phase := 'boarding'; end if;
  end if;
  result_state := input_state || jsonb_build_object('attacker',a,'defender',d,'round',round_no,'phase',next_phase,
    'status',case when outcome is null then 'active' else 'completed' end,
    'outcome',outcome,'winner_id',winner);
  return jsonb_build_object('state',result_state,'event',jsonb_build_object(
    'round',round_no,'phase',phase,'attacker_order',player_order,'defender_order',defender_order,
    'attacker_hit',(a_strike->>'hit')::boolean,'defender_hit',(d_strike->>'hit')::boolean,
    'attacker_damage',(a_strike->>'damage')::integer,'defender_damage',(d_strike->>'damage')::integer,
    'attacker_weapon',a_strike->'weapon','defender_weapon',d_strike->'weapon',
    'attacker_zone',a_strike->'zone','defender_zone',d_strike->'zone',
    'attacker_critical',a_strike->'critical','defender_critical',d_strike->'critical',
    'transition',transition,'outcome',outcome));
end;
$$;

create or replace function private.advance_shared_combat(battle_id uuid, actor uuid, player_order text, request_id uuid, occurred_at timestamptz, timed_out boolean)
returns void language plpgsql volatile security invoker set search_path='' as $$
declare b private.combats%rowtype; p private.combat_participants%rowtype;
  resolved jsonb; s jsonb; d jsonb; a jsonb; personal_status text; ending text; winner uuid;
begin
  select * into b from private.combats where id=battle_id for update;
  select * into p from private.combat_participants where combat_id=battle_id and character_id=actor;
  if b.status<>'active' or p.status<>'active' then return; end if;
  resolved:=private.resolve_combat_round(jsonb_build_object('status','active','phase',p.phase,'round',p.round,
    'attacker',p.snapshot,'defender',b.state->'defender' || jsonb_build_object('ammo',p.defender_ammo,'shots',p.defender_shots)),
    player_order,array[private.combat_roll(),private.combat_roll(),private.combat_roll(),private.combat_roll(),private.combat_roll()]);
  s:=resolved->'state'; a:=s->'attacker'; d:=s->'defender';
  personal_status:=case
    when (a->>'ship_health')::integer=0 or (a->>'crew_health')::integer=0 then 'defeated'
    when player_order='retreat' then 'retreated'
    when (s->>'round')::integer>={{gameplay.combat.maxRounds}} then 'draw' else 'active' end;
  -- Final blow remains credited even if the simultaneous counterattack also downs its author.
  if (d->>'ship_health')::integer=0 or (d->>'crew_health')::integer=0 then
    ending:=case when (d->>'ship_health')::integer=0 then 'hull_victory' else 'boarding_victory' end;
    winner:=actor; personal_status:='victory';
  end if;
  update private.combat_participants set snapshot=a,phase=s->>'phase',round=(s->>'round')::integer,
    status=personal_status,defender_ammo=(d->>'ammo')::integer,defender_shots=(d->>'shots')::integer,
    deadline=least(b.hard_deadline,occurred_at+make_interval(secs => {{gameplay.combat.idleSeconds}})),
    finished_at=case when personal_status<>'active' then occurred_at end,
    hits=hits+case when (resolved->'event'->>'attacker_hit')::boolean then 1 else 0 end,
    damage=damage+(resolved->'event'->>'attacker_damage')::integer
    where combat_id=battle_id and character_id=actor;
  update public.characters set ship_health=(a->>'ship_health')::integer,crew_health=(a->>'crew_health')::integer,
    ship_recovery_at=occurred_at,crew_recovery_at=occurred_at,
    hospital_started_at=case when (a->>'crew_health')::integer=0 then occurred_at else hospital_started_at end,
    hospital_until=case when (a->>'crew_health')::integer=0 then occurred_at+make_interval(secs=>{{gameplay.hospital.durationSeconds}}) else hospital_until end,
    protected_until=case when personal_status<>'active' then occurred_at+make_interval(secs => {{gameplay.combat.protectionSeconds}}) end where id=actor;
  update public.characters set ship_health=(d->>'ship_health')::integer,crew_health=(d->>'crew_health')::integer,
    ship_recovery_at=occurred_at,crew_recovery_at=occurred_at,
    hospital_started_at=case when (d->>'crew_health')::integer=0 then occurred_at else hospital_started_at end,
    hospital_until=case when (d->>'crew_health')::integer=0 then occurred_at+make_interval(secs=>{{gameplay.hospital.durationSeconds}}) else hospital_until end
    where id=b.defender_id;
  if personal_status<>'active' then delete from private.combat_engagements where character_id=actor and combat_id=battle_id; end if;
  if ending is not null then
    update public.characters set ship_recovery_at=occurred_at,crew_recovery_at=occurred_at,protected_until=occurred_at+make_interval(secs => {{gameplay.combat.protectionSeconds}})
      where id in(select character_id from private.combat_participants where combat_id=battle_id and status='active');
    update private.combat_participants set status='assist',finished_at=occurred_at where combat_id=battle_id and status='active';
  elsif not exists(select 1 from private.combat_participants where combat_id=battle_id and status='active') then
    ending:=case when personal_status='defeated' then 'defended' when personal_status='draw' then 'draw' else 'retreated' end;
    winner:=case when personal_status='defeated' then b.defender_id end;
  end if;
  perform private.append_combat_event(battle_id,actor,request_id,
    resolved->'event' || jsonb_build_object('kind','round','actor_name',p.snapshot->>'name',
      'at',occurred_at,'timed_out',timed_out,'participant_result',personal_status,'outcome',ending));
  update private.combats set state=state || jsonb_build_object('defender',d,'status',case when ending is null then 'active' else 'completed' end,
    'outcome',ending,'winner_id',winner),
    deadline=coalesce((select min(deadline) from private.combat_participants where combat_id=battle_id and status='active'),occurred_at),
    finished_at=case when ending is not null then occurred_at end where id=battle_id;
  if ending is not null then
    delete from private.combat_engagements where combat_id=battle_id;
    update public.characters set protected_until=occurred_at+make_interval(secs => {{gameplay.combat.protectionSeconds}}) where id=b.defender_id;
  end if;
  perform private.notify_combat(battle_id);
end;
$$;

create or replace function private.get_combat_preview(target_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare viewer_id uuid:=private.combat_captain(); a public.characters%rowtype; d public.characters%rowtype;
  own_engagement private.combat_engagements%rowtype; target_engagement private.combat_engagements%rowtype;
  a_snapshot jsonb; d_snapshot jsonb; energy_now integer; reason text; location_error text; observed_at timestamptz;
begin
  if target_id is null then return jsonb_build_object('error','CHARACTER_NOT_FOUND'); end if;
  perform private.settle_combat_context(array[viewer_id,target_id]);
  observed_at:=clock_timestamp();
  perform private.settle_ship_upgrade(viewer_id,observed_at);
  perform private.settle_ship_upgrade(target_id,observed_at);
  select * into a from public.characters where id=viewer_id;
  select * into d from public.characters where id=target_id;
  if d.id is null then return jsonb_build_object('error','CHARACTER_NOT_FOUND'); end if;
  select * into own_engagement from private.combat_engagements where character_id=viewer_id;
  select * into target_engagement from private.combat_engagements where character_id=target_id;
  a_snapshot:=private.combat_snapshot(a,observed_at);
  d_snapshot:=private.combat_snapshot(d,observed_at);
  if own_engagement.character_id is not null then a_snapshot:=a_snapshot || jsonb_build_object('ship_health',a.ship_health,'crew_health',a.crew_health); end if;
  if target_engagement.character_id is not null then d_snapshot:=d_snapshot || jsonb_build_object('ship_health',d.ship_health,'crew_health',d.crew_health); end if;
  select energy into energy_now from private.character_energy_snapshot(a,observed_at);
  location_error:=private.combat_location_error(a,d,observed_at);
  reason:=case when a.hospital_until is not null then 'IN_HOSPITAL'
    when d.hospital_until is not null then 'TARGET_IN_HOSPITAL'
    when location_error is not null then location_error
    when viewer_id=target_id then 'SELF_ATTACK'
    when own_engagement.role='attacker' then 'IN_COMBAT'
    when own_engagement.role='defender' then 'DEFENDING'
    when target_engagement.role='attacker' then 'TARGET_IN_COMBAT'
    when exists(select 1 from private.combat_participants where combat_id=target_engagement.combat_id and character_id=viewer_id) then 'ALREADY_PARTICIPATED'
    when target_engagement.character_id is null and d.protected_until>observed_at then 'TARGET_PROTECTED'
    when (a_snapshot->>'ship_health')::integer<{{gameplay.combat.minimumHealth}} or (a_snapshot->>'crew_health')::integer<{{gameplay.combat.minimumHealth}} then 'NO_HEALTH'
    when (d_snapshot->>'ship_health')::integer<{{gameplay.combat.minimumHealth}} or (d_snapshot->>'crew_health')::integer<{{gameplay.combat.minimumHealth}} then 'TARGET_NO_HEALTH'
    when energy_now<{{gameplay.combat.energyCost}} then 'NOT_ENOUGH_ENERGY' end;
  return jsonb_build_object('attacker',private.visible_combatant(a_snapshot,true,false),
    'defender',private.visible_combatant(d_snapshot,false,false),'energy',energy_now,'can_start',reason is null,'reason',reason,
    'active_combat_id',case when own_engagement.role='attacker' then own_engagement.combat_id end,
    'join_combat_id',case when target_engagement.role='defender' then target_engagement.combat_id end,
    'target_protected_until',case when target_engagement.character_id is null and d.protected_until>observed_at then d.protected_until end,
    'observed_at',observed_at);
end;
$$;

create or replace function private.start_combat(target_id uuid,request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare viewer_id uuid:=private.combat_captain(); previous private.combat_participants%rowtype;
  preview jsonb; a public.characters%rowtype; d public.characters%rowtype; recovered record;
  battle_id uuid; initial_state jsonb; observed_at timestamptz; b private.combats%rowtype; snapshot jsonb; joining boolean;
begin
  if request_id is null then raise exception 'INVALID_REQUEST' using errcode='22023'; end if;
  perform private.settle_combat_context(array[viewer_id,target_id]);
  select * into previous from private.combat_participants where character_id=viewer_id and start_request_id=request_id;
  if found then
    if (select defender_id from private.combats where id=previous.combat_id)<>target_id then return jsonb_build_object('error','REQUEST_CONFLICT'); end if;
    return jsonb_build_object('battle',private.combat_view(previous.combat_id,viewer_id));
  end if;
  preview:=private.get_combat_preview(target_id);
  if preview ? 'error' then return preview; end if;
  if not (preview->>'can_start')::boolean then return jsonb_build_object('error',preview->>'reason'); end if;
  observed_at:=clock_timestamp();
  perform private.settle_ship_upgrade(viewer_id,observed_at);
  perform private.settle_ship_upgrade(target_id,observed_at);
  select * into a from public.characters where id=viewer_id;
  select * into d from public.characters where id=target_id;
  select * into recovered from private.character_energy_snapshot(a,observed_at);
  snapshot:=private.combat_snapshot(a,observed_at);
  battle_id:=(preview->>'join_combat_id')::uuid; joining:=battle_id is not null;
  if not joining then
    initial_state:=jsonb_build_object('attacker',snapshot,'defender',private.combat_snapshot(d,observed_at),
      'status','active','outcome',null,'winner_id',null);
    insert into private.combats(attacker_id,defender_id,start_request_id,rules_version,state,started_at,deadline,hard_deadline)
      values(viewer_id,target_id,request_id,2,initial_state,observed_at,observed_at+make_interval(secs => {{gameplay.combat.idleSeconds}}),observed_at+make_interval(secs => {{gameplay.combat.maxDurationSeconds}}))
      returning id into battle_id;
    insert into private.combat_engagements(character_id,combat_id,role) values(target_id,battle_id,'defender');
    update public.characters set protected_until=null,ship_health=(initial_state->'defender'->>'ship_health')::integer,
      crew_health=(initial_state->'defender'->>'crew_health')::integer,ship_recovery_at=observed_at,crew_recovery_at=observed_at where id=target_id;
  end if;
  select * into b from private.combats where id=battle_id for update;
  -- Each attacker faces the defender's full firearm charge, like the separate salvo allowance.
  insert into private.combat_participants(combat_id,character_id,start_request_id,snapshot,joined_at,deadline,defender_shots)
    values(battle_id,viewer_id,request_id,snapshot,observed_at,least(b.hard_deadline,observed_at+make_interval(secs => {{gameplay.combat.idleSeconds}})),
      coalesce((b.state->'defender'->'loadout'->'firearm'->>'shots')::integer,0));
  insert into private.combat_engagements(character_id,combat_id,role) values(viewer_id,battle_id,'attacker');
  update public.characters set energy=recovered.energy-{{gameplay.combat.energyCost}},energy_updated_at=recovered.energy_updated_at,protected_until=null,
    ship_health=(snapshot->>'ship_health')::integer,crew_health=(snapshot->>'crew_health')::integer,
    ship_recovery_at=observed_at,crew_recovery_at=observed_at where id=viewer_id;
  perform private.append_combat_event(battle_id,viewer_id,request_id,jsonb_build_object(
    'kind',case when joining then 'joined' else 'started' end,'actor_name',a.display_name,'at',observed_at));
  perform private.notify_combat(battle_id);
  return jsonb_build_object('battle',private.combat_view(battle_id,viewer_id));
end;
$$;

create or replace function private.submit_combat_order(battle_id uuid,expected_round integer,player_order text,request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare viewer_id uuid:=private.combat_captain(); b private.combats%rowtype; p private.combat_participants%rowtype; previous jsonb;
begin
  if request_id is null or expected_round is null or expected_round<0 or expected_round>={{gameplay.combat.maxRounds}} then raise exception 'INVALID_REQUEST' using errcode='22023'; end if;
  select * into b from private.combats where id=battle_id;
  if not found or not exists(select 1 from private.combat_participants where combat_id=battle_id and character_id=viewer_id) then
    return jsonb_build_object('error','COMBAT_NOT_FOUND'); end if;
  perform private.settle_combat_context(array[viewer_id,b.defender_id]);
  select * into b from private.combats where id=battle_id;
  select * into p from private.combat_participants where combat_id=battle_id and character_id=viewer_id;
  select event into previous from private.combat_rounds where combat_id=battle_id and actor_id=viewer_id and combat_rounds.request_id=submit_combat_order.request_id;
  if found then
    if previous->>'kind'<>'round' or (previous->>'round')::integer<>expected_round+1 or previous->>'attacker_order'<>player_order then
      return jsonb_build_object('error','REQUEST_CONFLICT'); end if;
    return jsonb_build_object('battle',private.combat_view(battle_id,viewer_id));
  end if;
  if b.status='completed' or p.status<>'active' then return jsonb_build_object('battle',private.combat_view(battle_id,viewer_id)); end if;
  if exists(select 1 from public.characters where id=viewer_id and hospital_until is not null) then raise exception 'IN_HOSPITAL'; end if;
  if exists(select 1 from public.characters where id=viewer_id and location='traveling') then raise exception 'TRAVELING'; end if;
  if p.round<>expected_round then return jsonb_build_object('error','STALE_ROUND'); end if;
  if player_order is null or (p.phase='sea' and player_order not in ('fire','board','retreat'))
    or (p.phase='boarding' and player_order not in ('crew_shoot','crew_attack','disengage','retreat')) then return jsonb_build_object('error','INVALID_ORDER'); end if;
  if player_order='fire' and (p.snapshot->>'ammo')::integer<{{gameplay.combat.ammoPerShot}} then return jsonb_build_object('error','NO_AMMO'); end if;
  if player_order='crew_shoot' and (p.snapshot->'loadout'->'firearm' is null or coalesce((p.snapshot->>'shots')::integer,0)<1) then
    return jsonb_build_object('error','NO_SHOTS'); end if;
  perform private.advance_shared_combat(battle_id,viewer_id,player_order,request_id,clock_timestamp(),false);
  perform private.record_character_action(viewer_id);
  return jsonb_build_object('battle',private.combat_view(battle_id,viewer_id));
end;
$$;

