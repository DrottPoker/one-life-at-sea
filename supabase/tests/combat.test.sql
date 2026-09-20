begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users(id,email,is_anonymous,raw_user_meta_data) values
('c3000000-0000-4000-8000-000000000001','combat-one@example.test',false,'{"character_name":"Combat Captain One"}'),
('c3000000-0000-4000-8000-000000000002','combat-two@example.test',false,'{"character_name":"Combat Captain Two"}'),
('c3000000-0000-4000-8000-000000000003','combat-three@example.test',false,'{"character_name":"Combat Captain Three"}'),
('c3000000-0000-4000-8000-000000000004','combat-anon@example.test',true,'{}');
create temporary table combat_fixtures as select
  (select id from public.characters where user_id='c3000000-0000-4000-8000-000000000001') as a,
  (select id from public.characters where user_id='c3000000-0000-4000-8000-000000000002') as d,
  (select id from public.characters where user_id='c3000000-0000-4000-8000-000000000003') as outsider;
-- Keep combat behavior fixtures independent of character creation defaults.
update public.characters set ship_attack=1,ship_defense=1,ship_speed=1,ship_accuracy=1,crew_attack=1,crew_defense=1,crew_speed=1,crew_accuracy=1 where id in(select a from combat_fixtures union all select d from combat_fixtures union all select outsider from combat_fixtures);
create temporary table combat_results (name text primary key, value jsonb);
grant all on combat_fixtures,combat_results to authenticated;

insert into combat_results select 'base',jsonb_build_object('attacker',private.combat_snapshot(acap,clock_timestamp()),
  'defender',private.combat_snapshot(dcap,clock_timestamp()),'phase','sea','round',0,'status','active')
from public.characters acap,public.characters dcap,combat_fixtures f where acap.id=f.a and dcap.id=f.d;

insert into combat_results select 'fire',private.resolve_combat_round(value,'fire',array[0.0,0.0,0.0]) from combat_results where name='base';
select is((select value#>>'{state,attacker,ship_health}' from combat_results where name='fire'),'85','Attacker takes the defender shot');
select is((select value#>>'{state,defender,ship_health}' from combat_results where name='fire'),'85','Defender takes the attacker shot');
select is((select value#>>'{state,attacker,ammo}' from combat_results where name='fire'),'9','A volley consumes one ammunition');
select is((select value#>>'{state,defender,ammo}' from combat_results where name='fire'),'9','Offline defence consumes ammunition');
select is((select value#>>'{state,phase}' from combat_results where name='fire'),'sea','Shooting stays at sea');
select is((select value#>>'{state,round}' from combat_results where name='fire'),'1','Both orders advance one round');
select is((select private.resolve_combat_round(value,'fire',array[0.99,0.99,0.99])#>>'{state,attacker,ammo}' from combat_results where name='base'),'9','Misses still consume ammunition');
select is((select private.resolve_combat_round(value,'fire',array[0.99,0.99,0.99])#>>'{state,attacker,ship_health}' from combat_results where name='base'),'100','A miss causes no damage');
select is((select private.resolve_combat_round(
  jsonb_set(jsonb_set(value,'{attacker,ship_health}','15'),'{defender,ship_health}','15'),'fire',array[0.0,0.0,0.0])#>>'{state,outcome}'
  from combat_results where name='base'),'draw','Simultaneous lethal hits are a draw');
select is((select private.resolve_combat_round(jsonb_set(value,'{defender,ship_health}','1'),'fire',array[0.0,0.0,0.0])#>>'{state,outcome}'
  from combat_results where name='base'),'hull_victory','Zero hull ends the sea battle');
select is((select private.resolve_combat_round(jsonb_set(value,'{defender,ship_health}','1'),'fire',array[0.0,0.0,0.0])#>>'{state,attacker,ship_health}'
  from combat_results where name='base'),'85','A defeated defender still fires its locked shot');
select is((select private.resolve_combat_round(value,'board',array[0.0,0.0,0.0])#>>'{state,phase}' from combat_results where name='base'),'boarding','Successful boarding changes phase');
select is((select private.resolve_combat_round(value,'board',array[0.0,0.0,0.0])#>>'{state,attacker,ship_health}' from combat_results where name='base'),'85','Boarding takes the defender salvo');
select is((select private.resolve_combat_round(value,'board',array[0.0,0.0,0.0])#>>'{state,defender,ship_health}' from combat_results where name='base'),'100','Boarding replaces the attacker salvo');
select is((select private.resolve_combat_round(value,'board',array[0.0,0.0,0.99])#>>'{state,phase}' from combat_results where name='base'),'sea','A failed boarding attempt stays at sea');
select is((select private.resolve_combat_round(jsonb_set(value,'{attacker,ship_health}','1'),'board',array[0.0,0.0,0.0])#>>'{state,outcome}'
  from combat_results where name='base'),'hull_victory','Hull defeat takes precedence over boarding');
select is((select private.resolve_combat_round(jsonb_set(value,'{defender,defence_order}','"boarding"'),'board',array[0.99,0.99,0.99])#>>'{state,phase}'
  from combat_results where name='base'),'boarding','Mutual boarding succeeds without a roll');
select is((select private.resolve_combat_round(jsonb_set(value,'{defender,ammo}','0'),'fire',array[0.99,0.99,0.0])#>>'{event,defender_order}'
  from combat_results where name='base'),'board','Defender boards when ammunition is empty');

insert into combat_results select 'boarding',jsonb_set(value,'{phase}','"boarding"') from combat_results where name='base';
select is((select private.resolve_combat_round(value,'crew_attack',array[0.0,0.0,0.0])#>>'{state,attacker,crew_health}'
  from combat_results where name='boarding'),'85','Crew attacks damage crew health');
select is((select private.resolve_combat_round(value,'crew_attack',array[0.0,0.0,0.0])#>>'{state,attacker,ship_health}'
  from combat_results where name='boarding'),'100','Crew attacks preserve hull health');
select is((select private.resolve_combat_round(value,'crew_attack',array[0.0,0.0,0.0])#>>'{state,attacker,ammo}'
  from combat_results where name='boarding'),'10','Boarding does not consume ammunition');
select is((select private.resolve_combat_round(jsonb_set(value,'{defender,crew_health}','1'),'crew_attack',array[0.0,0.0,0.0])#>>'{state,outcome}'
  from combat_results where name='boarding'),'boarding_victory','Zero crew health is a boarding victory');
select is((select private.resolve_combat_round(value,'disengage',array[0.0,0.0,0.0])#>>'{state,phase}'
  from combat_results where name='boarding'),'sea','Disengage returns both sides to sea');
select is((select private.resolve_combat_round(value,'disengage',array[0.0,0.0,0.0])#>>'{state,attacker,crew_health}'
  from combat_results where name='boarding'),'85','Disengage risks a crew counterattack');
select is((select private.resolve_combat_round(value,'retreat',array[0.0,0.0,0.0])#>>'{state,outcome}'
  from combat_results where name='boarding'),'retreated','Retreat ends boarding');
select is((select private.resolve_combat_round(jsonb_set(value,'{attacker,crew_health}','1'),'retreat',array[0.0,0.0,0.0])#>>'{state,outcome}'
  from combat_results where name='boarding'),'boarding_victory','A lethal counterattack defeats a retreating captain');
select is((select private.resolve_combat_round(jsonb_set(value,'{round}','24'),'board',array[0.99,0.99,0.0])#>>'{state,outcome}'
  from combat_results where name='base'),'draw','Round limit is shared by both phases');
select throws_ok($$select private.resolve_combat_round(value,'crew_attack',array[0.0,0.0,0.0]) from combat_results where name='base'$$,
  '22023','INVALID_ORDER','Wrong phase orders are rejected');
select throws_ok($$select private.resolve_combat_round(jsonb_set(value,'{attacker,ammo}','0'),'fire',array[0.0,0.0,0.0]) from combat_results where name='base'$$,
  'P0001','NO_AMMO','Empty ammunition cannot fire');
select is(private.health_snapshot(0,'2026-01-01Z','2026-01-01 00:00:29Z',30),0,'Hull recovery waits for a complete interval');
select is(private.health_snapshot(0,'2026-01-01Z','2026-01-01 00:00:30Z',30),1,'Hull recovers after thirty seconds');
select is(private.health_snapshot(0,'2026-01-01Z','2026-01-01 00:00:10Z',10),1,'Crew recovers after ten seconds');
select is(private.health_snapshot(99,'2026-01-01Z','2026-01-02Z',10),100,'Offline healing caps at 100');
select is(private.health_snapshot(50,'2026-01-02Z','2026-01-01Z',10),50,'Backwards time does not remove health');

update public.characters set ship_health=41,crew_health=65,ship_recovery_at=clock_timestamp(),crew_recovery_at=clock_timestamp()
  where id=(select a from combat_fixtures);
update public.characters set energy=0,ship_health=48,crew_health=73,ship_recovery_at=clock_timestamp(),crew_recovery_at=clock_timestamp()
  where id=(select d from combat_fixtures);
set local role anon;
select throws_ok($$select public.get_combat_preview((select a from combat_fixtures))$$,'42501',null,'Anonymous preview is forbidden');
select throws_ok($$select public.start_combat(null,null)$$,'42501',null,'Anonymous start is forbidden');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c3000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select throws_ok('select * from private.combats','42501',null,'Private battle snapshots cannot be read directly');
select throws_ok($$select private.resolve_combat_round('{}','fire',array[0.0,0.0,0.0])$$,'42501',null,'Clients cannot choose their random rolls');
insert into combat_results select 'preview',public.get_combat_preview(d) from combat_fixtures;
select is((select value->>'can_start' from combat_results where name='preview'),'true','Damaged captains can start combat');
select is((select value#>>'{attacker,ship_health}' from combat_results where name='preview'),'41','Preview uses actual damaged hull');
select is((select value#>>'{defender,cannons}' from combat_results where name='preview'),null,'Enemy equipment is absent before start');
select is((select value#>>'{defender,ship}' from combat_results where name='preview'),null,'Enemy training stats are absent');
select is((public.get_game_state()->>'energy')::integer,100,'Preview costs no energy');
select is((select public.start_combat(a,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa0')->>'error' from combat_fixtures),'SELF_ATTACK','Self attacks rejected');
insert into combat_results select 'start',public.start_combat(d,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1') from combat_fixtures;
select ok((select value ? 'battle' from combat_results where name='start'),'Combat starts for injured participants');
select is((public.get_game_state()->>'energy')::integer,90,'Start costs exactly ten energy');
select is((select value#>>'{battle,attacker,ship_health}' from combat_results where name='start'),'41','Starting does not refill damaged hull');
select is((select value#>>'{battle,defender,cannons}' from combat_results where name='start'),'Basic cannons','Equipment revealed after start');
select is((select value#>>'{battle,defender,ship}' from combat_results where name='start'),null,'Trained enemy stats stay hidden');
select is((select value#>>'{battle,defender,ammo}' from combat_results where name='start'),null,'Enemy ammunition stays hidden');
select ok((select public.start_combat(d,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1')#>>'{battle,id}' =
  (select value#>>'{battle,id}' from combat_results where name='start') from combat_fixtures),'Start retry returns the original battle');
select is((public.get_game_state()->>'energy')::integer,90,'Start retry does not spend energy twice');
select throws_ok($$select public.train_crew('attack','crew_1',gen_random_uuid())$$,'P0001','IN_COMBAT','Training blocked only during active combat');
select is((select public.start_combat(outsider,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2')->>'error' from combat_fixtures),'IN_COMBAT','One active encounter per captain');

insert into combat_results select 'round',public.submit_combat_order((value#>>'{battle,id}')::uuid,0,'fire','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1')
  from combat_results where name='start';
select is((select value#>>'{battle,round}' from combat_results where name='round'),'1','A real persisted round advances');
select is((select value#>>'{battle,attacker,ammo}' from combat_results where name='round'),'9','Real round spends one salvo');
select is((select public.submit_combat_order((value#>>'{battle,id}')::uuid,0,'fire','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1')#>>'{battle,round}'
  from combat_results where name='start'),'1','Order retry does not duplicate a round');
select is((select public.submit_combat_order((value#>>'{battle,id}')::uuid,0,'board','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1')->>'error'
  from combat_results where name='start'),'REQUEST_CONFLICT','Request IDs cannot be reused with a different order');
select is((select public.submit_combat_order((value#>>'{battle,id}')::uuid,0,'fire','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2')->>'error'
  from combat_results where name='start'),'STALE_ROUND','A second tab cannot replay an old round');
select throws_ok($$select public.save_defence_orders('boarding')$$,'P0001','IN_COMBAT','Defence orders cannot be changed during combat');
select throws_ok($$select public.save_defence_orders('cheat')$$,'22023','INVALID_PRESET','Unknown defence presets are rejected');

select set_config('request.jwt.claims','{"sub":"c3000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is((public.get_game_state()->>'energy')::integer,0,'Defence requires no energy');
select is((select public.get_combat((value#>>'{battle,id}')::uuid)#>>'{defender,ammo}' from combat_results where name='start'),'9','Defender can read their own ammunition');
select is((select public.get_combat((value#>>'{battle,id}')::uuid)#>>'{attacker,ship}' from combat_results where name='start'),null,'Defender cannot read attacker training stats');
select is((select public.submit_combat_order((value#>>'{battle,id}')::uuid,1,'fire','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3')->>'error'
  from combat_results where name='start'),'COMBAT_NOT_FOUND','Defender cannot submit manual attacker orders');

select set_config('request.jwt.claims','{"sub":"c3000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select is((select public.get_combat((value#>>'{battle,id}')::uuid) from combat_results where name='start'),null::jsonb,'Outsiders cannot read battle reports');
select is((select public.get_combat_preview(d)->>'can_start' from combat_fixtures),'true','An engaged defender can be joined');
select is((public.get_game_state()->>'energy')::integer,100,'Failed starts do not cost energy');

reset role;
update private.combat_participants set deadline=clock_timestamp()-interval '3 minutes' where combat_id=(select (value#>>'{battle,id}')::uuid from combat_results where name='start');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c3000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
insert into combat_results select 'timeout',public.get_combat((value#>>'{battle,id}')::uuid) from combat_results where name='start';
select is((select value->>'status' from combat_results where name='timeout'),'completed','Expired encounters end on read');
select is((select value#>>'{events,2,timed_out}' from combat_results where name='timeout'),'true','Timeout persists an automatic retreat');
select is(public.get_game_state()->>'active_combat_id',null,'Timeout releases the captain');
select ok(public.get_game_state()->>'protected_until' is not null,'Completion grants incoming attack protection');
select lives_ok($$select public.train_crew('attack','crew_1',gen_random_uuid())$$,'Training allowed while damaged and protected');
select ok((select public.start_combat(outsider,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4') ? 'battle' from combat_fixtures),'Own attack protection does not block outgoing attacks');
select is(public.get_game_state()->>'protected_until',null,'Starting an attack relinquishes protection');

reset role;
select is((select count(*)::integer from private.combat_engagements),2,'Only the current encounter retains reservations');
select ok((select state#>>'{defender,defence_order}'='cannon' from private.combats where start_request_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'),'Started battles retain snapshotted defence orders');
select ok(not has_function_privilege('authenticated','private.advance_shared_combat(uuid,uuid,text,uuid,timestamp with time zone,boolean)','execute'),'Raw combat mutation cannot be invoked by players');
select ok(not has_function_privilege('anon','public.get_combat(uuid)','execute'),'Anonymous report RPC execution revoked');

-- Eligibility uses live health, not a full-health requirement or outgoing protection.
update private.combat_participants set deadline=clock_timestamp()-interval '10 minutes' where status='active';
select set_config('request.jwt.claims','{"sub":"c3000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
select public.get_game_state();
reset role;
update public.characters set ship_health=0,crew_health=1,energy=100,protected_until=null,
  ship_recovery_at=clock_timestamp()+interval '1 hour',crew_recovery_at=clock_timestamp()+interval '1 hour'
  where id=(select a from combat_fixtures);
update public.characters set ship_health=1,crew_health=1,protected_until=null,
  ship_recovery_at=clock_timestamp()+interval '1 hour',crew_recovery_at=clock_timestamp()+interval '1 hour'
  where id=(select d from combat_fixtures);
set local role authenticated;
select is((select public.start_combat(d,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5')->>'error' from combat_fixtures),
  'IN_HOSPITAL','Zero hull sends captain to hospital');
select is((public.get_game_state()->>'energy')::integer,100,'Zero-health rejection spends nothing');
reset role;
update public.characters set ship_health=1,crew_health=0 where id=(select a from combat_fixtures);
set local role authenticated;
select is((select public.start_combat(d,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5')->>'error' from combat_fixtures),
  'IN_HOSPITAL','Zero crew sends captain to hospital');
reset role;
update public.characters set hospital_started_at=null,hospital_until=null,ship_health=1,crew_health=1,protected_until=clock_timestamp()+interval '5 minutes' where id=(select a from combat_fixtures);
update public.characters set protected_until=clock_timestamp()+interval '5 minutes' where id=(select d from combat_fixtures);
set local role authenticated;
select is((select public.start_combat(d,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5')->>'error' from combat_fixtures),
  'TARGET_PROTECTED','Incoming protection blocks an attack');
reset role;
update public.characters set protected_until=null,crew_health=0 where id=(select d from combat_fixtures);
set local role authenticated;
select is((select public.start_combat(d,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5')->>'error' from combat_fixtures),
  'TARGET_IN_HOSPITAL','Hospitalized defenders cannot be farmed');
reset role;
update public.characters set hospital_started_at=null,hospital_until=null,ship_health=1,crew_health=1 where id=(select d from combat_fixtures);
update public.characters set energy=9,energy_updated_at=clock_timestamp() where id=(select a from combat_fixtures);
set local role authenticated;
select is((select public.start_combat(d,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5')->>'error' from combat_fixtures),
  'NOT_ENOUGH_ENERGY','Insufficient combat energy rejected');
reset role;
update public.characters set energy=10 where id=(select a from combat_fixtures);
set local role authenticated;
insert into combat_results select 'one-health',public.start_combat(d,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5') from combat_fixtures;
select is((select value#>>'{battle,attacker,ship_health}' from combat_results where name='one-health'),'1','One hull health is enough to start');
select is((select value#>>'{battle,attacker,crew_health}' from combat_results where name='one-health'),'1','One crew health is enough to start');
select is((public.get_game_state()->>'energy')::integer,0,'The final ten Energy can be spent');
select is(public.get_game_state()->>'protected_until',null,'Attacking removes the attacker protection');
reset role;
update public.characters set ship_recovery_at=clock_timestamp()-interval '1 day',crew_recovery_at=clock_timestamp()-interval '1 day'
  where id=(select a from combat_fixtures);
set local role authenticated;
select is((public.get_game_state()->>'ship_health')::integer,1,'Health cannot recover during an active fight');
reset role;

select set_config('request.jwt.claims','{"sub":"c3000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
set local role authenticated;
select throws_ok($$select public.get_combat_preview((select a from combat_fixtures))$$,'42501','NOT_AUTHORIZED','Anonymous Auth sessions cannot use combat');
reset role;
select * from finish();
rollback;
