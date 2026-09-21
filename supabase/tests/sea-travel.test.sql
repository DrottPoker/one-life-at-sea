begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();

insert into auth.users(id,email,is_anonymous,raw_user_meta_data) values
('a8100000-0000-4000-8000-000000000001','sea-one@example.test',false,'{"character_name":"SeaTestOne"}'),
('a8100000-0000-4000-8000-000000000002','sea-two@example.test',false,'{"character_name":"SeaTestTwo"}'),
('a8100000-0000-4000-8000-000000000003','sea-anon@example.test',true,'{}');
create temp table sea_fixture as select
(select id from public.characters where user_id='a8100000-0000-4000-8000-000000000001') a,
(select id from public.characters where user_id='a8100000-0000-4000-8000-000000000002') b,
(select sea_version from public.characters where user_id='a8100000-0000-4000-8000-000000000001') first_version,
gen_random_uuid() departure_request,gen_random_uuid() onward_request,gen_random_uuid() return_request;
create temp table sea_results(key text primary key,value jsonb);
grant select on sea_fixture to authenticated;
grant all on sea_results to authenticated;

select is((select count(*)::int from private.sea_location_types where active),4,'Four active place types');
select ok(not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename in ('characters','sea_route_options','sea_travel_requests')),'Private travel fields are not broadcast');
set local role anon;
select throws_ok($$select public.depart_harbor(gen_random_uuid(),gen_random_uuid())$$,'42501',null,'Logged-out departure denied');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a8100000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select throws_ok($$select public.depart_harbor(gen_random_uuid(),gen_random_uuid())$$,'42501','NOT_AUTHORIZED','Anonymous Auth cannot travel');
select set_config('request.jwt.claims','{"sub":"a8100000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select throws_ok('select * from private.sea_route_options','42501',null,'Routes are private');
select throws_ok('select * from private.sea_travel_requests','42501',null,'Receipts are private');
select throws_ok('select * from private.sea_location_types','42501',null,'Catalog writes and reads use server functions');
select throws_ok($$select private.settle_sea_travel(a,clock_timestamp()) from sea_fixture$$,'42501',null,'Clients cannot supply an arrival clock');
select throws_ok($$update public.characters set sea_step=999$$,'42501',null,'Clients cannot teleport');
select is(public.get_game_state()#>>'{sea,state}','in_harbor','Existing and new captains start at harbor');
select throws_ok($$select public.depart_harbor(null,gen_random_uuid())$$,'22023','INVALID_REQUEST','Version required');
reset role;
update public.characters set energy=4,energy_updated_at=clock_timestamp() where id=(select a from sea_fixture);
set local role authenticated;
select throws_ok($$select public.depart_harbor(first_version,departure_request) from sea_fixture$$,'P0001','NOT_ENOUGH_ENERGY','Four Energy cannot fund departure');
reset role;
update public.characters set energy=50,energy_updated_at=clock_timestamp(),gold_coins=10 where id=(select a from sea_fixture);
set local role authenticated;
insert into sea_results select 'departure',public.depart_harbor(first_version,departure_request) from sea_fixture;
insert into sea_results values('travel',public.get_game_state());
select is(public.get_game_state()->>'energy','45','Departure charges five Energy exactly');
select ok(public.get_game_state()->>'energy_next_at' is not null,'Traveling has a global sea recovery deadline');
select is(public.get_game_state()#>>'{sea,state}','traveling','Departure starts traveling');
select is(public.get_game_state()#>>'{sea,journey,destination,id}','harbor_outskirts','First destination is fixed');
select is(public.get_game_state()#>>'{sea,journey,target_step}','1','First destination is step one');
select is(public.get_game_state()#>'{sea,place}','null'::jsonb,'Traveling has no current place');
select is(public.get_game_state()#>'{sea,options}','[]'::jsonb,'No route choices during travel');
select is(public.get_navigation_lock()->>'sea_state','traveling','Navigation lock follows travel');
select is((select public.depart_harbor(first_version,departure_request) from sea_fixture),(select value from sea_results where key='departure'),'Duplicate request returns same journey');
select throws_ok($$select public.return_to_harbor(first_version,departure_request) from sea_fixture$$,'22023','REQUEST_CONFLICT','Same ID cannot change action');
select throws_ok($$select public.depart_harbor(first_version,gen_random_uuid()) from sea_fixture$$,'P0001','STALE_VOYAGE','Old harbor tab cannot depart twice');
select throws_ok($$select public.return_to_harbor((public.get_game_state()#>>'{sea,version}')::uuid,gen_random_uuid())$$,'P0001','TRAVEL_ACTIVE','Cannot return mid-journey');
select throws_ok($$select public.train_crew('attack','crew_1',gen_random_uuid())$$,'P0001','NOT_IN_HARBOR','Training locked during travel');
select throws_ok($$select public.transfer_gold('deposit',1,gen_random_uuid())$$,'P0001','NOT_IN_HARBOR','Bank locked during travel');
select throws_ok($$select public.save_defence_orders('cannon')$$,'P0001','NOT_IN_HARBOR','Defence changes locked during travel');
select is((select public.start_combat(b,gen_random_uuid())->>'error' from sea_fixture),'TRAVELING','Cannot attack while traveling');
select is((select count(*)::int from public.harbor_players where character_id=(select a from sea_fixture)),0,'Departure removes captain from harbor');
select set_config('request.jwt.claims','{"sub":"a8100000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is((select public.start_combat(a,gen_random_uuid())->>'error' from sea_fixture),'TARGET_TRAVELING','Cannot attack a traveling captain');
select is((select count(*)::int from public.characters where id=(select a from sea_fixture)),0,'Other captain travel state stays private');
reset role;
select is((select extract(epoch from(travel_arrives_at-travel_started_at))::int from public.characters where id=(select a from sea_fixture)),60,'Outbound journey lasts sixty seconds');
select is((select x.energy from public.characters c cross join lateral private.character_energy_snapshot(c,clock_timestamp()+interval '30 days') x where c.id=(select a from sea_fixture)),100,'Long sea voyages recover Energy up to the cap');
select private.settle_sea_travel(id,travel_arrives_at-interval '1 microsecond') from public.characters where id=(select a from sea_fixture);
select is((select location from public.characters where id=(select a from sea_fixture)),'traveling','Arrival does not apply before the deadline');
select private.settle_sea_travel(id,travel_arrives_at) from public.characters where id=(select a from sea_fixture);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a8100000-0000-4000-8000-000000000001","role":"authenticated"}',true);
insert into sea_results values('first_stop',public.get_game_state());
select is(public.get_game_state()#>>'{sea,state}','at_sea','Exact deadline settles arrival');
select is(public.get_game_state()#>>'{sea,step}','1','Arrival sets step one');
select is(jsonb_array_length(public.get_game_state()#>'{sea,options}'),2,'Two onward choices');
select is((select count(distinct p->>'place_id')::int from jsonb_array_elements(public.get_game_state()#>'{sea,options}') p),2,'The two types differ');
select is(public.get_game_state()#>'{sea,options}',(select value#>'{sea,options}' from sea_results where key='first_stop'),'Refresh preserves both routes and their IDs');
select is((select public.depart_harbor(first_version,departure_request) from sea_fixture),(select value from sea_results where key='departure'),'Old receipt survives arrival');
select is((select public.start_combat(b,gen_random_uuid())->>'error' from sea_fixture),'DIFFERENT_LOCATION','Sea captain cannot attack a captain in harbor');
select throws_ok($$select public.start_ship_upgrade('attack',5,'ship_1',gen_random_uuid())$$,'P0001','NOT_IN_HARBOR','Ship work locked at sea');
select lives_ok($$select public.list_inventory()$$,'Inventory is readable at a sea stop');
select throws_ok($$select public.choose_sea_route((public.get_game_state()#>>'{sea,version}')::uuid,gen_random_uuid(),gen_random_uuid())$$,'P0001','STALE_ROUTE','Forged route rejected');
insert into sea_results select 'onward',public.choose_sea_route((value#>>'{sea,version}')::uuid,(value#>>'{sea,options,0,id}')::uuid,onward_request)
  from sea_results cross join sea_fixture where key='first_stop';
select is(public.get_game_state()->>'energy','45','Onward travel is free');
select is(public.get_game_state()#>>'{sea,journey,target_step}','2','Either route advances one step');
select is(public.get_game_state()#>>'{sea,journey,destination,id}',(select value#>>'{sea,options,0,place_id}' from sea_results where key='first_stop'),'Arrival destination matches chosen visible type');
reset role;
select private.settle_sea_travel(id,travel_arrives_at) from public.characters where id=(select a from sea_fixture);
set local role authenticated;
insert into sea_results values('second_stop',public.get_game_state());
select is(public.get_game_state()#>>'{sea,step}','2','Second arrival advances depth');
select throws_ok($$select public.choose_sea_route((value#>>'{sea,version}')::uuid,(value#>>'{sea,options,1,id}')::uuid,gen_random_uuid()) from sea_results where key='first_stop'$$,'P0001','STALE_VOYAGE','Old visit options cannot be used after arrival');
select throws_ok($$select public.choose_sea_route((public.get_game_state()#>>'{sea,version}')::uuid,(value#>>'{sea,options,1,id}')::uuid,gen_random_uuid()) from sea_results where key='first_stop'$$,'P0001','STALE_ROUTE','Old option with current version still fails');
insert into sea_results select 'return',public.return_to_harbor((value#>>'{sea,version}')::uuid,return_request)
  from sea_results cross join sea_fixture where key='second_stop';
select is(public.get_game_state()->>'energy','45','Return journey is free');
select is(public.get_game_state()#>>'{sea,journey,target_step}','0','Return targets harbor directly');
select is((select count(*)::int from public.harbor_players where character_id=(select a from sea_fixture)),0,'Future return is hidden by roster RLS');
select is((select public.get_character_status(a)->>'location' from sea_fixture),'traveling','Profile stays traveling until return deadline');
select ok(public.list_harbor_players()->>'next_arrival_at' is not null,'Roster exposes next refresh deadline');
reset role;
select is((select extract(epoch from(travel_arrives_at-travel_started_at))::int from public.characters where id=(select a from sea_fixture)),120,'Return from step two takes two minutes');
-- Move only this fixture journey into the past to exercise lazy offline arrival.
update public.characters set travel_started_at=travel_started_at-interval '3 minutes',
 travel_arrives_at=travel_arrives_at-interval '3 minutes',
 energy_updated_at=energy_updated_at-interval '3 minutes' where id=(select a from sea_fixture);
create temp table before_home as select c.* from public.characters c where id=(select a from sea_fixture);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a8100000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is((select public.get_character_status(a)->>'location' from sea_fixture),'the_harbor','Other player sees offline return at deadline');
select is((select count(*)::int from public.harbor_players where character_id=(select a from sea_fixture)),1,'Offline captain reappears without owner login');
reset role;
select is((select location from public.characters where id=(select a from sea_fixture)),'traveling','Public projections did not mutate owner state');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a8100000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is(public.get_game_state()#>>'{sea,state}','in_harbor','Owner read settles overdue return');
select is(public.get_game_state()#>>'{sea,step}','0','Return resets depth');
select is(public.get_game_state()#>'{sea,options}','[]'::jsonb,'Return clears routes');
select ok(public.get_game_state()->>'energy_next_at' is not null,'Energy resumes after home arrival');
reset role;
select ok((select c.energy_updated_at>=h.travel_arrives_at from public.characters c cross join before_home h where c.id=(select a from sea_fixture)),'Offline return settles recovery through the observation time');
select is((select count(*)::int from private.sea_route_options where character_id=(select a from sea_fixture)),0,'No old options remain after return');

-- Fixed clocks prove sea ticks and harbor ticks are counted once across offline return.
update public.characters set energy=10,energy_updated_at='2026-01-01 00:00:01Z' where id=(select a from sea_fixture);
update public.characters set location='traveling',sea_step=3,
 travel_id=gen_random_uuid(),travel_kind='return',travel_target_step=0,travel_place_id='the_harbor',travel_place_name='The Harbor',
 travel_started_at='2026-01-01 00:09Z',travel_arrives_at='2026-01-01 00:12Z' where id=(select a from sea_fixture);
select private.settle_sea_travel(a,'2026-01-01 00:12Z') from sea_fixture;
select is((select x.energy from public.characters c cross join lateral private.character_energy_snapshot(c,'2026-01-01 00:14:59Z') x where c.id=(select a from sea_fixture)),15,'Sea tick at 00:10 is retained on return');
select is((select x.energy from public.characters c cross join lateral private.character_energy_snapshot(c,'2026-01-01 00:15Z') x where c.id=(select a from sea_fixture)),20,'Harbor recovery starts on the next fixed five-minute tick');
select is((select x.energy from public.characters c cross join lateral private.character_energy_snapshot(c,'2026-01-01 00:30Z') x where c.id=(select a from sea_fixture)),35,'Offline harbor ticks accrue normally');
select private.settle_sea_travel(a,'2026-01-01 00:35Z') from sea_fixture;
select is((select energy_updated_at from public.characters where id=(select a from sea_fixture)),'2026-01-01 00:12Z'::timestamptz,'Arrival settlement is idempotent');

set local role authenticated;
select public.start_ship_upgrade('attack',5,'ship_1',gen_random_uuid());
select throws_ok($$select public.depart_harbor((public.get_game_state()#>>'{sea,version}')::uuid,gen_random_uuid())$$,'P0001','SHIP_WORK_ACTIVE','Pending ship work prevents departure');
reset role;
update private.ship_upgrade_jobs set started_at=clock_timestamp()-interval '10 minutes',finishes_at=clock_timestamp()-interval '1 second'
 where character_id=(select a from sea_fixture) and applied_at is null;
set local role authenticated;
select lives_ok($$select public.depart_harbor((public.get_game_state()#>>'{sea,version}')::uuid,gen_random_uuid())$$,'Completed ship work allows departure');
select is(public.get_game_state()->>'ship_attack','11.00623','Completed job is applied before departure');

-- Administrative resource changes cannot leave the captain stranded.
reset role;
update public.characters set energy=20,energy_updated_at=clock_timestamp() where id=(select a from sea_fixture);
select is((select energy from public.characters where id=(select a from sea_fixture)),20,'Energy correction preserves the exact integer balance');
update public.characters set ship_health=0 where id=(select a from sea_fixture);
select is((select location from public.characters where id=(select a from sea_fixture)),'the_harbor','Hospital admission returns an away captain safely');
select ok((select hospital_until is not null and travel_id is null from public.characters where id=(select a from sea_fixture)),'Hospital clears the journey');
select is((select count(*)::int from private.sea_route_options where character_id=(select a from sea_fixture)),0,'Hospital clears private route choices');
-- An administrator can edit Energy after offline return but before owner settlement.
update public.characters set hospital_until=null,hospital_started_at=null,ship_health=100,crew_health=100,
 energy=40,energy_updated_at=clock_timestamp() where id=(select b from sea_fixture);
update public.characters set location='traveling',sea_step=1,
 travel_id=gen_random_uuid(),travel_kind='return',travel_target_step=0,travel_place_id='the_harbor',travel_place_name='The Harbor',
 travel_started_at=clock_timestamp()-interval '2 minutes',travel_arrives_at=clock_timestamp()-interval '1 minute' where id=(select b from sea_fixture);
update public.characters set energy=25,energy_updated_at=clock_timestamp() where id=(select b from sea_fixture);
create temp table edited_energy as select energy_updated_at anchor from public.characters where id=(select b from sea_fixture);
select private.settle_sea_travel(b,clock_timestamp()) from sea_fixture;
select ok((select energy_updated_at>=(select anchor from edited_energy) from public.characters where id=(select b from sea_fixture)),'Post-arrival admin correction cannot move recovery time backwards');
select set_config('request.jwt.claims','{"sub":"a8100000-0000-4000-8000-000000000002","role":"authenticated"}',true);
-- Cost-only fixtures isolate recovery while their arrivals advance beyond the real clock.
update public.characters set energy=5,energy_updated_at=clock_timestamp()+interval '1 day' where id=(select b from sea_fixture);
insert into sea_results values('new_harbor',public.get_game_state());
select public.depart_harbor(sea_version,gen_random_uuid()) from public.characters where id=(select b from sea_fixture);
select private.settle_sea_travel(id,travel_arrives_at) from public.characters where id=(select b from sea_fixture);
select is(public.get_game_state()->>'energy','0','Exactly five Energy leaves zero at sea');
select public.return_to_harbor(sea_version,gen_random_uuid()) from public.characters where id=(select b from sea_fixture);
select is((select extract(epoch from(travel_arrives_at-travel_started_at))::int from public.characters where id=(select b from sea_fixture)),60,'Return from step one takes one minute at zero Energy');
select private.settle_sea_travel(id,travel_arrives_at) from public.characters where id=(select b from sea_fixture);
select throws_ok($$select public.depart_harbor((value#>>'{sea,version}')::uuid,gen_random_uuid()) from sea_results where key='new_harbor'$$,'P0001','STALE_VOYAGE','Old departure from a completed voyage cannot start a new one');
update public.characters set energy=5,energy_updated_at=clock_timestamp()+interval '1 day' where id=(select b from sea_fixture);
select public.depart_harbor(sea_version,gen_random_uuid()) from public.characters where id=(select b from sea_fixture);
select private.settle_sea_travel(id,travel_arrives_at) from public.characters where id=(select b from sea_fixture);

select public.choose_sea_route((public.get_game_state()#>>'{sea,version}')::uuid,(public.get_game_state()#>>'{sea,options,1,id}')::uuid,gen_random_uuid());
select is(public.get_game_state()->>'energy','0','Second route advances to step 2 at zero Energy');
select private.settle_sea_travel(id,travel_arrives_at) from public.characters where id=(select b from sea_fixture);
select is(public.get_game_state()#>>'{sea,step}','2','Second choice arrives at step 2');

select public.choose_sea_route((public.get_game_state()#>>'{sea,version}')::uuid,(public.get_game_state()#>>'{sea,options,1,id}')::uuid,gen_random_uuid());
select is(public.get_game_state()->>'energy','0','Second route advances to step 3 at zero Energy');
select private.settle_sea_travel(id,travel_arrives_at) from public.characters where id=(select b from sea_fixture);
select is(public.get_game_state()#>>'{sea,step}','3','Second choice arrives at step 3');

select public.choose_sea_route((public.get_game_state()#>>'{sea,version}')::uuid,(public.get_game_state()#>>'{sea,options,1,id}')::uuid,gen_random_uuid());
select is(public.get_game_state()->>'energy','0','Second route advances to step 4 at zero Energy');
select private.settle_sea_travel(id,travel_arrives_at) from public.characters where id=(select b from sea_fixture);
select is(public.get_game_state()#>>'{sea,step}','4','Second choice arrives at step 4');

select public.choose_sea_route((public.get_game_state()#>>'{sea,version}')::uuid,(public.get_game_state()#>>'{sea,options,1,id}')::uuid,gen_random_uuid());
select is(public.get_game_state()->>'energy','0','Second route advances to step 5 at zero Energy');
select private.settle_sea_travel(id,travel_arrives_at) from public.characters where id=(select b from sea_fixture);
select is(public.get_game_state()#>>'{sea,step}','5','Second choice arrives at step 5');

select public.return_to_harbor(sea_version,gen_random_uuid()) from public.characters where id=(select b from sea_fixture);
select is((select extract(epoch from(travel_arrives_at-travel_started_at))::int from public.characters where id=(select b from sea_fixture)),300,'Return from step five takes five minutes');
create temp table deep_return_energy as select e.energy from public.characters c
 cross join lateral private.character_energy_snapshot(c,c.travel_arrives_at) e where c.id=(select b from sea_fixture);
select private.settle_sea_travel(id,travel_arrives_at) from public.characters where id=(select b from sea_fixture);
select is((public.get_game_state()->>'energy')::integer,(select energy from deep_return_energy),'Free return preserves all earned global ticks');

select * from finish();
rollback;
