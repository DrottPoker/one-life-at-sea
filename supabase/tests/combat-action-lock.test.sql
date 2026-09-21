begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();

insert into auth.users(id,email,is_anonymous,raw_user_meta_data)
select ('a8400000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'action-lock-'||n||'@example.test',false,
  jsonb_build_object('character_name','ActionLock'||chr(65+n)) from generate_series(1,4) n;
create temp table f as select id,user_id,right(user_id::text,12)::integer n from public.characters
  where user_id::text like 'a8400000-0000-4000-8000-%';
update public.characters set gold_coins=10000,bank_gold_coins=10000,ship_defense=10000,ship_speed=10000
  where id in(select id from f);
update private.character_training set xp=100000 where character_id=(select id from f where n=3);
insert into private.item_stacks(id,character_id,item_id,quantity)
  select 'a8410000-0000-4000-8000-000000000001',id,'linen_bandages',10 from f where n=3;
create temp table results(name text primary key,value jsonb);
grant select on f to authenticated;
grant all on results to authenticated;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a8400000-0000-4000-8000-000000000003","role":"authenticated"}',true);
insert into results values('receipt',public.transfer_gold('deposit',1,'a8420000-0000-4000-8000-000000000001'));
insert into results values('before',public.get_game_state());
select set_config('request.jwt.claims','{"sub":"a8400000-0000-4000-8000-000000000001","role":"authenticated"}',true);
insert into results select 'battle',public.start_combat(id,gen_random_uuid()) from f where n=3;
select ok((select value ? 'battle' from results where name='battle'),'First attack starts');
select set_config('request.jwt.claims','{"sub":"a8400000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is((select public.start_combat(id,gen_random_uuid())#>>'{battle,id}' from f where n=3),
  (select value#>>'{battle,id}' from results where name='battle'),'Second attacker joins the same encounter');

select set_config('request.jwt.claims','{"sub":"a8400000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select is(public.get_game_state()->>'active_combat_id',(select value#>>'{battle,id}' from results where name='battle'),'Defender receives action lock');
select is(public.get_attack_lock(),null::jsonb,'Defender can browse other pages');
select is(public.list_inventory('medical')->>'total','1','Defender can read and filter inventory');
select lives_ok($$select public.get_item_circulation('linen_bandages','all')$$,'Item inspection remains available');
select lives_ok($$select public.get_character_status(id) from f where n=4$$,'Other profiles remain readable');
select throws_ok($$select public.train_crew('attack','crew_1',gen_random_uuid())$$,'P0001','IN_COMBAT','Defender cannot train');
select throws_ok($$select public.start_ship_upgrade('attack',5,'ship_1',gen_random_uuid())$$,'P0001','IN_COMBAT','Defender cannot start ship work');
select throws_ok($$select public.purchase_training_tier('crew','crew_2',gen_random_uuid())$$,'P0001','IN_COMBAT','Defender cannot buy crew tiers');
select throws_ok($$select public.purchase_training_tier('ship','ship_2',gen_random_uuid())$$,'P0001','IN_COMBAT','Defender cannot buy workshop tiers');
select throws_ok($$select public.transfer_gold('deposit',1,gen_random_uuid())$$,'P0001','IN_COMBAT','Defender cannot deposit');
select throws_ok($$select public.transfer_gold('withdraw',1,gen_random_uuid())$$,'P0001','IN_COMBAT','Defender cannot withdraw');
select throws_ok($$select public.trash_inventory_item('a8410000-0000-4000-8000-000000000001','stack',1,gen_random_uuid())$$,'P0001','IN_COMBAT','Defender cannot destroy items');
select throws_ok($$select public.save_defence_orders('boarding')$$,'P0001','IN_COMBAT','Defender cannot change defence orders');
select throws_ok($$select public.depart_harbor((value#>>'{sea,version}')::uuid,gen_random_uuid()) from results where name='before'$$,'P0001','IN_COMBAT','Defender cannot leave harbor');
select is((select public.start_combat(id,gen_random_uuid())->>'error' from f where n=4),'DEFENDING','Defender cannot start another attack');
select is(public.transfer_gold('deposit',1,'a8420000-0000-4000-8000-000000000001'),
  (select value from results where name='receipt'),'An existing receipt remains readable without a new mutation');
insert into results values('locked',public.get_game_state());
select is((select jsonb_build_array(value->'energy',value->'gold_coins',value->'bank_gold_coins',value->'crew_attack',
  value->'ship_attack',value->'training',value->'sea',value->'defence_order') from results where name='locked'),
  (select jsonb_build_array(value->'energy',value->'gold_coins',value->'bank_gold_coins',value->'crew_attack',
  value->'ship_attack',value->'training',value->'sea',value->'defence_order') from results where name='before'),
  'Rejected actions leave resources, stats, training, defence and location unchanged');
select is(public.list_inventory('medical')#>>'{items,0,quantity}','10','Rejected destruction leaves items unchanged');

select set_config('request.jwt.claims','{"sub":"a8400000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select ok((select public.submit_combat_order((value#>>'{battle,id}')::uuid,0,'retreat',gen_random_uuid()) ? 'battle' from results where name='battle'),'First attacker can still issue combat orders');
select set_config('request.jwt.claims','{"sub":"a8400000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select throws_ok($$select public.transfer_gold('deposit',1,gen_random_uuid())$$,'P0001','IN_COMBAT','One remaining attacker keeps defender locked');
select set_config('request.jwt.claims','{"sub":"a8400000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select ok((select public.submit_combat_order((value#>>'{battle,id}')::uuid,0,'retreat',gen_random_uuid()) ? 'battle' from results where name='battle'),'Last attacker can retreat');
select set_config('request.jwt.claims','{"sub":"a8400000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select is(public.get_game_state()->>'active_combat_id',null::text,'Last departure releases defender');
select lives_ok($$select public.train_crew('attack','crew_1',gen_random_uuid())$$,'Training resumes');
select lives_ok($$select public.purchase_training_tier('crew','crew_2',gen_random_uuid())$$,'Tier purchases resume');
select lives_ok($$select public.transfer_gold('withdraw',1,gen_random_uuid())$$,'Bank transfers resume');
select lives_ok($$select public.trash_inventory_item('a8410000-0000-4000-8000-000000000001','stack',1,gen_random_uuid())$$,'Item mutation resumes');
select lives_ok($$select public.save_defence_orders('boarding')$$,'Defence changes resume');
select lives_ok($$select public.depart_harbor((value#>>'{sea,version}')::uuid,gen_random_uuid()) from results where name='before'$$,'Sailing resumes');
select * from finish();
rollback;
