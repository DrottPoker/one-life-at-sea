
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
select ok(to_regprocedure('public.start_ship_upgrade(text,text,text,uuid)') is null,'Old size-based RPC is removed');
insert into auth.users(id,email,is_anonymous,raw_user_meta_data) values
('b3000000-0000-4000-8000-000000000001','ship-energy@example.test',false,'{"character_name":"ShipEnergyCaptain"}');
insert into private.item_stacks(character_id,item_id,quantity) select c.id,m.item_id,1000 from public.characters c
cross join (values('oak_planks'),('iron_nails')) m(item_id) where c.user_id in ('b3000000-0000-4000-8000-000000000001'::uuid);

create temporary table ship_fixture as select id captain,gen_random_uuid() request from public.characters
where user_id='b3000000-0000-4000-8000-000000000001';
grant select on ship_fixture to authenticated;
create temporary table ship_receipts(value jsonb);
grant all on ship_receipts to authenticated;
select set_config('request.jwt.claims','{"sub":"b3000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
select throws_ok($$select public.start_ship_upgrade('attack',null,'ship_1',gen_random_uuid())$$,'22023','INVALID_ENERGY','Null Energy is rejected');
select throws_ok($$select public.start_ship_upgrade('attack',0,'ship_1',gen_random_uuid())$$,'22023','INVALID_ENERGY','Zero Energy is rejected');
select throws_ok($$select public.start_ship_upgrade('attack',4,'ship_1',gen_random_uuid())$$,'22023','INVALID_ENERGY','Below-minimum Energy is rejected');
select throws_ok($$select public.start_ship_upgrade('attack',1001,'ship_1',gen_random_uuid())$$,'22023','INVALID_ENERGY','Above-cap Energy is rejected');
select throws_ok($$select private.training_action('ship','{"stat":"attack","tier_id":"ship_1","energy_amount":5.5}',gen_random_uuid())$$,'22023','INVALID_ENERGY','Fractional Energy is rejected by the authoritative action');
select is(public.get_game_state()->>'energy','100','Invalid requests do not debit Energy');
insert into ship_receipts select public.start_ship_upgrade('attack',6,'ship_1',request) from ship_fixture;
select is(public.get_game_state()->>'energy','94','Arbitrary whole Energy is debited exactly');
select is(public.get_game_state()#>>'{training,ship_job,stat_gain}','2.415814','Six Energy snapshots a fractional stat gain');
select is(public.get_game_state()#>>'{training,ship_job,xp_gain}','6','XP still follows spent Energy');
select is(public.get_game_state()->>'ship_attack','10','Fractional rewards wait for completion');
select is((select public.start_ship_upgrade('attack',6,'ship_1',request) from ship_fixture),(select value from ship_receipts),'Retry preserves the exact job and fractional gain');
select throws_ok($$select public.start_ship_upgrade('attack',7,'ship_1',request) from ship_fixture$$,'22023','REQUEST_CONFLICT','Changing Energy under the same request is rejected');
reset role;
select is((select extract(epoch from(finishes_at-started_at)) from private.ship_upgrade_jobs where character_id=(select captain from ship_fixture) and applied_at is null),36::numeric,'Each Energy adds six seconds');
update private.ship_upgrade_jobs set started_at=clock_timestamp()-interval '7 minutes',finishes_at=clock_timestamp()-interval '1 second'
where character_id=(select captain from ship_fixture) and applied_at is null;
set local role authenticated;
select is(public.get_game_state()->>'ship_attack','12.415814','Completion preserves fractional stats');
select is(public.get_game_state()->>'ship_attack','12.415814','Repeated reads cannot award fractional gains twice');
select public.start_ship_upgrade('attack',7,'ship_1',gen_random_uuid());
reset role;
update private.ship_upgrade_jobs set started_at=clock_timestamp()-interval '8 minutes',finishes_at=clock_timestamp()-interval '1 second'
where character_id=(select captain from ship_fixture) and applied_at is null;
set local role authenticated;
select is(public.get_game_state()->>'ship_attack','15.238642','Different small jobs preserve every rounded Energy unit');
select public.start_ship_upgrade('defense',13,'ship_1',gen_random_uuid());
reset role;
update private.ship_upgrade_jobs set started_at=clock_timestamp()-interval '14 minutes',finishes_at=clock_timestamp()-interval '1 second'
where character_id=(select captain from ship_fixture) and applied_at is null;
set local role authenticated;
select is(public.get_game_state()->>'ship_defense','15.238642','One larger job equals multiple smaller jobs');
reset role;
update public.characters set energy=4,energy_updated_at=clock_timestamp() where id=(select captain from ship_fixture);
set local role authenticated;
select throws_ok($$select public.start_ship_upgrade('attack',5,'ship_1',gen_random_uuid())$$,'P0001','NOT_ENOUGH_ENERGY','Insufficient current Energy is rejected');
select is(public.get_game_state()->>'energy','4','Insufficient Energy costs nothing');
reset role;
update public.characters set energy=37,energy_updated_at=clock_timestamp() where id=(select captain from ship_fixture);
set local role authenticated;
select throws_ok($$select public.start_ship_upgrade('attack',38,'ship_1',gen_random_uuid())$$,'P0001','NOT_ENOUGH_ENERGY','Stale Energy above the current balance is rejected');
select public.start_ship_upgrade('accuracy',37,'ship_1',gen_random_uuid());
select is(public.get_game_state()->>'energy','0','The full current balance can be spent');
select is(public.get_game_state()#>>'{training,ship_job,stat_gain}','14.952739','Full balance includes virtual stat growth');
reset role;
select is((select extract(epoch from(finishes_at-started_at)) from private.ship_upgrade_jobs where character_id=(select captain from ship_fixture) and applied_at is null),222::numeric,'Arbitrary full-balance duration is correct');
update private.ship_upgrade_jobs set started_at=clock_timestamp()-interval '38 minutes',finishes_at=clock_timestamp()-interval '1 second'
where character_id=(select captain from ship_fixture) and applied_at is null;
set local role authenticated;
select public.get_game_state();
reset role;
update public.characters set ship_speed=9007199254740990,energy=100,energy_updated_at=clock_timestamp()
where id=(select captain from ship_fixture);
set local role authenticated;
select throws_ok($$select public.start_ship_upgrade('speed',6,'ship_1',gen_random_uuid())$$,'P0001','PROGRESSION_LIMIT','Fractional gain cannot overflow the stat cap');
select is(public.get_game_state()->>'energy','100','Overflow preserves Energy');
select * from finish();
rollback;
