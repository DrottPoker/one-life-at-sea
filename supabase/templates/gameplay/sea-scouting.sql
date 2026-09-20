-- Public readers can resolve arrivals without writing another captain's state.
create or replace function private.effective_sea_distance(c public.characters,observed_at timestamptz)
returns integer language sql stable security invoker set search_path='' as $$
  select case when c.location='open_sea' then c.sea_step
    when c.location='traveling' and c.travel_kind in ('depart','onward') and c.travel_arrives_at<=observed_at
      then c.travel_target_step end;
$$;

create or replace function private.latest_sea_scout(c public.characters)
returns uuid language sql stable security invoker set search_path='' as $$
  select s.request_id from private.sea_scouts s where s.character_id=c.id and s.visit_id=c.sea_visit_id
    order by s.created_at desc,s.request_id desc limit 1;
$$;

-- Both preview and start use this check under the existing combat locks.
create or replace function private.combat_location_error(a public.characters,d public.characters,observed_at timestamptz)
returns text language plpgsql stable security invoker set search_path='' as $$
declare a_distance integer:=private.effective_sea_distance(a,observed_at);
  d_distance integer:=private.effective_sea_distance(d,observed_at);
begin
  if a.location='traveling' and a.travel_arrives_at>observed_at then return 'TRAVELING'; end if;
  if d.location='traveling' and d.travel_arrives_at>observed_at then return 'TARGET_TRAVELING'; end if;
  if (a.location='the_harbor' or (a.travel_kind='return' and a.travel_arrives_at<=observed_at))
    and (d.location='the_harbor' or (d.travel_kind='return' and d.travel_arrives_at<=observed_at)) then return null; end if;
  if a_distance is null or d_distance is null or a_distance<>d_distance then return 'DIFFERENT_LOCATION'; end if;
  if not exists(select 1 from private.sea_scout_targets t
    where t.character_id=a.id and t.request_id=private.latest_sea_scout(a)
      and t.target_id=d.id and t.target_visit_id=d.sea_visit_id) then return 'SCOUT_REQUIRED'; end if;
  return null;
end;
$$;

create or replace function private.can_attack_here(target_id uuid)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare a public.characters%rowtype; d public.characters%rowtype; observed_at timestamptz:=statement_timestamp();
begin
  if auth.uid() is null or not private.is_registered_player() then return false; end if;
  select * into a from public.characters where user_id=auth.uid();
  select * into d from public.characters where id=target_id;
  if a.id is null or d.id is null or a.id=d.id or a.hospital_until>observed_at or d.hospital_until>observed_at then return false; end if;
  return private.combat_location_error(a,d,observed_at) is null;
end;
$$;

create or replace function private.scout_nearby_ships(expected_version uuid,request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare viewer_id uuid:=private.combat_captain(); c public.characters%rowtype;
  previous private.sea_scouts%rowtype; recovered record; observed_at timestamptz; total integer; receipt jsonb;
begin
  if expected_version is null or request_id is null then raise exception 'INVALID_REQUEST' using errcode='22023'; end if;
  perform private.settle_combat_context(array[viewer_id]);
  select * into previous from private.sea_scouts s
    where s.character_id=viewer_id and s.request_id=scout_nearby_ships.request_id;
  if found then
    if previous.expected_version<>expected_version then raise exception 'REQUEST_CONFLICT' using errcode='22023'; end if;
    return previous.result;
  end if;
  select * into c from public.characters where id=viewer_id for update;
  if c.hospital_until is not null then raise exception 'IN_HOSPITAL'; end if;
  if c.location<>'open_sea' then raise exception 'NOT_AT_SEA'; end if;
  if c.sea_version<>expected_version then raise exception 'STALE_VOYAGE'; end if;
  if exists(select 1 from private.combat_engagements where character_id=viewer_id) then raise exception 'IN_COMBAT'; end if;
  observed_at:=clock_timestamp();
  select * into recovered from private.character_energy_snapshot(c,observed_at);
  if recovered.energy<{{gameplay.seaTravel.scoutEnergyCost}} then raise exception 'NOT_ENOUGH_ENERGY'; end if;
  insert into private.sea_scouts(character_id,request_id,visit_id,expected_version,sea_distance,created_at)
    values(viewer_id,request_id,c.sea_visit_id,expected_version,c.sea_step,observed_at);
  delete from private.sea_scout_targets where character_id=viewer_id;
  -- One MVCC snapshot includes all matching stops and already arrived offline ships.
  insert into private.sea_scout_targets(character_id,request_id,target_id,target_visit_id,display_name,position)
    select viewer_id,request_id,id,sea_visit_id,display_name,
      (row_number() over(order by display_name,id)-1)::integer from (
      select id,sea_visit_id,display_name from public.characters
        where location='open_sea' and hospital_until is null and sea_step=c.sea_step and id<>viewer_id
      union all
      select id,sea_visit_id,display_name from public.characters
        where location='traveling' and travel_kind in ('depart','onward') and hospital_until is null
          and travel_target_step=c.sea_step and travel_arrives_at<=observed_at and id<>viewer_id
    ) candidates;
  get diagnostics total=row_count;
  update public.characters set energy=recovered.energy-{{gameplay.seaTravel.scoutEnergyCost}},
    energy_updated_at=recovered.energy_updated_at where id=viewer_id;
  receipt:=jsonb_build_object('id',request_id,'sea_distance',c.sea_step,'scouted_at',observed_at,
    'total',total,'energy_cost',{{gameplay.seaTravel.scoutEnergyCost}});
  update private.sea_scouts s set result=receipt
    where s.character_id=viewer_id and s.request_id=scout_nearby_ships.request_id;
  perform private.notify_training(viewer_id);
  return receipt;
end;
$$;

create or replace function private.get_sea_scout(requested_page integer)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare viewer_id uuid:=private.combat_captain(); c public.characters%rowtype;
  scout private.sea_scouts%rowtype; total integer; page integer;
begin
  perform private.settle_combat_context(array[viewer_id]);
  select * into c from public.characters where id=viewer_id;
  if c.location<>'open_sea' or c.hospital_until is not null then return null; end if;
  select * into scout from private.sea_scouts s
    where s.character_id=viewer_id and s.request_id=private.latest_sea_scout(c);
  if not found then return null; end if;
  select count(*)::integer into total from private.sea_scout_targets t
    where t.character_id=viewer_id and t.request_id=scout.request_id;
  page:=least(greatest(coalesce(requested_page,0),0),greatest(0,(total-1)/{{gameplay.seaTravel.scoutPageSize}}));
  return jsonb_build_object('id',scout.request_id,'sea_distance',scout.sea_distance,'scouted_at',scout.created_at,
    'total',total,'page',page,'players',coalesce((select jsonb_agg(to_jsonb(p) order by p.position) from (
      select t.target_id character_id,t.display_name,t.position from private.sea_scout_targets t
        where t.character_id=viewer_id and t.request_id=scout.request_id order by t.position
        limit {{gameplay.seaTravel.scoutPageSize}} offset page*{{gameplay.seaTravel.scoutPageSize}}
    ) p),'[]'::jsonb));
end;
$$;

revoke all on function private.effective_sea_distance(public.characters,timestamptz),
  private.latest_sea_scout(public.characters),private.combat_location_error(public.characters,public.characters,timestamptz),
  private.can_attack_here(uuid),private.scout_nearby_ships(uuid,uuid),private.get_sea_scout(integer) from public,anon,authenticated;
grant execute on function private.can_attack_here(uuid),private.scout_nearby_ships(uuid,uuid),private.get_sea_scout(integer) to authenticated;

create or replace function public.scout_nearby_ships(expected_version uuid,request_id uuid)
returns jsonb language sql volatile security invoker set search_path='' as $$
  select private.scout_nearby_ships(expected_version,request_id);
$$;
create or replace function public.get_sea_scout(requested_page integer default 0)
returns jsonb language sql volatile security invoker set search_path='' as $$
  select private.get_sea_scout(requested_page);
$$;
revoke all on function public.scout_nearby_ships(uuid,uuid),public.get_sea_scout(integer) from public,anon,authenticated;
grant execute on function public.scout_nearby_ships(uuid,uuid),public.get_sea_scout(integer) to authenticated;
