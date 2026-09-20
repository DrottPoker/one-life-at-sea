begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();

insert into auth.users(id,email,is_anonymous,raw_user_meta_data) values
('a8200000-0000-4000-8000-000000000001','distance-one@example.test',false,'{"character_name":"Distance Test One"}'),
('a8200000-0000-4000-8000-000000000002','distance-two@example.test',false,'{"character_name":"Distance Test Two"}');
create temp table distance_fixture as select id from public.characters where user_id='a8200000-0000-4000-8000-000000000001';
grant select on distance_fixture to authenticated;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a8200000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is((select max_sea_distance from public.characters where id=(select id from distance_fixture)),0,'New character record is zero');
select is((select public.get_character_status(id)->>'max_sea_distance' from distance_fixture),'0','New profile record is zero');
select throws_ok($$update public.characters set max_sea_distance=999$$,'42501',null,'Players cannot edit their record');
select throws_ok($$update public.character_profiles set max_sea_distance=999$$,'42501',null,'Players cannot forge a public record');
select public.depart_harbor((public.get_game_state()#>>'{sea,version}')::uuid,gen_random_uuid());
select is((select public.get_character_status(id)->>'max_sea_distance' from distance_fixture),'0','Starting a journey does not award its distance');

reset role;
select private.settle_sea_travel(id,travel_arrives_at-interval '1 microsecond') from public.characters where id=(select id from distance_fixture);
select is((select max_sea_distance from public.characters where id=(select id from distance_fixture)),0,'Record is unchanged just before arrival');
update public.characters set travel_started_at=clock_timestamp()-interval '61 seconds',
  travel_arrives_at=clock_timestamp()-interval '1 second' where id=(select id from distance_fixture);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a8200000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is((select public.get_character_status(id)->>'max_sea_distance' from distance_fixture),'1','Another player sees the offline arrival record');
select is((select count(*)::int from public.characters where id=(select id from distance_fixture)),0,'Record visibility does not expose private character state');
reset role;
select is((select max_sea_distance from public.characters where id=(select id from distance_fixture)),0,'Public record read does not write owner state');
select set_config('request.jwt.claims','{"sub":"a8200000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.get_game_state();
select is((select max_sea_distance from public.characters where id=(select id from distance_fixture)),1,'Owner settlement persists the first record');
select is((select arrival_max_sea_distance from public.character_profiles where character_id=(select id from distance_fixture)),null::integer,'Settlement clears the scheduled record');

select public.choose_sea_route((public.get_game_state()#>>'{sea,version}')::uuid,(public.get_game_state()#>>'{sea,options,0,id}')::uuid,gen_random_uuid());
select is((select public.get_character_status(id)->>'max_sea_distance' from distance_fixture),'1','An onward journey keeps the reached record until arrival');
select private.settle_sea_travel(id,travel_arrives_at) from public.characters where id=(select id from distance_fixture);
select is((select max_sea_distance from public.characters where id=(select id from distance_fixture)),2,'Arrival at the deadline persists a new record');
select private.settle_sea_travel(id,clock_timestamp()) from distance_fixture;
select is((select max_sea_distance from public.characters where id=(select id from distance_fixture)),2,'Repeated settlement cannot increment the record');
select public.return_to_harbor((public.get_game_state()#>>'{sea,version}')::uuid,gen_random_uuid());
select is((select public.get_character_status(id)->>'max_sea_distance' from distance_fixture),'2','Record survives the return journey');
select private.settle_sea_travel(id,travel_arrives_at) from public.characters where id=(select id from distance_fixture);
select is((select sea_step from public.characters where id=(select id from distance_fixture)),0,'Current distance resets at home');
select is((select public.get_character_status(id)->>'max_sea_distance' from distance_fixture),'2','Record remains on the profile at home');

select public.depart_harbor((public.get_game_state()#>>'{sea,version}')::uuid,gen_random_uuid());
select is((select arrival_max_sea_distance from public.character_profiles where character_id=(select id from distance_fixture)),null::integer,'A shorter voyage schedules no replacement record');
select private.settle_sea_travel(id,travel_arrives_at) from public.characters where id=(select id from distance_fixture);
select is((select max_sea_distance from public.characters where id=(select id from distance_fixture)),2,'A shorter later voyage cannot reduce the record');
update public.characters set max_sea_distance=0 where id=(select id from distance_fixture);
select is((select max_sea_distance from public.characters where id=(select id from distance_fixture)),2,'Server updates cannot accidentally erase the record');
select public.choose_sea_route((public.get_game_state()#>>'{sea,version}')::uuid,(public.get_game_state()#>>'{sea,options,1,id}')::uuid,gen_random_uuid());
select private.settle_sea_travel(id,travel_arrives_at) from public.characters where id=(select id from distance_fixture);
select public.choose_sea_route((public.get_game_state()#>>'{sea,version}')::uuid,(public.get_game_state()#>>'{sea,options,0,id}')::uuid,gen_random_uuid());
update public.characters set ship_health=0 where id=(select id from distance_fixture);
select is((select max_sea_distance from public.characters where id=(select id from distance_fixture)),2,'Hospital cancellation before arrival does not award a future record');
select is((select public.get_character_status(id)->>'max_sea_distance' from distance_fixture),'2','Hospital profile retains the reached record');
select is((select arrival_max_sea_distance from public.character_profiles where character_id=(select id from distance_fixture)),null::integer,'Canceled journey clears the scheduled record');

update public.characters set hospital_started_at=null,hospital_until=null,ship_health=100,crew_health=100,
  energy=100,energy_updated_at=clock_timestamp() where id=(select id from distance_fixture);
select public.depart_harbor((public.get_game_state()#>>'{sea,version}')::uuid,gen_random_uuid());
select private.settle_sea_travel(id,travel_arrives_at) from public.characters where id=(select id from distance_fixture);
select public.choose_sea_route((public.get_game_state()#>>'{sea,version}')::uuid,(public.get_game_state()#>>'{sea,options,1,id}')::uuid,gen_random_uuid());
select private.settle_sea_travel(id,travel_arrives_at) from public.characters where id=(select id from distance_fixture);
select public.choose_sea_route((public.get_game_state()#>>'{sea,version}')::uuid,(public.get_game_state()#>>'{sea,options,0,id}')::uuid,gen_random_uuid());
update public.characters set travel_started_at=clock_timestamp()-interval '61 seconds',
  travel_arrives_at=clock_timestamp()-interval '1 second' where id=(select id from distance_fixture);
select is((select max_sea_distance from public.characters where id=(select id from distance_fixture)),2,'The overdue journey has not been settled by its owner');
update public.characters set ship_health=0 where id=(select id from distance_fixture);
select is((select max_sea_distance from public.characters where id=(select id from distance_fixture)),3,'Hospital admission after offline arrival preserves the due record');
select is((select public.get_character_status(id)->>'max_sea_distance' from distance_fixture),'3','The offline record remains publicly visible in hospital');

select * from finish();
rollback;
