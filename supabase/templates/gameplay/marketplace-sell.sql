create or replace function private.create_market_listings(entries jsonb,request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  viewer uuid:=private.combat_captain(); previous private.market_requests%rowtype;
  stack private.item_stacks%rowtype; instance private.item_instances%rowtype; definition private.item_definitions%rowtype;
  entry record; payload jsonb; result jsonb; created jsonb:='[]'::jsonb; listing_id uuid; amount bigint; price bigint; original_created timestamptz;
begin
  if request_id is null or entries is null or jsonb_typeof(entries)<>'array' then raise exception 'INVALID_REQUEST' using errcode='22023'; end if;
  if jsonb_array_length(entries)<1 or jsonb_array_length(entries)>{{gameplay.marketplace.maxBatchSize}} then raise exception 'INVALID_BATCH' using errcode='22023'; end if;
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
    where unit_price<1 or unit_price>{{gameplay.economy.maxGoldCoins}} or unit_price<>trunc(unit_price)
      or unit_price*quantity>{{gameplay.economy.maxGoldCoins}}) then raise exception 'INVALID_PRICE' using errcode='22023'; end if;
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
      values(viewer,entry.item_id,entry.entry_type,entry.entry_id,amount,amount,price,{{gameplay.marketplace.feeBps}},
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
$$;
revoke all on function private.create_market_listings(jsonb,uuid) from public,anon,authenticated;
grant execute on function private.create_market_listings(jsonb,uuid) to authenticated;
create or replace function public.create_market_listings(entries jsonb,request_id uuid)
returns jsonb language sql volatile security invoker set search_path='' as $$
  select private.create_market_listings(entries,request_id);
$$;
revoke all on function public.create_market_listings(jsonb,uuid) from public,anon,authenticated;
grant execute on function public.create_market_listings(jsonb,uuid) to authenticated;

create or replace function private.cancel_market_listing(listing_id uuid,request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
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
revoke all on function private.cancel_market_listing(uuid,uuid) from public,anon,authenticated;
grant execute on function private.cancel_market_listing(uuid,uuid) to authenticated;
create or replace function public.cancel_market_listing(listing_id uuid,request_id uuid)
returns jsonb language sql volatile security invoker set search_path='' as $$
  select private.cancel_market_listing(listing_id,request_id);
$$;
revoke all on function public.cancel_market_listing(uuid,uuid) from public,anon,authenticated;
grant execute on function public.cancel_market_listing(uuid,uuid) to authenticated;
