begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create or replace function private.combat_roll() returns double precision language sql volatile security invoker set search_path='' as $$ select 0.0::double precision $$;
insert into auth.users(id,email,is_anonymous,raw_user_meta_data) values
('a9970000-0000-4000-8000-000000000001','notice-one@example.test',false,'{"character_name":"NoticeAttacker"}'),
('a9970000-0000-4000-8000-000000000002','notice-two@example.test',false,'{"character_name":"NoticeJoiner"}'),
('a9970000-0000-4000-8000-000000000003','notice-target@example.test',false,'{"character_name":"NoticeDefender"}'),
('a9970000-0000-4000-8000-000000000004','notice-anon@example.test',true,'{}');
create temporary table f as select
(select id from public.characters where user_id='a9970000-0000-4000-8000-000000000001') a,
(select id from public.characters where user_id='a9970000-0000-4000-8000-000000000002') b,
(select id from public.characters where user_id='a9970000-0000-4000-8000-000000000003') d;
create temporary table r(name text primary key,value jsonb);
grant all on f,r to authenticated,anon;
select ok((select relrowsecurity from pg_class where oid='private.player_notifications'::regclass),'Inbox has RLS');
select ok(not has_function_privilege('authenticated','private.emit_notification(uuid,text,text,jsonb,timestamptz)','execute'),'Players cannot emit notifications');
select ok(not exists(select 1 from pg_publication_tables where schemaname='private' and tablename='player_notifications'),'Raw notifications are not broadcast');
select ok(not has_table_privilege('authenticated','private.player_notifications','select'),'Raw inbox is private');
select ok(not has_table_privilege('authenticated','private.player_notifications','update'),'Players cannot directly edit inbox rows');
set local role anon;
select throws_ok('select public.get_notifications()','42501',null,'Anonymous role cannot read inbox');
select throws_ok('select public.mark_notification_read(1)','42501',null,'Anonymous role cannot mark read');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a9970000-0000-4000-8000-000000000004","role":"authenticated"}',true);
select throws_ok('select public.get_notifications()','42501',null,'Anonymous accounts cannot read inbox');
select throws_ok('select public.mark_all_notifications_read(1)','42501',null,'Anonymous accounts cannot mark all read');
select set_config('request.jwt.claims','{"sub":"a9970000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select is(public.get_notification_summary()->>'unread_count','0','New inbox has no unread notifications');
select is(public.get_notifications()->'items','[]'::jsonb,'New inbox is empty');
select throws_ok('select public.get_notifications(-1)','22023',null,'Negative cursors are rejected');
select throws_ok('select public.mark_notification_read(null)','22023',null,'Null read requests are rejected');
select throws_ok('select public.mark_all_notifications_read(0)','22023',null,'Invalid bulk read requests are rejected');
select set_config('request.jwt.claims','{"sub":"a9970000-0000-4000-8000-000000000001","role":"authenticated"}',true);
insert into r select 'start',public.start_combat(d,'a9970000-0000-4000-8000-000000000011') from f;
select set_config('request.jwt.claims','{"sub":"a9970000-0000-4000-8000-000000000002","role":"authenticated"}',true);
insert into r select 'join',public.start_combat(d,'a9970000-0000-4000-8000-000000000012') from f;
select is((select value#>>'{battle,id}' from r where name='join'),(select value#>>'{battle,id}' from r where name='start'),'Attackers share a battle');
select set_config('request.jwt.claims','{"sub":"a9970000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.submit_combat_order((value#>>'{battle,id}')::uuid,0,'retreat',gen_random_uuid()) from r where name='start';
select set_config('request.jwt.claims','{"sub":"a9970000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select is(public.get_notification_summary()->>'unread_count','0','No incomplete combat log notification while another attacker is active');
reset role;
update private.combats set state=jsonb_set(state,'{defender,ship_health}','1') where id=(select (value#>>'{battle,id}')::uuid from r where name='start');
update public.characters set ship_health=1 where id=(select d from f);
insert into r select 'revision',to_jsonb(revision) from public.player_game_events where character_id=(select d from f);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a9970000-0000-4000-8000-000000000002","role":"authenticated"}',true);
insert into r select 'finish',public.submit_combat_order((value#>>'{battle,id}')::uuid,0,'fire','a9970000-0000-4000-8000-000000000013') from r where name='start';
select public.submit_combat_order((value#>>'{battle,id}')::uuid,0,'fire','a9970000-0000-4000-8000-000000000013') from r where name='start';
select is(public.get_notification_summary()->>'unread_count','0','Attackers do not receive the defender notification');
select set_config('request.jwt.claims','{"sub":"a9970000-0000-4000-8000-000000000003","role":"authenticated"}',true);
insert into r values('inbox',public.get_notifications());
select is((select value->>'unread_count' from r where name='inbox'),'1','Completed attack creates exactly one unread notification, including replays');
select is((select value#>>'{items,0,kind}' from r where name='inbox'),'combat.attacked','Attack kind is explicit');
select is((select value#>>'{items,0,payload,battle_id}' from r where name='inbox'),(select value#>>'{battle,id}' from r where name='start'),'Notification links to its exact combat log');
select is((select value#>>'{items,0,payload,hospitalized}' from r where name='inbox'),'true','Hospital result is recorded');
select is((select jsonb_array_length(value#>'{items,0,payload,attackers}') from r where name='inbox'),2,'Both attackers appear in a single notification');
select is((select value#>>'{items,0,payload,attackers,0,name}' from r where name='inbox'),'NoticeAttacker','Retreated attacker remains included');
select is((select value#>>'{items,0,payload,attackers,1,name}' from r where name='inbox'),'NoticeJoiner','Joined attacker remains included');
select ok((select (value#>>'{items,0,payload,attackers,0,player_number}')::bigint>=100001 from r where name='inbox'),'Attacker has a public profile link');
select ok((select public.get_combat_log((value#>>'{battle,id}')::uuid) is not null from r where name='start'),'Linked report is available');
select set_config('request.jwt.claims','{"sub":"a9970000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.mark_notification_read((value#>>'{items,0,id}')::bigint) from r where name='inbox';
select public.mark_all_notifications_read((value#>>'{items,0,id}')::bigint) from r where name='inbox';
select is(public.get_notifications()->'items','[]'::jsonb,'Other player cannot read the inbox');
select is((select public.get_notifications((value#>>'{items,0,id}')::bigint)->'items' from r where name='inbox'),'[]'::jsonb,'Forged cursor never exposes another inbox');
select set_config('request.jwt.claims','{"sub":"a9970000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select is(public.get_notification_summary()->>'unread_count','1','Other player cannot mark victim notifications read');
select public.mark_notification_read((value#>>'{items,0,id}')::bigint) from r where name='inbox';
insert into r values('read',public.get_notifications());
select public.mark_notification_read((value#>>'{items,0,id}')::bigint) from r where name='inbox';
select is(public.get_notification_summary()->>'unread_count','0','Owner can mark read while in Hospital');
select is(public.get_notifications()#>>'{items,0,read_at}',(select value#>>'{items,0,read_at}' from r where name='read'),'Repeated read is idempotent');
reset role;
select ok((select revision>(select value::text::bigint from r where name='revision') from public.player_game_events where character_id=(select d from f)),'Owner revision signals inbox changes');
select private.emit_notification(d,'combat.attacked',(select value#>>'{battle,id}' from r where name='start'),'{"replayed":true}') from f;
select is((select count(*) from private.player_notifications where character_id=(select d from f)),1::bigint,'Duplicate event is deduplicated');
select ok((select payload ? 'attackers' and read_at is not null from private.player_notifications where character_id=(select d from f)),'Replay preserves original payload and read status');
select private.emit_notification(d,'test.future','page-'||i,jsonb_build_object('value',i)) from f cross join generate_series(1,23) i;
set local role authenticated;
insert into r values('page',public.get_notifications());
select is((select jsonb_array_length(value->'items') from r where name='page'),20,'Inbox returns a bounded page');
select ok((select value->>'next_before' is not null from r where name='page'),'Older page cursor is provided');
insert into r select 'older',public.get_notifications((value->>'next_before')::bigint) from r where name='page';
select is((select jsonb_array_length(value->'items') from r where name='older'),4,'Older page includes remaining rows');
select ok(not exists(select 1 from r a,r b,jsonb_array_elements(a.value->'items') x,jsonb_array_elements(b.value->'items') y where a.name='page' and b.name='older' and x->>'id'=y->>'id'),'Cursor pages do not repeat rows');
reset role;
select private.emit_notification(d,'test.future','arrived-later','{}') from f;
set local role authenticated;
select public.mark_all_notifications_read((value->>'latest_id')::bigint) from r where name='page';
select is(public.get_notification_summary()->>'unread_count','1','Mark all read leaves newly arriving notifications unread');
reset role;
-- A failed gameplay transaction cannot leave an inbox entry behind.
do $$ begin
  begin
    perform private.emit_notification((select d from f),'test.future','rolled-back','{}');
    raise exception 'rollback';
  exception when raise_exception then null; end;
end $$;
select is((select count(*) from private.player_notifications where event_key='rolled-back'),0::bigint,'Notifications roll back with their source event');
-- A defender victory is a distinct notification outcome.
update public.characters set hospital_started_at=null,hospital_until=null,protected_until=null,
  ship_health=100,crew_health=100,ship_accuracy=100000,ship_speed=100000 where id=(select d from f);
update public.characters set ship_health=1,ship_recovery_at=clock_timestamp()+interval '1 day',ship_accuracy=1 where id=(select a from f);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a9970000-0000-4000-8000-000000000001","role":"authenticated"}',true);
insert into r select 'lost-start',public.start_combat(d,gen_random_uuid()) from f;
insert into r select 'lost-end',public.submit_combat_order((value#>>'{battle,id}')::uuid,0,'fire',gen_random_uuid()) from r where name='lost-start';
select is((select value#>>'{battle,outcome}' from r where name='lost-end'),'defended','Defender wins when the attacker is defeated');
select set_config('request.jwt.claims','{"sub":"a9970000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select is(public.get_notifications()#>>'{items,0,payload,outcome}','defended','Attacker loss is stored on the notification');
select is(public.get_notifications()#>>'{items,0,payload,hospitalized}','false','A surviving defender is not described as hospitalized');
reset role;
delete from auth.users where id='a9970000-0000-4000-8000-000000000003';
select is((select count(*) from private.player_notifications where character_id=(select d from f)),0::bigint,'Deleting an account removes its inbox');
select * from finish();
rollback;
