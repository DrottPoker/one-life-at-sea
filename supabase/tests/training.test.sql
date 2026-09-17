begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select is((select energy from private.energy_snapshot(50, '2026-01-01 00:00Z', '2026-01-01 00:04:59Z')), 50, 'Energy does not recover before five minutes');
select is((select energy from private.energy_snapshot(50, '2026-01-01 00:00Z', '2026-01-01 00:05Z')), 51, 'Energy recovers exactly at five minutes');
select is((select energy from private.energy_snapshot(50, '2026-01-01 00:00Z', '2026-01-01 00:12Z')), 52, 'Offline recovery includes complete intervals');
select is((select energy_updated_at from private.energy_snapshot(50, '2026-01-01 00:00Z', '2026-01-01 00:12Z')), '2026-01-01 00:10Z'::timestamptz, 'Partial intervals are preserved');
select is((select energy from private.energy_snapshot(99, '2026-01-01 00:00Z', '2026-02-01 00:00Z')), 100, 'Recovery stops at the cap');
select is((select energy_updated_at from private.energy_snapshot(99, '2026-01-01 00:00Z', '2026-02-01 00:00Z')), '2026-02-01 00:00Z'::timestamptz, 'Full energy cannot bank recovery time');
select is((select energy from private.energy_snapshot(50, '2026-01-01 00:05Z', '2026-01-01 00:00Z')), 50, 'A backwards clock cannot subtract energy');

insert into auth.users (id, email, is_anonymous, raw_user_meta_data) values
('b2000000-0000-4000-8000-000000000001','training-one@example.test',false,'{"character_name":"Training Captain"}'),
('b2000000-0000-4000-8000-000000000002','training-two@example.test',false,'{"character_name":"Other Training Captain"}'),
('b2000000-0000-4000-8000-000000000003','training-anon@example.test',true,'{}');

set local role anon;
select throws_ok('select public.get_game_state()', '42501', null, 'Anonymous callers cannot read game state');
select throws_ok($$select public.train_stat('crew','attack')$$, '42501', null, 'Anonymous callers cannot train');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b2000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is((public.get_game_state()->>'energy')::int,100,'A new captain starts with full energy');
select is((public.get_game_state()->>'ship_health')::int,100,'Ship health starts at 100');
select is((public.get_game_state()->>'crew_health')::int,100,'Crew health starts at 100');
select is((public.get_game_state()->>'ship_attack')::int,10,'New captain ship_attack starts at ten');
select is((public.get_game_state()->>'ship_defense')::int,10,'New captain ship_defense starts at ten');
select is((public.get_game_state()->>'ship_speed')::int,10,'New captain ship_speed starts at ten');
select is((public.get_game_state()->>'ship_accuracy')::int,10,'New captain ship_accuracy starts at ten');
select is((public.get_game_state()->>'crew_attack')::int,10,'New captain crew_attack starts at ten');
select is((public.get_game_state()->>'crew_defense')::int,10,'New captain crew_defense starts at ten');
select is((public.get_game_state()->>'crew_speed')::int,10,'New captain crew_speed starts at ten');
select is((public.get_game_state()->>'crew_accuracy')::int,10,'New captain crew_accuracy starts at ten');
select throws_ok($$update public.characters set energy=100,crew_attack=999$$,'42501',null,'Direct API updates cannot mint energy or stats');
select throws_ok($$select public.train_stat('captain','attack')$$,'22023',null,'Unknown groups are rejected');
select throws_ok($$select public.train_stat('crew','health')$$,'22023',null,'Health cannot be trained as a stat');
select throws_ok($$select public.train_stat(null,'attack')$$,'22023',null,'Null input is rejected');
select lives_ok($$select public.train_stat('crew','attack')$$,'Training crew attack succeeds');
select is((public.get_game_state()->>'crew_attack')::int,11,'crew attack gains exactly one point');
select lives_ok($$select public.train_stat('crew','defense')$$,'Training crew defense succeeds');
select is((public.get_game_state()->>'crew_defense')::int,11,'crew defense gains exactly one point');
select lives_ok($$select public.train_stat('crew','speed')$$,'Training crew speed succeeds');
select is((public.get_game_state()->>'crew_speed')::int,11,'crew speed gains exactly one point');
select lives_ok($$select public.train_stat('crew','accuracy')$$,'Training crew accuracy succeeds');
select is((public.get_game_state()->>'crew_accuracy')::int,11,'crew accuracy gains exactly one point');
select lives_ok($$select public.train_stat('ship','attack')$$,'Training ship attack succeeds');
select is((public.get_game_state()->>'ship_attack')::int,11,'ship attack gains exactly one point');
select lives_ok($$select public.train_stat('ship','defense')$$,'Training ship defense succeeds');
select is((public.get_game_state()->>'ship_defense')::int,11,'ship defense gains exactly one point');
select lives_ok($$select public.train_stat('ship','speed')$$,'Training ship speed succeeds');
select is((public.get_game_state()->>'ship_speed')::int,11,'ship speed gains exactly one point');
select lives_ok($$select public.train_stat('ship','accuracy')$$,'Training ship accuracy succeeds');
select is((public.get_game_state()->>'ship_accuracy')::int,11,'ship accuracy gains exactly one point');
select is((public.get_game_state()->>'energy')::int,60,'Eight upgrades cost exactly forty energy');
select is((public.get_game_state()->>'ship_health')::int,100,'Ship upgrades do not change current health');
select is((public.get_game_state()->>'crew_health')::int,100,'Crew training does not change current health');

reset role;
update public.characters set energy=4, energy_updated_at=clock_timestamp()
where user_id='b2000000-0000-4000-8000-000000000001';
set local role authenticated;
select throws_ok($$select public.train_stat('crew','attack')$$,'P0001','NOT_ENOUGH_ENERGY','Insufficient energy is rejected');
select is((public.get_game_state()->>'energy')::int,4,'Rejected training does not charge energy');
select is((public.get_game_state()->>'crew_attack')::int,11,'Rejected training does not increase a stat');

reset role;
update public.characters set energy_updated_at=clock_timestamp()-interval '5 minutes'
where user_id='b2000000-0000-4000-8000-000000000001';
set local role authenticated;
select lives_ok($$select public.train_stat('crew','attack')$$,'Recovered energy is available for training');
select is((public.get_game_state()->>'energy')::int,0,'Training may spend the final five energy');

select set_config('request.jwt.claims','{"sub":"b2000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is((public.get_game_state()->>'energy')::int,100,'Another account retains its own energy');
select is((public.get_game_state()->>'crew_attack')::int,10,'Another account retains its own stats');
select set_config('request.jwt.claims','{"sub":"b2000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select throws_ok($$select public.train_stat('crew','attack')$$,'42501','NOT_AUTHORIZED','Anonymous Auth users cannot train');
select is(public.get_game_state(),null::jsonb,'Anonymous Auth users cannot read game state');

reset role;
delete from auth.users where id='b2000000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b2000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_ok($$select public.train_stat('crew','attack')$$,'42501','NOT_AUTHORIZED','Deleted accounts cannot train with an old token');
select * from finish();
rollback;
