-- Keep the last nonempty rolling average when the window has no purchases.
create or replace function private.item_market_value_at(target_item text,observed timestamptz)
returns numeric language sql stable security invoker set search_path='' as $$
  select floor((a.gross_total-coalesce(b.gross_total,0))/nullif(a.quantity_total-coalesce(b.quantity_total,0),0))
  from (
    select quantity_total,gross_total,sold_at from private.item_market_totals
      where item_id=target_item and sold_at<=observed order by sold_at desc,sale_id desc limit 1
  ) a left join lateral (
    select quantity_total,gross_total from private.item_market_totals
      where item_id=target_item and sold_at<=observed-make_interval(hours=>{{gameplay.marketplace.valueWindowHours}})
        and sold_at<a.sold_at
      order by sold_at desc,sale_id desc limit 1
  ) b on true;
$$;
revoke all on function private.item_market_value_at(text,timestamptz) from public,anon,authenticated;

create or replace function private.get_item_market_value(target_item text,period text default 'all')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  observed timestamptz:=statement_timestamp();
  tracked timestamptz;
  range_start timestamptz;
  window_length interval:=make_interval(hours=>{{gameplay.marketplace.valueWindowHours}});
  point_limit integer:={{gameplay.inventory.historyMaxPoints}};
  events timestamptz[];
  sampled boolean:=false;
  points jsonb:='[]'::jsonb;
begin
  perform private.combat_captain();
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
revoke all on function private.get_item_market_value(text,text) from public,anon,authenticated;
grant execute on function private.get_item_market_value(text,text) to authenticated;
create or replace function public.get_item_market_value(target_item text,period text default 'all')
returns jsonb language sql stable security invoker set search_path='' as $$
  select private.get_item_market_value(target_item,period);
$$;
revoke all on function public.get_item_market_value(text,text) from public,anon,authenticated;
grant execute on function public.get_item_market_value(text,text) to authenticated;
