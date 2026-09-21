begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();

select is((select morale from private.morale_snapshot(20,'2026-01-01 12:04:58Z','2026-01-01 12:04:59Z')),20::numeric,'No recovery before a boundary');
select is((select morale from private.morale_snapshot(20,'2026-01-01 12:04:58Z','2026-01-01 12:05:00Z')),15::numeric,'Positive morale falls exactly at :05');
select is((select morale from private.morale_snapshot(-20,'2026-01-01 12:04:58Z','2026-01-01 12:05:00Z')),-15::numeric,'Negative morale rises exactly at :05');
select is((select morale from private.morale_snapshot(-95.5,'2026-01-01 12:04:59Z','2026-01-01 12:10:00Z')),-85.5::numeric,'Multiple boundaries retain the decimal');
select is((select morale from private.morale_snapshot(-2.5,'2026-01-01 12:04:59Z','2026-01-01 12:05:00Z')),0::numeric,'Negative recovery stops at zero');
select is((select morale from private.morale_snapshot(2.5,'2026-01-01 12:04:59Z','2026-01-01 12:05:00Z')),0::numeric,'Positive recovery stops at zero');
select is((select morale from private.morale_snapshot(0,'2026-01-01Z','2026-02-01Z')),0::numeric,'Neutral morale stays neutral');
select is((select morale from private.morale_snapshot(100,'2026-01-01Z','2026-01-01 01:40Z')),0::numeric,'One hundred minutes offline settles the full range');
select is((select morale from private.morale_snapshot(-100,'2026-01-01Z','2026-02-01Z')),0::numeric,'Long offline recovery cannot cross zero');
select is((select morale from private.morale_snapshot(10,'2026-01-01 12:05Z','2026-01-01 12:04Z')),10::numeric,'Backwards time cannot create recovery');
select is((select morale_updated_at from private.morale_snapshot(10,'2026-01-01 12:05Z','2026-01-01 12:04Z')),'2026-01-01 12:05Z'::timestamptz,'Backwards time cannot rewind the checkpoint');
select is((select morale_next_at from private.morale_snapshot(10,'2026-01-01 12:04:59Z','2026-01-01 12:05Z')),'2026-01-01 12:10Z'::timestamptz,'Next tick is the next fixed server boundary');
select is((select morale_next_at from private.morale_snapshot(-2.5,'2026-01-01 12:04Z','2026-01-01 12:05Z')),null::timestamptz,'Neutral morale does not schedule another tick');
set local timezone='Pacific/Auckland';
select is((select morale from private.morale_snapshot(10,'2026-01-01 12:04:59+00','2026-01-01 12:05:00+00')),5::numeric,'Ticks ignore the session time zone');
set local timezone='UTC';
select is(private.morale_multiplier(-100,500),0.95::numeric,'Minimum morale gives minus five percent');
select is(private.morale_multiplier(0,500),1::numeric,'Baseline has no modifier');
select is(private.morale_multiplier(100,500),1.05::numeric,'Maximum morale gives plus five percent');
select is(private.morale_multiplier(25,500),1.0125::numeric,'Modifier remains linear for partial morale');

insert into auth.users(id,email,is_anonymous,raw_user_meta_data) values
('a9700000-0000-4000-8000-000000000001','morale-one@example.test',false,'{"character_name":"MoraleCaptain"}'),
('a9700000-0000-4000-8000-000000000002','morale-two@example.test',false,'{"character_name":"MoraleDefender"}');
create temporary table morale_fixture as select
(select id from public.characters where user_id='a9700000-0000-4000-8000-000000000001') a,
(select id from public.characters where user_id='a9700000-0000-4000-8000-000000000002') d,
gen_random_uuid() drill,gen_random_uuid() meal,gen_random_uuid() battle;
grant select on morale_fixture to authenticated;
create temporary table morale_results(key text primary key,value jsonb);
grant all on morale_results to authenticated;
select is((select crew_morale from public.characters where id=(select a from morale_fixture)),0::numeric,'New characters start at neutral morale');
select throws_ok($$update public.characters set crew_morale=0.01 where id=(select a from morale_fixture)$$,'23514',null,'More than one decimal is rejected');
select throws_ok($$update public.characters set crew_morale=100.1 where id=(select a from morale_fixture)$$,'23514',null,'Upper range is enforced');
select throws_ok($$update public.characters set crew_morale=-100.1 where id=(select a from morale_fixture)$$,'23514',null,'Lower range is enforced');
select throws_ok($$update public.characters set crew_morale='NaN'::numeric where id=(select a from morale_fixture)$$,'23514',null,'Non-finite morale is rejected');
update public.characters set gold_coins=5000,energy_updated_at=clock_timestamp()+interval '1 day',
  morale_updated_at=clock_timestamp()+interval '1 day' where id in(select a from morale_fixture union all select d from morale_fixture);

set local role anon;
select throws_ok($$select public.buy_tavern_meal(1000,25,gen_random_uuid())$$,'42501',null,'Anonymous meals are denied');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a9700000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select throws_ok($$update public.characters set crew_morale=100$$,'42501',null,'Players cannot directly write morale');
select throws_ok($$select * from private.tavern_requests$$,'42501',null,'Meal receipts are private');
select throws_ok($$select private.morale_snapshot(100,now(),now())$$,'42501',null,'Players cannot invoke internal recovery helpers');
select is((public.get_game_state()->>'crew_morale')::numeric,0::numeric,'Game state exposes own current morale');
insert into morale_results select 'drill',public.train_crew('attack','crew_1',drill) from morale_fixture;
select is((public.get_game_state()->>'crew_morale')::numeric,-2.5::numeric,'Five Energy costs 2.5 morale');
select is((select (value->>'morale_before')::numeric from morale_results where key='drill'),0::numeric,'Drill uses pre-action morale');
select is((select (value->>'normal_gain')::numeric from morale_results where key='drill'),1.00623::numeric,'Neutral morale preserves normal training gain');
select is((select public.train_crew('attack','crew_1',drill) from morale_fixture),(select value from morale_results where key='drill'),'Drill replay returns its original morale receipt');
select is((public.get_game_state()->>'crew_morale')::numeric,-2.5::numeric,'Drill replay cannot charge morale twice');
select public.start_ship_upgrade('attack',5,'ship_1',gen_random_uuid());
select is((public.get_game_state()->>'crew_morale')::numeric,-2.5::numeric,'Ship work does not consume morale');
select is((public.get_game_state()#>>'{training,ship_job,stat_gain}')::numeric,1.00623::numeric,'Ship gain ignores morale');
select throws_ok($$select public.buy_tavern_meal(1,25,gen_random_uuid())$$,'P0001','STALE_OFFER','Client cannot choose a lower meal price');
select throws_ok($$select public.buy_tavern_meal(1000,100,gen_random_uuid())$$,'P0001','STALE_OFFER','Client cannot choose a larger meal');
select throws_ok($$select public.buy_tavern_meal(1000,25.01,gen_random_uuid())$$,'22023','INVALID_REQUEST','Meal gain precision is validated');
insert into morale_results select 'meal',public.buy_tavern_meal(1000,25,meal) from morale_fixture;
select is((public.get_game_state()->>'crew_morale')::numeric,22.5::numeric,'Meal restores negative morale and adds the full bonus');
select is((public.get_game_state()->>'gold_coins')::numeric,4000::numeric,'Meal costs one thousand carried coins');
select is((public.get_game_state()->>'energy')::int,90,'Meal uses no Energy');
select is((select public.buy_tavern_meal(1000,25,meal) from morale_fixture),(select value from morale_results where key='meal'),'Meal replay returns the original receipt');
select is((public.get_game_state()->>'gold_coins')::numeric,4000::numeric,'Meal replay cannot debit again');
select throws_ok($$select public.buy_tavern_meal(999,25,meal) from morale_fixture$$,'22023','REQUEST_CONFLICT','Receipt ID cannot be reused for another offer');

reset role;
update public.characters set crew_morale=100 where id=(select a from morale_fixture);
set local role authenticated;
select throws_ok($$select public.buy_tavern_meal(1000,25,gen_random_uuid())$$,'P0001','MORALE_FULL','No purchase at full morale');
insert into morale_results select 'positive',public.train_crew('defense','crew_1',gen_random_uuid());
select is((select (value->>'normal_gain')::numeric from morale_results where key='positive'),1.056542::numeric,'Maximum morale gives exactly five percent before six-decimal rounding');
select is((public.get_game_state()->>'crew_morale')::numeric,97.5::numeric,'Bonus morale is charged after training');
reset role;
update public.characters set crew_morale=-100 where id=(select a from morale_fixture);
set local role authenticated;
insert into morale_results select 'negative',public.train_crew('speed','crew_1',gen_random_uuid());
select is((select (value->>'normal_gain')::numeric from morale_results where key='negative'),0.955919::numeric,'Minimum morale gives ninety-five percent training gains');
select is((public.get_game_state()->>'crew_morale')::numeric,-100::numeric,'Training remains available at the floor');
select is((select (value->>'stat_gain')::numeric from morale_results where key='negative'),
  (select (value->>'normal_gain')::numeric*case when (value->>'perfect')::boolean then 2 else 1 end from morale_results where key='negative'),'Perfect Drill applies after morale exactly once');
reset role;
update public.characters set crew_morale=95.5 where id=(select a from morale_fixture);
set local role authenticated;
insert into morale_results select 'capped',public.buy_tavern_meal(1000,25,gen_random_uuid());
select is((select (value->>'morale_gained')::numeric from morale_results where key='capped'),4.5::numeric,'Meal reports the actual capped gain');
select is((public.get_game_state()->>'crew_morale')::numeric,100::numeric,'Meal never exceeds the cap');
select is((public.get_game_state()->>'gold_coins')::numeric,3000::numeric,'Capped meal charges the displayed full price');
reset role;
update public.characters set crew_morale=0,gold_coins=999,bank_gold_coins=5000 where id=(select a from morale_fixture);
set local role authenticated;
select throws_ok($$select public.buy_tavern_meal(1000,25,gen_random_uuid())$$,'P0001','NOT_ENOUGH_GOLD','Bank savings cannot fund a meal');
select is((public.get_game_state()->>'crew_morale')::numeric,0::numeric,'Rejected meal does not change morale');
reset role;

update public.characters set crew_morale=100,crew_attack=100,crew_defense=100,crew_speed=100,crew_accuracy=100,gold_coins=5000 where id=(select a from morale_fixture);
update public.characters set crew_morale=-100,crew_attack=100,crew_defense=100,crew_speed=100,crew_accuracy=100 where id=(select d from morale_fixture);
set local role authenticated;
insert into morale_results select 'battle',public.start_combat(d,battle) from morale_fixture;
select is((select (value#>>'{battle,attacker,crew,attack}')::numeric from morale_results where key='battle'),105::numeric,'Combat uses morale-adjusted Crew Attack');
select is((select (value#>>'{battle,attacker,crew,defense}')::numeric from morale_results where key='battle'),105::numeric,'Combat uses morale-adjusted Crew Defense');
select is((select (value#>>'{battle,attacker,crew,speed}')::numeric from morale_results where key='battle'),105::numeric,'Combat uses morale-adjusted Crew Speed');
select is((select (value#>>'{battle,attacker,crew,accuracy}')::numeric from morale_results where key='battle'),105::numeric,'Combat uses morale-adjusted Crew Accuracy');
select is((select value#>'{battle,defender,crew_morale}' from morale_results where key='battle'),'null'::jsonb,'Opponent morale stays private');
select throws_ok($$select public.buy_tavern_meal(1000,25,gen_random_uuid())$$,'P0001','IN_COMBAT','Combat blocks new meals');
select is((select public.buy_tavern_meal(1000,25,meal) from morale_fixture),(select value from morale_results where key='meal'),'Old meal receipt remains recoverable during combat');
reset role;
select is((select crew_attack from public.characters where id=(select a from morale_fixture)),100::numeric,'Combat does not write the temporary bonus into permanent stats');
select is((select (state#>>'{defender,crew,attack}')::numeric from private.combats where id=(select (value#>>'{battle,id}')::uuid from morale_results where key='battle')),95::numeric,'Offline defender also receives its morale modifier');
select is((select (state#>>'{defender,ship,attack}')::numeric from private.combats where id=(select (value#>>'{battle,id}')::uuid from morale_results where key='battle')),10::numeric,'Ship stats are unaffected');
update public.characters set morale_updated_at=clock_timestamp()-interval '1 day' where id in(select a from morale_fixture union all select d from morale_fixture);
set local role authenticated;
select is((public.get_game_state()->>'crew_morale')::numeric,0::numeric,'Live morale keeps moving to baseline during combat');
select is((select (public.get_combat((value#>>'{battle,id}')::uuid)#>>'{attacker,crew,attack}')::numeric from morale_results where key='battle'),105::numeric,'Active combat keeps its original morale snapshot after a tick');
select public.submit_combat_order((value#>>'{battle,id}')::uuid,0,'retreat',gen_random_uuid()) from morale_results where key='battle';
reset role;

update public.characters set crew_morale=-7.5,morale_updated_at=date_bin(interval '5 minutes',clock_timestamp(),'1970-01-01Z'::timestamptz)-interval '5 minutes' where id=(select a from morale_fixture);
set local role authenticated;
select is((public.get_game_state()->>'crew_morale')::numeric,-2.5::numeric,'Game state computes offline ticks without an activity');
select is((public.get_game_state()->>'crew_morale')::numeric,-2.5::numeric,'Repeated state reads cannot count recovery twice');
reset role;
select is((select crew_morale from public.characters where id=(select a from morale_fixture)),-7.5::numeric,'Read snapshots do not require stored morale writes');

-- Own receipts cannot be read or replayed as another captain.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a9700000-0000-4000-8000-000000000002","role":"authenticated"}',true);
insert into morale_results select 'other_meal',public.buy_tavern_meal(1000,25,meal) from morale_fixture;
select is((public.get_game_state()->>'gold_coins')::numeric,4000::numeric,'Another character gets its own charge for the same request UUID');
select is((public.get_game_state()->>'crew_morale')::numeric,25::numeric,'Another character gets its own morale reward');
select public.depart_harbor((public.get_game_state()#>>'{sea,version}')::uuid,gen_random_uuid());
select throws_ok($$select public.buy_tavern_meal(1000,25,gen_random_uuid())$$,'P0001','NOT_IN_HARBOR','Travel blocks new tavern meals');
reset role;
select is((select gold_coins from public.characters where id=(select a from morale_fixture)),5000::bigint,'Another captain cannot charge the original account');
update public.characters set crew_health=0 where id=(select a from morale_fixture);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a9700000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select throws_ok($$select public.buy_tavern_meal(1000,25,gen_random_uuid())$$,'P0001','IN_HOSPITAL','Hospital blocks new tavern meals');
reset role;

-- Administrative changes retain the existing permission, audit and timestamp rules.
insert into private.admin_members(user_id) values('a9700000-0000-4000-8000-000000000002');
select set_config('request.jwt.claims','{"sub":"a9700000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select ok('crew_morale'=any(editable),'Morale is an editable administrator resource') from private.admin_resources where name='characters';
select public.admin_mutate('update',jsonb_build_object('resource','characters','key',jsonb_build_object('id',c.id::text),
  'version',md5(to_jsonb(c)::text),'changes',jsonb_build_object('crew_morale','-30.5')),gen_random_uuid(),'Verify morale edit')
  from public.characters c where id=(select a from morale_fixture);
select is((select crew_morale from public.characters where id=(select a from morale_fixture)),-30.5::numeric,'Admin can set one-decimal morale');
select ok((select morale_updated_at>clock_timestamp()-interval '5 seconds' from public.characters where id=(select a from morale_fixture)),'Admin morale edits establish a fresh recovery checkpoint');
select throws_ok($$select public.admin_mutate('update',jsonb_build_object('resource','characters','key',jsonb_build_object('id',c.id::text),
  'version',md5(to_jsonb(c)::text),'changes',jsonb_build_object('crew_morale','-30.55')),gen_random_uuid(),'Verify precision')
  from public.characters c where id=(select a from morale_fixture)$$,'23514',null,'Admin cannot bypass morale precision');

select * from finish();
rollback;
