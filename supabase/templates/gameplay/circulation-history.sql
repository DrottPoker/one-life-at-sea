-- Large ranges use bounded indexed lookups; stored history keeps every transaction.
create or replace function private.get_item_circulation(target_item text,period text default 'all')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  viewer_id uuid:=private.combat_captain();
  counter private.item_circulation%rowtype;
  observed timestamptz:=statement_timestamp();
  range_start timestamptz;
  initial numeric;
  point_limit integer:={{gameplay.inventory.historyMaxPoints}};
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
revoke all on function private.get_item_circulation(text,text) from public,anon,authenticated;
grant execute on function private.get_item_circulation(text,text) to authenticated;
create or replace function public.get_item_circulation(target_item text,period text default 'all')
returns jsonb language sql stable security invoker set search_path='' as $$
  select private.get_item_circulation(target_item,period);
$$;
revoke all on function public.get_item_circulation(text,text) from public,anon,authenticated;
grant execute on function public.get_item_circulation(text,text) to authenticated;
