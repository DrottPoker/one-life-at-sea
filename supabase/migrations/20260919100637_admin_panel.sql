create table private.admin_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default clock_timestamp()
);
create table private.admin_audit (
  id uuid primary key default gen_random_uuid(), actor_id uuid not null, request_id uuid not null,
  action text not null, reason text not null check(length(btrim(reason)) between 3 and 500),
  payload jsonb not null, before_data jsonb, after_data jsonb, result jsonb not null,
  created_at timestamptz not null default clock_timestamp(), unique(actor_id,request_id)
);
create index admin_audit_created_idx on private.admin_audit(created_at desc,id);
create table private.admin_resources (
  name text primary key, schema_name text not null, table_name text not null,
  editable text[] not null default '{}', deletable boolean not null default false,
  note text not null default '', unique(schema_name,table_name)
);
alter table private.admin_members enable row level security;
alter table private.admin_audit enable row level security;
alter table private.admin_resources enable row level security;
revoke all on private.admin_members,private.admin_audit,private.admin_resources from public,anon,authenticated;
insert into private.admin_resources(name,schema_name,table_name,editable,deletable,note) values
('characters','public','characters',array['display_name','energy','gold_coins','bank_gold_coins','ship_health','crew_health','ship_attack','ship_defense','ship_speed','ship_accuracy','crew_attack','crew_defense','crew_speed','crew_accuracy','defence_order','protected_until','hospital_started_at','hospital_until'],false,'Character identity, resources, balances and stats. End active combat before editing.'),
('character_training','private','character_training',array['xp','tier_id'],false,'Training XP and purchased tier. Tier IDs must exist in training_tiers.'),
('item_stacks','private','item_stacks',array['quantity'],true,'Owned stack quantities. Use Generate items to create new holdings.'),
('item_instances','private','item_instances',array['damage','accuracy'],true,'Individual equipment. Use Generate items to create new instances.'),
('ship_upgrade_jobs','private','ship_upgrade_jobs','{}',false,'Durable ship jobs. Pending jobs can be cancelled from the player page.'),
('combats','private','combats','{}',false,'Combat state and snapshots. End active combat from the player page.'),
('combat_participants','private','combat_participants','{}',false,'Combat participants and snapshots.'),
('combat_engagements','private','combat_engagements','{}',false,'Active combat locks, managed by combat operations.'),
('combat_rounds','private','combat_rounds','{}',false,'Historical combat events.'),
('bank_transfers','private','bank_transfers','{}',false,'Historical bank transfer receipts.'),
('training_requests','private','training_requests','{}',false,'Immutable training receipts.'),
('inventory_requests','private','inventory_requests','{}',false,'Immutable inventory receipts.'),
('item_categories','private','item_categories','{}',false,'Catalog managed in config/gameplay.json. Run config:sync after editing config.'),
('item_definitions','private','item_definitions','{}',false,'Catalog managed in config/gameplay.json. Run config:sync after editing config.'),
('training_tiers','private','training_tiers','{}',false,'Catalog managed in config/gameplay.json.'),
('ship_work_sizes','private','ship_work_sizes','{}',false,'Catalog managed in config/gameplay.json.'),
('item_circulation','private','item_circulation','{}',false,'World totals maintained automatically with inventory mutations.'),
('item_circulation_history','private','item_circulation_history','{}',false,'Historical circulation changes.'),
('character_profiles','public','character_profiles','{}',false,'Public projection maintained from characters.'),
('harbor_players','public','harbor_players','{}',false,'Harbor projection maintained from characters.'),
('hospital_patients','public','hospital_patients','{}',false,'Hospital projection maintained from characters.'),
('player_game_events','public','player_game_events','{}',false,'Owner-only change notifications.'),
('admin_members','private','admin_members','{}',false,'Admin access is granted or revoked by the database owner.'),
('admin_audit','private','admin_audit','{}',false,'Immutable administrative history, newest first.'),
('admin_resources','private','admin_resources','{}',false,'Database-owned admin capabilities. No browser writes.');

create function private.is_admin()
returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and private.is_registered_player()
    and exists(select 1 from private.admin_members where user_id=auth.uid());
$$;
create function public.is_admin()
returns boolean language sql stable security invoker set search_path='' as $$ select private.is_admin(); $$;
revoke all on function private.is_admin(),public.is_admin() from public,anon;
grant execute on function private.is_admin(),public.is_admin() to authenticated;
create function private.require_admin()
returns uuid language plpgsql volatile security definer set search_path='' as $$
begin
  if not private.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
  -- Revocation waits for an in-flight operation, and takes effect on the next one.
  perform 1 from private.admin_members where user_id=auth.uid() for share;
  if not found then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
  return auth.uid();
end;
$$;
revoke all on function private.require_admin() from public,anon,authenticated;

-- Text values preserve bigint/numeric precision; nested JSON is displayed as text.
create function private.admin_row(value jsonb)
returns jsonb language sql immutable security invoker set search_path='' as $$
  select jsonb_build_object('version',md5(value::text),'values',
    (select jsonb_object_agg(key,case when v='null'::jsonb then null else v#>>'{}' end)
      from jsonb_each(value) e(key,v)));
$$;
revoke all on function private.admin_row(jsonb) from public,anon,authenticated;
create function private.admin_catalog()
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare result jsonb;
begin
  perform private.require_admin();
  select coalesce(jsonb_agg(jsonb_build_object('name',r.name,'schema',r.schema_name,'table',r.table_name,
    'editable',r.editable,'deletable',r.deletable,'note',r.note,
    'columns',(select jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),
      'nullable',not a.attnotnull,'primary',a.attnum=any(i.indkey)) order by a.attnum)
      from pg_attribute a join pg_index i on i.indrelid=a.attrelid and i.indisprimary
      where a.attrelid=format('%I.%I',r.schema_name,r.table_name)::regclass and a.attnum>0 and not a.attisdropped))
    order by r.name),'[]'::jsonb) into result from private.admin_resources r;
  return result;
end;
$$;
create function private.admin_read(resource text,search_term text default '',requested_page integer default 0,filters jsonb default '{}')
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
      or jsonb_typeof(filters->field)<>'string' then raise exception 'INVALID_FILTER' using errcode='22023'; end if;
    clause:=clause||format(' and t.%I::text = ($2 ->> %L)',field,field);
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
create function private.admin_overview()
returns jsonb language plpgsql volatile security definer set search_path='' as $$
begin
  perform private.require_admin();
  return jsonb_build_object(
    'players',(select count(*)::text from public.characters),
    'hospital',(select count(*)::text from public.characters where hospital_until>clock_timestamp()),
    'active_combats',(select count(*)::text from private.combats where status='active'),
    'pending_jobs',(select count(*)::text from private.ship_upgrade_jobs where applied_at is null),
    'gold_coins',(select coalesce(sum(gold_coins),0)::text from public.characters),
    'bank_gold_coins',(select coalesce(sum(bank_gold_coins),0)::text from public.characters),
    'equipment',(select count(*)::text from private.item_instances),
    'stacked_items',(select coalesce(sum(quantity),0)::text from private.item_stacks));
end;
$$;
create function private.admin_mutate(action text,payload jsonb,request_id uuid,reason text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  actor uuid:=private.require_admin(); previous private.admin_audit%rowtype;
  spec private.admin_resources%rowtype; relation regclass; field text; columns_sql text;
  identity jsonb; patch jsonb; clause text:='true'; primary_fields text[];
  before_row jsonb; after_row jsonb; result jsonb; captain_id uuid;
  definition private.item_definitions%rowtype; amount numeric; damage_value numeric; accuracy_value numeric;
  audit_id uuid:=gen_random_uuid(); affected bigint; participant record;
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
    affected:=0;
    for participant in select p.combat_id,p.character_id from private.combat_participants p
      where p.combat_id=(before_row->>'id')::uuid and p.status='active' order by p.character_id loop
      perform private.advance_shared_combat(participant.combat_id,participant.character_id,'retreat',gen_random_uuid(),clock_timestamp(),true);
      affected:=affected+1;
    end loop;
    select to_jsonb(b) into after_row from private.combats b where id=(before_row->>'id')::uuid;
    result:=jsonb_build_object('audit_id',audit_id,'message','Combat ended by retreating '||affected::text||' attacker(s).');
  else
    raise exception 'INVALID_ACTION' using errcode='22023';
  end if;
  insert into private.admin_audit(id,actor_id,request_id,action,reason,payload,before_data,after_data,result)
    values(audit_id,actor,request_id,action,btrim(reason),payload,before_row,after_row,result);
  return result;
end;
$$;
create function public.admin_catalog() returns jsonb language sql volatile security invoker set search_path='' as $$ select private.admin_catalog(); $$;
create function public.admin_overview() returns jsonb language sql volatile security invoker set search_path='' as $$ select private.admin_overview(); $$;
create function public.admin_read(resource text,search_term text default '',requested_page integer default 0,filters jsonb default '{}')
returns jsonb language sql volatile security invoker set search_path='' as $$ select private.admin_read(resource,search_term,requested_page,filters); $$;
create function public.admin_mutate(action text,payload jsonb,request_id uuid,reason text)
returns jsonb language sql volatile security invoker set search_path='' as $$ select private.admin_mutate(action,payload,request_id,reason); $$;
revoke all on function private.admin_catalog(),private.admin_overview(),private.admin_read(text,text,integer,jsonb),private.admin_mutate(text,jsonb,uuid,text),
  public.admin_catalog(),public.admin_overview(),public.admin_read(text,text,integer,jsonb),public.admin_mutate(text,jsonb,uuid,text) from public,anon;
grant execute on function private.admin_catalog(),private.admin_overview(),private.admin_read(text,text,integer,jsonb),private.admin_mutate(text,jsonb,uuid,text),
  public.admin_catalog(),public.admin_overview(),public.admin_read(text,text,integer,jsonb),public.admin_mutate(text,jsonb,uuid,text) to authenticated;
