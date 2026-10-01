create or replace function private.loot_document(target_id text)
returns jsonb language sql stable security invoker set search_path='' as $$
  select to_jsonb(t)||jsonb_build_object('entries',coalesce((
    select jsonb_agg(to_jsonb(e)-'loot_table_id' order by e.item_id)
    from private.loot_entries e where e.loot_table_id=t.id),'[]'::jsonb))
  from private.loot_tables t where t.id=target_id;
$$;
revoke all on function private.loot_document(text) from public,anon,authenticated;

-- Fixed percentages belong to successful catches. Weighted entries divide only the remainder.
create or replace function private.loot_distribution(target_id text,skill_level integer,mastery_level integer)
returns table(item_id text,chance numeric) language sql stable security invoker set search_path='' as $$
  with weights as (
    select e.*,e.weight_start+(e.weight_end-e.weight_start)*
      least(1::numeric,greatest(0::numeric,(skill_level-1)::numeric/(mastery_level-1))) weight
    from private.loot_entries e where e.loot_table_id=target_id
  ), totals as (
    select coalesce(sum(fixed_chance),0) fixed_total,
      coalesce(sum(weight) filter(where mode='weighted'),0) weight_total from weights
  )
  select w.item_id,case when mode='fixed' then fixed_chance
    else (100-fixed_total)*weight/nullif(weight_total,0) end from weights w cross join totals;
$$;
revoke all on function private.loot_distribution(text,integer,integer) from public,anon,authenticated;

create or replace function private.roll_activity_loot(target_id uuid,activity_id text,skill_level integer)
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare
  binding private.activity_loot%rowtype; loot private.loot_tables%rowtype;
  item private.item_definitions%rowtype; entry private.loot_entries%rowtype;
  success_chance numeric; pick numeric; cumulative numeric:=0; option record; selected_id text;
begin
  select * into binding from private.activity_loot a where a.activity_id=roll_activity_loot.activity_id for share;
  if not found or binding.loot_table_id is null then return null; end if;
  select * into loot from private.loot_tables where id=binding.loot_table_id for share;
  if not found or not loot.active then raise exception 'LOOT_UNAVAILABLE'; end if;
  success_chance:=binding.success_start+(binding.success_end-binding.success_start)*
    least(1::numeric,greatest(0::numeric,(skill_level-1)::numeric/(binding.mastery_level-1)));
  if random()*100>=success_chance then
    return jsonb_build_object('caught',false,'table_id',loot.id,'table_version',loot.version,
      'skill_level',skill_level,'success_chance',success_chance);
  end if;
  pick:=random()*100;
  for option in select d.* from private.loot_distribution(loot.id,skill_level,binding.mastery_level) d
    join private.loot_entries e on e.loot_table_id=loot.id and e.item_id=d.item_id
    order by case when e.mode='fixed' then 0 else 1 end,d.item_id loop
    cumulative:=cumulative+coalesce(option.chance,0);
    if pick<cumulative then selected_id:=option.item_id; exit; end if;
  end loop;
  if selected_id is null then raise exception 'LOOT_UNAVAILABLE'; end if;
  select * into item from private.item_definitions where id=selected_id and active for share;
  if not found then raise exception 'LOOT_UNAVAILABLE'; end if;
  select * into entry from private.loot_entries where loot_table_id=loot.id and item_id=selected_id;
  if item.stackable then
    if coalesce((select quantity from private.item_stacks where character_id=target_id and item_id=selected_id),0)>9007199254740991-entry.quantity then
      raise exception 'INVENTORY_FULL'; end if;
    insert into private.item_stacks(character_id,item_id,quantity) values(target_id,selected_id,entry.quantity)
      on conflict(character_id,item_id) do update set quantity=item_stacks.quantity+excluded.quantity;
  else
    insert into private.item_instances(character_id,item_id,quality)
      select target_id,selected_id,private.roll_item_quality() from generate_series(1,entry.quantity);
  end if;
  return jsonb_build_object('caught',true,'table_id',loot.id,'table_version',loot.version,'skill_level',skill_level,
    'success_chance',success_chance,'item_id',item.id,'name',item.name,'image_path',item.image_path,'quantity',entry.quantity);
end;
$$;
revoke all on function private.roll_activity_loot(uuid,text,integer) from public,anon,authenticated;

create or replace function private.admin_save_item(payload jsonb)
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare old_row jsonb; new_row jsonb; identifier text:=payload->>'id'; image text; captains uuid[];
begin
  if identifier='new' then raise exception 'INVALID_CONTENT_ID' using errcode='22023'; end if;
  -- Captains with this Hull equipped settle health at the old maximum first. Their locks come
  -- before the content lock, like every other path, and a captain who equips it meanwhile retries.
  select coalesce(array_agg(e.character_id order by e.character_id),'{}') into captains from private.character_equipment e
    join private.item_instances i on i.id=e.instance_id where i.item_id=identifier and e.slot='hull';
  if cardinality(captains)>0 then
    perform private.lock_combat_context(captains);
    if captains is distinct from (select coalesce(array_agg(e.character_id order by e.character_id),'{}') from private.character_equipment e
      join private.item_instances i on i.id=e.instance_id where i.item_id=identifier and e.slot='hull') then
      raise exception 'EQUIPMENT_CHANGED' using errcode='40001'; end if;
    perform private.settle_health(captain,clock_timestamp()) from unnest(captains) captain;
  end if;
  perform pg_advisory_xact_lock(74192,1);
  select to_jsonb(i) into old_row from private.item_definitions i where id=identifier for update;
  if (old_row is null and payload->>'version' is not null)
    or (old_row is not null and payload->>'version' is distinct from md5(old_row::text)) then
    raise exception 'STALE_ROW' using errcode='P0001'; end if;
  if old_row is not null and (old_row->>'kind' is distinct from payload->>'kind'
    or old_row->>'slot' is distinct from nullif(payload->>'slot','none')) then
    raise exception 'ITEM_SHAPE_LOCKED' using errcode='22023'; end if;
  if coalesce(jsonb_typeof(payload->'stats'),'null')<>'null' and (jsonb_typeof(payload->'stats')<>'object' or exists(
    select 1 from jsonb_each(payload->'stats') stat where stat.key not in ('damage','precision','armor','health','speed','shots')
      or (stat.key='shots' and (jsonb_typeof(stat.value)<>'number' or (stat.value#>>'{}')::numeric<>trunc((stat.value#>>'{}')::numeric)))
      or (stat.key<>'shots' and (jsonb_typeof(stat.value)<>'object' or jsonb_typeof(stat.value->'min')<>'number'
        or jsonb_typeof(stat.value->'max')<>'number' or trunc((stat.value->>'min')::numeric,2)<>(stat.value->>'min')::numeric
        or trunc((stat.value->>'max')::numeric,2)<>(stat.value->>'max')::numeric)))) then
    raise exception 'INVALID_STATS' using errcode='22023'; end if;
  if not (payload->>'active')::boolean and exists(select 1 from private.loot_entries e
    join private.loot_tables t on t.id=e.loot_table_id where e.item_id=identifier and t.active) then
    raise exception 'ITEM_IN_LOOT' using errcode='22023'; end if;
  image:=coalesce(nullif(payload->>'image_path',''),'/images/items/placeholder.svg');
  if image like '/api/item-images/%' and not exists(select 1 from storage.objects
    where bucket_id='item-images' and name=substr(image,length('/api/item-images/')+1)) then
    raise exception 'INVALID_IMAGE' using errcode='22023'; end if;
  begin
    insert into private.item_definitions(id,category_id,name,description,effect_description,image_path,kind,stackable,slot,active,tradable,managed_by_admin,
      damage_min,damage_max,precision_min,precision_max,armor_min,armor_max,health_min,health_max,speed_min,speed_max,shots)
    values(identifier,payload->>'category_id',btrim(payload->>'name'),btrim(payload->>'description'),
      coalesce(nullif(btrim(payload->>'effect_description'),''),'No active effect.'),image,payload->>'kind',
      payload->>'kind'<>'equipment',nullif(payload->>'slot','none'),(payload->>'active')::boolean,(payload->>'tradable')::boolean,true,
      (payload#>>'{stats,damage,min}')::numeric,(payload#>>'{stats,damage,max}')::numeric,
      (payload#>>'{stats,precision,min}')::numeric,(payload#>>'{stats,precision,max}')::numeric,
      (payload#>>'{stats,armor,min}')::numeric,(payload#>>'{stats,armor,max}')::numeric,
      (payload#>>'{stats,health,min}')::numeric,(payload#>>'{stats,health,max}')::numeric,
      (payload#>>'{stats,speed,min}')::numeric,(payload#>>'{stats,speed,max}')::numeric,(payload#>>'{stats,shots}')::integer)
    on conflict(id) do update set category_id=excluded.category_id,name=excluded.name,description=excluded.description,
      effect_description=excluded.effect_description,image_path=excluded.image_path,active=excluded.active,tradable=excluded.tradable,managed_by_admin=true,
      damage_min=excluded.damage_min,damage_max=excluded.damage_max,precision_min=excluded.precision_min,precision_max=excluded.precision_max,
      armor_min=excluded.armor_min,armor_max=excluded.armor_max,health_min=excluded.health_min,health_max=excluded.health_max,
      speed_min=excluded.speed_min,speed_max=excluded.speed_max,shots=excluded.shots
    returning to_jsonb(item_definitions) into new_row;
  exception when check_violation or numeric_value_out_of_range then
    if sqlerrm like '%item_definitions_equipment_stats_check%' or sqlerrm like '%numeric field overflow%' then
      raise exception 'INVALID_STATS' using errcode='22023'; end if;
    raise;
  end;
  perform private.settle_health(captain,clock_timestamp()) from unnest(captains) captain;
  return jsonb_build_object('before',old_row,'after',new_row,'message','Item saved.','id',identifier);
end;
$$;
revoke all on function private.admin_save_item(jsonb) from public,anon,authenticated;

create or replace function private.admin_save_loot_table(payload jsonb)
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare
  identifier text:=payload->>'id'; old_row jsonb; entries jsonb:=payload->'entries'; entry jsonb;
  fixed_total numeric; start_total numeric; end_total numeric;
begin
  if identifier='new' then raise exception 'INVALID_CONTENT_ID' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(74192,1);
  perform 1 from private.loot_tables where id=identifier for update;
  old_row:=private.loot_document(identifier);
  if (old_row is null and payload->>'version' is not null)
    or (old_row is not null and payload->>'version' is distinct from old_row->>'version') then
    raise exception 'STALE_ROW' using errcode='P0001'; end if;
  if entries is null or jsonb_typeof(entries)<>'array' or jsonb_array_length(entries) not between 1 and 50 then
    raise exception 'INVALID_LOOT' using errcode='22023'; end if;
  if not (payload->>'active')::boolean and exists(select 1 from private.activity_loot where loot_table_id=identifier) then
    raise exception 'LOOT_IN_USE' using errcode='22023'; end if;
  insert into private.loot_tables(id,name,description,active) values(identifier,btrim(payload->>'name'),
    coalesce(payload->>'description',''),(payload->>'active')::boolean)
  on conflict(id) do update set name=excluded.name,description=excluded.description,active=excluded.active,version=gen_random_uuid();
  delete from private.loot_entries where loot_table_id=identifier;
  for entry in select value from jsonb_array_elements(entries) loop
    if not exists(select 1 from private.item_definitions where id=entry->>'item_id' and (active or not (payload->>'active')::boolean)) then
      raise exception 'INVALID_ITEM' using errcode='22023'; end if;
    insert into private.loot_entries(loot_table_id,item_id,mode,fixed_chance,weight_start,weight_end,quantity)
    values(identifier,entry->>'item_id',entry->>'mode',(entry->>'fixed_chance')::numeric,
      (entry->>'weight_start')::numeric,(entry->>'weight_end')::numeric,(entry->>'quantity')::integer);
  end loop;
  select sum(fixed_chance),sum(weight_start),sum(weight_end) into fixed_total,start_total,end_total
    from private.loot_entries where loot_table_id=identifier;
  if fixed_total>100 or (fixed_total<100 and (start_total<=0 or end_total<=0)) then
    raise exception 'INVALID_LOOT_TOTAL' using errcode='22023'; end if;
  return jsonb_build_object('before',old_row,'after',private.loot_document(identifier),'message','Loot table saved.','id',identifier);
end;
$$;
revoke all on function private.admin_save_loot_table(jsonb) from public,anon,authenticated;

create or replace function private.admin_save_activity_loot(payload jsonb)
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare old_row jsonb; new_row jsonb; identifier text:=payload->>'activity_id';
begin
  if identifier='new' then raise exception 'INVALID_CONTENT_ID' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(74192,1);
  select to_jsonb(a) into old_row from private.activity_loot a where activity_id=identifier for update;
  if (old_row is null and payload->>'version' is not null)
    or (old_row is not null and payload->>'version' is distinct from old_row->>'version') then
    raise exception 'STALE_ROW' using errcode='P0001'; end if;
  if nullif(payload->>'loot_table_id','') is not null and not exists(select 1 from private.loot_tables
    where id=payload->>'loot_table_id' and active) then raise exception 'LOOT_UNAVAILABLE' using errcode='22023'; end if;
  insert into private.activity_loot(activity_id,loot_table_id,success_start,success_end,mastery_level)
    values(identifier,nullif(payload->>'loot_table_id',''),(payload->>'success_start')::numeric,
      (payload->>'success_end')::numeric,(payload->>'mastery_level')::integer)
  on conflict(activity_id) do update set loot_table_id=excluded.loot_table_id,success_start=excluded.success_start,
    success_end=excluded.success_end,mastery_level=excluded.mastery_level,version=gen_random_uuid()
  returning to_jsonb(activity_loot) into new_row;
  return jsonb_build_object('before',old_row,'after',new_row,'message','Activity loot saved.','id',identifier);
end;
$$;
revoke all on function private.admin_save_activity_loot(jsonb) from public,anon,authenticated;

create or replace function private.admin_get_loot_table(target_id text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
begin
  perform private.require_admin();
  return private.loot_document(target_id);
end;
$$;
revoke all on function private.admin_get_loot_table(text) from public,anon,authenticated;
grant execute on function private.admin_get_loot_table(text) to authenticated;
create or replace function public.admin_get_loot_table(target_id text)
returns jsonb language sql volatile security invoker set search_path='' as $$ select private.admin_get_loot_table(target_id); $$;
revoke all on function public.admin_get_loot_table(text) from public,anon,authenticated;
grant execute on function public.admin_get_loot_table(text) to authenticated;
