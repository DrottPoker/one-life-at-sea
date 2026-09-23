begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();

select is((select energy from private.energy_snapshot(150,'2026-01-01Z','2026-02-01Z')),150,'Offline recovery preserves excess Energy without generating more');
select is((select energy from private.energy_snapshot(1000,'2026-01-02Z','2026-01-01Z')),1000,'Future checkpoint preserves Energy at storage limit');
select is((select energy from private.energy_tick_snapshot(1000,'2026-01-01Z','2026-02-01Z',600)),1000,'Sea recovery also preserves excess Energy');
select is((select stamina from private.stamina_snapshot(99,'2026-01-01Z','2026-02-01Z')),99,'Offline recovery preserves 99 Stamina');
select is((select stamina from private.stamina_snapshot(200,'2026-01-02Z','2026-01-01Z')),200,'Future checkpoint preserves Stamina at storage limit');
select is((select stamina_next_at from private.stamina_snapshot(99,'2026-01-01Z','2026-02-01Z')),null::timestamptz,'Excess Stamina has no recovery deadline');
select is((select energy from private.energy_snapshot(95,(select energy_updated_at from private.energy_snapshot(150,'2026-01-01Z','2026-01-01 00:12Z')),'2026-01-01 00:14Z')),95,'Time spent over Energy recovery cap is not banked');
select is((select energy from private.energy_snapshot(95,'2026-01-01 00:12Z','2026-01-01 00:15Z')),100,'Energy recovery resumes at next tick below normal cap');
select is((select stamina from private.stamina_snapshot(49,(select stamina_updated_at from private.stamina_snapshot(99,'2026-01-01Z','2026-01-01 00:12Z')),'2026-01-01 00:14Z')),49,'Time spent over Stamina recovery cap is not banked');
select is((select stamina from private.stamina_snapshot(49,'2026-01-01 00:12Z','2026-01-01 00:15Z')),50,'Stamina recovery resumes at next tick below normal cap');

insert into auth.users(id,email,is_anonymous,raw_user_meta_data) values
('a9910000-0000-4000-8000-000000000001','overflow-player@example.test',false,'{"character_name":"OverflowCaptain"}'),
('a9910000-0000-4000-8000-000000000002','overflow-admin@example.test',false,'{"character_name":"OverflowAdmin"}');
insert into private.item_stacks(character_id,item_id,quantity) select c.id,m.item_id,1000 from public.characters c
cross join (values('oak_planks'),('iron_nails')) m(item_id) where c.user_id in ('a9910000-0000-4000-8000-000000000001'::uuid,'a9910000-0000-4000-8000-000000000002'::uuid);

create temporary table overflow_fixture as select id from public.characters where user_id='a9910000-0000-4000-8000-000000000001';
grant select on overflow_fixture to authenticated;
insert into private.admin_members(user_id) values('a9910000-0000-4000-8000-000000000002');
select set_config('request.jwt.claims','{"sub":"a9910000-0000-4000-8000-000000000002","role":"authenticated"}',true);
create temporary table overflow_admin_payload as select jsonb_build_object('resource','characters','key',jsonb_build_object('id',c.id::text),
  'version',md5(to_jsonb(c)::text),'changes',jsonb_build_object('energy','1000','stamina','200')) payload
  from public.characters c where id=(select id from overflow_fixture);
grant select on overflow_admin_payload to authenticated;
set local role authenticated;
select lives_ok($$select public.admin_mutate('update',payload,gen_random_uuid(),'Verify resource overfill') from overflow_admin_payload$$,'Admin can grant both maximum resource balances');
reset role;
select is((select energy from public.characters where id=(select id from overflow_fixture)),1000,'Energy storage limit is accepted');
select is((select stamina from public.characters where id=(select id from overflow_fixture)),200,'Stamina storage limit is accepted');
select ok((select energy_updated_at>clock_timestamp()-interval '5 seconds' and stamina_updated_at>clock_timestamp()-interval '5 seconds' from public.characters where id=(select id from overflow_fixture)),'Admin grant resets both recovery checkpoints');
select throws_ok($$update public.characters set energy=1001 where id=(select id from overflow_fixture)$$,'23514',null,'Energy above 1000 is rejected');
select throws_ok($$update public.characters set stamina=201 where id=(select id from overflow_fixture)$$,'23514',null,'Stamina above 200 is rejected');
select throws_ok($$update public.characters set energy=-1 where id=(select id from overflow_fixture)$$,'23514',null,'Negative Energy is rejected');
update public.characters set energy_updated_at=clock_timestamp()-interval '1 day',stamina_updated_at=clock_timestamp()-interval '1 day' where id=(select id from overflow_fixture);
select set_config('request.jwt.claims','{"sub":"a9910000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
select is(public.get_game_state()->>'energy','1000','Game state preserves overfilled Energy across offline ticks');
select is(public.get_game_state()->>'stamina','200','Game state preserves overfilled Stamina across offline ticks');
select is(public.get_game_state()->>'energy_next_at',null::text,'Overfilled Energy schedules no recovery');
select is(public.get_game_state()->>'stamina_next_at',null::text,'Overfilled Stamina schedules no recovery');
select throws_ok($$update public.characters set energy=1000 where id=(select id from overflow_fixture)$$,'42501',null,'Players cannot grant themselves excess resources');
create temporary table overflow_requests as select gen_random_uuid() crew,gen_random_uuid() activity,gen_random_uuid() ship;
select public.train_crew('attack','crew_1',crew) from overflow_requests;
select is(public.get_game_state()->>'energy','995','Crew training spends only its cost from overfilled Energy');
select public.train_crew('attack','crew_1',crew) from overflow_requests;
select is(public.get_game_state()->>'energy','995','Crew retry preserves the surplus without a second debit');
select public.perform_activity('coastal_foraging',1,10,activity) from overflow_requests;
select is(public.get_game_state()->>'stamina','199','Activities spend only their cost from overfilled Stamina');
select public.perform_activity('coastal_foraging',1,10,activity) from overflow_requests;
select is(public.get_game_state()->>'stamina','199','Activity retry preserves surplus without a second debit');
reset role;
update public.characters set energy=1000,energy_updated_at=clock_timestamp()+interval '1 day' where id=(select id from overflow_fixture);
set local role authenticated;
select lives_ok($$select public.start_ship_upgrade('attack',1000,'ship_1',ship) from overflow_requests$$,'Ship work accepts the full stored Energy balance');
select is(public.get_game_state()->>'energy','0','Ship work debits exactly 1000 Energy');
select is(public.get_game_state()#>>'{training,ship_job,energy_cost}','1000','Ship receipt records the full cost');
select lives_ok($$select public.start_ship_upgrade('attack',1000,'ship_1',ship) from overflow_requests$$,'Large ship work remains idempotent');
reset role;
select is((select extract(epoch from(finishes_at-started_at))::integer from private.ship_upgrade_jobs where character_id=(select id from overflow_fixture)),6000,'Large ship work keeps 30 seconds per five Energy');
select * from finish();
rollback;
