begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();

insert into auth.users(id,email,is_anonymous,raw_user_meta_data)
select ('a8300000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'scout-'||n||'@example.test',false,
  jsonb_build_object('character_name','Scout Test '||lpad(n::text,2,'0')) from generate_series(1,32) n;
insert into auth.users(id,email,is_anonymous,raw_user_meta_data)
values('a8300000-0000-4000-8000-000000000099','scout-anon@example.test',true,'{}');
create temp table scout_fixture as select id,user_id,right(user_id::text,12)::integer n from public.characters
  where user_id::text like 'a8300000-0000-4000-8000-%';
grant select on scout_fixture to authenticated;
update public.characters set location='open_sea',sea_step=7000,sea_visit_id=gen_random_uuid(),
  sea_place_id='deep_water',sea_place_name='Deep water',energy_updated_at=clock_timestamp(),energy=60,
  ship_defense=10000,ship_speed=10000
  where id in(select id from scout_fixture where n<>7);
update public.characters set sea_place_id='sharp_rocks',sea_place_name='Sharp rocks' where id=(select id from scout_fixture where n=2);
update public.characters set sea_step=7001 where id=(select id from scout_fixture where n=6);
update public.characters set location='traveling',sea_step=6999,sea_place_id=null,sea_place_name=null,
  travel_id=gen_random_uuid(),travel_kind='onward',travel_target_step=7000,travel_place_id='deep_water',travel_place_name='Deep water',
  travel_started_at=clock_timestamp()-interval '61 seconds',travel_arrives_at=clock_timestamp()+interval '30 minutes'
  where id in(select id from scout_fixture where n in(4,5,8));
update public.characters set travel_arrives_at=clock_timestamp()-interval '1 second' where id=(select id from scout_fixture where n=5);
create temp table scout_requests as select gen_random_uuid() first_id,gen_random_uuid() second_id,
  (select sea_version from public.characters where id=(select id from scout_fixture where n=1)) version;
create temp table scout_results(key text primary key,value jsonb);
grant select on scout_requests to authenticated;
grant all on scout_results to authenticated;

select ok((select bool_and(relrowsecurity) from pg_class where oid in('private.sea_scouts'::regclass,'private.sea_scout_targets'::regclass)),'Scout tables have RLS');
select ok(not exists(select 1 from pg_publication_tables where tablename in('sea_scouts','sea_scout_targets')),'Scout snapshots are not broadcast');
select ok((select confrelid='public.character_profiles'::regclass from pg_constraint where conrelid='private.sea_scout_targets'::regclass and conname='sea_scout_targets_target_id_fkey'),'Sightings reference stable public identities without locking private game rows');
set local role anon;
select throws_ok($$select public.scout_nearby_ships(gen_random_uuid(),gen_random_uuid())$$,'42501',null,'Logged-out scouting denied');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a8300000-0000-4000-8000-000000000099","role":"authenticated"}',true);
select throws_ok($$select public.get_sea_scout()$$,'42501','NOT_AUTHORIZED','Anonymous Auth cannot read scouting');
select set_config('request.jwt.claims','{"sub":"a8300000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select throws_ok('select * from private.sea_scouts','42501',null,'Scouting receipts remain private');
select throws_ok('select * from private.sea_scout_targets','42501',null,'Discovered target rows remain private');
select throws_ok($$select private.effective_sea_distance(null,clock_timestamp())$$,'42501',null,'Clients cannot bypass target discovery');
select is(public.get_sea_scout(),null::jsonb,'No free result before scouting');
select is((select public.get_combat_preview(id)->>'reason' from scout_fixture where n=2),'SCOUT_REQUIRED','A direct attack link does not bypass scouting');
select is((select public.get_character_status(id)->>'can_attack_here' from scout_fixture where n=2),'false','Profile attack is disabled before scouting');
select throws_ok($$select public.scout_nearby_ships(null,gen_random_uuid())$$,'22023','INVALID_REQUEST','Scouting requires a voyage version');
select throws_ok($$select public.scout_nearby_ships(gen_random_uuid(),gen_random_uuid())$$,'P0001','STALE_VOYAGE','Stale visit does not charge Energy');
insert into scout_results select 'first',public.scout_nearby_ships(version,first_id) from scout_requests;
select is(public.get_game_state()->>'energy','55','Scouting charges exactly five Energy');
select ok(public.get_game_state()->>'energy_next_at' is not null,'Spending Energy at sea keeps the global recovery deadline');
select is((select value->>'total' from scout_results where key='first'),'27','All eligible captains are found regardless of place type');
select is((select public.scout_nearby_ships(version,first_id) from scout_requests),(select value from scout_results where key='first'),'Repeated request returns the same receipt');
select is(public.get_game_state()->>'energy','55','Retry does not charge again');
select throws_ok($$select public.scout_nearby_ships(gen_random_uuid(),first_id) from scout_requests$$,'22023','REQUEST_CONFLICT','A receipt cannot be reused with different content');
select is(public.get_sea_scout()->>'total','27','Saved list contains every discovered captain');
select is(jsonb_array_length(public.get_sea_scout()->'players'),25,'Result page is bounded');
select is(jsonb_array_length(public.get_sea_scout(1)->'players'),2,'Remaining captains are accessible on the next page');
select is(public.get_sea_scout(999)->>'page','1','Large pages clamp to the final page');
select is(public.get_sea_scout(-1)->>'page','0','Negative pages clamp to the first page');
select is((select count(*)::int from jsonb_array_elements(public.get_sea_scout()->'players') p
  where p->>'character_id' in(select id::text from scout_fixture where n in(1,4,6,7,8))),0,'Self, harbor, other distance and travelers are excluded');
select is((select count(*)::int from jsonb_array_elements(public.get_sea_scout()->'players') p
  where p->>'character_id'=(select id::text from scout_fixture where n=5)),1,'An arrived offline ship is included');
select is((select array_agg(k order by k) from jsonb_object_keys(public.get_sea_scout()#>'{players,0}') k),
  array['character_id','display_name','position'],'List reveals only identity and ordering');
select is((select public.get_character_status(id)->>'can_attack_here' from scout_fixture where n=5),'true','Offline arrival is eligible on its profile before owner login');
select is((select public.get_character_status(id)->>'can_attack_here' from scout_fixture where n=2),'true','Different place types at the same distance may fight');
select is(public.get_game_state()->>'energy','55','Reading and paging the saved list is free');
select set_config('request.jwt.claims','{"sub":"a8300000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is(public.get_sea_scout(),null::jsonb,'Another captain cannot read the paid result');
select is((select public.start_combat(id,gen_random_uuid())->>'error' from scout_fixture where n=1),'SCOUT_REQUIRED','Discovery is not reciprocal');
reset role;
select is((select location from public.characters where id=(select id from scout_fixture where n=5)),'traveling','Scouting did not write another captain arrival state');
update public.characters set travel_arrives_at=clock_timestamp()-interval '1 second' where id=(select id from scout_fixture where n=8);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a8300000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is(public.get_sea_scout()->>'total','27','Later arrivals are not added for free');
select is((select public.start_combat(id,gen_random_uuid())->>'error' from scout_fixture where n=8),'SCOUT_REQUIRED','A later arrival needs another scout');
insert into scout_results select 'battle',public.start_combat(id,gen_random_uuid()) from scout_fixture where n=2;
select ok((select value ? 'battle' from scout_results where key='battle'),'A discovered ship can be attacked at sea');
select is(public.get_game_state()->>'energy','45','Starting battle keeps its separate ten Energy cost');
select throws_ok($$select public.scout_nearby_ships(version,second_id) from scout_requests$$,'P0001','IN_COMBAT','An attacker cannot scout mid-battle');
select throws_ok($$select public.return_to_harbor((public.get_game_state()#>>'{sea,version}')::uuid,gen_random_uuid())$$,'P0001','IN_COMBAT','Attacker cannot sail away from a sea battle');
select set_config('request.jwt.claims','{"sub":"a8300000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_ok($$select public.scout_nearby_ships((public.get_game_state()#>>'{sea,version}')::uuid,gen_random_uuid())$$,'P0001','IN_COMBAT','Defender cannot scout mid-battle');
select throws_ok($$select public.return_to_harbor((public.get_game_state()#>>'{sea,version}')::uuid,gen_random_uuid())$$,'P0001','IN_COMBAT','Defender cannot sail away');
select set_config('request.jwt.claims','{"sub":"a8300000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select ok((select public.submit_combat_order((value#>>'{battle,id}')::uuid,0,'retreat',gen_random_uuid()) ? 'battle' from scout_results where key='battle'),'Orders and retreat work at sea');
select is(public.get_game_state()#>>'{sea,state}','at_sea','A surviving attacker stays at its sea location');
select ok(public.get_game_state()->>'energy_next_at' is not null,'Sea recovery continues after retreat');
select is((select public.get_combat_preview(id)->>'reason' from scout_fixture where n=2),'TARGET_PROTECTED','Existing protection still applies at sea');
insert into scout_results select 'second',public.scout_nearby_ships(version,second_id) from scout_requests;
select is(public.get_game_state()->>'energy','40','A deliberate new scouting costs another five Energy');
select is(public.get_sea_scout()->>'total','28','A new scouting includes the later arrival');
select is(public.get_game_state()#>>'{sea,scout_id}',(select second_id::text from scout_requests),'Latest scouting drives the game view');
reset role;
select is((select count(*)::int from private.sea_scout_targets where character_id=(select id from scout_fixture where n=1)),28,'Only the latest result membership is retained');
update public.characters set sea_visit_id=gen_random_uuid() where id=(select id from scout_fixture where n=3);
set local role authenticated;
select is((select public.start_combat(id,gen_random_uuid())->>'error' from scout_fixture where n=3),'SCOUT_REQUIRED','An old sighting cannot track a ship into a later visit at the same distance');
select set_config('request.jwt.claims','{"sub":"a8300000-0000-4000-8000-000000000005","role":"authenticated"}',true);
select public.return_to_harbor((public.get_game_state()#>>'{sea,version}')::uuid,gen_random_uuid());
select set_config('request.jwt.claims','{"sub":"a8300000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is((select public.start_combat(id,gen_random_uuid())->>'error' from scout_fixture where n=5),'TARGET_TRAVELING','A departed sighting cannot be attacked');
select is((select public.get_character_status(id)->>'can_attack_here' from scout_fixture where n=5),'false','Departed profile disables Attack');
select is(public.get_sea_scout()->>'total','28','Saved results do not silently replace departed ships');
select is((select public.start_combat(id,gen_random_uuid())->>'error' from scout_fixture where n=6),'DIFFERENT_LOCATION','Different sea distances cannot fight');

reset role;
update public.characters set energy=4 where id=(select id from scout_fixture where n=1);
set local role authenticated;
select throws_ok($$select public.scout_nearby_ships(version,gen_random_uuid()) from scout_requests$$,'P0001','NOT_ENOUGH_ENERGY','Insufficient Energy cannot scout');
select is(public.get_game_state()->>'energy','4','Rejected scouting leaves Energy untouched');
select is(public.get_game_state()#>>'{sea,scout_id}',(select second_id::text from scout_requests),'Rejected scouting preserves the result');
reset role;
update public.characters set energy=5 where id=(select id from scout_fixture where n=1);
update public.characters set sea_step=7002 where id in(select id from scout_fixture where n not in(1,4,5,7));
set local role authenticated;
select public.scout_nearby_ships(version,gen_random_uuid()) from scout_requests;
select is(public.get_sea_scout()->>'total','0','Empty scouting is a saved result');
select is(public.get_game_state()->>'energy','0','Empty scouting still costs five Energy');
select public.return_to_harbor((public.get_game_state()#>>'{sea,version}')::uuid,gen_random_uuid());
select is(public.get_sea_scout(),null::jsonb,'Leaving hides the saved result');
select throws_ok($$select public.scout_nearby_ships((public.get_game_state()#>>'{sea,version}')::uuid,gen_random_uuid())$$,'P0001','NOT_AT_SEA','Cannot scout while traveling');
reset role;
select private.settle_sea_travel(id,travel_arrives_at) from public.characters where id=(select id from scout_fixture where n=1);
set local role authenticated;
select throws_ok($$select public.scout_nearby_ships((public.get_game_state()#>>'{sea,version}')::uuid,gen_random_uuid())$$,'P0001','NOT_AT_SEA','Cannot scout in harbor');

-- A later voyage cannot reuse sightings from an earlier visit.
select public.scout_nearby_ships(version,first_id) from scout_requests;
select is(public.get_sea_scout(),null::jsonb,'Replaying an old receipt at home cannot restore a result');
reset role;
update public.characters set energy=10,energy_updated_at=clock_timestamp() where id=(select id from scout_fixture where n=1);
select public.depart_harbor((public.get_game_state()#>>'{sea,version}')::uuid,gen_random_uuid());
select private.settle_sea_travel(id,travel_arrives_at) from public.characters where id=(select id from scout_fixture where n=1);
update public.characters set sea_step=7000 where id in(select id from scout_fixture where n in(1,3));
select is(public.get_sea_scout(),null::jsonb,'New visit has no saved scouting result');
select is((select public.start_combat(id,gen_random_uuid())->>'error' from scout_fixture where n=3),'SCOUT_REQUIRED','An earlier voyage does not grant attack access in a new visit');

-- Sea defeat preserves the distance record and sends the defeated captain to Hospital.
update public.characters set ship_attack=1000000000,ship_accuracy=1000000000,ship_speed=1000000000 where id=(select id from scout_fixture where n=9);
update public.characters set ship_health=1,ship_speed=1,ship_recovery_at=clock_timestamp()+interval '1 hour' where id=(select id from scout_fixture where n=10);
select set_config('request.jwt.claims','{"sub":"a8300000-0000-4000-8000-000000000009","role":"authenticated"}',true);
select public.scout_nearby_ships((public.get_game_state()#>>'{sea,version}')::uuid,gen_random_uuid());
insert into scout_results select 'sink',public.start_combat(id,gen_random_uuid()) from scout_fixture where n=10;
select is((select public.submit_combat_order((value#>>'{battle,id}')::uuid,0,'fire',gen_random_uuid())#>>'{battle,outcome}'
  from scout_results where key='sink'),'hull_victory','Sea combat resolves a sinking normally');
select is((select location from public.characters where id=(select id from scout_fixture where n=10)),'the_harbor','Defeated sea captain returns to harbor Hospital');
select ok((select hospital_until is not null and location='the_harbor' from public.characters where id=(select id from scout_fixture where n=10)),'Defeat starts Hospital and restores the harbor recovery rate');
select is((select max_sea_distance from public.characters where id=(select id from scout_fixture where n=10)),7002,'Sea defeat preserves the distance record');
select is(public.get_game_state()#>>'{sea,state}','at_sea','Victorious captain stays at the sea stop');
select ok(public.get_game_state()->>'energy_next_at' is not null,'Sea recovery continues after victory');

-- Joining also requires the joining captain's own discovery.
select set_config('request.jwt.claims','{"sub":"a8300000-0000-4000-8000-000000000011","role":"authenticated"}',true);
select public.scout_nearby_ships((public.get_game_state()#>>'{sea,version}')::uuid,gen_random_uuid());
insert into scout_results select 'shared',public.start_combat(id,gen_random_uuid()) from scout_fixture where n=13;
select set_config('request.jwt.claims','{"sub":"a8300000-0000-4000-8000-000000000012","role":"authenticated"}',true);
select is((select public.start_combat(id,gen_random_uuid())->>'error' from scout_fixture where n=13),'SCOUT_REQUIRED','Shared attack links do not bypass the joining captain scouting');
select public.scout_nearby_ships((public.get_game_state()#>>'{sea,version}')::uuid,gen_random_uuid());
select is((select public.start_combat(id,gen_random_uuid())#>>'{battle,id}' from scout_fixture where n=13),
  (select value#>>'{battle,id}' from scout_results where key='shared'),'A discovered sea target accepts a second attacker');
select set_config('request.jwt.claims','{"sub":"a8300000-0000-4000-8000-000000000011","role":"authenticated"}',true);
select public.submit_combat_order((value#>>'{battle,id}')::uuid,0,'retreat',gen_random_uuid()) from scout_results where key='shared';
select set_config('request.jwt.claims','{"sub":"a8300000-0000-4000-8000-000000000013","role":"authenticated"}',true);
select throws_ok($$select public.return_to_harbor((public.get_game_state()#>>'{sea,version}')::uuid,gen_random_uuid())$$,'P0001','IN_COMBAT','Defender remains travel-locked while one sea attacker remains');
select set_config('request.jwt.claims','{"sub":"a8300000-0000-4000-8000-000000000012","role":"authenticated"}',true);
select public.submit_combat_order((value#>>'{battle,id}')::uuid,0,'retreat',gen_random_uuid()) from scout_results where key='shared';
select set_config('request.jwt.claims','{"sub":"a8300000-0000-4000-8000-000000000013","role":"authenticated"}',true);
select lives_ok($$select public.return_to_harbor((public.get_game_state()#>>'{sea,version}')::uuid,gen_random_uuid())$$,'All attackers leaving frees the defender to sail');

select * from finish();
rollback;
