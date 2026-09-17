-- Persistent, server-authoritative PvP. Internal tables never enter the Data API.
alter table public.characters
  add column defence_order text not null default 'cannon' check (defence_order in ('cannon', 'boarding')),
  add column ship_recovery_at timestamptz not null default now(),
  add column crew_recovery_at timestamptz not null default now(),
  add column protected_until timestamptz;

create table private.combats (
  id uuid primary key default gen_random_uuid(),
  attacker_id uuid not null references public.characters(id) on delete cascade,
  defender_id uuid not null references public.characters(id) on delete cascade,
  start_request_id uuid not null,
  rules_version integer not null default 1,
  state jsonb not null,
  status text generated always as (state->>'status') stored,
  started_at timestamptz not null,
  deadline timestamptz not null,
  hard_deadline timestamptz not null,
  finished_at timestamptz,
  unique (attacker_id, start_request_id),
  check (attacker_id <> defender_id),
  check (status in ('active', 'completed'))
);
create index combats_attacker_history on private.combats(attacker_id, started_at desc);
create index combats_defender_history on private.combats(defender_id, started_at desc);
create table private.combat_engagements (
  character_id uuid primary key references public.characters(id) on delete cascade,
  combat_id uuid not null references private.combats(id) on delete cascade
);
create index combat_engagements_battle on private.combat_engagements(combat_id);
create table private.combat_rounds (
  combat_id uuid not null references private.combats(id) on delete cascade,
  round integer not null check (round between 1 and 25),
  request_id uuid not null,
  event jsonb not null,
  primary key (combat_id, round),
  unique (combat_id, request_id)
);
alter table private.combats enable row level security;
alter table private.combat_engagements enable row level security;
alter table private.combat_rounds enable row level security;
revoke all on private.combats, private.combat_engagements, private.combat_rounds from public, anon, authenticated;

create function private.health_snapshot(value integer, anchor timestamptz, observed_at timestamptz, seconds integer)
returns integer language sql immutable strict security invoker set search_path = ''
as $$
  select least(100, value + least(100, greatest(0, floor(extract(epoch from (observed_at - anchor)) / seconds)))::integer);
$$;

create function private.combat_captain()
returns uuid language plpgsql stable security invoker set search_path = ''
as $$
declare captain_id uuid;
begin
  if auth.uid() is null or not private.is_registered_player() then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  select id into captain_id from public.characters where user_id = auth.uid();
  if captain_id is null then raise exception 'CHARACTER_NOT_FOUND' using errcode = 'P0002'; end if;
  return captain_id;
end;
$$;

create function private.combat_roll()
returns double precision language sql volatile security invoker set search_path = ''
as $$
  select (get_byte(bytes,0)::bigint * 16777216 + get_byte(bytes,1)::bigint * 65536
    + get_byte(bytes,2)::bigint * 256 + get_byte(bytes,3))::double precision / 4294967296
  from (select extensions.gen_random_bytes(4) as bytes) r;
$$;

create function private.combat_snapshot(c public.characters, observed_at timestamptz)
returns jsonb language sql stable security invoker set search_path = ''
as $$
  select jsonb_build_object(
    'id', c.id, 'name', c.display_name, 'ammo', 10, 'defence_order', c.defence_order,
    'ship_health', private.health_snapshot(c.ship_health, c.ship_recovery_at, observed_at, 30),
    'crew_health', private.health_snapshot(c.crew_health, c.crew_recovery_at, observed_at, 10),
    'ship', jsonb_build_object('attack',c.ship_attack,'defense',c.ship_defense,'speed',c.ship_speed,'accuracy',c.ship_accuracy),
    'crew', jsonb_build_object('attack',c.crew_attack,'defense',c.crew_defense,'speed',c.crew_speed,'accuracy',c.crew_accuracy)
  );
$$;

-- A pure resolver lets tests supply rolls without exposing that ability to players.
create function private.resolve_combat_round(input_state jsonb, player_order text, rolls double precision[])
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
    chance := greatest(0.50, least(0.95, 0.75 + 0.25 *
      ((a->group_name->>'accuracy')::double precision - (d->group_name->>'speed')::double precision) /
      ((a->group_name->>'accuracy')::double precision + (d->group_name->>'speed')::double precision)));
    a_hit := rolls[1] < chance;
    if a_hit then a_damage := least((d->>health_key)::integer, greatest(1, least(40,
      round(16 * sqrt((a->group_name->>'attack')::double precision / (d->group_name->>'defense')::double precision))::integer))); end if;
  end if;
  if defender_order in ('fire', 'crew_attack') then
    chance := greatest(0.50, least(0.95, 0.75 + 0.25 *
      ((d->group_name->>'accuracy')::double precision - (a->group_name->>'speed')::double precision) /
      ((d->group_name->>'accuracy')::double precision + (a->group_name->>'speed')::double precision)));
    d_hit := rolls[2] < chance;
    if d_hit then d_damage := least((a->>health_key)::integer, greatest(1, least(40,
      round(16 * sqrt((d->group_name->>'attack')::double precision / (a->group_name->>'defense')::double precision))::integer))); end if;
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

-- Try-lock the complete participant set; a changed engagement graph is retried.
create function private.lock_combat_context(captain_ids uuid[])
returns void language plpgsql volatile security invoker set search_path = ''
as $$
declare lock_ids uuid[]; captain_id uuid;
begin
  select array_agg(distinct id order by id) into lock_ids from (
    select unnest(captain_ids) as id
    union select b.attacker_id from private.combats b join private.combat_engagements e on e.combat_id=b.id where e.character_id=any(captain_ids)
    union select b.defender_id from private.combats b join private.combat_engagements e on e.combat_id=b.id where e.character_id=any(captain_ids)
  ) ids where id is not null;
  foreach captain_id in array lock_ids loop
    if not pg_try_advisory_xact_lock(hashtextextended(captain_id::text, 71829)) then
      raise exception 'COMBAT_BUSY' using errcode = '40001';
    end if;
  end loop;
  if exists(select 1 from private.combat_engagements e join private.combats b on b.id=e.combat_id
    where e.character_id=any(captain_ids) and (not b.attacker_id=any(lock_ids) or not b.defender_id=any(lock_ids))) then
    raise exception 'COMBAT_BUSY' using errcode = '40001';
  end if;
  perform id from public.characters where id=any(lock_ids) order by id for update;
end;
$$;

create function private.advance_combat(battle_id uuid, player_order text, request_id uuid, occurred_at timestamptz, timed_out boolean)
returns void language plpgsql volatile security invoker set search_path = ''
as $$
declare battle private.combats%rowtype; resolved jsonb; next_state jsonb; side jsonb;
begin
  select * into battle from private.combats where id=battle_id for update;
  if battle.status <> 'active' then return; end if;
  resolved := private.resolve_combat_round(battle.state, player_order,
    array[private.combat_roll(), private.combat_roll(), private.combat_roll()]);
  next_state := resolved->'state';
  insert into private.combat_rounds(combat_id,round,request_id,event)
    values(battle_id,(next_state->>'round')::integer,request_id,
      (resolved->'event') || jsonb_build_object('at',occurred_at,'timed_out',timed_out));
  update private.combats set state=next_state,
    deadline=least(hard_deadline, occurred_at + interval '2 minutes'),
    finished_at=case when next_state->>'status'='completed' then occurred_at end
    where id=battle_id;
  foreach side in array array[next_state->'attacker', next_state->'defender'] loop
    update public.characters set ship_health=(side->>'ship_health')::integer,
      crew_health=(side->>'crew_health')::integer,
      ship_recovery_at=occurred_at, crew_recovery_at=occurred_at,
      protected_until=case when next_state->>'status'='completed' then occurred_at + interval '5 minutes' else null end
      where id=(side->>'id')::uuid;
  end loop;
  if next_state->>'status'='completed' then delete from private.combat_engagements where combat_id=battle_id; end if;
end;
$$;

create function private.settle_combat_context(captain_ids uuid[])
returns void language plpgsql volatile security invoker set search_path = ''
as $$
declare battle record;
begin
  perform private.lock_combat_context(captain_ids);
  for battle in select distinct b.id,b.deadline from private.combats b
    join private.combat_engagements e on e.combat_id=b.id
    where e.character_id=any(captain_ids) and b.deadline <= clock_timestamp()
    order by b.id
  loop
    perform private.advance_combat(battle.id,'retreat',gen_random_uuid(),battle.deadline,true);
  end loop;
end;
$$;

create function private.visible_combatant(snapshot jsonb, own boolean, revealed boolean)
returns jsonb language sql immutable security invoker set search_path = ''
as $$
  select jsonb_build_object(
    'id',snapshot->'id','name',snapshot->'name',
    'ship_health',snapshot->'ship_health','crew_health',snapshot->'crew_health',
    'ammo',case when own then snapshot->'ammo' end,
    'ship',case when own then snapshot->'ship' end,
    'crew',case when own then snapshot->'crew' end,
    'cannons',case when own or revealed then 'Basic cannons' end,
    'weapon',case when own or revealed then 'Cutlasses' end);
$$;

create function private.combat_view(battle_id uuid, viewer_id uuid)
returns jsonb language sql stable security invoker set search_path = ''
as $$
  select jsonb_build_object('id',b.id,'status',b.status,'phase',b.state->'phase',
    'round',b.state->'round','outcome',b.state->'outcome','winner_id',b.state->'winner_id',
    'attacker',private.visible_combatant(b.state->'attacker',b.attacker_id=viewer_id,true),
    'defender',private.visible_combatant(b.state->'defender',b.defender_id=viewer_id,true),
    'viewer_id',viewer_id,'started_at',b.started_at,'deadline',b.deadline,'finished_at',b.finished_at,
    'observed_at',clock_timestamp(),
    'events',coalesce((select jsonb_agg(r.event order by r.round) from private.combat_rounds r where r.combat_id=b.id),'[]'::jsonb))
  from private.combats b where b.id=battle_id and viewer_id in (b.attacker_id,b.defender_id);
$$;

create function private.get_combat_preview(target_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare viewer_id uuid := private.combat_captain(); a public.characters%rowtype; d public.characters%rowtype;
  a_snapshot jsonb; d_snapshot jsonb; energy_now integer; reason text; active_id uuid; observed_at timestamptz;
begin
  if target_id is null then return jsonb_build_object('error','CHARACTER_NOT_FOUND'); end if;
  perform private.settle_combat_context(array[viewer_id,target_id]);
  observed_at := clock_timestamp();
  select * into a from public.characters where id=viewer_id;
  select * into d from public.characters where id=target_id;
  if d.id is null then return jsonb_build_object('error','CHARACTER_NOT_FOUND'); end if;
  a_snapshot := private.combat_snapshot(a,observed_at);
  d_snapshot := private.combat_snapshot(d,observed_at);
  select combat_id into active_id from private.combat_engagements where character_id=viewer_id;
  if active_id is not null then
    a_snapshot := a_snapshot || jsonb_build_object('ship_health',a.ship_health,'crew_health',a.crew_health);
  end if;
  if exists(select 1 from private.combat_engagements where character_id=target_id) then
    d_snapshot := d_snapshot || jsonb_build_object('ship_health',d.ship_health,'crew_health',d.crew_health);
  end if;
  select energy into energy_now from private.energy_snapshot(a.energy,a.energy_updated_at,observed_at);
  reason := case
    when viewer_id=target_id then 'SELF_ATTACK'
    when active_id is not null then 'IN_COMBAT'
    when exists(select 1 from private.combat_engagements where character_id=target_id) then 'TARGET_IN_COMBAT'
    when d.protected_until > observed_at then 'TARGET_PROTECTED'
    when (a_snapshot->>'ship_health')::integer=0 or (a_snapshot->>'crew_health')::integer=0 then 'NO_HEALTH'
    when (d_snapshot->>'ship_health')::integer=0 or (d_snapshot->>'crew_health')::integer=0 then 'TARGET_NO_HEALTH'
    when energy_now < 10 then 'NOT_ENOUGH_ENERGY' end;
  return jsonb_build_object('attacker',private.visible_combatant(a_snapshot,true,false),
    'defender',private.visible_combatant(d_snapshot,false,false),'energy',energy_now,
    'can_start',reason is null,'reason',reason,'active_combat_id',active_id,
    'target_protected_until',case when d.protected_until>observed_at then d.protected_until end,
    'observed_at',observed_at);
end;
$$;

create function private.start_combat(target_id uuid, request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare viewer_id uuid := private.combat_captain(); previous private.combats%rowtype;
  preview jsonb; a public.characters%rowtype; d public.characters%rowtype; recovered record;
  battle_id uuid; initial_state jsonb; observed_at timestamptz;
begin
  if request_id is null then raise exception 'INVALID_REQUEST' using errcode='22023'; end if;
  perform private.settle_combat_context(array[viewer_id,target_id]);
  select * into previous from private.combats where attacker_id=viewer_id and start_request_id=request_id;
  if found then
    if previous.defender_id<>target_id then return jsonb_build_object('error','REQUEST_CONFLICT'); end if;
    return jsonb_build_object('battle',private.combat_view(previous.id,viewer_id));
  end if;
  preview := private.get_combat_preview(target_id);
  if preview ? 'error' then return preview; end if;
  if not (preview->>'can_start')::boolean then return jsonb_build_object('error',preview->>'reason'); end if;
  observed_at := clock_timestamp();
  select * into a from public.characters where id=viewer_id;
  select * into d from public.characters where id=target_id;
  select * into recovered from private.energy_snapshot(a.energy,a.energy_updated_at,observed_at);
  initial_state := jsonb_build_object('attacker',private.combat_snapshot(a,observed_at),
    'defender',private.combat_snapshot(d,observed_at),'phase','sea','round',0,'status','active',
    'outcome',null,'winner_id',null);
  insert into private.combats(attacker_id,defender_id,start_request_id,state,started_at,deadline,hard_deadline)
    values(viewer_id,target_id,request_id,initial_state,observed_at,observed_at+interval '2 minutes',observed_at+interval '10 minutes')
    returning id into battle_id;
  insert into private.combat_engagements(character_id,combat_id) values(viewer_id,battle_id),(target_id,battle_id);
  update public.characters set energy=recovered.energy-10,energy_updated_at=recovered.energy_updated_at,
    protected_until=null,ship_health=(initial_state->'attacker'->>'ship_health')::integer,
    crew_health=(initial_state->'attacker'->>'crew_health')::integer,
    ship_recovery_at=observed_at,crew_recovery_at=observed_at where id=viewer_id;
  update public.characters set protected_until=null,
    ship_health=(initial_state->'defender'->>'ship_health')::integer,
    crew_health=(initial_state->'defender'->>'crew_health')::integer,
    ship_recovery_at=observed_at,crew_recovery_at=observed_at where id=target_id;
  return jsonb_build_object('battle',private.combat_view(battle_id,viewer_id));
end;
$$;

create function private.get_combat(battle_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare viewer_id uuid := private.combat_captain(); battle private.combats%rowtype;
begin
  select * into battle from private.combats where id=battle_id and viewer_id in (attacker_id,defender_id);
  if not found then return null; end if;
  if battle.status='active' and battle.deadline <= clock_timestamp() then
    perform private.settle_combat_context(array[viewer_id]);
  end if;
  return private.combat_view(battle_id,viewer_id);
end;
$$;

create function private.submit_combat_order(battle_id uuid, expected_round integer, player_order text, request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare viewer_id uuid := private.combat_captain(); battle private.combats%rowtype; previous private.combat_rounds%rowtype;
begin
  if request_id is null or expected_round is null or expected_round<0 or expected_round>=25 then
    raise exception 'INVALID_REQUEST' using errcode='22023';
  end if;
  select * into battle from private.combats where id=battle_id and attacker_id=viewer_id;
  if not found then return jsonb_build_object('error','COMBAT_NOT_FOUND'); end if;
  perform private.settle_combat_context(array[viewer_id,battle.defender_id]);
  select * into battle from private.combats where id=battle_id;
  select * into previous from private.combat_rounds where combat_id=battle_id and combat_rounds.request_id=submit_combat_order.request_id;
  if found then
    if previous.round<>expected_round+1 or previous.event->>'attacker_order'<>player_order then
      return jsonb_build_object('error','REQUEST_CONFLICT'); end if;
    return jsonb_build_object('battle',private.combat_view(battle_id,viewer_id));
  end if;
  if battle.status='completed' then return jsonb_build_object('battle',private.combat_view(battle_id,viewer_id)); end if;
  if (battle.state->>'round')::integer <> expected_round then return jsonb_build_object('error','STALE_ROUND'); end if;
  if player_order is null or
    (battle.state->>'phase'='sea' and player_order not in ('fire','board','retreat')) or
    (battle.state->>'phase'='boarding' and player_order not in ('crew_attack','disengage','retreat')) then
    return jsonb_build_object('error','INVALID_ORDER');
  end if;
  if player_order='fire' and (battle.state->'attacker'->>'ammo')::integer=0 then return jsonb_build_object('error','NO_AMMO'); end if;
  perform private.advance_combat(battle_id,player_order,request_id,clock_timestamp(),false);
  return jsonb_build_object('battle',private.combat_view(battle_id,viewer_id));
end;
$$;

create function private.save_defence_orders(preset text)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare viewer_id uuid := private.combat_captain();
begin
  if preset is null or preset not in ('cannon','boarding') then raise exception 'INVALID_PRESET' using errcode='22023'; end if;
  perform private.settle_combat_context(array[viewer_id]);
  update public.characters set defence_order=preset where id=viewer_id;
  return jsonb_build_object('preset',preset);
end;
$$;

create function private.get_game_state()
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare c public.characters%rowtype; active private.combats%rowtype; observed_at timestamptz;
  recovered record; ship_hp integer; crew_hp integer; health_next_at timestamptz; last_id uuid;
begin
  if auth.uid() is null or not private.is_registered_player() then return null; end if;
  select * into c from public.characters where user_id=auth.uid();
  if not found then return null; end if;
  select b.* into active from private.combat_engagements e join private.combats b on b.id=e.combat_id where e.character_id=c.id;
  if active.id is not null and active.deadline<=clock_timestamp() then
    perform private.settle_combat_context(array[c.id]);
    select * into c from public.characters where id=c.id;
    active := null;
  end if;
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

create function public.get_combat_preview(target_id uuid)
returns jsonb language sql volatile security invoker set search_path=''
as $$ select private.get_combat_preview(target_id); $$;
create function public.start_combat(target_id uuid, request_id uuid)
returns jsonb language sql volatile security invoker set search_path=''
as $$ select private.start_combat(target_id,request_id); $$;
create function public.get_combat(battle_id uuid)
returns jsonb language sql volatile security invoker set search_path=''
as $$ select private.get_combat(battle_id); $$;
create function public.submit_combat_order(battle_id uuid, expected_round integer, player_order text, request_id uuid)
returns jsonb language sql volatile security invoker set search_path=''
as $$ select private.submit_combat_order(battle_id,expected_round,player_order,request_id); $$;
create function public.save_defence_orders(preset text)
returns jsonb language sql volatile security invoker set search_path=''
as $$ select private.save_defence_orders(preset); $$;
create or replace function public.get_game_state()
returns jsonb language sql volatile security invoker set search_path=''
as $$ select private.get_game_state(); $$;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='private' and p.proname=any(array['health_snapshot','combat_captain','combat_roll','combat_snapshot',
      'resolve_combat_round','lock_combat_context','advance_combat','settle_combat_context','visible_combatant','combat_view',
      'get_combat_preview','start_combat','get_combat','submit_combat_order','save_defence_orders','get_game_state'])
  loop execute format('revoke all on function %s from public, anon, authenticated',f.signature); end loop;
  for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','private') and p.proname=any(array[
      'get_combat_preview','start_combat','get_combat','submit_combat_order','save_defence_orders','get_game_state'])
  loop
    execute format('revoke all on function %s from public, anon',f.signature);
    execute format('grant execute on function %s to authenticated',f.signature);
  end loop;
end;
$$;

comment on table private.combats is 'Rules v1: two-party PvP snapshots and persistent state, disclosed through participant-only RPCs.';
comment on column public.characters.protected_until is 'Incoming PvP protection only. Starting an attack relinquishes protection.';


create or replace function private.train_stat(training_group text, stat text)
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
  perform private.settle_combat_context(array[private.combat_captain()]);
  if exists(select 1 from private.combat_engagements where character_id=private.combat_captain()) then
    raise exception 'IN_COMBAT';
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
