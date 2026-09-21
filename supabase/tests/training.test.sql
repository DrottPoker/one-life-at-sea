begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();

select is((select energy from private.energy_snapshot(50,'2026-01-01Z','2026-01-01 00:04:59Z')),50,'Recovery waits for a complete interval');
select is((select energy from private.energy_snapshot(50,'2026-01-01Z','2026-01-01 00:05Z')),55,'Recovery applies at the boundary');
select is((select energy from private.energy_snapshot(50,'2026-01-01Z','2026-01-01 00:12Z')),60,'Offline recovery includes complete intervals');
select is((select energy_updated_at from private.energy_snapshot(50,'2026-01-01Z','2026-01-01 00:12Z')),'2026-01-01 00:12Z'::timestamptz,'Settlement records time without shifting the global tick');
select is((select energy from private.energy_snapshot(98,'2026-01-01Z','2026-01-01 00:05Z')),100,'Five-point recovery clamps to remaining capacity');
select is((select energy from private.energy_snapshot(0,'2026-01-01Z','2026-01-01 01:40Z')),100,'Empty Energy fills in one hundred minutes');
select is((select energy from private.energy_snapshot(99,'2026-01-01Z','2026-02-01Z')),100,'Energy is capped');
select is((select energy_updated_at from private.energy_snapshot(99,'2026-01-01Z','2026-02-01Z')),'2026-02-01Z'::timestamptz,'Full energy cannot bank time');
select is((select energy from private.energy_snapshot(50,'2026-01-01 00:05Z','2026-01-01Z')),50,'Backwards time cannot remove Energy');
select is(private.crew_training_gain(10,0),20::numeric,'Perfect Drill doubles the stat gain');
select is(private.crew_training_gain(10,0.009999),20::numeric,'Rolls below one percent are perfect');
select is(private.crew_training_gain(10,0.01),10::numeric,'One percent is the exclusive boundary');
select is(private.crew_training_gain(1500,0.9999),1500::numeric,'Ordinary gains support late tiers');
select lives_ok($$select private.combat_damage(9007199254740991,9007199254740991)$$,'Maximum safe stats remain valid in combat');
select throws_ok($$select private.crew_training_gain(1,1)$$,'22023','INVALID_TRAINING_ROLL','Invalid rolls are rejected');
select ok(to_regprocedure('public.train_stat(text,text)') is null,'Old public instant training is removed');
select ok(to_regprocedure('private.train_stat(text,text)') is null,'Old internal instant training is removed');

insert into auth.users(id,email,is_anonymous,raw_user_meta_data) values
('b2000000-0000-4000-8000-000000000001','training-one@example.test',false,'{"character_name":"TrainingCaptain"}'),
('b2000000-0000-4000-8000-000000000002','training-two@example.test',false,'{"character_name":"OtherTrainingCaptain"}'),
('b2000000-0000-4000-8000-000000000003','training-anon@example.test',true,'{}');
create temporary table training_fixture as select
(select id from public.characters where user_id='b2000000-0000-4000-8000-000000000001') a,
(select id from public.characters where user_id='b2000000-0000-4000-8000-000000000002') d,
gen_random_uuid() crew_request,gen_random_uuid() purchase_request,gen_random_uuid() ship_request;
grant select on training_fixture to authenticated;
create temporary table training_results(key text primary key,value jsonb);
grant all on training_results to authenticated;
set local role anon;
select throws_ok('select public.get_game_state()','42501',null,'Anonymous state access is denied');
select throws_ok($$select public.train_crew('attack','crew_1',gen_random_uuid())$$,'42501',null,'Anonymous training is denied');
select throws_ok($$select public.start_ship_upgrade('attack',5,'ship_1',gen_random_uuid())$$,'42501',null,'Anonymous ship work is denied');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b2000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is(public.get_game_state()#>>'{training,progress,crew,tier_id}','crew_1','Crew starts with the free exercise');
select is(public.get_game_state()#>>'{training,progress,ship,xp}','0','Ship starts with zero XP');
select is(public.get_game_state()->>'energy','100','New captain retains full Energy');
select is(public.get_game_state()->>'gold_coins','0','New captain has zero coins');
select throws_ok($$update public.characters set energy=100,crew_attack=999$$,'42501',null,'Direct resource updates are denied');
select throws_ok('select * from private.character_training','42501',null,'Private progression is inaccessible');
select throws_ok('select * from private.ship_upgrade_jobs','42501',null,'Private jobs are inaccessible');
select throws_ok('select * from private.training_requests','42501',null,'Private receipts are inaccessible');
select throws_ok($$select private.crew_training_gain(1,0)$$,'42501',null,'Clients cannot choose their roll');
select throws_ok($$select private.settle_ship_upgrade(null,clock_timestamp())$$,'42501',null,'Clients cannot settle arbitrary captains');
select throws_ok($$select public.train_crew('health','crew_1',gen_random_uuid())$$,'22023','INVALID_STAT','Health is not trainable');
select throws_ok($$select public.train_crew(null,'crew_1',gen_random_uuid())$$,'22023','INVALID_STAT','Null stat rejected');
select throws_ok($$select public.train_crew('attack','crew_1',null)$$,'22023','INVALID_REQUEST','Request identity is required');
select throws_ok($$select public.train_crew('attack','crew_2',gen_random_uuid())$$,'22023','STALE_TIER','Client cannot select an unowned exercise');
select throws_ok($$select public.purchase_training_tier('crew','crew_3',gen_random_uuid())$$,'22023','INVALID_TIER','Cannot skip a tier');
select throws_ok($$select public.purchase_training_tier('crew','crew_2',gen_random_uuid())$$,'P0001','NOT_ENOUGH_XP','Purchase requires earned XP');

insert into training_results select 'crew',public.train_crew('attack','crew_1',crew_request) from training_fixture;
select ok((select (value->>'stat_gain')::numeric in (1.00623,2.01246) from training_results where key='crew'),'Real server RNG returns a valid gain');
select is(public.get_game_state()->>'crew_attack',(select (10+(value->>'stat_gain')::numeric)::text from training_results where key='crew'),'Reported gain matches durable stat');
select is(public.get_game_state()->>'energy','95','Drill pays five Energy once');
select is(public.get_game_state()#>>'{training,progress,crew,xp}','5','XP follows Energy, not random bonus');
select is((select public.train_crew('attack','crew_1',crew_request) from training_fixture),(select value from training_results where key='crew'),'Retry returns the original random result');
select is(public.get_game_state()->>'energy','95','Retry cannot charge again');
select throws_ok($$select public.train_crew('speed','crew_1',crew_request) from training_fixture$$,'22023','REQUEST_CONFLICT','Same request with a different stat is rejected');
select throws_ok($$select public.start_ship_upgrade('attack',5,'ship_1',crew_request) from training_fixture$$,'22023','REQUEST_CONFLICT','Request identity is shared across training actions');
select lives_ok($$select public.train_crew(s,'crew_1',gen_random_uuid()) from unnest(array['defense','speed','accuracy']) s$$,'All crew stats can be trained');
select is(public.get_game_state()#>>'{training,progress,crew,xp}','20','Four stats share one crew XP track');
select is(public.get_game_state()#>>'{training,progress,ship,xp}','0','Crew XP does not unlock workshops');
select is(public.get_game_state()->>'crew_health','100','Crew training does not affect health');
select is(public.get_game_state()->>'ship_attack','10','Crew training does not affect ship stats');

reset role;
update private.character_training set xp=100 where character_id=(select a from training_fixture) and training_group='crew';
update public.characters set gold_coins=0,bank_gold_coins=1000 where id=(select a from training_fixture);
set local role authenticated;
select throws_ok($$select public.purchase_training_tier('crew','crew_2',gen_random_uuid())$$,'P0001','NOT_ENOUGH_GOLD','Bank money cannot fund a tier');
reset role;
update public.characters set gold_coins=1000 where id=(select a from training_fixture);
set local role authenticated;
insert into training_results select 'purchase',public.purchase_training_tier('crew','crew_2',purchase_request) from training_fixture;
select is(public.get_game_state()->>'gold_coins','750','Purchase uses carried coins');
select is(public.get_game_state()->>'bank_gold_coins','1000','Purchase preserves bank coins');
select is(public.get_game_state()#>>'{training,progress,crew,xp}','100','Purchase does not consume XP');
select is(public.get_game_state()#>>'{training,progress,crew,tier_id}','crew_2','Purchased tier becomes active');
select is((select public.purchase_training_tier('crew','crew_2',purchase_request) from training_fixture),(select value from training_results where key='purchase'),'Purchase replay is stable');
select is(public.get_game_state()->>'gold_coins','750','Purchase replay does not charge twice');
select is((select public.train_crew('attack','crew_1',crew_request) from training_fixture),(select value from training_results where key='crew'),'Old training receipt survives a tier change');
insert into training_results select 'tier_two',public.train_crew('accuracy','crew_2',gen_random_uuid());
select is((select value->>'efficiency' from training_results where key='tier_two'),'1.15','Next drill uses the purchased tier');
select ok((select (value->>'stat_gain')::numeric=(value->>'normal_gain')::numeric*case when (value->>'perfect')::boolean then 2 else 1 end from training_results where key='tier_two'),'Perfect status uses normal gain rather than tier efficiency');

select throws_ok($$select public.start_ship_upgrade('attack',4,'ship_1',gen_random_uuid())$$,'22023','INVALID_ENERGY','Work below minimum rejected');
insert into training_results select 'ship',public.start_ship_upgrade('attack',5,'ship_1',ship_request) from training_fixture;
select is(public.get_game_state()->>'ship_attack','10','Ship stats wait for completion');
select is(public.get_game_state()#>>'{training,progress,ship,xp}','0','Ship XP waits for completion');
select is(public.get_game_state()#>>'{training,ship_job,stat_gain}','1.00623','Small job snapshots base gain');
select is(public.get_game_state()#>>'{training,ship_job,energy_cost}','5','Small job costs five Energy');
select is((select public.start_ship_upgrade('attack',5,'ship_1',ship_request) from training_fixture),(select value from training_results where key='ship'),'Start replay returns the same job');
select throws_ok($$select public.start_ship_upgrade('speed',50,'ship_1',gen_random_uuid())$$,'P0001','SHIP_WORK_ACTIVE','Only one job can be pending');

reset role;
select is((select extract(epoch from(finishes_at-started_at))::int from private.ship_upgrade_jobs where character_id=(select a from training_fixture) and applied_at is null),300,'Small job lasts five minutes');
update private.character_training set xp=100 where character_id=(select a from training_fixture) and training_group='ship';
set local role authenticated;
select lives_ok($$select public.purchase_training_tier('ship','ship_2',gen_random_uuid())$$,'Workshop can be bought while work is active');
select is(public.get_game_state()#>>'{training,ship_job,stat_gain}','1.00623','Workshop purchase leaves old job gain unchanged');
select is(public.get_game_state()#>>'{training,ship_job,workshop_id}','ship_1','Job keeps original workshop');
reset role;
update private.ship_upgrade_jobs set started_at=clock_timestamp()-interval '10 minutes',finishes_at=clock_timestamp()-interval '1 second'
where character_id=(select a from training_fixture) and applied_at is null;
set local role authenticated;
select is(public.get_game_state()->>'ship_attack','11.00623','Due job completes on access');
select is(public.get_game_state()#>>'{training,progress,ship,xp}','105','Job awards snapshotted XP once');
select is(public.get_game_state()#>'{training,ship_job}','null'::jsonb,'Completion frees the work slot');
select is(public.get_game_state()#>>'{training,last_ship_job,stat_gain}','1.00623','Last completion is available for feedback');
select is(public.get_game_state()->>'ship_attack','11.00623','Repeated reads cannot duplicate stats');
reset role;
insert into training_results select 'revision',to_jsonb(revision) from public.player_game_events where character_id=(select a from training_fixture);
set local role authenticated;
select public.get_game_state();
reset role;
select is((select to_jsonb(revision) from public.player_game_events where character_id=(select a from training_fixture)),
(select value from training_results where key='revision'),'Unchanged reads do not emit notifications');

-- Safe integer boundaries fail atomically.
update public.characters set crew_attack=9007199254740991,energy=100,energy_updated_at=clock_timestamp() where id=(select a from training_fixture);
set local role authenticated;
select throws_ok($$select public.train_crew('attack','crew_2',gen_random_uuid())$$,'P0001','PROGRESSION_LIMIT','Stat overflow is rejected');
select is(public.get_game_state()->>'energy','100','Overflow costs no Energy');
select is(public.get_game_state()->>'crew_attack','9007199254740991','Maximum stat survives JSON without precision loss');
reset role;
update public.characters set crew_attack=10 where id=(select a from training_fixture);
update private.character_training set xp=9007199254740991 where character_id=(select a from training_fixture) and training_group='crew';
set local role authenticated;
select throws_ok($$select public.train_crew('attack','crew_2',gen_random_uuid())$$,'P0001','PROGRESSION_LIMIT','XP overflow is rejected');
reset role;
update private.character_training set xp=105 where character_id=(select a from training_fixture) and training_group='crew';
update public.characters set energy=4,energy_updated_at=clock_timestamp() where id=(select a from training_fixture);
set local role authenticated;
select throws_ok($$select public.train_crew('attack','crew_2',gen_random_uuid())$$,'P0001','NOT_ENOUGH_ENERGY','Insufficient Energy is rejected');
select is(public.get_game_state()->>'energy','4','Rejected actions preserve Energy');
reset role;
update public.characters set energy_updated_at=clock_timestamp()-interval '5 minutes' where id=(select a from training_fixture);
set local role authenticated;
select lives_ok($$select public.train_crew('attack','crew_2',gen_random_uuid())$$,'Recovered Energy can be spent');
select is(public.get_game_state()->>'energy','4','Recovered five Energy pays one drill and preserves the remainder');

-- Two offline jobs, one completes before the encounter, the other during it.
reset role;
update public.characters set energy=100,energy_updated_at=clock_timestamp() where id=(select a from training_fixture);
set local role authenticated;
select public.start_ship_upgrade('speed',25,'ship_2',gen_random_uuid());
select is(public.get_game_state()#>>'{training,ship_job,stat_gain}','5.793975','Medium job snapshots five workshop units');
select is(public.get_game_state()#>>'{training,ship_job,energy_cost}','25','Medium work costs twenty-five Energy');
select set_config('request.jwt.claims','{"sub":"b2000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is(public.get_game_state()->>'crew_attack','10','Other captain retains independent stats');
select public.start_ship_upgrade('attack',50,'ship_1',gen_random_uuid());
select is(public.get_game_state()#>>'{training,ship_job,stat_gain}','10.089358','Large job snapshots ten workshop units');
select is(public.get_game_state()#>>'{training,ship_job,energy_cost}','50','Large work costs fifty Energy');
reset role;
update private.ship_upgrade_jobs set started_at=clock_timestamp()-interval '1 hour',finishes_at=clock_timestamp()-interval '1 second'
where character_id=(select d from training_fixture) and applied_at is null;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b2000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
insert into training_results select 'battle',public.start_combat(d,gen_random_uuid()) from training_fixture;
reset role;
select is((select ship_attack from public.characters where id=(select d from training_fixture)),20.089358::numeric,'Actual combat start settles offline defender work');
select is((select state#>>'{defender,ship,attack}' from private.combats where id=(select (value#>>'{battle,id}')::uuid from training_results where key='battle')),'20.089358','Defender snapshot includes completed upgrade');
update private.ship_upgrade_jobs set started_at=clock_timestamp()-interval '1 hour',finishes_at=clock_timestamp()-interval '1 second'
where character_id=(select a from training_fixture) and applied_at is null;
set local role authenticated;
select is(public.get_game_state()->>'ship_speed','15.793975','Jobs also complete during combat');
select throws_ok($$select public.train_crew('attack','crew_2',gen_random_uuid())$$,'P0001','IN_COMBAT','Attacker cannot start crew training');
select throws_ok($$select public.start_ship_upgrade('attack',5,'ship_2',gen_random_uuid())$$,'P0001','IN_COMBAT','Attacker cannot start ship work');
reset role;
select is((select snapshot#>>'{ship,speed}' from private.combat_participants where combat_id=(select (value#>>'{battle,id}')::uuid from training_results where key='battle') and character_id=(select a from training_fixture)),'10','Active battle snapshot is unchanged by completion');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b2000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_ok($$select public.train_crew('attack','crew_1',gen_random_uuid())$$,'P0001','IN_COMBAT','Defender cannot use crew training');
select set_config('request.jwt.claims','{"sub":"b2000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select throws_ok($$select public.train_crew('attack','crew_1',gen_random_uuid())$$,'42501','NOT_AUTHORIZED','Anonymous Auth users cannot train');
select is(public.get_game_state(),null::jsonb,'Anonymous Auth users cannot read state');
reset role;
delete from auth.users where id='b2000000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b2000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_ok($$select public.train_crew('attack','crew_1',gen_random_uuid())$$,'42501','NOT_AUTHORIZED','Deleted accounts cannot use old tokens');
select * from finish();
rollback;
