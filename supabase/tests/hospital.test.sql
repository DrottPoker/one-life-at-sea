begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
insert into auth.users(id,email,is_anonymous,raw_user_meta_data) values
('f6000000-0000-4000-8000-000000000001','hospital-a@example.test',false,'{"character_name":"Hospital A"}'),
('f6000000-0000-4000-8000-000000000002','hospital-d@example.test',false,'{"character_name":"Hospital D"}'),
('f6000000-0000-4000-8000-000000000003','hospital-anon@example.test',true,'{}');
create temporary table h as select
(select id from public.characters where user_id='f6000000-0000-4000-8000-000000000001') a,
(select id from public.characters where user_id='f6000000-0000-4000-8000-000000000002') d;
create temporary table hr(key text primary key,value jsonb);
grant select on h to authenticated;
grant all on hr to authenticated;
update public.characters set gold_coins=1000,bank_gold_coins=500 where id=(select a from h);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f6000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is(public.get_game_state()->>'hospital_until',null,'Healthy captains are not hospitalized');
select is(public.get_navigation_lock()->>'hospital_until',null,'Healthy navigation is unlocked');
select is((select public.get_hospital_status(a)->>'hospital_until' from h),null,'Healthy profile has no hospital stay');
select public.start_ship_upgrade('attack','small','ship_1',gen_random_uuid());
reset role;
update public.characters set crew_health=0 where id=(select a from h);
select is((select extract(epoch from(hospital_until-hospital_started_at))::int from public.characters where id=(select a from h)),300,'Crew death starts exactly five minutes');
insert into hr select 'until',to_jsonb(hospital_until) from public.characters where id=(select a from h);
set local role authenticated;
select ok(public.get_navigation_lock()->>'hospital_until' is not null,'Hospital navigation lock is server-owned');
select is(public.get_game_state()->>'crew_health','0','Hospital keeps the dead crew at zero');
select is(public.get_game_state()->>'health_next_at',null,'Normal health recovery does not bypass hospital');
select throws_ok($$select public.train_crew('attack','crew_1',gen_random_uuid())$$,'P0001','IN_HOSPITAL','Crew training is blocked');
select throws_ok($$select public.start_ship_upgrade('attack','small','ship_1',gen_random_uuid())$$,'P0001','IN_HOSPITAL','New ship work is blocked');
select throws_ok($$select public.purchase_training_tier('crew','crew_2',gen_random_uuid())$$,'P0001','IN_HOSPITAL','Exercise purchases are blocked');
select throws_ok($$select public.purchase_training_tier('ship','ship_2',gen_random_uuid())$$,'P0001','IN_HOSPITAL','Workshop purchases are blocked');
select throws_ok($$select public.transfer_gold('deposit',10,gen_random_uuid())$$,'P0001','IN_HOSPITAL','Bank deposits are blocked');
select throws_ok($$select public.transfer_gold('withdraw',10,gen_random_uuid())$$,'P0001','IN_HOSPITAL','Bank withdrawals are blocked');
select throws_ok($$select public.save_defence_orders('boarding')$$,'P0001','IN_HOSPITAL','Defence changes are blocked');
select is((select public.start_combat(d,gen_random_uuid())->>'error' from h),'IN_HOSPITAL','Attacks are blocked');
select is(public.get_game_state()->>'energy','95','Blocked actions cost no Energy');
select is(public.get_game_state()->>'gold_coins','1000','Blocked actions cost no gold');
select is(public.get_game_state()->>'bank_gold_coins','500','Bank balance remains intact');
select throws_ok($$update public.characters set hospital_until=null,hospital_started_at=null$$,'42501',null,'Clients cannot discharge themselves');
select throws_ok($$delete from public.hospital_patients$$,'42501',null,'Clients cannot edit the patient list');
select throws_ok($$select private.settle_hospital((select a from h),clock_timestamp()+interval '1 hour')$$,'42501',null,'Clients cannot choose discharge time');
select ok(exists(select 1 from jsonb_array_elements(public.list_hospital_patients()->'patients') p where p->>'display_name'='Hospital A'),'Patient sees hospital list');
select ok(not (public.list_hospital_patients()::text like '%@example.test%'),'List hides account data');
select ok(not (public.list_hospital_patients()::text like '%gold_coins%'),'List hides balances');
select set_config('request.jwt.claims','{"sub":"f6000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select ok(exists(select 1 from jsonb_array_elements(public.list_hospital_patients()->'patients') p where p->>'display_name'='Hospital A'),'Other registered players see patients');
select is((select public.get_hospital_status(a)->'hospital_until' from h),(select value from hr where key='until'),'Other players can read the exact hospital deadline');
select is((select array_agg(k order by k) from h,jsonb_object_keys(public.get_hospital_status(a)) k),array['hospital_until','observed_at'],'Profile hospital status exposes only deadline and server time');
select is((select public.get_combat_preview(a)->>'reason' from h),'TARGET_IN_HOSPITAL','Hospital patients cannot be attacked');
select is((select public.start_combat(a,gen_random_uuid())->>'error' from h),'TARGET_IN_HOSPITAL','Direct attack cannot bypass hospitalization');

reset role;
update private.ship_upgrade_jobs set started_at=clock_timestamp()-interval '1 hour',finishes_at=clock_timestamp()-interval '1 second' where character_id=(select a from h);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f6000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is(public.get_game_state()->>'ship_attack','11','Existing ship work completes passively in hospital');
select is(public.get_game_state()->'hospital_until',(select value from hr where key='until'),'Reads and passive work do not extend hospital stay');
reset role;
update public.characters set hospital_started_at=clock_timestamp()-interval '10 minutes',hospital_until=clock_timestamp()-interval '1 second'
  where id=(select a from h);
set local role authenticated;
select ok(not exists(select 1 from jsonb_array_elements(public.list_hospital_patients()->'patients') p where p->>'display_name'='Hospital A'),'Expired offline patients leave the list without signing in');
select is((select public.get_hospital_status(a)->>'hospital_until' from h),null,'Offline expiry disappears from profile status without owner access');
select is(public.get_game_state()->>'hospital_until',null,'Discharge is automatic on server access');
select is(public.get_game_state()->>'crew_health','100','Crew returns at full health');
select is(public.get_game_state()->>'ship_health','100','Ship returns at full health');
select is(public.get_game_state()->>'ship_attack','11','Discharge preserves trained stats');
select is(public.get_game_state()->>'gold_coins','1000','Discharge preserves gold');
select is(public.get_game_state()->>'bank_gold_coins','500','Discharge preserves bank coins');
select lives_ok($$select public.train_crew('attack','crew_1',gen_random_uuid())$$,'Training resumes after discharge');
select lives_ok($$select public.transfer_gold('deposit',10,gen_random_uuid())$$,'Bank resumes after discharge');

reset role;
update public.characters set ship_health=0,crew_health=100 where id=(select a from h);
select is((select crew_health from public.characters where id=(select a from h)),0,'Sinking also kills the crew outside PvP');
select is((select extract(epoch from(hospital_until-hospital_started_at))::int from public.characters where id=(select a from h)),300,'Sinking starts one five-minute stay');
insert into hr select 'sink_until',to_jsonb(hospital_until) from public.characters where id=(select a from h);
update public.characters set crew_health=0 where id=(select a from h);
select is((select to_jsonb(hospital_until) from public.characters where id=(select a from h)),(select value from hr where key='sink_until'),'Repeated zero-health writes do not extend a stay');
update public.characters set hospital_started_at=clock_timestamp()-interval '6 minutes',hospital_until=clock_timestamp()-interval '1 second' where id=(select a from h);
set local role authenticated;
select public.get_game_state();

-- Deterministic PvP: guarantee hits and protect the attacking fixture.
reset role;
update public.characters set ship_attack=1000000,ship_accuracy=1000000,ship_defense=1000000000,ship_speed=10 where id=(select a from h);
set local role authenticated;
insert into hr select 'battle',public.start_combat(d,gen_random_uuid()) from h;
insert into hr select 'kill',public.submit_combat_order((value#>>'{battle,id}')::uuid,0,'fire',gen_random_uuid()) from hr where key='battle';
select is((select value#>>'{battle,outcome}' from hr where key='kill'),'hull_victory','Sinking still credits the final blow');
select is((select value#>>'{battle,defender,crew_health}' from hr where key='kill'),'0','Battle snapshot records crew death when ship sinks');
select is(public.get_game_state()->>'hospital_until',null,'Surviving winner stays out of hospital');
reset role;
select ok((select hospital_until>clock_timestamp() from public.characters where id=(select d from h)),'PvP defender is hospitalized');
select is((select extract(epoch from(hospital_until-hospital_started_at))::int from public.characters where id=(select d from h)),300,'PvP hospital duration matches event time');
select is((select count(*)::integer from private.combat_engagements where character_id in(select a from h union select d from h)),0,'Lethal fight releases all participants');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f6000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_ok($$select public.train_crew('attack','crew_1',gen_random_uuid())$$,'P0001','IN_HOSPITAL','PvP loser cannot train');
reset role;

-- A lethal counterattack sends the attacker to hospital too.
update public.characters set hospital_started_at=null,hospital_until=null,ship_health=100,crew_health=100,protected_until=null where id in(select a from h union select d from h);
update public.characters set ship_attack=1,ship_accuracy=1,ship_defense=1,ship_speed=1,energy=100 where id=(select a from h);
update public.characters set ship_attack=1000000,ship_accuracy=1000000,ship_defense=1000000000,ship_speed=1 where id=(select d from h);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f6000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
insert into hr select 'counter',public.start_combat(d,gen_random_uuid()) from h;
select public.submit_combat_order((value#>>'{battle,id}')::uuid,0,'fire',gen_random_uuid()) from hr where key='counter';
select ok(public.get_game_state()->>'hospital_until' is not null,'Lethal counterattack hospitalizes the attacker');
select is(public.get_game_state()->>'crew_health','0','Attacker crew dies with its ship');
select is(public.get_game_state()->>'active_attack',null,'Hospital overrides the ended attack lock');

-- Environmental damage also releases an active encounter cleanly.
reset role;
update public.characters set hospital_started_at=null,hospital_until=null,ship_health=100,crew_health=100,protected_until=null,energy=100 where id in(select a from h union select d from h);
set local role authenticated;
insert into hr select 'hazard',public.start_combat(d,gen_random_uuid()) from h;
reset role;
update public.characters set crew_health=0 where id=(select d from h);
set local role authenticated;
select is(public.get_game_state()->>'active_attack',null,'Environmental death ends an existing attack');
select is((select public.get_combat((value#>>'{battle,id}')::uuid)->>'outcome' from hr where key='hazard'),'draw','Environmental interruption invents no PvP winner');
select is((select person->>'status' from hr,jsonb_array_elements(public.get_combat((value#>>'{battle,id}')::uuid)->'people') person where key='hazard' and person->>'role'='defender'),'defeated','Environmentally defeated defender is recorded correctly');
reset role;
select is((select count(*)::integer from private.combat_engagements where character_id in(select a from h union select d from h)),0,'Environmental death leaves no dangling engagement');
select is((select hospital_until is not null from public.characters where id=(select d from h)),true,'Environmental patient remains hospitalized');
set local role anon;
select throws_ok('select public.get_hospital_status(gen_random_uuid())','42501',null,'Anonymous visitors cannot read profile hospital status');
select throws_ok('select public.list_hospital_patients()','42501',null,'Anonymous visitors cannot read patient list');
select throws_ok('select * from public.hospital_patients','42501',null,'Anonymous direct list access is denied');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f6000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select is((public.list_hospital_patients()->>'total')::int,0,'Anonymous Auth accounts cannot enumerate patients');
select is((select public.get_hospital_status(d)->>'hospital_until' from h),null,'Anonymous Auth accounts cannot read patient profile status');
select * from finish();
rollback;
