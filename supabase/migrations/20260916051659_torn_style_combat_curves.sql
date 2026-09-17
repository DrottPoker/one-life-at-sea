-- Torn-inspired stat curves, with full damage mitigation at 25x Defense.
-- Sources: wiki.torn.com/wiki/Battle_Stats and torn.com/forums.php?p=threads&t=16199413
create function private.combat_hit_chance(accuracy numeric, speed numeric)
returns double precision language plpgsql immutable strict security invoker set search_path='' as $$
declare ratio double precision;
begin
  if accuracy<=0 or speed<=0 then raise exception 'INVALID_COMBAT_STAT' using errcode='22023'; end if;
  ratio:=(accuracy/speed)::double precision;
  if ratio<=1.0/64 then return 0; end if;
  if ratio>=64 then return 1; end if;
  if ratio<=1 then return (8*sqrt(ratio)-1)/14; end if;
  return 1-(8*sqrt(1/ratio)-1)/14;
end;
$$;

create function private.combat_damage_reduction(attack numeric, defense numeric)
returns numeric language plpgsql immutable strict security invoker set search_path='' as $$
declare ratio numeric;
begin
  if attack<=0 or defense<=0 then raise exception 'INVALID_COMBAT_STAT' using errcode='22023'; end if;
  ratio:=defense/attack;
  if ratio<=1.0/32 then return 0; end if;
  if ratio>=25 then return 1; end if;
  if ratio<=1 then return 0.5+0.1*ln(ratio)/ln(2::numeric); end if;
  return 0.5+0.5*ln(ratio)/ln(25::numeric);
end;
$$;

create function private.combat_damage(attack numeric, defense numeric)
returns integer language plpgsql immutable strict security invoker set search_path='' as $$
declare reduction numeric; strength_log numeric;
begin
  reduction:=private.combat_damage_reduction(attack,defense);
  if reduction>=1 then return 0; end if;
  -- One game stat point represents ten Torn stat units; new captains hit for 15.
  strength_log:=log(attack);
  -- Keep integer rounding from fully blocking damage before 25x Defense.
  return greatest(1,round((7*strength_log*strength_log+27*strength_log+30)*(1-reduction)))::integer;
end;
$$;

revoke all on function private.combat_hit_chance(numeric,numeric) from public,anon,authenticated;
revoke all on function private.combat_damage_reduction(numeric,numeric) from public,anon,authenticated;
revoke all on function private.combat_damage(numeric,numeric) from public,anon,authenticated;


create or replace function private.resolve_combat_round(input_state jsonb, player_order text, rolls double precision[])
returns jsonb language plpgsql immutable security invoker set search_path = ''
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
  a_damage integer := 0; d_damage integer := 0;
  a_hit boolean := false; d_hit boolean := false;
  chance double precision;
  a_down boolean; d_down boolean;
  outcome text; winner text; transition text;
  boarded boolean;
  result_state jsonb;
begin
  if input_state->>'status' <> 'active' or round_no > 25 then raise exception 'COMBAT_FINISHED'; end if;
  if player_order is null or
    (phase = 'sea' and player_order not in ('fire', 'board', 'retreat')) or
    (phase = 'boarding' and player_order not in ('crew_attack', 'disengage', 'retreat')) then
    raise exception 'INVALID_ORDER' using errcode = '22023';
  end if;
  if cardinality(rolls) <> 3 or exists(select 1 from unnest(rolls) r where r is null or r < 0 or r >= 1) then
    raise exception 'INVALID_ROLLS';
  end if;
  defender_order := case when phase = 'boarding' then 'crew_attack'
    when d->>'defence_order' = 'cannon' and (d->>'ammo')::integer > 0 then 'fire' else 'board' end;
  if player_order = 'fire' and (a->>'ammo')::integer <= 0 then raise exception 'NO_AMMO'; end if;
  if player_order in ('fire', 'crew_attack') then
    chance := private.combat_hit_chance((a->group_name->>'accuracy')::numeric,(d->group_name->>'speed')::numeric);
    a_hit := rolls[1] < chance;
    if a_hit then a_damage := least((d->>health_key)::integer,
      private.combat_damage((a->group_name->>'attack')::numeric,(d->group_name->>'defense')::numeric)); end if;
  end if;
  if defender_order in ('fire', 'crew_attack') then
    chance := private.combat_hit_chance((d->group_name->>'accuracy')::numeric,(a->group_name->>'speed')::numeric);
    d_hit := rolls[2] < chance;
    if d_hit then d_damage := least((a->>health_key)::integer,
      private.combat_damage((d->group_name->>'attack')::numeric,(a->group_name->>'defense')::numeric)); end if;
  end if;
  a := a || jsonb_build_object(health_key, (a->>health_key)::integer - d_damage,
    'ammo', (a->>'ammo')::integer - case when player_order = 'fire' then 1 else 0 end);
  d := d || jsonb_build_object(health_key, (d->>health_key)::integer - a_damage,
    'ammo', (d->>'ammo')::integer - case when defender_order = 'fire' then 1 else 0 end);
  a_down := (a->>'ship_health')::integer = 0 or (a->>'crew_health')::integer = 0;
  d_down := (d->>'ship_health')::integer = 0 or (d->>'crew_health')::integer = 0;
  if a_down and d_down then outcome := 'draw';
  elsif a_down or d_down then
    outcome := case when phase = 'sea' then 'hull_victory' else 'boarding_victory' end;
    winner := case when a_down then d->>'id' else a->>'id' end;
  elsif player_order = 'retreat' then outcome := 'retreated';
  elsif round_no >= 25 then outcome := 'draw';
  elsif phase = 'boarding' and player_order = 'disengage' then
    next_phase := 'sea'; transition := 'disengaged';
  elsif phase = 'sea' and (player_order = 'board' or defender_order = 'board') then
    if player_order = 'board' and defender_order = 'board' then boarded := true;
    else
      chance := greatest(0.20, least(0.90, 0.70 + 0.30 *
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
    'attacker_hit',a_hit,'defender_hit',d_hit,'attacker_damage',a_damage,'defender_damage',d_damage,
    'transition',transition,'outcome',outcome));
end;
$$;
