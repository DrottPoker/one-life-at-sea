begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
select is((select stamina from private.stamina_snapshot(0,'2026-01-01 00:04:59Z','2026-01-01 00:04:59.999Z')),0,'No recovery before a boundary');
select is((select stamina from private.stamina_snapshot(0,'2026-01-01 00:04:59Z','2026-01-01 00:05Z')),1,'Boundary grants one Stamina');
select is((select stamina from private.stamina_snapshot(0,'2026-01-01 00:05Z','2026-01-01 00:05Z')),0,'Settled boundary is never counted twice');
select is((select stamina from private.stamina_snapshot(0,'2026-01-01Z','2026-01-01 00:15Z')),3,'Offline recovery counts all crossed ticks');
select is((select stamina from private.stamina_snapshot(49,'2026-01-01Z','2026-01-02Z')),50,'Offline recovery respects the cap');
select is((select stamina_next_at from private.stamina_snapshot(50,'2026-01-01Z','2026-01-02Z')),null::timestamptz,'Full bar has no refresh deadline');
select is((select stamina_next_at from private.stamina_snapshot(1,'2026-01-01Z','2026-01-01 00:07Z')),'2026-01-01 00:10Z'::timestamptz,'Next deadline is on the server boundary');
select is((select stamina from private.stamina_snapshot(10,'2026-01-02Z','2026-01-01Z')),10,'Future checkpoint never subtracts Stamina');
select is((select stamina_updated_at from private.stamina_snapshot(10,'2026-01-02Z','2026-01-01Z')),'2026-01-02Z'::timestamptz,'Future checkpoint is preserved');
select is((select stamina from private.stamina_snapshot(0,'2026-01-01 23:59Z','2026-01-02Z')),1,'Midnight boundary grants recovery');
insert into auth.users(id,email,is_anonymous,raw_user_meta_data) values
('a9800000-0000-4000-8000-000000000001','stamina-one@example.test',false,'{"character_name":"StaminaCaptain"}'),
('a9800000-0000-4000-8000-000000000002','stamina-two@example.test',false,'{"character_name":"StaminaOther"}');
create temporary table stamina_fixture as select
(select id from public.characters where user_id='a9800000-0000-4000-8000-000000000001') a,
(select id from public.characters where user_id='a9800000-0000-4000-8000-000000000002') b;
grant select on stamina_fixture to authenticated;
select is((select stamina from public.characters where id=(select a from stamina_fixture)),50,'New characters start full');
select throws_ok($$update public.characters set stamina=-1 where id=(select a from stamina_fixture)$$,'23514',null,'Negative Stamina is rejected');
select throws_ok($$update public.characters set stamina=201 where id=(select a from stamina_fixture)$$,'23514',null,'Stamina above the cap is rejected');
select ok(not has_function_privilege('authenticated','private.spend_activity_stamina(uuid)','EXECUTE'),'Spending helper is not client callable');
select ok(not has_function_privilege('anon','private.spend_activity_stamina(uuid)','EXECUTE'),'Anonymous users cannot invoke spending');
select throws_ok($$select private.spend_activity_stamina(a) from stamina_fixture$$,'42501','UNAUTHORIZED','Spending requires a player identity');
select set_config('request.jwt.claims','{"sub":"a9800000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select throws_ok($$select private.spend_activity_stamina(b) from stamina_fixture$$,'42501','UNAUTHORIZED','A player cannot spend another player Stamina');
update public.characters set energy=80,energy_updated_at=clock_timestamp()+interval '1 day',
  stamina=50,stamina_updated_at=clock_timestamp()-interval '1 day' where id=(select a from stamina_fixture);
select is((select private.spend_activity_stamina(a) from stamina_fixture),49,'An activity costs one Stamina');
select is((select stamina from public.characters where id=(select a from stamina_fixture)),49,'Cost is persisted');
select is((select energy from public.characters where id=(select a from stamina_fixture)),80,'Activity cost leaves Energy unchanged');
select is((select r.stamina from public.characters c cross join lateral private.stamina_snapshot(c.stamina,c.stamina_updated_at,c.stamina_updated_at) r where c.id=(select a from stamina_fixture)),49,'Time at the cap is not banked after spending');
update public.characters set stamina=0,stamina_updated_at=clock_timestamp()+interval '1 day' where id=(select a from stamina_fixture);
select throws_ok($$select private.spend_activity_stamina(a) from stamina_fixture$$,'P0001','INSUFFICIENT_STAMINA','Empty bar blocks spending');
select is((select stamina from public.characters where id=(select a from stamina_fixture)),0,'Rejected spending leaves zero balance');
update public.characters set stamina=0,stamina_updated_at=date_bin(interval '5 minutes',clock_timestamp(),'1970-01-01Z')-interval '1 second' where id=(select a from stamina_fixture);
select is((select private.spend_activity_stamina(a) from stamina_fixture),0,'Recovered Stamina can fund an activity');
update public.characters set stamina=0,stamina_updated_at=clock_timestamp()-interval '1 day' where id=(select a from stamina_fixture);
set local role authenticated;
select is((public.get_game_state()->>'stamina')::integer,50,'Game state computes offline recovery');
select is((public.get_game_state()->>'stamina')::integer,50,'Repeated reads cannot exceed the cap');
select is(public.get_game_state()->>'stamina_next_at',null::text,'Game state stops refreshing full Stamina');
select throws_ok($$update public.characters set stamina=50 where id=(select a from stamina_fixture)$$,'42501',null,'Players cannot edit their balance');
select public.depart_harbor((public.get_game_state()#>>'{sea,version}')::uuid,gen_random_uuid());
select is((public.get_game_state()->>'stamina')::integer,50,'Travel does not consume Stamina');
reset role;
update public.characters set stamina=0,stamina_updated_at=date_bin(interval '5 minutes',clock_timestamp(),'1970-01-01Z')-interval '1 second' where id=(select a from stamina_fixture);
select is((public.get_game_state()->>'stamina')::integer,1,'Recovery while traveling still uses five minutes');
insert into private.admin_members(user_id) values('a9800000-0000-4000-8000-000000000002');
select set_config('request.jwt.claims','{"sub":"a9800000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select ok('stamina'=any(editable),'Stamina is editable in the admin panel') from private.admin_resources where name='characters';
select public.admin_mutate('update',jsonb_build_object('resource','characters','key',jsonb_build_object('id',c.id::text),
  'version',md5(to_jsonb(c)::text),'changes',jsonb_build_object('stamina','20')),gen_random_uuid(),'Verify stamina edit')
  from public.characters c where id=(select a from stamina_fixture);
select is((select stamina from public.characters where id=(select a from stamina_fixture)),20,'Admin can set Stamina');
select ok((select stamina_updated_at>clock_timestamp()-interval '5 seconds' from public.characters where id=(select a from stamina_fixture)),'Admin changes reset the checkpoint');
select * from finish();
rollback;
