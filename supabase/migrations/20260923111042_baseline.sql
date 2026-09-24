-- Baseline of migrations 20260915042236 through 20260923111042, squashed on 2026-09-24.
-- Generated with supabase migration squash and verified against the original chain: schema, grants,
-- RLS, realtime publication, storage buckets, cron jobs and seed data match after the next gameplay migration.
-- The original files remain in Git history before this commit.


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";


CREATE SCHEMA IF NOT EXISTS "private";


ALTER SCHEMA "private" OWNER TO "postgres";


COMMENT ON SCHEMA "public" IS 'standard public schema';


CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";


CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA "extensions";


CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";


CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";


CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";


CREATE OR REPLACE FUNCTION "private"."admin_catalog"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "private"."admin_catalog"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."admin_economy"("period" "text" DEFAULT '7d'::"text", "item_search" "text" DEFAULT ''::"text", "item_page" integer DEFAULT 0, "item_sort" "text" DEFAULT 'value'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  observed timestamptz:=statement_timestamp();
  starts timestamptz;
  result jsonb;
begin
  perform private.require_admin();
  if period is null or period not in ('24h','7d','30d','all') or item_page is null or item_page<0 or item_page>1000000
    or item_search is null or length(item_search)>100 or item_sort is null or item_sort not in ('value','quantity','name','unpriced') then
    raise exception 'INVALID_ECONOMY_FILTER' using errcode='22023';
  end if;
  starts:=case period when '24h' then observed-interval '24 hours' when '7d' then observed-interval '7 days'
    when '30d' then observed-interval '30 days' else '-infinity'::timestamptz end;
  with items as materialized (select * from private.economy_items(observed)),
  holdings as materialized (select * from private.economy_holdings()),
  owners as (
    select h.character_id,coalesce(sum(h.inventory*i.unit_value),0) inventory_value,coalesce(sum(h.listed*i.unit_value),0) listed_value,
      coalesce(sum(h.inventory+h.listed) filter(where i.unit_value is null),0) unpriced_units
    from holdings h join items i on i.id=h.item_id group by h.character_id
  ),
  wealth as materialized (
    select c.id,c.display_name as name,c.player_number,c.gold_coins::numeric gold,c.bank_gold_coins::numeric bank,
      c.gold_coins::numeric+c.bank_gold_coins::numeric coins,
      coalesce(o.inventory_value,0) inventory_value,coalesce(o.listed_value,0) listed_value,coalesce(o.unpriced_units,0) unpriced_units,
      coalesce(o.inventory_value,0)+coalesce(o.listed_value,0) item_value,
      c.gold_coins::numeric+c.bank_gold_coins::numeric+coalesce(o.inventory_value,0)+coalesce(o.listed_value,0) total_value
    from public.characters c left join owners o on o.character_id=c.id
  ),
  rankings as (
    select 'coins' kind,w.* from (select * from wealth order by coins desc,player_number limit 20) w
    union all select 'items',w.* from (select * from wealth order by item_value desc,player_number limit 20) w
    union all select 'total',w.* from (select * from wealth order by total_value desc,player_number limit 20) w
  ),
  matching as materialized (select * from items where position(lower(btrim(item_search)) in lower(name||' '||id))>0),
  ordered as (
    select *,row_number() over(order by
      case when item_sort='unpriced' and unit_value is null then 0 else 1 end,
      case when item_sort='quantity' then units end desc,
      case when item_sort='value' then units*unit_value end desc nulls last,
      case when item_sort='unpriced' then units end desc,name,id) ordinal from matching
  ),
  totals as (
    select coalesce(sum(gold),0) gold,coalesce(sum(bank),0) bank,count(*) players from wealth
  ),
  item_totals as (
    select coalesce(sum(units),0) units,coalesce(sum(units*unit_value),0) value,coalesce(sum(listed),0) listed,
      coalesce(sum(units) filter(where unit_value is null),0) unpriced,count(*) filter(where units>0 and unit_value is null) unpriced_types from items
  ),
  observations as materialized (select * from private.economy_snapshots where observed_at>=starts and observed_at<=observed),
  sampled as (
    select *,row_number() over(partition by bucket order by observed_at desc) pick from (
      select *,width_bucket(extract(epoch from observed_at),
        extract(epoch from (select min(observed_at) from observations)),extract(epoch from observed)+1,498) bucket from observations
    ) s
  ),
  points as (
    select * from observations order by observed_at limit 1
  ),
  history as (
    select observed_at,gold,bank_gold,item_units,item_value,unpriced_units from points
    union select observed_at,gold,bank_gold,item_units,item_value,unpriced_units from sampled where pick=1 or (select count(*) from observations)<=499
    union select observed,t.gold,t.bank,i.units,i.value,i.unpriced from totals t cross join item_totals i
  ),
  sales as materialized (
    select sold_at,gross,fee,quantity from private.market_sales where sold_at>=observed-interval '30 days' and sold_at<=observed
  ),
  days as (
    select day from generate_series(date_trunc('day',observed at time zone 'UTC') at time zone 'UTC'-interval '29 days',
      date_trunc('day',observed at time zone 'UTC') at time zone 'UTC',interval '1 day') day
  )
  select jsonb_build_object(
    'observed_at',observed,'period',period,'tracked_since',(select min(observed_at) from private.economy_snapshots),
    'last_snapshot',(select max(observed_at) from private.economy_snapshots),
    'sampled',(select count(*)>499 from observations),
    'totals',jsonb_build_object('gold',t.gold::text,'bank',t.bank::text,'coins',(t.gold+t.bank)::text,'players',t.players::text,
      'item_units',i.units::text,'item_value',i.value::text,'listed_units',i.listed::text,'unpriced_units',i.unpriced::text,'unpriced_types',i.unpriced_types::text,
      'top_ten_coins',coalesce((select sum(coins) from (select coins from wealth order by coins desc limit 10) w),0)::text),
    'market_24h',(select jsonb_build_object('trades',count(*)::text,'volume',coalesce(sum(gross),0)::text,'fees',coalesce(sum(fee),0)::text,
      'units',coalesce(sum(quantity),0)::text) from sales where sold_at>=observed-interval '24 hours'),
    'rankings',(select jsonb_object_agg(kind,entries) from (
      select kind,jsonb_agg(jsonb_build_object('id',id,'name',name,'player_number',player_number,'gold',gold::text,'bank',bank::text,'coins',coins::text,
        'inventory_value',inventory_value::text,'listed_value',listed_value::text,'item_value',item_value::text,'total_value',total_value::text,'unpriced_units',unpriced_units::text)
        order by case kind when 'coins' then coins when 'items' then item_value else total_value end desc,player_number) entries from rankings group by kind
    ) r),
    'items',jsonb_build_object('total',(select count(*)::text from matching),'page',item_page,'page_size',50,
      'rows',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'image_path',image_path,'active',active,
        'inventory',inventory::text,'listed',listed::text,'units',units::text,'unit_value',unit_value::text,'total_value',(units*unit_value)::text,'last_sale',last_sale) order by ordinal)
        from ordered where ordinal>item_page::bigint*50 and ordinal<=(item_page::bigint+1)*50),'[]'::jsonb)),
    'history',(select jsonb_agg(jsonb_build_object('at',observed_at,'coins',(gold+bank_gold)::text,'item_units',item_units::text,
      'item_value',item_value::text,'unpriced_units',unpriced_units::text) order by observed_at) from history),
    'market_days',(select jsonb_agg(jsonb_build_object('at',day,'volume',volume::text,'fees',fees::text) order by day) from (
      select day,coalesce(sum(s.gross),0) volume,coalesce(sum(s.fee),0) fees from days d left join sales s on s.sold_at>=d.day and s.sold_at<d.day+interval '1 day' group by day
    ) v)
  ) into result from totals t cross join item_totals i;
  return result;
end;
$$;


ALTER FUNCTION "private"."admin_economy"("period" "text", "item_search" "text", "item_page" integer, "item_sort" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."admin_get_loot_table"("target_id" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  perform private.require_admin();
  return private.loot_document(target_id);
end;
$$;


ALTER FUNCTION "private"."admin_get_loot_table"("target_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."admin_mutate"("action" "text", "payload" "jsonb", "request_id" "uuid", "reason" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
declare
  actor uuid:=private.require_admin(); previous private.admin_audit%rowtype;
  spec private.admin_resources%rowtype; relation regclass; field text; columns_sql text;
  identity jsonb; patch jsonb; clause text:='true'; primary_fields text[];
  before_row jsonb; after_row jsonb; result jsonb; captain_id uuid;
  definition private.item_definitions%rowtype; amount numeric; damage_value numeric; accuracy_value numeric;
  audit_id uuid:=gen_random_uuid(); content_result jsonb;
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
  if action in ('save_item','save_loot_table','save_activity_loot') then
    content_result:=case action when 'save_item' then private.admin_save_item(payload)
      when 'save_loot_table' then private.admin_save_loot_table(payload) else private.admin_save_activity_loot(payload) end;
    before_row:=content_result->'before'; after_row:=content_result->'after';
    result:=jsonb_build_object('audit_id',audit_id,'message',content_result->>'message','id',content_result->>'id');
  elsif action in ('update','delete') then
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
      if spec.name='characters' then
        if patch ? 'crew_morale' then patch:=patch||jsonb_build_object('morale_updated_at',clock_timestamp()); end if;
        if patch ? 'stamina' then patch:=patch||jsonb_build_object('stamina_updated_at',clock_timestamp()); end if;
        if patch ? 'energy' then patch:=patch||jsonb_build_object('energy_updated_at',clock_timestamp()); end if;
        if patch ? 'ship_health' then patch:=patch||jsonb_build_object('ship_recovery_at',clock_timestamp()); end if;
        if patch ? 'crew_health' then patch:=patch||jsonb_build_object('crew_recovery_at',clock_timestamp()); end if;
      end if;
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
$_$;


ALTER FUNCTION "private"."admin_mutate"("action" "text", "payload" "jsonb", "request_id" "uuid", "reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."admin_overview"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "private"."admin_overview"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."admin_player_statistics"("period" "text" DEFAULT '1m'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare observed timestamptz:=statement_timestamp(); starts date; today date; tracking timestamptz; bucket_days integer; result jsonb;
begin
  perform private.require_admin();
  if period is null or period not in ('1m','12m','all') then raise exception 'INVALID_PLAYER_PERIOD' using errcode='22023'; end if;
  today:=(observed at time zone 'UTC')::date;
  starts:=case period when '1m' then (today-interval '1 month')::date+1 when '12m' then (today-interval '12 months')::date+1
    else least(today,coalesce((select min(registered_at at time zone 'UTC')::date from private.player_statistics_accounts),today)) end;
  bucket_days:=greatest(1,ceil((today-starts+1)::numeric/500)::integer);
  select activity_tracked_since into tracking from private.player_statistics_config;
  with accounts as materialized (select * from private.player_statistics_accounts where registered_at<=observed),
  current_accounts as (select * from accounts where user_id is not null and deleted_at is null),
  buckets as (select starts+n*bucket_days as day,least(today,starts+(n+1)*bucket_days-1) as until
    from generate_series(0,(today-starts)/bucket_days) n),
  registrations as (select ((registered_at at time zone 'UTC')::date-starts)/bucket_days bucket,count(*) n
    from accounts where (registered_at at time zone 'UTC')::date>=starts group by 1),
  removals as (select ((deleted_at at time zone 'UTC')::date-starts)/bucket_days bucket,count(*) n
    from accounts where deleted_at<=observed and (deleted_at at time zone 'UTC')::date>=starts group by 1),
  activity as (select (day-starts)/bucket_days bucket,count(distinct account_id) unique_players from private.player_activity_daily
    where day between starts and today and first_at<=observed group by 1),
  history as (
    select b.day,b.until,coalesce(r.n,0) registrations,coalesce(x.n,0) removals,
      (select count(*) from accounts where (registered_at at time zone 'UTC')::date<starts
        and (deleted_at is null or (deleted_at at time zone 'UTC')::date>=starts))
        +sum(coalesce(r.n,0)-coalesce(x.n,0)) over(order by b.day) accounts,
      case when b.until<(tracking at time zone 'UTC')::date then null else coalesce(a.unique_players,0) end unique_players
    from buckets b left join registrations r on r.bucket=(b.day-starts)/bucket_days
      left join removals x on x.bucket=(b.day-starts)/bucket_days left join activity a on a.bucket=(b.day-starts)/bucket_days
  )
  select jsonb_build_object('observed_at',observed,'period',period,'tracked_since',tracking,'bucket_days',bucket_days,
    'totals',jsonb_build_object('players',(select count(*)::text from public.characters c join current_accounts a on a.user_id=c.user_id),
      'accounts',(select count(*)::text from current_accounts),
      'without_character',(select count(*)::text from current_accounts a where not exists(select 1 from public.characters c where c.user_id=a.user_id)),
      'active_24h',(select count(*)::text from current_accounts where last_active_at between observed-interval '24 hours' and observed),
      'active_7d',(select count(*)::text from current_accounts where last_active_at between observed-interval '7 days' and observed),
      'active_1m',(select count(*)::text from current_accounts where last_active_at between observed-interval '1 month' and observed),
      'new_24h',(select count(*)::text from accounts where registered_at>=observed-interval '24 hours'),
      'new_7d',(select count(*)::text from accounts where registered_at>=observed-interval '7 days'),
      'new_1m',(select count(*)::text from accounts where registered_at>=observed-interval '1 month')),
    'period_totals',jsonb_build_object('new_accounts',(select sum(registrations)::text from history),
      'removed_accounts',(select sum(removals)::text from history),'net_growth',(select sum(registrations-removals)::text from history),
      'unique_active',(select count(*)::text from accounts where last_active_at between (starts::timestamp at time zone 'UTC') and observed)),
    'history',(select jsonb_agg(jsonb_build_object('at',day::timestamp at time zone 'UTC','until',until::timestamp at time zone 'UTC',
      'registrations',registrations::text,'removals',removals::text,'accounts',accounts::text,'unique_players',unique_players::text) order by day) from history)
  ) into result;
  return result;
end;
$$;


ALTER FUNCTION "private"."admin_player_statistics"("period" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."admin_players"("search_term" "text" DEFAULT ''::"text", "requested_page" integer DEFAULT 0, "sort_by" "text" DEFAULT 'newest'::"text", "activity" "text" DEFAULT 'all'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare result jsonb; observed timestamptz:=statement_timestamp();
begin
  perform private.require_admin();
  if search_term is null or length(search_term)>200 or requested_page is null or requested_page<0
    or sort_by is null or sort_by not in ('newest','oldest','last_active','name') or activity is null or activity not in ('all','24h','7d','30d','inactive','never') then
    raise exception 'INVALID_PLAYER_FILTER' using errcode='22023';
  end if;
  with matching as materialized (
    select c.id,c.display_name,c.player_number,c.gold_coins::text,c.bank_gold_coins::text,c.energy,c.stamina,c.ship_health,c.crew_health,c.hospital_until,
      a.registered_at,a.last_active_at
    from public.characters c join private.player_statistics_accounts a on a.user_id=c.user_id and a.deleted_at is null
    where (position(lower(btrim(search_term)) in lower(c.display_name||' '||c.player_number::text||' '||c.id::text||' '||c.user_id::text))>0)
      and case activity when '24h' then a.last_active_at between observed-interval '24 hours' and observed
        when '7d' then a.last_active_at between observed-interval '7 days' and observed
        when '30d' then a.last_active_at between observed-interval '30 days' and observed
        when 'inactive' then a.last_active_at<observed-interval '30 days' or a.last_active_at is null
        when 'never' then a.last_active_at is null else true end
  ), bounds as (
    select count(*) total,least(requested_page,greatest(0,(count(*)-1)/50))::integer page from matching
  ), ordered as (
    select *,row_number() over(order by
      case when sort_by='last_active' then last_active_at end desc nulls last,
      case when sort_by='newest' then registered_at end desc,
      case when sort_by='oldest' then registered_at end asc,
      case when sort_by='name' then lower(display_name) end asc,player_number) ordinal from matching
  )
  select jsonb_build_object('total',b.total::text,'page',b.page,'page_size',50,'rows',coalesce((select jsonb_agg(to_jsonb(o)-'ordinal' order by ordinal)
    from ordered o where ordinal>b.page::bigint*50 and ordinal<=(b.page::bigint+1)*50),'[]'::jsonb)) into result from bounds b;
  return result;
end;
$$;


ALTER FUNCTION "private"."admin_players"("search_term" "text", "requested_page" integer, "sort_by" "text", "activity" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."admin_read"("resource" "text", "search_term" "text" DEFAULT ''::"text", "requested_page" integer DEFAULT 0, "filters" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
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
$_$;


ALTER FUNCTION "private"."admin_read"("resource" "text", "search_term" "text", "requested_page" integer, "filters" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."admin_row"("value" "jsonb") RETURNS "jsonb"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
  select jsonb_build_object('version',md5(value::text),'values',
    (select jsonb_object_agg(key,case when v='null'::jsonb then null else v#>>'{}' end)
      from jsonb_each(value) e(key,v)));
$$;


ALTER FUNCTION "private"."admin_row"("value" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."admin_save_activity_loot"("payload" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare old_row jsonb; new_row jsonb; identifier text:=payload->>'activity_id';
begin
  if identifier='new' then raise exception 'INVALID_CONTENT_ID' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(74192,1);
  select to_jsonb(a) into old_row from private.activity_loot a where activity_id=identifier for update;
  if (old_row is null and payload->>'version' is not null)
    or (old_row is not null and payload->>'version' is distinct from old_row->>'version') then
    raise exception 'STALE_ROW' using errcode='40001'; end if;
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


ALTER FUNCTION "private"."admin_save_activity_loot"("payload" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."admin_save_item"("payload" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare old_row jsonb; new_row jsonb; identifier text:=payload->>'id'; image text;
begin
  if identifier='new' then raise exception 'INVALID_CONTENT_ID' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(74192,1);
  select to_jsonb(i) into old_row from private.item_definitions i where id=identifier for update;
  if (old_row is null and payload->>'version' is not null)
    or (old_row is not null and payload->>'version' is distinct from md5(old_row::text)) then
    raise exception 'STALE_ROW' using errcode='40001'; end if;
  if old_row is not null and (old_row->>'kind' is distinct from payload->>'kind'
    or old_row->>'slot' is distinct from nullif(payload->>'slot','none')) then
    raise exception 'ITEM_SHAPE_LOCKED' using errcode='22023'; end if;
  if not (payload->>'active')::boolean and exists(select 1 from private.loot_entries e
    join private.loot_tables t on t.id=e.loot_table_id where e.item_id=identifier and t.active) then
    raise exception 'ITEM_IN_LOOT' using errcode='22023'; end if;
  image:=coalesce(nullif(payload->>'image_path',''),'/images/items/placeholder.svg');
  if image like '/api/item-images/%' and not exists(select 1 from storage.objects
    where bucket_id='item-images' and name=substr(image,length('/api/item-images/')+1)) then
    raise exception 'INVALID_IMAGE' using errcode='22023'; end if;
  insert into private.item_definitions(id,category_id,name,description,effect_description,image_path,kind,stackable,slot,active,tradable,managed_by_admin)
  values(identifier,payload->>'category_id',btrim(payload->>'name'),btrim(payload->>'description'),
    coalesce(nullif(btrim(payload->>'effect_description'),''),'No active effect.'),image,payload->>'kind',
    payload->>'kind'<>'equipment',nullif(payload->>'slot','none'),(payload->>'active')::boolean,(payload->>'tradable')::boolean,true)
  on conflict(id) do update set category_id=excluded.category_id,name=excluded.name,description=excluded.description,
    effect_description=excluded.effect_description,image_path=excluded.image_path,active=excluded.active,tradable=excluded.tradable,managed_by_admin=true
  returning to_jsonb(item_definitions) into new_row;
  return jsonb_build_object('before',old_row,'after',new_row,'message','Item saved.','id',identifier);
end;
$$;


ALTER FUNCTION "private"."admin_save_item"("payload" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."admin_save_loot_table"("payload" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
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
    raise exception 'STALE_ROW' using errcode='40001'; end if;
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
    insert into private.loot_entries(loot_table_id,item_id,mode,fixed_chance,weight_start,weight_end,quantity,damage,accuracy)
    values(identifier,entry->>'item_id',entry->>'mode',(entry->>'fixed_chance')::numeric,
      (entry->>'weight_start')::numeric,(entry->>'weight_end')::numeric,(entry->>'quantity')::integer,
      (entry->>'damage')::numeric,(entry->>'accuracy')::numeric);
    if exists(select 1 from private.item_definitions where id=entry->>'item_id' and stackable)
      and ((entry->>'damage')::numeric<>0 or (entry->>'accuracy')::numeric<>0) then
      raise exception 'INVALID_STATS' using errcode='22023'; end if;
  end loop;
  select sum(fixed_chance),sum(weight_start),sum(weight_end) into fixed_total,start_total,end_total
    from private.loot_entries where loot_table_id=identifier;
  if fixed_total>100 or (fixed_total<100 and (start_total<=0 or end_total<=0)) then
    raise exception 'INVALID_LOOT_TOTAL' using errcode='22023'; end if;
  return jsonb_build_object('before',old_row,'after',private.loot_document(identifier),'message','Loot table saved.','id',identifier);
end;
$$;


ALTER FUNCTION "private"."admin_save_loot_table"("payload" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."admit_to_hospital"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare admitted_at timestamptz:=clock_timestamp();
begin
  if new.ship_health=0 then new.crew_health:=0; end if;
  if new.crew_health=0 and new.hospital_until is null then
    new.hospital_started_at:=admitted_at;
    new.hospital_until:=admitted_at+make_interval(secs=>300);
  end if;
  return new;
end;
$$;


ALTER FUNCTION "private"."admit_to_hospital"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."advance_shared_combat"("battle_id" "uuid", "actor" "uuid", "player_order" "text", "request_id" "uuid", "occurred_at" timestamp with time zone, "timed_out" boolean) RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
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
    deadline=least(b.hard_deadline,occurred_at+make_interval(secs => 120)),
    finished_at=case when personal_status<>'active' then occurred_at end,
    hits=hits+case when (resolved->'event'->>'attacker_hit')::boolean then 1 else 0 end,
    damage=damage+(resolved->'event'->>'attacker_damage')::integer
    where combat_id=battle_id and character_id=actor;
  update public.characters set ship_health=(a->>'ship_health')::integer,crew_health=(a->>'crew_health')::integer,
    ship_recovery_at=occurred_at,crew_recovery_at=occurred_at,
    hospital_started_at=case when (a->>'crew_health')::integer=0 then occurred_at else hospital_started_at end,
    hospital_until=case when (a->>'crew_health')::integer=0 then occurred_at+make_interval(secs=>300) else hospital_until end,
    protected_until=case when personal_status<>'active' then occurred_at+make_interval(secs => 300) end where id=actor;
  update public.characters set ship_health=(d->>'ship_health')::integer,crew_health=(d->>'crew_health')::integer,
    ship_recovery_at=occurred_at,crew_recovery_at=occurred_at,
    hospital_started_at=case when (d->>'crew_health')::integer=0 then occurred_at else hospital_started_at end,
    hospital_until=case when (d->>'crew_health')::integer=0 then occurred_at+make_interval(secs=>300) else hospital_until end
    where id=b.defender_id;
  if personal_status<>'active' then delete from private.combat_engagements where character_id=actor and combat_id=battle_id; end if;
  if ending is not null then
    update public.characters set ship_recovery_at=occurred_at,crew_recovery_at=occurred_at,protected_until=occurred_at+make_interval(secs => 300)
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
    update public.characters set protected_until=occurred_at+make_interval(secs => 300) where id=b.defender_id;
  end if;
  perform private.notify_combat(battle_id);
end;
$$;


ALTER FUNCTION "private"."advance_shared_combat"("battle_id" "uuid", "actor" "uuid", "player_order" "text", "request_id" "uuid", "occurred_at" timestamp with time zone, "timed_out" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."append_combat_event"("battle_id" "uuid", "actor" "uuid", "request" "uuid", "payload" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare sequence integer;
begin
  select coalesce(max(round),0)+1 into sequence from private.combat_rounds where combat_id=battle_id;
  insert into private.combat_rounds(combat_id,round,actor_id,request_id,event)
  values(battle_id,sequence,actor,request,payload || jsonb_build_object('sequence',sequence,'actor_id',actor));
end;
$$;


ALTER FUNCTION "private"."append_combat_event"("battle_id" "uuid", "actor" "uuid", "request" "uuid", "payload" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."assert_can_act"("captain_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  perform private.settle_hospital(captain_id,clock_timestamp());
  if exists(select 1 from public.characters where id=captain_id and hospital_until is not null) then
    raise exception 'IN_HOSPITAL' using errcode='P0001';
  end if;
  if exists(select 1 from private.combat_engagements where character_id=captain_id) then
    raise exception 'IN_COMBAT' using errcode='P0001';
  end if;
  if exists(select 1 from public.characters where id=captain_id and location<>'the_harbor') then
    raise exception 'NOT_IN_HARBOR' using errcode='P0001';
  end if;
end;
$$;


ALTER FUNCTION "private"."assert_can_act"("captain_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."award_skill_xp"("target_id" "uuid", "target_skill" "text", "amount" numeric) RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare previous_xp bigint; next_xp bigint;
begin
  if amount is null or amount::text in ('NaN','Infinity','-Infinity') or amount<>trunc(amount)
    or amount<1 or amount>9007199254740991 then raise exception 'INVALID_SKILL_XP' using errcode='22023'; end if;
  perform private.lock_combat_context(array[target_id]);
  perform 1 from public.characters where id=target_id for update;
  if not found then raise exception 'CHARACTER_NOT_FOUND' using errcode='P0001'; end if;
  select xp into previous_xp from private.character_skills where character_id=target_id and skill_id=target_skill for update;
  if not found then raise exception 'INVALID_SKILL' using errcode='22023'; end if;
  next_xp:=least(9007199254740991::numeric,previous_xp::numeric+amount)::bigint;
  update private.character_skills set xp=next_xp where character_id=target_id and skill_id=target_skill and xp<>next_xp;
  return jsonb_build_object('skill_id',target_skill,'xp_awarded',next_xp-previous_xp,'xp',next_xp,
    'previous_level',private.skill_level(previous_xp),'level',private.skill_level(next_xp),
    'character_level',private.character_level(target_id));
end;
$$;


ALTER FUNCTION "private"."award_skill_xp"("target_id" "uuid", "target_skill" "text", "amount" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."buy_market_listing"("listing_id" "uuid", "quantity" numeric, "expected_unit_price" numeric, "request_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  viewer uuid:=private.combat_captain(); seller uuid; previous private.market_requests%rowtype;
  listing private.market_listings%rowtype; payload jsonb; result jsonb;
  amount bigint; gross bigint; fee bigint; buyer_gold bigint; seller_gold bigint;
begin
  if listing_id is null or request_id is null then raise exception 'INVALID_REQUEST' using errcode='22023'; end if;
  if quantity is null or quantity<1 or quantity>9007199254740991 or quantity<>trunc(quantity) then raise exception 'INVALID_QUANTITY' using errcode='22023'; end if;
  if expected_unit_price is null or expected_unit_price<1 or expected_unit_price>9007199254740991 or expected_unit_price<>trunc(expected_unit_price)
    or expected_unit_price*quantity>9007199254740991 then raise exception 'INVALID_PRICE' using errcode='22023'; end if;
  amount:=quantity::bigint;
  payload:=jsonb_build_object('action','buy','listing_id',listing_id,'quantity',amount,'unit_price',expected_unit_price::bigint);
  -- An old receipt remains usable even if the seller account was later deleted.
  select * into previous from private.market_requests r where r.character_id=viewer and r.request_id=buy_market_listing.request_id;
  if found then
    if previous.payload<>payload then raise exception 'REQUEST_CONFLICT' using errcode='22023'; end if;
    return previous.result;
  end if;
  select seller_id into seller from private.market_listings l where l.id=listing_id;
  if not found then raise exception 'LISTING_UNAVAILABLE'; end if;
  if seller=viewer then raise exception 'OWN_LISTING'; end if;
  perform private.settle_combat_context(array[viewer,seller]);
  select * into previous from private.market_requests r where r.character_id=viewer and r.request_id=buy_market_listing.request_id;
  if found then
    if previous.payload<>payload then raise exception 'REQUEST_CONFLICT' using errcode='22023'; end if;
    return previous.result;
  end if;
  perform private.assert_can_act(viewer);
  select * into listing from private.market_listings l where l.id=listing_id for update;
  if not found or listing.quantity=0 then raise exception 'LISTING_UNAVAILABLE'; end if;
  if listing.quantity<amount then raise exception 'NOT_ENOUGH_STOCK'; end if;
  if listing.unit_price<>expected_unit_price then raise exception 'PRICE_CHANGED'; end if;
  if not exists(select 1 from private.item_definitions d where d.id=listing.item_id and d.active and d.tradable) then raise exception 'ITEM_NOT_TRADABLE'; end if;
  gross:=(amount::numeric*listing.unit_price)::bigint;
  fee:=floor((listing.sold_quantity::numeric+amount)*listing.unit_price*listing.fee_bps/10000)::bigint-listing.fee_paid;
  select gold_coins into buyer_gold from public.characters where id=viewer;
  select gold_coins into seller_gold from public.characters where id=seller;
  if buyer_gold<gross then raise exception 'NOT_ENOUGH_GOLD'; end if;
  if seller_gold>9007199254740991-(gross-fee) then raise exception 'SELLER_BALANCE_LIMIT'; end if;
  perform 1 from private.item_circulation where item_id=listing.item_id for update;
  update private.market_listings l set quantity=l.quantity-amount,sold_quantity=l.sold_quantity+amount,
    fee_paid=l.fee_paid+fee,closed_at=case when l.quantity=amount then clock_timestamp() end where l.id=listing.id;
  perform private.receive_market_item(listing,viewer,amount);
  update public.characters set gold_coins=gold_coins-gross where id=viewer;
  update public.characters set gold_coins=gold_coins+gross-fee where id=seller;
  insert into private.market_sales(listing_id,item_id,buyer_id,seller_id,quantity,unit_price,gross,fee)
    values(listing.id,listing.item_id,viewer,seller,amount,listing.unit_price,gross,fee);
  result:=jsonb_build_object('action','buy','listing_id',listing.id,'item_id',listing.item_id,'quantity',amount,
    'unit_price',listing.unit_price,'gross',gross,'fee',fee,'remaining',listing.quantity-amount);
  insert into private.market_requests(character_id,request_id,payload,result) values(viewer,request_id,payload,result);
  perform private.notify_market(listing.item_id);
  perform private.notify_training(viewer);
  perform private.notify_training(seller);
  return result;
end;
$$;


ALTER FUNCTION "private"."buy_market_listing"("listing_id" "uuid", "quantity" numeric, "expected_unit_price" numeric, "request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."buy_tavern_meal"("expected_gold_cost" numeric, "expected_morale_gain" numeric, "request_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  viewer_id uuid:=private.combat_captain();
  captain public.characters%rowtype; previous private.tavern_requests%rowtype;
  recovered record; observed_at timestamptz; morale_after numeric; result jsonb;
begin
  if request_id is null or expected_gold_cost is null or expected_gold_cost not between 1 and 9007199254740991
    or expected_gold_cost<>trunc(expected_gold_cost) or expected_morale_gain is null
    or expected_morale_gain not between 0.1 and 200 or expected_morale_gain<>round(expected_morale_gain,1) then
    raise exception 'INVALID_REQUEST' using errcode='22023'; end if;
  perform private.settle_combat_context(array[viewer_id]);
  select * into previous from private.tavern_requests r
    where r.character_id=viewer_id and r.request_id=buy_tavern_meal.request_id;
  if found then
    if previous.expected_gold_cost<>expected_gold_cost or previous.expected_morale_gain<>expected_morale_gain then
      raise exception 'REQUEST_CONFLICT' using errcode='22023'; end if;
    return previous.result;
  end if;
  perform private.assert_can_act(viewer_id);
  select * into captain from public.characters where id=viewer_id for update;
  if captain.location<>'the_harbor' then raise exception 'NOT_IN_HARBOR'; end if;
  if expected_gold_cost<>1000 or expected_morale_gain<>25 then
    raise exception 'STALE_OFFER'; end if;
  observed_at:=clock_timestamp();
  select * into recovered from private.morale_snapshot(captain.crew_morale,captain.morale_updated_at,observed_at);
  if recovered.morale>=100 then raise exception 'MORALE_FULL'; end if;
  if captain.gold_coins<1000 then raise exception 'NOT_ENOUGH_GOLD'; end if;
  morale_after:=least(100,recovered.morale+25);
  update public.characters set gold_coins=gold_coins-1000,
    crew_morale=morale_after,morale_updated_at=recovered.morale_updated_at where id=viewer_id;
  result:=jsonb_build_object('kind','crew_meal','gold_cost',1000,
    'morale_before',recovered.morale,'morale_after',morale_after,'morale_gained',morale_after-recovered.morale,
    'gold_coins',captain.gold_coins-1000,'config_revision',public.get_gameplay_revision());
  insert into private.tavern_requests(character_id,request_id,expected_gold_cost,expected_morale_gain,result)
    values(viewer_id,request_id,expected_gold_cost::bigint,expected_morale_gain,result);
  perform private.notify_training(viewer_id);
  return result;
end;
$$;


ALTER FUNCTION "private"."buy_tavern_meal"("expected_gold_cost" numeric, "expected_morale_gain" numeric, "request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."can_attack_here"("target_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare a public.characters%rowtype; d public.characters%rowtype; observed_at timestamptz:=statement_timestamp();
begin
  if auth.uid() is null or not private.is_registered_player() then return false; end if;
  select * into a from public.characters where user_id=auth.uid();
  select * into d from public.characters where id=target_id;
  if a.id is null or d.id is null or a.id=d.id or a.hospital_until>observed_at or d.hospital_until>observed_at then return false; end if;
  return private.combat_location_error(a,d,observed_at) is null;
end;
$$;


ALTER FUNCTION "private"."can_attack_here"("target_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."cancel_market_listing"("listing_id" "uuid", "request_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare viewer uuid:=private.combat_captain(); previous private.market_requests%rowtype;
  listing private.market_listings%rowtype; payload jsonb; result jsonb;
begin
  if listing_id is null or request_id is null then raise exception 'INVALID_REQUEST' using errcode='22023'; end if;
  payload:=jsonb_build_object('action','cancel','listing_id',listing_id);
  perform private.settle_combat_context(array[viewer]);
  select * into previous from private.market_requests r where r.character_id=viewer and r.request_id=cancel_market_listing.request_id;
  if found then
    if previous.payload<>payload then raise exception 'REQUEST_CONFLICT' using errcode='22023'; end if;
    return previous.result;
  end if;
  perform private.assert_can_act(viewer);
  select * into listing from private.market_listings l where l.id=listing_id and l.seller_id=viewer for update;
  if not found or listing.quantity=0 then raise exception 'LISTING_UNAVAILABLE'; end if;
  perform 1 from private.item_circulation where item_id=listing.item_id for update;
  update private.market_listings set quantity=0,returned_quantity=returned_quantity+listing.quantity,closed_at=clock_timestamp() where id=listing.id;
  perform private.receive_market_item(listing,viewer,listing.quantity);
  result:=jsonb_build_object('action','cancel','listing_id',listing.id,'item_id',listing.item_id,'quantity',listing.quantity);
  insert into private.market_requests(character_id,request_id,payload,result) values(viewer,request_id,payload,result);
  perform private.notify_market(listing.item_id);
  perform private.notify_training(viewer);
  return result;
end;
$$;


ALTER FUNCTION "private"."cancel_market_listing"("listing_id" "uuid", "request_id" "uuid") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."characters" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "display_name" "text" NOT NULL,
    "name_key" "text" GENERATED ALWAYS AS ("lower"("display_name")) STORED,
    "location" "text" DEFAULT 'the_harbor'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "energy" integer DEFAULT 100 NOT NULL,
    "energy_updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ship_health" integer DEFAULT 100 NOT NULL,
    "crew_health" integer DEFAULT 100 NOT NULL,
    "ship_attack" numeric DEFAULT 10 NOT NULL,
    "ship_defense" numeric DEFAULT 10 NOT NULL,
    "ship_speed" numeric DEFAULT 10 NOT NULL,
    "ship_accuracy" numeric DEFAULT 10 NOT NULL,
    "crew_attack" numeric DEFAULT 10 NOT NULL,
    "crew_defense" numeric DEFAULT 10 NOT NULL,
    "crew_speed" numeric DEFAULT 10 NOT NULL,
    "crew_accuracy" numeric DEFAULT 10 NOT NULL,
    "defence_order" "text" DEFAULT 'cannon'::"text" NOT NULL,
    "ship_recovery_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "crew_recovery_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "protected_until" timestamp with time zone,
    "gold_coins" bigint DEFAULT 0 NOT NULL,
    "bank_gold_coins" bigint DEFAULT 0 NOT NULL,
    "hospital_started_at" timestamp with time zone,
    "hospital_until" timestamp with time zone,
    "sea_step" integer DEFAULT 0 NOT NULL,
    "sea_version" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sea_visit_id" "uuid",
    "sea_place_id" "text",
    "sea_place_name" "text",
    "travel_id" "uuid",
    "travel_kind" "text",
    "travel_target_step" integer,
    "travel_place_id" "text",
    "travel_place_name" "text",
    "travel_started_at" timestamp with time zone,
    "travel_arrives_at" timestamp with time zone,
    "max_sea_distance" integer DEFAULT 0 NOT NULL,
    "player_number" bigint NOT NULL,
    "crew_morale" numeric DEFAULT 0 NOT NULL,
    "morale_updated_at" timestamp with time zone DEFAULT "clock_timestamp"() NOT NULL,
    "stamina" integer DEFAULT 50 NOT NULL,
    "stamina_updated_at" timestamp with time zone DEFAULT "clock_timestamp"() NOT NULL,
    CONSTRAINT "characters_bank_gold_coins_check" CHECK ((("bank_gold_coins" >= 0) AND ("bank_gold_coins" <= '9007199254740991'::bigint))),
    CONSTRAINT "characters_crew_accuracy_check" CHECK (("crew_accuracy" >= (1)::numeric)),
    CONSTRAINT "characters_crew_accuracy_safe_check" CHECK (("crew_accuracy" <= ('9007199254740991'::bigint)::numeric)),
    CONSTRAINT "characters_crew_attack_check" CHECK (("crew_attack" >= (1)::numeric)),
    CONSTRAINT "characters_crew_attack_safe_check" CHECK (("crew_attack" <= ('9007199254740991'::bigint)::numeric)),
    CONSTRAINT "characters_crew_defense_check" CHECK (("crew_defense" >= (1)::numeric)),
    CONSTRAINT "characters_crew_defense_safe_check" CHECK (("crew_defense" <= ('9007199254740991'::bigint)::numeric)),
    CONSTRAINT "characters_crew_health_check" CHECK ((("crew_health" >= 0) AND ("crew_health" <= 100))),
    CONSTRAINT "characters_crew_morale_check" CHECK (((("crew_morale" >= ('-100'::integer)::numeric) AND ("crew_morale" <= (100)::numeric)) AND ("crew_morale" = "round"("crew_morale", 1)))),
    CONSTRAINT "characters_crew_speed_check" CHECK (("crew_speed" >= (1)::numeric)),
    CONSTRAINT "characters_crew_speed_safe_check" CHECK (("crew_speed" <= ('9007199254740991'::bigint)::numeric)),
    CONSTRAINT "characters_defence_order_check" CHECK (("defence_order" = ANY (ARRAY['cannon'::"text", 'boarding'::"text"]))),
    CONSTRAINT "characters_energy_check" CHECK ((("energy" >= 0) AND ("energy" <= 1000))),
    CONSTRAINT "characters_gold_coins_check" CHECK ((("gold_coins" >= 0) AND ("gold_coins" <= '9007199254740991'::bigint))),
    CONSTRAINT "characters_hospital_location_check" CHECK ((("hospital_until" IS NULL) OR ("location" = 'the_harbor'::"text"))),
    CONSTRAINT "characters_hospital_period_check" CHECK (((("hospital_started_at" IS NULL) AND ("hospital_until" IS NULL)) OR (("hospital_started_at" IS NOT NULL) AND ("hospital_until" IS NOT NULL) AND ("hospital_until" > "hospital_started_at")))),
    CONSTRAINT "characters_journey_check" CHECK (((("location" <> 'traveling'::"text") AND ("travel_id" IS NULL) AND ("travel_kind" IS NULL) AND ("travel_target_step" IS NULL) AND ("travel_place_id" IS NULL) AND ("travel_place_name" IS NULL) AND ("travel_started_at" IS NULL) AND ("travel_arrives_at" IS NULL)) OR (("location" = 'traveling'::"text") AND ("travel_id" IS NOT NULL) AND ("travel_kind" IS NOT NULL) AND ("travel_target_step" IS NOT NULL) AND ("travel_place_id" IS NOT NULL) AND ("travel_place_name" IS NOT NULL) AND ("travel_started_at" IS NOT NULL) AND ("travel_arrives_at" IS NOT NULL) AND "isfinite"("travel_arrives_at") AND ("travel_arrives_at" > "travel_started_at") AND ((("travel_kind" = 'depart'::"text") AND ("sea_step" = 0) AND ("travel_target_step" = 1) AND ("sea_visit_id" IS NOT NULL)) OR (("travel_kind" = 'onward'::"text") AND ("sea_step" > 0) AND (("travel_target_step")::bigint = (("sea_step")::bigint + 1)) AND ("sea_visit_id" IS NOT NULL)) OR (("travel_kind" = 'return'::"text") AND ("sea_step" > 0) AND ("travel_target_step" = 0) AND ("sea_visit_id" IS NULL)))))),
    CONSTRAINT "characters_location_check" CHECK (("location" = ANY (ARRAY['the_harbor'::"text", 'open_sea'::"text", 'traveling'::"text"]))),
    CONSTRAINT "characters_max_sea_distance_check" CHECK ((("max_sea_distance" >= 0) AND ("max_sea_distance" >= "sea_step"))),
    CONSTRAINT "characters_name_normalized" CHECK (("display_name" = NORMALIZE("regexp_replace"("btrim"("display_name"), '[[:space:]]+'::"text", ' '::"text", 'g'::"text"), NFC))),
    CONSTRAINT "characters_name_required" CHECK (("btrim"("display_name") <> ''::"text")),
    CONSTRAINT "characters_player_number_range" CHECK ((("player_number" >= 100001) AND ("player_number" <= '9007199254740991'::bigint))),
    CONSTRAINT "characters_sea_state_check" CHECK (((("location" = 'the_harbor'::"text") AND ("sea_step" = 0) AND ("sea_visit_id" IS NULL) AND ("sea_place_id" IS NULL) AND ("sea_place_name" IS NULL)) OR (("location" = 'open_sea'::"text") AND ("sea_step" > 0) AND ("sea_visit_id" IS NOT NULL) AND ("sea_place_id" IS NOT NULL) AND ("sea_place_name" IS NOT NULL)) OR (("location" = 'traveling'::"text") AND ("sea_place_id" IS NULL) AND ("sea_place_name" IS NULL)))),
    CONSTRAINT "characters_sea_step_check" CHECK (("sea_step" >= 0)),
    CONSTRAINT "characters_ship_accuracy_check" CHECK (("ship_accuracy" >= (1)::numeric)),
    CONSTRAINT "characters_ship_accuracy_safe_check" CHECK (("ship_accuracy" <= ('9007199254740991'::bigint)::numeric)),
    CONSTRAINT "characters_ship_attack_check" CHECK (("ship_attack" >= (1)::numeric)),
    CONSTRAINT "characters_ship_attack_safe_check" CHECK (("ship_attack" <= ('9007199254740991'::bigint)::numeric)),
    CONSTRAINT "characters_ship_defense_check" CHECK (("ship_defense" >= (1)::numeric)),
    CONSTRAINT "characters_ship_defense_safe_check" CHECK (("ship_defense" <= ('9007199254740991'::bigint)::numeric)),
    CONSTRAINT "characters_ship_health_check" CHECK ((("ship_health" >= 0) AND ("ship_health" <= 100))),
    CONSTRAINT "characters_ship_speed_check" CHECK (("ship_speed" >= (1)::numeric)),
    CONSTRAINT "characters_ship_speed_safe_check" CHECK (("ship_speed" <= ('9007199254740991'::bigint)::numeric)),
    CONSTRAINT "characters_stamina_check" CHECK ((("stamina" >= 0) AND ("stamina" <= 200)))
);


ALTER TABLE "public"."characters" OWNER TO "postgres";


COMMENT ON TABLE "public"."characters" IS 'Private character identity. One character per account in the first release.';


COMMENT ON COLUMN "public"."characters"."energy_updated_at" IS 'Anchor for complete five-minute energy recovery intervals.';


COMMENT ON COLUMN "public"."characters"."protected_until" IS 'Incoming PvP protection only. Starting an attack relinquishes protection.';


COMMENT ON COLUMN "public"."characters"."gold_coins" IS 'Carried Gold Coins. Only this balance may fund purchases.';


COMMENT ON COLUMN "public"."characters"."bank_gold_coins" IS 'Stored Gold Coins. Withdraw before spending.';


COMMENT ON COLUMN "public"."characters"."player_number" IS 'Permanent public player ID; UUID remains the internal key. Never reuse or renumber.';


CREATE OR REPLACE FUNCTION "private"."character_energy_snapshot"("c" "public"."characters", "observed_at" timestamp with time zone) RETURNS TABLE("energy" integer, "energy_updated_at" timestamp with time zone)
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO ''
    AS $$
declare recovered record;
begin
  if c.location='traveling' and c.travel_kind='return' and c.travel_arrives_at<=observed_at then
    select * into recovered from private.energy_tick_snapshot(c.energy,c.energy_updated_at,
      greatest(c.energy_updated_at,c.travel_arrives_at-interval '1 microsecond'),300::bigint*2);
    return query select * from private.energy_snapshot(recovered.energy,recovered.energy_updated_at,observed_at);
  else
    return query select * from private.energy_tick_snapshot(c.energy,c.energy_updated_at,observed_at,
      300::bigint*case when c.location='the_harbor' then 1 else 2 end);
  end if;
end;
$$;


ALTER FUNCTION "private"."character_energy_snapshot"("c" "public"."characters", "observed_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."character_level"("target_id" "uuid") RETURNS integer
    LANGUAGE "sql" STABLE STRICT
    SET "search_path" TO ''
    AS $$
  select sum(private.skill_level(coalesce(s.xp,0)))::integer from private.skill_definitions d
    left join private.character_skills s on s.skill_id=d.id and s.character_id=target_id;
$$;


ALTER FUNCTION "private"."character_level"("target_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."combat_captain"() RETURNS "uuid"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "private"."combat_captain"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."combat_damage"("attack" numeric, "defense" numeric) RETURNS integer
    LANGUAGE "plpgsql" IMMUTABLE STRICT
    SET "search_path" TO ''
    AS $$
declare reduction numeric; strength_log numeric;
begin
  reduction:=private.combat_damage_reduction(attack,defense);
  if reduction>=1 then return 0; end if;
  strength_log:=log(greatest(1::numeric,attack/1));
  return greatest(1,round(
    (7*strength_log*strength_log+
     27*strength_log+30)*(1-reduction)))::integer;
end;
$$;


ALTER FUNCTION "private"."combat_damage"("attack" numeric, "defense" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."combat_damage_reduction"("attack" numeric, "defense" numeric) RETURNS numeric
    LANGUAGE "plpgsql" IMMUTABLE STRICT
    SET "search_path" TO ''
    AS $$
declare ratio numeric;
  zero_ratio constant numeric := 32;
  full_ratio constant numeric := 25;
  equal_reduction constant numeric := 0.5;
begin
  if attack<=0 or defense<=0 then raise exception 'INVALID_COMBAT_STAT' using errcode='22023'; end if;
  ratio:=defense/attack;
  if ratio<=1/zero_ratio then return 0; end if;
  if ratio>=full_ratio then return 1; end if;
  if ratio<=1 then return equal_reduction*(1+ln(ratio)/ln(zero_ratio)); end if;
  return equal_reduction+(1-equal_reduction)*ln(ratio)/ln(full_ratio);
end;
$$;


ALTER FUNCTION "private"."combat_damage_reduction"("attack" numeric, "defense" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."combat_hit_chance"("accuracy" numeric, "speed" numeric) RETURNS double precision
    LANGUAGE "plpgsql" IMMUTABLE STRICT
    SET "search_path" TO ''
    AS $$
declare ratio double precision;
  extreme constant double precision := 64;
  exponent constant double precision := 0.5;
  factor double precision := power(extreme,exponent);
begin
  if accuracy<=0 or speed<=0 then raise exception 'INVALID_COMBAT_STAT' using errcode='22023'; end if;
  ratio:=(accuracy/speed)::double precision;
  if ratio<=1/extreme then return 0; end if;
  if ratio>=extreme then return 1; end if;
  if ratio<=1 then return (factor*power(ratio,exponent)-1)/(2*(factor-1)); end if;
  return 1-(factor*power(1/ratio,exponent)-1)/(2*(factor-1));
end;
$$;


ALTER FUNCTION "private"."combat_hit_chance"("accuracy" numeric, "speed" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."combat_location_error"("a" "public"."characters", "d" "public"."characters", "observed_at" timestamp with time zone) RETURNS "text"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "private"."combat_location_error"("a" "public"."characters", "d" "public"."characters", "observed_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."combat_people"("battle_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  with damage as materialized (
    select r.actor_id,
      coalesce(sum((r.event->>'attacker_damage')::integer) filter (where r.event->>'phase'='sea'),0) ship_damage,
      coalesce(sum((r.event->>'attacker_damage')::integer) filter (where r.event->>'phase'='boarding'),0) crew_damage,
      coalesce(sum((r.event->>'defender_damage')::integer) filter (where r.event->>'phase'='sea'),0) defender_ship_damage,
      coalesce(sum((r.event->>'defender_damage')::integer) filter (where r.event->>'phase'='boarding'),0) defender_crew_damage,
      count(*) filter (where (r.event->>'defender_hit')::boolean) defender_hits
    from private.combat_rounds r where r.combat_id=battle_id group by r.actor_id
  )
  select coalesce(jsonb_agg(person order by joined_at,id),'[]'::jsonb) from (
    select p.joined_at,p.character_id id,jsonb_build_object('id',p.character_id,'name',p.snapshot->>'name',
      'player_number',coalesce(p.snapshot->'player_number',(select to_jsonb(player_number) from public.characters where id=p.character_id)),
      'role','attacker','status',p.status,'hits',p.hits,'damage',p.damage,
      'ship_damage',coalesce(d.ship_damage,0),'crew_damage',coalesce(d.crew_damage,0),
      'ship_health',p.snapshot->'ship_health','crew_health',p.snapshot->'crew_health','phase',p.phase) person
    from private.combat_participants p left join damage d on d.actor_id=p.character_id where p.combat_id=battle_id
    union all select b.started_at,b.defender_id,jsonb_build_object('id',b.defender_id,'name',b.state->'defender'->>'name',
      'player_number',coalesce(b.state->'defender'->'player_number',(select to_jsonb(player_number) from public.characters where id=b.defender_id)),
      'role','defender','status',case when b.status='active' then 'active'
        when (b.state#>>'{defender,crew_health}')::integer=0 or (b.state#>>'{defender,ship_health}')::integer=0 then 'defeated' else 'survived' end,
      'hits',coalesce(d.hits,0),'damage',coalesce(d.ship_damage,0)+coalesce(d.crew_damage,0),
      'ship_damage',coalesce(d.ship_damage,0),'crew_damage',coalesce(d.crew_damage,0),
      'ship_health',b.state->'defender'->'ship_health','crew_health',b.state->'defender'->'crew_health','phase',null)
    from private.combats b cross join (
      select sum(defender_hits) hits,sum(defender_ship_damage) ship_damage,sum(defender_crew_damage) crew_damage from damage
    ) d where b.id=battle_id
  ) people;
$$;


ALTER FUNCTION "private"."combat_people"("battle_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."combat_roll"() RETURNS double precision
    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$
  select (get_byte(bytes,0)::bigint * 16777216 + get_byte(bytes,1)::bigint * 65536
    + get_byte(bytes,2)::bigint * 256 + get_byte(bytes,3))::double precision / 4294967296
  from (select extensions.gen_random_bytes(4) as bytes) r;
$$;


ALTER FUNCTION "private"."combat_roll"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."combat_snapshot"("c" "public"."characters", "observed_at" timestamp with time zone) RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  select jsonb_build_object(
    'id', c.id, 'player_number', c.player_number, 'name', c.display_name, 'ammo', 10, 'defence_order', c.defence_order,
    'ship_health', private.health_snapshot(c.ship_health, c.ship_recovery_at, observed_at, 30),
    'crew_health', private.health_snapshot(c.crew_health, c.crew_recovery_at, observed_at, 10),
    'ship', jsonb_build_object('attack',c.ship_attack,'defense',c.ship_defense,'speed',c.ship_speed,'accuracy',c.ship_accuracy),
    'crew_morale',m.morale,'morale_multiplier',private.morale_multiplier(m.morale,500),
    'crew', jsonb_build_object(
      'attack',trim_scale(c.crew_attack*private.morale_multiplier(m.morale,500)),
      'defense',trim_scale(c.crew_defense*private.morale_multiplier(m.morale,500)),
      'speed',trim_scale(c.crew_speed*private.morale_multiplier(m.morale,500)),
      'accuracy',trim_scale(c.crew_accuracy*private.morale_multiplier(m.morale,500)))
  ) from private.morale_snapshot(c.crew_morale,c.morale_updated_at,observed_at) m;
$$;


ALTER FUNCTION "private"."combat_snapshot"("c" "public"."characters", "observed_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."combat_view"("battle_id" "uuid", "viewer_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "private"."combat_view"("battle_id" "uuid", "viewer_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."craft_item"("recipe_id" "text", "expected_version" "text", "request_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
declare
  viewer_id uuid:=private.combat_captain(); previous private.crafting_requests%rowtype;
  recipe private.crafting_recipes%rowtype; ingredient record; consumed jsonb:='[]'; result jsonb; progression jsonb;
  output_name text; output_before bigint; item_ids text[];
begin
  if request_id is null or recipe_id is null or recipe_id !~ '^[a-z][a-z0-9_]{0,47}$'
    or expected_version is null or expected_version !~ '^[a-f0-9]{64}$' then
    raise exception 'INVALID_REQUEST' using errcode='22023'; end if;
  perform private.settle_combat_context(array[viewer_id]);
  select * into previous from private.crafting_requests r where r.character_id=viewer_id and r.request_id=craft_item.request_id;
  if found then
    if previous.recipe_id<>recipe_id or previous.expected_version<>expected_version then
      raise exception 'REQUEST_CONFLICT' using errcode='22023'; end if;
    return previous.result;
  end if;
  perform private.assert_can_act(viewer_id);
  if (select location from public.characters where id=viewer_id)<>'the_harbor' then raise exception 'NOT_IN_HARBOR'; end if;
  select * into recipe from private.crafting_recipes r where r.id=recipe_id and r.active for share;
  if not found then raise exception 'INVALID_RECIPE' using errcode='22023'; end if;
  if recipe.version<>expected_version then raise exception 'STALE_OFFER'; end if;
  if exists(select 1 from private.character_skills where character_id=viewer_id and skill_id='crafting'
    and xp>9007199254740991-10) then raise exception 'SKILL_XP_LIMIT'; end if;
  select array_agg(item_id order by item_id) into item_ids from (
    select i.item_id from private.crafting_ingredients i where i.recipe_id=recipe.id union select recipe.output_item_id
  ) items;
  perform 1 from private.item_definitions d where d.id=any(item_ids) order by d.id for share;
  if cardinality(item_ids)<2 or exists(select 1 from private.item_definitions d where d.id=any(item_ids) and (not d.active or not d.stackable))
    or exists(select 1 from private.crafting_ingredients i where i.recipe_id=recipe.id and i.item_id=recipe.output_item_id) then
    raise exception 'RECIPE_UNAVAILABLE'; end if;
  select d.name into output_name from private.item_definitions d where d.id=recipe.output_item_id;
  select coalesce((select s.quantity from private.item_stacks s where s.character_id=viewer_id and s.item_id=recipe.output_item_id),0) into output_before;
  if output_before>9007199254740991-recipe.output_quantity then raise exception 'INVENTORY_FULL'; end if;
  for ingredient in
    select i.item_id,i.quantity,d.name,coalesce(s.quantity,0) owned from private.crafting_ingredients i
    join private.item_definitions d on d.id=i.item_id
    left join private.item_stacks s on s.item_id=i.item_id and s.character_id=viewer_id
    where i.recipe_id=recipe.id order by i.item_id
  loop
    if ingredient.owned<ingredient.quantity then raise exception 'INSUFFICIENT_MATERIALS'; end if;
    consumed:=consumed||jsonb_build_array(jsonb_build_object('item_id',ingredient.item_id,'name',ingredient.name,'quantity',ingredient.quantity));
  end loop;
  -- Lock circulation counters in item order before consuming or creating stock.
  perform 1 from private.item_circulation c where c.item_id=any(item_ids) order by c.item_id for update;
  delete from private.item_stacks s using private.crafting_ingredients i
    where s.character_id=viewer_id and s.item_id=i.item_id and i.recipe_id=recipe.id and s.quantity=i.quantity;
  update private.item_stacks s set quantity=s.quantity-i.quantity from private.crafting_ingredients i
    where s.character_id=viewer_id and s.item_id=i.item_id and i.recipe_id=recipe.id;
  insert into private.item_stacks(character_id,item_id,quantity) values(viewer_id,recipe.output_item_id,recipe.output_quantity)
    on conflict(character_id,item_id) do update set quantity=item_stacks.quantity+excluded.quantity;
  progression:=private.award_skill_xp(viewer_id,'crafting',10);
  result:=jsonb_build_object('recipe_id',recipe.id,'recipe_name',recipe.name,'consumed',consumed,'progression',progression,
    'output',jsonb_build_object('item_id',recipe.output_item_id,'name',output_name,'quantity',recipe.output_quantity));
  insert into private.crafting_requests(character_id,request_id,recipe_id,expected_version,result)
    values(viewer_id,request_id,recipe.id,expected_version,result);
  return result;
end;
$_$;


ALTER FUNCTION "private"."craft_item"("recipe_id" "text", "expected_version" "text", "request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."create_market_listings"("entries" "jsonb", "request_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
declare
  viewer uuid:=private.combat_captain(); previous private.market_requests%rowtype;
  stack private.item_stacks%rowtype; instance private.item_instances%rowtype; definition private.item_definitions%rowtype;
  entry record; payload jsonb; result jsonb; created jsonb:='[]'::jsonb; listing_id uuid; amount bigint; price bigint; original_created timestamptz;
begin
  if request_id is null or entries is null or jsonb_typeof(entries)<>'array' then raise exception 'INVALID_REQUEST' using errcode='22023'; end if;
  if jsonb_array_length(entries)<1 or jsonb_array_length(entries)>25 then raise exception 'INVALID_BATCH' using errcode='22023'; end if;
  if exists(select 1 from jsonb_array_elements(entries) e where jsonb_typeof(e)<>'object'
    or jsonb_typeof(e->'entry_id') is distinct from 'string'
    or coalesce(e->>'entry_id','')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or coalesce(e->>'entry_type','') not in ('stack','instance')
    or jsonb_typeof(e->'quantity') is distinct from 'number' or jsonb_typeof(e->'unit_price') is distinct from 'number') then
    raise exception 'INVALID_REQUEST' using errcode='22023'; end if;
  if exists(select 1 from jsonb_to_recordset(entries) as e(quantity numeric,unit_price numeric,entry_type text)
    where quantity<1 or quantity>9007199254740991 or quantity<>trunc(quantity)
      or (entry_type='instance' and quantity<>1)) then raise exception 'INVALID_QUANTITY' using errcode='22023'; end if;
  if exists(select 1 from jsonb_to_recordset(entries) as e(quantity numeric,unit_price numeric)
    where unit_price<1 or unit_price>9007199254740991 or unit_price<>trunc(unit_price)
      or unit_price*quantity>9007199254740991) then raise exception 'INVALID_PRICE' using errcode='22023'; end if;
  if (select count(*)<>count(distinct (e->>'entry_type',(e->>'entry_id')::uuid)) from jsonb_array_elements(entries) e) then
    raise exception 'DUPLICATE_ITEM' using errcode='22023'; end if;
  select jsonb_build_object('action','create','entries',jsonb_agg(jsonb_build_object(
    'entry_id',entry_id,'entry_type',entry_type,'quantity',quantity,'unit_price',unit_price) order by entry_type,entry_id))
    into payload from jsonb_to_recordset(entries) as e(entry_id uuid,entry_type text,quantity bigint,unit_price bigint);
  perform private.settle_combat_context(array[viewer]);
  select * into previous from private.market_requests r where r.character_id=viewer and r.request_id=create_market_listings.request_id;
  if found then
    if previous.payload<>payload then raise exception 'REQUEST_CONFLICT' using errcode='22023'; end if;
    return previous.result;
  end if;
  perform private.assert_can_act(viewer);
  -- Definition order keeps circulation locks consistent across multi-item transactions.
  for entry in
    select e.*,coalesce(s.item_id,i.item_id) item_id from jsonb_to_recordset(payload->'entries')
      as e(entry_id uuid,entry_type text,quantity bigint,unit_price bigint)
    left join private.item_stacks s on e.entry_type='stack' and s.id=e.entry_id and s.character_id=viewer
    left join private.item_instances i on e.entry_type='instance' and i.id=e.entry_id and i.character_id=viewer
    order by coalesce(s.item_id,i.item_id),e.entry_type,e.entry_id
  loop
    if entry.item_id is null then raise exception 'ITEM_NOT_FOUND'; end if;
    select * into definition from private.item_definitions where id=entry.item_id;
    if not definition.active or not definition.tradable then raise exception 'ITEM_NOT_TRADABLE'; end if;
    amount:=entry.quantity; price:=entry.unit_price;
    perform 1 from private.item_circulation where item_id=entry.item_id for update;
    if entry.entry_type='stack' then
      select * into stack from private.item_stacks s where s.id=entry.entry_id and s.character_id=viewer for update;
      if not found then raise exception 'ITEM_NOT_FOUND'; end if;
      if stack.quantity<amount then raise exception 'NOT_ENOUGH_ITEMS'; end if;
      original_created:=stack.created_at;
      if stack.quantity=amount then delete from private.item_stacks where id=stack.id;
      else update private.item_stacks set quantity=quantity-amount where id=stack.id; end if;
    else
      select * into instance from private.item_instances i where i.id=entry.entry_id and i.character_id=viewer for update;
      if not found then raise exception 'ITEM_NOT_FOUND'; end if;
      original_created:=instance.created_at;
      delete from private.item_instances where id=instance.id;
    end if;
    insert into private.market_listings(seller_id,item_id,entry_type,original_entry_id,quantity,initial_quantity,unit_price,fee_bps,damage,accuracy,item_created_at)
      values(viewer,entry.item_id,entry.entry_type,entry.entry_id,amount,amount,price,500,
        case when entry.entry_type='instance' then instance.damage end,
        case when entry.entry_type='instance' then instance.accuracy end,original_created)
      returning id into listing_id;
    created:=created||jsonb_build_array(jsonb_build_object('id',listing_id,'item_id',entry.item_id,'name',definition.name,'quantity',amount,'unit_price',price));
    perform private.notify_market(entry.item_id);
  end loop;
  result:=jsonb_build_object('action','create','listings',created);
  insert into private.market_requests(character_id,request_id,payload,result) values(viewer,request_id,payload,result);
  perform private.notify_training(viewer);
  return result;
end;
$_$;


ALTER FUNCTION "private"."create_market_listings"("entries" "jsonb", "request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."create_signup_character"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if coalesce(new.is_anonymous,false) then return new; end if;
  insert into public.characters(user_id,display_name)
    values(new.id,normalize(coalesce(new.raw_user_meta_data->>'character_name',''),NFC));
  return new;
end;
$$;


ALTER FUNCTION "private"."create_signup_character"() OWNER TO "postgres";


COMMENT ON FUNCTION "private"."create_signup_character"() IS 'Creates a registered account character atomically; invalid or taken names roll back the account.';


CREATE OR REPLACE FUNCTION "private"."crew_training_gain"("base_gain" numeric, "roll" double precision) RETURNS numeric
    LANGUAGE "plpgsql" IMMUTABLE STRICT
    SET "search_path" TO ''
    AS $$
begin
  if not (base_gain between 0.000001 and 9007199254740991) or roll<0 or roll>=1 then raise exception 'INVALID_TRAINING_ROLL' using errcode='22023'; end if;
  return base_gain * case when roll < 100 / 10000.0
    then 2 else 1 end;
end;
$$;


ALTER FUNCTION "private"."crew_training_gain"("base_gain" numeric, "roll" double precision) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."economy_holdings"() RETURNS TABLE("character_id" "uuid", "item_id" "text", "inventory" numeric, "listed" numeric)
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  select character_id,item_id,sum(inventory),sum(listed) from (
    select character_id,item_id,quantity::numeric inventory,0::numeric listed from private.item_stacks
    union all select character_id,item_id,1::numeric,0::numeric from private.item_instances
    union all select seller_id,item_id,0::numeric,quantity::numeric from private.market_listings where quantity>0
  ) h group by character_id,item_id;
$$;


ALTER FUNCTION "private"."economy_holdings"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."economy_items"("observed" timestamp with time zone) RETURNS TABLE("id" "text", "name" "text", "image_path" "text", "active" boolean, "inventory" numeric, "listed" numeric, "units" numeric, "unit_value" numeric, "last_sale" timestamp with time zone)
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  with holdings as (select item_id,sum(inventory) inventory,sum(listed) listed from private.economy_holdings() group by item_id)
  select d.id,d.name,d.image_path,d.active,coalesce(h.inventory,0),coalesce(h.listed,0),coalesce(h.inventory,0)+coalesce(h.listed,0),
    private.item_market_value_at(d.id,observed),
    (select sold_at from private.item_market_totals where item_id=d.id and sold_at<=observed order by sold_at desc,sale_id desc limit 1)
  from private.item_definitions d left join holdings h on h.item_id=d.id;
$$;


ALTER FUNCTION "private"."economy_items"("observed" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."effective_sea_distance"("c" "public"."characters", "observed_at" timestamp with time zone) RETURNS integer
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  select case when c.location='open_sea' then c.sea_step
    when c.location='traveling' and c.travel_kind in ('depart','onward') and c.travel_arrives_at<=observed_at
      then c.travel_target_step end;
$$;


ALTER FUNCTION "private"."effective_sea_distance"("c" "public"."characters", "observed_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."emit_notification"("recipient_id" "uuid", "event_kind" "text", "event_key" "text", "event_payload" "jsonb", "event_at" timestamp with time zone DEFAULT "clock_timestamp"()) RETURNS bigint
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare notification_id bigint;
begin
  insert into private.player_notifications(character_id,kind,event_key,payload,created_at)
    values(recipient_id,event_kind,event_key,event_payload,event_at)
    on conflict on constraint player_notifications_event_key do nothing returning id into notification_id;
  if notification_id is not null then
    perform private.notify_training(recipient_id);
  else
    select n.id into notification_id from private.player_notifications n
      where n.character_id=recipient_id and n.kind=event_kind and n.event_key=emit_notification.event_key;
  end if;
  return notification_id;
end;
$$;


ALTER FUNCTION "private"."emit_notification"("recipient_id" "uuid", "event_kind" "text", "event_key" "text", "event_payload" "jsonb", "event_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."energy_snapshot"("stored_energy" integer, "anchor" timestamp with time zone, "observed_at" timestamp with time zone) RETURNS TABLE("energy" integer, "energy_updated_at" timestamp with time zone)
    LANGUAGE "sql" IMMUTABLE STRICT
    SET "search_path" TO ''
    AS $$
  select * from private.energy_tick_snapshot(stored_energy,anchor,observed_at,300);
$$;


ALTER FUNCTION "private"."energy_snapshot"("stored_energy" integer, "anchor" timestamp with time zone, "observed_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."energy_tick_snapshot"("stored_energy" integer, "anchor" timestamp with time zone, "observed_at" timestamp with time zone, "tick_seconds" bigint) RETURNS TABLE("energy" integer, "energy_updated_at" timestamp with time zone)
    LANGUAGE "sql" IMMUTABLE STRICT
    SET "search_path" TO ''
    AS $$
  select greatest(stored_energy,least(100,stored_energy+greatest(0,
    floor(extract(epoch from observed_at)/tick_seconds)-floor(extract(epoch from anchor)/tick_seconds))
    *5))::integer,greatest(anchor,observed_at);
$$;


ALTER FUNCTION "private"."energy_tick_snapshot"("stored_energy" integer, "anchor" timestamp with time zone, "observed_at" timestamp with time zone, "tick_seconds" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."get_attack_lock"() RETURNS "jsonb"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select nullif(private.get_game_state()->'active_attack','null'::jsonb);
$$;


ALTER FUNCTION "private"."get_attack_lock"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."get_combat"("battle_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare viewer_id uuid:=private.combat_captain(); target uuid;
begin
  select defender_id into target from private.combats b where b.id=battle_id
    and (b.defender_id=viewer_id or exists(select 1 from private.combat_participants where combat_id=b.id and character_id=viewer_id));
  if not found then return null; end if;
  perform private.settle_combat_context(array[viewer_id,target]);
  return private.combat_view(battle_id,viewer_id);
end;
$$;


ALTER FUNCTION "private"."get_combat"("battle_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."get_combat_log"("battle_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select jsonb_build_object('id',b.id,'outcome',b.state->'outcome','winner_id',b.state->'winner_id',
    'defender_id',b.defender_id,'defender_name',b.state->'defender'->>'name',
    'started_at',b.started_at,'finished_at',b.finished_at,'people',private.combat_people(b.id),
    'events',coalesce((select jsonb_agg(event order by round) from private.combat_rounds where combat_id=b.id),'[]'::jsonb))
  from private.combats b where b.id=battle_id and b.status='completed';
$$;


ALTER FUNCTION "private"."get_combat_log"("battle_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."get_combat_preview"("target_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare viewer_id uuid:=private.combat_captain(); a public.characters%rowtype; d public.characters%rowtype;
  own_engagement private.combat_engagements%rowtype; target_engagement private.combat_engagements%rowtype;
  a_snapshot jsonb; d_snapshot jsonb; energy_now integer; reason text; location_error text; observed_at timestamptz;
begin
  if target_id is null then return jsonb_build_object('error','CHARACTER_NOT_FOUND'); end if;
  perform private.settle_combat_context(array[viewer_id,target_id]);
  observed_at:=clock_timestamp();
  perform private.settle_ship_upgrade(viewer_id,observed_at);
  perform private.settle_ship_upgrade(target_id,observed_at);
  select * into a from public.characters where id=viewer_id;
  select * into d from public.characters where id=target_id;
  if d.id is null then return jsonb_build_object('error','CHARACTER_NOT_FOUND'); end if;
  select * into own_engagement from private.combat_engagements where character_id=viewer_id;
  select * into target_engagement from private.combat_engagements where character_id=target_id;
  a_snapshot:=private.combat_snapshot(a,observed_at);
  d_snapshot:=private.combat_snapshot(d,observed_at);
  if own_engagement.character_id is not null then a_snapshot:=a_snapshot || jsonb_build_object('ship_health',a.ship_health,'crew_health',a.crew_health); end if;
  if target_engagement.character_id is not null then d_snapshot:=d_snapshot || jsonb_build_object('ship_health',d.ship_health,'crew_health',d.crew_health); end if;
  select energy into energy_now from private.character_energy_snapshot(a,observed_at);
  location_error:=private.combat_location_error(a,d,observed_at);
  reason:=case when a.hospital_until is not null then 'IN_HOSPITAL'
    when d.hospital_until is not null then 'TARGET_IN_HOSPITAL'
    when location_error is not null then location_error
    when viewer_id=target_id then 'SELF_ATTACK'
    when own_engagement.role='attacker' then 'IN_COMBAT'
    when own_engagement.role='defender' then 'DEFENDING'
    when target_engagement.role='attacker' then 'TARGET_IN_COMBAT'
    when exists(select 1 from private.combat_participants where combat_id=target_engagement.combat_id and character_id=viewer_id) then 'ALREADY_PARTICIPATED'
    when target_engagement.character_id is null and d.protected_until>observed_at then 'TARGET_PROTECTED'
    when (a_snapshot->>'ship_health')::integer<1 or (a_snapshot->>'crew_health')::integer<1 then 'NO_HEALTH'
    when (d_snapshot->>'ship_health')::integer<1 or (d_snapshot->>'crew_health')::integer<1 then 'TARGET_NO_HEALTH'
    when energy_now<10 then 'NOT_ENOUGH_ENERGY' end;
  return jsonb_build_object('attacker',private.visible_combatant(a_snapshot,true,false),
    'defender',private.visible_combatant(d_snapshot,false,false),'energy',energy_now,'can_start',reason is null,'reason',reason,
    'active_combat_id',case when own_engagement.role='attacker' then own_engagement.combat_id end,
    'join_combat_id',case when target_engagement.role='defender' then target_engagement.combat_id end,
    'target_protected_until',case when target_engagement.character_id is null and d.protected_until>observed_at then d.protected_until end,
    'observed_at',observed_at);
end;
$$;


ALTER FUNCTION "private"."get_combat_preview"("target_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."get_game_state"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare c public.characters%rowtype; active private.combats%rowtype; engagement private.combat_engagements%rowtype; observed_at timestamptz;
  recovered record; stamina_state record; morale_state record; energy_tick_seconds bigint; ship_hp integer; crew_hp integer; health_next_at timestamptz; last_id uuid;
begin
  if auth.uid() is null or not private.is_registered_player() then return null; end if;
  select * into c from public.characters where user_id=auth.uid();
  if not found then return null; end if;
  perform private.settle_combat_context(array[c.id]);
  observed_at:=clock_timestamp();
  perform private.settle_ship_upgrade(c.id,observed_at);
  select * into c from public.characters where id=c.id;
  select * into engagement from private.combat_engagements where character_id=c.id;
  select * into active from private.combats where id=engagement.combat_id;
  select * into recovered from private.character_energy_snapshot(c,observed_at);
  select * into stamina_state from private.stamina_snapshot(c.stamina,c.stamina_updated_at,observed_at);
  select * into morale_state from private.morale_snapshot(c.crew_morale,c.morale_updated_at,observed_at);
  ship_hp:=case when active.id is not null or c.hospital_until is not null then c.ship_health else private.health_snapshot(c.ship_health,c.ship_recovery_at,observed_at,30) end;
  crew_hp:=case when active.id is not null or c.hospital_until is not null then c.crew_health else private.health_snapshot(c.crew_health,c.crew_recovery_at,observed_at,10) end;
  if active.id is null and c.hospital_until is null then
    health_next_at:=least(case when ship_hp<100 then c.ship_recovery_at+(ship_hp-c.ship_health+1)*make_interval(secs => 30) end,
      case when crew_hp<100 then c.crew_recovery_at+(crew_hp-c.crew_health+1)*make_interval(secs => 10) end);
  end if;
  select recent.id into last_id from (
    (select b.id,b.started_at from private.combats b where b.defender_id=c.id
      order by b.started_at desc,b.id desc limit 1)
    union all
    (select b.id,b.started_at from private.combat_participants p
      join private.combats b on b.id=p.combat_id where p.character_id=c.id
      order by b.started_at desc,b.id desc limit 1)
  ) recent order by recent.started_at desc,recent.id desc limit 1;
  energy_tick_seconds:=300::bigint*case when c.location='the_harbor' then 1 else 2 end;
  return jsonb_build_object('energy',recovered.energy,'energy_next_at',case when recovered.energy<100 then
      date_bin(make_interval(secs=>energy_tick_seconds::double precision),greatest(observed_at,recovered.energy_updated_at),'1970-01-01Z'::timestamptz)
        +make_interval(secs=>energy_tick_seconds::double precision) end,
    'stamina',stamina_state.stamina,'stamina_next_at',stamina_state.stamina_next_at,
    'crew_morale',morale_state.morale,'morale_next_at',morale_state.morale_next_at,
    'sea',private.sea_state(c),'gold_coins',c.gold_coins,'bank_gold_coins',c.bank_gold_coins,'training',private.training_state(c.id),
    'revision',coalesce((select revision from public.player_game_events where character_id=c.id),0),
    'hospital_until',c.hospital_until,'observed_at',observed_at,'ship_health',ship_hp,'crew_health',crew_hp,'health_next_at',health_next_at,
    'active_combat_id',active.id,'combat_next_at',active.deadline,'last_combat_id',last_id,
    'active_attack',case when engagement.role='attacker' then jsonb_build_object('battle_id',active.id,'target_id',active.defender_id,
      'target_player_number',(select player_number from public.characters where id=active.defender_id)) end,
    'defence_order',c.defence_order,'protected_until',case when c.protected_until>observed_at then c.protected_until end,
    'ship_attack',c.ship_attack,'ship_defense',c.ship_defense,'ship_speed',c.ship_speed,'ship_accuracy',c.ship_accuracy,
    'crew_attack',c.crew_attack,'crew_defense',c.crew_defense,'crew_speed',c.crew_speed,'crew_accuracy',c.crew_accuracy);
end;
$$;


ALTER FUNCTION "private"."get_game_state"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."get_item_circulation"("target_item" "text", "period" "text" DEFAULT 'all'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  viewer_id uuid:=private.combat_captain();
  counter private.item_circulation%rowtype;
  observed timestamptz:=statement_timestamp();
  range_start timestamptz;
  initial numeric;
  point_limit integer:=500;
  points jsonb;
  sampled boolean;
begin
  if period is null or period not in ('1m','3m','6m','1y','3y','all') then
    raise exception 'INVALID_PERIOD' using errcode='22023'; end if;
  select * into counter from private.item_circulation where item_id=target_item;
  if not found then raise exception 'ITEM_NOT_FOUND' using errcode='22023'; end if;
  observed:=greatest(observed,counter.updated_at);
  range_start:=greatest(counter.tracked_since,case period
    when '1m' then observed-interval '1 month'
    when '3m' then observed-interval '3 months'
    when '6m' then observed-interval '6 months'
    when '1y' then observed-interval '1 year'
    when '3y' then observed-interval '3 years'
    else counter.tracked_since end);
  select coalesce((select h.total from private.item_circulation_history h
    where h.item_id=target_item and h.recorded_at<=range_start
    order by h.recorded_at desc,h.id desc limit 1),counter.initial_total) into initial;
  select count(*)>point_limit into sampled from (
    select 1 from private.item_circulation_history h
    where h.item_id=target_item and h.recorded_at>range_start and h.recorded_at<observed
    limit point_limit+1
  ) limited;
  if not sampled then
    select coalesce(jsonb_agg(jsonb_build_object('at',h.recorded_at,'total',h.total::text)
      order by h.recorded_at,h.id),'[]'::jsonb) into points
      from private.item_circulation_history h where h.item_id=target_item
        and h.recorded_at>range_start and h.recorded_at<observed;
  else
    select jsonb_agg(jsonb_build_object('at',t.sample_at,'total',coalesce(h.total,initial)::text)
      order by t.sample_at) into points
    from (select range_start+(observed-range_start)*(n::double precision/(point_limit+1)) as sample_at
      from generate_series(1,point_limit) n) t
    left join lateral (
      select total from private.item_circulation_history h
      where h.item_id=target_item and h.recorded_at<=t.sample_at
      order by h.recorded_at desc,h.id desc limit 1
    ) h on true;
  end if;
  return jsonb_build_object('item_id',target_item,'period',period,'total',counter.total::text,
    'tracked_since',counter.tracked_since,'from',range_start,'to',observed,'sampled',sampled,
    'points',jsonb_build_array(jsonb_build_object('at',range_start,'total',initial::text)) ||
      points || jsonb_build_array(jsonb_build_object('at',observed,'total',counter.total::text)));
end;
$$;


ALTER FUNCTION "private"."get_item_circulation"("target_item" "text", "period" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."get_item_market_value"("target_item" "text", "period" "text" DEFAULT 'all'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  viewer_id uuid:=private.combat_captain();
  observed timestamptz:=statement_timestamp();
  tracked timestamptz;
  range_start timestamptz;
  window_length interval:=make_interval(hours=>12);
  point_limit integer:=500;
  events timestamptz[];
  sampled boolean:=false;
  points jsonb:='[]'::jsonb;
begin
  if period is null or period not in ('1m','3m','6m','1y','3y','all') then
    raise exception 'INVALID_PERIOD' using errcode='22023'; end if;
  if not exists(select 1 from private.item_definitions where id=target_item) then
    raise exception 'ITEM_NOT_FOUND' using errcode='22023'; end if;
  select sold_at into tracked from private.item_market_totals where item_id=target_item and sold_at<=observed
    order by sold_at,sale_id limit 1;
  range_start:=greatest(tracked,case period
    when '1m' then observed-interval '1 month'
    when '3m' then observed-interval '3 months'
    when '6m' then observed-interval '6 months'
    when '1y' then observed-interval '1 year'
    when '3y' then observed-interval '3 years'
    else tracked end);
  if tracked is not null then
    -- Both sales and their expiry change the rolling value, without a scheduled job.
    select array_agg(at order by at) into events from (
      select at from (
        (select distinct sold_at at from private.item_market_totals where item_id=target_item
          and sold_at>range_start and sold_at<observed order by at limit point_limit+1)
        union
        (select sold_at+window_length as at from (
          select distinct sold_at from private.item_market_totals where item_id=target_item
            and sold_at>range_start-window_length and sold_at<observed-window_length
            order by sold_at limit point_limit+1
        ) expiring)
      ) candidates order by at limit point_limit+1
    ) limited;
    sampled:=coalesce(cardinality(events),0)>point_limit;
    if sampled then
      select array_agg(range_start+(observed-range_start)*(n::double precision/(point_limit+1)) order by n)
        into events from generate_series(1,point_limit) n;
    end if;
    select jsonb_agg(jsonb_build_object('at',at,'total',private.item_market_value_at(target_item,at)::text) order by at)
      into points from unnest(array[range_start] || coalesce(events,array[]::timestamptz[]) || array[observed]) at;
  end if;
  return jsonb_build_object('item_id',target_item,'period',period,
    'total',private.item_market_value_at(target_item,observed)::text,'tracked_since',tracked,
    'from',coalesce(range_start,observed),'to',observed,'sampled',sampled,'points',points);
end;
$$;


ALTER FUNCTION "private"."get_item_market_value"("target_item" "text", "period" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."get_mail"("mail_id" bigint, "include_history" boolean DEFAULT false) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare viewer_id uuid:=private.combat_captain(); result jsonb; history jsonb:='[]';
begin
  select private.mail_json(m,b,true) into result from private.mail_messages m join private.mail_boxes b on b.mail_id=m.id
    where m.id=get_mail.mail_id and b.character_id=viewer_id and b.deleted_at is null;
  if result is null then raise exception 'MAIL_NOT_FOUND' using errcode='P0002'; end if;
  if include_history then
    with recursive ancestors as (
      select m.reply_to_id id,1 depth from private.mail_messages m where m.id=get_mail.mail_id
      union all
      select m.reply_to_id,a.depth+1 from ancestors a join private.mail_messages m on m.id=a.id where a.depth<50
    ) select coalesce(jsonb_agg(private.mail_json(m,b,true) order by a.depth desc),'[]'::jsonb) into history
      from ancestors a join private.mail_messages m on m.id=a.id join private.mail_boxes b on b.mail_id=m.id
      where b.character_id=viewer_id and b.deleted_at is null;
  end if;
  return result||jsonb_build_object('history',history);
end;
$$;


ALTER FUNCTION "private"."get_mail"("mail_id" bigint, "include_history" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."get_mail_ignored"() RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare viewer_id uuid:=private.combat_captain();
begin
  return coalesce((select jsonb_agg(jsonb_build_object('player_number',c.player_number,'display_name',c.display_name) order by c.display_name,c.player_number)
    from private.mail_ignored i join public.characters c on c.id=i.ignored_id where i.character_id=viewer_id),'[]'::jsonb);
end;
$$;


ALTER FUNCTION "private"."get_mail_ignored"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."get_mail_summary"() RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare viewer_id uuid:=private.combat_captain(); result jsonb;
begin
  select jsonb_build_object('inbox',count(*) filter(where direction='inbox'),'outbox',count(*) filter(where direction='outbox'),
    'saved',count(*) filter(where saved_at is not null),'unread_count',count(*) filter(where direction='inbox' and read_at is null)) into result
    from private.mail_boxes where character_id=viewer_id and deleted_at is null;
  return result||jsonb_build_object('ignored',(select count(*) from private.mail_ignored where character_id=viewer_id));
end;
$$;


ALTER FUNCTION "private"."get_mail_summary"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."get_mailbox"("folder" "text" DEFAULT 'inbox'::"text", "query" "text" DEFAULT ''::"text", "page" integer DEFAULT 0) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare viewer_id uuid:=private.combat_captain(); total bigint; current_page integer; items jsonb; search tsquery;
begin
  if folder is null or folder not in('inbox','outbox','saved') or query is null or length(query)>200 or page is null or page<0 then
    raise exception 'INVALID_REQUEST' using errcode='22023';
  end if;
  if btrim(query)<>'' then search:=websearch_to_tsquery('simple',query); end if;
  select count(*) into total from private.mail_boxes b join private.mail_messages m on m.id=b.mail_id
    where b.character_id=viewer_id and b.deleted_at is null and (b.direction=folder or (folder='saved' and b.saved_at is not null))
    and (search is null or m.search_vector@@search);
  current_page:=least(page,greatest(0,((total-1)/10)::integer));
  select coalesce(jsonb_agg(row.item order by row.id desc),'[]'::jsonb) into items from (
    select m.id,private.mail_json(m,b) item from private.mail_boxes b join private.mail_messages m on m.id=b.mail_id
    where b.character_id=viewer_id and b.deleted_at is null and (b.direction=folder or (folder='saved' and b.saved_at is not null))
      and (search is null or m.search_vector@@search)
    order by m.id desc limit 10 offset current_page*10
  ) row;
  return jsonb_build_object('items',items,'total',total,'page',current_page,'page_size',10);
end;
$$;


ALTER FUNCTION "private"."get_mailbox"("folder" "text", "query" "text", "page" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."get_message_conversation"("target_player_number" bigint, "before_id" bigint DEFAULT NULL::bigint) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare viewer_id uuid:=private.combat_captain(); target_id uuid; target_name text; thread_key uuid; items jsonb; next_id text; through_id text;
begin
  if before_id is not null and before_id<1 then raise exception 'INVALID_REQUEST' using errcode='22023'; end if;
  select id,display_name into target_id,target_name from public.characters where player_number=target_player_number;
  if target_id is null then return null; end if;
  if target_id=viewer_id then raise exception 'SELF_MESSAGE' using errcode='22023'; end if;
  select id into thread_key from private.message_threads where participant_a=least(viewer_id,target_id) and participant_b=greatest(viewer_id,target_id);
  with page as materialized (
    select id,body,sender_id,created_at,read_at from private.player_messages where thread_id=thread_key and (before_id is null or id<before_id)
    order by id desc limit 50+1
  ), visible as (select * from page order by id desc limit 50)
  select coalesce(jsonb_agg(jsonb_build_object('id',id::text,'body',body,'sent_by_you',sender_id=viewer_id,'created_at',created_at,'read_at',read_at) order by id),'[]'::jsonb),
    case when (select count(*) from page)>50 then min(id)::text end,
    max(id) filter(where sender_id<>viewer_id and read_at is null)::text
    into items,next_id,through_id from visible;
  return jsonb_build_object('player_number',target_player_number,'display_name',target_name,'items',items,'next_before',next_id,'read_through',through_id);
end;
$$;


ALTER FUNCTION "private"."get_message_conversation"("target_player_number" bigint, "before_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."get_message_inbox"("before_id" bigint DEFAULT NULL::bigint) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare viewer_id uuid:=private.combat_captain(); items jsonb; next_id text;
begin
  if before_id is not null and before_id<1 then raise exception 'INVALID_REQUEST' using errcode='22023'; end if;
  with own_threads as (
    select id,participant_b as other_id,latest_message_id from private.message_threads where participant_a=viewer_id
    union all
    select id,participant_a,latest_message_id from private.message_threads where participant_b=viewer_id
  ), page as materialized (
    select * from own_threads where latest_message_id is not null and (before_id is null or latest_message_id<before_id)
    order by latest_message_id desc limit 10+1
  ), visible as (select * from page order by latest_message_id desc limit 10)
  select coalesce(jsonb_agg(jsonb_build_object('player_number',c.player_number,'display_name',c.display_name,
    'last_message_id',m.id::text,'preview',left(m.body,160),'sent_by_you',m.sender_id=viewer_id,'created_at',m.created_at,
    'unread_count',(select count(*) from private.player_messages u where u.recipient_id=viewer_id and u.thread_id=v.id and u.read_at is null))
    order by v.latest_message_id desc),'[]'::jsonb),
    case when (select count(*) from page)>10 then min(v.latest_message_id)::text end
    into items,next_id from visible v join public.characters c on c.id=v.other_id join private.player_messages m on m.id=v.latest_message_id;
  return private.get_message_summary()||jsonb_build_object('items',items,'next_before',next_id);
end;
$$;


ALTER FUNCTION "private"."get_message_inbox"("before_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."get_message_summary"() RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare viewer_id uuid:=private.combat_captain();
begin
  return jsonb_build_object('unread_count',(select count(*) from private.mail_boxes where character_id=viewer_id and direction='inbox' and deleted_at is null and read_at is null));
end;
$$;


ALTER FUNCTION "private"."get_message_summary"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."get_navigation_lock"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare viewer_id uuid; c public.characters%rowtype; attack jsonb;
begin
  if auth.uid() is null or not private.is_registered_player() then
    return jsonb_build_object('attack',null,'hospital_until',null,'sea_state',null);
  end if;
  select id into viewer_id from public.characters where user_id=auth.uid();
  if viewer_id is null then
    return jsonb_build_object('attack',null,'hospital_until',null,'sea_state',null);
  end if;
  perform private.settle_combat_context(array[viewer_id]);
  select * into c from public.characters where id=viewer_id;
  select jsonb_build_object('battle_id',e.combat_id,'target_id',b.defender_id,
    'target_player_number',target.player_number) into attack
    from private.combat_engagements e join private.combats b on b.id=e.combat_id
    join public.characters target on target.id=b.defender_id
    where e.character_id=viewer_id and e.role='attacker';
  return jsonb_build_object('attack',attack,'hospital_until',c.hospital_until,
    'sea_state',case c.location when 'the_harbor' then 'in_harbor' when 'traveling' then 'traveling' else 'at_sea' end);
end;
$$;


ALTER FUNCTION "private"."get_navigation_lock"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."get_notification_summary"() RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare viewer_id uuid:=private.combat_captain();
begin
  return jsonb_build_object('unread_count',(select count(*) from private.player_notifications where character_id=viewer_id and read_at is null),
    'latest_id',(select n.id::text from private.player_notifications n where n.character_id=viewer_id order by n.id desc limit 1));
end;
$$;


ALTER FUNCTION "private"."get_notification_summary"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."get_notifications"("before_id" bigint DEFAULT NULL::bigint) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare viewer_id uuid:=private.combat_captain(); items jsonb; next_id text;
begin
  if before_id is not null and before_id<1 then raise exception 'INVALID_REQUEST' using errcode='22023'; end if;
  with page as materialized (
    select id,kind,payload,created_at,read_at from private.player_notifications
    where character_id=viewer_id and (before_id is null or id<before_id)
    order by id desc limit 20+1
  ), visible as (select * from page order by id desc limit 20)
  select coalesce(jsonb_agg(jsonb_build_object('id',id::text,'kind',kind,'payload',payload,'created_at',created_at,'read_at',read_at) order by id desc),'[]'::jsonb),
    case when (select count(*) from page)>20 then min(id)::text end
    into items,next_id from visible;
  return private.get_notification_summary()||jsonb_build_object('items',items,'next_before',next_id);
end;
$$;


ALTER FUNCTION "private"."get_notifications"("before_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."get_own_skills"() RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare captain_id uuid;
begin
  if auth.uid() is null or not private.is_registered_player() then raise exception 'UNAUTHORIZED' using errcode='42501'; end if;
  select id into captain_id from public.characters where user_id=auth.uid();
  if not found then return null; end if;
  return (select jsonb_build_object('character_level',sum(private.skill_level(s.xp)),
    'skills',jsonb_agg(jsonb_build_object('id',d.id,'xp',s.xp,'level',private.skill_level(s.xp)) order by d.position))
    from private.skill_definitions d join private.character_skills s on s.skill_id=d.id where s.character_id=captain_id);
end;
$$;


ALTER FUNCTION "private"."get_own_skills"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."get_player_context"() RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare captain jsonb;
begin
  if auth.uid() is null or not private.is_registered_player() then return null; end if;
  select to_jsonb(c) into captain from public.characters c where c.user_id=auth.uid();
  return jsonb_build_object('character',captain,'is_admin',public.is_admin(),
    'config_revision',public.get_gameplay_revision());
end;
$$;


ALTER FUNCTION "private"."get_player_context"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."get_player_presence"("target_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare connected_until timestamptz; online_until timestamptz; last_action timestamptz;
begin
  if not private.is_registered_player() then return null; end if;
  select max(least(p.seen_at+make_interval(secs=>90),s.not_after)),
    max(least(p.seen_at+make_interval(secs=>90),s.not_after)) filter(where p.active)
    into connected_until,online_until
    from private.player_presence p join auth.sessions s on s.id=p.session_id
    join public.characters c on c.id=p.character_id and c.user_id=s.user_id
    join auth.users u on u.id=c.user_id
    where p.character_id=target_id and u.deleted_at is null and not coalesce(u.is_anonymous,false)
      and (s.not_after is null or s.not_after>statement_timestamp());
  select last_action_at into last_action from private.character_actions where character_id=target_id;
  return jsonb_build_object('online_until',online_until,'connected_until',connected_until,'last_action_at',last_action);
end;
$$;


ALTER FUNCTION "private"."get_player_presence"("target_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."get_player_snapshot"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare state jsonb;
begin
  state:=private.get_game_state();
  if state is null then return null; end if;
  return jsonb_build_object('state',state,'skills',private.get_own_skills(),
    'notifications',private.get_notification_summary(),'messages',private.get_message_summary());
end;
$$;


ALTER FUNCTION "private"."get_player_snapshot"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."get_sea_scout"("requested_page" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
  page:=least(greatest(coalesce(requested_page,0),0),greatest(0,(total-1)/25));
  return jsonb_build_object('id',scout.request_id,'sea_distance',scout.sea_distance,'scouted_at',scout.created_at,
    'total',total,'page',page,'players',coalesce((select jsonb_agg(to_jsonb(p) order by p.position) from (
      select t.target_id character_id,t.display_name,t.position,p.player_number from private.sea_scout_targets t
        join public.character_profiles p on p.character_id=t.target_id
        where t.character_id=viewer_id and t.request_id=scout.request_id order by t.position
        limit 25 offset page*25
    ) p),'[]'::jsonb));
end;
$$;


ALTER FUNCTION "private"."get_sea_scout"("requested_page" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."guard_sea_resources"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "private"."guard_sea_resources"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."health_snapshot"("value" integer, "anchor" timestamp with time zone, "observed_at" timestamp with time zone, "seconds" integer) RETURNS integer
    LANGUAGE "sql" IMMUTABLE STRICT
    SET "search_path" TO ''
    AS $$
  select least(100, value + least(100, greatest(0, floor(extract(epoch from (observed_at - anchor)) / seconds)))::integer);
$$;


ALTER FUNCTION "private"."health_snapshot"("value" integer, "anchor" timestamp with time zone, "observed_at" timestamp with time zone, "seconds" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."import_legacy_mail"() RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  insert into private.mail_messages(sender_id,sender_name,sender_player_number,recipients,recipient_numbers,request_id,body,sent_at,legacy_message_id)
  select m.sender_id,s.display_name,s.player_number,jsonb_build_array(jsonb_build_object('display_name',r.display_name,'player_number',r.player_number)),
    array[r.player_number],m.request_id,m.body,m.created_at,m.id
    from private.player_messages m join public.characters s on s.id=m.sender_id join public.characters r on r.id=m.recipient_id
    where not exists(select 1 from private.mail_messages existing where existing.legacy_message_id=m.id)
    order by m.id on conflict(legacy_message_id) do nothing;
  insert into private.mail_boxes(mail_id,character_id,direction,read_at)
    select n.id,o.sender_id,'outbox',o.created_at from private.mail_messages n join private.player_messages o on o.id=n.legacy_message_id
    union all
    select n.id,o.recipient_id,'inbox',o.read_at from private.mail_messages n join private.player_messages o on o.id=n.legacy_message_id
    on conflict(mail_id,character_id) do nothing;
  with previous as (select id,lag(id) over(partition by thread_id order by id) as parent from private.player_messages)
  update private.mail_messages m set reply_to_id=p.id from previous old join private.mail_messages p on p.legacy_message_id=old.parent
    where m.legacy_message_id=old.id and m.reply_to_id is null;
end;
$$;


ALTER FUNCTION "private"."import_legacy_mail"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."initialize_item_circulation"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare started timestamptz:=clock_timestamp();
begin
  insert into private.item_circulation(item_id,total,initial_total,tracked_since,updated_at)
    values(new.id,0,0,started,started);
  insert into private.item_circulation_history(item_id,transaction_id,recorded_at,total)
    values(new.id,pg_current_xact_id(),started,0);
  return new;
end;
$$;


ALTER FUNCTION "private"."initialize_item_circulation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."initialize_skills"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  insert into private.character_skills(character_id,skill_id) select new.id,id from private.skill_definitions;
  return new;
end;
$$;


ALTER FUNCTION "private"."initialize_skills"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."initialize_training_progress"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  insert into private.character_training(character_id,training_group,tier_id)
    select new.id,training_group,id from private.training_tiers where position=0;
  return new;
end;
$$;


ALTER FUNCTION "private"."initialize_training_progress"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."interrupt_hospital_combats"("captain_ids" "uuid"[]) RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
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
      protected_until=observed_at+make_interval(secs=>300)
      where id in(select character_id from private.combat_engagements where combat_id=b.id);
    perform private.append_combat_event(b.id,patient.id,gen_random_uuid(),
      jsonb_build_object('kind','hospital','actor_name',patient.display_name,'at',observed_at,'outcome','draw'));
    delete from private.combat_engagements where combat_id=b.id;
    perform private.notify_combat(b.id);
  end loop;
end;
$$;


ALTER FUNCTION "private"."interrupt_hospital_combats"("captain_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select auth.uid() is not null and private.is_registered_player()
    and exists(select 1 from private.admin_members where user_id=auth.uid());
$$;


ALTER FUNCTION "private"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."is_registered_player"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select auth.uid() is not null and exists (
    select 1 from auth.users
    where id = auth.uid() and coalesce(is_anonymous, false) = false
  );
$$;


ALTER FUNCTION "private"."is_registered_player"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."is_valid_character_name"("candidate" "text") RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
  select coalesce(candidate<>'' and candidate !~ U&'[\0009-\000d\0020\0030-\0039\0085\00a0\00b2-\00b3\00b9\00bc-\00be\0660-\0669\06f0-\06f9\07c0-\07c9\0966-\096f\09e6-\09ef\09f4-\09f9\0a66-\0a6f\0ae6-\0aef\0b66-\0b6f\0b72-\0b77\0be6-\0bf2\0c66-\0c6f\0c78-\0c7e\0ce6-\0cef\0d58-\0d5e\0d66-\0d78\0de6-\0def\0e50-\0e59\0ed0-\0ed9\0f20-\0f33\1040-\1049\1090-\1099\1369-\137c\1680\16ee-\16f0\17e0-\17e9\17f0-\17f9\1810-\1819\1946-\194f\19d0-\19da\1a80-\1a89\1a90-\1a99\1b50-\1b59\1bb0-\1bb9\1c40-\1c49\1c50-\1c59\2000-\200a\2028-\2029\202f\205f\2070\2074-\2079\2080-\2089\2150-\2182\2185-\2189\2460-\249b\24ea-\24ff\2776-\2793\2cfd\3000\3007\3021-\3029\3038-\303a\3192-\3195\3220-\3229\3248-\324f\3251-\325f\3280-\3289\32b1-\32bf\a620-\a629\a6e6-\a6ef\a830-\a835\a8d0-\a8d9\a900-\a909\a9d0-\a9d9\a9f0-\a9f9\aa50-\aa59\abf0-\abf9\feff\ff10-\ff19\+010107-\+010133\+010140-\+010178\+01018a-\+01018b\+0102e1-\+0102fb\+010320-\+010323\+010341\+01034a\+0103d1-\+0103d5\+0104a0-\+0104a9\+010858-\+01085f\+010879-\+01087f\+0108a7-\+0108af\+0108fb-\+0108ff\+010916-\+01091b\+0109bc-\+0109bd\+0109c0-\+0109cf\+0109d2-\+0109ff\+010a40-\+010a48\+010a7d-\+010a7e\+010a9d-\+010a9f\+010aeb-\+010aef\+010b58-\+010b5f\+010b78-\+010b7f\+010ba9-\+010baf\+010cfa-\+010cff\+010d30-\+010d39\+010d40-\+010d49\+010e60-\+010e7e\+010f1d-\+010f26\+010f51-\+010f54\+010fc5-\+010fcb\+011052-\+01106f\+0110f0-\+0110f9\+011136-\+01113f\+0111d0-\+0111d9\+0111e1-\+0111f4\+0112f0-\+0112f9\+011450-\+011459\+0114d0-\+0114d9\+011650-\+011659\+0116c0-\+0116c9\+0116d0-\+0116e3\+011730-\+01173b\+0118e0-\+0118f2\+011950-\+011959\+011bf0-\+011bf9\+011c50-\+011c6c\+011d50-\+011d59\+011da0-\+011da9\+011f50-\+011f59\+011fc0-\+011fd4\+012400-\+01246e\+016130-\+016139\+016a60-\+016a69\+016ac0-\+016ac9\+016b50-\+016b59\+016b5b-\+016b61\+016d70-\+016d79\+016e80-\+016e96\+01ccf0-\+01ccf9\+01d2c0-\+01d2d3\+01d2e0-\+01d2f3\+01d360-\+01d378\+01d7ce-\+01d7ff\+01e140-\+01e149\+01e2f0-\+01e2f9\+01e4f0-\+01e4f9\+01e5f1-\+01e5fa\+01e8c7-\+01e8cf\+01e950-\+01e959\+01ec71-\+01ecab\+01ecad-\+01ecaf\+01ecb1-\+01ecb4\+01ed01-\+01ed2d\+01ed2f-\+01ed3d\+01f100-\+01f10c\+01fbf0-\+01fbf9]',false);
$$;


ALTER FUNCTION "private"."is_valid_character_name"("candidate" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."item_market_value_at"("target_item" "text", "observed" timestamp with time zone) RETURNS numeric
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  select floor((a.gross_total-coalesce(b.gross_total,0))/nullif(a.quantity_total-coalesce(b.quantity_total,0),0))
  from (
    select quantity_total,gross_total,sold_at from private.item_market_totals
      where item_id=target_item and sold_at<=observed order by sold_at desc,sale_id desc limit 1
  ) a left join lateral (
    select quantity_total,gross_total from private.item_market_totals
      where item_id=target_item and sold_at<=observed-make_interval(hours=>12)
        and sold_at<a.sold_at
      order by sold_at desc,sale_id desc limit 1
  ) b on true;
$$;


ALTER FUNCTION "private"."item_market_value_at"("target_item" "text", "observed" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."latest_sea_scout"("c" "public"."characters") RETURNS "uuid"
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  select s.request_id from private.sea_scouts s where s.character_id=c.id and s.visit_id=c.sea_visit_id
    order by s.created_at desc,s.request_id desc limit 1;
$$;


ALTER FUNCTION "private"."latest_sea_scout"("c" "public"."characters") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."list_crafting_recipes"() RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare viewer_id uuid:=private.combat_captain(); result jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,'name',r.name,'version',r.version,'xp_gain',10,
    'output',jsonb_build_object('item_id',d.id,'name',d.name,'image_path',d.image_path,
      'quantity',r.output_quantity,'owned',coalesce(s.quantity,0)),
    'ingredients',(select jsonb_agg(jsonb_build_object('item_id',i.item_id,'name',di.name,
      'image_path',di.image_path,'quantity',i.quantity,'owned',coalesce(si.quantity,0)) order by i.item_id)
      from private.crafting_ingredients i join private.item_definitions di on di.id=i.item_id
      left join private.item_stacks si on si.item_id=i.item_id and si.character_id=viewer_id where i.recipe_id=r.id)
  ) order by r.position,r.id),'[]'::jsonb) into result
  from private.crafting_recipes r join private.item_definitions d on d.id=r.output_item_id
  left join private.item_stacks s on s.item_id=d.id and s.character_id=viewer_id
  where r.active and d.active and d.stackable
    and exists(select 1 from private.crafting_ingredients i where i.recipe_id=r.id)
    and not exists(select 1 from private.crafting_ingredients i join private.item_definitions di on di.id=i.item_id
      where i.recipe_id=r.id and (not di.active or not di.stackable or i.item_id=r.output_item_id));
  return result;
end;
$$;


ALTER FUNCTION "private"."list_crafting_recipes"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."list_inventory"("category_id" "text" DEFAULT NULL::"text", "search_term" "text" DEFAULT ''::"text", "requested_page" integer DEFAULT 0) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  viewer_id uuid:=private.combat_captain();
  page_size integer:=25;
  result jsonb;
begin
  if requested_page is null or requested_page<0 or search_term is null or length(search_term)>100 then
    raise exception 'INVALID_FILTER' using errcode='22023'; end if;
  if category_id is not null and not exists(select 1 from private.item_categories c where c.id=category_id) then
    raise exception 'INVALID_CATEGORY' using errcode='22023'; end if;
  with owned as (
    select s.id,'stack'::text entry_type,s.item_id,s.quantity,null::jsonb stats
      from private.item_stacks s where s.character_id=viewer_id
    union all
    select i.id,'instance',i.item_id,1::bigint,jsonb_build_object('damage',i.damage,'accuracy',i.accuracy)
      from private.item_instances i where i.character_id=viewer_id
  ), matching as (
    select o.*,d.name,d.category_id,d.kind,d.description,d.effect_description,d.image_path
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
    'total',b.total,'page',b.page,'page_size',page_size) into result from bounds b;
  return result;
end;
$$;


ALTER FUNCTION "private"."list_inventory"("category_id" "text", "search_term" "text", "requested_page" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."list_market_inventory"("category_id" "text" DEFAULT NULL::"text", "search_term" "text" DEFAULT ''::"text", "requested_page" integer DEFAULT 0) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare viewer uuid:=private.combat_captain(); page_size integer:=25; result jsonb;
begin
  if requested_page is null or requested_page<0 or search_term is null or length(search_term)>100 then raise exception 'INVALID_FILTER' using errcode='22023'; end if;
  if category_id is not null and not exists(select 1 from private.item_categories c where c.id=category_id) then raise exception 'INVALID_CATEGORY' using errcode='22023'; end if;
  with owned as (
    select s.id,'stack'::text entry_type,s.item_id,s.quantity,null::jsonb stats from private.item_stacks s where s.character_id=viewer
    union all
    select i.id,'instance',i.item_id,1::bigint,jsonb_build_object('damage',i.damage,'accuracy',i.accuracy) from private.item_instances i where i.character_id=viewer
  ), matching as (
    select o.*,d.name,d.category_id,d.kind,d.description,d.effect_description,d.image_path,c.total::text circulation
      from owned o join private.item_definitions d on d.id=o.item_id join private.item_circulation c on c.item_id=o.item_id
      where d.active and d.tradable and (list_market_inventory.category_id is null or d.category_id=list_market_inventory.category_id)
        and strpos(lower(d.name),lower(btrim(search_term)))>0
  ), bounds as (
    select count(*) total,least(requested_page,greatest(0,(count(*)-1)/page_size))::integer page from matching
  ), items as (
    select m.*,private.item_market_value_at(m.item_id,statement_timestamp())::text market_value from matching m
      order by lower(name) collate "C",item_id,id,entry_type
      limit page_size offset(select page::bigint*page_size from bounds)
  )
  select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(i) order by lower(i.name) collate "C",i.item_id,i.id,i.entry_type) from items i),'[]'::jsonb),
    'total',b.total,'page',b.page,'page_size',page_size) into result from bounds b;
  return result;
end;
$$;


ALTER FUNCTION "private"."list_market_inventory"("category_id" "text", "search_term" "text", "requested_page" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."list_market_items"("category_id" "text" DEFAULT NULL::"text", "search_term" "text" DEFAULT ''::"text", "requested_page" integer DEFAULT 0) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare viewer uuid:=private.combat_captain(); page_size integer:=30; observed timestamptz:=statement_timestamp(); result jsonb;
begin
  if requested_page is null or requested_page<0 or search_term is null or length(search_term)>100 then raise exception 'INVALID_FILTER' using errcode='22023'; end if;
  if category_id is not null and not exists(select 1 from private.item_categories c where c.id=category_id) then raise exception 'INVALID_CATEGORY' using errcode='22023'; end if;
  with sales as (
    select s.item_id,sum(s.quantity) sold from private.market_sales s
      where s.sold_at>observed-make_interval(hours=>12) and s.sold_at<=observed group by s.item_id
  ), offers as (
    select l.item_id,min(l.unit_price) minimum_price,sum(l.quantity) available from private.market_listings l where l.quantity>0 group by l.item_id
  ), matching as (
    select d.id item_id,d.name,d.category_id,d.kind,d.description,d.effect_description,d.image_path,
      c.total::text circulation,o.minimum_price,coalesce(o.available,0)::text available,
      coalesce(s.sold,0)::text sold,coalesce(s.sold,0) sold_order
      from private.item_definitions d join private.item_circulation c on c.item_id=d.id
      left join sales s on s.item_id=d.id left join offers o on o.item_id=d.id
      where d.active and d.tradable and (list_market_items.category_id is null or d.category_id=list_market_items.category_id)
        and strpos(lower(d.name),lower(btrim(search_term)))>0
  ), ordered as (
    select m.*,row_number() over(order by case when list_market_items.category_id is null then m.sold_order else 0 end desc,
      m.minimum_price nulls last,lower(m.name) collate "C",m.item_id) position from matching m
  ), bounds as (
    select count(*) total,least(requested_page,greatest(0,(count(*)-1)/page_size))::integer page from matching
  ), items as (
    select o.*,private.item_market_value_at(o.item_id,observed)::text market_value from ordered o
      order by position limit page_size offset(select page::bigint*page_size from bounds)
  )
  select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(i)-'sold_order'-'position' order by position) from items i),'[]'::jsonb),
    'total',b.total,'page',b.page,'page_size',page_size,'observed_at',observed) into result from bounds b;
  return result;
end;
$$;


ALTER FUNCTION "private"."list_market_items"("category_id" "text", "search_term" "text", "requested_page" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."list_market_listings"("target_item" "text" DEFAULT NULL::"text", "own_only" boolean DEFAULT false, "requested_page" integer DEFAULT 0) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare viewer uuid:=private.combat_captain(); page_size integer:=20; result jsonb;
begin
  if requested_page is null or requested_page<0 or own_only is null or (not own_only and target_item is null) then raise exception 'INVALID_FILTER' using errcode='22023'; end if;
  with matching as (
    select l.id,l.item_id,l.entry_type,l.quantity,l.unit_price,l.seller_id,p.display_name seller_name,p.player_number seller_player_number,
      l.seller_id=viewer is_own,d.name,d.image_path,d.kind,d.category_id,l.created_at,l.fee_bps,
      d.active and d.tradable tradable,
      case when l.entry_type='instance' then jsonb_build_object('damage',l.damage,'accuracy',l.accuracy) end stats
      from private.market_listings l join private.item_definitions d on d.id=l.item_id
      join public.character_profiles p on p.character_id=l.seller_id
      where l.quantity>0 and (not own_only or l.seller_id=viewer)
        and (target_item is null or l.item_id=target_item) and (own_only or (d.active and d.tradable))
  ), ordered as (
    select m.*,row_number() over(order by case when own_only then m.created_at end desc,
      m.unit_price,m.created_at,m.id) position from matching m
  ), bounds as (
    select count(*) total,least(requested_page,greatest(0,(count(*)-1)/page_size))::integer page from matching
  ), items as (
    select * from ordered order by position
      limit(select (case when own_only then 1 else page::bigint+1 end)*page_size from bounds)
      offset(select case when own_only then page::bigint*page_size else 0 end from bounds)
  )
  select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(i)-'position' order by position) from items i),'[]'::jsonb),
    'total',b.total,'page',b.page,'page_size',page_size,'observed_at',statement_timestamp()) into result from bounds b;
  return result;
end;
$$;


ALTER FUNCTION "private"."list_market_listings"("target_item" "text", "own_only" boolean, "requested_page" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."lock_combat_context"("captain_ids" "uuid"[]) RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "private"."lock_combat_context"("captain_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."loot_distribution"("target_id" "text", "skill_level" integer, "mastery_level" integer) RETURNS TABLE("item_id" "text", "chance" numeric)
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "private"."loot_distribution"("target_id" "text", "skill_level" integer, "mastery_level" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."loot_document"("target_id" "text") RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  select to_jsonb(t)||jsonb_build_object('entries',coalesce((
    select jsonb_agg(to_jsonb(e)-'loot_table_id' order by e.item_id)
    from private.loot_entries e where e.loot_table_id=t.id),'[]'::jsonb))
  from private.loot_tables t where t.id=target_id;
$$;


ALTER FUNCTION "private"."loot_document"("target_id" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "private"."mail_boxes" (
    "mail_id" bigint NOT NULL,
    "character_id" "uuid" NOT NULL,
    "direction" "text" NOT NULL,
    "read_at" timestamp with time zone,
    "saved_at" timestamp with time zone,
    "deleted_at" timestamp with time zone,
    CONSTRAINT "mail_boxes_direction_check" CHECK (("direction" = ANY (ARRAY['inbox'::"text", 'outbox'::"text"])))
);


ALTER TABLE "private"."mail_boxes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "private"."mail_messages" (
    "id" bigint NOT NULL,
    "sender_id" "uuid",
    "sender_name" "text" NOT NULL,
    "sender_player_number" bigint NOT NULL,
    "recipients" "jsonb" NOT NULL,
    "recipient_numbers" bigint[] NOT NULL,
    "request_id" "uuid" NOT NULL,
    "subject" "text" DEFAULT ''::"text" NOT NULL,
    "body" "text" NOT NULL,
    "sent_at" timestamp with time zone DEFAULT "clock_timestamp"() NOT NULL,
    "reply_to_id" bigint,
    "legacy_message_id" bigint,
    "search_vector" "tsvector" GENERATED ALWAYS AS ("to_tsvector"('"simple"'::"regconfig", (((("subject" || ' '::"text") || "body") || ' '::"text") || "sender_name"))) STORED,
    CONSTRAINT "mail_messages_body_check" CHECK (("length"("body") > 0)),
    CONSTRAINT "mail_messages_recipients_check" CHECK (("jsonb_typeof"("recipients") = 'array'::"text"))
);


ALTER TABLE "private"."mail_messages" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."mail_json"("m" "private"."mail_messages", "b" "private"."mail_boxes", "include_body" boolean DEFAULT false) RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  select jsonb_build_object('id',m.id::text,'subject',m.subject,'sender',jsonb_build_object('display_name',m.sender_name,'player_number',m.sender_player_number),
    'recipients',case when b.direction='outbox' then m.recipients else '[]'::jsonb end,'direction',b.direction,
    'sent_at',m.sent_at,'read_at',b.read_at,'saved',b.saved_at is not null,'can_reply',b.direction='inbox' and m.sender_id is not null,
    'reply_to_id',case when exists(select 1 from private.mail_boxes parent where parent.mail_id=m.reply_to_id and parent.character_id=b.character_id and parent.deleted_at is null) then m.reply_to_id::text else null end)
    ||case when include_body then jsonb_build_object('body',m.body) else '{}'::jsonb end;
$$;


ALTER FUNCTION "private"."mail_json"("m" "private"."mail_messages", "b" "private"."mail_boxes", "include_body" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."mark_all_notifications_read"("through_id" bigint) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare viewer_id uuid:=private.combat_captain();
begin
  if through_id is null or through_id<1 then raise exception 'INVALID_REQUEST' using errcode='22023'; end if;
  perform 1 from private.player_notifications where character_id=viewer_id and id<=through_id and read_at is null order by id for update;
  update private.player_notifications set read_at=clock_timestamp()
    where character_id=viewer_id and id<=through_id and read_at is null;
  if found then perform private.notify_training(viewer_id); end if;
end;
$$;


ALTER FUNCTION "private"."mark_all_notifications_read"("through_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."mark_messages_read"("target_player_number" bigint, "through_id" bigint) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare viewer_id uuid:=private.combat_captain(); target_id uuid; thread_key uuid;
begin
  if through_id is null or through_id<1 then raise exception 'INVALID_REQUEST' using errcode='22023'; end if;
  select id into target_id from public.characters where player_number=target_player_number;
  -- Serialize with send and gameplay; a read never locks the other player's state.
  perform 1 from public.characters where id=viewer_id for update;
  select id into thread_key from private.message_threads where participant_a=least(viewer_id,target_id) and participant_b=greatest(viewer_id,target_id);
  update private.player_messages set read_at=clock_timestamp()
    where thread_id=thread_key and recipient_id=viewer_id and id<=through_id and read_at is null;
  if found then perform private.notify_training(viewer_id); end if;
end;
$$;


ALTER FUNCTION "private"."mark_messages_read"("target_player_number" bigint, "through_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."mark_notification_read"("notification_id" bigint) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare viewer_id uuid:=private.combat_captain();
begin
  if notification_id is null or notification_id<1 then raise exception 'INVALID_REQUEST' using errcode='22023'; end if;
  update private.player_notifications set read_at=clock_timestamp()
    where character_id=viewer_id and id=notification_id and read_at is null;
  if found then perform private.notify_training(viewer_id); end if;
end;
$$;


ALTER FUNCTION "private"."mark_notification_read"("notification_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."morale_multiplier"("morale" numeric, "bonus_bps" integer) RETURNS numeric
    LANGUAGE "sql" IMMUTABLE STRICT
    SET "search_path" TO ''
    AS $$
  select 1+greatest(-100,least(100,morale))
    /100::numeric*bonus_bps/10000;
$$;


ALTER FUNCTION "private"."morale_multiplier"("morale" numeric, "bonus_bps" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."morale_snapshot"("stored_morale" numeric, "anchor" timestamp with time zone, "observed_at" timestamp with time zone) RETURNS TABLE("morale" numeric, "morale_updated_at" timestamp with time zone, "morale_next_at" timestamp with time zone)
    LANGUAGE "sql" IMMUTABLE STRICT
    SET "search_path" TO ''
    AS $$
  with recovered as (
    select sign(stored_morale)*greatest(0,abs(stored_morale)-greatest(0,
      floor(extract(epoch from observed_at)/300)
      -floor(extract(epoch from anchor)/300))*5) as value,
      greatest(anchor,observed_at) as checkpoint
  )
  select round(value,1),checkpoint,case when value<>0 then
    date_bin(make_interval(secs=>300),checkpoint,'1970-01-01Z'::timestamptz)
      +make_interval(secs=>300) end from recovered;
$$;


ALTER FUNCTION "private"."morale_snapshot"("stored_morale" numeric, "anchor" timestamp with time zone, "observed_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."notify_combat"("battle_id" "uuid") RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$
  insert into public.player_game_events(character_id,revision)
  select character_id,1 from private.combat_participants where combat_id=battle_id
  union select defender_id,1 from private.combats where id=battle_id
  on conflict(character_id) do update set revision=player_game_events.revision+1;
$$;


ALTER FUNCTION "private"."notify_combat"("battle_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."notify_completed_attack"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare attackers jsonb;
begin
  select jsonb_agg(jsonb_build_object('name',p.snapshot->>'name',
    'player_number',coalesce(p.snapshot->'player_number',to_jsonb(c.player_number))) order by p.joined_at,p.character_id)
    into attackers from private.combat_participants p
    join public.characters c on c.id=p.character_id where p.combat_id=new.id;
  -- Older encounter formats may have no participant rows.
  if attackers is null then
    attackers:=jsonb_build_array(jsonb_build_object('name',new.state#>>'{attacker,name}',
      'player_number',coalesce(new.state#>'{attacker,player_number}',
        (select to_jsonb(player_number) from public.characters where id=new.attacker_id))));
  end if;
  perform private.emit_notification(new.defender_id,'combat.attacked',new.id::text,
    jsonb_build_object('version',1,'battle_id',new.id,'attackers',attackers,'outcome',new.state->'outcome',
      'hospitalized',coalesce((new.state#>>'{defender,ship_health}')::integer=0
        or (new.state#>>'{defender,crew_health}')::integer=0,false)),coalesce(new.finished_at,clock_timestamp()));
  return new;
end;
$$;


ALTER FUNCTION "private"."notify_completed_attack"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."notify_market"("target_item" "text") RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$
  insert into public.market_item_events(item_id,revision) values(target_item,1)
    on conflict(item_id) do update set revision=market_item_events.revision+1;
$$;


ALTER FUNCTION "private"."notify_market"("target_item" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."notify_training"("captain_id" "uuid") RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$
  insert into public.player_game_events(character_id,revision) values(captain_id,1)
    on conflict(character_id) do update set revision=player_game_events.revision+1;
$$;


ALTER FUNCTION "private"."notify_training"("captain_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."perform_activity"("activity_id" "text", "expected_stamina_cost" numeric, "expected_xp_gain" numeric, "request_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  viewer_id uuid:=private.combat_captain(); previous private.activity_requests%rowtype;
  definition private.activity_definitions%rowtype; captain public.characters%rowtype;
  remaining_stamina integer; awarded jsonb; result jsonb; loot_result jsonb; before_level integer;
begin
  if request_id is null or activity_id is null or length(activity_id) not between 1 and 48
    or expected_stamina_cost is null or expected_stamina_cost not between 1 and 2147483647
    or expected_stamina_cost<>trunc(expected_stamina_cost)
    or expected_xp_gain is null or expected_xp_gain not between 1 and 9007199254740991
    or expected_xp_gain<>trunc(expected_xp_gain) then raise exception 'INVALID_REQUEST' using errcode='22023'; end if;
  perform private.settle_combat_context(array[viewer_id]);
  select * into previous from private.activity_requests r where r.character_id=viewer_id and r.request_id=perform_activity.request_id;
  if found then
    if previous.activity_id<>activity_id or previous.expected_stamina_cost<>expected_stamina_cost or previous.expected_xp_gain<>expected_xp_gain then
      raise exception 'REQUEST_CONFLICT' using errcode='22023'; end if;
    return previous.result;
  end if;
  perform private.assert_can_act(viewer_id);
  select * into captain from public.characters where id=viewer_id for update;
  if captain.location<>'the_harbor' then raise exception 'NOT_IN_HARBOR'; end if;
  select * into definition from private.activity_definitions d where d.id=activity_id and d.active;
  if not found then raise exception 'INVALID_ACTIVITY' using errcode='22023'; end if;
  if expected_stamina_cost<>1 or expected_xp_gain<>definition.xp_gain then
    raise exception 'STALE_OFFER'; end if;
  if exists(select 1 from private.character_skills where character_id=viewer_id and skill_id=definition.skill_id and xp=9007199254740991) then
    raise exception 'SKILL_XP_LIMIT'; end if;
  remaining_stamina:=private.spend_activity_stamina(viewer_id);
  select private.skill_level(xp) into before_level from private.character_skills where character_id=viewer_id and skill_id=definition.skill_id;
  loot_result:=private.roll_activity_loot(viewer_id,definition.id,before_level);
  awarded:=private.award_skill_xp(viewer_id,definition.skill_id,definition.xp_gain);
  result:=awarded||jsonb_build_object('activity_id',definition.id,'stamina_cost',1,
    'stamina_after',remaining_stamina,'loot',loot_result,'config_revision',public.get_gameplay_revision());
  insert into private.activity_requests(character_id,request_id,activity_id,expected_stamina_cost,expected_xp_gain,result)
    values(viewer_id,request_id,definition.id,expected_stamina_cost::integer,expected_xp_gain::bigint,result);
  return result;
end;
$$;


ALTER FUNCTION "private"."perform_activity"("activity_id" "text", "expected_stamina_cost" numeric, "expected_xp_gain" numeric, "request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."preserve_player_number"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  if new.player_number is distinct from old.player_number then
    raise exception 'PLAYER_NUMBER_IMMUTABLE' using errcode='23514';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "private"."preserve_player_number"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "private"."market_listings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "seller_id" "uuid" NOT NULL,
    "item_id" "text" NOT NULL,
    "entry_type" "text" NOT NULL,
    "original_entry_id" "uuid" NOT NULL,
    "quantity" bigint NOT NULL,
    "initial_quantity" bigint NOT NULL,
    "sold_quantity" bigint DEFAULT 0 NOT NULL,
    "returned_quantity" bigint DEFAULT 0 NOT NULL,
    "unit_price" bigint NOT NULL,
    "fee_bps" integer NOT NULL,
    "fee_paid" bigint DEFAULT 0 NOT NULL,
    "damage" numeric(12,2),
    "accuracy" numeric(5,2),
    "item_created_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "clock_timestamp"() NOT NULL,
    "closed_at" timestamp with time zone,
    CONSTRAINT "market_listings_check" CHECK (((("quantity" + "sold_quantity") + "returned_quantity") = "initial_quantity")),
    CONSTRAINT "market_listings_check1" CHECK (((("unit_price")::numeric * ("initial_quantity")::numeric) <= ('9007199254740991'::bigint)::numeric)),
    CONSTRAINT "market_listings_check2" CHECK ((("quantity" = 0) = ("closed_at" IS NOT NULL))),
    CONSTRAINT "market_listings_check3" CHECK (((("entry_type" = 'stack'::"text") AND ("damage" IS NULL) AND ("accuracy" IS NULL)) OR (("entry_type" = 'instance'::"text") AND ("initial_quantity" = 1) AND (("damage" >= (0)::numeric) AND ("damage" <= (1000000000)::numeric)) AND (("accuracy" >= (0)::numeric) AND ("accuracy" <= (100)::numeric))))),
    CONSTRAINT "market_listings_check4" CHECK ((("entry_type" = 'instance'::"text") = (("damage" IS NOT NULL) AND ("accuracy" IS NOT NULL)))),
    CONSTRAINT "market_listings_entry_type_check" CHECK (("entry_type" = ANY (ARRAY['stack'::"text", 'instance'::"text"]))),
    CONSTRAINT "market_listings_fee_bps_check" CHECK ((("fee_bps" >= 0) AND ("fee_bps" <= 10000))),
    CONSTRAINT "market_listings_fee_paid_check" CHECK (("fee_paid" >= 0)),
    CONSTRAINT "market_listings_initial_quantity_check" CHECK ((("initial_quantity" >= 1) AND ("initial_quantity" <= '9007199254740991'::bigint))),
    CONSTRAINT "market_listings_quantity_check" CHECK ((("quantity" >= 0) AND ("quantity" <= '9007199254740991'::bigint))),
    CONSTRAINT "market_listings_returned_quantity_check" CHECK (("returned_quantity" >= 0)),
    CONSTRAINT "market_listings_sold_quantity_check" CHECK (("sold_quantity" >= 0)),
    CONSTRAINT "market_listings_unit_price_check" CHECK ((("unit_price" >= 1) AND ("unit_price" <= '9007199254740991'::bigint)))
);


ALTER TABLE "private"."market_listings" OWNER TO "postgres";


COMMENT ON TABLE "private"."market_listings" IS 'Escrowed items. Transfers preserve instance identity, stats and world circulation.';


CREATE OR REPLACE FUNCTION "private"."receive_market_item"("listing" "private"."market_listings", "recipient_id" "uuid", "amount" bigint) RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare held bigint;
begin
  if listing.entry_type='instance' then
    if amount<>1 then raise exception 'INVALID_QUANTITY' using errcode='22023'; end if;
    insert into private.item_instances(id,character_id,item_id,damage,accuracy,created_at)
      values(listing.original_entry_id,recipient_id,listing.item_id,listing.damage,listing.accuracy,listing.item_created_at);
  else
    select quantity into held from private.item_stacks where character_id=recipient_id and item_id=listing.item_id for update;
    if coalesce(held,0)>9007199254740991-amount then raise exception 'ITEM_QUANTITY_LIMIT'; end if;
    insert into private.item_stacks(character_id,item_id,quantity) values(recipient_id,listing.item_id,amount)
      on conflict(character_id,item_id) do update set quantity=item_stacks.quantity+excluded.quantity;
  end if;
end;
$$;


ALTER FUNCTION "private"."receive_market_item"("listing" "private"."market_listings", "recipient_id" "uuid", "amount" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."record_character_action"("target_id" "uuid") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  insert into private.character_actions(character_id,last_action_at)
  select id,statement_timestamp() from public.characters where id=target_id and user_id=auth.uid()
  on conflict(character_id) do update
    set last_action_at=greatest(private.character_actions.last_action_at,excluded.last_action_at);
$$;


ALTER FUNCTION "private"."record_character_action"("target_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."record_economy_snapshot"() RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$
  insert into private.economy_snapshots(observed_at,slot,gold,bank_gold,item_units,item_value,unpriced_units,players)
  select statement_timestamp(),date_bin(interval '5 minutes',statement_timestamp(),timestamptz '2000-01-01'),
    g.gold,g.bank_gold,i.units,i.value,i.unpriced,g.players
  from (select coalesce(sum(gold_coins::numeric),0) gold,coalesce(sum(bank_gold_coins::numeric),0) bank_gold,count(*) players from public.characters) g
  cross join (select coalesce(sum(units),0) units,coalesce(sum(units*unit_value),0) value,
    coalesce(sum(units) filter(where unit_value is null),0) unpriced from private.economy_items(statement_timestamp())) i
  on conflict(slot) do nothing;
$$;


ALTER FUNCTION "private"."record_economy_snapshot"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."record_item_circulation_delta"("target_item" "text", "delta" numeric) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare current_total numeric; recorded timestamptz;
begin
  if delta=0 then return; end if;
  update private.item_circulation
    set total=total+delta,updated_at=greatest(clock_timestamp(),updated_at+interval '1 microsecond')
    where item_id=target_item returning total,updated_at into current_total,recorded;
  if not found then raise exception 'CIRCULATION_NOT_INITIALIZED'; end if;
  insert into private.item_circulation_history(item_id,transaction_id,recorded_at,total)
    values(target_item,pg_current_xact_id(),recorded,current_total)
    on conflict(item_id,transaction_id) do update set recorded_at=excluded.recorded_at,total=excluded.total;
end;
$$;


ALTER FUNCTION "private"."record_item_circulation_delta"("target_item" "text", "delta" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."record_player_activity"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare observed timestamptz:=statement_timestamp(); account_key bigint;
begin
  if auth.uid() is null or not exists(select 1 from auth.users where id=auth.uid() and not coalesce(is_anonymous,false) and deleted_at is null)
    or not exists(select 1 from auth.sessions where user_id=auth.uid() and id::text=auth.jwt()->>'session_id' and (not_after is null or not_after>observed)) then
    raise exception 'UNAUTHORIZED' using errcode='42501';
  end if;
  -- Throttle writes across tabs, but never skip a new UTC day.
  update private.player_statistics_accounts set last_active_at=observed
  where user_id=auth.uid() and deleted_at is null and (last_active_at is null or last_active_at<=observed-interval '1 minute'
    or (last_active_at at time zone 'UTC')::date<(observed at time zone 'UTC')::date
    or not exists(select 1 from private.player_activity_daily d where d.account_id=private.player_statistics_accounts.id and d.day=(observed at time zone 'UTC')::date))
  returning id into account_key;
  if account_key is null then return; end if;
  insert into private.player_activity_daily(account_id,day,first_at,last_at)
  values(account_key,(observed at time zone 'UTC')::date,observed,observed)
  on conflict(day,account_id) do update set last_at=greatest(private.player_activity_daily.last_at,excluded.last_at);
end;
$$;


ALTER FUNCTION "private"."record_player_activity"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."record_player_presence"("tab_id" "uuid", "is_active" boolean, "page_action" boolean, "closed" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare observed timestamptz:=statement_timestamp(); session_key uuid; captain_id uuid;
begin
  select s.id into session_key from auth.sessions s join auth.users u on u.id=s.user_id
    where s.user_id=auth.uid() and s.id::text=auth.jwt()->>'session_id'
      and (s.not_after is null or s.not_after>observed) and u.deleted_at is null and not coalesce(u.is_anonymous,false);
  if session_key is null then raise exception 'UNAUTHORIZED' using errcode='42501'; end if;
  if tab_id is null or is_active is null or page_action is null or closed is null then
    raise exception 'INVALID_REQUEST' using errcode='22023'; end if;
  select id into captain_id from public.characters where user_id=auth.uid();
  if captain_id is null then return; end if;
  delete from private.player_presence p where p.character_id=captain_id
    and (p.seen_at<=observed-make_interval(secs=>90)
      or (closed and p.session_id=session_key and p.tab_id=record_player_presence.tab_id));
  if closed then return; end if;
  insert into private.player_presence(session_id,tab_id,character_id,seen_at,active)
    values(session_key,tab_id,captain_id,observed,is_active)
    on conflict on constraint player_presence_pkey do update set seen_at=excluded.seen_at,active=excluded.active
      where player_presence.seen_at<=observed-interval '10 seconds' or player_presence.active<>excluded.active;
  if page_action then perform private.record_character_action(captain_id); end if;
end;
$$;


ALTER FUNCTION "private"."record_player_presence"("tab_id" "uuid", "is_active" boolean, "page_action" boolean, "closed" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."require_admin"() RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if not private.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
  -- Revocation waits for an in-flight operation, and takes effect on the next one.
  perform 1 from private.admin_members where user_id=auth.uid() for share;
  if not found then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
  return auth.uid();
end;
$$;


ALTER FUNCTION "private"."require_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."resolve_combat_round"("input_state" "jsonb", "player_order" "text", "rolls" double precision[]) RETURNS "jsonb"
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
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
    when d->>'defence_order' = 'cannon' and (d->>'ammo')::integer >= 1 then 'fire' else 'board' end;
  if player_order = 'fire' and (a->>'ammo')::integer < 1 then raise exception 'NO_AMMO'; end if;
  if player_order in ('fire', 'crew_attack') then
    chance := private.combat_hit_chance((a->group_name->>'accuracy')::numeric,(d->group_name->>'speed')::numeric);
    a_hit := rolls[1] < chance;
    if a_hit then a_damage := least((d->>health_key)::integer,
      private.combat_damage((a->group_name->>'attack')::numeric,(d->group_name->>'defense')::numeric)); end if;
  end if;
  if defender_order in ('fire', 'crew_attack') then
    chance := private.combat_hit_chance((d->group_name->>'accuracy')::numeric,(a->group_name->>'speed')::numeric);
    d_hit := rolls[2] < chance;
    if d_hit then d_damage := least((a->>health_key)::integer,
      private.combat_damage((d->group_name->>'attack')::numeric,(a->group_name->>'defense')::numeric)); end if;
  end if;
  a := a || jsonb_build_object(health_key, (a->>health_key)::integer - d_damage,
    'ammo', (a->>'ammo')::integer - case when player_order = 'fire' then 1 else 0 end);
  d := d || jsonb_build_object(health_key, (d->>health_key)::integer - a_damage,
    'ammo', (d->>'ammo')::integer - case when defender_order = 'fire' then 1 else 0 end);
  if (a->>'ship_health')::integer=0 then a:=a || jsonb_build_object('crew_health',0); end if;
  if (d->>'ship_health')::integer=0 then d:=d || jsonb_build_object('crew_health',0); end if;
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
      chance := greatest(0.2, least(0.9, 0.7 + 0.3 *
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


ALTER FUNCTION "private"."resolve_combat_round"("input_state" "jsonb", "player_order" "text", "rolls" double precision[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."roll_activity_loot"("target_id" "uuid", "activity_id" "text", "skill_level" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
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
    insert into private.item_instances(character_id,item_id,damage,accuracy)
      select target_id,selected_id,entry.damage,entry.accuracy from generate_series(1,entry.quantity);
  end if;
  return jsonb_build_object('caught',true,'table_id',loot.id,'table_version',loot.version,'skill_level',skill_level,
    'success_chance',success_chance,'item_id',item.id,'name',item.name,'image_path',item.image_path,'quantity',entry.quantity);
end;
$$;


ALTER FUNCTION "private"."roll_activity_loot"("target_id" "uuid", "activity_id" "text", "skill_level" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."save_defence_orders"("preset" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare viewer_id uuid:=private.combat_captain();
begin
  if preset is null or preset not in ('cannon','boarding') then raise exception 'INVALID_PRESET' using errcode='22023'; end if;
  perform private.settle_combat_context(array[viewer_id]);
  perform private.assert_can_act(viewer_id);
  update public.characters set defence_order=preset where id=viewer_id;
  perform private.record_character_action(viewer_id);
  return jsonb_build_object('preset',preset);
end;
$$;


ALTER FUNCTION "private"."save_defence_orders"("preset" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."scout_nearby_ships"("expected_version" "uuid", "request_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
  if recovered.energy<5 then raise exception 'NOT_ENOUGH_ENERGY'; end if;
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
  update public.characters set energy=recovered.energy-5,
    energy_updated_at=recovered.energy_updated_at where id=viewer_id;
  receipt:=jsonb_build_object('id',request_id,'sea_distance',c.sea_step,'scouted_at',observed_at,
    'total',total,'energy_cost',5);
  update private.sea_scouts s set result=receipt
    where s.character_id=viewer_id and s.request_id=scout_nearby_ships.request_id;
  perform private.notify_training(viewer_id);
  return receipt;
end;
$$;


ALTER FUNCTION "private"."scout_nearby_ships"("expected_version" "uuid", "request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."sea_state"("c" "public"."characters") RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "private"."sea_state"("c" "public"."characters") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."sea_travel_action"("action" "text", "expected_version" "uuid", "option_id" "uuid", "request_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
    if recovered.energy<5 then raise exception 'NOT_ENOUGH_ENERGY'; end if;
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
  duration_seconds:=case when action='return' then c.sea_step::bigint*60
    else 60 end;
  -- Keep deadlines representable by both PostgreSQL and the browser.
  if duration_seconds>=extract(epoch from ('9999-01-01Z'::timestamptz-observed_at))
    or next_step::bigint*60>=extract(epoch from ('9999-01-01Z'::timestamptz-observed_at)) then
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
    energy=recovered.energy-case when action='depart' then 5 else 0 end,
    energy_updated_at=recovered.energy_updated_at
    where id=viewer_id returning * into c;
  result:=jsonb_build_object('journey_id',c.travel_id,'kind',action,'arrives_at',deadline);
  insert into private.sea_travel_requests(character_id,request_id,action,expected_version,option_id,result)
    values(viewer_id,request_id,action,expected_version,option_id,result);
  perform private.notify_training(viewer_id);
  return result;
end;
$$;


ALTER FUNCTION "private"."sea_travel_action"("action" "text", "expected_version" "uuid", "option_id" "uuid", "request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."send_mail"("target_numbers" bigint[], "mail_subject" "text", "mail_body" "text", "request_id" "uuid", "reply_to_id" bigint DEFAULT NULL::bigint) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare viewer_id uuid:=private.combat_captain(); targets bigint[]; participants uuid[]; recipient_data jsonb;
  saved private.mail_messages%rowtype; actor public.characters%rowtype; parent_sender bigint; normalized text; title text; owner_id uuid;
begin
  if request_id is null or target_numbers is null or array_ndims(target_numbers)<>1 or cardinality(target_numbers)=0
    or cardinality(target_numbers)>50 or array_position(target_numbers,null) is not null
    or mail_body is null or mail_subject is null then raise exception 'INVALID_MAIL' using errcode='22023'; end if;
  targets:=array(select distinct n from unnest(target_numbers) n order by n);
  normalized:=btrim(replace(replace(mail_body,E'\r\n',E'\n'),E'\r',E'\n'),E' \t\n');
  title:=btrim(mail_subject);
  -- A completed request remains confirmable if recipients later ignore or leave.
  select * into saved from private.mail_messages m where m.sender_id=viewer_id and m.request_id=send_mail.request_id;
  if found then
    if saved.recipient_numbers<>targets or saved.body<>normalized or saved.subject<>title or saved.reply_to_id is distinct from send_mail.reply_to_id then
      -- Legacy sends acquire a history parent during import, without changing the original request.
      if not (saved.legacy_message_id is not null and send_mail.reply_to_id is null and saved.recipient_numbers=targets and saved.body=normalized and saved.subject=title) then
        raise exception 'REQUEST_MISMATCH' using errcode='22023';
      end if;
    end if;
    return jsonb_build_object('mail_id',saved.id::text,'recipient_count',cardinality(saved.recipient_numbers),'sent_at',saved.sent_at);
  end if;
  if cardinality(target_numbers)>10 then
    raise exception 'TOO_MANY_RECIPIENTS' using errcode='22023';
  end if;
  if length(normalized) not between 1 and 5000 or normalized !~ '[^[:space:]]'
    or translate(normalized,E'\t\n','') ~ '[[:cntrl:]]' or length(title)>120 or title ~ '[[:cntrl:]]' then
    raise exception 'INVALID_MAIL' using errcode='22023';
  end if;
  select array_agg(id order by id) into participants from public.characters where player_number=any(targets);
  if cardinality(participants) is distinct from cardinality(targets) then raise exception 'RECIPIENT_UNAVAILABLE' using errcode='P0002'; end if;
  if viewer_id=any(participants) then raise exception 'SELF_MESSAGE' using errcode='22023'; end if;
  -- All recipients and the sender use gameplay's deterministic character lock order.
  perform 1 from public.characters where id=viewer_id or id=any(participants) order by id for update;
  select * into actor from public.characters where id=viewer_id;
  select * into saved from private.mail_messages m where m.sender_id=viewer_id and m.request_id=send_mail.request_id;
  if found then
    if saved.recipient_numbers<>targets or saved.body<>normalized or saved.subject<>title or saved.reply_to_id is distinct from send_mail.reply_to_id then
      raise exception 'REQUEST_MISMATCH' using errcode='22023';
    end if;
    return jsonb_build_object('mail_id',saved.id::text,'recipient_count',cardinality(saved.recipient_numbers),'sent_at',saved.sent_at);
  end if;
  select jsonb_agg(jsonb_build_object('display_name',display_name,'player_number',player_number) order by player_number) into recipient_data
    from public.characters where id=any(participants);
  if jsonb_array_length(recipient_data) is distinct from cardinality(targets) or exists(select 1 from private.mail_ignored where character_id=any(participants) and ignored_id=viewer_id) then
    raise exception 'RECIPIENT_UNAVAILABLE' using errcode='P0002';
  end if;
  if send_mail.reply_to_id is not null then
    select m.sender_player_number into parent_sender from private.mail_messages m join private.mail_boxes b on b.mail_id=m.id
      where m.id=send_mail.reply_to_id and b.character_id=viewer_id and b.direction='inbox' and b.deleted_at is null and m.sender_id is not null;
    if parent_sender is null or targets<>array[parent_sender] then raise exception 'INVALID_REPLY' using errcode='22023'; end if;
  end if;
  if coalesce((select sum(cardinality(recipient_numbers)) from private.mail_messages where sender_id=viewer_id and sent_at>clock_timestamp()-interval '1 minute'),0)+cardinality(targets)>30 then
    raise exception 'MESSAGE_RATE_LIMIT' using errcode='P0001';
  end if;
  insert into private.mail_messages(sender_id,sender_name,sender_player_number,recipients,recipient_numbers,request_id,subject,body,reply_to_id)
    values(viewer_id,actor.display_name,actor.player_number,recipient_data,targets,request_id,title,normalized,send_mail.reply_to_id) returning * into saved;
  insert into private.mail_boxes(mail_id,character_id,direction,read_at) values(saved.id,viewer_id,'outbox',saved.sent_at);
  insert into private.mail_boxes(mail_id,character_id,direction) select saved.id,id,'inbox' from unnest(participants) id;
  perform private.record_character_action(viewer_id);
  for owner_id in select id from public.characters where id=viewer_id or id=any(participants) order by id loop
    perform private.notify_training(owner_id);
  end loop;
  return jsonb_build_object('mail_id',saved.id::text,'recipient_count',cardinality(saved.recipient_numbers),'sent_at',saved.sent_at);
end;
$$;


ALTER FUNCTION "private"."send_mail"("target_numbers" bigint[], "mail_subject" "text", "mail_body" "text", "request_id" "uuid", "reply_to_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."send_player_message"("target_player_number" bigint, "message_body" "text", "request_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare viewer_id uuid:=private.combat_captain(); target_id uuid; thread_key uuid; saved private.player_messages%rowtype; normalized text;
begin
  if request_id is null or message_body is null then raise exception 'INVALID_MESSAGE' using errcode='22023'; end if;
  normalized:=btrim(replace(replace(message_body,E'\r\n',E'\n'),E'\r',E'\n'),E' \t\n');
  if length(normalized) not between 1 and 5000 or normalized !~ '[^[:space:]]' or translate(normalized,E'\t\n','') ~ '[[:cntrl:]]' then
    raise exception 'INVALID_MESSAGE' using errcode='22023';
  end if;
  select id into target_id from public.characters where player_number=target_player_number;
  if target_id is null then raise exception 'PLAYER_NOT_FOUND' using errcode='P0002'; end if;
  if target_id=viewer_id then raise exception 'SELF_MESSAGE' using errcode='22023'; end if;
  -- Match gameplay lock order before receipts, conversation and owner events.
  perform 1 from public.characters where id in(viewer_id,target_id) order by id for update;
  select * into saved from private.player_messages m where m.sender_id=viewer_id and m.request_id=send_player_message.request_id;
  if found then
    if saved.recipient_id<>target_id or saved.body<>normalized then raise exception 'REQUEST_MISMATCH' using errcode='22023'; end if;
    return jsonb_build_object('message_id',saved.id::text,'recipient_player_number',target_player_number,'created_at',saved.created_at);
  end if;
  if (select count(*) from private.player_messages where sender_id=viewer_id and created_at>clock_timestamp()-interval '1 minute') >= 30 then
    raise exception 'MESSAGE_RATE_LIMIT' using errcode='P0001';
  end if;
  insert into private.message_threads(participant_a,participant_b) values(least(viewer_id,target_id),greatest(viewer_id,target_id))
    on conflict on constraint message_threads_pair do nothing;
  select id into thread_key from private.message_threads where participant_a=least(viewer_id,target_id) and participant_b=greatest(viewer_id,target_id) for update;
  insert into private.player_messages(thread_id,sender_id,recipient_id,request_id,body)
    values(thread_key,viewer_id,target_id,request_id,normalized) returning * into saved;
  update private.message_threads set latest_message_id=saved.id where id=thread_key;
  perform private.record_character_action(viewer_id);
  perform private.notify_training(least(viewer_id,target_id));
  perform private.notify_training(greatest(viewer_id,target_id));
  return jsonb_build_object('message_id',saved.id::text,'recipient_player_number',target_player_number,'created_at',saved.created_at);
end;
$$;


ALTER FUNCTION "private"."send_player_message"("target_player_number" bigint, "message_body" "text", "request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."set_mail_ignored"("target_player_number" bigint, "ignored" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare viewer_id uuid:=private.combat_captain(); target_id uuid; changed integer;
begin
  if ignored is null then raise exception 'INVALID_REQUEST' using errcode='22023'; end if;
  select id into target_id from public.characters where player_number=target_player_number;
  if target_id is null then raise exception 'PLAYER_NOT_FOUND' using errcode='P0002'; end if;
  if target_id=viewer_id then raise exception 'SELF_MESSAGE' using errcode='22023'; end if;
  perform 1 from public.characters where id in(viewer_id,target_id) order by id for update;
  if not exists(select 1 from public.characters where id=target_id) then raise exception 'PLAYER_NOT_FOUND' using errcode='P0002'; end if;
  if ignored then
    insert into private.mail_ignored(character_id,ignored_id) values(viewer_id,target_id) on conflict do nothing;
  else delete from private.mail_ignored where character_id=viewer_id and ignored_id=target_id;
  end if;
  get diagnostics changed=row_count;
  if changed>0 then perform private.notify_training(viewer_id); end if;
end;
$$;


ALTER FUNCTION "private"."set_mail_ignored"("target_player_number" bigint, "ignored" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."settle_combat_context"("captain_ids" "uuid"[]) RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
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
    perform private.settle_sea_travel(captain_id,clock_timestamp());
  end loop;
end;
$$;


ALTER FUNCTION "private"."settle_combat_context"("captain_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."settle_hospital"("captain_id" "uuid", "observed_at" timestamp with time zone) RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  update public.characters set ship_health=100,crew_health=100,
    ship_recovery_at=hospital_until,crew_recovery_at=hospital_until,hospital_started_at=null,hospital_until=null
    where id=captain_id and hospital_until<=observed_at;
end;
$$;


ALTER FUNCTION "private"."settle_hospital"("captain_id" "uuid", "observed_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."settle_sea_travel"("captain_id" "uuid", "observed_at" timestamp with time zone) RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "private"."settle_sea_travel"("captain_id" "uuid", "observed_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."settle_ship_upgrade"("captain_id" "uuid", "observed_at" timestamp with time zone) RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $_$
declare job private.ship_upgrade_jobs%rowtype;
begin
  select * into job from private.ship_upgrade_jobs where character_id=captain_id and applied_at is null for update;
  if not found or job.finishes_at>observed_at then return; end if;
  execute format('update public.characters set %I=%I+$1 where id=$2','ship_'||job.stat,'ship_'||job.stat)
    using job.stat_gain,captain_id;
  update private.character_training set xp=xp+job.xp_gain where character_id=captain_id and training_group='ship';
  update private.ship_upgrade_jobs set applied_at=observed_at where id=job.id;
  perform private.notify_training(captain_id);
end;
$_$;


ALTER FUNCTION "private"."settle_ship_upgrade"("captain_id" "uuid", "observed_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."ship_material_costs"("captain_id" "uuid", "energy_amount" integer) RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  select coalesce(jsonb_agg(jsonb_build_object('item_id',m.item_id,'name',coalesce(d.name,m.item_id),
    'quantity',m.quantity*ceil(energy_amount::numeric/5)::bigint,
    'owned',coalesce(s.quantity,0),'available',coalesce(d.active and d.stackable and d.category_id='materials',false)) order by m.item_id),'[]'::jsonb)
  from (values ('oak_planks',1::bigint),('iron_nails',1::bigint)) m(item_id,quantity)
  left join private.item_definitions d on d.id=m.item_id
  left join private.item_stacks s on s.item_id=m.item_id and s.character_id=captain_id;
$$;


ALTER FUNCTION "private"."ship_material_costs"("captain_id" "uuid", "energy_amount" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."ship_training_gain"("stat_value" numeric, "efficiency" numeric, "energy_amount" integer) RETURNS numeric
    LANGUAGE "sql" IMMUTABLE STRICT
    SET "search_path" TO ''
    AS $$
  select private.training_gain(stat_value,efficiency*2,energy_amount);
$$;


ALTER FUNCTION "private"."ship_training_gain"("stat_value" numeric, "efficiency" numeric, "energy_amount" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."skill_level"("experience" bigint) RETURNS integer
    LANGUAGE "sql" STABLE STRICT
    SET "search_path" TO ''
    AS $$
  select coalesce(max(level),1) from private.skill_levels where xp<=experience;
$$;


ALTER FUNCTION "private"."skill_level"("experience" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."spend_activity_stamina"("target_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare c public.characters%rowtype; recovered record; observed_at timestamptz;
begin
  if auth.uid() is null or not private.is_registered_player() then
    raise exception 'UNAUTHORIZED' using errcode='42501'; end if;
  if not exists(select 1 from public.characters where id=target_id and user_id=auth.uid()) then
    raise exception 'UNAUTHORIZED' using errcode='42501'; end if;
  perform private.lock_combat_context(array[target_id]);
  select * into c from public.characters where id=target_id and user_id=auth.uid() for update;
  if not found then raise exception 'UNAUTHORIZED' using errcode='42501'; end if;
  observed_at:=clock_timestamp();
  select * into recovered from private.stamina_snapshot(c.stamina,c.stamina_updated_at,observed_at);
  if recovered.stamina<1 then
    raise exception 'INSUFFICIENT_STAMINA' using errcode='P0001'; end if;
  update public.characters set stamina=recovered.stamina-1,
    stamina_updated_at=recovered.stamina_updated_at where id=target_id;
  perform private.notify_training(target_id);
  return recovered.stamina-1;
end;
$$;


ALTER FUNCTION "private"."spend_activity_stamina"("target_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."stamina_snapshot"("stored_stamina" integer, "anchor" timestamp with time zone, "observed_at" timestamp with time zone) RETURNS TABLE("stamina" integer, "stamina_updated_at" timestamp with time zone, "stamina_next_at" timestamp with time zone)
    LANGUAGE "sql" IMMUTABLE STRICT
    SET "search_path" TO ''
    AS $$
  with recovered as (
    select greatest(stored_stamina,least(50,stored_stamina+greatest(0,
      floor(extract(epoch from observed_at)/300)
      -floor(extract(epoch from anchor)/300))*1))::integer as value,
      greatest(anchor,observed_at) as checkpoint
  )
  select value,checkpoint,case when value<50 then
    date_bin(make_interval(secs=>300),checkpoint,'1970-01-01Z'::timestamptz)
      +make_interval(secs=>300) end from recovered;
$$;


ALTER FUNCTION "private"."stamina_snapshot"("stored_stamina" integer, "anchor" timestamp with time zone, "observed_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."start_combat"("target_id" "uuid", "request_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
  perform private.settle_ship_upgrade(viewer_id,observed_at);
  perform private.settle_ship_upgrade(target_id,observed_at);
  select * into a from public.characters where id=viewer_id;
  select * into d from public.characters where id=target_id;
  select * into recovered from private.character_energy_snapshot(a,observed_at);
  snapshot:=private.combat_snapshot(a,observed_at);
  battle_id:=(preview->>'join_combat_id')::uuid; joining:=battle_id is not null;
  if not joining then
    initial_state:=jsonb_build_object('attacker',snapshot,'defender',private.combat_snapshot(d,observed_at),
      'status','active','outcome',null,'winner_id',null);
    insert into private.combats(attacker_id,defender_id,start_request_id,rules_version,state,started_at,deadline,hard_deadline)
      values(viewer_id,target_id,request_id,2,initial_state,observed_at,observed_at+make_interval(secs => 120),observed_at+make_interval(secs => 600))
      returning id into battle_id;
    insert into private.combat_engagements(character_id,combat_id,role) values(target_id,battle_id,'defender');
    update public.characters set protected_until=null,ship_health=(initial_state->'defender'->>'ship_health')::integer,
      crew_health=(initial_state->'defender'->>'crew_health')::integer,ship_recovery_at=observed_at,crew_recovery_at=observed_at where id=target_id;
  end if;
  select * into b from private.combats where id=battle_id for update;
  insert into private.combat_participants(combat_id,character_id,start_request_id,snapshot,joined_at,deadline)
    values(battle_id,viewer_id,request_id,snapshot,observed_at,least(b.hard_deadline,observed_at+make_interval(secs => 120)));
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


ALTER FUNCTION "private"."start_combat"("target_id" "uuid", "request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."submit_combat_order"("battle_id" "uuid", "expected_round" integer, "player_order" "text", "request_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
  if exists(select 1 from public.characters where id=viewer_id and hospital_until is not null) then raise exception 'IN_HOSPITAL'; end if;
  if exists(select 1 from public.characters where id=viewer_id and location='traveling') then raise exception 'TRAVELING'; end if;
  if p.round<>expected_round then return jsonb_build_object('error','STALE_ROUND'); end if;
  if player_order is null or (p.phase='sea' and player_order not in ('fire','board','retreat'))
    or (p.phase='boarding' and player_order not in ('crew_attack','disengage','retreat')) then return jsonb_build_object('error','INVALID_ORDER'); end if;
  if player_order='fire' and (p.snapshot->>'ammo')::integer<1 then return jsonb_build_object('error','NO_AMMO'); end if;
  perform private.advance_shared_combat(battle_id,viewer_id,player_order,request_id,clock_timestamp(),false);
  perform private.record_character_action(viewer_id);
  return jsonb_build_object('battle',private.combat_view(battle_id,viewer_id));
end;
$$;


ALTER FUNCTION "private"."submit_combat_order"("battle_id" "uuid", "expected_round" integer, "player_order" "text", "request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."sync_character_profile"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  insert into public.character_profiles(character_id,player_number,display_name,location,created_at,arrives_at,arrival_location,
    max_sea_distance,arrival_max_sea_distance)
    values(new.id,new.player_number,new.display_name,new.location,new.created_at,new.travel_arrives_at,
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


ALTER FUNCTION "private"."sync_character_profile"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."sync_harbor_player"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "private"."sync_harbor_player"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."sync_hospital_patient"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "private"."sync_hospital_patient"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."sync_skill_progress"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare captain_id uuid:=case when tg_op='DELETE' then old.character_id else new.character_id end; total integer;
begin
  if exists(select 1 from public.characters where id=captain_id) then
    total:=private.character_level(captain_id);
    update public.character_profiles set character_level=total
      where character_id=captain_id and character_level is distinct from total;
    perform private.notify_training(captain_id);
  end if;
  return null;
end;
$$;


ALTER FUNCTION "private"."sync_skill_progress"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."track_character_action"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  perform private.record_character_action(new.character_id);
  return new;
end;
$$;


ALTER FUNCTION "private"."track_character_action"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."track_item_circulation"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare change record;
begin
  if tg_op='INSERT' then
    for change in select n.item_id,sum(coalesce((to_jsonb(n)->>'quantity')::numeric,1)) delta
      from new_items n group by n.item_id order by n.item_id
    loop perform private.record_item_circulation_delta(change.item_id,change.delta); end loop;
  elsif tg_op='DELETE' then
    for change in select o.item_id,-sum(coalesce((to_jsonb(o)->>'quantity')::numeric,1)) delta
      from old_items o group by o.item_id order by o.item_id
    loop perform private.record_item_circulation_delta(change.item_id,change.delta); end loop;
  else
    for change in select item_id,sum(amount) delta from (
      select n.item_id,coalesce((to_jsonb(n)->>'quantity')::numeric,1) amount from new_items n
      union all select o.item_id,-coalesce((to_jsonb(o)->>'quantity')::numeric,1) from old_items o
    ) changes group by item_id having sum(amount)<>0 order by item_id
    loop perform private.record_item_circulation_delta(change.item_id,change.delta); end loop;
  end if;
  return null;
end;
$$;


ALTER FUNCTION "private"."track_item_circulation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."track_item_market_totals"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  changes jsonb;
  affected record;
  baseline_quantity numeric;
  baseline_gross numeric;
begin
  if tg_op='INSERT' then
    select jsonb_agg(jsonb_build_object('item_id',item_id,'sold_at',sold_at)) into changes from new_sales;
  elsif tg_op='DELETE' then
    select jsonb_agg(jsonb_build_object('item_id',item_id,'sold_at',sold_at)) into changes from old_sales;
  else
    select jsonb_agg(jsonb_build_object('item_id',item_id,'sold_at',sold_at)) into changes from (
      select o.item_id,o.sold_at from old_sales o join new_sales n using(id)
        where (o.item_id,o.sold_at,o.quantity,o.gross) is distinct from (n.item_id,n.sold_at,n.quantity,n.gross)
      union all
      select n.item_id,n.sold_at from old_sales o join new_sales n using(id)
        where (o.item_id,o.sold_at,o.quantity,o.gross) is distinct from (n.item_id,n.sold_at,n.quantity,n.gross)
    ) changed;
  end if;
  -- Lock every affected item before moving a sale between item histories.
  perform 1 from private.item_circulation where item_id in (
    select c.item_id from jsonb_to_recordset(coalesce(changes,'[]'::jsonb)) as c(item_id text)
  ) order by item_id for update;
  for affected in select item_id,min(sold_at) since
    from jsonb_to_recordset(coalesce(changes,'[]'::jsonb)) as c(item_id text,sold_at timestamptz)
    group by item_id order by item_id
  loop
    select quantity_total,gross_total into baseline_quantity,baseline_gross
      from private.item_market_totals where item_id=affected.item_id and sold_at<affected.since
      order by sold_at desc,sale_id desc limit 1;
    delete from private.item_market_totals where item_id=affected.item_id and sold_at>=affected.since;
    insert into private.item_market_totals(sale_id,item_id,sold_at,quantity_total,gross_total)
      select id,item_id,sold_at,
        coalesce(baseline_quantity,0)+sum(quantity) over(order by sold_at,id rows unbounded preceding),
        coalesce(baseline_gross,0)+sum(gross) over(order by sold_at,id rows unbounded preceding)
      from private.market_sales where item_id=affected.item_id and sold_at>=affected.since
      on conflict(sale_id) do update set item_id=excluded.item_id,sold_at=excluded.sold_at,
        quantity_total=excluded.quantity_total,gross_total=excluded.gross_total;
  end loop;
  return null;
end;
$$;


ALTER FUNCTION "private"."track_item_market_totals"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."track_player_statistics"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare account_key bigint; login_changed boolean; observed timestamptz:=statement_timestamp();
begin
  if tg_op='DELETE' then
    update private.player_statistics_accounts set deleted_at=coalesce(deleted_at,observed) where user_id=old.id;
    return old;
  end if;
  if new.deleted_at is not null or coalesce(new.is_anonymous,false) then
    update private.player_statistics_accounts set deleted_at=coalesce(deleted_at,new.deleted_at,observed) where user_id=new.id;
    return new;
  end if;
  insert into private.player_statistics_accounts(user_id,registered_at,last_sign_in_at,last_active_at)
  values(new.id,coalesce(new.created_at,observed),new.last_sign_in_at,case when new.last_sign_in_at is not null then least(new.last_sign_in_at,observed) end)
  on conflict(user_id) do update set last_sign_in_at=greatest(private.player_statistics_accounts.last_sign_in_at,excluded.last_sign_in_at),
    last_active_at=greatest(private.player_statistics_accounts.last_active_at,excluded.last_active_at),deleted_at=null
  returning id into account_key;
  login_changed:=new.last_sign_in_at is not null;
  if tg_op='UPDATE' then login_changed:=login_changed and (old.last_sign_in_at is null or new.last_sign_in_at>old.last_sign_in_at); end if;
  if login_changed and new.last_sign_in_at between (select activity_tracked_since from private.player_statistics_config) and observed then
    insert into private.player_activity_daily(account_id,day,first_at,last_at)
    values(account_key,(new.last_sign_in_at at time zone 'UTC')::date,new.last_sign_in_at,new.last_sign_in_at)
    on conflict(day,account_id) do update set
      first_at=least(private.player_activity_daily.first_at,excluded.first_at),last_at=greatest(private.player_activity_daily.last_at,excluded.last_at);
  end if;
  return new;
end;
$$;


ALTER FUNCTION "private"."track_player_statistics"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."training_action"("action" "text", "payload" "jsonb", "request_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
declare
  viewer_id uuid:=private.combat_captain();
  captain public.characters%rowtype;
  progress private.character_training%rowtype;
  tier private.training_tiers%rowtype;
  current_tier private.training_tiers%rowtype;
  previous private.training_requests%rowtype;
  job private.ship_upgrade_jobs%rowtype;
  material record; material_ids text[]; materials jsonb:='[]'::jsonb;
  recovered record; morale_state record; morale_before numeric; morale_after numeric; morale_factor numeric; base_gain numeric;
  group_name text:=case when action='crew' then 'crew' when action='ship' then 'ship' else payload->>'group' end;
  stat text:=payload->>'stat';
  observed_at timestamptz;
  gain numeric; normal_gain numeric; stat_before numeric; xp_gain bigint; energy_cost integer; result jsonb;
begin
  if request_id is null or action is null or action not in ('crew','ship','purchase') or payload is null then
    raise exception 'INVALID_REQUEST' using errcode='22023'; end if;
  if group_name is null or group_name not in ('crew','ship') then raise exception 'INVALID_GROUP' using errcode='22023'; end if;
  if action in ('crew','ship') and (stat is null or stat not in ('attack','defense','speed','accuracy')) then
    raise exception 'INVALID_STAT' using errcode='22023'; end if;
  perform private.settle_combat_context(array[viewer_id]);
  select * into previous from private.training_requests r where r.character_id=viewer_id and r.request_id=training_action.request_id;
  if found then
    if previous.action<>action or previous.payload<>payload then raise exception 'REQUEST_CONFLICT' using errcode='22023'; end if;
    return previous.result;
  end if;
  observed_at:=clock_timestamp();
  perform private.settle_ship_upgrade(viewer_id,observed_at);
  perform private.assert_can_act(viewer_id);
  select * into captain from public.characters where id=viewer_id for update;
  if captain.location<>'the_harbor' then raise exception 'NOT_IN_HARBOR'; end if;
  select * into progress from private.character_training where character_id=viewer_id and training_group=group_name for update;
  select * into current_tier from private.training_tiers where training_group=group_name and id=progress.tier_id;
  if action='purchase' then
    select * into tier from private.training_tiers where training_group=group_name and id=payload->>'tier_id';
    if tier.id is null or tier.position<>current_tier.position+1 then raise exception 'INVALID_TIER' using errcode='22023'; end if;
    if progress.xp<tier.xp_required then raise exception 'NOT_ENOUGH_XP'; end if;
    if captain.gold_coins<tier.gold_cost then raise exception 'NOT_ENOUGH_GOLD'; end if;
    update public.characters set gold_coins=gold_coins-tier.gold_cost where id=viewer_id;
    update private.character_training set tier_id=tier.id where character_id=viewer_id and training_group=group_name;
    result:=jsonb_build_object('kind','purchase','group',group_name,'tier_id',tier.id,'tier_name',tier.name,'gold_cost',tier.gold_cost);
  else
    if payload->>'tier_id' is distinct from current_tier.id then raise exception 'STALE_TIER' using errcode='22023'; end if;
    energy_cost:=5;
    stat_before:=(to_jsonb(captain)->>(group_name||'_'||stat))::numeric;
    if action='ship' then
      if exists(select 1 from private.ship_upgrade_jobs where character_id=viewer_id and applied_at is null) then raise exception 'SHIP_WORK_ACTIVE'; end if;
      if jsonb_typeof(payload->'energy_amount') is distinct from 'number'
        or (payload->>'energy_amount')::numeric<>trunc((payload->>'energy_amount')::numeric)
        or (payload->>'energy_amount')::numeric not between 5 and 1000
      then raise exception 'INVALID_ENERGY' using errcode='22023'; end if;
      energy_cost:=(payload->>'energy_amount')::integer;
    end if;
    base_gain:=case when action='ship' then private.ship_training_gain(stat_before,current_tier.efficiency,energy_cost)
      else private.training_gain(stat_before,current_tier.efficiency,energy_cost) end;
    normal_gain:=base_gain;
    if action='crew' then
      select * into morale_state from private.morale_snapshot(captain.crew_morale,captain.morale_updated_at,observed_at);
      morale_before:=morale_state.morale;
      morale_after:=greatest(-100,morale_before-energy_cost*0.5);
      morale_factor:=private.morale_multiplier(morale_before,500);
      normal_gain:=trim_scale(round(base_gain*morale_factor,6));
    end if;
    gain:=case when action='crew' then private.crew_training_gain(normal_gain,private.combat_roll()) else normal_gain end;
    xp_gain:=energy_cost::bigint*1;
    if (to_jsonb(captain)->>(group_name||'_'||stat))::numeric>9007199254740991-gain
      or progress.xp>9007199254740991-xp_gain then raise exception 'PROGRESSION_LIMIT'; end if;
    select * into recovered from private.character_energy_snapshot(captain,observed_at);
    if recovered.energy<energy_cost then raise exception 'NOT_ENOUGH_ENERGY'; end if;
    if action='ship' then
      select array_agg(m.item_id order by m.item_id) into material_ids from (values ('oak_planks',1::bigint),('iron_nails',1::bigint)) m(item_id,quantity);
      perform 1 from private.item_definitions d where d.id=any(material_ids) order by d.id for share;
      perform 1 from private.item_stacks s where s.character_id=viewer_id and s.item_id=any(material_ids) order by s.item_id for update;
      materials:=private.ship_material_costs(viewer_id,energy_cost);
      for material in select * from jsonb_to_recordset(materials) as m(item_id text,name text,quantity bigint,owned bigint,available boolean) loop
        if not material.available then raise exception 'MATERIAL_UNAVAILABLE'; end if;
        if material.owned<material.quantity then raise exception 'INSUFFICIENT_MATERIALS'; end if;
      end loop;
      -- Circulation counters use the same ordered lock as crafting and trading.
      perform 1 from private.item_circulation c where c.item_id=any(material_ids) order by c.item_id for update;
      for material in select * from jsonb_to_recordset(materials) as m(item_id text,quantity bigint) loop
        delete from private.item_stacks s where s.character_id=viewer_id and s.item_id=material.item_id and s.quantity=material.quantity;
        update private.item_stacks s set quantity=s.quantity-material.quantity where s.character_id=viewer_id and s.item_id=material.item_id;
      end loop;
      select jsonb_agg(value-'owned'-'available') into materials from jsonb_array_elements(materials);
    end if;
    update public.characters set energy=recovered.energy-energy_cost,energy_updated_at=recovered.energy_updated_at where id=viewer_id;
    if action='crew' then
      update public.characters set crew_morale=morale_after,morale_updated_at=morale_state.morale_updated_at where id=viewer_id;
      execute format('update public.characters set %I=%I+$1 where id=$2','crew_'||stat,'crew_'||stat) using gain,viewer_id;
      update private.character_training set xp=xp+xp_gain where character_id=viewer_id and training_group='crew';
      result:=jsonb_build_object('kind','crew','stat',stat,'stat_gain',gain,'xp_gain',xp_gain,'energy_cost',energy_cost,
        'perfect',gain>normal_gain,'tier_id',current_tier.id,'morale_before',morale_before,'morale_after',morale_after,
        'morale_multiplier',morale_factor,'base_gain',base_gain);
    else
      insert into private.ship_upgrade_jobs(character_id,stat,workshop_id,workshop_name,energy_cost,stat_gain,xp_gain,materials,config_revision,started_at,finishes_at)
        values(viewer_id,stat,current_tier.id,current_tier.name,energy_cost,gain,xp_gain,materials,public.get_gameplay_revision(),
          observed_at,observed_at+make_interval(secs=>energy_cost::double precision*6)) returning * into job;
      result:=jsonb_build_object('kind','ship','job_id',job.id,'stat',stat,'stat_gain',gain,'xp_gain',xp_gain,
        'energy_cost',energy_cost,'finishes_at',job.finishes_at,'materials',materials,'gain_multiplier',2);
    end if;
  end if;
  if action in ('crew','ship') then
    result:=result||jsonb_build_object('stat_before',stat_before,'normal_gain',normal_gain,
      'efficiency',current_tier.efficiency,'config_revision',public.get_gameplay_revision());
  end if;
  insert into private.training_requests(character_id,request_id,action,payload,result) values(viewer_id,request_id,action,payload,result);
  perform private.notify_training(viewer_id);
  return result;
end;
$_$;


ALTER FUNCTION "private"."training_action"("action" "text", "payload" "jsonb", "request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."training_gain"("stat_value" numeric, "efficiency" numeric, "energy_amount" integer) RETURNS numeric
    LANGUAGE "plpgsql" IMMUTABLE STRICT
    SET "search_path" TO ''
    AS $$
declare current_value numeric:=stat_value; unit_gain numeric; total_gain numeric:=0; i integer;
begin
  if not (stat_value between 1 and 9007199254740991)
    or not (efficiency between 0.000001 and 1000)
    or not (energy_amount between 1 and 1000) then
    raise exception 'INVALID_TRAINING_INPUT' using errcode='22023';
  end if;
  for i in 1..energy_amount loop
    unit_gain:=round(efficiency / 5
      * power(1 + current_value / 1000, 0.6::numeric),6);
    if unit_gain<=0 then raise exception 'INVALID_TRAINING_INPUT' using errcode='22023'; end if;
    total_gain:=total_gain+unit_gain;
    current_value:=current_value+unit_gain;
    if current_value>9007199254740991 then raise exception 'PROGRESSION_LIMIT'; end if;
  end loop;
  return trim_scale(total_gain);
end;
$$;


ALTER FUNCTION "private"."training_gain"("stat_value" numeric, "efficiency" numeric, "energy_amount" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."training_state"("captain_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  select jsonb_build_object(
    'ship_materials',private.ship_material_costs(captain_id,5),
    'progress',(select jsonb_object_agg(training_group,jsonb_build_object('xp',xp,'tier_id',tier_id))
      from private.character_training where character_id=captain_id),
    'ship_job',(select to_jsonb(j)-'character_id'-'config_revision' from private.ship_upgrade_jobs j
      where character_id=captain_id and applied_at is null),
    'last_ship_job',(select to_jsonb(j)-'character_id'-'config_revision' from private.ship_upgrade_jobs j
      where character_id=captain_id and applied_at is not null order by finishes_at desc,id desc limit 1));
$$;


ALTER FUNCTION "private"."training_state"("captain_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."transfer_gold"("direction" "text", "amount" numeric, "request_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  viewer_id uuid := private.combat_captain();
  captain public.characters%rowtype;
  previous private.bank_transfers%rowtype;
  coins bigint;
begin
  if request_id is null then raise exception 'INVALID_REQUEST' using errcode='22023'; end if;
  if direction is null or direction not in ('deposit','withdraw') then
    raise exception 'INVALID_DIRECTION' using errcode='22023'; end if;
  if amount is null or amount < 1 or amount > 9007199254740991 or amount <> trunc(amount) then
    raise exception 'INVALID_AMOUNT' using errcode='22023'; end if;
  coins := amount::bigint;
  perform private.settle_combat_context(array[viewer_id]);
  select * into previous from private.bank_transfers t
    where t.character_id=viewer_id and t.request_id=transfer_gold.request_id;
  if found then
    if previous.direction <> direction or previous.amount <> coins then
      raise exception 'REQUEST_CONFLICT' using errcode='22023';
    end if;
    return jsonb_build_object('direction',previous.direction,'amount',previous.amount,
      'gold_coins',previous.gold_coins,'bank_gold_coins',previous.bank_gold_coins);
  end if;
  perform private.assert_can_act(viewer_id);
  select * into captain from public.characters where id=viewer_id for update;
  if captain.location <> 'the_harbor' then raise exception 'NOT_IN_HARBOR' using errcode='P0001'; end if;
  if direction='deposit' then
    if captain.gold_coins < coins then raise exception 'NOT_ENOUGH_GOLD' using errcode='P0001'; end if;
    if captain.bank_gold_coins > 9007199254740991 - coins then
      raise exception 'BALANCE_LIMIT' using errcode='P0001'; end if;
    update public.characters set gold_coins=gold_coins-coins, bank_gold_coins=bank_gold_coins+coins
      where id=viewer_id returning * into captain;
  else
    if captain.bank_gold_coins < coins then raise exception 'NOT_ENOUGH_BANK_GOLD' using errcode='P0001'; end if;
    if captain.gold_coins > 9007199254740991 - coins then
      raise exception 'BALANCE_LIMIT' using errcode='P0001'; end if;
    update public.characters set gold_coins=gold_coins+coins, bank_gold_coins=bank_gold_coins-coins
      where id=viewer_id returning * into captain;
  end if;
  insert into private.bank_transfers(character_id,request_id,direction,amount,gold_coins,bank_gold_coins)
    values(viewer_id,request_id,direction,coins,captain.gold_coins,captain.bank_gold_coins);
  insert into public.player_game_events(character_id,revision) values(viewer_id,1)
    on conflict(character_id) do update set revision=player_game_events.revision+1;
  return jsonb_build_object('direction',direction,'amount',coins,
    'gold_coins',captain.gold_coins,'bank_gold_coins',captain.bank_gold_coins);
end;
$$;


ALTER FUNCTION "private"."transfer_gold"("direction" "text", "amount" numeric, "request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."trash_inventory_item"("entry_id" "uuid", "entry_type" "text", "quantity" numeric, "request_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "private"."trash_inventory_item"("entry_id" "uuid", "entry_type" "text", "quantity" numeric, "request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."update_mail"("mail_ids" bigint[], "operation" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare viewer_id uuid:=private.combat_captain(); changed integer;
begin
  if mail_ids is null or cardinality(mail_ids) not between 1 and 100 or array_ndims(mail_ids)<>1 or array_position(mail_ids,null) is not null
    or operation is null or operation not in('read','unread','save','unsave','delete') then raise exception 'INVALID_REQUEST' using errcode='22023'; end if;
  perform 1 from public.characters where id=viewer_id for update;
  update private.mail_boxes b set
    read_at=case when direction='inbox' and operation='read' then coalesce(read_at,clock_timestamp()) when direction='inbox' and operation='unread' then null else read_at end,
    saved_at=case when operation='save' then coalesce(saved_at,clock_timestamp()) when operation='unsave' then null else saved_at end,
    deleted_at=case when operation='delete' then clock_timestamp() else deleted_at end
    where b.character_id=viewer_id and b.mail_id=any(mail_ids) and b.deleted_at is null
      and (operation='delete' or (operation='read' and direction='inbox' and read_at is null) or (operation='unread' and direction='inbox' and read_at is not null)
        or (operation='save' and saved_at is null) or (operation='unsave' and saved_at is not null));
  get diagnostics changed=row_count;
  if changed>0 then perform private.notify_training(viewer_id); end if;
end;
$$;


ALTER FUNCTION "private"."update_mail"("mail_ids" bigint[], "operation" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."validate_character_name"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  if tg_op='UPDATE' then
    if new.display_name is not distinct from old.display_name then return new; end if;
  end if;
  if not private.is_valid_character_name(new.display_name) then
    raise exception 'INVALID_CHARACTER_NAME' using errcode='23514';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "private"."validate_character_name"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."visible_combatant"("snapshot" "jsonb", "own" boolean, "revealed" boolean) RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  select jsonb_build_object(
    'id',snapshot->'id','name',snapshot->'name',
    'player_number',coalesce(snapshot->'player_number',
      (select to_jsonb(player_number) from public.characters where id=(snapshot->>'id')::uuid)),
    'ship_health',snapshot->'ship_health','crew_health',snapshot->'crew_health',
    'ammo',case when own then snapshot->'ammo' end,
    'ship',case when own then snapshot->'ship' end,
    'crew',case when own then snapshot->'crew' end,
    'crew_morale',case when own then snapshot->'crew_morale' end,
    'morale_multiplier',case when own then snapshot->'morale_multiplier' end,
    'cannons',case when own or revealed then 'Basic cannons' end,
    'weapon',case when own or revealed then 'Cutlasses' end);
$$;


ALTER FUNCTION "private"."visible_combatant"("snapshot" "jsonb", "own" boolean, "revealed" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_catalog"() RETURNS "jsonb"
    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$ select private.admin_catalog(); $$;


ALTER FUNCTION "public"."admin_catalog"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_economy"("period" "text" DEFAULT '7d'::"text", "item_search" "text" DEFAULT ''::"text", "item_page" integer DEFAULT 0, "item_sort" "text" DEFAULT 'value'::"text") RETURNS "jsonb"
    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$
  select private.admin_economy(period,item_search,item_page,item_sort);
$$;


ALTER FUNCTION "public"."admin_economy"("period" "text", "item_search" "text", "item_page" integer, "item_sort" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_get_loot_table"("target_id" "text") RETURNS "jsonb"
    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$ select private.admin_get_loot_table(target_id); $$;


ALTER FUNCTION "public"."admin_get_loot_table"("target_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_mutate"("action" "text", "payload" "jsonb", "request_id" "uuid", "reason" "text") RETURNS "jsonb"
    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$ select private.admin_mutate(action,payload,request_id,reason); $$;


ALTER FUNCTION "public"."admin_mutate"("action" "text", "payload" "jsonb", "request_id" "uuid", "reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_overview"() RETURNS "jsonb"
    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$ select private.admin_overview(); $$;


ALTER FUNCTION "public"."admin_overview"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_player_statistics"("period" "text" DEFAULT '1m'::"text") RETURNS "jsonb"
    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$ select private.admin_player_statistics(period); $$;


ALTER FUNCTION "public"."admin_player_statistics"("period" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_players"("search_term" "text" DEFAULT ''::"text", "requested_page" integer DEFAULT 0, "sort_by" "text" DEFAULT 'newest'::"text", "activity" "text" DEFAULT 'all'::"text") RETURNS "jsonb"
    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$ select private.admin_players(search_term,requested_page,sort_by,activity); $$;


ALTER FUNCTION "public"."admin_players"("search_term" "text", "requested_page" integer, "sort_by" "text", "activity" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_read"("resource" "text", "search_term" "text" DEFAULT ''::"text", "requested_page" integer DEFAULT 0, "filters" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "jsonb"
    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$ select private.admin_read(resource,search_term,requested_page,filters); $$;


ALTER FUNCTION "public"."admin_read"("resource" "text", "search_term" "text", "requested_page" integer, "filters" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."buy_market_listing"("listing_id" "uuid", "quantity" numeric, "expected_unit_price" numeric, "request_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$
  select private.buy_market_listing(listing_id,quantity,expected_unit_price,request_id);
$$;


ALTER FUNCTION "public"."buy_market_listing"("listing_id" "uuid", "quantity" numeric, "expected_unit_price" numeric, "request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."buy_tavern_meal"("expected_gold_cost" numeric, "expected_morale_gain" numeric, "request_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$
  select private.buy_tavern_meal(expected_gold_cost,expected_morale_gain,request_id);
$$;


ALTER FUNCTION "public"."buy_tavern_meal"("expected_gold_cost" numeric, "expected_morale_gain" numeric, "request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancel_market_listing"("listing_id" "uuid", "request_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$
  select private.cancel_market_listing(listing_id,request_id);
$$;


ALTER FUNCTION "public"."cancel_market_listing"("listing_id" "uuid", "request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."choose_sea_route"("expected_version" "uuid", "option_id" "uuid", "request_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$
  select private.sea_travel_action('onward',expected_version,option_id,request_id);
$$;


ALTER FUNCTION "public"."choose_sea_route"("expected_version" "uuid", "option_id" "uuid", "request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."craft_item"("recipe_id" "text", "expected_version" "text", "request_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$ select private.craft_item(recipe_id,expected_version,request_id); $$;


ALTER FUNCTION "public"."craft_item"("recipe_id" "text", "expected_version" "text", "request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_market_listings"("entries" "jsonb", "request_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$
  select private.create_market_listings(entries,request_id);
$$;


ALTER FUNCTION "public"."create_market_listings"("entries" "jsonb", "request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."depart_harbor"("expected_version" "uuid", "request_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$
  select private.sea_travel_action('depart',expected_version,null,request_id);
$$;


ALTER FUNCTION "public"."depart_harbor"("expected_version" "uuid", "request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_attack_lock"() RETURNS "jsonb"
    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$ select private.get_attack_lock(); $$;


ALTER FUNCTION "public"."get_attack_lock"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_character_status"("target_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  select jsonb_build_object(
    'character_level',p.character_level,
    'location',case when p.arrives_at<=statement_timestamp() then p.arrival_location else p.location end,
    'arrives_at',case when p.arrives_at>statement_timestamp() then p.arrives_at end,
    'max_sea_distance',greatest(p.max_sea_distance,
      case when p.arrives_at<=statement_timestamp() then p.arrival_max_sea_distance end),
    'hospital_until',(select hospital_until from public.hospital_patients
      where character_id=target_id and hospital_until>statement_timestamp()),
    'can_attack_here',private.can_attack_here(target_id),
    'presence',private.get_player_presence(target_id),
    'observed_at',statement_timestamp())
  from public.character_profiles p where p.character_id=target_id;
$$;


ALTER FUNCTION "public"."get_character_status"("target_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_combat"("battle_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$ select private.get_combat(battle_id); $$;


ALTER FUNCTION "public"."get_combat"("battle_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_combat_log"("battle_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$ select private.get_combat_log(battle_id); $$;


ALTER FUNCTION "public"."get_combat_log"("battle_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_combat_preview"("target_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$ select private.get_combat_preview(target_id); $$;


ALTER FUNCTION "public"."get_combat_preview"("target_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_game_state"() RETURNS "jsonb"
    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$ select private.get_game_state(); $$;


ALTER FUNCTION "public"."get_game_state"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_gameplay_revision"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
  select '83e29ab2672ca7095c360972144fce6d819a0e69ab3bc0cce355c7d744bfac27'::text;
$$;


ALTER FUNCTION "public"."get_gameplay_revision"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_hospital_status"("target_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  select jsonb_build_object('hospital_until',(select hospital_until from public.hospital_patients
    where character_id=target_id and hospital_until>now()),'observed_at',now());
$$;


ALTER FUNCTION "public"."get_hospital_status"("target_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_item_circulation"("target_item" "text", "period" "text" DEFAULT 'all'::"text") RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  select private.get_item_circulation(target_item,period);
$$;


ALTER FUNCTION "public"."get_item_circulation"("target_item" "text", "period" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_item_market_value"("target_item" "text", "period" "text" DEFAULT 'all'::"text") RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  select private.get_item_market_value(target_item,period);
$$;


ALTER FUNCTION "public"."get_item_market_value"("target_item" "text", "period" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_mail"("mail_id" bigint, "include_history" boolean DEFAULT false) RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$ select private.get_mail(mail_id,include_history); $$;


ALTER FUNCTION "public"."get_mail"("mail_id" bigint, "include_history" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_mail_ignored"() RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$ select private.get_mail_ignored(); $$;


ALTER FUNCTION "public"."get_mail_ignored"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_mail_summary"() RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$ select private.get_mail_summary(); $$;


ALTER FUNCTION "public"."get_mail_summary"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_mailbox"("folder" "text" DEFAULT 'inbox'::"text", "query" "text" DEFAULT ''::"text", "page" integer DEFAULT 0) RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$ select private.get_mailbox(folder,query,page); $$;


ALTER FUNCTION "public"."get_mailbox"("folder" "text", "query" "text", "page" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_message_conversation"("target_player_number" bigint, "before_id" bigint DEFAULT NULL::bigint) RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$ select private.get_message_conversation(target_player_number,before_id); $$;


ALTER FUNCTION "public"."get_message_conversation"("target_player_number" bigint, "before_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_message_inbox"("before_id" bigint DEFAULT NULL::bigint) RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$ select private.get_message_inbox(before_id); $$;


ALTER FUNCTION "public"."get_message_inbox"("before_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_message_summary"() RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$ select private.get_message_summary(); $$;


ALTER FUNCTION "public"."get_message_summary"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_navigation_lock"() RETURNS "jsonb"
    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$
  select private.get_navigation_lock();
$$;


ALTER FUNCTION "public"."get_navigation_lock"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_notification_summary"() RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$ select private.get_notification_summary(); $$;


ALTER FUNCTION "public"."get_notification_summary"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_notifications"("before_id" bigint DEFAULT NULL::bigint) RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$ select private.get_notifications(before_id); $$;


ALTER FUNCTION "public"."get_notifications"("before_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_own_skills"() RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$ select private.get_own_skills(); $$;


ALTER FUNCTION "public"."get_own_skills"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_player_context"() RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$ select private.get_player_context(); $$;


ALTER FUNCTION "public"."get_player_context"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_player_snapshot"() RETURNS "jsonb"
    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$ select private.get_player_snapshot(); $$;


ALTER FUNCTION "public"."get_player_snapshot"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_sea_scout"("requested_page" integer DEFAULT 0) RETURNS "jsonb"
    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$
  select private.get_sea_scout(requested_page);
$$;


ALTER FUNCTION "public"."get_sea_scout"("requested_page" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$ select private.is_admin(); $$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_character_name_available"("candidate" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select private.is_valid_character_name(candidate) and not exists(
    select 1 from public.characters where name_key=lower(normalize(candidate,NFC)));
$$;


ALTER FUNCTION "public"."is_character_name_available"("candidate" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."is_character_name_available"("candidate" "text") IS 'Registration availability hint only. The unique constraint resolves races.';


CREATE OR REPLACE FUNCTION "public"."list_crafting_recipes"() RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$ select private.list_crafting_recipes(); $$;


ALTER FUNCTION "public"."list_crafting_recipes"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_harbor_players"("requested_page" integer DEFAULT 0) RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  with totals as (
    select count(*)::integer as total from public.harbor_players where arrives_at is null or arrives_at<=statement_timestamp()
  ), paging as (
    select total, least(greatest(coalesce(requested_page, 0), 0),
      greatest(0, (total - 1) / 20)) as page from totals
  )
  select jsonb_build_object(
    'total', total, 'page', page, 'observed_at',statement_timestamp(),
    'next_arrival_at',(select min(arrives_at) from public.character_profiles where arrival_location='the_harbor' and arrives_at>statement_timestamp()),
    'players', coalesce((
      select jsonb_agg(to_jsonb(player) order by player.display_name, player.character_id)
      from (
        select h.character_id, h.display_name, p.player_number from public.harbor_players h
        join public.character_profiles p on p.character_id=h.character_id
        where h.arrives_at is null or h.arrives_at<=statement_timestamp()
        order by h.display_name, h.character_id limit 20 offset paging.page * 20
      ) player
    ), '[]'::jsonb)
  ) from paging;
$$;


ALTER FUNCTION "public"."list_harbor_players"("requested_page" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_hospital_patients"("requested_page" integer DEFAULT 0) RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  with patients as (
    select h.*,p.player_number from public.hospital_patients h
    join public.character_profiles p on p.character_id=h.character_id where h.hospital_until>now()
  ), totals as (
    select count(*)::integer total,min(hospital_until) next_discharge_at from patients
  ), paging as (
    select total,next_discharge_at,least(greatest(coalesce(requested_page,0),0),
      greatest(0,(total-1)/20)) page from totals
  )
  select jsonb_build_object('total',total,'page',page,'observed_at',now(),'next_discharge_at',next_discharge_at,
    'patients',coalesce((select jsonb_agg(to_jsonb(p) order by p.display_name,p.character_id)
      from (select * from patients order by display_name,character_id
        limit 20 offset paging.page*20) p),'[]'::jsonb))
    from paging;
$$;


ALTER FUNCTION "public"."list_hospital_patients"("requested_page" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_inventory"("category_id" "text" DEFAULT NULL::"text", "search_term" "text" DEFAULT ''::"text", "requested_page" integer DEFAULT 0) RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  select private.list_inventory(category_id,search_term,requested_page);
$$;


ALTER FUNCTION "public"."list_inventory"("category_id" "text", "search_term" "text", "requested_page" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_market_inventory"("category_id" "text" DEFAULT NULL::"text", "search_term" "text" DEFAULT ''::"text", "requested_page" integer DEFAULT 0) RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  select private.list_market_inventory(category_id,search_term,requested_page);
$$;


ALTER FUNCTION "public"."list_market_inventory"("category_id" "text", "search_term" "text", "requested_page" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_market_items"("category_id" "text" DEFAULT NULL::"text", "search_term" "text" DEFAULT ''::"text", "requested_page" integer DEFAULT 0) RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  select private.list_market_items(category_id,search_term,requested_page);
$$;


ALTER FUNCTION "public"."list_market_items"("category_id" "text", "search_term" "text", "requested_page" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_market_listings"("target_item" "text" DEFAULT NULL::"text", "own_only" boolean DEFAULT false, "requested_page" integer DEFAULT 0) RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  select private.list_market_listings(target_item,own_only,requested_page);
$$;


ALTER FUNCTION "public"."list_market_listings"("target_item" "text", "own_only" boolean, "requested_page" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_all_notifications_read"("through_id" bigint) RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$ select private.mark_all_notifications_read(through_id); $$;


ALTER FUNCTION "public"."mark_all_notifications_read"("through_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_messages_read"("target_player_number" bigint, "through_id" bigint) RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$ select private.mark_messages_read(target_player_number,through_id); $$;


ALTER FUNCTION "public"."mark_messages_read"("target_player_number" bigint, "through_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_notification_read"("notification_id" bigint) RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$ select private.mark_notification_read(notification_id); $$;


ALTER FUNCTION "public"."mark_notification_read"("notification_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."perform_activity"("activity_id" "text", "expected_stamina_cost" numeric, "expected_xp_gain" numeric, "request_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$
  select private.perform_activity(activity_id,expected_stamina_cost,expected_xp_gain,request_id);
$$;


ALTER FUNCTION "public"."perform_activity"("activity_id" "text", "expected_stamina_cost" numeric, "expected_xp_gain" numeric, "request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."purchase_training_tier"("training_group" "text", "tier_id" "text", "request_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$
  select private.training_action('purchase',jsonb_build_object('group',training_group,'tier_id',tier_id),request_id);
$$;


ALTER FUNCTION "public"."purchase_training_tier"("training_group" "text", "tier_id" "text", "request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_player_activity"() RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$ select private.record_player_activity(); $$;


ALTER FUNCTION "public"."record_player_activity"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_player_presence"("tab_id" "uuid", "is_active" boolean, "page_action" boolean DEFAULT false, "closed" boolean DEFAULT false) RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$
  select private.record_player_presence(tab_id,is_active,page_action,closed);
$$;


ALTER FUNCTION "public"."record_player_presence"("tab_id" "uuid", "is_active" boolean, "page_action" boolean, "closed" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."return_to_harbor"("expected_version" "uuid", "request_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$
  select private.sea_travel_action('return',expected_version,null,request_id);
$$;


ALTER FUNCTION "public"."return_to_harbor"("expected_version" "uuid", "request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_defence_orders"("preset" "text") RETURNS "jsonb"
    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$ select private.save_defence_orders(preset); $$;


ALTER FUNCTION "public"."save_defence_orders"("preset" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."scout_nearby_ships"("expected_version" "uuid", "request_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$
  select private.scout_nearby_ships(expected_version,request_id);
$$;


ALTER FUNCTION "public"."scout_nearby_ships"("expected_version" "uuid", "request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."search_players"("search_term" "text" DEFAULT ''::"text", "requested_page" integer DEFAULT 0) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO ''
    AS $_$
declare term text:=btrim(coalesce(search_term,'')); number_text text; number_id bigint;
  id_only boolean; pattern text; result jsonb; page_size integer:=20;
begin
  if length(term)>100 or requested_page is null or requested_page<0 then
    raise exception 'INVALID_FILTER' using errcode='22023';
  end if;
  id_only:=left(term,1)='#';
  number_text:=case when id_only then substr(term,2) else term end;
  if number_text ~ '^[0-9]{1,16}$' then
    if number_text::numeric between 100001 and 9007199254740991 then number_id:=number_text::bigint; end if;
  end if;
  pattern:='%' || replace(replace(replace(lower(term),E'\\',E'\\\\'),'%',E'\\%'),'_',E'\\_') || '%';
  with matching as (
    select character_id,player_number,display_name from public.character_profiles
    where player_number=number_id or (not id_only and lower(display_name) like pattern escape E'\\')
  ), bounds as (
    select count(*)::integer total,least(requested_page,greatest(0,(count(*)-1)/page_size))::integer page from matching
  )
  select jsonb_build_object('total',b.total,'page',b.page,'page_size',page_size,
    'players',coalesce((select jsonb_agg(to_jsonb(p) order by p.player_number) from (
      select * from matching order by player_number limit page_size offset b.page::bigint*page_size
    ) p),'[]'::jsonb)) into result from bounds b;
  return result;
end;
$_$;


ALTER FUNCTION "public"."search_players"("search_term" "text", "requested_page" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."send_mail"("target_numbers" bigint[], "mail_subject" "text", "mail_body" "text", "request_id" "uuid", "reply_to_id" bigint DEFAULT NULL::bigint) RETURNS "jsonb"
    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$ select private.send_mail(target_numbers,mail_subject,mail_body,request_id,reply_to_id); $$;


ALTER FUNCTION "public"."send_mail"("target_numbers" bigint[], "mail_subject" "text", "mail_body" "text", "request_id" "uuid", "reply_to_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."send_player_message"("target_player_number" bigint, "message_body" "text", "request_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$ select private.send_player_message(target_player_number,message_body,request_id); $$;


ALTER FUNCTION "public"."send_player_message"("target_player_number" bigint, "message_body" "text", "request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_mail_ignored"("target_player_number" bigint, "ignored" boolean) RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$ select private.set_mail_ignored(target_player_number,ignored); $$;


ALTER FUNCTION "public"."set_mail_ignored"("target_player_number" bigint, "ignored" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."start_combat"("target_id" "uuid", "request_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$ select private.start_combat(target_id,request_id); $$;


ALTER FUNCTION "public"."start_combat"("target_id" "uuid", "request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."start_ship_upgrade"("stat" "text", "energy_amount" integer, "expected_workshop_id" "text", "request_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$
  select private.training_action('ship',jsonb_build_object('stat',stat,'energy_amount',energy_amount,'tier_id',expected_workshop_id),request_id);
$$;


ALTER FUNCTION "public"."start_ship_upgrade"("stat" "text", "energy_amount" integer, "expected_workshop_id" "text", "request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."submit_combat_order"("battle_id" "uuid", "expected_round" integer, "player_order" "text", "request_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$ select private.submit_combat_order(battle_id,expected_round,player_order,request_id); $$;


ALTER FUNCTION "public"."submit_combat_order"("battle_id" "uuid", "expected_round" integer, "player_order" "text", "request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."train_crew"("stat" "text", "expected_tier_id" "text", "request_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$
  select private.training_action('crew',jsonb_build_object('stat',stat,'tier_id',expected_tier_id),request_id);
$$;


ALTER FUNCTION "public"."train_crew"("stat" "text", "expected_tier_id" "text", "request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."transfer_gold"("direction" "text", "amount" numeric, "request_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$
  select private.transfer_gold(direction,amount,request_id);
$$;


ALTER FUNCTION "public"."transfer_gold"("direction" "text", "amount" numeric, "request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trash_inventory_item"("entry_id" "uuid", "entry_type" "text", "quantity" numeric, "request_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$
  select private.trash_inventory_item(entry_id,entry_type,quantity,request_id);
$$;


ALTER FUNCTION "public"."trash_inventory_item"("entry_id" "uuid", "entry_type" "text", "quantity" numeric, "request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_mail"("mail_ids" bigint[], "operation" "text") RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$ select private.update_mail(mail_ids,operation); $$;


ALTER FUNCTION "public"."update_mail"("mail_ids" bigint[], "operation" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "private"."activity_definitions" (
    "id" "text" NOT NULL,
    "skill_id" "text" NOT NULL,
    "xp_gain" bigint NOT NULL,
    "active" boolean NOT NULL,
    "position" integer NOT NULL,
    CONSTRAINT "activity_definitions_xp_gain_check" CHECK ((("xp_gain" >= 1) AND ("xp_gain" <= '9007199254740991'::bigint)))
);


ALTER TABLE "private"."activity_definitions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "private"."activity_loot" (
    "activity_id" "text" NOT NULL,
    "loot_table_id" "text",
    "success_start" numeric DEFAULT 70 NOT NULL,
    "success_end" numeric DEFAULT 90 NOT NULL,
    "mastery_level" integer DEFAULT 100 NOT NULL,
    "version" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    CONSTRAINT "activity_loot_check" CHECK (((("success_end" >= "success_start") AND ("success_end" <= (100)::numeric)) AND ("success_end" = "trunc"("success_end", 4)))),
    CONSTRAINT "activity_loot_mastery_level_check" CHECK ((("mastery_level" >= 2) AND ("mastery_level" <= 100))),
    CONSTRAINT "activity_loot_success_start_check" CHECK (((("success_start" >= (0)::numeric) AND ("success_start" <= (100)::numeric)) AND ("success_start" = "trunc"("success_start", 4))))
);


ALTER TABLE "private"."activity_loot" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "private"."activity_requests" (
    "character_id" "uuid" NOT NULL,
    "request_id" "uuid" NOT NULL,
    "activity_id" "text" NOT NULL,
    "expected_stamina_cost" integer NOT NULL,
    "expected_xp_gain" bigint NOT NULL,
    "result" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "clock_timestamp"() NOT NULL
);


ALTER TABLE "private"."activity_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "private"."admin_audit" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "actor_id" "uuid" NOT NULL,
    "request_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "reason" "text" NOT NULL,
    "payload" "jsonb" NOT NULL,
    "before_data" "jsonb",
    "after_data" "jsonb",
    "result" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "clock_timestamp"() NOT NULL,
    CONSTRAINT "admin_audit_reason_check" CHECK ((("length"("btrim"("reason")) >= 3) AND ("length"("btrim"("reason")) <= 500)))
);


ALTER TABLE "private"."admin_audit" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "private"."admin_members" (
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "clock_timestamp"() NOT NULL
);


ALTER TABLE "private"."admin_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "private"."admin_resources" (
    "name" "text" NOT NULL,
    "schema_name" "text" NOT NULL,
    "table_name" "text" NOT NULL,
    "editable" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "deletable" boolean DEFAULT false NOT NULL,
    "note" "text" DEFAULT ''::"text" NOT NULL
);


ALTER TABLE "private"."admin_resources" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "private"."bank_transfers" (
    "character_id" "uuid" NOT NULL,
    "request_id" "uuid" NOT NULL,
    "direction" "text" NOT NULL,
    "amount" bigint NOT NULL,
    "gold_coins" bigint NOT NULL,
    "bank_gold_coins" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "clock_timestamp"() NOT NULL,
    CONSTRAINT "bank_transfers_amount_check" CHECK (("amount" > 0)),
    CONSTRAINT "bank_transfers_bank_gold_coins_check" CHECK (("bank_gold_coins" >= 0)),
    CONSTRAINT "bank_transfers_direction_check" CHECK (("direction" = ANY (ARRAY['deposit'::"text", 'withdraw'::"text"]))),
    CONSTRAINT "bank_transfers_gold_coins_check" CHECK (("gold_coins" >= 0))
);


ALTER TABLE "private"."bank_transfers" OWNER TO "postgres";


COMMENT ON TABLE "private"."bank_transfers" IS 'Private transfer receipts prevent duplicate debits on retries.';


CREATE TABLE IF NOT EXISTS "private"."character_actions" (
    "character_id" "uuid" NOT NULL,
    "last_action_at" timestamp with time zone NOT NULL
);


ALTER TABLE "private"."character_actions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "private"."character_skills" (
    "character_id" "uuid" NOT NULL,
    "skill_id" "text" NOT NULL,
    "xp" bigint DEFAULT 0 NOT NULL,
    CONSTRAINT "character_skills_xp_check" CHECK ((("xp" >= 0) AND ("xp" <= '9007199254740991'::bigint)))
);


ALTER TABLE "private"."character_skills" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "private"."character_training" (
    "character_id" "uuid" NOT NULL,
    "training_group" "text" NOT NULL,
    "tier_id" "text" NOT NULL,
    "xp" bigint DEFAULT 0 NOT NULL,
    CONSTRAINT "character_training_xp_check" CHECK ((("xp" >= 0) AND ("xp" <= '9007199254740991'::bigint)))
);


ALTER TABLE "private"."character_training" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "private"."combat_engagements" (
    "character_id" "uuid" NOT NULL,
    "combat_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'attacker'::"text" NOT NULL,
    CONSTRAINT "combat_engagements_role_check" CHECK (("role" = ANY (ARRAY['attacker'::"text", 'defender'::"text"])))
);


ALTER TABLE "private"."combat_engagements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "private"."combat_participants" (
    "combat_id" "uuid" NOT NULL,
    "character_id" "uuid" NOT NULL,
    "start_request_id" "uuid" NOT NULL,
    "snapshot" "jsonb" NOT NULL,
    "phase" "text" DEFAULT 'sea'::"text" NOT NULL,
    "round" integer DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "defender_ammo" integer DEFAULT 10 NOT NULL,
    "joined_at" timestamp with time zone NOT NULL,
    "deadline" timestamp with time zone NOT NULL,
    "finished_at" timestamp with time zone,
    "hits" integer DEFAULT 0 NOT NULL,
    "damage" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "combat_participants_defender_ammo_check" CHECK (("defender_ammo" >= 0)),
    CONSTRAINT "combat_participants_phase_check" CHECK (("phase" = ANY (ARRAY['sea'::"text", 'boarding'::"text"]))),
    CONSTRAINT "combat_participants_round_check" CHECK (("round" >= 0)),
    CONSTRAINT "combat_participants_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'victory'::"text", 'assist'::"text", 'defeated'::"text", 'retreated'::"text", 'draw'::"text"])))
);


ALTER TABLE "private"."combat_participants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "private"."combat_rounds" (
    "combat_id" "uuid" NOT NULL,
    "round" integer NOT NULL,
    "request_id" "uuid" NOT NULL,
    "event" "jsonb" NOT NULL,
    "actor_id" "uuid" NOT NULL,
    CONSTRAINT "combat_rounds_sequence_positive" CHECK (("round" > 0))
);


ALTER TABLE "private"."combat_rounds" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "private"."combats" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "attacker_id" "uuid" NOT NULL,
    "defender_id" "uuid" NOT NULL,
    "start_request_id" "uuid" NOT NULL,
    "rules_version" integer DEFAULT 1 NOT NULL,
    "state" "jsonb" NOT NULL,
    "status" "text" GENERATED ALWAYS AS (("state" ->> 'status'::"text")) STORED,
    "started_at" timestamp with time zone NOT NULL,
    "deadline" timestamp with time zone NOT NULL,
    "hard_deadline" timestamp with time zone NOT NULL,
    "finished_at" timestamp with time zone,
    CONSTRAINT "combats_check" CHECK (("attacker_id" <> "defender_id")),
    CONSTRAINT "combats_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'completed'::"text"])))
);


ALTER TABLE "private"."combats" OWNER TO "postgres";


COMMENT ON TABLE "private"."combats" IS 'Shared encounter and defender snapshot. Attacker rounds and equipment live in private.combat_participants.';


CREATE TABLE IF NOT EXISTS "private"."crafting_ingredients" (
    "recipe_id" "text" NOT NULL,
    "item_id" "text" NOT NULL,
    "quantity" bigint NOT NULL,
    CONSTRAINT "crafting_ingredients_quantity_check" CHECK ((("quantity" >= 1) AND ("quantity" <= '9007199254740991'::bigint)))
);


ALTER TABLE "private"."crafting_ingredients" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "private"."crafting_recipes" (
    "id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "output_item_id" "text" NOT NULL,
    "output_quantity" bigint NOT NULL,
    "version" "text" NOT NULL,
    "active" boolean NOT NULL,
    "position" integer NOT NULL,
    CONSTRAINT "crafting_recipes_output_quantity_check" CHECK ((("output_quantity" >= 1) AND ("output_quantity" <= '9007199254740991'::bigint))),
    CONSTRAINT "crafting_recipes_version_check" CHECK (("version" ~ '^[a-f0-9]{64}$'::"text"))
);


ALTER TABLE "private"."crafting_recipes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "private"."crafting_requests" (
    "character_id" "uuid" NOT NULL,
    "request_id" "uuid" NOT NULL,
    "recipe_id" "text" NOT NULL,
    "expected_version" "text" NOT NULL,
    "result" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "clock_timestamp"() NOT NULL
);


ALTER TABLE "private"."crafting_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "private"."economy_snapshots" (
    "observed_at" timestamp with time zone NOT NULL,
    "slot" timestamp with time zone NOT NULL,
    "gold" numeric NOT NULL,
    "bank_gold" numeric NOT NULL,
    "item_units" numeric NOT NULL,
    "item_value" numeric NOT NULL,
    "unpriced_units" numeric NOT NULL,
    "players" bigint NOT NULL,
    CONSTRAINT "economy_snapshots_bank_gold_check" CHECK (("bank_gold" >= (0)::numeric)),
    CONSTRAINT "economy_snapshots_gold_check" CHECK (("gold" >= (0)::numeric)),
    CONSTRAINT "economy_snapshots_item_units_check" CHECK (("item_units" >= (0)::numeric)),
    CONSTRAINT "economy_snapshots_item_value_check" CHECK (("item_value" >= (0)::numeric)),
    CONSTRAINT "economy_snapshots_players_check" CHECK (("players" >= 0)),
    CONSTRAINT "economy_snapshots_unpriced_units_check" CHECK (("unpriced_units" >= (0)::numeric))
);


ALTER TABLE "private"."economy_snapshots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "private"."inventory_requests" (
    "character_id" "uuid" NOT NULL,
    "request_id" "uuid" NOT NULL,
    "payload" "jsonb" NOT NULL,
    "result" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "clock_timestamp"() NOT NULL
);


ALTER TABLE "private"."inventory_requests" OWNER TO "postgres";


COMMENT ON TABLE "private"."inventory_requests" IS 'Private receipts for atomic, retry-safe item destruction.';


CREATE TABLE IF NOT EXISTS "private"."item_categories" (
    "id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "position" integer NOT NULL,
    CONSTRAINT "item_categories_id_check" CHECK (("id" ~ '^[a-z][a-z0-9_]{0,47}$'::"text")),
    CONSTRAINT "item_categories_name_check" CHECK ((("length"("name") >= 1) AND ("length"("name") <= 60))),
    CONSTRAINT "item_categories_position_check" CHECK (("position" >= 0))
);


ALTER TABLE "private"."item_categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "private"."item_circulation" (
    "item_id" "text" NOT NULL,
    "total" numeric(30,0) NOT NULL,
    "initial_total" numeric(30,0) NOT NULL,
    "tracked_since" timestamp with time zone NOT NULL,
    "updated_at" timestamp with time zone NOT NULL,
    CONSTRAINT "item_circulation_initial_total_check" CHECK (("initial_total" >= (0)::numeric)),
    CONSTRAINT "item_circulation_total_check" CHECK (("total" >= (0)::numeric))
);


ALTER TABLE "private"."item_circulation" OWNER TO "postgres";


COMMENT ON TABLE "private"."item_circulation" IS 'World totals per item definition; baseline starts when tracking was introduced.';


CREATE TABLE IF NOT EXISTS "private"."item_circulation_history" (
    "id" bigint NOT NULL,
    "item_id" "text" NOT NULL,
    "transaction_id" "xid8" NOT NULL,
    "recorded_at" timestamp with time zone NOT NULL,
    "total" numeric(30,0) NOT NULL,
    CONSTRAINT "item_circulation_history_total_check" CHECK (("total" >= (0)::numeric))
);


ALTER TABLE "private"."item_circulation_history" OWNER TO "postgres";


COMMENT ON TABLE "private"."item_circulation_history" IS 'Exact world totals after each item-changing transaction; no owner identities.';


ALTER TABLE "private"."item_circulation_history" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "private"."item_circulation_history_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


CREATE TABLE IF NOT EXISTS "private"."item_definitions" (
    "id" "text" NOT NULL,
    "category_id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text" NOT NULL,
    "effect_description" "text" NOT NULL,
    "image_path" "text" DEFAULT '/images/items/placeholder.svg'::"text" NOT NULL,
    "kind" "text" NOT NULL,
    "stackable" boolean NOT NULL,
    "slot" "text",
    "active" boolean DEFAULT true NOT NULL,
    "tradable" boolean DEFAULT true NOT NULL,
    "managed_by_admin" boolean DEFAULT false NOT NULL,
    CONSTRAINT "item_definitions_check" CHECK (("stackable" = ("kind" <> 'equipment'::"text"))),
    CONSTRAINT "item_definitions_check1" CHECK (((("kind" = 'equipment'::"text") AND ("slot" IS NOT NULL)) OR (("kind" <> 'equipment'::"text") AND ("slot" IS NULL)))),
    CONSTRAINT "item_definitions_description_check" CHECK ((("length"("description") >= 1) AND ("length"("description") <= 2000))),
    CONSTRAINT "item_definitions_effect_description_check" CHECK ((("length"("effect_description") >= 1) AND ("length"("effect_description") <= 1000))),
    CONSTRAINT "item_definitions_id_check" CHECK (("id" ~ '^[a-z][a-z0-9_]{0,47}$'::"text")),
    CONSTRAINT "item_definitions_image_path_check" CHECK ((("image_path" = '/images/items/placeholder.svg'::"text") OR ("image_path" ~ '^/images/items/[a-z0-9-]+\.(png|webp)$'::"text") OR ("image_path" ~ '^/api/item-images/[0-9a-f-]{36}/[0-9a-f-]{36}\.(png|jpg|webp)$'::"text"))),
    CONSTRAINT "item_definitions_kind_check" CHECK (("kind" = ANY (ARRAY['equipment'::"text", 'consumable'::"text", 'passive'::"text"]))),
    CONSTRAINT "item_definitions_name_check" CHECK ((("length"("name") >= 1) AND ("length"("name") <= 100))),
    CONSTRAINT "item_definitions_slot_check" CHECK (("slot" = ANY (ARRAY['crew_weapon'::"text", 'cannons'::"text"])))
);


ALTER TABLE "private"."item_definitions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "private"."item_instances" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "character_id" "uuid" NOT NULL,
    "item_id" "text" NOT NULL,
    "stackable" boolean DEFAULT false NOT NULL,
    "damage" numeric(12,2) NOT NULL,
    "accuracy" numeric(5,2) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "clock_timestamp"() NOT NULL,
    CONSTRAINT "item_instances_accuracy_check" CHECK ((("accuracy" >= (0)::numeric) AND ("accuracy" <= (100)::numeric))),
    CONSTRAINT "item_instances_damage_check" CHECK ((("damage" >= (0)::numeric) AND ("damage" <= (1000000000)::numeric))),
    CONSTRAINT "item_instances_stackable_check" CHECK ((NOT "stackable"))
);


ALTER TABLE "private"."item_instances" OWNER TO "postgres";


COMMENT ON TABLE "private"."item_instances" IS 'Owned equipment with durable per-instance stats; no combat effects yet.';


CREATE TABLE IF NOT EXISTS "private"."item_market_totals" (
    "sale_id" "uuid" NOT NULL,
    "item_id" "text" NOT NULL,
    "sold_at" timestamp with time zone NOT NULL,
    "quantity_total" numeric(40,0) NOT NULL,
    "gross_total" numeric(50,0) NOT NULL,
    CONSTRAINT "item_market_totals_gross_total_check" CHECK (("gross_total" > (0)::numeric)),
    CONSTRAINT "item_market_totals_quantity_total_check" CHECK (("quantity_total" > (0)::numeric))
);


ALTER TABLE "private"."item_market_totals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "private"."item_stacks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "character_id" "uuid" NOT NULL,
    "item_id" "text" NOT NULL,
    "stackable" boolean DEFAULT true NOT NULL,
    "quantity" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "clock_timestamp"() NOT NULL,
    CONSTRAINT "item_stacks_quantity_check" CHECK ((("quantity" >= 1) AND ("quantity" <= '9007199254740991'::bigint))),
    CONSTRAINT "item_stacks_stackable_check" CHECK ("stackable")
);


ALTER TABLE "private"."item_stacks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "private"."loot_entries" (
    "loot_table_id" "text" NOT NULL,
    "item_id" "text" NOT NULL,
    "mode" "text" NOT NULL,
    "fixed_chance" numeric DEFAULT 0 NOT NULL,
    "weight_start" numeric DEFAULT 0 NOT NULL,
    "weight_end" numeric DEFAULT 0 NOT NULL,
    "quantity" integer DEFAULT 1 NOT NULL,
    "damage" numeric DEFAULT 0 NOT NULL,
    "accuracy" numeric DEFAULT 0 NOT NULL,
    CONSTRAINT "loot_entries_accuracy_check" CHECK (((("accuracy" >= (0)::numeric) AND ("accuracy" <= (100)::numeric)) AND ("accuracy" = "trunc"("accuracy", 2)))),
    CONSTRAINT "loot_entries_check" CHECK (((("mode" = 'fixed'::"text") AND ("fixed_chance" > (0)::numeric) AND ("weight_start" = (0)::numeric) AND ("weight_end" = (0)::numeric)) OR (("mode" = 'weighted'::"text") AND ("fixed_chance" = (0)::numeric) AND (("weight_start" > (0)::numeric) OR ("weight_end" > (0)::numeric))))),
    CONSTRAINT "loot_entries_damage_check" CHECK (((("damage" >= (0)::numeric) AND ("damage" <= (1000000000)::numeric)) AND ("damage" = "trunc"("damage", 2)))),
    CONSTRAINT "loot_entries_fixed_chance_check" CHECK (((("fixed_chance" >= (0)::numeric) AND ("fixed_chance" <= (100)::numeric)) AND ("fixed_chance" = "trunc"("fixed_chance", 4)))),
    CONSTRAINT "loot_entries_mode_check" CHECK (("mode" = ANY (ARRAY['fixed'::"text", 'weighted'::"text"]))),
    CONSTRAINT "loot_entries_quantity_check" CHECK ((("quantity" >= 1) AND ("quantity" <= 100))),
    CONSTRAINT "loot_entries_weight_end_check" CHECK (((("weight_end" >= (0)::numeric) AND ("weight_end" <= (1000000)::numeric)) AND ("weight_end" = "trunc"("weight_end", 4)))),
    CONSTRAINT "loot_entries_weight_start_check" CHECK (((("weight_start" >= (0)::numeric) AND ("weight_start" <= (1000000)::numeric)) AND ("weight_start" = "trunc"("weight_start", 4))))
);


ALTER TABLE "private"."loot_entries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "private"."loot_tables" (
    "id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "version" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    CONSTRAINT "loot_tables_description_check" CHECK (("length"("description") <= 2000)),
    CONSTRAINT "loot_tables_id_check" CHECK (("id" ~ '^[a-z][a-z0-9_]{0,47}$'::"text")),
    CONSTRAINT "loot_tables_name_check" CHECK ((("length"("btrim"("name")) >= 1) AND ("length"("btrim"("name")) <= 100)))
);


ALTER TABLE "private"."loot_tables" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "private"."mail_ignored" (
    "character_id" "uuid" NOT NULL,
    "ignored_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "clock_timestamp"() NOT NULL,
    CONSTRAINT "mail_ignored_check" CHECK (("character_id" <> "ignored_id"))
);


ALTER TABLE "private"."mail_ignored" OWNER TO "postgres";


ALTER TABLE "private"."mail_messages" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "private"."mail_messages_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


CREATE TABLE IF NOT EXISTS "private"."market_requests" (
    "character_id" "uuid" NOT NULL,
    "request_id" "uuid" NOT NULL,
    "payload" "jsonb" NOT NULL,
    "result" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "clock_timestamp"() NOT NULL
);


ALTER TABLE "private"."market_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "private"."market_sales" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "listing_id" "uuid",
    "item_id" "text" NOT NULL,
    "buyer_id" "uuid",
    "seller_id" "uuid",
    "quantity" bigint NOT NULL,
    "unit_price" bigint NOT NULL,
    "gross" bigint NOT NULL,
    "fee" bigint NOT NULL,
    "sold_at" timestamp with time zone DEFAULT "clock_timestamp"() NOT NULL,
    CONSTRAINT "market_sales_check" CHECK ((("fee" >= 0) AND ("fee" <= "gross"))),
    CONSTRAINT "market_sales_check1" CHECK ((("gross")::numeric = (("quantity")::numeric * ("unit_price")::numeric))),
    CONSTRAINT "market_sales_check2" CHECK ((("buyer_id" IS DISTINCT FROM "seller_id") OR ("buyer_id" IS NULL))),
    CONSTRAINT "market_sales_gross_check" CHECK ((("gross" >= 1) AND ("gross" <= '9007199254740991'::bigint))),
    CONSTRAINT "market_sales_quantity_check" CHECK ((("quantity" >= 1) AND ("quantity" <= '9007199254740991'::bigint))),
    CONSTRAINT "market_sales_unit_price_check" CHECK ((("unit_price" >= 1) AND ("unit_price" <= '9007199254740991'::bigint)))
);


ALTER TABLE "private"."market_sales" OWNER TO "postgres";


COMMENT ON TABLE "private"."market_sales" IS 'Completed sales only; rolling popularity is based on units sold.';


CREATE TABLE IF NOT EXISTS "private"."message_threads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "participant_a" "uuid" NOT NULL,
    "participant_b" "uuid" NOT NULL,
    "latest_message_id" bigint,
    CONSTRAINT "message_threads_check" CHECK (("participant_a" < "participant_b"))
);


ALTER TABLE "private"."message_threads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "private"."player_activity_daily" (
    "account_id" bigint NOT NULL,
    "day" "date" NOT NULL,
    "first_at" timestamp with time zone NOT NULL,
    "last_at" timestamp with time zone NOT NULL
);


ALTER TABLE "private"."player_activity_daily" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "private"."player_messages" (
    "id" bigint NOT NULL,
    "thread_id" "uuid" NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "recipient_id" "uuid" NOT NULL,
    "request_id" "uuid" NOT NULL,
    "body" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "clock_timestamp"() NOT NULL,
    "read_at" timestamp with time zone,
    CONSTRAINT "player_messages_body_check" CHECK (("length"("body") > 0)),
    CONSTRAINT "player_messages_check" CHECK (("sender_id" <> "recipient_id"))
);


ALTER TABLE "private"."player_messages" OWNER TO "postgres";


ALTER TABLE "private"."player_messages" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "private"."player_messages_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


CREATE TABLE IF NOT EXISTS "private"."player_notifications" (
    "id" bigint NOT NULL,
    "character_id" "uuid" NOT NULL,
    "kind" "text" NOT NULL,
    "event_key" "text" NOT NULL,
    "payload" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "clock_timestamp"() NOT NULL,
    "read_at" timestamp with time zone,
    CONSTRAINT "player_notifications_event_key_check" CHECK ((("length"("event_key") >= 1) AND ("length"("event_key") <= 200))),
    CONSTRAINT "player_notifications_kind_check" CHECK (("kind" ~ '^[a-z][a-z0-9_.]{0,63}$'::"text")),
    CONSTRAINT "player_notifications_payload_check" CHECK (("jsonb_typeof"("payload") = 'object'::"text"))
);


ALTER TABLE "private"."player_notifications" OWNER TO "postgres";


ALTER TABLE "private"."player_notifications" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "private"."player_notifications_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


CREATE TABLE IF NOT EXISTS "private"."player_presence" (
    "session_id" "uuid" NOT NULL,
    "tab_id" "uuid" NOT NULL,
    "character_id" "uuid" NOT NULL,
    "seen_at" timestamp with time zone NOT NULL,
    "active" boolean NOT NULL
);


ALTER TABLE "private"."player_presence" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "private"."player_sign_ins_daily" (
    "account_id" bigint NOT NULL,
    "day" "date" NOT NULL,
    "sign_ins" bigint NOT NULL,
    "first_at" timestamp with time zone NOT NULL,
    "last_at" timestamp with time zone NOT NULL,
    CONSTRAINT "player_sign_ins_daily_sign_ins_check" CHECK (("sign_ins" > 0))
);


ALTER TABLE "private"."player_sign_ins_daily" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "private"."player_statistics_accounts" (
    "id" bigint NOT NULL,
    "user_id" "uuid",
    "registered_at" timestamp with time zone NOT NULL,
    "last_sign_in_at" timestamp with time zone,
    "deleted_at" timestamp with time zone,
    "last_active_at" timestamp with time zone
);


ALTER TABLE "private"."player_statistics_accounts" OWNER TO "postgres";


ALTER TABLE "private"."player_statistics_accounts" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "private"."player_statistics_accounts_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


CREATE TABLE IF NOT EXISTS "private"."player_statistics_config" (
    "singleton" boolean DEFAULT true NOT NULL,
    "tracked_since" timestamp with time zone DEFAULT "statement_timestamp"() NOT NULL,
    "activity_tracked_since" timestamp with time zone DEFAULT "statement_timestamp"() NOT NULL,
    CONSTRAINT "player_statistics_config_singleton_check" CHECK ("singleton")
);


ALTER TABLE "private"."player_statistics_config" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "private"."sea_location_types" (
    "id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL
);


ALTER TABLE "private"."sea_location_types" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "private"."sea_route_options" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "character_id" "uuid" NOT NULL,
    "visit_id" "uuid" NOT NULL,
    "position" smallint NOT NULL,
    "place_id" "text" NOT NULL,
    "place_name" "text" NOT NULL,
    CONSTRAINT "sea_route_options_position_check" CHECK (("position" = ANY (ARRAY[0, 1])))
);


ALTER TABLE "private"."sea_route_options" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "private"."sea_scout_targets" (
    "character_id" "uuid" NOT NULL,
    "request_id" "uuid" NOT NULL,
    "target_id" "uuid" NOT NULL,
    "target_visit_id" "uuid" NOT NULL,
    "display_name" "text" NOT NULL,
    "position" integer NOT NULL,
    CONSTRAINT "sea_scout_targets_position_check" CHECK (("position" >= 0))
);


ALTER TABLE "private"."sea_scout_targets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "private"."sea_scouts" (
    "character_id" "uuid" NOT NULL,
    "request_id" "uuid" NOT NULL,
    "visit_id" "uuid" NOT NULL,
    "expected_version" "uuid" NOT NULL,
    "sea_distance" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "clock_timestamp"() NOT NULL,
    "result" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "sea_scouts_sea_distance_check" CHECK (("sea_distance" > 0))
);


ALTER TABLE "private"."sea_scouts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "private"."sea_travel_requests" (
    "character_id" "uuid" NOT NULL,
    "request_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "expected_version" "uuid" NOT NULL,
    "option_id" "uuid",
    "result" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "clock_timestamp"() NOT NULL,
    CONSTRAINT "sea_travel_requests_action_check" CHECK (("action" = ANY (ARRAY['depart'::"text", 'onward'::"text", 'return'::"text"])))
);


ALTER TABLE "private"."sea_travel_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "private"."ship_upgrade_jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "character_id" "uuid" NOT NULL,
    "stat" "text" NOT NULL,
    "size_id" "text",
    "workshop_id" "text" NOT NULL,
    "workshop_name" "text" NOT NULL,
    "energy_cost" integer NOT NULL,
    "stat_gain" numeric NOT NULL,
    "xp_gain" bigint NOT NULL,
    "config_revision" "text" NOT NULL,
    "started_at" timestamp with time zone NOT NULL,
    "finishes_at" timestamp with time zone NOT NULL,
    "applied_at" timestamp with time zone,
    "materials" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    CONSTRAINT "ship_upgrade_jobs_check" CHECK (("finishes_at" > "started_at")),
    CONSTRAINT "ship_upgrade_jobs_check1" CHECK ((("applied_at" IS NULL) OR ("applied_at" >= "finishes_at"))),
    CONSTRAINT "ship_upgrade_jobs_energy_cost_check" CHECK (("energy_cost" > 0)),
    CONSTRAINT "ship_upgrade_jobs_stat_check" CHECK (("stat" = ANY (ARRAY['attack'::"text", 'defense'::"text", 'speed'::"text", 'accuracy'::"text"]))),
    CONSTRAINT "ship_upgrade_jobs_stat_gain_check" CHECK ((("stat_gain" > (0)::numeric) AND ("stat_gain" <= ('9007199254740991'::bigint)::numeric))),
    CONSTRAINT "ship_upgrade_jobs_xp_gain_check" CHECK ((("xp_gain" >= 1) AND ("xp_gain" <= '9007199254740991'::bigint)))
);


ALTER TABLE "private"."ship_upgrade_jobs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "private"."ship_work_sizes" (
    "id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "units" integer NOT NULL,
    "duration_seconds" integer NOT NULL,
    CONSTRAINT "ship_work_sizes_duration_seconds_check" CHECK (("duration_seconds" > 0)),
    CONSTRAINT "ship_work_sizes_units_check" CHECK (("units" > 0))
);


ALTER TABLE "private"."ship_work_sizes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "private"."skill_definitions" (
    "id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "position" integer NOT NULL,
    CONSTRAINT "skill_definitions_position_check" CHECK (("position" >= 0))
);


ALTER TABLE "private"."skill_definitions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "private"."skill_levels" (
    "level" integer NOT NULL,
    "xp" bigint NOT NULL,
    CONSTRAINT "skill_levels_level_check" CHECK ((("level" >= 1) AND ("level" <= 100))),
    CONSTRAINT "skill_levels_xp_check" CHECK (("xp" >= 0))
);


ALTER TABLE "private"."skill_levels" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "private"."tavern_requests" (
    "character_id" "uuid" NOT NULL,
    "request_id" "uuid" NOT NULL,
    "expected_gold_cost" bigint NOT NULL,
    "expected_morale_gain" numeric NOT NULL,
    "result" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "clock_timestamp"() NOT NULL
);


ALTER TABLE "private"."tavern_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "private"."training_requests" (
    "character_id" "uuid" NOT NULL,
    "request_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "payload" "jsonb" NOT NULL,
    "result" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "clock_timestamp"() NOT NULL
);


ALTER TABLE "private"."training_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "private"."training_tiers" (
    "training_group" "text" NOT NULL,
    "id" "text" NOT NULL,
    "position" integer NOT NULL,
    "name" "text" NOT NULL,
    "xp_required" bigint NOT NULL,
    "gold_cost" bigint NOT NULL,
    "efficiency" numeric NOT NULL,
    CONSTRAINT "training_tiers_efficiency_check" CHECK ((("efficiency" > (0)::numeric) AND ("efficiency" <= (1000)::numeric))),
    CONSTRAINT "training_tiers_gold_cost_check" CHECK ((("gold_cost" >= 0) AND ("gold_cost" <= '9007199254740991'::bigint))),
    CONSTRAINT "training_tiers_position_check" CHECK (("position" >= 0)),
    CONSTRAINT "training_tiers_training_group_check" CHECK (("training_group" = ANY (ARRAY['crew'::"text", 'ship'::"text"]))),
    CONSTRAINT "training_tiers_xp_required_check" CHECK ((("xp_required" >= 0) AND ("xp_required" <= '9007199254740991'::bigint)))
);


ALTER TABLE "private"."training_tiers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."character_profiles" (
    "character_id" "uuid" NOT NULL,
    "display_name" "text" NOT NULL,
    "location" "text" NOT NULL,
    "created_at" timestamp with time zone NOT NULL,
    "arrives_at" timestamp with time zone,
    "arrival_location" "text",
    "max_sea_distance" integer DEFAULT 0 NOT NULL,
    "arrival_max_sea_distance" integer,
    "player_number" bigint NOT NULL,
    "character_level" integer DEFAULT 7 NOT NULL,
    CONSTRAINT "character_profiles_arrival_check" CHECK (((("arrives_at" IS NULL) AND ("arrival_location" IS NULL)) OR (("arrives_at" IS NOT NULL) AND ("arrival_location" = ANY (ARRAY['the_harbor'::"text", 'open_sea'::"text"]))))),
    CONSTRAINT "character_profiles_arrival_max_sea_distance_check" CHECK (("arrival_max_sea_distance" > 0)),
    CONSTRAINT "character_profiles_max_sea_distance_check" CHECK (("max_sea_distance" >= 0))
);


ALTER TABLE "public"."character_profiles" OWNER TO "postgres";


COMMENT ON TABLE "public"."character_profiles" IS 'Read-only character identity for registered players. No account IDs, email, resources or combat stats.';


ALTER TABLE "public"."characters" ALTER COLUMN "player_number" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."characters_player_number_seq"
    START WITH 100001
    INCREMENT BY 1
    MINVALUE 100001
    MAXVALUE 9007199254740991
    CACHE 1
);


CREATE TABLE IF NOT EXISTS "public"."harbor_players" (
    "character_id" "uuid" NOT NULL,
    "display_name" "text" NOT NULL,
    "arrives_at" timestamp with time zone
);


ALTER TABLE "public"."harbor_players" OWNER TO "postgres";


COMMENT ON TABLE "public"."harbor_players" IS 'Server-maintained harbor directory. Contains no account identifiers, email, resources or stats.';


CREATE TABLE IF NOT EXISTS "public"."hospital_patients" (
    "character_id" "uuid" NOT NULL,
    "display_name" "text" NOT NULL,
    "hospital_until" timestamp with time zone NOT NULL
);


ALTER TABLE "public"."hospital_patients" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."market_item_events" (
    "item_id" "text" NOT NULL,
    "revision" bigint DEFAULT 1 NOT NULL
);


ALTER TABLE "public"."market_item_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."player_game_events" (
    "character_id" "uuid" NOT NULL,
    "revision" bigint DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."player_game_events" OWNER TO "postgres";


COMMENT ON TABLE "public"."player_game_events" IS 'Owner-only revision signals. Contains no combat state or opponent information.';


ALTER TABLE ONLY "private"."activity_definitions"
    ADD CONSTRAINT "activity_definitions_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "private"."activity_loot"
    ADD CONSTRAINT "activity_loot_pkey" PRIMARY KEY ("activity_id");


ALTER TABLE ONLY "private"."activity_requests"
    ADD CONSTRAINT "activity_requests_pkey" PRIMARY KEY ("character_id", "request_id");


ALTER TABLE ONLY "private"."admin_audit"
    ADD CONSTRAINT "admin_audit_actor_id_request_id_key" UNIQUE ("actor_id", "request_id");


ALTER TABLE ONLY "private"."admin_audit"
    ADD CONSTRAINT "admin_audit_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "private"."admin_members"
    ADD CONSTRAINT "admin_members_pkey" PRIMARY KEY ("user_id");


ALTER TABLE ONLY "private"."admin_resources"
    ADD CONSTRAINT "admin_resources_pkey" PRIMARY KEY ("name");


ALTER TABLE ONLY "private"."admin_resources"
    ADD CONSTRAINT "admin_resources_schema_name_table_name_key" UNIQUE ("schema_name", "table_name");


ALTER TABLE ONLY "private"."bank_transfers"
    ADD CONSTRAINT "bank_transfers_pkey" PRIMARY KEY ("character_id", "request_id");


ALTER TABLE ONLY "private"."character_actions"
    ADD CONSTRAINT "character_actions_pkey" PRIMARY KEY ("character_id");


ALTER TABLE ONLY "private"."character_skills"
    ADD CONSTRAINT "character_skills_pkey" PRIMARY KEY ("character_id", "skill_id");


ALTER TABLE ONLY "private"."character_training"
    ADD CONSTRAINT "character_training_pkey" PRIMARY KEY ("character_id", "training_group");


ALTER TABLE ONLY "private"."combat_engagements"
    ADD CONSTRAINT "combat_engagements_pkey" PRIMARY KEY ("character_id");


ALTER TABLE ONLY "private"."combat_participants"
    ADD CONSTRAINT "combat_participants_character_id_start_request_id_key" UNIQUE ("character_id", "start_request_id");


ALTER TABLE ONLY "private"."combat_participants"
    ADD CONSTRAINT "combat_participants_pkey" PRIMARY KEY ("combat_id", "character_id");


ALTER TABLE ONLY "private"."combat_rounds"
    ADD CONSTRAINT "combat_rounds_combat_id_actor_id_request_id_key" UNIQUE ("combat_id", "actor_id", "request_id");


ALTER TABLE ONLY "private"."combat_rounds"
    ADD CONSTRAINT "combat_rounds_pkey" PRIMARY KEY ("combat_id", "round");


ALTER TABLE ONLY "private"."combats"
    ADD CONSTRAINT "combats_attacker_id_start_request_id_key" UNIQUE ("attacker_id", "start_request_id");


ALTER TABLE ONLY "private"."combats"
    ADD CONSTRAINT "combats_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "private"."crafting_ingredients"
    ADD CONSTRAINT "crafting_ingredients_pkey" PRIMARY KEY ("recipe_id", "item_id");


ALTER TABLE ONLY "private"."crafting_recipes"
    ADD CONSTRAINT "crafting_recipes_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "private"."crafting_requests"
    ADD CONSTRAINT "crafting_requests_pkey" PRIMARY KEY ("character_id", "request_id");


ALTER TABLE ONLY "private"."economy_snapshots"
    ADD CONSTRAINT "economy_snapshots_pkey" PRIMARY KEY ("observed_at");


ALTER TABLE ONLY "private"."economy_snapshots"
    ADD CONSTRAINT "economy_snapshots_slot_key" UNIQUE ("slot");


ALTER TABLE ONLY "private"."inventory_requests"
    ADD CONSTRAINT "inventory_requests_pkey" PRIMARY KEY ("character_id", "request_id");


ALTER TABLE ONLY "private"."item_categories"
    ADD CONSTRAINT "item_categories_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "private"."item_circulation_history"
    ADD CONSTRAINT "item_circulation_history_item_id_transaction_id_key" UNIQUE ("item_id", "transaction_id");


ALTER TABLE ONLY "private"."item_circulation_history"
    ADD CONSTRAINT "item_circulation_history_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "private"."item_circulation"
    ADD CONSTRAINT "item_circulation_pkey" PRIMARY KEY ("item_id");


ALTER TABLE ONLY "private"."item_definitions"
    ADD CONSTRAINT "item_definitions_id_stackable_key" UNIQUE ("id", "stackable");


ALTER TABLE ONLY "private"."item_definitions"
    ADD CONSTRAINT "item_definitions_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "private"."item_instances"
    ADD CONSTRAINT "item_instances_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "private"."item_market_totals"
    ADD CONSTRAINT "item_market_totals_pkey" PRIMARY KEY ("sale_id");


ALTER TABLE ONLY "private"."item_stacks"
    ADD CONSTRAINT "item_stacks_character_id_item_id_key" UNIQUE ("character_id", "item_id");


ALTER TABLE ONLY "private"."item_stacks"
    ADD CONSTRAINT "item_stacks_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "private"."loot_entries"
    ADD CONSTRAINT "loot_entries_pkey" PRIMARY KEY ("loot_table_id", "item_id");


ALTER TABLE ONLY "private"."loot_tables"
    ADD CONSTRAINT "loot_tables_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "private"."mail_boxes"
    ADD CONSTRAINT "mail_boxes_pkey" PRIMARY KEY ("mail_id", "character_id");


ALTER TABLE ONLY "private"."mail_ignored"
    ADD CONSTRAINT "mail_ignored_pkey" PRIMARY KEY ("character_id", "ignored_id");


ALTER TABLE ONLY "private"."mail_messages"
    ADD CONSTRAINT "mail_messages_legacy_message_id_key" UNIQUE ("legacy_message_id");


ALTER TABLE ONLY "private"."mail_messages"
    ADD CONSTRAINT "mail_messages_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "private"."mail_messages"
    ADD CONSTRAINT "mail_messages_request" UNIQUE ("sender_id", "request_id");


ALTER TABLE ONLY "private"."market_listings"
    ADD CONSTRAINT "market_listings_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "private"."market_requests"
    ADD CONSTRAINT "market_requests_pkey" PRIMARY KEY ("character_id", "request_id");


ALTER TABLE ONLY "private"."market_sales"
    ADD CONSTRAINT "market_sales_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "private"."message_threads"
    ADD CONSTRAINT "message_threads_pair" UNIQUE ("participant_a", "participant_b");


ALTER TABLE ONLY "private"."message_threads"
    ADD CONSTRAINT "message_threads_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "private"."player_activity_daily"
    ADD CONSTRAINT "player_activity_daily_pkey" PRIMARY KEY ("day", "account_id");


ALTER TABLE ONLY "private"."player_messages"
    ADD CONSTRAINT "player_messages_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "private"."player_messages"
    ADD CONSTRAINT "player_messages_request" UNIQUE ("sender_id", "request_id");


ALTER TABLE ONLY "private"."player_notifications"
    ADD CONSTRAINT "player_notifications_event_key" UNIQUE ("character_id", "kind", "event_key");


ALTER TABLE ONLY "private"."player_notifications"
    ADD CONSTRAINT "player_notifications_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "private"."player_presence"
    ADD CONSTRAINT "player_presence_pkey" PRIMARY KEY ("session_id", "tab_id");


ALTER TABLE ONLY "private"."player_sign_ins_daily"
    ADD CONSTRAINT "player_sign_ins_daily_pkey" PRIMARY KEY ("day", "account_id");


ALTER TABLE ONLY "private"."player_statistics_accounts"
    ADD CONSTRAINT "player_statistics_accounts_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "private"."player_statistics_accounts"
    ADD CONSTRAINT "player_statistics_accounts_user_id_key" UNIQUE ("user_id");


ALTER TABLE ONLY "private"."player_statistics_config"
    ADD CONSTRAINT "player_statistics_config_pkey" PRIMARY KEY ("singleton");


ALTER TABLE ONLY "private"."sea_location_types"
    ADD CONSTRAINT "sea_location_types_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "private"."sea_route_options"
    ADD CONSTRAINT "sea_route_options_character_id_visit_id_place_id_key" UNIQUE ("character_id", "visit_id", "place_id");


ALTER TABLE ONLY "private"."sea_route_options"
    ADD CONSTRAINT "sea_route_options_character_id_visit_id_position_key" UNIQUE ("character_id", "visit_id", "position");


ALTER TABLE ONLY "private"."sea_route_options"
    ADD CONSTRAINT "sea_route_options_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "private"."sea_scout_targets"
    ADD CONSTRAINT "sea_scout_targets_character_id_request_id_position_key" UNIQUE ("character_id", "request_id", "position");


ALTER TABLE ONLY "private"."sea_scout_targets"
    ADD CONSTRAINT "sea_scout_targets_pkey" PRIMARY KEY ("character_id", "request_id", "target_id");


ALTER TABLE ONLY "private"."sea_scouts"
    ADD CONSTRAINT "sea_scouts_pkey" PRIMARY KEY ("character_id", "request_id");


ALTER TABLE ONLY "private"."sea_travel_requests"
    ADD CONSTRAINT "sea_travel_requests_pkey" PRIMARY KEY ("character_id", "request_id");


ALTER TABLE ONLY "private"."ship_upgrade_jobs"
    ADD CONSTRAINT "ship_upgrade_jobs_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "private"."ship_work_sizes"
    ADD CONSTRAINT "ship_work_sizes_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "private"."skill_definitions"
    ADD CONSTRAINT "skill_definitions_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "private"."skill_levels"
    ADD CONSTRAINT "skill_levels_pkey" PRIMARY KEY ("level");


ALTER TABLE ONLY "private"."tavern_requests"
    ADD CONSTRAINT "tavern_requests_pkey" PRIMARY KEY ("character_id", "request_id");


ALTER TABLE ONLY "private"."training_requests"
    ADD CONSTRAINT "training_requests_pkey" PRIMARY KEY ("character_id", "request_id");


ALTER TABLE ONLY "private"."training_tiers"
    ADD CONSTRAINT "training_tiers_pkey" PRIMARY KEY ("training_group", "id");


ALTER TABLE ONLY "private"."training_tiers"
    ADD CONSTRAINT "training_tiers_training_group_position_key" UNIQUE ("training_group", "position");


ALTER TABLE ONLY "public"."character_profiles"
    ADD CONSTRAINT "character_profiles_pkey" PRIMARY KEY ("character_id");


ALTER TABLE ONLY "public"."character_profiles"
    ADD CONSTRAINT "character_profiles_player_number_key" UNIQUE ("player_number");


ALTER TABLE ONLY "public"."characters"
    ADD CONSTRAINT "characters_one_per_user" UNIQUE ("user_id");


ALTER TABLE ONLY "public"."characters"
    ADD CONSTRAINT "characters_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."characters"
    ADD CONSTRAINT "characters_player_number_key" UNIQUE ("player_number");


ALTER TABLE ONLY "public"."characters"
    ADD CONSTRAINT "characters_unique_name" UNIQUE ("name_key");


ALTER TABLE ONLY "public"."harbor_players"
    ADD CONSTRAINT "harbor_players_pkey" PRIMARY KEY ("character_id");


ALTER TABLE ONLY "public"."hospital_patients"
    ADD CONSTRAINT "hospital_patients_pkey" PRIMARY KEY ("character_id");


ALTER TABLE ONLY "public"."market_item_events"
    ADD CONSTRAINT "market_item_events_pkey" PRIMARY KEY ("item_id");


ALTER TABLE ONLY "public"."player_game_events"
    ADD CONSTRAINT "player_game_events_pkey" PRIMARY KEY ("character_id");


CREATE INDEX "activity_loot_table_idx" ON "private"."activity_loot" USING "btree" ("loot_table_id");


CREATE INDEX "admin_audit_created_idx" ON "private"."admin_audit" USING "btree" ("created_at" DESC, "id");


CREATE INDEX "character_training_tier_idx" ON "private"."character_training" USING "btree" ("training_group", "tier_id");


CREATE INDEX "combat_engagements_battle" ON "private"."combat_engagements" USING "btree" ("combat_id");


CREATE UNIQUE INDEX "combat_participants_one_active" ON "private"."combat_participants" USING "btree" ("character_id") WHERE ("status" = 'active'::"text");


CREATE INDEX "combats_attacker_history" ON "private"."combats" USING "btree" ("attacker_id", "started_at" DESC);


CREATE INDEX "combats_defender_history" ON "private"."combats" USING "btree" ("defender_id", "started_at" DESC);


CREATE INDEX "crafting_ingredient_item_idx" ON "private"."crafting_ingredients" USING "btree" ("item_id");


CREATE INDEX "crafting_output_item_idx" ON "private"."crafting_recipes" USING "btree" ("output_item_id");


CREATE INDEX "item_circulation_history_time_idx" ON "private"."item_circulation_history" USING "btree" ("item_id", "recorded_at" DESC, "id" DESC) INCLUDE ("total");


CREATE INDEX "item_definitions_category_idx" ON "private"."item_definitions" USING "btree" ("category_id");


CREATE INDEX "item_instances_definition_idx" ON "private"."item_instances" USING "btree" ("item_id", "stackable");


CREATE INDEX "item_instances_owner_idx" ON "private"."item_instances" USING "btree" ("character_id", "item_id", "id");


CREATE INDEX "item_market_totals_timeline_idx" ON "private"."item_market_totals" USING "btree" ("item_id", "sold_at" DESC, "sale_id" DESC) INCLUDE ("quantity_total", "gross_total");


CREATE INDEX "item_stacks_definition_idx" ON "private"."item_stacks" USING "btree" ("item_id", "stackable");


CREATE INDEX "loot_entries_item_idx" ON "private"."loot_entries" USING "btree" ("item_id");


CREATE INDEX "mail_boxes_folder_idx" ON "private"."mail_boxes" USING "btree" ("character_id", "direction", "mail_id" DESC) WHERE ("deleted_at" IS NULL);


CREATE INDEX "mail_boxes_owner_idx" ON "private"."mail_boxes" USING "btree" ("character_id", "mail_id" DESC);


CREATE INDEX "mail_boxes_saved_idx" ON "private"."mail_boxes" USING "btree" ("character_id", "mail_id" DESC) WHERE (("deleted_at" IS NULL) AND ("saved_at" IS NOT NULL));


CREATE INDEX "mail_boxes_unread_idx" ON "private"."mail_boxes" USING "btree" ("character_id", "mail_id") WHERE (("deleted_at" IS NULL) AND ("direction" = 'inbox'::"text") AND ("read_at" IS NULL));


CREATE INDEX "mail_ignored_target_idx" ON "private"."mail_ignored" USING "btree" ("ignored_id");


CREATE INDEX "mail_messages_reply_idx" ON "private"."mail_messages" USING "btree" ("reply_to_id");


CREATE INDEX "mail_messages_search_idx" ON "private"."mail_messages" USING "gin" ("search_vector");


CREATE INDEX "mail_messages_sender_time_idx" ON "private"."mail_messages" USING "btree" ("sender_id", "sent_at" DESC);


CREATE UNIQUE INDEX "market_listings_instance_idx" ON "private"."market_listings" USING "btree" ("original_entry_id") WHERE (("entry_type" = 'instance'::"text") AND ("quantity" > 0));


CREATE INDEX "market_listings_offers_idx" ON "private"."market_listings" USING "btree" ("item_id", "unit_price", "created_at", "id") WHERE ("quantity" > 0);


CREATE INDEX "market_listings_owner_idx" ON "private"."market_listings" USING "btree" ("seller_id", "created_at" DESC, "id") WHERE ("quantity" > 0);


CREATE INDEX "market_listings_seller_fk_idx" ON "private"."market_listings" USING "btree" ("seller_id");


CREATE INDEX "market_sales_buyer_idx" ON "private"."market_sales" USING "btree" ("buyer_id");


CREATE INDEX "market_sales_economy_time_idx" ON "private"."market_sales" USING "btree" ("sold_at") INCLUDE ("gross", "fee", "quantity");


CREATE INDEX "market_sales_item_idx" ON "private"."market_sales" USING "btree" ("item_id");


CREATE INDEX "market_sales_item_timeline_idx" ON "private"."market_sales" USING "btree" ("item_id", "sold_at", "id") INCLUDE ("quantity", "gross");


CREATE INDEX "market_sales_listing_idx" ON "private"."market_sales" USING "btree" ("listing_id");


CREATE INDEX "market_sales_recent_idx" ON "private"."market_sales" USING "btree" ("sold_at", "item_id") INCLUDE ("quantity");


CREATE INDEX "market_sales_seller_idx" ON "private"."market_sales" USING "btree" ("seller_id");


CREATE INDEX "message_threads_a_idx" ON "private"."message_threads" USING "btree" ("participant_a", "latest_message_id" DESC);


CREATE INDEX "message_threads_b_idx" ON "private"."message_threads" USING "btree" ("participant_b", "latest_message_id" DESC);


CREATE INDEX "player_activity_account_idx" ON "private"."player_activity_daily" USING "btree" ("account_id");


CREATE INDEX "player_messages_sender_time_idx" ON "private"."player_messages" USING "btree" ("sender_id", "created_at" DESC);


CREATE INDEX "player_messages_thread_idx" ON "private"."player_messages" USING "btree" ("thread_id", "id" DESC);


CREATE INDEX "player_messages_unread_idx" ON "private"."player_messages" USING "btree" ("recipient_id", "thread_id", "id") WHERE ("read_at" IS NULL);


CREATE INDEX "player_notifications_inbox_idx" ON "private"."player_notifications" USING "btree" ("character_id", "id" DESC);


CREATE INDEX "player_notifications_unread_idx" ON "private"."player_notifications" USING "btree" ("character_id", "id") WHERE ("read_at" IS NULL);


CREATE INDEX "player_presence_character_idx" ON "private"."player_presence" USING "btree" ("character_id");


CREATE INDEX "player_sign_ins_account_idx" ON "private"."player_sign_ins_daily" USING "btree" ("account_id");


CREATE INDEX "player_statistics_last_active_idx" ON "private"."player_statistics_accounts" USING "btree" ("last_active_at");


CREATE INDEX "player_statistics_last_login_idx" ON "private"."player_statistics_accounts" USING "btree" ("last_sign_in_at") WHERE ("deleted_at" IS NULL);


CREATE INDEX "player_statistics_registered_idx" ON "private"."player_statistics_accounts" USING "btree" ("registered_at");


CREATE INDEX "sea_scout_targets_character" ON "private"."sea_scout_targets" USING "btree" ("target_id");


CREATE INDEX "sea_scouts_latest" ON "private"."sea_scouts" USING "btree" ("character_id", "visit_id", "created_at" DESC, "request_id" DESC);


CREATE INDEX "ship_upgrade_history_idx" ON "private"."ship_upgrade_jobs" USING "btree" ("character_id", "finishes_at" DESC, "id");


CREATE UNIQUE INDEX "ship_upgrade_one_pending_idx" ON "private"."ship_upgrade_jobs" USING "btree" ("character_id") WHERE ("applied_at" IS NULL);


CREATE INDEX "character_profiles_harbor_arrival" ON "public"."character_profiles" USING "btree" ("arrives_at") WHERE ("arrival_location" = 'the_harbor'::"text");


CREATE INDEX "character_profiles_name_search_idx" ON "public"."character_profiles" USING "gin" ("lower"("display_name") "extensions"."gin_trgm_ops");


CREATE INDEX "characters_scout_arrivals" ON "public"."characters" USING "btree" ("travel_target_step", "travel_arrives_at", "id") WHERE (("location" = 'traveling'::"text") AND ("travel_kind" = ANY (ARRAY['depart'::"text", 'onward'::"text"])) AND ("hospital_until" IS NULL));


CREATE INDEX "characters_scout_stops" ON "public"."characters" USING "btree" ("sea_step", "id") WHERE (("location" = 'open_sea'::"text") AND ("hospital_until" IS NULL));


CREATE INDEX "harbor_players_name_order" ON "public"."harbor_players" USING "btree" ("display_name", "character_id");


CREATE INDEX "hospital_patients_expiry_idx" ON "public"."hospital_patients" USING "btree" ("hospital_until", "character_id");


CREATE INDEX "hospital_patients_name_idx" ON "public"."hospital_patients" USING "btree" ("display_name", "character_id");


CREATE OR REPLACE TRIGGER "character_skills_sync" AFTER INSERT OR DELETE OR UPDATE OF "xp" ON "private"."character_skills" FOR EACH ROW EXECUTE FUNCTION "private"."sync_skill_progress"();


CREATE OR REPLACE TRIGGER "circulation_delete" AFTER DELETE ON "private"."item_instances" REFERENCING OLD TABLE AS "old_items" FOR EACH STATEMENT EXECUTE FUNCTION "private"."track_item_circulation"();


CREATE OR REPLACE TRIGGER "circulation_delete" AFTER DELETE ON "private"."item_stacks" REFERENCING OLD TABLE AS "old_items" FOR EACH STATEMENT EXECUTE FUNCTION "private"."track_item_circulation"();


CREATE OR REPLACE TRIGGER "circulation_delete" AFTER DELETE ON "private"."market_listings" REFERENCING OLD TABLE AS "old_items" FOR EACH STATEMENT EXECUTE FUNCTION "private"."track_item_circulation"();


CREATE OR REPLACE TRIGGER "circulation_insert" AFTER INSERT ON "private"."item_instances" REFERENCING NEW TABLE AS "new_items" FOR EACH STATEMENT EXECUTE FUNCTION "private"."track_item_circulation"();


CREATE OR REPLACE TRIGGER "circulation_insert" AFTER INSERT ON "private"."item_stacks" REFERENCING NEW TABLE AS "new_items" FOR EACH STATEMENT EXECUTE FUNCTION "private"."track_item_circulation"();


CREATE OR REPLACE TRIGGER "circulation_insert" AFTER INSERT ON "private"."market_listings" REFERENCING NEW TABLE AS "new_items" FOR EACH STATEMENT EXECUTE FUNCTION "private"."track_item_circulation"();


CREATE OR REPLACE TRIGGER "circulation_update" AFTER UPDATE ON "private"."item_instances" REFERENCING OLD TABLE AS "old_items" NEW TABLE AS "new_items" FOR EACH STATEMENT EXECUTE FUNCTION "private"."track_item_circulation"();


CREATE OR REPLACE TRIGGER "circulation_update" AFTER UPDATE ON "private"."item_stacks" REFERENCING OLD TABLE AS "old_items" NEW TABLE AS "new_items" FOR EACH STATEMENT EXECUTE FUNCTION "private"."track_item_circulation"();


CREATE OR REPLACE TRIGGER "circulation_update" AFTER UPDATE ON "private"."market_listings" REFERENCING OLD TABLE AS "old_items" NEW TABLE AS "new_items" FOR EACH STATEMENT EXECUTE FUNCTION "private"."track_item_circulation"();


CREATE OR REPLACE TRIGGER "initialize_item_circulation" AFTER INSERT ON "private"."item_definitions" FOR EACH ROW EXECUTE FUNCTION "private"."initialize_item_circulation"();


CREATE OR REPLACE TRIGGER "market_value_delete" AFTER DELETE ON "private"."market_sales" REFERENCING OLD TABLE AS "old_sales" FOR EACH STATEMENT EXECUTE FUNCTION "private"."track_item_market_totals"();


CREATE OR REPLACE TRIGGER "market_value_insert" AFTER INSERT ON "private"."market_sales" REFERENCING NEW TABLE AS "new_sales" FOR EACH STATEMENT EXECUTE FUNCTION "private"."track_item_market_totals"();


CREATE OR REPLACE TRIGGER "market_value_update" AFTER UPDATE ON "private"."market_sales" REFERENCING OLD TABLE AS "old_sales" NEW TABLE AS "new_sales" FOR EACH STATEMENT EXECUTE FUNCTION "private"."track_item_market_totals"();


CREATE OR REPLACE TRIGGER "notify_completed_attack" AFTER UPDATE ON "private"."combats" FOR EACH ROW WHEN ((("old"."status" = 'active'::"text") AND ("new"."status" = 'completed'::"text"))) EXECUTE FUNCTION "private"."notify_completed_attack"();


CREATE OR REPLACE TRIGGER "record_character_action" AFTER INSERT ON "private"."activity_requests" FOR EACH ROW EXECUTE FUNCTION "private"."track_character_action"();


CREATE OR REPLACE TRIGGER "record_character_action" AFTER INSERT ON "private"."bank_transfers" FOR EACH ROW EXECUTE FUNCTION "private"."track_character_action"();


CREATE OR REPLACE TRIGGER "record_character_action" AFTER INSERT ON "private"."combat_participants" FOR EACH ROW EXECUTE FUNCTION "private"."track_character_action"();


CREATE OR REPLACE TRIGGER "record_character_action" AFTER INSERT ON "private"."crafting_requests" FOR EACH ROW EXECUTE FUNCTION "private"."track_character_action"();


CREATE OR REPLACE TRIGGER "record_character_action" AFTER INSERT ON "private"."inventory_requests" FOR EACH ROW EXECUTE FUNCTION "private"."track_character_action"();


CREATE OR REPLACE TRIGGER "record_character_action" AFTER INSERT ON "private"."market_requests" FOR EACH ROW EXECUTE FUNCTION "private"."track_character_action"();


CREATE OR REPLACE TRIGGER "record_character_action" AFTER INSERT ON "private"."sea_scouts" FOR EACH ROW EXECUTE FUNCTION "private"."track_character_action"();


CREATE OR REPLACE TRIGGER "record_character_action" AFTER INSERT ON "private"."sea_travel_requests" FOR EACH ROW EXECUTE FUNCTION "private"."track_character_action"();


CREATE OR REPLACE TRIGGER "record_character_action" AFTER INSERT ON "private"."tavern_requests" FOR EACH ROW EXECUTE FUNCTION "private"."track_character_action"();


CREATE OR REPLACE TRIGGER "record_character_action" AFTER INSERT ON "private"."training_requests" FOR EACH ROW EXECUTE FUNCTION "private"."track_character_action"();


CREATE OR REPLACE TRIGGER "characters_admit_to_hospital" BEFORE INSERT OR UPDATE OF "ship_health", "crew_health" ON "public"."characters" FOR EACH ROW EXECUTE FUNCTION "private"."admit_to_hospital"();


CREATE OR REPLACE TRIGGER "characters_guard_sea_resources" BEFORE INSERT OR UPDATE ON "public"."characters" FOR EACH ROW EXECUTE FUNCTION "private"."guard_sea_resources"();


CREATE OR REPLACE TRIGGER "characters_preserve_player_number" BEFORE UPDATE OF "player_number" ON "public"."characters" FOR EACH ROW EXECUTE FUNCTION "private"."preserve_player_number"();


CREATE OR REPLACE TRIGGER "characters_sync_harbor_player" AFTER INSERT OR UPDATE ON "public"."characters" FOR EACH ROW EXECUTE FUNCTION "private"."sync_harbor_player"();


CREATE OR REPLACE TRIGGER "characters_sync_hospital_patient" AFTER INSERT OR UPDATE ON "public"."characters" FOR EACH ROW EXECUTE FUNCTION "private"."sync_hospital_patient"();


CREATE OR REPLACE TRIGGER "characters_sync_profile" AFTER INSERT OR UPDATE ON "public"."characters" FOR EACH ROW EXECUTE FUNCTION "private"."sync_character_profile"();


CREATE OR REPLACE TRIGGER "characters_validate_name" BEFORE INSERT OR UPDATE OF "display_name" ON "public"."characters" FOR EACH ROW EXECUTE FUNCTION "private"."validate_character_name"();


CREATE OR REPLACE TRIGGER "initialize_skills" AFTER INSERT ON "public"."characters" FOR EACH ROW EXECUTE FUNCTION "private"."initialize_skills"();


CREATE OR REPLACE TRIGGER "initialize_training_progress" AFTER INSERT ON "public"."characters" FOR EACH ROW EXECUTE FUNCTION "private"."initialize_training_progress"();


ALTER TABLE ONLY "private"."activity_definitions"
    ADD CONSTRAINT "activity_definitions_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "private"."skill_definitions"("id");


ALTER TABLE ONLY "private"."activity_loot"
    ADD CONSTRAINT "activity_loot_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "private"."activity_definitions"("id");


ALTER TABLE ONLY "private"."activity_loot"
    ADD CONSTRAINT "activity_loot_loot_table_id_fkey" FOREIGN KEY ("loot_table_id") REFERENCES "private"."loot_tables"("id");


ALTER TABLE ONLY "private"."activity_requests"
    ADD CONSTRAINT "activity_requests_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "private"."activity_definitions"("id");


ALTER TABLE ONLY "private"."activity_requests"
    ADD CONSTRAINT "activity_requests_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "private"."admin_members"
    ADD CONSTRAINT "admin_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "private"."bank_transfers"
    ADD CONSTRAINT "bank_transfers_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "private"."character_actions"
    ADD CONSTRAINT "character_actions_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "private"."character_skills"
    ADD CONSTRAINT "character_skills_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "private"."character_skills"
    ADD CONSTRAINT "character_skills_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "private"."skill_definitions"("id");


ALTER TABLE ONLY "private"."character_training"
    ADD CONSTRAINT "character_training_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "private"."character_training"
    ADD CONSTRAINT "character_training_training_group_tier_id_fkey" FOREIGN KEY ("training_group", "tier_id") REFERENCES "private"."training_tiers"("training_group", "id");


ALTER TABLE ONLY "private"."combat_engagements"
    ADD CONSTRAINT "combat_engagements_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "private"."combat_engagements"
    ADD CONSTRAINT "combat_engagements_combat_id_fkey" FOREIGN KEY ("combat_id") REFERENCES "private"."combats"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "private"."combat_participants"
    ADD CONSTRAINT "combat_participants_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "private"."combat_participants"
    ADD CONSTRAINT "combat_participants_combat_id_fkey" FOREIGN KEY ("combat_id") REFERENCES "private"."combats"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "private"."combat_rounds"
    ADD CONSTRAINT "combat_rounds_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "public"."characters"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "private"."combat_rounds"
    ADD CONSTRAINT "combat_rounds_combat_id_fkey" FOREIGN KEY ("combat_id") REFERENCES "private"."combats"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "private"."combats"
    ADD CONSTRAINT "combats_attacker_id_fkey" FOREIGN KEY ("attacker_id") REFERENCES "public"."characters"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "private"."combats"
    ADD CONSTRAINT "combats_defender_id_fkey" FOREIGN KEY ("defender_id") REFERENCES "public"."characters"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "private"."crafting_ingredients"
    ADD CONSTRAINT "crafting_ingredients_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "private"."item_definitions"("id");


ALTER TABLE ONLY "private"."crafting_ingredients"
    ADD CONSTRAINT "crafting_ingredients_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "private"."crafting_recipes"("id");


ALTER TABLE ONLY "private"."crafting_recipes"
    ADD CONSTRAINT "crafting_recipes_output_item_id_fkey" FOREIGN KEY ("output_item_id") REFERENCES "private"."item_definitions"("id");


ALTER TABLE ONLY "private"."crafting_requests"
    ADD CONSTRAINT "crafting_requests_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "private"."crafting_requests"
    ADD CONSTRAINT "crafting_requests_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "private"."crafting_recipes"("id");


ALTER TABLE ONLY "private"."inventory_requests"
    ADD CONSTRAINT "inventory_requests_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "private"."item_circulation_history"
    ADD CONSTRAINT "item_circulation_history_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "private"."item_circulation"("item_id");


ALTER TABLE ONLY "private"."item_circulation"
    ADD CONSTRAINT "item_circulation_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "private"."item_definitions"("id");


ALTER TABLE ONLY "private"."item_definitions"
    ADD CONSTRAINT "item_definitions_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "private"."item_categories"("id");


ALTER TABLE ONLY "private"."item_instances"
    ADD CONSTRAINT "item_instances_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "private"."item_instances"
    ADD CONSTRAINT "item_instances_item_id_stackable_fkey" FOREIGN KEY ("item_id", "stackable") REFERENCES "private"."item_definitions"("id", "stackable");


ALTER TABLE ONLY "private"."item_market_totals"
    ADD CONSTRAINT "item_market_totals_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "private"."item_definitions"("id");


ALTER TABLE ONLY "private"."item_stacks"
    ADD CONSTRAINT "item_stacks_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "private"."item_stacks"
    ADD CONSTRAINT "item_stacks_item_id_stackable_fkey" FOREIGN KEY ("item_id", "stackable") REFERENCES "private"."item_definitions"("id", "stackable");


ALTER TABLE ONLY "private"."loot_entries"
    ADD CONSTRAINT "loot_entries_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "private"."item_definitions"("id");


ALTER TABLE ONLY "private"."loot_entries"
    ADD CONSTRAINT "loot_entries_loot_table_id_fkey" FOREIGN KEY ("loot_table_id") REFERENCES "private"."loot_tables"("id");


ALTER TABLE ONLY "private"."mail_boxes"
    ADD CONSTRAINT "mail_boxes_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "private"."mail_boxes"
    ADD CONSTRAINT "mail_boxes_mail_id_fkey" FOREIGN KEY ("mail_id") REFERENCES "private"."mail_messages"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "private"."mail_ignored"
    ADD CONSTRAINT "mail_ignored_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "private"."mail_ignored"
    ADD CONSTRAINT "mail_ignored_ignored_id_fkey" FOREIGN KEY ("ignored_id") REFERENCES "public"."characters"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "private"."mail_messages"
    ADD CONSTRAINT "mail_messages_reply_to_id_fkey" FOREIGN KEY ("reply_to_id") REFERENCES "private"."mail_messages"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "private"."mail_messages"
    ADD CONSTRAINT "mail_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."characters"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "private"."market_listings"
    ADD CONSTRAINT "market_listings_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "private"."item_definitions"("id");


ALTER TABLE ONLY "private"."market_listings"
    ADD CONSTRAINT "market_listings_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "public"."characters"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "private"."market_requests"
    ADD CONSTRAINT "market_requests_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "private"."market_sales"
    ADD CONSTRAINT "market_sales_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "public"."characters"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "private"."market_sales"
    ADD CONSTRAINT "market_sales_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "private"."item_definitions"("id");


ALTER TABLE ONLY "private"."market_sales"
    ADD CONSTRAINT "market_sales_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "private"."market_listings"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "private"."market_sales"
    ADD CONSTRAINT "market_sales_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "public"."characters"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "private"."message_threads"
    ADD CONSTRAINT "message_threads_participant_a_fkey" FOREIGN KEY ("participant_a") REFERENCES "public"."characters"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "private"."message_threads"
    ADD CONSTRAINT "message_threads_participant_b_fkey" FOREIGN KEY ("participant_b") REFERENCES "public"."characters"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "private"."player_activity_daily"
    ADD CONSTRAINT "player_activity_daily_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "private"."player_statistics_accounts"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "private"."player_messages"
    ADD CONSTRAINT "player_messages_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "public"."characters"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "private"."player_messages"
    ADD CONSTRAINT "player_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."characters"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "private"."player_messages"
    ADD CONSTRAINT "player_messages_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "private"."message_threads"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "private"."player_notifications"
    ADD CONSTRAINT "player_notifications_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "private"."player_presence"
    ADD CONSTRAINT "player_presence_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "private"."player_presence"
    ADD CONSTRAINT "player_presence_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "auth"."sessions"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "private"."player_sign_ins_daily"
    ADD CONSTRAINT "player_sign_ins_daily_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "private"."player_statistics_accounts"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "private"."player_statistics_accounts"
    ADD CONSTRAINT "player_statistics_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "private"."sea_route_options"
    ADD CONSTRAINT "sea_route_options_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "private"."sea_scout_targets"
    ADD CONSTRAINT "sea_scout_targets_character_id_request_id_fkey" FOREIGN KEY ("character_id", "request_id") REFERENCES "private"."sea_scouts"("character_id", "request_id") ON DELETE CASCADE;


ALTER TABLE ONLY "private"."sea_scout_targets"
    ADD CONSTRAINT "sea_scout_targets_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "public"."character_profiles"("character_id") ON DELETE CASCADE;


ALTER TABLE ONLY "private"."sea_scouts"
    ADD CONSTRAINT "sea_scouts_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "private"."sea_travel_requests"
    ADD CONSTRAINT "sea_travel_requests_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "private"."ship_upgrade_jobs"
    ADD CONSTRAINT "ship_upgrade_jobs_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "private"."tavern_requests"
    ADD CONSTRAINT "tavern_requests_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "private"."training_requests"
    ADD CONSTRAINT "training_requests_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."character_profiles"
    ADD CONSTRAINT "character_profiles_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."characters"
    ADD CONSTRAINT "characters_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."harbor_players"
    ADD CONSTRAINT "harbor_players_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."hospital_patients"
    ADD CONSTRAINT "hospital_patients_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."market_item_events"
    ADD CONSTRAINT "market_item_events_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "private"."item_definitions"("id");


ALTER TABLE ONLY "public"."player_game_events"
    ADD CONSTRAINT "player_game_events_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE CASCADE;


ALTER TABLE "private"."activity_definitions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "private"."activity_loot" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "private"."activity_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "private"."admin_audit" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "private"."admin_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "private"."admin_resources" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "private"."bank_transfers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "private"."character_actions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "private"."character_skills" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "private"."character_training" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "private"."combat_engagements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "private"."combat_participants" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "private"."combat_rounds" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "private"."combats" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "private"."crafting_ingredients" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "private"."crafting_recipes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "private"."crafting_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "private"."economy_snapshots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "private"."inventory_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "private"."item_categories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "private"."item_circulation" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "private"."item_circulation_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "private"."item_definitions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "private"."item_instances" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "private"."item_market_totals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "private"."item_stacks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "private"."loot_entries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "private"."loot_tables" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "private"."mail_boxes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "private"."mail_ignored" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "private"."mail_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "private"."market_listings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "private"."market_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "private"."market_sales" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "private"."message_threads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "private"."player_activity_daily" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "private"."player_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "private"."player_notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "private"."player_presence" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "private"."player_sign_ins_daily" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "private"."player_statistics_accounts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "private"."player_statistics_config" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "private"."sea_location_types" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "private"."sea_route_options" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "private"."sea_scout_targets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "private"."sea_scouts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "private"."sea_travel_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "private"."ship_upgrade_jobs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "private"."ship_work_sizes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "private"."skill_definitions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "private"."skill_levels" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "private"."tavern_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "private"."training_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "private"."training_tiers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "Owners read their game notifications" ON "public"."player_game_events" FOR SELECT TO "authenticated" USING (("character_id" IN ( SELECT "characters"."id"
   FROM "public"."characters"
  WHERE ("characters"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));


ALTER TABLE "public"."character_profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "character_profiles_read" ON "public"."character_profiles" FOR SELECT TO "authenticated" USING (( SELECT "private"."is_registered_player"() AS "is_registered_player"));


ALTER TABLE "public"."characters" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "characters_create_own" ON "public"."characters" FOR INSERT TO "authenticated" WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND ( SELECT "private"."is_registered_player"() AS "is_verified_player")));


CREATE POLICY "characters_read_own" ON "public"."characters" FOR SELECT TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND ( SELECT "private"."is_registered_player"() AS "is_verified_player")));


ALTER TABLE "public"."harbor_players" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "harbor_players_read" ON "public"."harbor_players" FOR SELECT TO "authenticated" USING ((( SELECT "private"."is_registered_player"() AS "is_registered_player") AND (("arrives_at" IS NULL) OR ("arrives_at" <= "statement_timestamp"()))));


ALTER TABLE "public"."hospital_patients" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "hospital_patients_read" ON "public"."hospital_patients" FOR SELECT TO "authenticated" USING ((( SELECT "private"."is_registered_player"() AS "is_registered_player") AND ("hospital_until" > "now"())));


CREATE POLICY "market_events_registered_read" ON "public"."market_item_events" FOR SELECT TO "authenticated" USING (( SELECT "private"."is_registered_player"() AS "is_registered_player"));


ALTER TABLE "public"."market_item_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."player_game_events" ENABLE ROW LEVEL SECURITY;


ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."character_profiles";


ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."harbor_players";


ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."hospital_patients";


ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."market_item_events";


ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."player_game_events";


-- pg_dump emits grants relative to built-in defaults, but Supabase default privileges grant broad
-- access to new public objects. Clear them so the grants below reproduce the original chain exactly.
REVOKE ALL ON ALL TABLES IN SCHEMA "public", "private" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON ALL SEQUENCES IN SCHEMA "public", "private" FROM "anon", "authenticated", "service_role";

GRANT USAGE ON SCHEMA "private" TO "authenticated";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";


REVOKE ALL ON FUNCTION "private"."admin_catalog"() FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."admin_catalog"() TO "authenticated";


REVOKE ALL ON FUNCTION "private"."admin_economy"("period" "text", "item_search" "text", "item_page" integer, "item_sort" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."admin_economy"("period" "text", "item_search" "text", "item_page" integer, "item_sort" "text") TO "authenticated";


REVOKE ALL ON FUNCTION "private"."admin_get_loot_table"("target_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."admin_get_loot_table"("target_id" "text") TO "authenticated";


REVOKE ALL ON FUNCTION "private"."admin_mutate"("action" "text", "payload" "jsonb", "request_id" "uuid", "reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."admin_mutate"("action" "text", "payload" "jsonb", "request_id" "uuid", "reason" "text") TO "authenticated";


REVOKE ALL ON FUNCTION "private"."admin_overview"() FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."admin_overview"() TO "authenticated";


REVOKE ALL ON FUNCTION "private"."admin_player_statistics"("period" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."admin_player_statistics"("period" "text") TO "authenticated";


REVOKE ALL ON FUNCTION "private"."admin_players"("search_term" "text", "requested_page" integer, "sort_by" "text", "activity" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."admin_players"("search_term" "text", "requested_page" integer, "sort_by" "text", "activity" "text") TO "authenticated";


REVOKE ALL ON FUNCTION "private"."admin_read"("resource" "text", "search_term" "text", "requested_page" integer, "filters" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."admin_read"("resource" "text", "search_term" "text", "requested_page" integer, "filters" "jsonb") TO "authenticated";


REVOKE ALL ON FUNCTION "private"."admin_row"("value" "jsonb") FROM PUBLIC;


REVOKE ALL ON FUNCTION "private"."admin_save_activity_loot"("payload" "jsonb") FROM PUBLIC;


REVOKE ALL ON FUNCTION "private"."admin_save_item"("payload" "jsonb") FROM PUBLIC;


REVOKE ALL ON FUNCTION "private"."admin_save_loot_table"("payload" "jsonb") FROM PUBLIC;


REVOKE ALL ON FUNCTION "private"."admit_to_hospital"() FROM PUBLIC;


REVOKE ALL ON FUNCTION "private"."advance_shared_combat"("battle_id" "uuid", "actor" "uuid", "player_order" "text", "request_id" "uuid", "occurred_at" timestamp with time zone, "timed_out" boolean) FROM PUBLIC;


REVOKE ALL ON FUNCTION "private"."append_combat_event"("battle_id" "uuid", "actor" "uuid", "request" "uuid", "payload" "jsonb") FROM PUBLIC;


REVOKE ALL ON FUNCTION "private"."assert_can_act"("captain_id" "uuid") FROM PUBLIC;


REVOKE ALL ON FUNCTION "private"."award_skill_xp"("target_id" "uuid", "target_skill" "text", "amount" numeric) FROM PUBLIC;


REVOKE ALL ON FUNCTION "private"."buy_market_listing"("listing_id" "uuid", "quantity" numeric, "expected_unit_price" numeric, "request_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."buy_market_listing"("listing_id" "uuid", "quantity" numeric, "expected_unit_price" numeric, "request_id" "uuid") TO "authenticated";


REVOKE ALL ON FUNCTION "private"."buy_tavern_meal"("expected_gold_cost" numeric, "expected_morale_gain" numeric, "request_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."buy_tavern_meal"("expected_gold_cost" numeric, "expected_morale_gain" numeric, "request_id" "uuid") TO "authenticated";


REVOKE ALL ON FUNCTION "private"."can_attack_here"("target_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."can_attack_here"("target_id" "uuid") TO "authenticated";


REVOKE ALL ON FUNCTION "private"."cancel_market_listing"("listing_id" "uuid", "request_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."cancel_market_listing"("listing_id" "uuid", "request_id" "uuid") TO "authenticated";


GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."characters" TO "service_role";
GRANT SELECT ON TABLE "public"."characters" TO "authenticated";


GRANT INSERT("display_name") ON TABLE "public"."characters" TO "authenticated";


REVOKE ALL ON FUNCTION "private"."character_energy_snapshot"("c" "public"."characters", "observed_at" timestamp with time zone) FROM PUBLIC;


REVOKE ALL ON FUNCTION "private"."character_level"("target_id" "uuid") FROM PUBLIC;


REVOKE ALL ON FUNCTION "private"."combat_captain"() FROM PUBLIC;


REVOKE ALL ON FUNCTION "private"."combat_damage"("attack" numeric, "defense" numeric) FROM PUBLIC;


REVOKE ALL ON FUNCTION "private"."combat_damage_reduction"("attack" numeric, "defense" numeric) FROM PUBLIC;


REVOKE ALL ON FUNCTION "private"."combat_hit_chance"("accuracy" numeric, "speed" numeric) FROM PUBLIC;


REVOKE ALL ON FUNCTION "private"."combat_location_error"("a" "public"."characters", "d" "public"."characters", "observed_at" timestamp with time zone) FROM PUBLIC;


REVOKE ALL ON FUNCTION "private"."combat_people"("battle_id" "uuid") FROM PUBLIC;


REVOKE ALL ON FUNCTION "private"."combat_roll"() FROM PUBLIC;


REVOKE ALL ON FUNCTION "private"."combat_snapshot"("c" "public"."characters", "observed_at" timestamp with time zone) FROM PUBLIC;


REVOKE ALL ON FUNCTION "private"."combat_view"("battle_id" "uuid", "viewer_id" "uuid") FROM PUBLIC;


REVOKE ALL ON FUNCTION "private"."craft_item"("recipe_id" "text", "expected_version" "text", "request_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."craft_item"("recipe_id" "text", "expected_version" "text", "request_id" "uuid") TO "authenticated";


REVOKE ALL ON FUNCTION "private"."create_market_listings"("entries" "jsonb", "request_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."create_market_listings"("entries" "jsonb", "request_id" "uuid") TO "authenticated";


REVOKE ALL ON FUNCTION "private"."create_signup_character"() FROM PUBLIC;


REVOKE ALL ON FUNCTION "private"."crew_training_gain"("base_gain" numeric, "roll" double precision) FROM PUBLIC;


REVOKE ALL ON FUNCTION "private"."economy_holdings"() FROM PUBLIC;


REVOKE ALL ON FUNCTION "private"."economy_items"("observed" timestamp with time zone) FROM PUBLIC;


REVOKE ALL ON FUNCTION "private"."effective_sea_distance"("c" "public"."characters", "observed_at" timestamp with time zone) FROM PUBLIC;


REVOKE ALL ON FUNCTION "private"."emit_notification"("recipient_id" "uuid", "event_kind" "text", "event_key" "text", "event_payload" "jsonb", "event_at" timestamp with time zone) FROM PUBLIC;


REVOKE ALL ON FUNCTION "private"."energy_snapshot"("stored_energy" integer, "anchor" timestamp with time zone, "observed_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."energy_snapshot"("stored_energy" integer, "anchor" timestamp with time zone, "observed_at" timestamp with time zone) TO "authenticated";


REVOKE ALL ON FUNCTION "private"."energy_tick_snapshot"("stored_energy" integer, "anchor" timestamp with time zone, "observed_at" timestamp with time zone, "tick_seconds" bigint) FROM PUBLIC;


REVOKE ALL ON FUNCTION "private"."get_attack_lock"() FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."get_attack_lock"() TO "authenticated";


REVOKE ALL ON FUNCTION "private"."get_combat"("battle_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."get_combat"("battle_id" "uuid") TO "authenticated";


REVOKE ALL ON FUNCTION "private"."get_combat_log"("battle_id" "uuid") FROM PUBLIC;


REVOKE ALL ON FUNCTION "private"."get_combat_preview"("target_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."get_combat_preview"("target_id" "uuid") TO "authenticated";


REVOKE ALL ON FUNCTION "private"."get_game_state"() FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."get_game_state"() TO "authenticated";


REVOKE ALL ON FUNCTION "private"."get_item_circulation"("target_item" "text", "period" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."get_item_circulation"("target_item" "text", "period" "text") TO "authenticated";


REVOKE ALL ON FUNCTION "private"."get_item_market_value"("target_item" "text", "period" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."get_item_market_value"("target_item" "text", "period" "text") TO "authenticated";


REVOKE ALL ON FUNCTION "private"."get_mail"("mail_id" bigint, "include_history" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."get_mail"("mail_id" bigint, "include_history" boolean) TO "authenticated";


REVOKE ALL ON FUNCTION "private"."get_mail_ignored"() FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."get_mail_ignored"() TO "authenticated";


REVOKE ALL ON FUNCTION "private"."get_mail_summary"() FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."get_mail_summary"() TO "authenticated";


REVOKE ALL ON FUNCTION "private"."get_mailbox"("folder" "text", "query" "text", "page" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."get_mailbox"("folder" "text", "query" "text", "page" integer) TO "authenticated";


REVOKE ALL ON FUNCTION "private"."get_message_conversation"("target_player_number" bigint, "before_id" bigint) FROM PUBLIC;


REVOKE ALL ON FUNCTION "private"."get_message_inbox"("before_id" bigint) FROM PUBLIC;


REVOKE ALL ON FUNCTION "private"."get_message_summary"() FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."get_message_summary"() TO "authenticated";


REVOKE ALL ON FUNCTION "private"."get_navigation_lock"() FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."get_navigation_lock"() TO "authenticated";


REVOKE ALL ON FUNCTION "private"."get_notification_summary"() FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."get_notification_summary"() TO "authenticated";


REVOKE ALL ON FUNCTION "private"."get_notifications"("before_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."get_notifications"("before_id" bigint) TO "authenticated";


REVOKE ALL ON FUNCTION "private"."get_own_skills"() FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."get_own_skills"() TO "authenticated";


REVOKE ALL ON FUNCTION "private"."get_player_context"() FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."get_player_context"() TO "authenticated";


REVOKE ALL ON FUNCTION "private"."get_player_presence"("target_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."get_player_presence"("target_id" "uuid") TO "authenticated";


REVOKE ALL ON FUNCTION "private"."get_player_snapshot"() FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."get_player_snapshot"() TO "authenticated";


REVOKE ALL ON FUNCTION "private"."get_sea_scout"("requested_page" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."get_sea_scout"("requested_page" integer) TO "authenticated";


REVOKE ALL ON FUNCTION "private"."guard_sea_resources"() FROM PUBLIC;


REVOKE ALL ON FUNCTION "private"."health_snapshot"("value" integer, "anchor" timestamp with time zone, "observed_at" timestamp with time zone, "seconds" integer) FROM PUBLIC;


REVOKE ALL ON FUNCTION "private"."import_legacy_mail"() FROM PUBLIC;


REVOKE ALL ON FUNCTION "private"."initialize_item_circulation"() FROM PUBLIC;


REVOKE ALL ON FUNCTION "private"."initialize_skills"() FROM PUBLIC;


REVOKE ALL ON FUNCTION "private"."initialize_training_progress"() FROM PUBLIC;


REVOKE ALL ON FUNCTION "private"."interrupt_hospital_combats"("captain_ids" "uuid"[]) FROM PUBLIC;


REVOKE ALL ON FUNCTION "private"."is_admin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."is_admin"() TO "authenticated";


REVOKE ALL ON FUNCTION "private"."is_registered_player"() FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."is_registered_player"() TO "authenticated";


REVOKE ALL ON FUNCTION "private"."is_valid_character_name"("candidate" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."is_valid_character_name"("candidate" "text") TO "authenticated";


REVOKE ALL ON FUNCTION "private"."item_market_value_at"("target_item" "text", "observed" timestamp with time zone) FROM PUBLIC;


REVOKE ALL ON FUNCTION "private"."latest_sea_scout"("c" "public"."characters") FROM PUBLIC;


REVOKE ALL ON FUNCTION "private"."list_crafting_recipes"() FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."list_crafting_recipes"() TO "authenticated";


REVOKE ALL ON FUNCTION "private"."list_inventory"("category_id" "text", "search_term" "text", "requested_page" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."list_inventory"("category_id" "text", "search_term" "text", "requested_page" integer) TO "authenticated";


REVOKE ALL ON FUNCTION "private"."list_market_inventory"("category_id" "text", "search_term" "text", "requested_page" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."list_market_inventory"("category_id" "text", "search_term" "text", "requested_page" integer) TO "authenticated";


REVOKE ALL ON FUNCTION "private"."list_market_items"("category_id" "text", "search_term" "text", "requested_page" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."list_market_items"("category_id" "text", "search_term" "text", "requested_page" integer) TO "authenticated";


REVOKE ALL ON FUNCTION "private"."list_market_listings"("target_item" "text", "own_only" boolean, "requested_page" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."list_market_listings"("target_item" "text", "own_only" boolean, "requested_page" integer) TO "authenticated";


REVOKE ALL ON FUNCTION "private"."lock_combat_context"("captain_ids" "uuid"[]) FROM PUBLIC;


REVOKE ALL ON FUNCTION "private"."loot_distribution"("target_id" "text", "skill_level" integer, "mastery_level" integer) FROM PUBLIC;


REVOKE ALL ON FUNCTION "private"."loot_document"("target_id" "text") FROM PUBLIC;


REVOKE ALL ON FUNCTION "private"."mail_json"("m" "private"."mail_messages", "b" "private"."mail_boxes", "include_body" boolean) FROM PUBLIC;


REVOKE ALL ON FUNCTION "private"."mark_all_notifications_read"("through_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."mark_all_notifications_read"("through_id" bigint) TO "authenticated";


REVOKE ALL ON FUNCTION "private"."mark_messages_read"("target_player_number" bigint, "through_id" bigint) FROM PUBLIC;


REVOKE ALL ON FUNCTION "private"."mark_notification_read"("notification_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."mark_notification_read"("notification_id" bigint) TO "authenticated";


REVOKE ALL ON FUNCTION "private"."morale_multiplier"("morale" numeric, "bonus_bps" integer) FROM PUBLIC;


REVOKE ALL ON FUNCTION "private"."morale_snapshot"("stored_morale" numeric, "anchor" timestamp with time zone, "observed_at" timestamp with time zone) FROM PUBLIC;


REVOKE ALL ON FUNCTION "private"."notify_combat"("battle_id" "uuid") FROM PUBLIC;


REVOKE ALL ON FUNCTION "private"."notify_completed_attack"() FROM PUBLIC;


REVOKE ALL ON FUNCTION "private"."notify_market"("target_item" "text") FROM PUBLIC;


REVOKE ALL ON FUNCTION "private"."notify_training"("captain_id" "uuid") FROM PUBLIC;


REVOKE ALL ON FUNCTION "private"."perform_activity"("activity_id" "text", "expected_stamina_cost" numeric, "expected_xp_gain" numeric, "request_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."perform_activity"("activity_id" "text", "expected_stamina_cost" numeric, "expected_xp_gain" numeric, "request_id" "uuid") TO "authenticated";


REVOKE ALL ON FUNCTION "private"."preserve_player_number"() FROM PUBLIC;


REVOKE ALL ON FUNCTION "private"."receive_market_item"("listing" "private"."market_listings", "recipient_id" "uuid", "amount" bigint) FROM PUBLIC;


REVOKE ALL ON FUNCTION "private"."record_character_action"("target_id" "uuid") FROM PUBLIC;


REVOKE ALL ON FUNCTION "private"."record_economy_snapshot"() FROM PUBLIC;


REVOKE ALL ON FUNCTION "private"."record_item_circulation_delta"("target_item" "text", "delta" numeric) FROM PUBLIC;


REVOKE ALL ON FUNCTION "private"."record_player_activity"() FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."record_player_activity"() TO "authenticated";


REVOKE ALL ON FUNCTION "private"."record_player_presence"("tab_id" "uuid", "is_active" boolean, "page_action" boolean, "closed" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."record_player_presence"("tab_id" "uuid", "is_active" boolean, "page_action" boolean, "closed" boolean) TO "authenticated";


REVOKE ALL ON FUNCTION "private"."require_admin"() FROM PUBLIC;


REVOKE ALL ON FUNCTION "private"."resolve_combat_round"("input_state" "jsonb", "player_order" "text", "rolls" double precision[]) FROM PUBLIC;


REVOKE ALL ON FUNCTION "private"."roll_activity_loot"("target_id" "uuid", "activity_id" "text", "skill_level" integer) FROM PUBLIC;


REVOKE ALL ON FUNCTION "private"."save_defence_orders"("preset" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."save_defence_orders"("preset" "text") TO "authenticated";


REVOKE ALL ON FUNCTION "private"."scout_nearby_ships"("expected_version" "uuid", "request_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."scout_nearby_ships"("expected_version" "uuid", "request_id" "uuid") TO "authenticated";


REVOKE ALL ON FUNCTION "private"."sea_state"("c" "public"."characters") FROM PUBLIC;


REVOKE ALL ON FUNCTION "private"."sea_travel_action"("action" "text", "expected_version" "uuid", "option_id" "uuid", "request_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."sea_travel_action"("action" "text", "expected_version" "uuid", "option_id" "uuid", "request_id" "uuid") TO "authenticated";


REVOKE ALL ON FUNCTION "private"."send_mail"("target_numbers" bigint[], "mail_subject" "text", "mail_body" "text", "request_id" "uuid", "reply_to_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."send_mail"("target_numbers" bigint[], "mail_subject" "text", "mail_body" "text", "request_id" "uuid", "reply_to_id" bigint) TO "authenticated";


REVOKE ALL ON FUNCTION "private"."send_player_message"("target_player_number" bigint, "message_body" "text", "request_id" "uuid") FROM PUBLIC;


REVOKE ALL ON FUNCTION "private"."set_mail_ignored"("target_player_number" bigint, "ignored" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."set_mail_ignored"("target_player_number" bigint, "ignored" boolean) TO "authenticated";


REVOKE ALL ON FUNCTION "private"."settle_combat_context"("captain_ids" "uuid"[]) FROM PUBLIC;


REVOKE ALL ON FUNCTION "private"."settle_hospital"("captain_id" "uuid", "observed_at" timestamp with time zone) FROM PUBLIC;


REVOKE ALL ON FUNCTION "private"."settle_sea_travel"("captain_id" "uuid", "observed_at" timestamp with time zone) FROM PUBLIC;


REVOKE ALL ON FUNCTION "private"."settle_ship_upgrade"("captain_id" "uuid", "observed_at" timestamp with time zone) FROM PUBLIC;


REVOKE ALL ON FUNCTION "private"."ship_material_costs"("captain_id" "uuid", "energy_amount" integer) FROM PUBLIC;


REVOKE ALL ON FUNCTION "private"."ship_training_gain"("stat_value" numeric, "efficiency" numeric, "energy_amount" integer) FROM PUBLIC;


REVOKE ALL ON FUNCTION "private"."skill_level"("experience" bigint) FROM PUBLIC;


REVOKE ALL ON FUNCTION "private"."spend_activity_stamina"("target_id" "uuid") FROM PUBLIC;


REVOKE ALL ON FUNCTION "private"."stamina_snapshot"("stored_stamina" integer, "anchor" timestamp with time zone, "observed_at" timestamp with time zone) FROM PUBLIC;


REVOKE ALL ON FUNCTION "private"."start_combat"("target_id" "uuid", "request_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."start_combat"("target_id" "uuid", "request_id" "uuid") TO "authenticated";


REVOKE ALL ON FUNCTION "private"."submit_combat_order"("battle_id" "uuid", "expected_round" integer, "player_order" "text", "request_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."submit_combat_order"("battle_id" "uuid", "expected_round" integer, "player_order" "text", "request_id" "uuid") TO "authenticated";


REVOKE ALL ON FUNCTION "private"."sync_character_profile"() FROM PUBLIC;


REVOKE ALL ON FUNCTION "private"."sync_harbor_player"() FROM PUBLIC;


REVOKE ALL ON FUNCTION "private"."sync_hospital_patient"() FROM PUBLIC;


REVOKE ALL ON FUNCTION "private"."sync_skill_progress"() FROM PUBLIC;


REVOKE ALL ON FUNCTION "private"."track_character_action"() FROM PUBLIC;


REVOKE ALL ON FUNCTION "private"."track_item_circulation"() FROM PUBLIC;


REVOKE ALL ON FUNCTION "private"."track_item_market_totals"() FROM PUBLIC;


REVOKE ALL ON FUNCTION "private"."track_player_statistics"() FROM PUBLIC;


REVOKE ALL ON FUNCTION "private"."training_action"("action" "text", "payload" "jsonb", "request_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."training_action"("action" "text", "payload" "jsonb", "request_id" "uuid") TO "authenticated";


REVOKE ALL ON FUNCTION "private"."training_gain"("stat_value" numeric, "efficiency" numeric, "energy_amount" integer) FROM PUBLIC;


REVOKE ALL ON FUNCTION "private"."training_state"("captain_id" "uuid") FROM PUBLIC;


REVOKE ALL ON FUNCTION "private"."transfer_gold"("direction" "text", "amount" numeric, "request_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."transfer_gold"("direction" "text", "amount" numeric, "request_id" "uuid") TO "authenticated";


REVOKE ALL ON FUNCTION "private"."trash_inventory_item"("entry_id" "uuid", "entry_type" "text", "quantity" numeric, "request_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."trash_inventory_item"("entry_id" "uuid", "entry_type" "text", "quantity" numeric, "request_id" "uuid") TO "authenticated";


REVOKE ALL ON FUNCTION "private"."update_mail"("mail_ids" bigint[], "operation" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."update_mail"("mail_ids" bigint[], "operation" "text") TO "authenticated";


REVOKE ALL ON FUNCTION "private"."validate_character_name"() FROM PUBLIC;


REVOKE ALL ON FUNCTION "private"."visible_combatant"("snapshot" "jsonb", "own" boolean, "revealed" boolean) FROM PUBLIC;


REVOKE ALL ON FUNCTION "public"."admin_catalog"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_catalog"() TO "authenticated";


REVOKE ALL ON FUNCTION "public"."admin_economy"("period" "text", "item_search" "text", "item_page" integer, "item_sort" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_economy"("period" "text", "item_search" "text", "item_page" integer, "item_sort" "text") TO "authenticated";


REVOKE ALL ON FUNCTION "public"."admin_get_loot_table"("target_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_get_loot_table"("target_id" "text") TO "authenticated";


REVOKE ALL ON FUNCTION "public"."admin_mutate"("action" "text", "payload" "jsonb", "request_id" "uuid", "reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_mutate"("action" "text", "payload" "jsonb", "request_id" "uuid", "reason" "text") TO "authenticated";


REVOKE ALL ON FUNCTION "public"."admin_overview"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_overview"() TO "authenticated";


REVOKE ALL ON FUNCTION "public"."admin_player_statistics"("period" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_player_statistics"("period" "text") TO "authenticated";


REVOKE ALL ON FUNCTION "public"."admin_players"("search_term" "text", "requested_page" integer, "sort_by" "text", "activity" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_players"("search_term" "text", "requested_page" integer, "sort_by" "text", "activity" "text") TO "authenticated";


REVOKE ALL ON FUNCTION "public"."admin_read"("resource" "text", "search_term" "text", "requested_page" integer, "filters" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_read"("resource" "text", "search_term" "text", "requested_page" integer, "filters" "jsonb") TO "authenticated";


REVOKE ALL ON FUNCTION "public"."buy_market_listing"("listing_id" "uuid", "quantity" numeric, "expected_unit_price" numeric, "request_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."buy_market_listing"("listing_id" "uuid", "quantity" numeric, "expected_unit_price" numeric, "request_id" "uuid") TO "authenticated";


REVOKE ALL ON FUNCTION "public"."buy_tavern_meal"("expected_gold_cost" numeric, "expected_morale_gain" numeric, "request_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."buy_tavern_meal"("expected_gold_cost" numeric, "expected_morale_gain" numeric, "request_id" "uuid") TO "authenticated";


REVOKE ALL ON FUNCTION "public"."cancel_market_listing"("listing_id" "uuid", "request_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cancel_market_listing"("listing_id" "uuid", "request_id" "uuid") TO "authenticated";


REVOKE ALL ON FUNCTION "public"."choose_sea_route"("expected_version" "uuid", "option_id" "uuid", "request_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."choose_sea_route"("expected_version" "uuid", "option_id" "uuid", "request_id" "uuid") TO "authenticated";


REVOKE ALL ON FUNCTION "public"."craft_item"("recipe_id" "text", "expected_version" "text", "request_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."craft_item"("recipe_id" "text", "expected_version" "text", "request_id" "uuid") TO "authenticated";


REVOKE ALL ON FUNCTION "public"."create_market_listings"("entries" "jsonb", "request_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_market_listings"("entries" "jsonb", "request_id" "uuid") TO "authenticated";


REVOKE ALL ON FUNCTION "public"."depart_harbor"("expected_version" "uuid", "request_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."depart_harbor"("expected_version" "uuid", "request_id" "uuid") TO "authenticated";


REVOKE ALL ON FUNCTION "public"."get_attack_lock"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_attack_lock"() TO "authenticated";


REVOKE ALL ON FUNCTION "public"."get_character_status"("target_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_character_status"("target_id" "uuid") TO "authenticated";


REVOKE ALL ON FUNCTION "public"."get_combat"("battle_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_combat"("battle_id" "uuid") TO "authenticated";


REVOKE ALL ON FUNCTION "public"."get_combat_log"("battle_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_combat_log"("battle_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_combat_log"("battle_id" "uuid") TO "authenticated";


REVOKE ALL ON FUNCTION "public"."get_combat_preview"("target_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_combat_preview"("target_id" "uuid") TO "authenticated";


REVOKE ALL ON FUNCTION "public"."get_game_state"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_game_state"() TO "authenticated";


REVOKE ALL ON FUNCTION "public"."get_gameplay_revision"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_gameplay_revision"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_gameplay_revision"() TO "authenticated";


REVOKE ALL ON FUNCTION "public"."get_hospital_status"("target_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_hospital_status"("target_id" "uuid") TO "authenticated";


REVOKE ALL ON FUNCTION "public"."get_item_circulation"("target_item" "text", "period" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_item_circulation"("target_item" "text", "period" "text") TO "authenticated";


REVOKE ALL ON FUNCTION "public"."get_item_market_value"("target_item" "text", "period" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_item_market_value"("target_item" "text", "period" "text") TO "authenticated";


REVOKE ALL ON FUNCTION "public"."get_mail"("mail_id" bigint, "include_history" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_mail"("mail_id" bigint, "include_history" boolean) TO "authenticated";


REVOKE ALL ON FUNCTION "public"."get_mail_ignored"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_mail_ignored"() TO "authenticated";


REVOKE ALL ON FUNCTION "public"."get_mail_summary"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_mail_summary"() TO "authenticated";


REVOKE ALL ON FUNCTION "public"."get_mailbox"("folder" "text", "query" "text", "page" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_mailbox"("folder" "text", "query" "text", "page" integer) TO "authenticated";


REVOKE ALL ON FUNCTION "public"."get_message_conversation"("target_player_number" bigint, "before_id" bigint) FROM PUBLIC;


REVOKE ALL ON FUNCTION "public"."get_message_inbox"("before_id" bigint) FROM PUBLIC;


REVOKE ALL ON FUNCTION "public"."get_message_summary"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_message_summary"() TO "authenticated";


REVOKE ALL ON FUNCTION "public"."get_navigation_lock"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_navigation_lock"() TO "authenticated";


REVOKE ALL ON FUNCTION "public"."get_notification_summary"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_notification_summary"() TO "authenticated";


REVOKE ALL ON FUNCTION "public"."get_notifications"("before_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_notifications"("before_id" bigint) TO "authenticated";


REVOKE ALL ON FUNCTION "public"."get_own_skills"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_own_skills"() TO "authenticated";


REVOKE ALL ON FUNCTION "public"."get_player_context"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_player_context"() TO "authenticated";


REVOKE ALL ON FUNCTION "public"."get_player_snapshot"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_player_snapshot"() TO "authenticated";


REVOKE ALL ON FUNCTION "public"."get_sea_scout"("requested_page" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_sea_scout"("requested_page" integer) TO "authenticated";


REVOKE ALL ON FUNCTION "public"."is_admin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";


REVOKE ALL ON FUNCTION "public"."is_character_name_available"("candidate" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_character_name_available"("candidate" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_character_name_available"("candidate" "text") TO "authenticated";


REVOKE ALL ON FUNCTION "public"."list_crafting_recipes"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_crafting_recipes"() TO "authenticated";


REVOKE ALL ON FUNCTION "public"."list_harbor_players"("requested_page" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_harbor_players"("requested_page" integer) TO "authenticated";


REVOKE ALL ON FUNCTION "public"."list_hospital_patients"("requested_page" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_hospital_patients"("requested_page" integer) TO "authenticated";


REVOKE ALL ON FUNCTION "public"."list_inventory"("category_id" "text", "search_term" "text", "requested_page" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_inventory"("category_id" "text", "search_term" "text", "requested_page" integer) TO "authenticated";


REVOKE ALL ON FUNCTION "public"."list_market_inventory"("category_id" "text", "search_term" "text", "requested_page" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_market_inventory"("category_id" "text", "search_term" "text", "requested_page" integer) TO "authenticated";


REVOKE ALL ON FUNCTION "public"."list_market_items"("category_id" "text", "search_term" "text", "requested_page" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_market_items"("category_id" "text", "search_term" "text", "requested_page" integer) TO "authenticated";


REVOKE ALL ON FUNCTION "public"."list_market_listings"("target_item" "text", "own_only" boolean, "requested_page" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_market_listings"("target_item" "text", "own_only" boolean, "requested_page" integer) TO "authenticated";


REVOKE ALL ON FUNCTION "public"."mark_all_notifications_read"("through_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_all_notifications_read"("through_id" bigint) TO "authenticated";


REVOKE ALL ON FUNCTION "public"."mark_messages_read"("target_player_number" bigint, "through_id" bigint) FROM PUBLIC;


REVOKE ALL ON FUNCTION "public"."mark_notification_read"("notification_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_notification_read"("notification_id" bigint) TO "authenticated";


REVOKE ALL ON FUNCTION "public"."perform_activity"("activity_id" "text", "expected_stamina_cost" numeric, "expected_xp_gain" numeric, "request_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."perform_activity"("activity_id" "text", "expected_stamina_cost" numeric, "expected_xp_gain" numeric, "request_id" "uuid") TO "authenticated";


REVOKE ALL ON FUNCTION "public"."purchase_training_tier"("training_group" "text", "tier_id" "text", "request_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."purchase_training_tier"("training_group" "text", "tier_id" "text", "request_id" "uuid") TO "authenticated";


REVOKE ALL ON FUNCTION "public"."record_player_activity"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_player_activity"() TO "authenticated";


REVOKE ALL ON FUNCTION "public"."record_player_presence"("tab_id" "uuid", "is_active" boolean, "page_action" boolean, "closed" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_player_presence"("tab_id" "uuid", "is_active" boolean, "page_action" boolean, "closed" boolean) TO "authenticated";


REVOKE ALL ON FUNCTION "public"."return_to_harbor"("expected_version" "uuid", "request_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."return_to_harbor"("expected_version" "uuid", "request_id" "uuid") TO "authenticated";


REVOKE ALL ON FUNCTION "public"."save_defence_orders"("preset" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_defence_orders"("preset" "text") TO "authenticated";


REVOKE ALL ON FUNCTION "public"."scout_nearby_ships"("expected_version" "uuid", "request_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."scout_nearby_ships"("expected_version" "uuid", "request_id" "uuid") TO "authenticated";


REVOKE ALL ON FUNCTION "public"."search_players"("search_term" "text", "requested_page" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."search_players"("search_term" "text", "requested_page" integer) TO "authenticated";


REVOKE ALL ON FUNCTION "public"."send_mail"("target_numbers" bigint[], "mail_subject" "text", "mail_body" "text", "request_id" "uuid", "reply_to_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."send_mail"("target_numbers" bigint[], "mail_subject" "text", "mail_body" "text", "request_id" "uuid", "reply_to_id" bigint) TO "authenticated";


REVOKE ALL ON FUNCTION "public"."send_player_message"("target_player_number" bigint, "message_body" "text", "request_id" "uuid") FROM PUBLIC;


REVOKE ALL ON FUNCTION "public"."set_mail_ignored"("target_player_number" bigint, "ignored" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_mail_ignored"("target_player_number" bigint, "ignored" boolean) TO "authenticated";


REVOKE ALL ON FUNCTION "public"."start_combat"("target_id" "uuid", "request_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."start_combat"("target_id" "uuid", "request_id" "uuid") TO "authenticated";


REVOKE ALL ON FUNCTION "public"."start_ship_upgrade"("stat" "text", "energy_amount" integer, "expected_workshop_id" "text", "request_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."start_ship_upgrade"("stat" "text", "energy_amount" integer, "expected_workshop_id" "text", "request_id" "uuid") TO "authenticated";


REVOKE ALL ON FUNCTION "public"."submit_combat_order"("battle_id" "uuid", "expected_round" integer, "player_order" "text", "request_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."submit_combat_order"("battle_id" "uuid", "expected_round" integer, "player_order" "text", "request_id" "uuid") TO "authenticated";


REVOKE ALL ON FUNCTION "public"."train_crew"("stat" "text", "expected_tier_id" "text", "request_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."train_crew"("stat" "text", "expected_tier_id" "text", "request_id" "uuid") TO "authenticated";


REVOKE ALL ON FUNCTION "public"."transfer_gold"("direction" "text", "amount" numeric, "request_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."transfer_gold"("direction" "text", "amount" numeric, "request_id" "uuid") TO "authenticated";


REVOKE ALL ON FUNCTION "public"."trash_inventory_item"("entry_id" "uuid", "entry_type" "text", "quantity" numeric, "request_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trash_inventory_item"("entry_id" "uuid", "entry_type" "text", "quantity" numeric, "request_id" "uuid") TO "authenticated";


REVOKE ALL ON FUNCTION "public"."update_mail"("mail_ids" bigint[], "operation" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_mail"("mail_ids" bigint[], "operation" "text") TO "authenticated";


GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."character_profiles" TO "service_role";
GRANT SELECT ON TABLE "public"."character_profiles" TO "authenticated";


GRANT UPDATE ON SEQUENCE "public"."characters_player_number_seq" TO "service_role";


GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."harbor_players" TO "service_role";
GRANT SELECT ON TABLE "public"."harbor_players" TO "authenticated";


GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."hospital_patients" TO "service_role";
GRANT SELECT ON TABLE "public"."hospital_patients" TO "authenticated";


GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."market_item_events" TO "service_role";
GRANT SELECT ON TABLE "public"."market_item_events" TO "authenticated";


GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."player_game_events" TO "service_role";
GRANT SELECT ON TABLE "public"."player_game_events" TO "authenticated";


ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT UPDATE ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT UPDATE ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT UPDATE ON SEQUENCES TO "service_role";


ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";


ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "service_role";


--
-- Dumped schema changes for auth and storage
--

CREATE OR REPLACE TRIGGER "create_character_after_signup" AFTER INSERT ON "auth"."users" FOR EACH ROW EXECUTE FUNCTION "private"."create_signup_character"();


CREATE OR REPLACE TRIGGER "track_player_statistics_delete" BEFORE DELETE ON "auth"."users" FOR EACH ROW EXECUTE FUNCTION "private"."track_player_statistics"();


CREATE OR REPLACE TRIGGER "track_player_statistics_insert" AFTER INSERT ON "auth"."users" FOR EACH ROW EXECUTE FUNCTION "private"."track_player_statistics"();


CREATE OR REPLACE TRIGGER "track_player_statistics_update" AFTER UPDATE OF "last_sign_in_at", "is_anonymous", "deleted_at" ON "auth"."users" FOR EACH ROW WHEN (((("new"."last_sign_in_at" IS DISTINCT FROM "old"."last_sign_in_at") OR ("new"."is_anonymous" IS DISTINCT FROM "old"."is_anonymous")) OR ("new"."deleted_at" IS DISTINCT FROM "old"."deleted_at"))) EXECUTE FUNCTION "private"."track_player_statistics"();


CREATE POLICY "Admins upload item images" ON "storage"."objects" FOR INSERT TO "authenticated" WITH CHECK ((("bucket_id" = 'item-images'::"text") AND ( SELECT "public"."is_admin"() AS "is_admin") AND (("storage"."foldername"("name"))[1] = (( SELECT "auth"."uid"() AS "uid"))::"text") AND ("name" ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(png|jpg|webp)$'::"text")));


-- Seed rows created by the squashed data migrations and not recreated by the gameplay templates.
INSERT INTO private.admin_resources VALUES ('character_training', 'private', 'character_training', '{xp,tier_id}', false, 'Training XP and purchased tier. Tier IDs must exist in training_tiers.');
INSERT INTO private.admin_resources VALUES ('item_stacks', 'private', 'item_stacks', '{quantity}', true, 'Owned stack quantities. Use Generate items to create new holdings.');
INSERT INTO private.admin_resources VALUES ('item_instances', 'private', 'item_instances', '{damage,accuracy}', true, 'Individual equipment. Use Generate items to create new instances.');
INSERT INTO private.admin_resources VALUES ('ship_upgrade_jobs', 'private', 'ship_upgrade_jobs', '{}', false, 'Durable ship jobs. Pending jobs can be cancelled from the player page.');
INSERT INTO private.admin_resources VALUES ('combats', 'private', 'combats', '{}', false, 'Combat state and snapshots. End active combat from the player page.');
INSERT INTO private.admin_resources VALUES ('combat_participants', 'private', 'combat_participants', '{}', false, 'Combat participants and snapshots.');
INSERT INTO private.admin_resources VALUES ('combat_engagements', 'private', 'combat_engagements', '{}', false, 'Active combat locks, managed by combat operations.');
INSERT INTO private.admin_resources VALUES ('combat_rounds', 'private', 'combat_rounds', '{}', false, 'Historical combat events.');
INSERT INTO private.admin_resources VALUES ('bank_transfers', 'private', 'bank_transfers', '{}', false, 'Historical bank transfer receipts.');
INSERT INTO private.admin_resources VALUES ('training_requests', 'private', 'training_requests', '{}', false, 'Immutable training receipts.');
INSERT INTO private.admin_resources VALUES ('inventory_requests', 'private', 'inventory_requests', '{}', false, 'Immutable inventory receipts.');
INSERT INTO private.admin_resources VALUES ('item_categories', 'private', 'item_categories', '{}', false, 'Catalog managed in config/gameplay.json. Run config:sync after editing config.');
INSERT INTO private.admin_resources VALUES ('training_tiers', 'private', 'training_tiers', '{}', false, 'Catalog managed in config/gameplay.json.');
INSERT INTO private.admin_resources VALUES ('ship_work_sizes', 'private', 'ship_work_sizes', '{}', false, 'Catalog managed in config/gameplay.json.');
INSERT INTO private.admin_resources VALUES ('item_circulation', 'private', 'item_circulation', '{}', false, 'World totals maintained automatically with inventory mutations.');
INSERT INTO private.admin_resources VALUES ('item_circulation_history', 'private', 'item_circulation_history', '{}', false, 'Historical circulation changes.');
INSERT INTO private.admin_resources VALUES ('character_profiles', 'public', 'character_profiles', '{}', false, 'Public projection maintained from characters.');
INSERT INTO private.admin_resources VALUES ('harbor_players', 'public', 'harbor_players', '{}', false, 'Harbor projection maintained from characters.');
INSERT INTO private.admin_resources VALUES ('hospital_patients', 'public', 'hospital_patients', '{}', false, 'Hospital projection maintained from characters.');
INSERT INTO private.admin_resources VALUES ('player_game_events', 'public', 'player_game_events', '{}', false, 'Owner-only change notifications.');
INSERT INTO private.admin_resources VALUES ('admin_members', 'private', 'admin_members', '{}', false, 'Admin access is granted or revoked by the database owner.');
INSERT INTO private.admin_resources VALUES ('admin_audit', 'private', 'admin_audit', '{}', false, 'Immutable administrative history, newest first.');
INSERT INTO private.admin_resources VALUES ('admin_resources', 'private', 'admin_resources', '{}', false, 'Database-owned admin capabilities. No browser writes.');
INSERT INTO private.admin_resources VALUES ('characters', 'public', 'characters', '{display_name,energy,gold_coins,bank_gold_coins,ship_health,crew_health,ship_attack,ship_defense,ship_speed,ship_accuracy,crew_attack,crew_defense,crew_speed,crew_accuracy,defence_order,protected_until,hospital_started_at,hospital_until,crew_morale,stamina}', false, 'Character identity, resources, balances and stats. End active combat before editing.');
INSERT INTO private.admin_resources VALUES ('item_definitions', 'private', 'item_definitions', '{}', false, 'Create and edit in Items. Ownership type is permanent.');
INSERT INTO private.ship_work_sizes VALUES ('small', 'Small', 1, 300);
INSERT INTO private.ship_work_sizes VALUES ('medium', 'Medium', 5, 1500);
INSERT INTO private.ship_work_sizes VALUES ('large', 'Large', 10, 3000);
