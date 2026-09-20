begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create or replace function private.combat_roll() returns double precision language sql volatile security invoker set search_path='' as $$ select 0.0::double precision $$;
insert into auth.users(id,email,is_anonymous,raw_user_meta_data) values
('d4000000-0000-4000-8000-000000000001','shared-one@example.test',false,'{"character_name":"Shared Captain One"}'),
('d4000000-0000-4000-8000-000000000002','shared-two@example.test',false,'{"character_name":"Shared Captain Two"}'),
('d4000000-0000-4000-8000-000000000003','shared-target@example.test',false,'{"character_name":"Shared Defender"}');
create temporary table f as select
(select id from public.characters where user_id='d4000000-0000-4000-8000-000000000001') a,
(select id from public.characters where user_id='d4000000-0000-4000-8000-000000000002') b,
(select id from public.characters where user_id='d4000000-0000-4000-8000-000000000003') d;
-- Keep shared-combat behavior fixtures at their explicit reference stats.
update public.characters set ship_attack=1,ship_defense=1,ship_speed=1,ship_accuracy=1,crew_attack=1,crew_defense=1,crew_speed=1,crew_accuracy=1 where id in(select a from f union all select b from f union all select d from f);
create temporary table results(name text primary key,value jsonb);
grant all on f,results to authenticated,anon;
update public.characters set ship_accuracy=24681357 where id=(select d from f);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d4000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
insert into results select 'start',public.start_combat(d,'aaaaaaaa-aaaa-4aaa-8aaa-000000000001') from f;
select ok((select bool_and((person->>'ship_damage')::integer=0 and (person->>'crew_damage')::integer=0)
  from results cross join lateral jsonb_array_elements(value#>'{battle,people}') person where name='start'),'New encounters start with zero damage in both categories');
select is(public.get_attack_lock()->>'battle_id',(select value#>>'{battle,id}' from results where name='start'),'Attacker has a persistent route lock');
select is((select public.get_combat_log((value#>>'{battle,id}')::uuid) from results where name='start'),null::jsonb,'Active encounter is not public');
insert into results select 'board',public.submit_combat_order((value#>>'{battle,id}')::uuid,0,'board',gen_random_uuid()) from results where name='start';
select is((select value#>>'{battle,phase}' from results where name='board'),'boarding','First attacker boards');
select set_config('request.jwt.claims','{"sub":"d4000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is((select public.get_combat_preview(d)->>'join_combat_id' from f),(select value#>>'{battle,id}' from results where name='start'),'Preview offers joining');
select is((select public.get_combat_preview(d)#>>'{defender,cannons}' from f),null,'Join preview hides equipment');
insert into results select 'join',public.start_combat(d,'aaaaaaaa-aaaa-4aaa-8aaa-000000000002') from f;
select is((select value#>>'{battle,id}' from results where name='join'),(select value#>>'{battle,id}' from results where name='start'),'Join shares encounter');
select is((select value#>>'{battle,phase}' from results where name='join'),'sea','Joiner starts at sea while another boards');
select is((select value#>>'{battle,round}' from results where name='join'),'0','Joiner has independent rounds');
select is((select public.start_combat(d,'aaaaaaaa-aaaa-4aaa-8aaa-000000000002')#>>'{battle,id}' from f),(select value#>>'{battle,id}' from results where name='start'),'Join retry returns same encounter');
select is((public.get_game_state()->>'energy')::integer,90,'Join charges exactly once');
insert into results select 'shot',public.submit_combat_order((value#>>'{battle,id}')::uuid,0,'fire',gen_random_uuid()) from results where name='start';
select is((select value#>>'{battle,defender,ship_health}' from results where name='shot'),'85','Cannon shot damages shared hull');
select is((select value#>>'{battle,attacker,ship_health}' from results where name='shot'),'85','Defender fires back at joiner');
select set_config('request.jwt.claims','{"sub":"d4000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is((select public.get_combat((value#>>'{battle,id}')::uuid)#>>'{defender,ship_health}' from results where name='start'),'85','Other attacker sees shared hull');
select is((select public.get_combat((value#>>'{battle,id}')::uuid)->>'phase' from results where name='start'),'boarding','Other attacker keeps boarding phase');
insert into results select 'crew',public.submit_combat_order((value#>>'{battle,id}')::uuid,1,'crew_attack',gen_random_uuid()) from results where name='start';
select is((select value#>>'{battle,defender,crew_health}' from results where name='crew'),'85','Boarding damages shared crew');
select is((select (person->>'ship_damage')::integer from results cross join lateral jsonb_array_elements(value#>'{battle,people}') person
  where name='crew' and person->>'id'=(select a::text from f)),0,'Boarding does not add ship damage');
select is((select (person->>'crew_damage')::integer from results cross join lateral jsonb_array_elements(value#>'{battle,people}') person
  where name='crew' and person->>'id'=(select a::text from f)),15,'Active encounter exposes crew damage');
select is((select (person->>'ship_damage')::integer from results cross join lateral jsonb_array_elements(value#>'{battle,people}') person
  where name='crew' and person->>'id'=(select b::text from f)),15,'Other attacker retains separate ship damage');
select is((select value#>>'{battle,attacker,crew_health}' from results where name='crew'),'85','Defender counters in boarding phase');
select set_config('request.jwt.claims','{"sub":"d4000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select is(public.get_attack_lock(),null::jsonb,'Defender is not route locked');
select is((public.get_game_state()->>'ship_health')::integer,85,'Defender sees actual hull damage');
select is((public.get_game_state()->>'crew_health')::integer,85,'Defender sees actual crew damage');
select throws_ok($$select public.train_crew('attack','crew_1',gen_random_uuid())$$,'P0001','IN_COMBAT','Defender cannot train during combat');
select is((select count(*)::integer from public.player_game_events),1,'Only own realtime signal is readable');
select throws_ok('update public.player_game_events set revision=99','42501',null,'Players cannot forge signals');
reset role;
select is((select state#>>'{defender,crew,attack}' from private.combats where id=(select (value#>>'{battle,id}')::uuid from results where name='start')),'1','Blocked training leaves combat stats unchanged');
update private.combats set state=jsonb_set(state,'{defender,ship_health}','1') where id=(select (value#>>'{battle,id}')::uuid from results where name='start');
update public.characters set ship_health=1 where id=(select d from f);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d4000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
insert into results select 'finish',public.submit_combat_order((value#>>'{battle,id}')::uuid,1,'fire',gen_random_uuid()) from results where name='start';
select is((select value#>>'{battle,status}' from results where name='finish'),'completed','Hull defeat ends shared battle');
select is((select value#>>'{battle,winner_id}' from results where name='finish'),(select b::text from f),'Final hitter wins');
select is((select value#>>'{battle,outcome}' from results where name='finish'),'hull_victory','Hull defeat wins race against boarding');
select is(public.get_attack_lock(),null::jsonb,'Winner is unlocked');
select set_config('request.jwt.claims','{"sub":"d4000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is((select public.get_combat((value#>>'{battle,id}')::uuid)->>'participant_status' from results where name='start'),'assist','Other active attacker earns assist');
select is(public.get_attack_lock(),null::jsonb,'Assist is unlocked');
select is((select public.submit_combat_order((value#>>'{battle,id}')::uuid,2,'crew_attack',gen_random_uuid())#>>'{battle,defender,crew_health}' from results where name='start'),'0','Sinking kills crew and late orders cannot damage completed defender');
set local role anon;
select set_config('request.jwt.claims','{}',true);
insert into results select 'public',public.get_combat_log((value#>>'{battle,id}')::uuid) from results where name='start';
select is((select value->>'id' from results where name='public'),(select value#>>'{battle,id}' from results where name='start'),'Anonymous visitor opens completed report');
select is((select jsonb_array_length(value->'people') from results where name='public'),3,'Public report lists participants');
select is((select (person->>'ship_damage')::integer from results cross join lateral jsonb_array_elements(value->'people') person
  where name='public' and person->>'id'=(select b::text from f)),16,'Ship total includes actual final-hit damage');
select is((select (person->>'crew_damage')::integer from results cross join lateral jsonb_array_elements(value->'people') person
  where name='public' and person->>'id'=(select b::text from f)),0,'Cannon attacker has zero crew damage');
select is((select (person->>'ship_damage')::integer from results cross join lateral jsonb_array_elements(value->'people') person
  where name='public' and person->>'id'=(select d::text from f)),45,'Defender ship damage sums counters against all attackers');
select is((select (person->>'crew_damage')::integer from results cross join lateral jsonb_array_elements(value->'people') person
  where name='public' and person->>'id'=(select d::text from f)),15,'Defender crew damage uses the phase before transitions');
select ok((select bool_and((person->>'damage')::integer=(person->>'ship_damage')::integer+(person->>'crew_damage')::integer)
  from results cross join lateral jsonb_array_elements(value->'people') person where name='public'),'Split damage matches historical total for everyone');
select ok((select value::text not like '%24681357%' and value::text not like '%@example.test%' and value::text not like '%defence_order%' and value::text not like '%start_request_id%' from results where name='public'),'Public report hides private fields');
select throws_ok('select * from public.player_game_events','42501',null,'Anonymous visitors cannot watch private signals');
reset role;
select is((select count(*)::integer from private.combat_engagements where combat_id=(select (value#>>'{battle,id}')::uuid from results where name='start')),0,'Completion releases everyone');
update public.characters set hospital_started_at=null,hospital_until=null,protected_until=null,ship_health=100,crew_health=100,ship_recovery_at=clock_timestamp(),crew_recovery_at=clock_timestamp() where id in(select a from f union select b from f union select d from f);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d4000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
insert into results select 'second',public.start_combat(d,gen_random_uuid()) from f;
select set_config('request.jwt.claims','{"sub":"d4000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select ok((select public.start_combat(d,gen_random_uuid()) ? 'battle' from f),'New encounter is joinable');
select set_config('request.jwt.claims','{"sub":"d4000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
insert into results select 'left',public.submit_combat_order((value#>>'{battle,id}')::uuid,0,'retreat',gen_random_uuid()) from results where name='second';
select is((select value#>>'{battle,status}' from results where name='left'),'active','One retreat leaves other attacker fighting');
select is((select value#>>'{battle,participant_status}' from results where name='left'),'retreated','Only leaving attacker retreats');
select is(public.get_attack_lock(),null::jsonb,'Retreat unlocks attacker');
select is((select public.start_combat(d,gen_random_uuid())->>'error' from f),'ALREADY_PARTICIPATED','Cannot reset rounds by rejoining');
select lives_ok($$select public.train_crew('attack','crew_1',gen_random_uuid())$$,'Retreated attacker resumes game actions');
reset role;
update private.combat_participants set deadline=clock_timestamp()-interval '3 minutes' where combat_id=(select (value#>>'{battle,id}')::uuid from results where name='second') and status='active';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d4000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
insert into results select 'expired',public.get_combat((value#>>'{battle,id}')::uuid) from results where name='second';
select is((select value->>'status' from results where name='expired'),'completed','Last timeout ends encounter');
select is(public.get_attack_lock(),null::jsonb,'Timeout unlocks last attacker');
select ok((public.get_game_state()->>'ship_health')::integer>(select (value#>>'{attacker,ship_health}')::integer from results where name='expired'),'Healing starts from deadline');
reset role;
select * from finish();
rollback;
