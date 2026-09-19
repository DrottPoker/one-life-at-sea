-- Admin interruption preserves health and snapshots; NULL filters find pending jobs.
create or replace function private.admin_mutate(action text,payload jsonb,request_id uuid,reason text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  actor uuid:=private.require_admin(); previous private.admin_audit%rowtype;
  spec private.admin_resources%rowtype; relation regclass; field text; columns_sql text;
  identity jsonb; patch jsonb; clause text:='true'; primary_fields text[];
  before_row jsonb; after_row jsonb; result jsonb; captain_id uuid;
  definition private.item_definitions%rowtype; amount numeric; damage_value numeric; accuracy_value numeric;
  audit_id uuid:=gen_random_uuid();
begin
  if request_id is null or action is null or payload is null or jsonb_typeof(payload)<>'object'
    or length(payload::text)>16000 or reason is null or length(btrim(reason)) not between 3 and 500 then
    raise exception 'INVALID_REQUEST' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text||request_id::text,71932));
  select * into previous from private.admin_audit a where a.actor_id=actor and a.request_id=admin_mutate.request_id;
  if found then
    if previous.action<>action or previous.payload<>payload or previous.reason<>btrim(reason) then
      raise exception 'REQUEST_CONFLICT' using errcode='22023'; end if;
    return previous.result;
  end if;
  if action in ('update','delete') then
    select * into spec from private.admin_resources where name=payload->>'resource';
    if not found or (action='update' and cardinality(spec.editable)=0) or (action='delete' and not spec.deletable) then
      raise exception 'READ_ONLY_RESOURCE' using errcode='42501'; end if;
    relation:=format('%I.%I',spec.schema_name,spec.table_name)::regclass;
    identity:=payload->'key'; patch:=payload->'changes';
    select array_agg(a.attname::text order by k.position) into primary_fields
      from pg_index i cross join lateral unnest(i.indkey) with ordinality k(attnum,position)
      join pg_attribute a on a.attrelid=i.indrelid and a.attnum=k.attnum
      where i.indrelid=relation and i.indisprimary;
    if identity is null or jsonb_typeof(identity)<>'object' or not identity ?& primary_fields
      or (select count(*) from jsonb_object_keys(identity))<>cardinality(primary_fields) then
      raise exception 'INVALID_KEY' using errcode='22023'; end if;
    foreach field in array primary_fields loop
      if jsonb_typeof(identity->field)<>'string' then raise exception 'INVALID_KEY' using errcode='22023'; end if;
      clause:=clause||format(' and t.%I = (jsonb_populate_record(null::%s,$1)).%I',field,relation,field);
    end loop;
    if action='update' then
      if patch is null or jsonb_typeof(patch)<>'object' or patch='{}'::jsonb then
        raise exception 'INVALID_CHANGES' using errcode='22023'; end if;
      for field in select jsonb_object_keys(patch) loop
        if not field=any(spec.editable) then raise exception 'READ_ONLY_COLUMN' using errcode='42501'; end if;
      end loop;
    end if;
    execute format('select to_jsonb(t) from %s t where %s',relation,clause) into before_row using identity;
    if before_row is null then raise exception 'ROW_NOT_FOUND' using errcode='P0001'; end if;
    captain_id:=case when spec.name='characters' then (before_row->>'id')::uuid else (before_row->>'character_id')::uuid end;
    perform private.lock_combat_context(array[captain_id]);
    execute format('select to_jsonb(t) from %s t where %s for update',relation,clause) into before_row using identity;
    if before_row is null then raise exception 'ROW_NOT_FOUND' using errcode='P0001'; end if;
    if payload->>'version' is distinct from md5(before_row::text) then raise exception 'STALE_ROW' using errcode='40001'; end if;
    if spec.name='characters' and exists(select 1 from private.combat_engagements where character_id=captain_id) then
      raise exception 'PLAYER_IN_COMBAT' using errcode='P0001'; end if;
    if action='update' then
      select string_agg(format('%I=(jsonb_populate_record(null::%s,$2)).%I',key,relation,key),',')
        into columns_sql from jsonb_object_keys(patch) key;
      execute format('update %s t set %s where %s returning to_jsonb(t)',relation,columns_sql,clause)
        into after_row using identity,patch;
    else
      execute format('delete from %s t where %s',relation,clause) using identity;
    end if;
    perform private.notify_training(captain_id);
    result:=jsonb_build_object('audit_id',audit_id,'message',case when action='delete' then 'Row deleted.' else 'Changes saved.' end);
  elsif action='grant_items' then
    captain_id:=(payload->>'character_id')::uuid;
    amount:=(payload->>'quantity')::numeric;
    if amount is null or amount::text in ('NaN','Infinity','-Infinity') or amount<>trunc(amount) or amount<1 or amount>1000000 then
      raise exception 'INVALID_QUANTITY' using errcode='22023'; end if;
    select * into definition from private.item_definitions where id=payload->>'item_id' and active for share;
    if not found then raise exception 'INVALID_ITEM' using errcode='22023'; end if;
    if not definition.stackable then
      if amount>100 then raise exception 'EQUIPMENT_LIMIT' using errcode='22023'; end if;
      damage_value:=(payload->>'damage')::numeric; accuracy_value:=(payload->>'accuracy')::numeric;
      if damage_value is null or accuracy_value is null or damage_value::text in ('NaN','Infinity','-Infinity')
        or accuracy_value::text in ('NaN','Infinity','-Infinity') or damage_value<0 or damage_value>1000000000
        or accuracy_value<0 or accuracy_value>100 or trunc(damage_value,2)<>damage_value or trunc(accuracy_value,2)<>accuracy_value then
        raise exception 'INVALID_STATS' using errcode='22023'; end if;
    end if;
    perform private.lock_combat_context(array[captain_id]);
    if captain_id is null or not exists(select 1 from public.characters where id=captain_id) then
      raise exception 'ROW_NOT_FOUND' using errcode='P0001'; end if;
    if definition.stackable then
      select to_jsonb(t) into before_row from private.item_stacks t where character_id=captain_id and item_id=definition.id;
      insert into private.item_stacks(character_id,item_id,quantity) values(captain_id,definition.id,amount::bigint)
        on conflict(character_id,item_id) do update set quantity=item_stacks.quantity+excluded.quantity
        returning to_jsonb(item_stacks) into after_row;
    else
      with inserted as (insert into private.item_instances(character_id,item_id,damage,accuracy)
        select captain_id,definition.id,damage_value,accuracy_value from generate_series(1,amount::integer) returning *)
      select jsonb_agg(to_jsonb(inserted)) into after_row from inserted;
    end if;
    perform private.notify_training(captain_id);
    result:=jsonb_build_object('audit_id',audit_id,'message',amount::text||' x '||definition.name||' generated.');
  elsif action='cancel_ship_job' then
    captain_id:=(payload->>'character_id')::uuid;
    perform private.lock_combat_context(array[captain_id]);
    select to_jsonb(j) into before_row from private.ship_upgrade_jobs j where character_id=captain_id and applied_at is null for update;
    if before_row is null then raise exception 'ROW_NOT_FOUND' using errcode='P0001'; end if;
    if payload->>'version' is distinct from md5(before_row::text) then raise exception 'STALE_ROW' using errcode='40001'; end if;
    delete from private.ship_upgrade_jobs where id=(before_row->>'id')::uuid;
    perform private.notify_training(captain_id);
    result:=jsonb_build_object('audit_id',audit_id,'message','Ship job cancelled without refund. The original job is preserved in this audit record.');
  elsif action='end_combat' then
    captain_id:=(payload->>'character_id')::uuid;
    perform private.lock_combat_context(array[captain_id]);
    select to_jsonb(b) into before_row from private.combats b join private.combat_engagements e on e.combat_id=b.id
      where e.character_id=captain_id and b.id=(payload->>'combat_id')::uuid for update of b;
    if before_row is null then raise exception 'ROW_NOT_FOUND' using errcode='P0001'; end if;
    update private.combat_participants set status='draw',finished_at=clock_timestamp()
      where combat_id=(before_row->>'id')::uuid and status='active';
    update public.characters set ship_recovery_at=clock_timestamp(),crew_recovery_at=clock_timestamp()
      where id in(select character_id from private.combat_engagements where combat_id=(before_row->>'id')::uuid);
    update private.combats set state=state||jsonb_build_object('status','completed','outcome','draw','winner_id',null),
      finished_at=clock_timestamp(),deadline=clock_timestamp() where id=(before_row->>'id')::uuid returning to_jsonb(combats) into after_row;
    perform private.append_combat_event((before_row->>'id')::uuid,captain_id,request_id,
      jsonb_build_object('kind','admin_end','actor_name',(select display_name from public.characters where id=captain_id),
        'at',clock_timestamp(),'outcome','draw'));
    delete from private.combat_engagements where combat_id=(before_row->>'id')::uuid;
    perform private.notify_combat((before_row->>'id')::uuid);
    result:=jsonb_build_object('audit_id',audit_id,'message','Combat ended in a draw without additional damage.');
  else
    raise exception 'INVALID_ACTION' using errcode='22023';
  end if;
  insert into private.admin_audit(id,actor_id,request_id,action,reason,payload,before_data,after_data,result)
    values(audit_id,actor,request_id,action,btrim(reason),payload,before_row,after_row,result);
  return result;
end;
$$;

create or replace function private.admin_read(resource text,search_term text default '',requested_page integer default 0,filters jsonb default '{}')
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  spec private.admin_resources%rowtype; relation regclass; clause text:='true'; ordering text;
  field text; row_count bigint; page integer; rows jsonb;
begin
  perform private.require_admin();
  select * into spec from private.admin_resources where name=resource;
  if not found then raise exception 'UNKNOWN_RESOURCE' using errcode='22023'; end if;
  if search_term is null or length(search_term)>200 or requested_page is null or requested_page<0
    or filters is null or jsonb_typeof(filters)<>'object' or length(filters::text)>2000 then
    raise exception 'INVALID_FILTER' using errcode='22023'; end if;
  relation:=format('%I.%I',spec.schema_name,spec.table_name)::regclass;
  for field in select jsonb_object_keys(filters) loop
    if not exists(select 1 from pg_attribute where attrelid=relation and attname=field and attnum>0 and not attisdropped)
      or jsonb_typeof(filters->field) not in ('string','null') then raise exception 'INVALID_FILTER' using errcode='22023'; end if;
    clause:=clause||case when filters->field='null'::jsonb then format(' and t.%I is null',field) else format(' and t.%I::text = ($2 ->> %L)',field,field) end;
  end loop;
  clause:=clause||' and ($1='''' or strpos(lower(to_jsonb(t)::text),lower($1))>0)';
  select string_agg(format('t.%I',a.attname),',' order by k.position) into ordering
    from pg_index i cross join lateral unnest(i.indkey) with ordinality k(attnum,position)
    join pg_attribute a on a.attrelid=i.indrelid and a.attnum=k.attnum
    where i.indrelid=relation and i.indisprimary;
  if ordering is null then raise exception 'UNKNOWN_RESOURCE' using errcode='22023'; end if;
  if resource='admin_audit' then ordering:='t.created_at desc,t.id desc'; end if;
  execute format('select count(*) from %s t where %s',relation,clause) into row_count using search_term,filters;
  page:=least(requested_page,greatest(0,(row_count-1)/50)::integer);
  execute format('select coalesce(jsonb_agg(private.admin_row(to_jsonb(x))),''[]''::jsonb)
    from (select t.* from %s t where %s order by %s limit 50 offset $3) x',relation,clause,ordering)
    into rows using search_term,filters,page::bigint*50;
  return jsonb_build_object('rows',rows,'total',row_count::text,'page',page,'page_size',50);
end;
$$;
