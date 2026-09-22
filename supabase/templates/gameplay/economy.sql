-- Private aggregate observations; never backfill money supply with invented values.
create extension if not exists pg_cron;
create table if not exists private.economy_snapshots (
  observed_at timestamptz primary key,
  slot timestamptz not null unique,
  gold numeric not null check(gold>=0),
  bank_gold numeric not null check(bank_gold>=0),
  item_units numeric not null check(item_units>=0),
  item_value numeric not null check(item_value>=0),
  unpriced_units numeric not null check(unpriced_units>=0),
  players bigint not null check(players>=0)
);
alter table private.economy_snapshots enable row level security;
revoke all on private.economy_snapshots from public,anon,authenticated;
create index if not exists market_sales_economy_time_idx on private.market_sales(sold_at) include(gross,fee,quantity);

create or replace function private.economy_holdings()
returns table(character_id uuid,item_id text,inventory numeric,listed numeric)
language sql stable security invoker set search_path='' as $$
  select character_id,item_id,sum(inventory),sum(listed) from (
    select character_id,item_id,quantity::numeric inventory,0::numeric listed from private.item_stacks
    union all select character_id,item_id,1::numeric,0::numeric from private.item_instances
    union all select seller_id,item_id,0::numeric,quantity::numeric from private.market_listings where quantity>0
  ) h group by character_id,item_id;
$$;
revoke all on function private.economy_holdings() from public,anon,authenticated;

create or replace function private.economy_items(observed timestamptz)
returns table(id text,name text,image_path text,active boolean,inventory numeric,listed numeric,units numeric,unit_value numeric,last_sale timestamptz)
language sql stable security invoker set search_path='' as $$
  with holdings as (select item_id,sum(inventory) inventory,sum(listed) listed from private.economy_holdings() group by item_id)
  select d.id,d.name,d.image_path,d.active,coalesce(h.inventory,0),coalesce(h.listed,0),coalesce(h.inventory,0)+coalesce(h.listed,0),
    private.item_market_value_at(d.id,observed),
    (select sold_at from private.item_market_totals where item_id=d.id and sold_at<=observed order by sold_at desc,sale_id desc limit 1)
  from private.item_definitions d left join holdings h on h.item_id=d.id;
$$;
revoke all on function private.economy_items(timestamptz) from public,anon,authenticated;

create or replace function private.record_economy_snapshot()
returns void language sql volatile security invoker set search_path='' as $$
  insert into private.economy_snapshots(observed_at,slot,gold,bank_gold,item_units,item_value,unpriced_units,players)
  select statement_timestamp(),date_bin(interval '5 minutes',statement_timestamp(),timestamptz '2000-01-01'),
    g.gold,g.bank_gold,i.units,i.value,i.unpriced,g.players
  from (select coalesce(sum(gold_coins::numeric),0) gold,coalesce(sum(bank_gold_coins::numeric),0) bank_gold,count(*) players from public.characters) g
  cross join (select coalesce(sum(units),0) units,coalesce(sum(units*unit_value),0) value,
    coalesce(sum(units) filter(where unit_value is null),0) unpriced from private.economy_items(statement_timestamp())) i
  on conflict(slot) do nothing;
$$;
revoke all on function private.record_economy_snapshot() from public,anon,authenticated;
select private.record_economy_snapshot() where not exists(select 1 from private.economy_snapshots);
select cron.schedule('economy-snapshot','*/5 * * * *','select private.record_economy_snapshot()');

create or replace function private.admin_economy(period text default '7d',item_search text default '',item_page integer default 0,item_sort text default 'value')
returns jsonb language plpgsql volatile security definer set search_path='' as $$
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
revoke all on function private.admin_economy(text,text,integer,text) from public,anon,authenticated;
grant execute on function private.admin_economy(text,text,integer,text) to authenticated;
create or replace function public.admin_economy(period text default '7d',item_search text default '',item_page integer default 0,item_sort text default 'value')
returns jsonb language sql volatile security invoker set search_path='' as $$
  select private.admin_economy(period,item_search,item_page,item_sort);
$$;
revoke all on function public.admin_economy(text,text,integer,text) from public,anon;
grant execute on function public.admin_economy(text,text,integer,text) to authenticated;
