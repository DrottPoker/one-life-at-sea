begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
insert into auth.users(id,email,is_anonymous,raw_user_meta_data) values
('ec110000-0000-4000-8000-000000000001','economy-admin@example.test',false,'{"character_name":"EconomyAdmin"}'),
('ec110000-0000-4000-8000-000000000002','economy-player@example.test',false,'{"character_name":"EconomyPlayer","is_admin":true}');
insert into private.admin_members(user_id) values('ec110000-0000-4000-8000-000000000001');
create temp table fixture as select id,user_id from public.characters where user_id::text like 'ec110000-%';
create temp table saved(key text primary key,value jsonb);
grant all on saved to authenticated; grant select on fixture to authenticated;
insert into saved select 'baseline',jsonb_build_object('coins',coalesce(sum(gold_coins::numeric+bank_gold_coins::numeric),0)::text) from public.characters;
update public.characters set gold_coins=9007199254740991,bank_gold_coins=9007199254740991 where user_id='ec110000-0000-4000-8000-000000000001';
update public.characters set gold_coins=10000 where user_id='ec110000-0000-4000-8000-000000000002';
insert into private.item_definitions(id,category_id,name,description,effect_description,image_path,kind,stackable,tradable)
select id,'materials',name,'Economy fixture.','No effect.','/images/items/placeholder.svg','passive',true,true from
 (values('economy_test_fish','Economy Fish'),('economy_test_unknown','Economy Unknown'),('economy_test_large','Economy Large')) v(id,name);
insert into private.item_definitions(id,category_id,name,description,effect_description,image_path,kind,stackable,tradable)
select 'economy_page_'||n,'materials','Economy Page '||lpad(n::text,2,'0'),'Fixture.','None.','/images/items/placeholder.svg','passive',true,true from generate_series(1,53) n;
insert into private.item_stacks(character_id,item_id,quantity)
select id,item,qty from fixture cross join(values('economy_test_fish',10::bigint),('economy_test_unknown',3::bigint)) v(item,qty) where user_id='ec110000-0000-4000-8000-000000000001';
insert into private.item_stacks(character_id,item_id,quantity)
select id,'economy_test_large',9007199254740991 from fixture where user_id='ec110000-0000-4000-8000-000000000002';
insert into private.market_sales(item_id,quantity,unit_price,gross,fee,sold_at) values
('economy_test_fish',1,100,100,5,statement_timestamp()-interval '2 hours'),
('economy_test_fish',9,200,1800,90,statement_timestamp()-interval '1 hour'),
('economy_test_large',1,9007199254740991,9007199254740991,0,statement_timestamp()-interval '2 days');
select ok((select relrowsecurity from pg_class where oid='private.economy_snapshots'::regclass),'Snapshot RLS enabled');
select is((select count(*) from cron.job where jobname='economy-snapshot' and schedule='*/5 * * * *' and active),1::bigint,'One active five-minute job');
set local role anon;
select throws_ok($$select public.admin_economy()$$,'42501',null,'Anonymous access denied');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"ec110000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_ok($$select public.admin_economy()$$,'42501','ADMIN_REQUIRED','User metadata cannot grant economy access');
select throws_ok($$select * from private.economy_snapshots$$,'42501',null,'Snapshot rows are private');
select throws_ok($$select private.economy_holdings()$$,'42501',null,'Holdings helper cannot reveal inventories');
select throws_ok($$select private.economy_items(now())$$,'42501',null,'Item helper cannot bypass admin check');
select throws_ok($$select private.record_economy_snapshot()$$,'42501',null,'Clients cannot write snapshots');
select set_config('request.jwt.claims','{"sub":"ec110000-0000-4000-8000-000000000001","role":"authenticated"}',true);
insert into saved select 'before',public.admin_economy('7d','economy_test');
select is((select value#>>'{totals,coins}' from saved where key='before'),
 ((select (value->>'coins')::numeric from saved where key='baseline')+18014398509481982+10000)::text,'World money adds bank balances without unsafe integers');
select is((select jsonb_typeof(value#>'{totals,coins}') from saved where key='before'),'string','Totals cross the API as decimal strings');
select is((select x->>'unit_value' from saved,jsonb_array_elements(value#>'{items,rows}') x where key='before' and x->>'id'='economy_test_fish'),'190','Item valuation uses weighted actual sales');
select is((select x->>'total_value' from saved,jsonb_array_elements(value#>'{items,rows}') x where key='before' and x->>'id'='economy_test_large'),(9007199254740991::numeric*9007199254740991)::text,'Item values preserve more than thirty digits');
select is((select x->>'unit_value' from saved,jsonb_array_elements(value#>'{items,rows}') x where key='before' and x->>'id'='economy_test_unknown'),null,'Unsold items remain unpriced');
select is((select value#>>'{rankings,items,0,name}' from saved where key='before'),'EconomyPlayer','Item wealth has an independent ranking');
select is((public.admin_economy('7d','Economy Page')->'items'->>'total'),'53','Item search counts every match');
select is(jsonb_array_length(public.admin_economy('7d','Economy Page',0,'name')#>'{items,rows}'),50,'Item page is bounded');
select is(jsonb_array_length(public.admin_economy('7d','Economy Page',1,'name')#>'{items,rows}'),3,'Second page reaches remaining items');
select is(public.admin_economy('7d','Economy Page',1,'name')#>>'{items,rows,0,name}','Economy Page 51','Pagination uses deterministic ordering');
select is(public.admin_economy('7d','Economy Unknown',0,'unpriced')#>>'{items,rows,0,units}','3','Unpriced stock remains counted');
select throws_ok($$select public.admin_economy('invalid')$$,'22023','INVALID_ECONOMY_FILTER','Invalid period rejected');
select throws_ok($$select public.admin_economy(null)$$,'22023','INVALID_ECONOMY_FILTER','Null period rejected');
select throws_ok($$select public.admin_economy('7d','',-1)$$,'22023','INVALID_ECONOMY_FILTER','Negative pagination rejected');
select throws_ok($$select public.admin_economy('7d','',0,'invalid')$$,'22023','INVALID_ECONOMY_FILTER','Invalid sort rejected');
reset role;
create temp table stock as select id from private.item_stacks where item_id='economy_test_fish';
grant select on stock to authenticated;
set local role authenticated;
select public.create_market_listings(jsonb_build_array(jsonb_build_object('entry_id',id,'entry_type','stack','quantity',4,'unit_price',200)),gen_random_uuid()) from stock;
insert into saved select 'listed',public.admin_economy('7d','economy_test_fish');
select is((select value#>>'{items,rows,0,inventory}' from saved where key='listed'),'6','Escrow leaves six inventory units');
select is((select value#>>'{items,rows,0,listed}' from saved where key='listed'),'4','Escrow contributes four listed units');
select is((select value#>>'{items,rows,0,units}' from saved where key='listed'),'10','Listing does not inflate circulation');
select is((select value#>>'{items,rows,0,total_value}' from saved where key='listed'),'1900','Asking price does not set valuation');
select is((select value#>>'{totals,item_value}' from saved where key='before'),(select value#>>'{totals,item_value}' from saved where key='listed'),'Listing conserves world item wealth');
select is((select p->>'listed_value' from saved,jsonb_array_elements(value#>'{rankings,coins}') p where key='listed' and p->>'name'='EconomyAdmin'),'760','Escrow value belongs to seller');
reset role;
update public.characters set gold_coins=1000,bank_gold_coins=500 where user_id='ec110000-0000-4000-8000-000000000001';
create temp table listed_id as select id from private.market_listings where item_id='economy_test_fish';
grant select on listed_id to authenticated;
insert into saved select 'pretrade',private.admin_economy();
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"ec110000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select public.buy_market_listing((select id from listed_id),1,200,gen_random_uuid());
select set_config('request.jwt.claims','{"sub":"ec110000-0000-4000-8000-000000000001","role":"authenticated"}',true);
insert into saved select 'posttrade',public.admin_economy('7d','economy_test_fish');
select is((select (value#>>'{totals,coins}')::numeric from saved where key='pretrade')-(select (value#>>'{totals,coins}')::numeric from saved where key='posttrade'),10::numeric,'Trading removes only the marketplace fee from money supply');
select is((select value#>>'{items,rows,0,units}' from saved where key='posttrade'),'10','A purchase transfers items without creating stock');
select is((select (value#>>'{market_24h,fees}')::numeric from saved where key='posttrade')-(select (value#>>'{market_24h,fees}')::numeric from saved where key='pretrade'),10::numeric,'24-hour fees reflect the completed purchase');
reset role;
select private.record_economy_snapshot();
create temp table snapshot_count as select count(*) n from private.economy_snapshots;
select private.record_economy_snapshot();
select is((select count(*) from private.economy_snapshots),(select n from snapshot_count),'Snapshot retries cannot duplicate a five-minute slot');
savepoint historical_fixture;
delete from private.economy_snapshots;
insert into private.economy_snapshots(observed_at,slot,gold,bank_gold,item_units,item_value,unpriced_units,players)
select statement_timestamp()-n*interval '5 minutes',date_bin(interval '5 minutes',statement_timestamp()-n*interval '5 minutes',timestamptz '2000-01-01'),n,0,n,0,n,2 from generate_series(1,600) n;
select is(jsonb_array_length(private.admin_economy('all')->'history')<=500,true,'Large histories are bounded including the live point');
select is(private.admin_economy('all')->>'sampled','true','Downsampling is disclosed');
select is(private.admin_economy('all')#>>'{history,0,coins}','600','First observation is preserved');
select is(private.admin_economy('all')->'history'->-1->>'coins',private.admin_economy('all')#>>'{totals,coins}','Final point is the exact live supply');
select ok(not exists(select 1 from jsonb_array_elements(private.admin_economy('24h')->'history') p where (p->>'at')::timestamptz<statement_timestamp()-interval '24 hours'),'Selected period limits history');
rollback to historical_fixture;
delete from private.admin_members where user_id='ec110000-0000-4000-8000-000000000001';
set local role authenticated;
select throws_ok($$select public.admin_economy()$$,'42501','ADMIN_REQUIRED','Revocation blocks fresh economy reads immediately');
reset role;
select * from finish();
rollback;
