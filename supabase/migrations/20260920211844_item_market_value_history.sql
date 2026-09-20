begin;
-- Backfill and trigger installation are atomic with respect to purchases.
lock table private.market_sales in share row exclusive mode;
create index market_sales_item_timeline_idx on private.market_sales(item_id,sold_at,id) include(quantity,gross);
create table private.item_market_totals (
  sale_id uuid primary key,
  item_id text not null references private.item_definitions(id),
  sold_at timestamptz not null,
  quantity_total numeric(40,0) not null check(quantity_total>0),
  gross_total numeric(50,0) not null check(gross_total>0)
);
create index item_market_totals_timeline_idx on private.item_market_totals(item_id,sold_at desc,sale_id desc)
  include(quantity_total,gross_total);
alter table private.item_market_totals enable row level security;
revoke all on private.item_market_totals from public,anon,authenticated;
insert into private.item_market_totals(sale_id,item_id,sold_at,quantity_total,gross_total)
  select id,item_id,sold_at,
    sum(quantity) over(partition by item_id order by sold_at,id rows unbounded preceding),
    sum(gross) over(partition by item_id order by sold_at,id rows unbounded preceding)
  from private.market_sales;
-- Rebuild only the changed suffix; normal purchases append one indexed row.
create or replace function private.track_item_market_totals()
returns trigger language plpgsql security definer set search_path='' as $$
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
  for affected in select item_id,min(sold_at) since
    from jsonb_to_recordset(coalesce(changes,'[]'::jsonb)) as c(item_id text,sold_at timestamptz)
    group by item_id order by item_id
  loop
    -- Purchases already hold this lock after character and listing locks.
    perform 1 from private.item_circulation where item_id=affected.item_id for update;
    select quantity_total,gross_total into baseline_quantity,baseline_gross
      from private.item_market_totals where item_id=affected.item_id and sold_at<affected.since
      order by sold_at desc,sale_id desc limit 1;
    delete from private.item_market_totals where item_id=affected.item_id and sold_at>=affected.since;
    insert into private.item_market_totals(sale_id,item_id,sold_at,quantity_total,gross_total)
      select id,item_id,sold_at,
        coalesce(baseline_quantity,0)+sum(quantity) over(order by sold_at,id rows unbounded preceding),
        coalesce(baseline_gross,0)+sum(gross) over(order by sold_at,id rows unbounded preceding)
      from private.market_sales where item_id=affected.item_id and sold_at>=affected.since;
  end loop;
  return null;
end;
$$;
revoke all on function private.track_item_market_totals() from public,anon,authenticated;
drop trigger if exists market_value_insert on private.market_sales;
drop trigger if exists market_value_update on private.market_sales;
drop trigger if exists market_value_delete on private.market_sales;
create trigger market_value_insert after insert on private.market_sales
  referencing new table as new_sales for each statement execute function private.track_item_market_totals();
create trigger market_value_update after update on private.market_sales
  referencing old table as old_sales new table as new_sales for each statement execute function private.track_item_market_totals();
create trigger market_value_delete after delete on private.market_sales
  referencing old table as old_sales for each statement execute function private.track_item_market_totals();

commit;
