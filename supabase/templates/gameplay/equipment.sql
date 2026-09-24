-- Equipment stats live on definitions as ranges; instances keep only their rolled Quality.
alter table private.item_definitions
  add column if not exists damage_min numeric(7,2),add column if not exists damage_max numeric(7,2),
  add column if not exists precision_min numeric(5,2),add column if not exists precision_max numeric(5,2),
  add column if not exists armor_min numeric(5,2),add column if not exists armor_max numeric(5,2),
  add column if not exists health_min numeric(7,2),add column if not exists health_max numeric(7,2),
  add column if not exists speed_min numeric(6,2),add column if not exists speed_max numeric(6,2),
  add column if not exists shots integer;
-- The former crew weapon slot became the melee slot.
alter table private.item_definitions drop constraint if exists item_definitions_slot_check;
update private.item_definitions set slot='melee' where slot='crew_weapon';
alter table private.item_definitions add constraint item_definitions_slot_check
  check(slot in ('firearm','melee','head','body','legs','feet','cannons','hull','sails'));

create or replace function private.roll_item_quality()
returns numeric language sql volatile security invoker set search_path='' as $$
  select floor(private.combat_roll()*10001)::numeric/100;
$$;
revoke all on function private.roll_item_quality() from public,anon,authenticated;

-- Instances created before Quality existed are appraised at the midpoint.
alter table private.item_instances add column if not exists quality numeric(5,2);
update private.item_instances set quality=50 where quality is null;
alter table private.item_instances alter column quality set not null,
  alter column quality set default private.roll_item_quality(),
  drop constraint if exists item_instances_quality_check,
  add constraint item_instances_quality_check check(quality between 0 and 100),
  drop column if exists damage,drop column if exists accuracy;
comment on table private.item_instances is 'Owned equipment. Stats derive from the definition ranges and the instance Quality.';
do $owner_key$ begin
  if not exists(select 1 from pg_constraint where conname='item_instances_id_owner_key' and conrelid='private.item_instances'::regclass) then
    alter table private.item_instances add constraint item_instances_id_owner_key unique(id,character_id);
  end if;
end $owner_key$;

-- Historical listings keep their legacy stats next to the Quality of newer listings.
alter table private.market_listings add column if not exists quality numeric(5,2);
update private.market_listings set quality=50 where entry_type='instance' and quality is null;
alter table private.market_listings drop constraint if exists market_listings_check3,
  drop constraint if exists market_listings_check4,drop constraint if exists market_listings_quality_check,
  add constraint market_listings_quality_check check((entry_type='stack' and quality is null and damage is null and accuracy is null)
    or (entry_type='instance' and initial_quantity=1 and quality between 0 and 100));
comment on column private.market_listings.damage is 'Legacy per-instance stat from before Quality. Not written for new listings.';
comment on column private.market_listings.accuracy is 'Legacy per-instance stat from before Quality. Not written for new listings.';

create table if not exists private.character_equipment(
  character_id uuid not null references public.characters(id) on delete cascade,
  slot text not null check(slot in ('firearm','melee','head','body','legs','feet','cannons','hull','sails')),
  instance_id uuid not null unique,
  equipped_at timestamptz not null default clock_timestamp(),
  primary key(character_id,slot),
  foreign key(instance_id,character_id) references private.item_instances(id,character_id) on delete cascade
);
comment on table private.character_equipment is 'One equipped instance per captain and slot. Owners change it through equip_item and unequip_item.';
alter table private.character_equipment enable row level security;
revoke all on private.character_equipment from public,anon,authenticated;

alter table private.combat_participants add column if not exists defender_shots integer not null default 0;
alter table private.combat_participants drop constraint if exists combat_participants_defender_shots_check,
  add constraint combat_participants_defender_shots_check check(defender_shots>=0);
-- Per attacker pair: the defender's remaining temporary uses and the effects that currently weaken it.
alter table private.combat_participants add column if not exists defender_temporary_uses integer not null default 0,
  add column if not exists defender_effects jsonb not null default '{}'::jsonb;
alter table private.combat_participants drop constraint if exists combat_participants_defender_temporary_uses_check,
  add constraint combat_participants_defender_temporary_uses_check check(defender_temporary_uses>=0);

-- The temporary slot points at a stackable item type; each use consumes one from the stack.
create table if not exists private.character_temporary(
  character_id uuid primary key references public.characters(id) on delete cascade,
  item_id text not null references private.item_definitions(id),
  equipped_at timestamptz not null default clock_timestamp()
);
comment on table private.character_temporary is 'Temporary item type chosen by each captain. Owners change it through equip_item and unequip_item.';
alter table private.character_temporary enable row level security;
revoke all on private.character_temporary from public,anon,authenticated;
create index if not exists character_temporary_item_idx on private.character_temporary(item_id);

create or replace function private.temporary_catalog()
returns table(item_id text,damage numeric,weapon_precision numeric,debuff_multiplier numeric,debuff_rounds integer)
language sql immutable security invoker set search_path='' as $$
  select * from (values {{equipment.temporariesSql}}) t(item_id,damage,weapon_precision,debuff_multiplier,debuff_rounds);
$$;

create or replace function private.stack_quantity(captain_id uuid,target_item text)
returns bigint language sql stable security invoker set search_path='' as $$
  select coalesce((select quantity from private.item_stacks where character_id=captain_id and item_id=target_item),0);
$$;

-- Caller holds the character lock. Returns false when nothing is left to consume.
create or replace function private.consume_stack(captain_id uuid,target_item text)
returns boolean language plpgsql volatile security invoker set search_path='' as $$
begin
  update private.item_stacks set quantity=quantity-1 where character_id=captain_id and item_id=target_item and quantity>1;
  if found then return true; end if;
  delete from private.item_stacks where character_id=captain_id and item_id=target_item and quantity=1;
  return found;
end;
$$;

create or replace function private.character_temporary_loadout(captain_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_strip_nulls(jsonb_build_object('item_id',d.id,'name',d.name,'image_path',d.image_path,
    'quantity',private.stack_quantity(captain_id,d.id),'damage',t.damage,'precision',t.weapon_precision,
    'debuff_multiplier',t.debuff_multiplier,'debuff_rounds',t.debuff_rounds))
  from private.character_temporary c join private.item_definitions d on d.id=c.item_id
  join private.temporary_catalog() t on t.item_id=c.item_id where c.character_id=captain_id;
$$;

create or replace function private.equipment_stat(minimum numeric,maximum numeric,quality numeric)
returns numeric language sql immutable strict security invoker set search_path='' as $$
  select round(minimum+(maximum-minimum)*quality/100,2);
$$;

create or replace function private.item_stats(d private.item_definitions,quality numeric)
returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_strip_nulls(jsonb_build_object('quality',quality,
    'damage',private.equipment_stat(d.damage_min,d.damage_max,quality),
    'precision',private.equipment_stat(d.precision_min,d.precision_max,quality),
    'armor',private.equipment_stat(d.armor_min,d.armor_max,quality),
    'health',round(private.equipment_stat(d.health_min,d.health_max,quality))::integer,
    'speed',private.equipment_stat(d.speed_min,d.speed_max,quality),
    'shots',d.shots));
$$;

create or replace function private.character_loadout(captain_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  select coalesce((select jsonb_object_agg(e.slot,private.item_stats(d,i.quality)
    ||jsonb_build_object('entry_id',i.id,'item_id',d.id,'name',d.name,'image_path',d.image_path))
    from private.character_equipment e join private.item_instances i on i.id=e.instance_id
    join private.item_definitions d on d.id=i.item_id where e.character_id=captain_id),'{}'::jsonb)
    ||coalesce((select jsonb_build_object('temporary',t) from private.character_temporary_loadout(captain_id) t where t is not null),'{}'::jsonb);
$$;

create or replace function private.ship_health_max(captain_id uuid)
returns integer language sql stable security invoker set search_path='' as $$
  select {{gameplay.resources.healthMax}}+coalesce((select round(private.equipment_stat(d.health_min,d.health_max,i.quality))::integer
    from private.character_equipment e join private.item_instances i on i.id=e.instance_id
    join private.item_definitions d on d.id=i.item_id where e.character_id=captain_id and e.slot='hull'),0)
    +private.battling_health_bonus(private.character_skill_level(captain_id,'ship_battling'));
$$;

-- Caller holds the character lock. Recovery so far uses the maximum that applied until now.
create or replace function private.settle_ship_health(captain_id uuid,observed_at timestamptz)
returns void language sql volatile security invoker set search_path='' as $$
  update public.characters set ship_health=private.health_snapshot(ship_health,ship_recovery_at,observed_at,
    {{gameplay.resources.shipRecoverySeconds}},private.ship_health_max(id)),ship_recovery_at=observed_at where id=captain_id;
  update public.characters set ship_health=private.ship_health_max(id) where id=captain_id and ship_health>private.ship_health_max(id);
$$;
-- Settles both health values around a change of maximum. Combat and Hospital pause recovery, so they are left alone.
create or replace function private.settle_health(captain_id uuid,observed_at timestamptz)
returns void language plpgsql volatile security invoker set search_path='' as $$
begin
  if exists(select 1 from private.combat_engagements where character_id=captain_id)
    or not exists(select 1 from public.characters where id=captain_id and hospital_until is null) then return; end if;
  perform private.settle_ship_health(captain_id,observed_at);
  update public.characters set crew_health=private.health_snapshot(crew_health,crew_recovery_at,observed_at,
    {{gameplay.resources.crewRecoverySeconds}},private.crew_health_max(id)),crew_recovery_at=observed_at where id=captain_id;
end;
$$;
revoke all on function private.equipment_stat(numeric,numeric,numeric),private.item_stats(private.item_definitions,numeric),
  private.character_loadout(uuid),private.ship_health_max(uuid),private.settle_ship_health(uuid,timestamptz),private.settle_health(uuid,timestamptz),private.temporary_catalog(),
  private.stack_quantity(uuid,text),private.consume_stack(uuid,text),private.character_temporary_loadout(uuid) from public,anon,authenticated;

create or replace function private.equip_item(entry_id uuid,request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare viewer_id uuid:=private.combat_captain(); previous private.inventory_requests%rowtype;
  item private.item_instances%rowtype; definition private.item_definitions%rowtype; stack private.item_stacks%rowtype;
  payload jsonb; result jsonb; replaced uuid; observed_at timestamptz; replaced_item text;
begin
  if request_id is null or entry_id is null then raise exception 'INVALID_REQUEST' using errcode='22023'; end if;
  payload:=jsonb_build_object('action','equip','entry_id',entry_id);
  perform private.settle_combat_context(array[viewer_id]);
  select * into previous from private.inventory_requests r where r.character_id=viewer_id and r.request_id=equip_item.request_id;
  if found then
    if previous.payload<>payload then raise exception 'REQUEST_CONFLICT' using errcode='22023'; end if;
    return previous.result;
  end if;
  perform private.assert_can_act(viewer_id);
  select * into item from private.item_instances i where i.id=entry_id and i.character_id=viewer_id for update;
  if not found then
    -- A stack can only be equipped as the crew temporary.
    select * into stack from private.item_stacks s where s.id=entry_id and s.character_id=viewer_id for update;
    if not found then raise exception 'ITEM_NOT_FOUND' using errcode='P0001'; end if;
    if not exists(select 1 from private.temporary_catalog() t where t.item_id=stack.item_id) then
      raise exception 'NOT_EQUIPPABLE' using errcode='P0001'; end if;
    select name into definition.name from private.item_definitions where id=stack.item_id;
    select c.item_id into replaced_item from private.character_temporary c where c.character_id=viewer_id for update;
    insert into private.character_temporary(character_id,item_id,equipped_at) values(viewer_id,stack.item_id,clock_timestamp())
      on conflict(character_id) do update set item_id=excluded.item_id,equipped_at=excluded.equipped_at;
    result:=jsonb_build_object('action','equip','entry_id',stack.id,'slot','temporary','name',definition.name,
      'replaced_item_id',case when replaced_item is distinct from stack.item_id then replaced_item end);
    insert into private.inventory_requests(character_id,request_id,payload,result) values(viewer_id,request_id,payload,result);
    perform private.notify_training(viewer_id);
    return result;
  end if;
  select * into definition from private.item_definitions where id=item.item_id;
  observed_at:=clock_timestamp();
  if definition.slot='hull' then perform private.settle_ship_health(viewer_id,observed_at); end if;
  select e.instance_id into replaced from private.character_equipment e where e.character_id=viewer_id and e.slot=definition.slot for update;
  insert into private.character_equipment(character_id,slot,instance_id,equipped_at) values(viewer_id,definition.slot,item.id,observed_at)
    on conflict(character_id,slot) do update set instance_id=excluded.instance_id,equipped_at=excluded.equipped_at;
  if definition.slot='hull' then perform private.settle_ship_health(viewer_id,observed_at); end if;
  result:=jsonb_build_object('action','equip','entry_id',item.id,'slot',definition.slot,'name',definition.name,
    'replaced_entry_id',case when replaced is distinct from item.id then replaced end);
  insert into private.inventory_requests(character_id,request_id,payload,result) values(viewer_id,request_id,payload,result);
  perform private.notify_training(viewer_id);
  return result;
end;
$$;
revoke all on function private.equip_item(uuid,uuid) from public,anon,authenticated;
grant execute on function private.equip_item(uuid,uuid) to authenticated;
create or replace function public.equip_item(entry_id uuid,request_id uuid)
returns jsonb language sql volatile security invoker set search_path='' as $$
  select private.equip_item(entry_id,request_id);
$$;
revoke all on function public.equip_item(uuid,uuid) from public,anon,authenticated;
grant execute on function public.equip_item(uuid,uuid) to authenticated;

create or replace function private.unequip_item(equipment_slot text,request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare viewer_id uuid:=private.combat_captain(); previous private.inventory_requests%rowtype;
  payload jsonb; result jsonb; removed uuid; item_name text; observed_at timestamptz; removed_item text;
begin
  if request_id is null then raise exception 'INVALID_REQUEST' using errcode='22023'; end if;
  if equipment_slot is null or equipment_slot not in ('firearm','melee','head','body','legs','feet','cannons','hull','sails','temporary') then
    raise exception 'INVALID_SLOT' using errcode='22023'; end if;
  payload:=jsonb_build_object('action','unequip','slot',equipment_slot);
  perform private.settle_combat_context(array[viewer_id]);
  select * into previous from private.inventory_requests r where r.character_id=viewer_id and r.request_id=unequip_item.request_id;
  if found then
    if previous.payload<>payload then raise exception 'REQUEST_CONFLICT' using errcode='22023'; end if;
    return previous.result;
  end if;
  perform private.assert_can_act(viewer_id);
  if equipment_slot='temporary' then
    delete from private.character_temporary c where c.character_id=viewer_id returning c.item_id into removed_item;
    if removed_item is null then raise exception 'NOT_EQUIPPED' using errcode='P0001'; end if;
    result:=jsonb_build_object('action','unequip','entry_id',(select s.id from private.item_stacks s where s.character_id=viewer_id and s.item_id=removed_item),
      'slot','temporary','name',(select name from private.item_definitions where id=removed_item));
    insert into private.inventory_requests(character_id,request_id,payload,result) values(viewer_id,request_id,payload,result);
    perform private.notify_training(viewer_id);
    return result;
  end if;
  observed_at:=clock_timestamp();
  if equipment_slot='hull' then perform private.settle_ship_health(viewer_id,observed_at); end if;
  delete from private.character_equipment e where e.character_id=viewer_id and e.slot=equipment_slot returning e.instance_id into removed;
  if removed is null then raise exception 'NOT_EQUIPPED' using errcode='P0001'; end if;
  if equipment_slot='hull' then perform private.settle_ship_health(viewer_id,observed_at); end if;
  select d.name into item_name from private.item_instances i join private.item_definitions d on d.id=i.item_id where i.id=removed;
  result:=jsonb_build_object('action','unequip','entry_id',removed,'slot',equipment_slot,'name',item_name);
  insert into private.inventory_requests(character_id,request_id,payload,result) values(viewer_id,request_id,payload,result);
  perform private.notify_training(viewer_id);
  return result;
end;
$$;
revoke all on function private.unequip_item(text,uuid) from public,anon,authenticated;
grant execute on function private.unequip_item(text,uuid) to authenticated;
create or replace function public.unequip_item(equipment_slot text,request_id uuid)
returns jsonb language sql volatile security invoker set search_path='' as $$
  select private.unequip_item(equipment_slot,request_id);
$$;
revoke all on function public.unequip_item(text,uuid) from public,anon,authenticated;
grant execute on function public.unequip_item(text,uuid) to authenticated;
