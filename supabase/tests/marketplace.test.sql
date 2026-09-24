begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();

select ok((select bool_and(relrowsecurity) from pg_class where oid in('private.market_listings'::regclass,'private.market_sales'::regclass,'private.market_requests'::regclass,'public.market_item_events'::regclass)),'Market tables use RLS');
select ok(not has_table_privilege('authenticated','private.market_listings','select'),'Private stock cannot be read directly');
select ok(not has_table_privilege('authenticated','private.market_sales','insert'),'Clients cannot fabricate sales');
select ok(not has_function_privilege('anon','public.buy_market_listing(uuid,numeric,numeric,uuid)','execute'),'Anonymous purchase is denied');
select ok(not has_function_privilege('authenticated','private.receive_market_item(private.market_listings,uuid,bigint)','execute'),'Internal item transfer is not exposed');

-- Catalog fixtures are visible only inside this rolled-back test transaction.
insert into private.item_categories(id,name,position)
 select 'market_test_'||id,'Market Fixture '||name,position from private.item_categories
 where id in('medical','materials','crew_weapons');
insert into private.item_definitions(id,category_id,name,description,effect_description,image_path,kind,stackable,slot,active,tradable,
  damage_min,damage_max,precision_min,precision_max)
 select 'market_test_'||id,'market_test_'||category_id,'Market Fixture '||name,description,effect_description,image_path,kind,stackable,slot,true,true,
  damage_min,damage_max,precision_min,precision_max
 from private.item_definitions where id in('linen_bandages','oak_planks','cutlass');
update private.item_definitions set damage_min=12,damage_max=15,precision_min=48,precision_max=56 where id='market_test_cutlass';

insert into auth.users(id,email,is_anonymous,raw_user_meta_data)
select ('a8600000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'market-'||n||'@example.test',false,
  jsonb_build_object('character_name','MarketFixture'||chr(65+n)) from generate_series(1,3) n;
create temp table f as select row_number() over(order by user_id)::integer n,id,user_id,gen_random_uuid() request_id
 from public.characters where user_id::text like 'a8600000-0000-4000-8000-%';
create temp table results(key text primary key,value jsonb);
grant all on f,results to authenticated;
update public.characters set gold_coins=1000,bank_gold_coins=500,energy_updated_at=clock_timestamp()+interval '1 day' where id in(select id from f where n>1);
insert into private.item_stacks(character_id,item_id,quantity)
 select id,item_id,qty from f cross join(values('market_test_linen_bandages',40),('market_test_oak_planks',20)) v(item_id,qty) where n=1;
insert into private.item_instances(id,character_id,item_id,quality)
 select 'a8600000-0000-4000-8000-000000000100',id,'market_test_cutlass',44.5 from f where n=1;
create temp table owned as select id,entry_type,item_id from (
 select id,'stack'::text entry_type,item_id from private.item_stacks where character_id=(select id from f where n=1)
 union all select id,'instance',item_id from private.item_instances where character_id=(select id from f where n=1)) o;
create temp table original_circulation as select item_id,total from private.item_circulation where item_id like 'market_test_%';
grant select on owned,original_circulation to authenticated;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a8600000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is(public.list_market_inventory()->>'total','3','Seller can choose all sellable inventory entries');
select throws_ok($$select public.create_market_listings('[]',gen_random_uuid())$$,'22023','INVALID_BATCH','Empty batch rejected');
select throws_ok($$select public.create_market_listings('[{"entry_id":"bad","entry_type":"stack","quantity":1,"unit_price":1}]',gen_random_uuid())$$,'22023','INVALID_REQUEST','Malformed item rejected');
select throws_ok($$select public.create_market_listings(jsonb_build_array(jsonb_build_object('entry_id',id,'entry_type',entry_type,'quantity',1.5,'unit_price',1)),gen_random_uuid()) from owned limit 1$$,'22023','INVALID_QUANTITY','Fractional quantity rejected');
select throws_ok($$select public.create_market_listings(jsonb_build_array(jsonb_build_object('entry_id',id,'entry_type',entry_type,'quantity',1,'unit_price',1.5)),gen_random_uuid()) from owned limit 1$$,'22023','INVALID_PRICE','Fractional price rejected');
select throws_ok($$select public.create_market_listings(jsonb_build_array(jsonb_build_object('entry_id',id,'entry_type',entry_type,'quantity',1,'unit_price',0)),gen_random_uuid()) from owned limit 1$$,'22023','INVALID_PRICE','Free listing rejected');
select throws_ok($$select public.create_market_listings(jsonb_build_array(jsonb_build_object('entry_id',id,'entry_type',entry_type,'quantity',2,'unit_price',9007199254740991)),gen_random_uuid()) from owned where entry_type='stack' limit 1$$,'22023','INVALID_PRICE','Unsafe multiplication rejected');
select throws_ok($$select public.create_market_listings(jsonb_build_array(jsonb_build_object('entry_id',id,'entry_type',entry_type,'quantity',1,'unit_price',1),jsonb_build_object('entry_id',upper(id::text),'entry_type',entry_type,'quantity',1,'unit_price',1)),gen_random_uuid()) from owned limit 1$$,'22023','DUPLICATE_ITEM','Duplicate entries are canonicalized');
select throws_ok($$select public.create_market_listings(jsonb_build_array(jsonb_build_object('entry_id',id,'entry_type',entry_type,'quantity',41,'unit_price',1)),gen_random_uuid()) from owned where item_id='market_test_linen_bandages'$$,'P0001','NOT_ENOUGH_ITEMS','Stock cannot be oversold');
insert into results select 'create',public.create_market_listings((select jsonb_agg(jsonb_build_object('entry_id',id,'entry_type',entry_type,
 'quantity',case item_id when 'market_test_linen_bandages' then 40 when 'market_test_oak_planks' then 10 else 1 end,'unit_price',case item_id when 'market_test_linen_bandages' then 1 when 'market_test_oak_planks' then 2 else 101 end)) from owned),(select request_id from f where n=1));
select is(jsonb_array_length((select value->'listings' from results where key='create')),3,'Batch creates every requested listing');
select is(public.list_market_inventory()->>'total','1','Escrow leaves only unlisted inventory');
select is(public.list_inventory()#>>'{items,0,quantity}','10','Unlisted stack remainder is preserved');
select is(public.list_market_listings(null,true)->>'total','3','Owner lists own active offers');
select is(public.create_market_listings((select jsonb_agg(jsonb_build_object('entry_id',id,'entry_type',entry_type,
 'quantity',case item_id when 'market_test_linen_bandages' then 40 when 'market_test_oak_planks' then 10 else 1 end,'unit_price',case item_id when 'market_test_linen_bandages' then 1 when 'market_test_oak_planks' then 2 else 101 end)) from owned),(select request_id from f where n=1)),
 (select value from results where key='create'),'Batch retry returns its original receipt after items leave inventory');
reset role;
create temp table listings as select id,item_id from private.market_listings where seller_id=(select id from f where n=1);
grant select on listings to authenticated;
select ok(not exists(select 1 from original_circulation o join private.item_circulation c using(item_id) where c.total<>o.total),'Escrow conserves circulation');

set local role authenticated;
select throws_ok($$select public.buy_market_listing((select id from listings where item_id='market_test_linen_bandages'),1,1,gen_random_uuid())$$,'P0001','OWN_LISTING','Self-purchase rejected');
select set_config('request.jwt.claims','{"sub":"a8600000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is(public.list_market_listings(null,true)->>'total','0','Own listings never includes another owner');
select throws_ok($$select public.cancel_market_listing((select id from listings limit 1),gen_random_uuid())$$,'P0001','LISTING_UNAVAILABLE','Cannot cancel another player offer');
select throws_ok($$select public.create_market_listings(jsonb_build_array(jsonb_build_object('entry_id',id,'entry_type',entry_type,'quantity',1,'unit_price',1)),gen_random_uuid()) from owned where item_id='market_test_oak_planks'$$,'P0001','ITEM_NOT_FOUND','Cannot list another player inventory');
select throws_ok($$select public.buy_market_listing((select id from listings where item_id='market_test_linen_bandages'),1.1,1,gen_random_uuid())$$,'22023','INVALID_QUANTITY','Fractional purchase rejected');
select throws_ok($$select public.buy_market_listing((select id from listings where item_id='market_test_linen_bandages'),41,1,gen_random_uuid())$$,'P0001','NOT_ENOUGH_STOCK','Purchase cannot exceed listed stock');
select throws_ok($$select public.buy_market_listing((select id from listings where item_id='market_test_linen_bandages'),1,2,gen_random_uuid())$$,'P0001','PRICE_CHANGED','Quoted price checked again');
insert into results select 'buy19',public.buy_market_listing((select id from listings where item_id='market_test_linen_bandages'),19,1,(select request_id from f where n=2));
select is((select value->>'fee' from results where key='buy19'),'0','First nineteen one-coin units incur no rounded fee');
select is(public.buy_market_listing((select id from listings where item_id='market_test_linen_bandages'),19,1,(select request_id from f where n=2)),
 (select value from results where key='buy19'),'Purchase replay cannot double-charge');
select throws_ok($$select public.buy_market_listing((select id from listings where item_id='market_test_linen_bandages'),18,1,(select request_id from f where n=2))$$,'22023','REQUEST_CONFLICT','Changed purchase retry rejected');
insert into results select 'buy1',public.buy_market_listing((select id from listings where item_id='market_test_linen_bandages'),1,1,gen_random_uuid());
select is((select value->>'fee' from results where key='buy1'),'1','Twentieth unit pays the cumulative fee');
select is(public.get_game_state()->>'gold_coins','980','Buyer charged exact gross');
select is(public.get_game_state()->>'bank_gold_coins','500','Bank balance untouched');
select is(public.list_inventory()#>>'{items,0,quantity}','20','Buyer receives and merges stack purchases');
reset role;
select is((select gold_coins from public.characters where id=(select id from f where n=1)),19::bigint,'Seller gets proceeds after integer fee');
select is((select fee_paid from private.market_listings where id=(select id from listings where item_id='market_test_linen_bandages')),1::bigint,'Splitting buys does not avoid the listing fee');
select is((select count(*)::integer from private.market_sales where listing_id=(select id from listings where item_id='market_test_linen_bandages')),2,'Retry creates no duplicate sales');
select ok(not exists(select 1 from original_circulation o join private.item_circulation c using(item_id) where c.total<>o.total),'Purchasing conserves world item count');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a8600000-0000-4000-8000-000000000001","role":"authenticated"}',true);
insert into results select 'cancel',public.cancel_market_listing((select id from listings where item_id='market_test_linen_bandages'),(select request_id from f where n=3));
select is(public.cancel_market_listing((select id from listings where item_id='market_test_linen_bandages'),(select request_id from f where n=3)),
 (select value from results where key='cancel'),'Cancel retry returns items only once');
select is((select i->>'quantity' from jsonb_array_elements(public.list_inventory()->'items') i where i->>'item_id'='market_test_linen_bandages'),'20','Only unsold units return');
select is(public.list_market_listings('market_test_linen_bandages')->>'total','0','Closed listing disappears from offers');
select set_config('request.jwt.claims','{"sub":"a8600000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_ok($$select public.buy_market_listing((select id from listings where item_id='market_test_linen_bandages'),1,1,gen_random_uuid())$$,'P0001','LISTING_UNAVAILABLE','Cancelled offer cannot be bought');
select public.buy_market_listing((select id from listings where item_id='market_test_cutlass'),1,101,gen_random_uuid());
select is((select i->'stats' from jsonb_array_elements(public.list_inventory()->'items') i where i->>'item_id'='market_test_cutlass'),'{"quality":44.5,"damage":13.34,"precision":51.56}'::jsonb,'Equipment Quality and stats survive trade');
select is((select i->>'id' from jsonb_array_elements(public.list_inventory()->'items') i where i->>'item_id'='market_test_cutlass'),'a8600000-0000-4000-8000-000000000100','Equipment keeps its original identity');
select throws_ok($$select public.buy_market_listing((select id from listings where item_id='market_test_cutlass'),1,101,gen_random_uuid())$$,'P0001','LISTING_UNAVAILABLE','Unique equipment cannot sell twice');
select public.buy_market_listing((select id from listings where item_id='market_test_oak_planks'),5,2,gen_random_uuid());
select is(public.list_market_items(null,'Market Fixture ')#>>'{items,0,item_id}','market_test_linen_bandages','Most Popular orders by units, not sale transactions');
reset role;
update private.market_sales set sold_at=clock_timestamp()-interval '12 hours 1 second' where item_id='market_test_linen_bandages' and quantity=19;
set local role authenticated;
select is(public.list_market_items(null,'Market Fixture ')#>>'{items,0,item_id}','market_test_oak_planks','Sales older than twelve hours leave the ranking');
select is((select i->>'sold' from jsonb_array_elements(public.list_market_items(null,'Market Fixture ')->'items') i where i->>'item_id'='market_test_linen_bandages'),'1','Only completed units inside the rolling window count');
select is(public.list_market_items('market_test_materials')#>>'{items,0,minimum_price}','2','Category exposes cheapest live unit price');
select is(public.list_market_items(null,'%')->>'total','0','Search wildcard characters are literal');
select throws_ok($$select public.list_market_items('unknown')$$,'22023','INVALID_CATEGORY','Invalid category rejected');
select throws_ok($$select public.list_market_listings(null,false)$$,'22023','INVALID_FILTER','Unbounded offer scan rejected');
reset role;

-- Newly initiated actions are blocked; passive proceeds from an existing offer remain valid.
update public.characters set location='open_sea',sea_step=1,sea_visit_id=gen_random_uuid(),sea_place_id='deep_water',sea_place_name='Deep water' where id=(select id from f where n=1);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a8600000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select throws_ok($$select public.cancel_market_listing((select id from listings where item_id='market_test_oak_planks'),gen_random_uuid())$$,'P0001','NOT_IN_HARBOR','Seller cannot cancel at sea');
select set_config('request.jwt.claims','{"sub":"a8600000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select lives_ok($$select public.buy_market_listing((select id from listings where item_id='market_test_oak_planks'),1,2,gen_random_uuid())$$,'Existing offer can sell while owner is at sea');
reset role;
update public.characters set gold_coins=0,bank_gold_coins=1000 where id=(select id from f where n=2);
set local role authenticated;
select throws_ok($$select public.buy_market_listing((select id from listings where item_id='market_test_oak_planks'),1,2,gen_random_uuid())$$,'P0001','NOT_ENOUGH_GOLD','Bank money cannot fund a purchase');
reset role;
update public.characters set gold_coins=1000,crew_health=0 where id=(select id from f where n=2);
set local role authenticated;
select throws_ok($$select public.buy_market_listing((select id from listings where item_id='market_test_oak_planks'),1,2,gen_random_uuid())$$,'P0001','IN_HOSPITAL','Hospital blocks buying');
select is(public.buy_market_listing((select id from listings where item_id='market_test_linen_bandages'),19,1,(select request_id from f where n=2)),
 (select value from results where key='buy19'),'Previously completed receipt remains readable in Hospital');
reset role;
update public.characters set crew_health=100,ship_health=100,hospital_until=null,hospital_started_at=null where id=(select id from f where n=2);
update private.item_definitions set tradable=false where id='market_test_oak_planks';
set local role authenticated;
select throws_ok($$select public.buy_market_listing((select id from listings where item_id='market_test_oak_planks'),1,2,gen_random_uuid())$$,'P0001','ITEM_NOT_TRADABLE','Disabled item cannot trade');
select is(public.list_market_items('market_test_materials')->>'total','0','Untradable definitions are absent');
reset role;
update private.item_definitions set tradable=true where id='market_test_oak_planks';
update public.characters set location='the_harbor',sea_step=0,sea_visit_id=null,sea_place_id=null,sea_place_name=null where id=(select id from f where n=1);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a8600000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select public.start_combat((select id from f where n=2),gen_random_uuid());
select set_config('request.jwt.claims','{"sub":"a8600000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_ok($$select public.buy_market_listing((select id from listings where item_id='market_test_oak_planks'),1,2,gen_random_uuid())$$,'P0001','IN_COMBAT','Defender cannot buy during combat');
select lives_ok($$select public.list_market_items(null,'Market Fixture ')$$,'Defender can still read the market');
reset role;
select ok(not exists(select 1 from original_circulation o join private.item_circulation c using(item_id) where c.total<>o.total),'Every listing, purchase and cancellation conserved circulation');

-- Expanded offers are one ordered snapshot; owned listings remain paginated.
update private.item_stacks set quantity=45 where character_id=(select id from f where n=1) and item_id='market_test_linen_bandages';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a8600000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.create_market_listings(jsonb_build_array(jsonb_build_object(
 'entry_id',(select i->>'id' from jsonb_array_elements(public.list_inventory()->'items') i where i->>'item_id'='market_test_linen_bandages'),
 'entry_type','stack','quantity',1,'unit_price',n)),gen_random_uuid()) from generate_series(1,45) n;
select is(jsonb_array_length(public.list_market_listings('market_test_linen_bandages')->'items'),20,'First expansion returns twenty offers');
insert into results values('expanded',public.list_market_listings('market_test_linen_bandages',false,1));
select is(jsonb_array_length((select value->'items' from results where key='expanded')),40,'Second expansion retains the first twenty and adds twenty');
select is(jsonb_array_length(public.list_market_listings('market_test_linen_bandages',false,2)->'items'),45,'Final expansion returns only remaining offers');
select is(jsonb_array_length(public.list_market_listings('market_test_linen_bandages',false,999)->'items'),45,'Oversized expansion stops at actual stock');
select is((select jsonb_agg(i->>'id' order by n) from jsonb_array_elements((select value->'items' from results where key='expanded')) with ordinality v(i,n) where n<=20),
 (select jsonb_agg(i->>'id' order by n) from jsonb_array_elements(public.list_market_listings('market_test_linen_bandages')->'items') with ordinality v(i,n)),'Earlier rows are retained in the same order');
select is((select count(distinct i->>'id')::integer from jsonb_array_elements((select value->'items' from results where key='expanded')) i),40,'Expanded offers contain no duplicates');
select public.cancel_market_listing((public.list_market_listings('market_test_linen_bandages')#>>'{items,0,id}')::uuid,gen_random_uuid());
select is((select jsonb_agg((i->>'unit_price')::integer order by n) from jsonb_array_elements(public.list_market_listings('market_test_linen_bandages',false,1)->'items') with ordinality v(i,n)),
 (select jsonb_agg(n order by n) from generate_series(2,41) n),'A removed offer is replaced without gaps and lowest price stays first');
select is(jsonb_array_length(public.list_market_listings(null,true,1)->'items'),20,'Own listings still return one page');
reset role;

select * from finish();
rollback;
