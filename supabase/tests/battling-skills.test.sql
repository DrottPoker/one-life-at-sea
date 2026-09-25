begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
-- Even rolls hit at equal stats, land on x1 zones and win the boarding roll.
create or replace function private.combat_roll() returns double precision language sql volatile security invoker set search_path='' as $$ select 0.3::double precision $$;

select is(private.battling_health_bonus(1),0,'Level one adds no health');
select is(private.battling_health_bonus(2),5,'Level two adds one step of five');
select is(private.battling_health_bonus(3),10,'Level three adds two steps');
select is(private.battling_health_bonus(10),45,'Steps do not stack beyond one per level');
select is(private.battling_health_bonus(99),490,'Level ninety-nine adds ninety-eight steps');
select is(private.battling_health_bonus(100),750,'Level one hundred jumps to its own bonus');
select ok(not exists(select 1 from private.skill_levels where level between 2 and 99 and private.battling_health_bonus(level)-private.battling_health_bonus(level-1)<>5),
  'Every level below one hundred adds one step of five');
select is(private.combat_order_skill('fire'),'ship_battling','Cannon salvos train Ship Battling');
select is(private.combat_order_skill('fire_grape'),'ship_battling','Grape Shot is still a cannon salvo');
select is(private.combat_order_skill('crew_shoot'),'crew_battling','Firearm shots train Crew Battling');
select is(private.combat_order_skill('crew_throw'),'crew_battling','Thrown temporaries train Crew Battling');
select is(private.combat_order_skill('crew_attack'),'crew_battling','Melee attacks train Crew Battling');
select is(private.combat_order_skill('board'),null,'Boarding is not an attack');
select is(private.combat_order_skill('retreat'),null,'Retreat is not an attack');

insert into auth.users(id,email,is_anonymous,raw_user_meta_data) values
('b7000000-0000-4000-8000-000000000001','battler-one@example.test',false,'{"character_name":"BattlerOne"}'),
('b7000000-0000-4000-8000-000000000002','battler-two@example.test',false,'{"character_name":"BattlerTwo"}'),
('b7000000-0000-4000-8000-000000000003','battler-three@example.test',false,'{"character_name":"BattlerThree"}');
create temporary table battlers as select
  (select id from public.characters where user_id='b7000000-0000-4000-8000-000000000001') a,
  (select id from public.characters where user_id='b7000000-0000-4000-8000-000000000002') d,
  (select id from public.characters where user_id='b7000000-0000-4000-8000-000000000003') p;
create temporary table battler_results(name text primary key,value jsonb);
grant all on battlers,battler_results to authenticated;
update public.characters set ship_attack=10,ship_defense=10,ship_speed=10,ship_accuracy=10,crew_attack=10,crew_defense=10,crew_speed=10,crew_accuracy=10
  where id in(select a from battlers union all select d from battlers);

select is(private.crew_health_max(p),100,'New captains have the base Crew Health maximum') from battlers;
select is(private.ship_health_max(p),100,'New captains have the base Ship Health maximum') from battlers;
select private.award_skill_xp(p,'crew_battling',200),private.award_skill_xp(p,'ship_battling',649) from battlers;
select is(private.crew_health_max(p),105,'Crew Battling level two raises maximum Crew Health') from battlers;
select is(private.ship_health_max(p),115,'Ship Battling level four raises maximum Ship Health') from battlers;
insert into private.item_instances(character_id,item_id,quality) select p,'oak_sheathing',100 from battlers;
insert into private.character_equipment(character_id,slot,instance_id) select character_id,'hull',id from private.item_instances where character_id=(select p from battlers);
select is(private.ship_health_max(p),140,'Hull health and the Ship Battling bonus add together') from battlers;
select is(private.crew_health_max(p),105,'Hull health does not change the Crew Health maximum') from battlers;
select lives_ok($$update public.characters set crew_health=850 where id=(select p from battlers)$$,'Crew Health may reach the top battling maximum');
select throws_ok($$update public.characters set crew_health=851 where id=(select p from battlers)$$,'23514',null,'Crew Health cannot exceed the top battling maximum');
select lives_ok($$update public.characters set ship_health=950 where id=(select p from battlers)$$,'Ship Health may reach the top hull and battling maximum');
select throws_ok($$update public.characters set ship_health=951 where id=(select p from battlers)$$,'23514',null,'Ship Health cannot exceed the top hull and battling maximum');

update public.characters set ship_health=100,crew_health=100,ship_recovery_at=clock_timestamp(),crew_recovery_at=clock_timestamp() where id=(select p from battlers);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b7000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select throws_ok($$select private.crew_health_max(p) from battlers$$,'42501',null,'Clients cannot call the private health helpers');
select is((public.get_game_state()->>'crew_health_max')::integer,105,'Game state reports the raised Crew Health maximum');
select is((public.get_game_state()->>'ship_health_max')::integer,140,'Game state reports the raised Ship Health maximum');
select is((public.get_game_state()->>'crew_health')::integer,100,'A level does not heal');
select ok((public.get_game_state()->>'health_next_at') is not null,'Recovery continues towards the raised maximum');
reset role;
update public.characters set ship_recovery_at=clock_timestamp()-interval '1 day',crew_recovery_at=clock_timestamp()-interval '1 day' where id=(select p from battlers);
set local role authenticated;
select is((public.get_game_state()->>'crew_health')::integer,105,'Crew recovery stops at the raised maximum');
select is((public.get_game_state()->>'ship_health')::integer,140,'Ship recovery stops at the raised maximum');
select is((public.get_game_state()->>'health_next_at'),null::text,'Full health at the raised maxima needs no recovery');

-- An administrative level change keeps recovery so far at the previous maximum.
reset role;
insert into private.admin_members(user_id) values('b7000000-0000-4000-8000-000000000002');
update public.characters set crew_health=105,crew_recovery_at=clock_timestamp()-interval '1 day' where id=(select p from battlers);
select set_config('request.jwt.claims','{"sub":"b7000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select lives_ok($$select public.admin_mutate('update',jsonb_build_object('resource','character_skills','key',jsonb_build_object('character_id',s.character_id::text,'skill_id',s.skill_id),
  'version',md5(to_jsonb(s)::text),'changes',jsonb_build_object('xp','416')),gen_random_uuid(),'Verify battling level correction')
  from private.character_skills s where character_id=(select p from battlers) and skill_id='crew_battling'$$,'Administrators can correct battling XP');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b7000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select is((public.get_game_state()->>'crew_health_max')::integer,110,'A corrected level applies its new maximum');
select is((public.get_game_state()->>'crew_health')::integer,105,'A corrected level grants no free health');
reset role;
select set_config('request.jwt.claims','{"sub":"b7000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select lives_ok($$select public.admin_mutate('update',jsonb_build_object('resource','character_skills','key',jsonb_build_object('character_id',s.character_id::text,'skill_id',s.skill_id),
  'version',md5(to_jsonb(s)::text),'changes',jsonb_build_object('xp','0')),gen_random_uuid(),'Verify battling level reduction')
  from private.character_skills s where character_id=(select p from battlers) and skill_id='crew_battling'$$,'Administrators can reduce battling XP');
select is((select crew_health from public.characters where id=(select p from battlers)),100,'A reduced level lowers stored Crew Health to the new maximum');
select private.award_skill_xp(p,'crew_battling',200) from battlers;

-- Discharge restores the maxima that apply at that moment.
update public.characters set crew_health=0 where id=(select p from battlers);
update public.characters set hospital_started_at=clock_timestamp()-interval '10 minutes',hospital_until=clock_timestamp()-interval '5 minutes' where id=(select p from battlers);
select private.settle_hospital(p,clock_timestamp()) from battlers;
select is((select crew_health from public.characters where id=(select p from battlers)),105,'Discharge restores the raised Crew Health maximum');
select is((select ship_health from public.characters where id=(select p from battlers)),140,'Discharge restores the raised Ship Health maximum');
update public.characters set crew_health=0 where id=(select p from battlers);
select lives_ok($$select public.admin_mutate('release_hospital',jsonb_build_object('character_id',c.id,'version',md5(to_jsonb(c)::text)),gen_random_uuid(),'Verify hospital release')
  from public.characters c where c.id=(select p from battlers)$$,'Administrators can release a patient');
select is((select crew_health from public.characters where id=(select p from battlers)),105,'Administrative release restores the raised Crew Health maximum');
select is((select ship_health from public.characters where id=(select p from battlers)),140,'Administrative release restores the raised Ship Health maximum');
select is((select hospital_until from public.characters where id=(select p from battlers)),null::timestamptz,'Administrative release ends the stay');
select throws_ok($$select public.admin_mutate('release_hospital',jsonb_build_object('character_id',c.id,'version',md5(to_jsonb(c)::text)),gen_random_uuid(),'Verify second release')
  from public.characters c where c.id=(select p from battlers)$$,'P0001','ROW_NOT_FOUND','Only patients can be released');

-- Every attacking order trains its phase for both sides, whether it hits or misses.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b7000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
insert into battler_results select 'start',public.start_combat(d,gen_random_uuid()) from battlers;
select is((select value#>>'{battle,attacker,crew_health_max}' from battler_results where name='start'),'100','Combat snapshots include the Crew Health maximum');
select is((select value#>>'{battle,defender,crew_health_max}' from battler_results where name='start'),'100','Opponents see the Crew Health maximum like the Ship Health maximum');
select public.submit_combat_order((value#>>'{battle,id}')::uuid,0,'fire',gen_random_uuid()) from battler_results where name='start';
reset role;
select is((select xp from private.character_skills where character_id=(select a from battlers) and skill_id='ship_battling'),10::bigint,'A salvo trains the attacker''s Ship Battling');
select is((select xp from private.character_skills where character_id=(select d from battlers) and skill_id='ship_battling'),10::bigint,'The defender''s automatic salvo trains its Ship Battling');
create or replace function private.combat_roll() returns double precision language sql volatile security invoker set search_path='' as $$ select 0.99::double precision $$;
set local role authenticated;
select public.submit_combat_order((value#>>'{battle,id}')::uuid,1,'fire',gen_random_uuid()) from battler_results where name='start';
reset role;
select is((select event->>'attacker_hit' from private.combat_rounds where combat_id=(select (value#>>'{battle,id}')::uuid from battler_results where name='start')
  order by round desc limit 1),'false','The second salvo misses');
select is((select xp from private.character_skills where character_id=(select a from battlers) and skill_id='ship_battling'),20::bigint,'A missed salvo still trains Ship Battling');
create or replace function private.combat_roll() returns double precision language sql volatile security invoker set search_path='' as $$ select 0.3::double precision $$;
set local role authenticated;
select public.submit_combat_order((value#>>'{battle,id}')::uuid,2,'board',gen_random_uuid()) from battler_results where name='start';
select is((select public.get_combat((value#>>'{battle,id}')::uuid)->>'phase' from battler_results where name='start'),'boarding','The attacker boards');
select public.submit_combat_order((value#>>'{battle,id}')::uuid,3,'crew_attack',gen_random_uuid()) from battler_results where name='start';
select public.submit_combat_order((value#>>'{battle,id}')::uuid,4,'retreat',gen_random_uuid()) from battler_results where name='start';
reset role;
select is((select xp from private.character_skills where character_id=(select a from battlers) and skill_id='ship_battling'),20::bigint,'Boarding trains nothing');
select is((select xp from private.character_skills where character_id=(select a from battlers) and skill_id='crew_battling'),10::bigint,'A melee attack trains Crew Battling while retreat does not');
select is((select xp from private.character_skills where character_id=(select d from battlers) and skill_id='ship_battling'),30::bigint,'The defender''s salvo against a boarding attempt trains it');
select is((select xp from private.character_skills where character_id=(select d from battlers) and skill_id='crew_battling'),20::bigint,'The defender''s counterattacks train Crew Battling, including against a retreat');
select is((select count(*) from private.character_skills where character_id in(select a from battlers union all select d from battlers)
  and skill_id not in('crew_battling','ship_battling') and xp>0),0::bigint,'Combat trains no other skill');
select is((select status from private.combats where id=(select (value#>>'{battle,id}')::uuid from battler_results where name='start')),'completed','The retreat ends the encounter');
select ok(not exists(select 1 from private.combat_rounds where combat_id=(select (value#>>'{battle,id}')::uuid from battler_results where name='start')
  and event::text ilike '%battling%'),'Public round events contain no private XP');
select is((select public.get_combat_log((value#>>'{battle,id}')::uuid)#>>'{people,0,crew_health_max}' from battler_results where name='start'),'100','Combat logs include the Crew Health maximum');
select * from finish();
rollback;
