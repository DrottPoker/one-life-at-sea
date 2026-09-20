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
