begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
insert into auth.users(id,email,is_anonymous,raw_user_meta_data)
select ('a9700000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'integrity-'||n||'@example.test',false,
  jsonb_build_object('character_name','Integrity Fixture '||n) from generate_series(1,2) n;
create temp table owners as select row_number() over(order by user_id)::integer n,id from public.characters
 where user_id::text like 'a9700000-0000-4000-8000-%';
create temp table receipts(key text primary key,value jsonb);
grant all on owners,receipts to authenticated;
insert into private.item_stacks(character_id,item_id,quantity)
select id,item_id,10 from owners cross join(values('linen_bandages'),('oak_planks')) items(item_id) where n=1;
create temp table entries as select id,item_id from private.item_stacks where character_id=(select id from owners where n=1);
grant select on entries to authenticated;
update public.characters set gold_coins=1000,energy_updated_at=clock_timestamp()+interval '1 day' where id in(select id from owners);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a9700000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select throws_ok($$select public.create_market_listings((select jsonb_agg(jsonb_build_object(
 'entry_id',id,'entry_type','stack','quantity',case item_id when 'linen_bandages' then 1 else 11 end,'unit_price',1)) from entries),gen_random_uuid())$$,
 'P0001','NOT_ENOUGH_ITEMS','A late failure rolls back the complete listing batch');
reset role;
select is((select sum(quantity) from private.item_stacks where character_id=(select id from owners where n=1)),20::numeric,'Failed batch removes no inventory');
select is((select count(*) from private.market_listings where seller_id=(select id from owners where n=1)),0::bigint,'Failed batch leaves no escrow');
select is((select count(*) from private.market_requests where character_id=(select id from owners where n=1)),0::bigint,'Failed batch leaves no success receipt');
set local role authenticated;
insert into receipts select 'listing',public.create_market_listings(jsonb_build_array(jsonb_build_object(
 'entry_id',(select id from entries where item_id='linen_bandages'),'entry_type','stack','quantity',2,'unit_price',100)),gen_random_uuid());
reset role;
create temp table listing as select (value#>>'{listings,0,id}')::uuid id from receipts where key='listing';
grant select on listing to authenticated;

-- Failures after the escrow update must roll back the entire transaction.
insert into private.item_stacks(character_id,item_id,quantity) select id,'linen_bandages',9007199254740991 from owners where n=2;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a9700000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_ok($$select public.buy_market_listing((select id from listing),1,100,'a9710000-0000-4000-8000-000000000001')$$,
 'P0001','ITEM_QUANTITY_LIMIT','Full inventory rejects delivery after the escrow mutation');
reset role;
select is((select quantity from private.market_listings where id=(select id from listing)),2::bigint,'Failed delivery preserves all escrow stock');
select is((select sold_quantity from private.market_listings where id=(select id from listing)),0::bigint,'Failed delivery preserves sale counters');
select is((select sum(gold_coins) from public.characters where id in(select id from owners)),2000::numeric,'Failed delivery moves no money');
select is((select count(*) from private.market_sales where listing_id=(select id from listing)),0::bigint,'Failed delivery records no sale');
select is((select count(*) from private.market_requests where request_id='a9710000-0000-4000-8000-000000000001'),0::bigint,'Failed delivery records no success receipt');
update private.item_stacks set quantity=1 where character_id=(select id from owners where n=2);
update public.characters set gold_coins=9007199254740991 where id=(select id from owners where n=1);
set local role authenticated;
select throws_ok($$select public.buy_market_listing((select id from listing),1,100,gen_random_uuid())$$,
 'P0001','SELLER_BALANCE_LIMIT','Seller balance overflow cannot consume the buyer items or gold');
reset role;
select is((select gold_coins from public.characters where id=(select id from owners where n=2)),1000::bigint,'Buyer gold remains intact at seller cap');
select is((select quantity from private.market_listings where id=(select id from listing)),2::bigint,'Seller cap leaves the listing intact');

update public.characters set gold_coins=1000 where id=(select id from owners where n=1);
update private.item_stacks set quantity=9007199254740991 where character_id=(select id from owners where n=1) and item_id='linen_bandages';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a9700000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select throws_ok($$select public.cancel_market_listing((select id from listing),gen_random_uuid())$$,
 'P0001','ITEM_QUANTITY_LIMIT','Cancellation fails atomically when returned items would overflow');
reset role;
select is((select quantity from private.market_listings where id=(select id from listing)),2::bigint,'Failed cancellation retains escrow');
select is((select returned_quantity from private.market_listings where id=(select id from listing)),0::bigint,'Failed cancellation does not claim items were returned');
update private.item_stacks set quantity=8 where character_id=(select id from owners where n=1) and item_id='linen_bandages';

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a9700000-0000-4000-8000-000000000002","role":"authenticated"}',true);
insert into receipts select 'buy',public.buy_market_listing((select id from listing),1,100,'a9710000-0000-4000-8000-000000000001');
reset role;
select is((select gold_coins from public.characters where id=(select id from owners where n=1)),1095::bigint,'Successful retry credits net proceeds once');
select is((select gold_coins from public.characters where id=(select id from owners where n=2)),900::bigint,'Successful retry debits gross once');
select is((select quantity from private.item_stacks where character_id=(select id from owners where n=2) and item_id='linen_bandages'),2::bigint,'Successful retry delivers exactly once');

-- Account deletion cannot remove a completed purchase from the other inventory.
delete from auth.users where id='a9700000-0000-4000-8000-000000000001';
set local role authenticated;
select is(public.buy_market_listing((select id from listing),1,100,'a9710000-0000-4000-8000-000000000001'),
 (select value from receipts where key='buy'),'Buyer receipt remains replayable after seller deletion');
reset role;
select is((select quantity from private.item_stacks where character_id=(select id from owners where n=2) and item_id='linen_bandages'),2::bigint,'Seller deletion does not delete purchased inventory');
select is((select gold_coins from public.characters where id=(select id from owners where n=2)),900::bigint,'Replay after seller deletion cannot double-charge');
select is((select count(*) from private.market_sales where buyer_id=(select id from owners where n=2)),1::bigint,'Historical completed sale survives account deletion');
select ok(exists(select 1 from private.item_market_totals h join private.market_sales s on s.id=h.sale_id where s.buyer_id=(select id from owners where n=2)),'Value history survives seller deletion');
select * from finish();
rollback;
