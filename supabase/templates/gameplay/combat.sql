create or replace function private.combat_snapshot(c public.characters, observed_at timestamptz)
returns jsonb language sql stable security invoker set search_path = ''
as $$
  select jsonb_build_object(
    'id', c.id, 'player_number', c.player_number, 'name', c.display_name, 'ammo', {{gameplay.combat.startingAmmo}}, 'defence_order', c.defence_order,
    'shots', coalesce((l.loadout->'firearm'->>'shots')::integer, 0), 'loadout', l.loadout,
    'temporary_uses', least(coalesce((l.loadout->'temporary'->>'quantity')::integer, 0), {{gameplay.equipment.temporaryUsesPerFight}}),
    'shot_stock', jsonb_build_object('chain', private.stack_quantity(c.id, {{gameplay.equipment.shotTypes.chain.itemId}}), 'grape', private.stack_quantity(c.id, {{gameplay.equipment.shotTypes.grape.itemId}})),
    'effects', '{}'::jsonb,
    'ship_health', private.health_snapshot(c.ship_health, c.ship_recovery_at, observed_at, {{gameplay.resources.shipRecoverySeconds}}, l.ship_max),
    'ship_health_max', l.ship_max,
    'crew_health', private.health_snapshot(c.crew_health, c.crew_recovery_at, observed_at, {{gameplay.resources.crewRecoverySeconds}}, l.crew_max),
    'crew_health_max', l.crew_max,
    'ship', jsonb_build_object('attack',c.ship_attack,'defense',c.ship_defense,
      'speed',trim_scale(c.ship_speed*(1+coalesce((l.loadout->'sails'->>'speed')::numeric,0)/100)),'accuracy',c.ship_accuracy),
    'crew_morale',m.morale,'morale_multiplier',private.morale_multiplier(m.morale,{{gameplay.morale.statBonusBps}}),
    'crew', jsonb_build_object(
      'attack',trim_scale(c.crew_attack*private.morale_multiplier(m.morale,{{gameplay.morale.statBonusBps}})),
      'defense',trim_scale(c.crew_defense*private.morale_multiplier(m.morale,{{gameplay.morale.statBonusBps}})),
      'speed',trim_scale(c.crew_speed*private.morale_multiplier(m.morale,{{gameplay.morale.statBonusBps}})),
      'accuracy',trim_scale(c.crew_accuracy*private.morale_multiplier(m.morale,{{gameplay.morale.statBonusBps}})))
  ) from private.morale_snapshot(c.crew_morale,c.morale_updated_at,observed_at) m
  cross join lateral (select e.loadout,private.ship_health_max(c.id) ship_max,private.crew_health_max(c.id) crew_max
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
    'crew_health_max',coalesce(snapshot->'crew_health_max',to_jsonb({{gameplay.resources.healthMax}})),
    'ammo',case when own then snapshot->'ammo' end,
    'shots',case when own then coalesce(snapshot->'shots','0'::jsonb) end,
    'temporary_uses',case when own then coalesce(snapshot->'temporary_uses','0'::jsonb) end,
    'shot_stock',case when own then coalesce(snapshot->'shot_stock','{"chain":0,"grape":0}'::jsonb) end,
    'ship',case when own then snapshot->'ship' end,
    'crew',case when own then snapshot->'crew' end,
    'crew_morale',case when own then snapshot->'crew_morale' end,
    'morale_multiplier',case when own then snapshot->'morale_multiplier' end,
    'effects',case when own or revealed then coalesce(snapshot->'effects','{}'::jsonb) end,
    'loadout',case when own then coalesce(snapshot->'loadout','{}'::jsonb)
      when revealed then (select coalesce(jsonb_object_agg(key,jsonb_build_object('name',value->'name')),'{}'::jsonb)
        from jsonb_each(coalesce(snapshot->'loadout','{}'::jsonb))) end);
$$;

-- Defender effects belong to one attacker pair and are merged from that pair's participant row.
create or replace function private.combat_view(battle_id uuid, viewer_id uuid)
returns jsonb language sql stable security invoker set search_path = ''
as $$
  select jsonb_build_object('id',b.id,'status',b.status,'phase',p.phase,'round',p.round,
    'outcome',b.state->'outcome','winner_id',b.state->'winner_id','participant_status',p.status,
    'attacker',private.visible_combatant(p.snapshot,p.character_id=viewer_id,true),
    'defender',private.visible_combatant(b.state->'defender'||jsonb_build_object('effects',p.defender_effects),b.defender_id=viewer_id,true),
    'viewer_id',viewer_id,'started_at',b.started_at,'deadline',p.deadline,'finished_at',b.finished_at,
    'observed_at',clock_timestamp(),'people',private.combat_people(b.id),
    'events',coalesce((select jsonb_agg(event order by round) from private.combat_rounds where combat_id=b.id),'[]'::jsonb))
  from private.combats b join private.combat_participants p on p.combat_id=b.id
    and p.character_id=case when viewer_id=b.defender_id then b.attacker_id else viewer_id end
  where b.id=battle_id;
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

-- One strike: hit roll with the stat group, then a zone from zone_group with that zone's armor.
drop function if exists private.combat_strike(jsonb,jsonb,text,jsonb,double precision,double precision);
create or replace function private.combat_strike(striker jsonb, target jsonb, group_name text, weapon jsonb, hit_roll double precision, zone_roll double precision,
  zone_group text default null, forced_zone text default null, zone_multiplier numeric default null, damage_scale numeric default 1)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare chance double precision; struck record; damage integer; hit_group text:=coalesce(zone_group,group_name);
begin
  chance:=private.combat_precision_chance(private.combat_hit_chance((striker->group_name->>'accuracy')::numeric,(target->group_name->>'speed')::numeric),
    (weapon->>'precision')::numeric);
  if hit_roll>=chance then return jsonb_build_object('hit',false,'damage',0,'weapon',weapon->>'name','target',hit_group); end if;
  if forced_zone is null then select * into struck from private.combat_zone(hit_group,zone_roll);
  else
    select z.zone,z.multiplier,z.armor_slot,z.critical into struck from (values {{equipment.zonesSql}}) z(zone_group,position,zone,weight,multiplier,armor_slot,critical)
      where z.zone_group=hit_group and z.zone=forced_zone;
  end if;
  -- Effect-only items land on the target as a whole, not on one zone.
  if weapon->>'damage' is null then return jsonb_build_object('hit',true,'damage',0,'weapon',weapon->>'name','target',hit_group); end if;
  damage:=least((target->>(hit_group||'_health'))::integer,private.combat_damage((striker->group_name->>'attack')::numeric,
    (target->group_name->>'defense')::numeric,(weapon->>'damage')::numeric*damage_scale,coalesce(zone_multiplier,struck.multiplier),
    coalesce((target->'loadout'->struck.armor_slot->>'armor')::numeric,0)));
  return jsonb_build_object('hit',true,'damage',damage,'weapon',weapon->>'name','target',hit_group,'zone',struck.zone,'critical',struck.critical);
end;
$$;

-- Active effects weaken a side's stats while their rounds last.
create or replace function private.combat_with_effects(side jsonb)
returns jsonb language sql stable security invoker set search_path='' as $$
  select side||jsonb_build_object(
    'crew',side->'crew'||case when coalesce((side#>>'{effects,crew_accuracy,rounds}')::integer,0)>0
      then jsonb_build_object('accuracy',(side#>>'{crew,accuracy}')::numeric*(side#>>'{effects,crew_accuracy,multiplier}')::numeric) else '{}'::jsonb end,
    'ship',side->'ship'||case when coalesce((side#>>'{effects,ship_speed,rounds}')::integer,0)>0
      then jsonb_build_object('speed',(side#>>'{ship,speed}')::numeric*(side#>>'{effects,ship_speed,multiplier}')::numeric) else '{}'::jsonb end);
$$;

-- Counts down effects that were active before this round.
create or replace function private.combat_tick_effects(effects jsonb)
returns jsonb language sql immutable security invoker set search_path='' as $$
  select coalesce(jsonb_object_agg(key,value||jsonb_build_object('rounds',(value->>'rounds')::integer-1))
    filter (where (value->>'rounds')::integer>1),'{}'::jsonb) from jsonb_each(coalesce(effects,'{}'::jsonb));
$$;

-- Resolves one side's attacking order. Effects are returned for the caller to apply to the target.
create or replace function private.combat_action(striker jsonb, target jsonb, action text, hit_roll double precision, zone_roll double precision)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare strike jsonb; item jsonb;
begin
  case action
  when 'fire' then return private.combat_strike(striker,target,'ship',private.combat_weapon(striker,'cannons'),hit_roll,zone_roll);
  when 'fire_chain' then
    strike:=private.combat_strike(striker,target,'ship',private.combat_weapon(striker,'cannons'),hit_roll,zone_roll,'ship',
      {{gameplay.equipment.shotTypes.chain.zone}},{{gameplay.equipment.shotTypes.chain.multiplier}});
    return strike||jsonb_build_object('shot','chain')||case when (strike->>'hit')::boolean then jsonb_build_object('effect','ship_speed',
      'effect_value',jsonb_build_object('multiplier',{{gameplay.equipment.shotTypes.chain.speedMultiplier}},'rounds',{{gameplay.equipment.shotTypes.chain.rounds}})) else '{}'::jsonb end;
  when 'fire_grape' then
    return private.combat_strike(striker,target,'ship',private.combat_weapon(striker,'cannons'),hit_roll,zone_roll,'crew',null,null,
      {{gameplay.equipment.shotTypes.grape.crewMultiplier}})||jsonb_build_object('shot','grape');
  when 'crew_shoot' then return private.combat_strike(striker,target,'crew',private.combat_weapon(striker,'firearm'),hit_roll,zone_roll);
  when 'crew_attack' then return private.combat_strike(striker,target,'crew',private.combat_weapon(striker,'melee'),hit_roll,zone_roll);
  when 'crew_throw' then
    item:=striker->'loadout'->'temporary';
    strike:=private.combat_strike(striker,target,'crew',jsonb_build_object('name',item->'name','damage',item->'damage','precision',item->'precision'),hit_roll,zone_roll);
    return strike||jsonb_build_object('temporary',item->>'item_id')||case when (strike->>'hit')::boolean and item ? 'debuff_multiplier' then
      jsonb_build_object('effect','crew_accuracy','effect_value',jsonb_build_object('multiplier',item->'debuff_multiplier','rounds',item->'debuff_rounds')) else '{}'::jsonb end;
  else return jsonb_build_object('hit',false,'damage',0);
  end case;
end;
$$;

-- Every attacking order trains the battling skill of its phase, hit or miss.
create or replace function private.combat_order_skill(combat_order text)
returns text language sql immutable strict security invoker set search_path='' as $$
  select case when combat_order in ('fire','fire_chain','fire_grape') then 'ship_battling'
    when combat_order in ('crew_shoot','crew_throw','crew_attack') then 'crew_battling' end;
$$;

revoke all on function private.combat_precision_chance(double precision,numeric),private.combat_damage(numeric,numeric,numeric,numeric,numeric),
  private.combat_zone(text,double precision),private.combat_weapon(jsonb,text),
  private.combat_strike(jsonb,jsonb,text,jsonb,double precision,double precision,text,text,numeric,numeric),
  private.combat_with_effects(jsonb),private.combat_tick_effects(jsonb),
  private.combat_action(jsonb,jsonb,text,double precision,double precision),private.combat_order_skill(text) from public,anon,authenticated;

create or replace function private.resolve_combat_round(input_state jsonb, player_order text, rolls double precision[])
returns jsonb language plpgsql stable security invoker set search_path = ''
as $$
declare
  a jsonb := input_state->'attacker';
  d jsonb := input_state->'defender';
  ae jsonb; de jsonb;
  phase text := input_state->>'phase';
  defender_order text;
  next_phase text := phase;
  round_no integer := (input_state->>'round')::integer + 1;
  a_strike jsonb := '{"hit":false,"damage":0}'::jsonb;
  d_strike jsonb := '{"hit":false,"damage":0}'::jsonb;
  attacking constant text[] := array['fire','fire_chain','fire_grape','crew_shoot','crew_throw','crew_attack'];
  chance double precision;
  a_down boolean; d_down boolean;
  outcome text; winner text; transition text;
  boarded boolean;
  result_state jsonb;
begin
  if input_state->>'status' <> 'active' or round_no > {{gameplay.combat.maxRounds}} then raise exception 'COMBAT_FINISHED'; end if;
  if player_order is null or
    (phase = 'sea' and player_order not in ('fire', 'fire_chain', 'fire_grape', 'board', 'retreat')) or
    (phase = 'boarding' and player_order not in ('crew_shoot', 'crew_throw', 'crew_attack', 'disengage', 'retreat')) then
    raise exception 'INVALID_ORDER' using errcode = '22023';
  end if;
  -- Rolls: attacker hit, defender hit, boarding, attacker zone, defender zone.
  if cardinality(rolls) <> 5 or exists(select 1 from unnest(rolls) r where r is null or r < 0 or r >= 1) then
    raise exception 'INVALID_ROLLS';
  end if;
  -- The offline defender throws its temporary first, then shoots, then fights hand to hand.
  defender_order := case when phase = 'boarding' then
      case when d->'loadout'->'temporary' is not null and coalesce((d->>'temporary_uses')::integer, 0) >= 1 then 'crew_throw'
        when d->'loadout'->'firearm' is not null and coalesce((d->>'shots')::integer, 0) >= 1 then 'crew_shoot' else 'crew_attack' end
    when d->>'defence_order' = 'cannon' and (d->>'ammo')::integer >= {{gameplay.combat.ammoPerShot}} then 'fire' else 'board' end;
  if player_order like 'fire%' and (a->>'ammo')::integer < {{gameplay.combat.ammoPerShot}} then raise exception 'NO_AMMO'; end if;
  if player_order in ('fire_chain', 'fire_grape') and coalesce((a->'shot_stock'->>substr(player_order, 6))::integer, 0) < 1 then raise exception 'NO_SHOT_STOCK'; end if;
  if player_order = 'crew_shoot' and (a->'loadout'->'firearm' is null or coalesce((a->>'shots')::integer, 0) < 1) then raise exception 'NO_SHOTS'; end if;
  if player_order = 'crew_throw' and (a->'loadout'->'temporary' is null or coalesce((a->>'temporary_uses')::integer, 0) < 1) then raise exception 'NO_TEMPORARY'; end if;
  ae := private.combat_with_effects(a); de := private.combat_with_effects(d);
  if player_order = any(attacking) then a_strike := private.combat_action(ae, de, player_order, rolls[1], rolls[4]); end if;
  if defender_order = any(attacking) then d_strike := private.combat_action(de, ae, defender_order, rolls[2], rolls[5]); end if;
  a := a || jsonb_build_object('effects', private.combat_tick_effects(a->'effects'));
  d := d || jsonb_build_object('effects', private.combat_tick_effects(d->'effects'));
  if a_strike ? 'effect' then d := jsonb_set(d, array['effects', a_strike->>'effect'], a_strike->'effect_value'); end if;
  if d_strike ? 'effect' then a := jsonb_set(a, array['effects', d_strike->>'effect'], d_strike->'effect_value'); end if;
  if (d_strike->>'damage')::integer > 0 then a := a || jsonb_build_object(d_strike->>'target' || '_health', (a->>(d_strike->>'target' || '_health'))::integer - (d_strike->>'damage')::integer); end if;
  if (a_strike->>'damage')::integer > 0 then d := d || jsonb_build_object(a_strike->>'target' || '_health', (d->>(a_strike->>'target' || '_health'))::integer - (a_strike->>'damage')::integer); end if;
  a := a || jsonb_build_object(
    'ammo', (a->>'ammo')::integer - case when player_order like 'fire%' then {{gameplay.combat.ammoPerShot}} else 0 end,
    'shots', coalesce((a->>'shots')::integer, 0) - case when player_order = 'crew_shoot' then 1 else 0 end,
    'temporary_uses', coalesce((a->>'temporary_uses')::integer, 0) - case when player_order = 'crew_throw' then 1 else 0 end,
    'shot_stock', coalesce(a->'shot_stock', '{"chain":0,"grape":0}'::jsonb) || case when player_order in ('fire_chain', 'fire_grape') then
      jsonb_build_object(substr(player_order, 6), (a->'shot_stock'->>substr(player_order, 6))::integer - 1) else '{}'::jsonb end);
  d := d || jsonb_build_object(
    'ammo', (d->>'ammo')::integer - case when defender_order = 'fire' then {{gameplay.combat.ammoPerShot}} else 0 end,
    'shots', coalesce((d->>'shots')::integer, 0) - case when defender_order = 'crew_shoot' then 1 else 0 end,
    'temporary_uses', coalesce((d->>'temporary_uses')::integer, 0) - case when defender_order = 'crew_throw' then 1 else 0 end);
  if (a->>'ship_health')::integer=0 then a:=a || jsonb_build_object('crew_health',0); end if;
  if (d->>'ship_health')::integer=0 then d:=d || jsonb_build_object('crew_health',0); end if;
  a_down := (a->>'ship_health')::integer = 0 or (a->>'crew_health')::integer = 0;
  d_down := (d->>'ship_health')::integer = 0 or (d->>'crew_health')::integer = 0;
  if a_down and d_down then outcome := 'draw';
  elsif a_down or d_down then
    outcome := case when ((case when a_down then a else d end)->>'ship_health')::integer = 0 then 'hull_victory' else 'boarding_victory' end;
    winner := case when a_down then d->>'id' else a->>'id' end;
  elsif player_order = 'retreat' then outcome := 'retreated';
  elsif round_no >= {{gameplay.combat.maxRounds}} then outcome := 'draw';
  elsif phase = 'boarding' and player_order = 'disengage' then
    next_phase := 'sea'; transition := 'disengaged';
  elsif phase = 'sea' and (player_order = 'board' or defender_order = 'board') then
    if player_order = 'board' and defender_order = 'board' then boarded := true;
    else
      chance := greatest({{gameplay.combat.boarding.minimumChance}}, least({{gameplay.combat.boarding.maximumChance}}, {{gameplay.combat.boarding.baseChance}} + {{gameplay.combat.boarding.speedInfluence}} *
        ((ae->'ship'->>'speed')::double precision - (de->'ship'->>'speed')::double precision) /
        ((ae->'ship'->>'speed')::double precision + (de->'ship'->>'speed')::double precision) *
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
    'attacker_target',a_strike->'target','defender_target',d_strike->'target',
    'attacker_effect',a_strike->'effect','defender_effect',d_strike->'effect',
    'attacker_consumed',coalesce(a_strike->'temporary',case a_strike->>'shot' when 'chain' then to_jsonb({{gameplay.equipment.shotTypes.chain.itemId}}::text)
      when 'grape' then to_jsonb({{gameplay.equipment.shotTypes.grape.itemId}}::text) end),
    'defender_consumed',d_strike->'temporary',
    'transition',transition,'outcome',outcome));
end;
$$;

create or replace function private.advance_shared_combat(battle_id uuid, actor uuid, player_order text, request_id uuid, occurred_at timestamptz, timed_out boolean)
returns void language plpgsql volatile security invoker set search_path='' as $$
declare b private.combats%rowtype; p private.combat_participants%rowtype;
  resolved jsonb; s jsonb; d jsonb; a jsonb; personal_status text; ending text; winner uuid; consumed record; trained record;
begin
  select * into b from private.combats where id=battle_id for update;
  select * into p from private.combat_participants where combat_id=battle_id and character_id=actor;
  if b.status<>'active' or p.status<>'active' then return; end if;
  -- The defender's live stack bounds its temporary uses, since several attackers draw from the same stack.
  resolved:=private.resolve_combat_round(jsonb_build_object('status','active','phase',p.phase,'round',p.round,
    'attacker',p.snapshot,'defender',b.state->'defender' || jsonb_build_object('ammo',p.defender_ammo,'shots',p.defender_shots,
      'effects',p.defender_effects,'temporary_uses',least(p.defender_temporary_uses,
        private.stack_quantity(b.defender_id,b.state#>>'{defender,loadout,temporary,item_id}')))),
    player_order,array[private.combat_roll(),private.combat_roll(),private.combat_roll(),private.combat_roll(),private.combat_roll()]);
  s:=resolved->'state'; a:=s->'attacker'; d:=s->'defender';
  -- Item order keeps circulation locks consistent with other multi-item transactions.
  for consumed in select * from (values(actor,resolved#>>'{event,attacker_consumed}',true),(b.defender_id,resolved#>>'{event,defender_consumed}',false))
    v(owner_id,item_id,required) where v.item_id is not null order by v.item_id,v.owner_id
  loop
    if not private.consume_stack(consumed.owner_id,consumed.item_id) and consumed.required then raise exception 'ITEM_NOT_FOUND' using errcode='P0001'; end if;
  end loop;
  -- The defender's automatic reply trains like any other attack. Both captains are already locked.
  for trained in select * from (values(actor,private.combat_order_skill(resolved#>>'{event,attacker_order}')),
    (b.defender_id,private.combat_order_skill(resolved#>>'{event,defender_order}'))) v(captain_id,skill_id)
    where v.skill_id is not null order by v.captain_id
  loop
    perform private.award_skill_xp(trained.captain_id,trained.skill_id,{{gameplay.combat.xpGain}});
  end loop;
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
    status=personal_status,defender_ammo=(d->>'ammo')::integer,defender_shots=(d->>'shots')::integer,defender_effects=d->'effects',
    defender_temporary_uses=defender_temporary_uses-case when resolved#>>'{event,defender_consumed}' is not null then 1 else 0 end,
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
  update private.combats set state=state || jsonb_build_object('defender',d-'effects','status',case when ending is null then 'active' else 'completed' end,
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
  insert into private.combat_participants(combat_id,character_id,start_request_id,snapshot,joined_at,deadline,defender_shots,defender_temporary_uses)
    values(battle_id,viewer_id,request_id,snapshot,observed_at,least(b.hard_deadline,observed_at+make_interval(secs => {{gameplay.combat.idleSeconds}})),
      coalesce((b.state->'defender'->'loadout'->'firearm'->>'shots')::integer,0),
      case when b.state->'defender'->'loadout'->'temporary' is null then 0 else {{gameplay.equipment.temporaryUsesPerFight}} end);
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
  if player_order is null or (p.phase='sea' and player_order not in ('fire','fire_chain','fire_grape','board','retreat'))
    or (p.phase='boarding' and player_order not in ('crew_shoot','crew_throw','crew_attack','disengage','retreat')) then return jsonb_build_object('error','INVALID_ORDER'); end if;
  if player_order like 'fire%' and (p.snapshot->>'ammo')::integer<{{gameplay.combat.ammoPerShot}} then return jsonb_build_object('error','NO_AMMO'); end if;
  if player_order in ('fire_chain','fire_grape') and (coalesce((p.snapshot->'shot_stock'->>substr(player_order,6))::integer,0)<1
    or private.stack_quantity(viewer_id,case player_order when 'fire_chain' then {{gameplay.equipment.shotTypes.chain.itemId}} else {{gameplay.equipment.shotTypes.grape.itemId}} end)<1) then
    return jsonb_build_object('error','NO_SHOT_STOCK'); end if;
  if player_order='crew_throw' and (p.snapshot->'loadout'->'temporary' is null or coalesce((p.snapshot->>'temporary_uses')::integer,0)<1
    or private.stack_quantity(viewer_id,p.snapshot#>>'{loadout,temporary,item_id}')<1) then return jsonb_build_object('error','NO_TEMPORARY'); end if;
  if player_order='crew_shoot' and (p.snapshot->'loadout'->'firearm' is null or coalesce((p.snapshot->>'shots')::integer,0)<1) then
    return jsonb_build_object('error','NO_SHOTS'); end if;
  perform private.advance_shared_combat(battle_id,viewer_id,player_order,request_id,clock_timestamp(),false);
  perform private.record_character_action(viewer_id);
  return jsonb_build_object('battle',private.combat_view(battle_id,viewer_id));
end;
$$;

