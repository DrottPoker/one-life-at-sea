-- Definitions are durable. Removing a definition or changing its ownership shape is rejected.
{{inventory.catalogSql}}
-- Admin-authored weapons from before stat ranges fight like the fallback weapons until edited.
update private.item_definitions set damage_min={{gameplay.equipment.fallbackWeapons.melee.damage}},damage_max={{gameplay.equipment.fallbackWeapons.melee.damage}},
  precision_min={{gameplay.equipment.fallbackWeapons.melee.precision}},precision_max={{gameplay.equipment.fallbackWeapons.melee.precision}}
  where slot in ('melee','cannons') and damage_min is null;
alter table private.item_definitions drop constraint if exists item_definitions_equipment_stats_check,
  add constraint item_definitions_equipment_stats_check check(
    (damage_min is not null)=coalesce(slot in ('firearm','melee','cannons'),false) and (damage_max is not null)=(damage_min is not null)
    and (precision_min is not null)=coalesce(slot in ('firearm','melee','cannons'),false) and (precision_max is not null)=(precision_min is not null)
    and (armor_min is not null)=coalesce(slot in ('head','body','legs','feet','hull','sails'),false) and (armor_max is not null)=(armor_min is not null)
    and (health_min is not null)=coalesce(slot='hull',false) and (health_max is not null)=(health_min is not null)
    and (speed_min is not null)=coalesce(slot='sails',false) and (speed_max is not null)=(speed_min is not null)
    and (shots is not null)=coalesce(slot='firearm',false)
    and coalesce(damage_min>0 and damage_min<=damage_max and damage_max<={{gameplay.equipment.limits.maxDamage}},true)
    and coalesce(precision_min>=0 and precision_min<=precision_max and precision_max<=100,true)
    and coalesce(armor_min>=0 and armor_min<=armor_max and armor_max<={{gameplay.equipment.limits.maxArmor}},true)
    and coalesce(health_min>=0 and health_min<=health_max and health_max<={{gameplay.equipment.limits.maxShipHealth}}
      and health_min=trunc(health_min) and health_max=trunc(health_max),true)
    and coalesce(speed_min>=0 and speed_min<=speed_max and speed_max<={{gameplay.equipment.limits.maxSpeed}},true)
    and coalesce(shots between 1 and {{gameplay.equipment.limits.maxShots}},true));

create or replace function private.list_inventory(category_id text default null,search_term text default '',requested_page integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  viewer_id uuid:=private.combat_captain();
  page_size integer:={{gameplay.inventory.pageSize}};
  result jsonb;
begin
  if requested_page is null or requested_page<0 or search_term is null or length(search_term)>100 then
    raise exception 'INVALID_FILTER' using errcode='22023'; end if;
  if category_id is not null and not exists(select 1 from private.item_categories c where c.id=category_id) then
    raise exception 'INVALID_CATEGORY' using errcode='22023'; end if;
  with owned as (
    select s.id,'stack'::text entry_type,s.item_id,s.quantity,null::numeric quality,
      case when exists(select 1 from private.character_temporary t where t.character_id=viewer_id and t.item_id=s.item_id) then 'temporary' end equipped_slot
      from private.item_stacks s where s.character_id=viewer_id
    union all
    select i.id,'instance',i.item_id,1::bigint,i.quality,e.slot
      from private.item_instances i left join private.character_equipment e on e.instance_id=i.id where i.character_id=viewer_id
  ), matching as (
    select o.id,o.entry_type,o.item_id,o.quantity,o.equipped_slot,
      coalesce(d.slot,case when exists(select 1 from private.temporary_catalog() t where t.item_id=o.item_id) then 'temporary' end) slot,
      case when o.quality is not null then private.item_stats(d,o.quality) end stats,
      d.name,d.category_id,d.kind,d.description,d.effect_description,d.image_path
      from owned o join private.item_definitions d on d.id=o.item_id
      where (list_inventory.category_id is null or d.category_id=list_inventory.category_id)
        and strpos(lower(d.name),lower(btrim(search_term)))>0
  ), bounds as (
    select count(*) total,least(requested_page,greatest(0,(count(*)-1)/page_size))::integer page from matching
  ), items as (
    select m.*,c.total::text circulation,private.item_market_value_at(m.item_id,statement_timestamp())::text market_value from matching m
      join private.item_circulation c on c.item_id=m.item_id
      order by lower(m.name) collate "C",m.item_id,m.id,m.entry_type
      limit page_size offset (select page::bigint*page_size from bounds)
  )
  select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(i)
      order by lower(i.name) collate "C",i.item_id,i.id,i.entry_type) from items i),'[]'::jsonb),
    'total',b.total,'page',b.page,'page_size',page_size,'loadout',private.character_loadout(viewer_id),
    'ship_health_max',private.ship_health_max(viewer_id)) into result from bounds b;
  return result;
end;
$$;
revoke all on function private.list_inventory(text,text,integer) from public,anon,authenticated;
grant execute on function private.list_inventory(text,text,integer) to authenticated;
create or replace function public.list_inventory(category_id text default null,search_term text default '',requested_page integer default 0)
returns jsonb language sql stable security invoker set search_path='' as $$
  select private.list_inventory(category_id,search_term,requested_page);
$$;
revoke all on function public.list_inventory(text,text,integer) from public,anon,authenticated;
grant execute on function public.list_inventory(text,text,integer) to authenticated;

create or replace function private.trash_inventory_item(entry_id uuid,entry_type text,quantity numeric,request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  viewer_id uuid:=private.combat_captain();
  previous private.inventory_requests%rowtype;
  stack private.item_stacks%rowtype;
  item private.item_instances%rowtype;
  payload jsonb;
  result jsonb;
  amount bigint;
  remaining bigint;
  item_name text;
begin
  if request_id is null or entry_id is null then raise exception 'INVALID_REQUEST' using errcode='22023'; end if;
  if entry_type is null or entry_type not in ('stack','instance') then
    raise exception 'INVALID_ITEM_TYPE' using errcode='22023'; end if;
  if quantity is null or quantity<1 or quantity>9007199254740991 or quantity<>trunc(quantity)
    or (entry_type='instance' and quantity<>1) then
    raise exception 'INVALID_QUANTITY' using errcode='22023'; end if;
  amount:=quantity::bigint;
  payload:=jsonb_build_object('entry_id',entry_id,'entry_type',entry_type,'quantity',amount);
  perform private.settle_combat_context(array[viewer_id]);
  select * into previous from private.inventory_requests r
    where r.character_id=viewer_id and r.request_id=trash_inventory_item.request_id;
  if found then
    if previous.payload<>payload then raise exception 'REQUEST_CONFLICT' using errcode='22023'; end if;
    return previous.result;
  end if;
  perform private.assert_can_act(viewer_id);
  if entry_type='stack' then
    select * into stack from private.item_stacks s where s.id=entry_id and s.character_id=viewer_id for update;
    if not found then raise exception 'ITEM_NOT_FOUND' using errcode='P0001'; end if;
    if stack.quantity<amount then raise exception 'NOT_ENOUGH_ITEMS' using errcode='P0001'; end if;
    select name into item_name from private.item_definitions where id=stack.item_id;
    remaining:=stack.quantity-amount;
    if remaining=0 then delete from private.item_stacks where id=stack.id;
    else update private.item_stacks set quantity=remaining where id=stack.id; end if;
  else
    select * into item from private.item_instances i where i.id=entry_id and i.character_id=viewer_id for update;
    if not found then raise exception 'ITEM_NOT_FOUND' using errcode='P0001'; end if;
    if exists(select 1 from private.character_equipment e where e.instance_id=item.id) then
      raise exception 'ITEM_EQUIPPED' using errcode='P0001'; end if;
    select name into item_name from private.item_definitions where id=item.item_id;
    remaining:=0;
    delete from private.item_instances where id=item.id;
  end if;
  result:=jsonb_build_object('entry_id',entry_id,'entry_type',entry_type,'quantity',amount,
    'name',item_name,'remaining',remaining);
  insert into private.inventory_requests(character_id,request_id,payload,result)
    values(viewer_id,request_id,payload,result);
  perform private.notify_training(viewer_id);
  return result;
end;
$$;
revoke all on function private.trash_inventory_item(uuid,text,numeric,uuid) from public,anon,authenticated;
grant execute on function private.trash_inventory_item(uuid,text,numeric,uuid) to authenticated;
create or replace function public.trash_inventory_item(entry_id uuid,entry_type text,quantity numeric,request_id uuid)
returns jsonb language sql volatile security invoker set search_path='' as $$
  select private.trash_inventory_item(entry_id,entry_type,quantity,request_id);
$$;
revoke all on function public.trash_inventory_item(uuid,text,numeric,uuid) from public,anon,authenticated;
grant execute on function public.trash_inventory_item(uuid,text,numeric,uuid) to authenticated;

