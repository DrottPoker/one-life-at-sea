begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
insert into auth.users(id,email,is_anonymous,raw_user_meta_data) values
('1c000000-0000-4000-8000-000000000001','circulation-one@example.test',false,'{"character_name":"CirculationOne"}'),
('1c000000-0000-4000-8000-000000000002','circulation-two@example.test',false,'{"character_name":"CirculationTwo"}'),
('1c000000-0000-4000-8000-000000000003','circulation-three@example.test',false,'{"character_name":"CirculationThree"}'),
('1c000000-0000-4000-8000-000000000004','circulation-anon@example.test',true,'{}');
insert into private.item_definitions(id,category_id,name,description,effect_description,image_path,kind,stackable,slot)
values ('circulation_material','materials','Circulation Material','Test material.','No effect.','/images/items/timber.png','passive',true,null),
('circulation_weapon','crew_weapons','Circulation Weapon','Test weapon.','No effect.','/images/items/cutlass.png','equipment',false,'crew_weapon');
select is((select total from private.item_circulation where item_id='circulation_material'),0::numeric,'New definitions start at zero');
select is((select count(*) from private.item_circulation_history where item_id='circulation_material'),1::bigint,'Tracking begins with an honest baseline');
select is((select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='private' and c.relname in ('item_circulation','item_circulation_history') and c.relrowsecurity),2::bigint,'Counters and history have RLS');
set local role anon;
select throws_ok($$select public.get_item_circulation('circulation_material')$$,'42501',null,'Signed-out access denied');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"1c000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select throws_ok($$select * from private.item_circulation$$,'42501',null,'Raw counters are private');
select throws_ok($$select * from private.item_circulation_history$$,'42501',null,'Raw history is private');
select throws_ok($$select private.record_item_circulation_delta('circulation_material',100)$$,'42501',null,'Players cannot mint circulation');
select is(public.get_item_circulation('circulation_material')->>'total','0','Empty type is readable');
select is(jsonb_array_length(public.get_item_circulation('circulation_material')->'points'),2,'Zero circulation has start and current points');
select is(public.get_item_circulation('circulation_material')->>'period','all','Default period is all time');
select throws_ok($$select public.get_item_circulation('missing')$$,'22023','ITEM_NOT_FOUND','Unknown definitions rejected');
select throws_ok($$select public.get_item_circulation('circulation_material','bad')$$,'22023','INVALID_PERIOD','Unknown periods rejected');
select throws_ok($$select public.get_item_circulation('circulation_material',null)$$,'22023','INVALID_PERIOD','Null period rejected');
reset role;
insert into private.item_stacks(id,character_id,item_id,quantity)
select ('1c200000-0000-4000-8000-00000000000'||n)::uuid,c.id,'circulation_material',n*10
from generate_series(1,2) n join public.characters c on c.user_id=('1c000000-0000-4000-8000-00000000000'||n)::uuid;
select is((select total from private.item_circulation where item_id='circulation_material'),30::numeric,'Circulation sums quantities across owners');
select is((select count(*) from private.item_circulation_history where item_id='circulation_material'),1::bigint,'One transaction writes one final snapshot');
update private.item_stacks set quantity=17 where id='1c200000-0000-4000-8000-000000000001';
select is((select total from private.item_circulation where item_id='circulation_material'),37::numeric,'Quantity updates apply their delta');
set local role authenticated;
select is(public.list_inventory('materials')#>>'{items,0,circulation}','37','Inventory exposes the world total');
select is(public.list_inventory('materials')#>>'{items,0,quantity}','17','Owned quantity stays distinct');
select is(public.get_item_circulation('circulation_material')->>'total','37','History response agrees with the inventory total');
select is(public.get_item_circulation('circulation_material')->'points'->-1->>'total','37','Right endpoint is the current total');
select public.trash_inventory_item('1c200000-0000-4000-8000-000000000001','stack',2,'1c300000-0000-4000-8000-000000000001');
select is(public.get_item_circulation('circulation_material')->>'total','35','Trash decrements circulation');
select public.trash_inventory_item('1c200000-0000-4000-8000-000000000001','stack',2,'1c300000-0000-4000-8000-000000000001');
select is(public.get_item_circulation('circulation_material')->>'total','35','Idempotent Trash does not decrement twice');
select throws_ok($$select public.trash_inventory_item('1c200000-0000-4000-8000-000000000001','stack',100,gen_random_uuid())$$,'P0001','NOT_ENOUGH_ITEMS','Failed destruction is rejected');
select is(public.get_item_circulation('circulation_material')->>'total','35','Failed destruction preserves circulation');
reset role;
savepoint circulation_rollback;
update private.item_stacks set quantity=1 where id='1c200000-0000-4000-8000-000000000001';
rollback to savepoint circulation_rollback;
select is((select total from private.item_circulation where item_id='circulation_material'),35::numeric,'Rollback restores the counter');
select is((select total from private.item_circulation_history where item_id='circulation_material'),35::numeric,'Rollback restores the history');
insert into private.item_instances(id,character_id,item_id,damage,accuracy)
select ('1c100000-0000-4000-8000-00000000000'||n)::uuid,c.id,'circulation_weapon',n*10,50
from generate_series(1,2) n join public.characters c on c.user_id=('1c000000-0000-4000-8000-00000000000'||n)::uuid;
select is((select total from private.item_circulation where item_id='circulation_weapon'),2::numeric,'Different stats are still the same circulated type');
create temporary table unchanged_time as select updated_at from private.item_circulation where item_id='circulation_weapon';
update private.item_instances set damage=75,character_id=(select id from public.characters where user_id='1c000000-0000-4000-8000-000000000003')
where id='1c100000-0000-4000-8000-000000000001';
select is((select total from private.item_circulation where item_id='circulation_weapon'),2::numeric,'Equipment transfer does not create items');
select is((select updated_at from private.item_circulation where item_id='circulation_weapon'),(select updated_at from unchanged_time),'Stat and owner changes add no circulation event');
delete from auth.users where id='1c000000-0000-4000-8000-000000000002';
select is((select total from private.item_circulation where item_id='circulation_material'),15::numeric,'Account cascade removes stack quantities');
select is((select total from private.item_circulation where item_id='circulation_weapon'),1::numeric,'Account cascade removes instances');
update private.item_stacks set quantity=9007199254740991 where id='1c200000-0000-4000-8000-000000000001';
insert into private.item_stacks(character_id,item_id,quantity)
select id,'circulation_material',9007199254740991 from public.characters where user_id='1c000000-0000-4000-8000-000000000003';
set local role authenticated;
select is(public.get_item_circulation('circulation_material')->>'total','18014398509481982','Global counts remain exact beyond the JavaScript integer boundary');
select is(jsonb_typeof(public.get_item_circulation('circulation_material')->'total'),'string','Large counts cross JSON as decimal strings');
reset role;
update public.characters set crew_health=0 where user_id='1c000000-0000-4000-8000-000000000001';
set local role authenticated;
select lives_ok($$select public.get_item_circulation('circulation_material')$$,'Hospital allows circulation reading');
select set_config('request.jwt.claims','{"sub":"1c000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
select throws_ok($$select public.get_item_circulation('circulation_material')$$,'42501','NOT_AUTHORIZED','Anonymous Auth users cannot read circulation');
reset role;
select set_config('request.jwt.claims','{"sub":"1c000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
-- Historical fixtures exist only inside this rolled-back test.
delete from private.item_circulation_history where item_id='circulation_material';
update private.item_circulation set total=200,initial_total=10,tracked_since=now()-interval '5 years',updated_at=now()-interval '1 second'
where item_id='circulation_material';
insert into private.item_circulation_history(item_id,transaction_id,recorded_at,total) values
('circulation_material','100000001'::xid8,now()-interval '4 years',30),
('circulation_material','100000002'::xid8,now()-interval '2 years',60),
('circulation_material','100000003'::xid8,now()-interval '5 months',80),
('circulation_material','100000004'::xid8,now()-interval '40 days',90),
('circulation_material','100000005'::xid8,now()-interval '10 days',180),
('circulation_material','100000006'::xid8,now()-interval '1 second',200);
select is((public.get_item_circulation('circulation_material')->>'from')::timestamptz,(select tracked_since from private.item_circulation where item_id='circulation_material'),'All time starts at the real baseline');
select is(public.get_item_circulation('circulation_material')->'points'->0->>'total','10','All time begins with the initial total');
select is(public.get_item_circulation('circulation_material','1m')->'points'->0->>'total','90','Short ranges carry forward the last known count');
select is(jsonb_array_length(public.get_item_circulation('circulation_material','1m')->'points'),4,'Only events inside the requested month are returned');
select ok((public.get_item_circulation('circulation_material','1m')->>'from')::timestamptz>=now()-interval '1 month','Last month has a rolling start');
select is((public.get_item_circulation('circulation_material')->>'to')::timestamptz,statement_timestamp(),'Right endpoint is now');
select lives_ok($$select public.get_item_circulation('circulation_material',p) from unnest(array['1m','3m','6m','1y','3y','all']) p$$,'All six periods are supported');
select is(public.get_item_circulation('circulation_weapon','3y')->>'from',public.get_item_circulation('circulation_weapon')->>'tracked_since','Ranges never fabricate history before tracking began');
select is(public.get_item_circulation('circulation_material')->>'sampled','false','Small histories retain every recorded change');
insert into private.item_circulation_history(item_id,transaction_id,recorded_at,total)
select 'circulation_material',(200000000+n)::text::xid8,now()-interval '3 years'+interval '1 hour'*n,n from generate_series(1,2000) n;
select is(public.get_item_circulation('circulation_material')->>'sampled','true','Long histories use bounded sampling');
select is(jsonb_array_length(public.get_item_circulation('circulation_material')->'points'),502,'Response stays within the configured point budget plus endpoints');
select is(public.get_item_circulation('circulation_material')->'points'->-1->>'total','200','Sampled history still ends at the current total');
select ok(not exists(select 1 from (
  select (value->>'at')::timestamptz at,lag((value->>'at')::timestamptz) over(order by ordinal) previous
  from jsonb_array_elements(public.get_item_circulation('circulation_material')->'points') with ordinality as p(value,ordinal)
) ordered where at<previous),'Sampled points are chronological');
select is((select array_agg(key order by key) from jsonb_object_keys(public.get_item_circulation('circulation_material')) key),
array['from','item_id','period','points','sampled','to','total','tracked_since'],'Public history contains no owner identities');
select * from finish();
rollback;
