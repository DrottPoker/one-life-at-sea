begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();

select is((select data_type from information_schema.columns where table_schema='public' and table_name='characters' and column_name='energy'),'integer','Energy storage remains whole numbers');
select ok(not exists(select 1 from information_schema.columns where table_schema='public' and table_name='characters' and column_name='energy_paused_at'),'Obsolete pause metadata is removed');
select ok(not has_function_privilege('authenticated','private.energy_tick_snapshot(integer,timestamptz,timestamptz,bigint)','execute'),'Clients cannot supply a recovery clock');
select is((select energy from private.energy_snapshot(10,'2026-01-01 00:04:59Z','2026-01-01 00:04:59.999999Z')),10,'No harbor award before 00:05');
select is((select energy from private.energy_snapshot(10,'2026-01-01 00:04:59Z','2026-01-01 00:05Z')),15,'A captain arriving one second before the fixed tick receives it');
select is((select energy from private.energy_snapshot(10,'2026-01-01 00:01Z','2026-01-01 00:05Z')),15,'Different action times receive the same tick');
select is((select energy from private.energy_snapshot(10,'2026-01-01 00:05Z','2026-01-01 00:05Z')),10,'A settled tick cannot be credited twice');
select is((select energy from private.energy_snapshot(10,'2026-01-01 00:05:01Z','2026-01-01 00:09:59Z')),10,'New characters cannot claim a preceding tick');
select is((select energy from private.energy_snapshot(10,'2026-01-01 00:05:01Z','2026-01-01 00:10Z')),15,'Next tick does not depend on the character timer');
select is((select energy from private.energy_tick_snapshot(10,'2026-01-01 00:01Z','2026-01-01 00:05Z',600)),10,'Sea skips the 00:05 tick');
select is((select energy from private.energy_tick_snapshot(10,'2026-01-01 00:01Z','2026-01-01 00:10Z',600)),15,'Sea receives exactly five at 00:10');
select is((select energy from private.energy_tick_snapshot(10,'2026-01-01 00:01Z','2026-01-01 00:30Z',600)),25,'Offline sea recovery counts all ten-minute ticks');
select is((select energy from private.energy_tick_snapshot(10,'2026-01-01 00:01Z','2026-01-01 00:30Z',300)),40,'Harbor has exactly twice as many ticks');
select is((select energy from private.energy_snapshot(98,'2026-01-01 00:01Z','2026-01-01 00:05Z')),100,'A tick clamps to the integer cap');
select is((select energy from private.energy_snapshot(95,(select energy_updated_at from private.energy_snapshot(100,'2026-01-01Z','2026-01-01 00:12Z')),'2026-01-01 00:14Z')),95,'Spending from full Energy cannot reclaim banked ticks');
select is((select energy from private.energy_snapshot(50,'2026-01-01 00:05Z','2026-01-01 00:04Z')),50,'Backwards observations cannot subtract Energy');
select is((select energy_updated_at from private.energy_snapshot(50,'2026-01-01 00:05Z','2026-01-01 00:04Z')),'2026-01-01 00:05Z'::timestamptz,'Backwards observations cannot rewind settlement');
set local time zone 'America/New_York';
select is((select energy from private.energy_snapshot(10,'2026-03-08 01:59:59-05','2026-03-08 03:00:00-04')),15,'DST changes do not shift server ticks');
set local time zone 'UTC';

insert into auth.users(id,email,is_anonymous,raw_user_meta_data) values
('a8500000-0000-4000-8000-000000000001','energy-ticks-one@example.test',false,'{"character_name":"Energy Ticks One"}'),
('a8500000-0000-4000-8000-000000000002','energy-ticks-two@example.test',false,'{"character_name":"Energy Ticks Two"}');
create temp table f as select id,user_id from public.characters where user_id::text like 'a8500000-0000-4000-8000-%';
grant select on f to authenticated;
update public.characters set location='open_sea',sea_step=2,sea_visit_id=gen_random_uuid(),
  sea_place_id='deep_water',sea_place_name='Deep water',energy=10,energy_updated_at='2026-01-01 00:00:01Z' where id in(select id from f);
select is((select x.energy from public.characters c cross join lateral private.character_energy_snapshot(c,'2026-01-01 00:05Z') x where c.id=(select min(id::text)::uuid from f)),10,'Stopped sea captain uses the slower clock');
update public.characters set location='traveling',sea_visit_id=null,sea_place_id=null,sea_place_name=null,
  travel_id=gen_random_uuid(),travel_kind='return',travel_target_step=0,travel_place_id='the_harbor',travel_place_name='The Harbor',
  travel_started_at='2026-01-01 00:09Z',travel_arrives_at='2026-01-01 00:12Z' where id in(select id from f);
select is((select x.energy from public.characters c cross join lateral private.character_energy_snapshot(c,'2026-01-01 00:11Z') x where c.id=(select min(id::text)::uuid from f)),15,'Return journey earns the sea tick');
select is((select x.energy from public.characters c cross join lateral private.character_energy_snapshot(c,'2026-01-01 00:20Z') x where c.id=(select min(id::text)::uuid from f)),25,'Offline return splits sea and harbor ticks at its real deadline');
update public.characters set travel_arrives_at='2026-01-01 00:15Z' where id in(select id from f);
select is((select x.energy from public.characters c cross join lateral private.character_energy_snapshot(c,'2026-01-01 00:15Z') x where c.id=(select min(id::text)::uuid from f)),20,'Arrival exactly at a harbor-only tick receives that tick');
update public.characters set travel_arrives_at='2026-01-01 00:10Z' where id in(select id from f);
select is((select x.energy from public.characters c cross join lateral private.character_energy_snapshot(c,'2026-01-01 00:10Z') x where c.id=(select min(id::text)::uuid from f)),15,'Arrival at a shared tick receives one award, not two');
select private.settle_sea_travel(id,'2026-01-01 00:15Z') from f;
select is((select min(energy) from public.characters where id in(select id from f)),20,'Arrival materializes all due awards');
select private.settle_sea_travel(id,'2026-01-01 00:15Z') from f;
select is((select min(energy) from public.characters where id in(select id from f)),20,'Arrival and repeated reads cannot duplicate ticks');

-- Use a previous global boundary to exercise the real RPC without waiting for wall time.
update public.characters set energy=0,energy_updated_at=date_bin(interval '5 minutes',clock_timestamp(),'1970-01-01Z')-interval '1 second'
  where id in(select id from f);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a8500000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is(public.get_game_state()->>'energy','5','RPC exposes the last due server tick');
select is(mod(extract(epoch from (public.get_game_state()->>'energy_next_at')::timestamptz),300),0::numeric,'Harbor next deadline is a fixed five-minute boundary');
select is(public.get_game_state()->>'energy','5','Repeated RPC reads do not award twice');
select public.train_crew('attack','crew_1',gen_random_uuid());
select is(public.get_game_state()->>'energy','0','Training spends recovered Energy once');
reset role;
update public.characters set location='open_sea',sea_step=1,sea_visit_id=gen_random_uuid(),
  sea_place_id='deep_water',sea_place_name='Deep water',energy=0,
  energy_updated_at=date_bin(interval '10 minutes',clock_timestamp(),'1970-01-01Z')-interval '1 second'
  where id in(select id from f);
set local role authenticated;
select is(public.get_game_state()->>'energy','5','Sea RPC recovers before scouting');
select is(mod(extract(epoch from (public.get_game_state()->>'energy_next_at')::timestamptz),600),0::numeric,'Sea next deadline is a fixed ten-minute boundary');
create temp table scout_result as select gen_random_uuid() request_id, (public.get_game_state()#>>'{sea,version}')::uuid version;
select lives_ok($$select public.scout_nearby_ships(version,request_id) from scout_result$$,'Scouting can spend freshly recovered Energy');
select is(public.get_game_state()->>'energy','0','Scouting settles and spends the tick atomically');
select lives_ok($$select public.scout_nearby_ships(version,request_id) from scout_result$$,'Scouting retry reads its old receipt');
select is(public.get_game_state()->>'energy','0','Scouting retry does not restore or spend another tick');
select * from finish();
rollback;
