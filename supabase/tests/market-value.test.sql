begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
insert into auth.users(id,email,is_anonymous,raw_user_meta_data) values
('7a000000-0000-4000-8000-000000000001','value-one@example.test',false,'{"character_name":"Value One"}'),
('7a000000-0000-4000-8000-000000000002','value-anon@example.test',true,'{}');
insert into private.item_definitions(id,category_id,name,description,effect_description,image_path,kind,stackable,slot,tradable)
values ('value_material','materials','Value Material','Test.','No effect.','/images/items/timber.png','passive',true,null,true),
('value_empty','materials','Value Empty','Test.','No effect.','/images/items/timber.png','passive',true,null,true);
create temp table clock as select statement_timestamp() t;
select ok((select relrowsecurity from pg_class where oid='private.item_market_totals'::regclass),'Value projection uses RLS');
set local role anon;
select throws_ok($$select public.get_item_market_value('value_material')$$,'42501',null,'Signed-out readers denied');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"7a000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_ok($$select public.get_item_market_value('value_material')$$,'42501',null,'Anonymous accounts denied');
select set_config('request.jwt.claims','{"sub":"7a000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select throws_ok($$select * from private.item_market_totals$$,'42501',null,'Raw projection remains private');
select throws_ok($$select private.item_market_value_at('value_material',now())$$,'42501',null,'Internal arbitrary-time helper is private');
select throws_ok($$select private.track_item_market_totals()$$,'42501',null,'Tracking cannot be invoked by clients');
select throws_ok($$select public.get_item_market_value('missing')$$,'22023','ITEM_NOT_FOUND','Missing item rejected');
select throws_ok($$select public.get_item_market_value('value_material','bad')$$,'22023','INVALID_PERIOD','Invalid period rejected');
select throws_ok($$select public.get_item_market_value('value_material',null)$$,'22023','INVALID_PERIOD','Null period rejected');
select is(public.get_item_market_value('value_empty')->>'total',null,'Never traded means N/A');
select is(public.get_item_market_value('value_empty')->>'tracked_since',null,'No fabricated start date');
select is(jsonb_array_length(public.get_item_market_value('value_empty')->'points'),0,'No fabricated observations');
reset role;
insert into private.market_sales(id,item_id,quantity,unit_price,gross,fee,sold_at)
select ('7a100000-0000-4000-8000-00000000000'||n)::uuid,'value_material',q,p,q*p,7,t+make_interval(hours=>h)
from clock cross join (values(1,-26,1,50),(2,-13,8,900),(3,-11,1,100),(4,-1,9,200),(5,1,1,500)) v(n,h,q,p);
select is(private.item_market_value_at('value_material',(select t from clock)),190::numeric,'12h average is quantity-weighted and uses gross before fees');
select is(private.item_market_value_at('value_material',(select t-interval '1 hour' from clock)),190::numeric,'Upper boundary includes a sale at the observation time');
select is(private.item_market_value_at('value_material',(select t+interval '1 hour' from clock)),230::numeric,'Exact lower boundary excludes an expired sale and includes the new sale');
select is(private.item_market_value_at('value_material',(select t+interval '11 hours' from clock)),500::numeric,'Expiry changes average without a new purchase');
select is(private.item_market_value_at('value_material',(select t+interval '13 hours' from clock)),500::numeric,'Empty window retains the last nonempty rolling value');
select is(private.item_market_value_at('value_material',(select t-interval '27 hours' from clock)),null,'Future sales do not supply historical values');
select is((select quantity_total from private.item_market_totals where sale_id='7a100000-0000-4000-8000-000000000005'),20::numeric,'Bulk insertion creates cumulative totals');
insert into private.item_stacks(character_id,item_id,quantity)
select id,'value_material',3 from public.characters where user_id='7a000000-0000-4000-8000-000000000001';
set local role authenticated;
select is(public.get_item_market_value('value_material')->>'total','190','Public value excludes future and expired sales');
select is(public.list_inventory('materials')#>>'{items,0,market_value}','190','Inventory includes the current market value');
select is((select i->>'market_value' from jsonb_array_elements(public.list_market_items(null,'Value Material')->'items') i),'190','Market details receive the same value');
select is(public.list_market_inventory('materials')#>>'{items,0,market_value}','190','Sale inventory receives the same value');
select ok(not exists(select 1 from jsonb_array_elements(public.get_item_market_value('value_material')->'points') p where p->>'total' is null),'History carries the last value across intervals without trades');
select is(public.get_item_market_value('value_material')->'points'->-1->>'total','190','Current endpoint equals the current value');
select ok(not exists(select 1 from jsonb_array_elements(public.get_item_market_value('value_material')->'points') p where
  (p->>'at')::timestamptz>(public.get_item_market_value('value_material')->>'to')::timestamptz),'No future history points');
select is(public.get_item_market_value('value_material')->>'sampled','false','Small histories contain actual changes');
select ok((public.get_item_market_value('value_material')->'points'->0->>'at')::timestamptz=
  (public.get_item_market_value('value_material')->>'tracked_since')::timestamptz,'History starts at the first completed purchase');
select is((select count(*) from unnest(array['1m','3m','6m','1y','3y','all']) p
  where public.get_item_market_value('value_material',p)->>'period'=p),6::bigint,'All six periods are supported');
select ok(not (public.get_item_market_value('value_material')::text ~ '(buyer_id|seller_id|listing_id|sale_id)'),'History exposes no account or sale identities');
reset role;
savepoint rollback_sale;
insert into private.market_sales(item_id,quantity,unit_price,gross,fee,sold_at)
select 'value_material',1,10000,10000,0,t from clock;
select is(private.item_market_value_at('value_material',(select t from clock)),1081::numeric,'Whole coin average rounds down');
rollback to rollback_sale;
select is(private.item_market_value_at('value_material',(select t from clock)),190::numeric,'Rollback restores value and projection');
update private.market_sales set unit_price=300,gross=quantity*300 where id='7a100000-0000-4000-8000-000000000004';
select is(private.item_market_value_at('value_material',(select t from clock)),280::numeric,'Corrected sale rebuilds its cumulative suffix');
update private.market_sales set sold_at=(select t-interval '18 hours' from clock) where id='7a100000-0000-4000-8000-000000000004';
select is(private.item_market_value_at('value_material',(select t from clock)),100::numeric,'Backdating correctly removes an expired sale');
update private.market_sales set item_id='value_empty' where id='7a100000-0000-4000-8000-000000000003';
select is(private.item_market_value_at('value_material',(select t from clock)),900::numeric,'Moving a sale rebuilds the retained value from remaining history');
select is(private.item_market_value_at('value_empty',(select t from clock)),100::numeric,'Moved sale contributes to its new item');
delete from private.market_sales where item_id in('value_material','value_empty');
select is((select count(*) from private.item_market_totals where item_id in('value_material','value_empty')),0::bigint,'Deleting fixtures removes their complete derived history');


-- Equal-time purchases preserve their weighted value when the final cohort expires.
insert into private.market_sales(item_id,quantity,unit_price,gross,fee,sold_at)
select 'value_empty',q,p,q*p,0,t-make_interval(hours=>h) from clock
  cross join(values(14,1,50),(13,1,100),(13,9,200)) v(h,q,p);
select is(private.item_market_value_at('value_empty',(select t-interval '1 hour 1 microsecond' from clock)),190::numeric,'Latest nonempty value weights every equal-time purchase');
select is(private.item_market_value_at('value_empty',(select t-interval '1 hour' from clock)),190::numeric,'Final expiry preserves the exact previous value');
select is(private.item_market_value_at('value_empty',(select t+interval '3 years' from clock)),190::numeric,'Value persists without any reads or new purchases');
insert into private.item_stacks(character_id,item_id,quantity)
select id,'value_empty',1 from public.characters where user_id='7a000000-0000-4000-8000-000000000001';
set local role authenticated;
select is(public.get_item_market_value('value_empty')->>'total','190','Public history retains the value after twelve hours without sales');
select is(public.get_item_market_value('value_empty')->'points'->-1->>'total','190','Graph endpoint retains the same value');
select is((select i->>'market_value' from jsonb_array_elements(public.list_inventory()->'items') i where i->>'item_id'='value_empty'),'190','Inventory retains the previous value');
select is((select i->>'market_value' from jsonb_array_elements(public.list_market_items(null,'Value Empty')->'items') i),'190','Marketplace retains the previous value');
select is((select i->>'market_value' from jsonb_array_elements(public.list_market_inventory()->'items') i where i->>'item_id'='value_empty'),'190','Sale inventory retains the previous value');
reset role;
insert into private.market_sales(item_id,quantity,unit_price,gross,fee,sold_at)
select 'value_empty',2,300,600,0,t from clock;
select is(private.item_market_value_at('value_empty',(select t from clock)),300::numeric,'New purchases replace the retained value without including expired purchases');
delete from private.market_sales where item_id='value_empty';
insert into private.market_sales(item_id,quantity,unit_price,gross,fee,sold_at)
select 'value_empty',1,77,77,0,t+interval '1 day' from clock;
select is(private.item_market_value_at('value_empty',(select t from clock)),null,'Future-only sales cannot create a retained value');

insert into private.market_sales(item_id,quantity,unit_price,gross,fee,sold_at)
select 'value_material',1,p,p,0,t from clock cross join (values(9007199254740991::bigint),(9007199254740990::bigint)) v(p);
select is(private.item_market_value_at('value_material',(select t from clock)),9007199254740990::numeric,'Large cumulative gross preserves integer precision');
select is((select max(gross_total) from private.item_market_totals where item_id='value_material'),18014398509481981::numeric,'Same-timestamp sales accumulate deterministically');
update private.market_sales set buyer_id=(select id from public.characters where user_id='7a000000-0000-4000-8000-000000000001') where item_id='value_material';
create temp table before_identity as select * from private.item_market_totals where item_id='value_material';
update private.market_sales set buyer_id=null where item_id='value_material';
select results_eq('select * from private.item_market_totals where item_id=''value_material'' order by sale_id',
  'select * from before_identity order by sale_id','Identity removal does not rewrite values');
delete from private.market_sales where item_id='value_material';

insert into private.market_sales(item_id,quantity,unit_price,gross,fee,sold_at)
select 'value_material',1,n,n,0,t-interval '45 days'+n*interval '1 hour' from clock cross join generate_series(1,1100) n;
-- Some fixtures are future-dated; only observed events may contribute.
set local role authenticated;
select is(public.get_item_market_value('value_material')->>'sampled','true','Large histories use bounded sampling');
select ok(jsonb_array_length(public.get_item_market_value('value_material')->'points')<=502,'Response is bounded by configured samples plus endpoints');
select ok((public.get_item_market_value('value_material','1m')->>'from')::timestamptz>
  (public.get_item_market_value('value_material')->>'from')::timestamptz,'Period restricts the displayed time range');
select is(public.get_item_market_value('value_empty')->>'total',null,'Other items remain independent');
select * from finish();
rollback;
