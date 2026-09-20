{{seaTravel.catalogSql}}

create or replace function private.sea_state(c public.characters)
returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object(
    'state',case c.location when 'the_harbor' then 'in_harbor' when 'open_sea' then 'at_sea' else 'traveling' end,
    'version',c.sea_version,'step',c.sea_step,
    'scout_id',case when c.location='open_sea' then private.latest_sea_scout(c) end,
    'visit_id',case when c.location='open_sea' then c.sea_visit_id end,
    'place',case when c.location='open_sea' then jsonb_build_object('id',c.sea_place_id,'name',c.sea_place_name) end,
    'options',case when c.location='open_sea' then coalesce((select jsonb_agg(
      jsonb_build_object('id',o.id,'place_id',o.place_id,'name',o.place_name) order by o.position)
      from private.sea_route_options o where o.character_id=c.id and o.visit_id=c.sea_visit_id),'[]'::jsonb) else '[]'::jsonb end,
    'journey',case when c.location='traveling' then jsonb_build_object(
      'id',c.travel_id,'kind',c.travel_kind,'from_step',c.sea_step,'target_step',c.travel_target_step,
      'destination',jsonb_build_object('id',c.travel_place_id,'name',c.travel_place_name),
      'started_at',c.travel_started_at,'arrives_at',c.travel_arrives_at) end);
$$;

-- Caller owns the character/combat locks. Arrival takes effect at its saved deadline.
create or replace function private.settle_sea_travel(captain_id uuid,observed_at timestamptz)
returns void language plpgsql volatile security invoker set search_path='' as $$
declare c public.characters%rowtype; recovered record;
begin
  select * into c from public.characters where id=captain_id for update;
  if not found or c.location<>'traveling' or c.travel_arrives_at>observed_at then return; end if;
  if c.travel_kind='return' then
    select * into recovered from private.character_energy_snapshot(c,observed_at);
    update public.characters set location='the_harbor',sea_step=0,sea_visit_id=null,
      energy=recovered.energy,energy_updated_at=recovered.energy_updated_at,
      sea_version=gen_random_uuid(),travel_id=null,travel_kind=null,travel_target_step=null,
      travel_place_id=null,travel_place_name=null,travel_started_at=null,travel_arrives_at=null
      where id=captain_id;
    delete from private.sea_route_options where character_id=captain_id;
  else
    update public.characters set location='open_sea',sea_step=travel_target_step,
      max_sea_distance=greatest(max_sea_distance,travel_target_step),
      sea_place_id=travel_place_id,sea_place_name=travel_place_name,sea_version=gen_random_uuid(),
      travel_id=null,travel_kind=null,travel_target_step=null,travel_place_id=null,travel_place_name=null,
      travel_started_at=null,travel_arrives_at=null where id=captain_id;
  end if;
  perform private.notify_training(captain_id);
end;
$$;

create or replace function private.sea_travel_action(action text,expected_version uuid,option_id uuid,request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  viewer_id uuid:=private.combat_captain();
  c public.characters%rowtype;
  previous private.sea_travel_requests%rowtype;
  chosen private.sea_route_options%rowtype;
  recovered record;
  observed_at timestamptz;
  deadline timestamptz;
  next_visit uuid;
  next_step integer;
  destination_id text;
  destination_name text;
  duration_seconds bigint;
  result jsonb;
  option_count integer;
begin
  if action is null or action not in ('depart','onward','return') or request_id is null or expected_version is null
    or (action='onward' and option_id is null) or (action<>'onward' and option_id is not null) then
    raise exception 'INVALID_REQUEST' using errcode='22023';
  end if;
  perform private.settle_combat_context(array[viewer_id]);
  select * into previous from private.sea_travel_requests r
    where r.character_id=viewer_id and r.request_id=sea_travel_action.request_id;
  if found then
    if previous.action<>action or previous.expected_version<>expected_version or previous.option_id is distinct from option_id then
      raise exception 'REQUEST_CONFLICT' using errcode='22023';
    end if;
    return previous.result;
  end if;
  observed_at:=clock_timestamp();
  perform private.settle_ship_upgrade(viewer_id,observed_at);
  select * into c from public.characters where id=viewer_id for update;
  select * into recovered from private.character_energy_snapshot(c,observed_at);
  if c.hospital_until is not null then raise exception 'IN_HOSPITAL'; end if;
  if exists(select 1 from private.combat_engagements where character_id=viewer_id) then raise exception 'IN_COMBAT'; end if;
  if c.sea_version<>expected_version then raise exception 'STALE_VOYAGE'; end if;
  if c.location='traveling' then raise exception 'TRAVEL_ACTIVE'; end if;
  if action='depart' then
    if c.location<>'the_harbor' then raise exception 'NOT_IN_HARBOR'; end if;
    if exists(select 1 from private.ship_upgrade_jobs where character_id=viewer_id and applied_at is null) then
      raise exception 'SHIP_WORK_ACTIVE';
    end if;
    if recovered.energy<{{gameplay.seaTravel.departureEnergyCost}} then raise exception 'NOT_ENOUGH_ENERGY'; end if;
    next_step:=1; destination_id:='harbor_outskirts'; destination_name:='Outside the harbor';
  else
    if c.location<>'open_sea' then raise exception 'NOT_AT_SEA'; end if;
    if action='return' then
      next_step:=0; destination_id:='the_harbor'; destination_name:='The Harbor';
    else
      if c.sea_step=2147483647 then raise exception 'TRAVEL_LIMIT'; end if;
      select * into chosen from private.sea_route_options o
        where o.id=option_id and o.character_id=viewer_id and o.visit_id=c.sea_visit_id;
      if not found then raise exception 'STALE_ROUTE'; end if;
      next_step:=c.sea_step+1; destination_id:=chosen.place_id; destination_name:=chosen.place_name;
    end if;
  end if;
  duration_seconds:=case when action='return' then c.sea_step::bigint*{{gameplay.seaTravel.returnSecondsPerStep}}
    else {{gameplay.seaTravel.outwardDurationSeconds}} end;
  -- Keep deadlines representable by both PostgreSQL and the browser.
  if duration_seconds>=extract(epoch from ('9999-01-01Z'::timestamptz-observed_at))
    or next_step::bigint*{{gameplay.seaTravel.returnSecondsPerStep}}>=extract(epoch from ('9999-01-01Z'::timestamptz-observed_at)) then
    raise exception 'TRAVEL_LIMIT';
  end if;
  deadline:=observed_at+make_interval(secs=>duration_seconds::double precision);
  delete from private.sea_route_options where character_id=viewer_id;
  if action<>'return' then
    next_visit:=gen_random_uuid();
    insert into private.sea_route_options(character_id,visit_id,position,place_id,place_name)
      select viewer_id,next_visit,(row_number() over(order by draw,id)-1)::smallint,id,name
      from (select id,name,private.combat_roll() draw from private.sea_location_types where active order by draw,id limit 2) choices;
    get diagnostics option_count=row_count;
    if option_count<>2 then raise exception 'SEA_CATALOG_UNAVAILABLE'; end if;
  end if;
  update public.characters set location='traveling',sea_place_id=null,sea_place_name=null,sea_visit_id=next_visit,
    sea_version=gen_random_uuid(),travel_id=gen_random_uuid(),travel_kind=action,travel_target_step=next_step,
    travel_place_id=destination_id,travel_place_name=destination_name,travel_started_at=observed_at,travel_arrives_at=deadline,
    energy=recovered.energy-case when action='depart' then {{gameplay.seaTravel.departureEnergyCost}} else 0 end,
    energy_updated_at=recovered.energy_updated_at
    where id=viewer_id returning * into c;
  result:=jsonb_build_object('journey_id',c.travel_id,'kind',action,'arrives_at',deadline);
  insert into private.sea_travel_requests(character_id,request_id,action,expected_version,option_id,result)
    values(viewer_id,request_id,action,expected_version,option_id,result);
  perform private.notify_training(viewer_id);
  return result;
end;
$$;

revoke all on function private.sea_state(public.characters),private.settle_sea_travel(uuid,timestamptz),
  private.sea_travel_action(text,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function private.sea_travel_action(text,uuid,uuid,uuid) to authenticated;

create or replace function public.depart_harbor(expected_version uuid,request_id uuid)
returns jsonb language sql volatile security invoker set search_path='' as $$
  select private.sea_travel_action('depart',expected_version,null,request_id);
$$;
create or replace function public.choose_sea_route(expected_version uuid,option_id uuid,request_id uuid)
returns jsonb language sql volatile security invoker set search_path='' as $$
  select private.sea_travel_action('onward',expected_version,option_id,request_id);
$$;
create or replace function public.return_to_harbor(expected_version uuid,request_id uuid)
returns jsonb language sql volatile security invoker set search_path='' as $$
  select private.sea_travel_action('return',expected_version,null,request_id);
$$;
revoke all on function public.depart_harbor(uuid,uuid),public.choose_sea_route(uuid,uuid,uuid),
  public.return_to_harbor(uuid,uuid) from public,anon,authenticated;
grant execute on function public.depart_harbor(uuid,uuid),public.choose_sea_route(uuid,uuid,uuid),
  public.return_to_harbor(uuid,uuid) to authenticated;

-- Resource editing and hospital admission must preserve the travel invariants.
create or replace function private.guard_sea_resources()
returns trigger language plpgsql volatile security definer set search_path='' as $$
declare recovered record;
begin
  new.max_sea_distance:=greatest(new.max_sea_distance,new.sea_step);
  if tg_op='UPDATE' then
    -- Preserve a due offline record before hospital admission or another server edit.
    new.max_sea_distance:=greatest(new.max_sea_distance,old.max_sea_distance,
      case when old.travel_kind in ('depart','onward')
        and old.travel_arrives_at<=coalesce(new.hospital_started_at,clock_timestamp())
        then old.travel_target_step else 0 end);
  end if;
  if new.hospital_until is not null and new.location<>'the_harbor' then
    select * into recovered from private.character_energy_snapshot(new,coalesce(new.hospital_started_at,clock_timestamp()));
    new.energy:=recovered.energy; new.energy_updated_at:=recovered.energy_updated_at;
    new.location:='the_harbor'; new.sea_step:=0; new.sea_visit_id:=null;
    new.sea_place_id:=null; new.sea_place_name:=null; new.sea_version:=gen_random_uuid();
    new.travel_id:=null; new.travel_kind:=null; new.travel_target_step:=null;
    new.travel_place_id:=null; new.travel_place_name:=null; new.travel_started_at:=null; new.travel_arrives_at:=null;
    delete from private.sea_route_options where character_id=new.id;
  end if;
  return new;
end;
$$;
revoke all on function private.guard_sea_resources() from public,anon,authenticated;
drop trigger if exists characters_guard_sea_resources on public.characters;
create trigger characters_guard_sea_resources before insert or update on public.characters
for each row execute function private.guard_sea_resources();

create or replace function private.sync_harbor_player()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.location='the_harbor' or new.travel_kind='return' then
    insert into public.harbor_players(character_id,display_name,arrives_at)
      values(new.id,new.display_name,case when new.travel_kind='return' then new.travel_arrives_at end)
      on conflict(character_id) do update set display_name=excluded.display_name,arrives_at=excluded.arrives_at
      where (harbor_players.display_name,harbor_players.arrives_at)
        is distinct from (excluded.display_name,excluded.arrives_at);
  else
    delete from public.harbor_players where character_id=new.id;
  end if;
  return new;
end;
$$;
drop trigger characters_sync_harbor_player on public.characters;
create trigger characters_sync_harbor_player after insert or update on public.characters
for each row execute function private.sync_harbor_player();

create or replace function private.sync_character_profile()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.character_profiles(character_id,display_name,location,created_at,arrives_at,arrival_location,
    max_sea_distance,arrival_max_sea_distance)
    values(new.id,new.display_name,new.location,new.created_at,new.travel_arrives_at,
      case when new.location='traveling' then case when new.travel_kind='return' then 'the_harbor' else 'open_sea' end end,
      new.max_sea_distance,case when new.travel_kind in ('depart','onward')
        and new.travel_target_step>new.max_sea_distance then new.travel_target_step end)
    on conflict(character_id) do update set display_name=excluded.display_name,location=excluded.location,
      created_at=excluded.created_at,arrives_at=excluded.arrives_at,arrival_location=excluded.arrival_location,
      max_sea_distance=excluded.max_sea_distance,arrival_max_sea_distance=excluded.arrival_max_sea_distance
    where (character_profiles.display_name,character_profiles.location,character_profiles.created_at,
      character_profiles.arrives_at,character_profiles.arrival_location,
      character_profiles.max_sea_distance,character_profiles.arrival_max_sea_distance) is distinct from
      (excluded.display_name,excluded.location,excluded.created_at,excluded.arrives_at,excluded.arrival_location,
      excluded.max_sea_distance,excluded.arrival_max_sea_distance);
  return new;
end;
$$;
drop trigger characters_sync_profile on public.characters;
create trigger characters_sync_profile after insert or update on public.characters
for each row execute function private.sync_character_profile();
revoke all on function private.sync_harbor_player(),private.sync_character_profile() from public,anon,authenticated;
