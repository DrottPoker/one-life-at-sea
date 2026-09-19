-- A sinking ship kills its crew. Every new death starts one hospital stay.
create or replace function private.admit_to_hospital()
returns trigger language plpgsql volatile security definer set search_path='' as $$
declare admitted_at timestamptz:=clock_timestamp();
begin
  if new.ship_health=0 then new.crew_health:=0; end if;
  if new.crew_health=0 and new.hospital_until is null then
    new.hospital_started_at:=admitted_at;
    new.hospital_until:=admitted_at+make_interval(secs=>{{gameplay.hospital.durationSeconds}});
  end if;
  return new;
end;
$$;
revoke all on function private.admit_to_hospital() from public,anon,authenticated;
drop trigger if exists characters_admit_to_hospital on public.characters;
create trigger characters_admit_to_hospital before insert or update of ship_health,crew_health on public.characters
for each row execute function private.admit_to_hospital();

create or replace function private.sync_hospital_patient()
returns trigger language plpgsql volatile security definer set search_path='' as $$
begin
  if new.hospital_until is not null then
    insert into public.hospital_patients(character_id,display_name,hospital_until)
    values(new.id,new.display_name,new.hospital_until)
    on conflict(character_id) do update set display_name=excluded.display_name,hospital_until=excluded.hospital_until
      where hospital_patients.display_name is distinct from excluded.display_name
        or hospital_patients.hospital_until is distinct from excluded.hospital_until;
  else
    delete from public.hospital_patients where character_id=new.id;
  end if;
  if tg_op='INSERT' or old.hospital_until is distinct from new.hospital_until then
    perform private.notify_training(new.id);
  end if;
  return new;
end;
$$;
revoke all on function private.sync_hospital_patient() from public,anon,authenticated;
drop trigger if exists characters_sync_hospital_patient on public.characters;
create trigger characters_sync_hospital_patient after insert or update on public.characters
for each row execute function private.sync_hospital_patient();

-- Caller owns the character/combat locks. Expiry is based only on database time.
create or replace function private.settle_hospital(captain_id uuid,observed_at timestamptz)
returns void language plpgsql volatile security invoker set search_path='' as $$
begin
  update public.characters set ship_health={{gameplay.resources.healthMax}},crew_health={{gameplay.resources.healthMax}},
    ship_recovery_at=hospital_until,crew_recovery_at=hospital_until,hospital_started_at=null,hospital_until=null
    where id=captain_id and hospital_until<=observed_at;
end;
$$;
create or replace function private.assert_can_act(captain_id uuid)
returns void language plpgsql volatile security invoker set search_path='' as $$
begin
  perform private.settle_hospital(captain_id,clock_timestamp());
  if exists(select 1 from public.characters where id=captain_id and hospital_until is not null) then
    raise exception 'IN_HOSPITAL' using errcode='P0001';
  end if;
end;
$$;

-- Environmental death during a fight ends that encounter without a fabricated final blow.
create or replace function private.interrupt_hospital_combats(captain_ids uuid[])
returns void language plpgsql volatile security invoker set search_path='' as $$
declare b private.combats%rowtype; patient public.characters%rowtype; observed_at timestamptz:=clock_timestamp();
begin
  for b in select * from private.combats where status='active'
    and id in(select combat_id from private.combat_engagements where character_id=any(captain_ids))
    and exists(select 1 from private.combat_engagements e join public.characters c on c.id=e.character_id
      where e.combat_id=combats.id and c.hospital_until is not null)
    order by id for update
  loop
    select c.* into patient from public.characters c join private.combat_engagements e on e.character_id=c.id
      where e.combat_id=b.id and c.hospital_until is not null order by c.hospital_started_at,c.id limit 1;
    update private.combat_participants p set
      status=case when c.hospital_until is not null then 'defeated' else 'draw' end,
      snapshot=p.snapshot || jsonb_build_object('ship_health',c.ship_health,'crew_health',c.crew_health),
      finished_at=observed_at
      from public.characters c where p.combat_id=b.id and p.character_id=c.id and p.status='active';
    update private.combats set state=state || jsonb_build_object('status','completed','outcome','draw','winner_id',null,
      'defender',state->'defender' || (select jsonb_build_object('ship_health',ship_health,'crew_health',crew_health)
        from public.characters where id=b.defender_id)),finished_at=observed_at,deadline=observed_at where id=b.id;
    update public.characters set ship_recovery_at=observed_at,crew_recovery_at=observed_at,
      protected_until=observed_at+make_interval(secs=>{{gameplay.combat.protectionSeconds}})
      where id in(select character_id from private.combat_engagements where combat_id=b.id);
    perform private.append_combat_event(b.id,patient.id,gen_random_uuid(),
      jsonb_build_object('kind','hospital','actor_name',patient.display_name,'at',observed_at,'outcome','draw'));
    delete from private.combat_engagements where combat_id=b.id;
    perform private.notify_combat(b.id);
  end loop;
end;
$$;

create or replace function private.settle_combat_context(captain_ids uuid[])
returns void language plpgsql volatile security invoker set search_path='' as $$
declare p record; captain_id uuid;
begin
  perform private.lock_combat_context(captain_ids);
  perform private.interrupt_hospital_combats(captain_ids);
  for p in select cp.combat_id,cp.character_id,cp.deadline from private.combat_participants cp
    where cp.status='active' and cp.deadline<=clock_timestamp()
      and cp.combat_id in(select combat_id from private.combat_engagements where character_id=any(captain_ids))
    order by cp.deadline,cp.character_id
  loop
    perform private.advance_shared_combat(p.combat_id,p.character_id,'retreat',gen_random_uuid(),p.deadline,true);
  end loop;
  for captain_id in select distinct id from unnest(captain_ids) id where id is not null order by id loop
    perform private.settle_hospital(captain_id,clock_timestamp());
  end loop;
end;
$$;
revoke all on function private.settle_hospital(uuid,timestamptz),private.assert_can_act(uuid),
  private.interrupt_hospital_combats(uuid[]) from public,anon,authenticated;

create or replace function private.save_defence_orders(preset text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare viewer_id uuid:=private.combat_captain();
begin
  if preset is null or preset not in ('cannon','boarding') then raise exception 'INVALID_PRESET' using errcode='22023'; end if;
  perform private.settle_combat_context(array[viewer_id]);
  perform private.assert_can_act(viewer_id);
  update public.characters set defence_order=preset where id=viewer_id;
  return jsonb_build_object('preset',preset);
end;
$$;

create or replace function public.get_navigation_lock()
returns jsonb language sql volatile security invoker set search_path='' as $$
  select jsonb_build_object('attack',s->'active_attack','hospital_until',s->'hospital_until')
  from (select public.get_game_state() s) state;
$$;
revoke all on function public.get_navigation_lock() from public,anon,authenticated;
grant execute on function public.get_navigation_lock() to authenticated;

create or replace function public.list_hospital_patients(requested_page integer default 0)
returns jsonb language sql stable security invoker set search_path='' as $$
  with patients as (
    select * from public.hospital_patients where hospital_until>now()
  ), totals as (
    select count(*)::integer total,min(hospital_until) next_discharge_at from patients
  ), paging as (
    select total,next_discharge_at,least(greatest(coalesce(requested_page,0),0),
      greatest(0,(total-1)/{{gameplay.harbor.pageSize}})) page from totals
  )
  select jsonb_build_object('total',total,'page',page,'observed_at',now(),'next_discharge_at',next_discharge_at,
    'patients',coalesce((select jsonb_agg(to_jsonb(p) order by p.display_name,p.character_id)
      from (select * from patients order by display_name,character_id
        limit {{gameplay.harbor.pageSize}} offset paging.page*{{gameplay.harbor.pageSize}}) p),'[]'::jsonb))
    from paging;
$$;
revoke all on function public.list_hospital_patients(integer) from public,anon,authenticated;
grant execute on function public.list_hospital_patients(integer) to authenticated;

