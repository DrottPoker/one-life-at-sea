begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
insert into auth.users(id,email,is_anonymous,raw_user_meta_data) values
('ad000000-0000-4000-8000-000000000001','admin-owner@example.test',false,'{"character_name":"AdminOwnerTest"}'),
('ad000000-0000-4000-8000-000000000002','admin-player@example.test',false,'{"character_name":"AdminPlayerTest","role":"admin","is_admin":true}'),
('ad000000-0000-4000-8000-000000000003','admin-anon@example.test',true,'{}');
insert into private.admin_members(user_id) values('ad000000-0000-4000-8000-000000000001'),('ad000000-0000-4000-8000-000000000003');
select set_config('test.captain',(select id::text from public.characters where user_id='ad000000-0000-4000-8000-000000000002'),true);
select set_config('test.owner',(select id::text from public.characters where user_id='ad000000-0000-4000-8000-000000000001'),true);
select set_config('test.circulation',(select total::text from private.item_circulation where item_id='linen_bandages'),true);
set local role anon;
select throws_ok($$select public.is_admin()$$,'42501',null,'Anon cannot query membership');
select throws_ok($$select public.admin_catalog()$$,'42501',null,'Anon cannot read catalog');
select throws_ok($$select public.admin_overview()$$,'42501',null,'Anon cannot read overview');
select throws_ok($$select public.admin_read('characters')$$,'42501',null,'Anon cannot browse players');
select throws_ok($$select public.admin_mutate('grant_items','{}',gen_random_uuid(),'test')$$,'42501',null,'Anon cannot grant');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"ad000000-0000-4000-8000-000000000002","role":"authenticated","user_metadata":{"is_admin":true}}',true);
select is(public.is_admin(),false,'Self-authored metadata cannot grant administration');
select throws_ok($$select public.admin_catalog()$$,'42501','ADMIN_REQUIRED','Player catalog denied');
select throws_ok($$select public.admin_read('characters')$$,'42501','ADMIN_REQUIRED','Player database denied');
select throws_ok($$select public.admin_overview()$$,'42501','ADMIN_REQUIRED','Player overview denied');
select throws_ok($$select public.admin_mutate('grant_items','{}',gen_random_uuid(),'test')$$,'42501','ADMIN_REQUIRED','Player mutations denied');
select throws_ok($$select * from private.admin_members$$,'42501',null,'Membership table is private');
select throws_ok($$insert into private.admin_members(user_id) values(auth.uid())$$,'42501',null,'Players cannot promote themselves');
select throws_ok($$select * from private.admin_audit$$,'42501',null,'Audit data is private');
select set_config('request.jwt.claims','{"sub":"ad000000-0000-4000-8000-000000000003","role":"authenticated","is_anonymous":true}',true);
select is(public.is_admin(),false,'Anonymous Auth member cannot administer');
select throws_ok($$select public.admin_read('characters')$$,'42501','ADMIN_REQUIRED','Anonymous Auth data denied');
select set_config('request.jwt.claims','{"sub":"ad000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is(public.is_admin(),true,'Explicit owner membership is effective');
select lives_ok($$select public.admin_overview()$$,'Overview works');
select ok(jsonb_array_length(public.admin_catalog())>=25,'Full game catalog is exposed to admins');
select ok(not exists(select 1 from jsonb_array_elements(public.admin_catalog()) c where c->>'schema'='auth'),'Auth secrets excluded');
select throws_ok($$select public.admin_read('auth.users')$$,'22023','UNKNOWN_RESOURCE','Auth table denied');
select throws_ok($$select public.admin_read('characters; drop table public.characters')$$,'22023','UNKNOWN_RESOURCE','Table identifier injection denied');
select throws_ok($$select public.admin_read('characters','',0,'{"user_id;drop": "test"}')$$,'22023','INVALID_FILTER','Filter identifier injection denied');
select is(public.admin_read('characters','AdminPlayerTest')->>'total','1','Literal player search works');
select is(public.admin_read('characters','%',0)->>'total','0','Search wildcards are literal');
select is(public.admin_read('characters','AdminPlayerTest',2147483647)->>'page','0','Pagination clamps');
reset role;
update public.characters set energy_updated_at=clock_timestamp()-interval '2 days',
  ship_recovery_at=clock_timestamp()-interval '2 days',crew_recovery_at=clock_timestamp()-interval '2 days'
  where id=current_setting('test.captain')::uuid;
set local role authenticated;
select set_config('test.row',(public.admin_read('characters','',0,jsonb_build_object('id',current_setting('test.captain')))->'rows'->0)::text,true);
select is(current_setting('test.row')::jsonb#>>'{values,gold_coins}','0','Admin sees exact values');
select set_config('test.update',jsonb_build_object('resource','characters','key',jsonb_build_object('id',current_setting('test.captain')),
  'version',current_setting('test.row')::jsonb->>'version','changes',jsonb_build_object('gold_coins','12345','crew_attack','1000','energy','37','ship_health','70','crew_health','80'))::text,true);
select lives_ok($$select public.admin_mutate('update',current_setting('test.update')::jsonb,'ad100000-0000-4000-8000-000000000001','Adjust player stats')$$,'Admin can update another player');
select lives_ok($$select public.admin_mutate('update',current_setting('test.update')::jsonb,'ad100000-0000-4000-8000-000000000001','Adjust player stats')$$,'Update retry returns receipt');
select set_config('request.jwt.claims','{"sub":"ad000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is(public.get_game_state()->>'energy','37','Manual energy does not regenerate from an old timestamp');
select is(public.get_game_state()->>'ship_health','70','Manual ship health does not recover immediately');
select is(public.get_game_state()->>'crew_health','80','Manual crew health does not recover immediately');
select set_config('request.jwt.claims','{"sub":"ad000000-0000-4000-8000-000000000001","role":"authenticated"}',true);

select is(public.admin_read('characters','',0,jsonb_build_object('id',current_setting('test.captain')))#>>'{rows,0,values,gold_coins}','12345','Updated gold persisted');
select throws_ok($$select public.admin_mutate('update',current_setting('test.update')::jsonb,gen_random_uuid(),'Stale edit test')$$,'40001','STALE_ROW','Stale edits cannot overwrite new values');
select throws_ok($$select public.admin_mutate('update',current_setting('test.update')::jsonb,'ad100000-0000-4000-8000-000000000001','Changed reason')$$,'22023','REQUEST_CONFLICT','Receipt payload cannot change');
select throws_ok($$select public.admin_mutate('update',jsonb_set(current_setting('test.update')::jsonb,'{changes}','{"user_id":"ad000000-0000-4000-8000-000000000001"}'),gen_random_uuid(),'Account takeover')$$,'42501','READ_ONLY_COLUMN','Account identity cannot be reassigned');
select throws_ok($$select public.admin_mutate('delete',jsonb_build_object('resource','admin_audit'),gen_random_uuid(),'Erase audit')$$,'42501','READ_ONLY_RESOURCE','Admin audit cannot be deleted');
select throws_ok($$select public.admin_mutate('update',jsonb_build_object('resource','admin_members'),gen_random_uuid(),'Promote user')$$,'42501','READ_ONLY_RESOURCE','Raw membership cannot be edited');
select set_config('test.grant',jsonb_build_object('character_id',current_setting('test.captain'),'item_id','linen_bandages','quantity','20')::text,true);
select lives_ok($$select public.admin_mutate('grant_items',current_setting('test.grant')::jsonb,'ad100000-0000-4000-8000-000000000002','Grant bandages')$$,'Stack grant works');
select lives_ok($$select public.admin_mutate('grant_items',current_setting('test.grant')::jsonb,'ad100000-0000-4000-8000-000000000002','Grant bandages')$$,'Grant retry works');
select is(public.admin_read('item_stacks','',0,jsonb_build_object('character_id',current_setting('test.captain')))#>>'{rows,0,values,quantity}','20','Retry does not duplicate items');
select is((public.admin_read('item_circulation','',0,'{"item_id":"linen_bandages"}')#>>'{rows,0,values,total}')::numeric,
  current_setting('test.circulation')::numeric+20,'Grant updates circulation');
select lives_ok($$select public.admin_mutate('grant_items',jsonb_build_object('character_id',current_setting('test.captain'),'item_id','cutlass','quantity','2','damage','32.15','accuracy','54.60'),gen_random_uuid(),'Grant equipment')$$,'Equipment grant works');
select is(public.admin_read('item_instances','',0,jsonb_build_object('character_id',current_setting('test.captain')))->>'total','2','Separate equipment instances created');
select is(public.admin_read('item_instances','',0,jsonb_build_object('character_id',current_setting('test.captain')))#>>'{rows,0,values,damage}','32.15','Equipment stats retained');
select throws_ok($$select public.admin_mutate('grant_items',current_setting('test.grant')::jsonb||'{"quantity":"NaN"}',gen_random_uuid(),'Bad amount')$$,'22023','INVALID_QUANTITY','NaN denied');
select throws_ok($$select public.admin_mutate('grant_items',current_setting('test.grant')::jsonb||'{"quantity":"1.5"}',gen_random_uuid(),'Bad amount')$$,'22023','INVALID_QUANTITY','Fraction denied');
select throws_ok($$select public.admin_mutate('grant_items',current_setting('test.grant')::jsonb||'{"quantity":"1000001"}',gen_random_uuid(),'Bad amount')$$,'22023','INVALID_QUANTITY','Huge batch denied');
select throws_ok($$select public.admin_mutate('grant_items',current_setting('test.grant')::jsonb||'{"quantity":"101","item_id":"cutlass"}',gen_random_uuid(),'Bad equipment amount')$$,'22023','EQUIPMENT_LIMIT','Equipment batches bounded');
select throws_ok($$select public.admin_mutate('grant_items',current_setting('test.grant')::jsonb||'{"quantity":"1","item_id":"cutlass","damage":"1","accuracy":"101"}',gen_random_uuid(),'Bad equipment stats')$$,'22023','INVALID_STATS','Stats bounded');
select throws_ok($$select public.admin_mutate('grant_items',current_setting('test.grant')::jsonb,gen_random_uuid(),' ')$$,'22023','INVALID_REQUEST','Meaningful reason required');
select set_config('test.stack',(public.admin_read('item_stacks','',0,jsonb_build_object('character_id',current_setting('test.captain')))->'rows'->0)::text,true);
select set_config('test.delete',jsonb_build_object('resource','item_stacks','key',jsonb_build_object('id',current_setting('test.stack')::jsonb#>>'{values,id}'),'version',current_setting('test.stack')::jsonb->>'version')::text,true);
select lives_ok($$select public.admin_mutate('delete',current_setting('test.delete')::jsonb,'ad100000-0000-4000-8000-000000000003','Remove stack')$$,'Admin removes a stack');
select lives_ok($$select public.admin_mutate('delete',current_setting('test.delete')::jsonb,'ad100000-0000-4000-8000-000000000003','Remove stack')$$,'Delete retry succeeds after row is gone');
select is(public.admin_read('item_stacks','',0,jsonb_build_object('character_id',current_setting('test.captain')))->>'total','0','Stack removed');
select is((public.admin_read('item_circulation','',0,'{"item_id":"linen_bandages"}')#>>'{rows,0,values,total}')::numeric,current_setting('test.circulation')::numeric,'Deletion updates circulation');
select is(public.admin_read('admin_audit','',0,'{"actor_id":"ad000000-0000-4000-8000-000000000001"}')->>'total','4','One audit per successful operation; no failed or duplicate writes');
select ok(public.admin_read('admin_audit','',0,'{"request_id":"ad100000-0000-4000-8000-000000000001"}')#>>'{rows,0,values,before_data}' is not null,'Audit preserves previous values');
select ok(public.admin_read('admin_audit','',0,'{"request_id":"ad100000-0000-4000-8000-000000000001"}')#>>'{rows,0,values,after_data}' like '%12345%','Audit preserves changed values');
reset role;
update public.characters set crew_health=0 where id=current_setting('test.captain')::uuid;
set local role authenticated;
select lives_ok($$select public.admin_mutate('grant_items',current_setting('test.grant')::jsonb,gen_random_uuid(),'Grant in hospital')$$,'Admin grants work for hospital patients');
select set_config('test.row',(public.admin_read('characters','',0,jsonb_build_object('id',current_setting('test.captain')))->'rows'->0)::text,true);
select lives_ok($$select public.admin_mutate('update',jsonb_build_object('resource','characters','key',jsonb_build_object('id',current_setting('test.captain')),
  'version',current_setting('test.row')::jsonb->>'version','changes','{"hospital_started_at":null,"hospital_until":null,"ship_health":"100","crew_health":"100"}'::jsonb),
  gen_random_uuid(),'Release from hospital')$$,'Admin releases patient');
select is(public.admin_read('hospital_patients','',0,jsonb_build_object('character_id',current_setting('test.captain')))->>'total','0','Release updates patient projection');
select public.start_combat(current_setting('test.captain')::uuid,gen_random_uuid());
select set_config('test.row',(public.admin_read('characters','',0,jsonb_build_object('id',current_setting('test.captain')))->'rows'->0)::text,true);
select throws_ok($$select public.admin_mutate('update',jsonb_build_object('resource','characters','key',jsonb_build_object('id',current_setting('test.captain')),
  'version',current_setting('test.row')::jsonb->>'version','changes','{"crew_health":"80"}'::jsonb),gen_random_uuid(),'Edit combat target')$$,'P0001','PLAYER_IN_COMBAT','Health edits cannot diverge combat snapshots');
select lives_ok($$select public.admin_mutate('end_combat',jsonb_build_object('character_id',current_setting('test.captain'),
  'combat_id',public.admin_read('combat_engagements','',0,jsonb_build_object('character_id',current_setting('test.captain')))#>>'{rows,0,values,combat_id}'),gen_random_uuid(),'End test combat')$$,'Admin ends combat');
select is(public.admin_read('combat_engagements','',0,jsonb_build_object('character_id',current_setting('test.captain')))->>'total','0','Combat locks released');
select is(public.admin_read('combats','',0,jsonb_build_object('attacker_id',current_setting('test.owner')))#>>'{rows,0,values,status}','completed','Admin interruption completes combat');
select is(public.admin_read('characters','',0,jsonb_build_object('id',current_setting('test.owner')))#>>'{rows,0,values,ship_health}','100','Admin interruption causes no damage');
select ok(public.admin_read('combat_rounds','admin_end')->>'total' <> '0','Admin interruption is identified in combat history');
select lives_ok($$select public.start_ship_upgrade('attack',5,'ship_1',gen_random_uuid())$$,'Create ship job for cancellation');
select set_config('test.job',(public.admin_read('ship_upgrade_jobs','',0,jsonb_build_object('character_id',current_setting('test.owner'),'applied_at',null))->'rows'->0)::text,true);
select is(current_setting('test.job')::jsonb#>>'{values,applied_at}',null,'NULL filter identifies pending jobs');
select set_config('test.cancel',jsonb_build_object('character_id',current_setting('test.owner'),'version',current_setting('test.job')::jsonb->>'version')::text,true);
select lives_ok($$select public.admin_mutate('cancel_ship_job',current_setting('test.cancel')::jsonb,'ad100000-0000-4000-8000-000000000004','Cancel pending job')$$,'Admin cancels pending job');
select lives_ok($$select public.admin_mutate('cancel_ship_job',current_setting('test.cancel')::jsonb,'ad100000-0000-4000-8000-000000000004','Cancel pending job')$$,'Cancellation retry returns receipt');
select is(public.admin_read('ship_upgrade_jobs','',0,jsonb_build_object('character_id',current_setting('test.owner'),'applied_at',null))->>'total','0','Cancelled job cannot later grant stats');
select is(public.get_game_state()->>'ship_attack','10','Cancelled job did not grant stats');
select set_config('test.progress',(public.admin_read('character_training','',0,jsonb_build_object('character_id',current_setting('test.captain'),'training_group','crew'))->'rows'->0)::text,true);
select lives_ok($$select public.admin_mutate('update',jsonb_build_object('resource','character_training',
  'key',jsonb_build_object('character_id',current_setting('test.captain'),'training_group','crew'),
  'version',current_setting('test.progress')::jsonb->>'version','changes','{"xp":"9007199254740991","tier_id":"crew_2"}'::jsonb),
  gen_random_uuid(),'Adjust training progress')$$,'Composite-key progression edit works');
select is(public.admin_read('character_training','',0,jsonb_build_object('character_id',current_setting('test.captain'),'training_group','crew'))#>>'{rows,0,values,xp}','9007199254740991','Large XP values retain exact precision');
select lives_ok($$select public.admin_mutate('grant_items',jsonb_build_object('character_id',current_setting('test.captain'),
  'item_id','cutlass','quantity','60','damage','1.25','accuracy','0'),gen_random_uuid(),'Test equipment pagination')$$,'Large permitted grant works');
select is(jsonb_array_length(public.admin_read('item_instances','',0,jsonb_build_object('character_id',current_setting('test.captain')))->'rows'),50,'Database page is bounded');
select is(jsonb_array_length(public.admin_read('item_instances','',1,jsonb_build_object('character_id',current_setting('test.captain')))->'rows'),12,'Remaining records appear on next page');
reset role;
delete from private.admin_members where user_id='ad000000-0000-4000-8000-000000000001';
set local role authenticated;
select is(public.is_admin(),false,'Revocation takes effect without refreshing JWT');
select throws_ok($$select public.admin_read('characters')$$,'42501','ADMIN_REQUIRED','Revoked admin cannot browse');
select throws_ok($$select public.admin_mutate('grant_items',current_setting('test.grant')::jsonb,'ad100000-0000-4000-8000-000000000002','Grant bandages')$$,'42501','ADMIN_REQUIRED','Revocation blocks old receipt replay');
reset role;
select is((select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='private'
  and c.relname in ('admin_members','admin_audit','admin_resources') and c.relrowsecurity),3::bigint,'Admin tables have RLS');
select * from finish();
rollback;

