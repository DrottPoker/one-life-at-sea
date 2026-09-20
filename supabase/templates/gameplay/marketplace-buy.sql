create or replace function private.buy_market_listing(listing_id uuid,quantity numeric,expected_unit_price numeric,request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  viewer uuid:=private.combat_captain(); seller uuid; previous private.market_requests%rowtype;
  listing private.market_listings%rowtype; payload jsonb; result jsonb;
  amount bigint; gross bigint; fee bigint; buyer_gold bigint; seller_gold bigint;
begin
  if listing_id is null or request_id is null then raise exception 'INVALID_REQUEST' using errcode='22023'; end if;
  if quantity is null or quantity<1 or quantity>9007199254740991 or quantity<>trunc(quantity) then raise exception 'INVALID_QUANTITY' using errcode='22023'; end if;
  if expected_unit_price is null or expected_unit_price<1 or expected_unit_price>{{gameplay.economy.maxGoldCoins}} or expected_unit_price<>trunc(expected_unit_price)
    or expected_unit_price*quantity>{{gameplay.economy.maxGoldCoins}} then raise exception 'INVALID_PRICE' using errcode='22023'; end if;
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
  if seller_gold>{{gameplay.economy.maxGoldCoins}}-(gross-fee) then raise exception 'SELLER_BALANCE_LIMIT'; end if;
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
revoke all on function private.buy_market_listing(uuid,numeric,numeric,uuid) from public,anon,authenticated;
grant execute on function private.buy_market_listing(uuid,numeric,numeric,uuid) to authenticated;
create or replace function public.buy_market_listing(listing_id uuid,quantity numeric,expected_unit_price numeric,request_id uuid)
returns jsonb language sql volatile security invoker set search_path='' as $$
  select private.buy_market_listing(listing_id,quantity,expected_unit_price,request_id);
$$;
revoke all on function public.buy_market_listing(uuid,numeric,numeric,uuid) from public,anon,authenticated;
grant execute on function public.buy_market_listing(uuid,numeric,numeric,uuid) to authenticated;
