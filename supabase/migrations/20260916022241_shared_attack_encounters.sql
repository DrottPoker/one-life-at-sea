-- Shared encounters: each attacker has independent orders against one defender.
alter table private.combat_engagements add column role text not null default 'attacker' check (role in ('attacker','defender'));
update private.combat_engagements e set role='defender' from private.combats b where e.combat_id=b.id and e.character_id=b.defender_id;

create table private.combat_participants (
  combat_id uuid not null references private.combats(id) on delete cascade,
  character_id uuid not null references public.characters(id) on delete cascade,
  start_request_id uuid not null,
  snapshot jsonb not null,
  phase text not null default 'sea' check (phase in ('sea','boarding')),
  round integer not null default 0 check (round between 0 and 25),
  status text not null default 'active' check (status in ('active','victory','assist','defeated','retreated','draw')),
  defender_ammo integer not null default 10 check (defender_ammo between 0 and 10),
  joined_at timestamptz not null,
  deadline timestamptz not null,
  finished_at timestamptz,
  hits integer not null default 0,
  damage integer not null default 0,
  primary key (combat_id,character_id),
  unique (character_id,start_request_id)
);
create unique index combat_participants_one_active on private.combat_participants(character_id) where status='active';
alter table private.combat_participants enable row level security;
revoke all on private.combat_participants from public,anon,authenticated;
insert into private.combat_participants(combat_id,character_id,start_request_id,snapshot,phase,round,status,defender_ammo,joined_at,deadline,finished_at,hits,damage)
select b.id,b.attacker_id,b.start_request_id,b.state->'attacker',b.state->>'phase',(b.state->>'round')::integer,
  case when b.status='active' then 'active' when b.state->>'winner_id'=b.attacker_id::text then 'victory'
    when b.state->>'outcome'='retreated' then 'retreated' when b.state->>'outcome'='draw' then 'draw' else 'defeated' end,
  (b.state->'defender'->>'ammo')::integer,b.started_at,b.deadline,b.finished_at,
  (select count(*) from private.combat_rounds r where r.combat_id=b.id and (r.event->>'attacker_hit')::boolean),
  coalesce((select sum((r.event->>'attacker_damage')::integer) from private.combat_rounds r where r.combat_id=b.id),0)
from private.combats b;

-- Round is now the encounter's event sequence. Local rounds live in the event.
alter table private.combat_rounds drop constraint combat_rounds_round_check;
alter table private.combat_rounds add constraint combat_rounds_sequence_positive check(round>0);
alter table private.combat_rounds add column actor_id uuid references public.characters(id) on delete cascade;
update private.combat_rounds r set actor_id=b.attacker_id,
  event=r.event || jsonb_build_object('kind','round','actor_id',b.attacker_id,'actor_name',b.state->'attacker'->>'name','sequence',r.round)
from private.combats b where b.id=r.combat_id;
alter table private.combat_rounds alter column actor_id set not null;
alter table private.combat_rounds drop constraint combat_rounds_combat_id_request_id_key;
alter table private.combat_rounds add unique(combat_id,actor_id,request_id);

-- Realtime carries invalidations only. All actual state still passes through RPCs.
create table public.player_game_events (
  character_id uuid primary key references public.characters(id) on delete cascade,
  revision bigint not null default 0
);
alter table public.player_game_events enable row level security;
revoke all on public.player_game_events from public,anon,authenticated;
grant select on public.player_game_events to authenticated;
create policy "Owners read their game notifications" on public.player_game_events for select to authenticated
using (character_id in (select id from public.characters where user_id=(select auth.uid())));
insert into public.player_game_events(character_id) select id from public.characters;
alter publication supabase_realtime add table public.player_game_events;

create function private.notify_combat(battle_id uuid)
returns void language sql volatile security invoker set search_path='' as $$
  insert into public.player_game_events(character_id,revision)
  select character_id,1 from private.combat_participants where combat_id=battle_id
  union select defender_id,1 from private.combats where id=battle_id
  on conflict(character_id) do update set revision=player_game_events.revision+1;
$$;

create or replace function private.lock_combat_context(captain_ids uuid[])
returns void language plpgsql volatile security invoker set search_path='' as $$
declare lock_ids uuid[]; captain_id uuid;
begin
  select array_agg(distinct id order by id) into lock_ids from (
    select unnest(captain_ids) id
    union select peer.character_id from private.combat_engagements seed
      join private.combat_engagements peer on peer.combat_id=seed.combat_id where seed.character_id=any(captain_ids)
  ) ids where id is not null;
  foreach captain_id in array coalesce(lock_ids,'{}'::uuid[]) loop
    perform pg_advisory_xact_lock(hashtextextended(captain_id::text,71829));
  end loop;
  if exists(select 1 from private.combat_engagements seed join private.combat_engagements peer on peer.combat_id=seed.combat_id
    where seed.character_id=any(captain_ids) and not peer.character_id=any(lock_ids)) then
    raise exception 'COMBAT_BUSY' using errcode='40001';
  end if;
  perform id from public.characters where id=any(lock_ids) order by id for update;
end;
$$;

create function private.append_combat_event(battle_id uuid, actor uuid, request uuid, payload jsonb)
returns void language plpgsql volatile security invoker set search_path='' as $$
declare sequence integer;
begin
  select coalesce(max(round),0)+1 into sequence from private.combat_rounds where combat_id=battle_id;
  insert into private.combat_rounds(combat_id,round,actor_id,request_id,event)
  values(battle_id,sequence,actor,request,payload || jsonb_build_object('sequence',sequence,'actor_id',actor));
end;
$$;

create function private.advance_shared_combat(battle_id uuid, actor uuid, player_order text, request_id uuid, occurred_at timestamptz, timed_out boolean)
returns void language plpgsql volatile security invoker set search_path='' as $$
declare b private.combats%rowtype; p private.combat_participants%rowtype;
  resolved jsonb; s jsonb; d jsonb; a jsonb; personal_status text; ending text; winner uuid;
begin
  select * into b from private.combats where id=battle_id for update;
  select * into p from private.combat_participants where combat_id=battle_id and character_id=actor;
  if b.status<>'active' or p.status<>'active' then return; end if;
  resolved:=private.resolve_combat_round(jsonb_build_object('status','active','phase',p.phase,'round',p.round,
    'attacker',p.snapshot,'defender',b.state->'defender' || jsonb_build_object('ammo',p.defender_ammo)),
    player_order,array[private.combat_roll(),private.combat_roll(),private.combat_roll()]);
  s:=resolved->'state'; a:=s->'attacker'; d:=s->'defender';
  personal_status:=case
    when (a->>'ship_health')::integer=0 or (a->>'crew_health')::integer=0 then 'defeated'
    when player_order='retreat' then 'retreated'
    when (s->>'round')::integer>=25 then 'draw' else 'active' end;
  -- Final blow remains credited even if the simultaneous counterattack also downs its author.
  if (d->>'ship_health')::integer=0 or (d->>'crew_health')::integer=0 then
    ending:=case when (d->>'ship_health')::integer=0 then 'hull_victory' else 'boarding_victory' end;
    winner:=actor; personal_status:='victory';
  end if;
  update private.combat_participants set snapshot=a,phase=s->>'phase',round=(s->>'round')::integer,
    status=personal_status,defender_ammo=(d->>'ammo')::integer,
    deadline=least(b.hard_deadline,occurred_at+interval '2 minutes'),
    finished_at=case when personal_status<>'active' then occurred_at end,
    hits=hits+case when (resolved->'event'->>'attacker_hit')::boolean then 1 else 0 end,
    damage=damage+(resolved->'event'->>'attacker_damage')::integer
    where combat_id=battle_id and character_id=actor;
  update public.characters set ship_health=(a->>'ship_health')::integer,crew_health=(a->>'crew_health')::integer,
    ship_recovery_at=occurred_at,crew_recovery_at=occurred_at,
    protected_until=case when personal_status<>'active' then occurred_at+interval '5 minutes' end where id=actor;
  update public.characters set ship_health=(d->>'ship_health')::integer,crew_health=(d->>'crew_health')::integer,
    ship_recovery_at=occurred_at,crew_recovery_at=occurred_at where id=b.defender_id;
  if personal_status<>'active' then delete from private.combat_engagements where character_id=actor and combat_id=battle_id; end if;
  if ending is not null then
    update public.characters set ship_recovery_at=occurred_at,crew_recovery_at=occurred_at,protected_until=occurred_at+interval '5 minutes'
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
    update public.characters set protected_until=occurred_at+interval '5 minutes' where id=b.defender_id;
  end if;
  perform private.notify_combat(battle_id);
end;
$$;

create or replace function private.settle_combat_context(captain_ids uuid[])
returns void language plpgsql volatile security invoker set search_path='' as $$
declare p record;
begin
  perform private.lock_combat_context(captain_ids);
  for p in select cp.combat_id,cp.character_id,cp.deadline from private.combat_participants cp
    where cp.status='active' and cp.deadline<=clock_timestamp()
      and cp.combat_id in(select combat_id from private.combat_engagements where character_id=any(captain_ids))
    order by cp.deadline,cp.character_id
  loop
    perform private.advance_shared_combat(p.combat_id,p.character_id,'retreat',gen_random_uuid(),p.deadline,true);
  end loop;
end;
$$;

create function private.combat_people(battle_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  select coalesce(jsonb_agg(person order by joined_at,id),'[]'::jsonb) from (
    select p.joined_at,p.character_id id,jsonb_build_object('id',p.character_id,'name',p.snapshot->>'name',
      'role','attacker','status',p.status,'hits',p.hits,'damage',p.damage,
      'ship_health',p.snapshot->'ship_health','crew_health',p.snapshot->'crew_health','phase',p.phase) person
    from private.combat_participants p where p.combat_id=battle_id
    union all select b.started_at,b.defender_id,jsonb_build_object('id',b.defender_id,'name',b.state->'defender'->>'name',
      'role','defender','status',case when b.status='active' then 'active'
        when b.state->>'outcome' in ('hull_victory','boarding_victory') and b.state->>'winner_id'<>b.defender_id::text then 'defeated' else 'survived' end,
      'hits',(select count(*) from private.combat_rounds r where r.combat_id=b.id and (r.event->>'defender_hit')::boolean),
      'damage',coalesce((select sum((r.event->>'defender_damage')::integer) from private.combat_rounds r where r.combat_id=b.id),0),
      'ship_health',b.state->'defender'->'ship_health','crew_health',b.state->'defender'->'crew_health','phase',null)
    from private.combats b where b.id=battle_id
  ) people;
$$;

create or replace function private.combat_view(battle_id uuid,viewer_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('id',b.id,'status',b.status,'phase',p.phase,'round',p.round,
    'outcome',b.state->'outcome','winner_id',b.state->'winner_id','participant_status',p.status,
    'attacker',private.visible_combatant(p.snapshot,p.character_id=viewer_id,true),
    'defender',private.visible_combatant(b.state->'defender',b.defender_id=viewer_id,true),
    'viewer_id',viewer_id,'started_at',b.started_at,'deadline',p.deadline,'finished_at',b.finished_at,
    'observed_at',clock_timestamp(),'people',private.combat_people(b.id),
    'events',coalesce((select jsonb_agg(event order by round) from private.combat_rounds where combat_id=b.id),'[]'::jsonb))
  from private.combats b join private.combat_participants p on p.combat_id=b.id
    and p.character_id=case when viewer_id=b.defender_id then b.attacker_id else viewer_id end
  where b.id=battle_id;
$$;

create or replace function private.get_combat_preview(target_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare viewer_id uuid:=private.combat_captain(); a public.characters%rowtype; d public.characters%rowtype;
  own_engagement private.combat_engagements%rowtype; target_engagement private.combat_engagements%rowtype;
  a_snapshot jsonb; d_snapshot jsonb; energy_now integer; reason text; observed_at timestamptz;
begin
  if target_id is null then return jsonb_build_object('error','CHARACTER_NOT_FOUND'); end if;
  perform private.settle_combat_context(array[viewer_id,target_id]);
  observed_at:=clock_timestamp();
  select * into a from public.characters where id=viewer_id;
  select * into d from public.characters where id=target_id;
  if d.id is null then return jsonb_build_object('error','CHARACTER_NOT_FOUND'); end if;
  select * into own_engagement from private.combat_engagements where character_id=viewer_id;
  select * into target_engagement from private.combat_engagements where character_id=target_id;
  a_snapshot:=private.combat_snapshot(a,observed_at);
  d_snapshot:=private.combat_snapshot(d,observed_at);
  if own_engagement.character_id is not null then a_snapshot:=a_snapshot || jsonb_build_object('ship_health',a.ship_health,'crew_health',a.crew_health); end if;
  if target_engagement.character_id is not null then d_snapshot:=d_snapshot || jsonb_build_object('ship_health',d.ship_health,'crew_health',d.crew_health); end if;
  select energy into energy_now from private.energy_snapshot(a.energy,a.energy_updated_at,observed_at);
  reason:=case when viewer_id=target_id then 'SELF_ATTACK'
    when own_engagement.role='attacker' then 'IN_COMBAT'
    when own_engagement.role='defender' then 'DEFENDING'
    when target_engagement.role='attacker' then 'TARGET_IN_COMBAT'
    when exists(select 1 from private.combat_participants where combat_id=target_engagement.combat_id and character_id=viewer_id) then 'ALREADY_PARTICIPATED'
    when target_engagement.character_id is null and d.protected_until>observed_at then 'TARGET_PROTECTED'
    when (a_snapshot->>'ship_health')::integer=0 or (a_snapshot->>'crew_health')::integer=0 then 'NO_HEALTH'
    when (d_snapshot->>'ship_health')::integer=0 or (d_snapshot->>'crew_health')::integer=0 then 'TARGET_NO_HEALTH'
    when energy_now<10 then 'NOT_ENOUGH_ENERGY' end;
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
  select * into a from public.characters where id=viewer_id;
  select * into d from public.characters where id=target_id;
  select * into recovered from private.energy_snapshot(a.energy,a.energy_updated_at,observed_at);
  snapshot:=private.combat_snapshot(a,observed_at);
  battle_id:=(preview->>'join_combat_id')::uuid; joining:=battle_id is not null;
  if not joining then
    initial_state:=jsonb_build_object('attacker',snapshot,'defender',private.combat_snapshot(d,observed_at),
      'status','active','outcome',null,'winner_id',null);
    insert into private.combats(attacker_id,defender_id,start_request_id,rules_version,state,started_at,deadline,hard_deadline)
      values(viewer_id,target_id,request_id,2,initial_state,observed_at,observed_at+interval '2 minutes',observed_at+interval '10 minutes')
      returning id into battle_id;
    insert into private.combat_engagements(character_id,combat_id,role) values(target_id,battle_id,'defender');
    update public.characters set protected_until=null,ship_health=(initial_state->'defender'->>'ship_health')::integer,
      crew_health=(initial_state->'defender'->>'crew_health')::integer,ship_recovery_at=observed_at,crew_recovery_at=observed_at where id=target_id;
  end if;
  select * into b from private.combats where id=battle_id for update;
  insert into private.combat_participants(combat_id,character_id,start_request_id,snapshot,joined_at,deadline)
    values(battle_id,viewer_id,request_id,snapshot,observed_at,least(b.hard_deadline,observed_at+interval '2 minutes'));
  insert into private.combat_engagements(character_id,combat_id,role) values(viewer_id,battle_id,'attacker');
  update public.characters set energy=recovered.energy-10,energy_updated_at=recovered.energy_updated_at,protected_until=null,
    ship_health=(snapshot->>'ship_health')::integer,crew_health=(snapshot->>'crew_health')::integer,
    ship_recovery_at=observed_at,crew_recovery_at=observed_at where id=viewer_id;
  perform private.append_combat_event(battle_id,viewer_id,request_id,jsonb_build_object(
    'kind',case when joining then 'joined' else 'started' end,'actor_name',a.display_name,'at',observed_at));
  perform private.notify_combat(battle_id);
  return jsonb_build_object('battle',private.combat_view(battle_id,viewer_id));
end;
$$;

create or replace function private.get_combat(battle_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare viewer_id uuid:=private.combat_captain(); target uuid;
begin
  select defender_id into target from private.combats b where b.id=battle_id
    and (b.defender_id=viewer_id or exists(select 1 from private.combat_participants where combat_id=b.id and character_id=viewer_id));
  if not found then return null; end if;
  perform private.settle_combat_context(array[viewer_id,target]);
  return private.combat_view(battle_id,viewer_id);
end;
$$;

create or replace function private.submit_combat_order(battle_id uuid,expected_round integer,player_order text,request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare viewer_id uuid:=private.combat_captain(); b private.combats%rowtype; p private.combat_participants%rowtype; previous jsonb;
begin
  if request_id is null or expected_round is null or expected_round<0 or expected_round>=25 then raise exception 'INVALID_REQUEST' using errcode='22023'; end if;
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
  if p.round<>expected_round then return jsonb_build_object('error','STALE_ROUND'); end if;
  if player_order is null or (p.phase='sea' and player_order not in ('fire','board','retreat'))
    or (p.phase='boarding' and player_order not in ('crew_attack','disengage','retreat')) then return jsonb_build_object('error','INVALID_ORDER'); end if;
  if player_order='fire' and (p.snapshot->>'ammo')::integer=0 then return jsonb_build_object('error','NO_AMMO'); end if;
  perform private.advance_shared_combat(battle_id,viewer_id,player_order,request_id,clock_timestamp(),false);
  return jsonb_build_object('battle',private.combat_view(battle_id,viewer_id));
end;
$$;

create or replace function private.get_game_state()
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare c public.characters%rowtype; active private.combats%rowtype; engagement private.combat_engagements%rowtype; observed_at timestamptz;
  recovered record; ship_hp integer; crew_hp integer; health_next_at timestamptz; last_id uuid;
begin
  if auth.uid() is null or not private.is_registered_player() then return null; end if;
  select * into c from public.characters where user_id=auth.uid();
  if not found then return null; end if;
  perform private.settle_combat_context(array[c.id]);
  select * into c from public.characters where id=c.id;
  select * into engagement from private.combat_engagements where character_id=c.id;
  select * into active from private.combats where id=engagement.combat_id;
  observed_at:=clock_timestamp();
  select * into recovered from private.energy_snapshot(c.energy,c.energy_updated_at,observed_at);
  ship_hp:=case when active.id is not null then c.ship_health else private.health_snapshot(c.ship_health,c.ship_recovery_at,observed_at,30) end;
  crew_hp:=case when active.id is not null then c.crew_health else private.health_snapshot(c.crew_health,c.crew_recovery_at,observed_at,10) end;
  if active.id is null then
    health_next_at:=least(case when ship_hp<100 then c.ship_recovery_at+(ship_hp-c.ship_health+1)*interval '30 seconds' end,
      case when crew_hp<100 then c.crew_recovery_at+(crew_hp-c.crew_health+1)*interval '10 seconds' end);
  end if;
  select b.id into last_id from private.combats b where b.defender_id=c.id
    or exists(select 1 from private.combat_participants where combat_id=b.id and character_id=c.id)
    order by b.started_at desc,b.id desc limit 1;
  return jsonb_build_object('energy',recovered.energy,'energy_next_at',case when recovered.energy<100 then recovered.energy_updated_at+interval '5 minutes' end,
    'observed_at',observed_at,'ship_health',ship_hp,'crew_health',crew_hp,'health_next_at',health_next_at,
    'active_combat_id',active.id,'combat_next_at',active.deadline,'last_combat_id',last_id,
    'active_attack',case when engagement.role='attacker' then jsonb_build_object('battle_id',active.id,'target_id',active.defender_id) end,
    'defence_order',c.defence_order,'protected_until',case when c.protected_until>observed_at then c.protected_until end,
    'ship_attack',c.ship_attack,'ship_defense',c.ship_defense,'ship_speed',c.ship_speed,'ship_accuracy',c.ship_accuracy,
    'crew_attack',c.crew_attack,'crew_defense',c.crew_defense,'crew_speed',c.crew_speed,'crew_accuracy',c.crew_accuracy);
end;
$$;

create function private.get_attack_lock()
returns jsonb language sql volatile security definer set search_path='' as $$
  select nullif(private.get_game_state()->'active_attack','null'::jsonb);
$$;
create function public.get_attack_lock()
returns jsonb language sql volatile security invoker set search_path='' as $$ select private.get_attack_lock(); $$;

-- Anonymous reports contain only the explicit public projection and completed events.
create function private.get_combat_log(battle_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('id',b.id,'outcome',b.state->'outcome','winner_id',b.state->'winner_id',
    'defender_id',b.defender_id,'defender_name',b.state->'defender'->>'name',
    'started_at',b.started_at,'finished_at',b.finished_at,'people',private.combat_people(b.id),
    'events',coalesce((select jsonb_agg(event order by round) from private.combat_rounds where combat_id=b.id),'[]'::jsonb))
  from private.combats b where b.id=battle_id and b.status='completed';
$$;
create function public.get_combat_log(battle_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$ select private.get_combat_log(battle_id); $$;

-- Only attackers are blocked from ordinary game actions.
create or replace function private.train_stat(training_group text,stat text)
returns void language plpgsql volatile security definer set search_path='' as $$
declare captain public.characters%rowtype; recovered record; viewer_id uuid:=private.combat_captain();
begin
  if training_group is null or training_group not in ('ship','crew') or stat is null or stat not in ('attack','defense','speed','accuracy') then
    raise exception 'INVALID_STAT' using errcode='22023'; end if;
  perform private.settle_combat_context(array[viewer_id]);
  if exists(select 1 from private.combat_engagements where character_id=viewer_id and role='attacker') then raise exception 'IN_COMBAT'; end if;
  select * into captain from public.characters where id=viewer_id for update;
  select * into recovered from private.energy_snapshot(captain.energy,captain.energy_updated_at,clock_timestamp());
  if recovered.energy<5 then raise exception 'NOT_ENOUGH_ENERGY' using errcode='P0001'; end if;
  update public.characters set energy=recovered.energy-5,energy_updated_at=recovered.energy_updated_at,
    ship_attack=ship_attack+case when training_group='ship' and stat='attack' then 1 else 0 end,
    ship_defense=ship_defense+case when training_group='ship' and stat='defense' then 1 else 0 end,
    ship_speed=ship_speed+case when training_group='ship' and stat='speed' then 1 else 0 end,
    ship_accuracy=ship_accuracy+case when training_group='ship' and stat='accuracy' then 1 else 0 end,
    crew_attack=crew_attack+case when training_group='crew' and stat='attack' then 1 else 0 end,
    crew_defense=crew_defense+case when training_group='crew' and stat='defense' then 1 else 0 end,
    crew_speed=crew_speed+case when training_group='crew' and stat='speed' then 1 else 0 end,
    crew_accuracy=crew_accuracy+case when training_group='crew' and stat='accuracy' then 1 else 0 end where id=viewer_id;
end;
$$;

-- Remove the obsolete mutation path; the pure v1 round resolver remains shared.
drop function private.advance_combat(uuid,text,uuid,timestamptz,boolean);
do $$
declare f record;
begin
  for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='private' and p.proname=any(array['notify_combat','append_combat_event','advance_shared_combat','combat_people','get_attack_lock','get_combat_log'])
  loop execute format('revoke all on function %s from public,anon,authenticated',f.signature); end loop;
end;
$$;
revoke all on function public.get_attack_lock() from public,anon;
grant execute on function private.get_attack_lock(), public.get_attack_lock() to authenticated;
revoke all on function public.get_combat_log(uuid) from public;
grant execute on function public.get_combat_log(uuid) to anon,authenticated;
comment on table private.combats is 'Shared encounter and defender snapshot. Attacker rounds and equipment live in private.combat_participants.';
comment on table public.player_game_events is 'Owner-only revision signals. Contains no combat state or opponent information.';
