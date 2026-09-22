begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
insert into auth.users(id,email,is_anonymous,raw_user_meta_data) values
('afff0000-0000-4000-8000-000000000001','mail-one@example.test',false,'{"character_name":"MailOne"}'),
('afff0000-0000-4000-8000-000000000002','mail-two@example.test',false,'{"character_name":"MailTwo"}'),
('afff0000-0000-4000-8000-000000000003','mail-three@example.test',false,'{"character_name":"MailThree"}'),
('afff0000-0000-4000-8000-000000000004','mail-four@example.test',false,'{"character_name":"MailFour"}'),
('afff0000-0000-4000-8000-000000000005','mail-anon@example.test',true,'{}');
create temporary table mail_fixture as select id,player_number,display_name from public.characters where user_id::text like 'afff0000-%';
create temporary table mail_results(key text primary key,value jsonb);
grant select on mail_fixture to authenticated;
grant all on mail_results to authenticated;
select ok((select bool_and(relrowsecurity) from pg_class where oid in('private.mail_messages'::regclass,'private.mail_boxes'::regclass,'private.mail_ignored'::regclass)),'All mail tables use RLS');
select ok(not has_table_privilege('authenticated','private.mail_messages','SELECT'),'Mail contents are private');
select ok(not has_table_privilege('authenticated','private.mail_boxes','UPDATE'),'Players cannot edit others mailbox state');
select ok(not has_table_privilege('authenticated','private.mail_ignored','SELECT'),'Ignore lists are private');
select ok(not has_sequence_privilege('authenticated','private.mail_messages_id_seq','USAGE'),'Mail sequence is private');
select ok(not has_function_privilege('authenticated','private.import_legacy_mail()','EXECUTE'),'Import is not client callable');
select ok(not has_function_privilege('authenticated','public.send_player_message(bigint,text,uuid)','EXECUTE'),'Legacy writes are disabled');
select ok(not has_function_privilege('authenticated','public.get_message_conversation(bigint,bigint)','EXECUTE'),'Legacy reads are disabled');
set local role anon;
select throws_ok($$select public.get_mailbox()$$,'42501',null,'Logged out users cannot read mail');
select throws_ok($$select public.send_mail(array[100001]::bigint[],'Hi','Body',gen_random_uuid())$$,'42501',null,'Logged out users cannot send');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"afff0000-0000-4000-8000-000000000005","role":"authenticated"}',true);
select throws_ok($$select public.get_message_summary()$$,'42501','NOT_AUTHORIZED','Anonymous accounts cannot read summaries');
select throws_ok($$select public.send_mail(array[100001]::bigint[],'Hi','Body',gen_random_uuid())$$,'42501','NOT_AUTHORIZED','Anonymous accounts cannot send');
select set_config('request.jwt.claims','{"sub":"afff0000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is(public.get_mailbox()->'items','[]'::jsonb,'New inbox is empty');
select is(public.get_mail_summary()->>'outbox','0','New outbox is empty');
insert into mail_results values('mass',public.send_mail(array[(select player_number from mail_fixture where display_name='MailTwo'),(select player_number from mail_fixture where display_name='MailThree'),(select player_number from mail_fixture where display_name='MailTwo')],'Voyage',E'  Hello\r\nCaptain!  ','afff0000-0000-4000-8000-000000000011'));
select is((select value->>'recipient_count' from mail_results where key='mass'),'2','Repeated recipients receive only one copy');
select is(public.send_mail(array[(select player_number from mail_fixture where display_name='MailThree'),(select player_number from mail_fixture where display_name='MailTwo')],'Voyage',E'Hello\nCaptain!','afff0000-0000-4000-8000-000000000011'),(select value from mail_results where key='mass'),'A reordered replay returns the original receipt');
select is(public.get_mail_summary()->>'outbox','1','A mass mail is one outbox entry');
select is(public.get_message_summary()->>'unread_count','0','Sent mail is never unread');
select is(jsonb_array_length(public.get_mail((((select value from mail_results where key='mass')->>'mail_id')::bigint))->'recipients'),2,'Sender sees the selected recipients');
select throws_ok($$select public.send_mail(array[(select player_number from mail_fixture where display_name='MailTwo')],'Voyage','Changed','afff0000-0000-4000-8000-000000000011')$$,'22023','REQUEST_MISMATCH','Replay cannot change recipients or text');
select throws_ok($$select public.send_mail(array[(select player_number from mail_fixture where display_name='MailTwo'),(select player_number from mail_fixture where display_name='MailThree')],'Changed',E'Hello\nCaptain!','afff0000-0000-4000-8000-000000000011')$$,'22023','REQUEST_MISMATCH','Replay cannot change subject');
select throws_ok($$select public.send_mail(array[(select player_number from mail_fixture where display_name='MailOne')],'Hi','Body',gen_random_uuid())$$,'22023','SELF_MESSAGE','Self mail is rejected');
select throws_ok($$select public.send_mail(array[(select player_number from mail_fixture where display_name='MailTwo'),-1],'Hi','Body',gen_random_uuid())$$,'P0002','RECIPIENT_UNAVAILABLE','Any missing recipient rejects the whole send');
select throws_ok($$select public.send_mail(array[(select player_number from mail_fixture where display_name='MailTwo')],'Hi','  ',gen_random_uuid())$$,'22023','INVALID_MAIL','Blank bodies are rejected');
select throws_ok($$select public.send_mail(array[(select player_number from mail_fixture where display_name='MailTwo')],'Hi',repeat('x',10001),gen_random_uuid())$$,'22023','INVALID_MAIL','Oversized bodies are rejected');
select throws_ok($$select public.send_mail(array[(select player_number from mail_fixture where display_name='MailTwo')],repeat('x',201),'Body',gen_random_uuid())$$,'22023','INVALID_MAIL','Oversized subjects are rejected');
select throws_ok($$select public.send_mail(array[(select player_number from mail_fixture where display_name='MailTwo')],E'Hi\nthere','Body',gen_random_uuid())$$,'22023','INVALID_MAIL','Subject control characters are rejected');
select throws_ok($$select public.send_mail(array[(select player_number from mail_fixture where display_name='MailTwo')],'Hi',chr(1),gen_random_uuid())$$,'22023','INVALID_MAIL','Body control characters are rejected');
select throws_ok($$select public.send_mail(array_fill((select player_number from mail_fixture where display_name='MailTwo'),array[11]),'Hi','Body',gen_random_uuid())$$,'22023','TOO_MANY_RECIPIENTS','The recipient limit is enforced before deduplication');
select throws_ok($$select public.send_mail(array[]::bigint[],'Hi','Body',gen_random_uuid())$$,'22023','INVALID_MAIL','Empty recipient list is rejected');
select throws_ok($$select public.send_mail(array[(select player_number from mail_fixture where display_name='MailTwo'),null],'Hi','Body',gen_random_uuid())$$,'22023','INVALID_MAIL','Null recipients are rejected');
select throws_ok($$select public.send_mail(array[(select player_number from mail_fixture where display_name='MailTwo')],'Hi','Body',null)$$,'22023','INVALID_MAIL','Request ID is required');
select throws_ok($$select public.get_mailbox('other')$$,'22023','INVALID_REQUEST','Unknown folders are rejected');
select throws_ok($$select public.get_mailbox('inbox','',-1)$$,'22023','INVALID_REQUEST','Invalid pages are rejected');
select set_config('request.jwt.claims','{"sub":"afff0000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is(public.get_mail_summary()->>'inbox','1','First recipient has one mail');
select is(public.get_message_summary()->>'unread_count','1','Recipient has one unread mail');
select is(public.get_player_snapshot()->'messages',public.get_message_summary(),'Shared snapshot carries the new unread count');
select is(public.get_mail((((select value from mail_results where key='mass')->>'mail_id')::bigint))->>'body',E'Hello\nCaptain!','Recipient reads exact normalized text');
select is(public.get_mail((((select value from mail_results where key='mass')->>'mail_id')::bigint))->'recipients','[]'::jsonb,'Other recipients are never disclosed');
select is(public.get_message_summary()->>'unread_count','1','Reading or prefetching does not mark mail read');
select is(public.get_mailbox('inbox','MailThree')->>'total','0','Searching cannot reveal another recipient');
select is(public.get_mailbox('inbox','Voyage')->>'total','1','Search finds subjects');
select is(public.get_mailbox('inbox','Captain')->>'total','1','Search finds body text');
select is(public.get_mailbox('inbox','MailOne')->>'total','1','Search finds sender names');
select public.update_mail(array[(((select value from mail_results where key='mass')->>'mail_id')::bigint)],'read');
select is(public.get_message_summary()->>'unread_count','0','Opening visible mail clears only its read state');
select public.update_mail(array[(((select value from mail_results where key='mass')->>'mail_id')::bigint)],'save');
select is(public.get_mail_summary()->>'saved','1','Owner can save mail');
select is(public.get_mailbox('saved')->>'total','1','Saved folder includes saved mail');
insert into mail_results values('reply',public.send_mail(array[(select player_number from mail_fixture where display_name='MailOne')],'Re: Voyage','Private answer','afff0000-0000-4000-8000-000000000012',(((select value from mail_results where key='mass')->>'mail_id')::bigint)));
select is(jsonb_array_length(public.get_mail((((select value from mail_results where key='reply')->>'mail_id')::bigint),true)->'history'),1,'Reply history contains the original mail');
select throws_ok($$select public.send_mail(array[(select player_number from mail_fixture where display_name='MailOne'),(select player_number from mail_fixture where display_name='MailThree')],'Re: Voyage','Wrong',gen_random_uuid(),(((select value from mail_results where key='mass')->>'mail_id')::bigint))$$,'22023','INVALID_REPLY','Reply cannot add other recipients');
select set_config('request.jwt.claims','{"sub":"afff0000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select is(public.get_message_summary()->>'unread_count','1','One recipient reading does not affect another');
select is(public.get_mail_summary()->>'saved','0','Saved state is private to its owner');
select throws_ok($$select public.get_mail((((select value from mail_results where key='reply')->>'mail_id')::bigint),true)$$,'P0002','MAIL_NOT_FOUND','A co-recipient cannot read someone elses reply');
select is(public.get_mail((((select value from mail_results where key='mass')->>'mail_id')::bigint),true)->'history','[]'::jsonb,'History does not include sibling replies');
select public.set_mail_ignored((select player_number from mail_fixture where display_name='MailOne'),true);
select is(jsonb_array_length(public.get_mail_ignored()),1,'Ignore list stores its selected player');
select set_config('request.jwt.claims','{"sub":"afff0000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select throws_ok($$select public.send_mail(array[(select player_number from mail_fixture where display_name='MailTwo'),(select player_number from mail_fixture where display_name='MailThree')],'Blocked','No delivery',gen_random_uuid())$$,'P0002','RECIPIENT_UNAVAILABLE','Ignore blocks an entire bulk send atomically');
select is(public.get_mail_summary()->>'outbox','1','A blocked mass mail creates no sender copy');
select is(public.send_mail(array[(select player_number from mail_fixture where display_name='MailTwo'),(select player_number from mail_fixture where display_name='MailThree')],'Voyage',E'Hello\nCaptain!','afff0000-0000-4000-8000-000000000011'),(select value from mail_results where key='mass'),'Existing receipts remain confirmable after ignore');
select is(public.get_mail((((select value from mail_results where key='reply')->>'mail_id')::bigint),true)#>>'{history,0,subject}','Voyage','Sender can view history of received reply');
select set_config('request.jwt.claims','{"sub":"afff0000-0000-4000-8000-000000000004","role":"authenticated"}',true);
select is(public.get_mailbox()->>'total','0','Unrelated player sees no mail');
select throws_ok($$select public.get_mail((((select value from mail_results where key='mass')->>'mail_id')::bigint),true)$$,'P0002','MAIL_NOT_FOUND','Guessing IDs cannot reveal private mail or history');
select public.update_mail(array[(((select value from mail_results where key='mass')->>'mail_id')::bigint)],'delete');
select public.update_mail(array[(((select value from mail_results where key='mass')->>'mail_id')::bigint)],'read');
select set_config('request.jwt.claims','{"sub":"afff0000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is(public.get_mail((((select value from mail_results where key='mass')->>'mail_id')::bigint))->>'subject','Voyage','Unrelated player cannot delete another copy');
select public.update_mail(array[(((select value from mail_results where key='mass')->>'mail_id')::bigint)],'delete');
select is(public.get_mail_summary()->>'inbox','0','Deletion removes the owners inbox copy');
select is(public.get_mail_summary()->>'saved','0','Deleted saved mail leaves Saved');
select throws_ok($$select public.get_mail((((select value from mail_results where key='mass')->>'mail_id')::bigint))$$,'P0002','MAIL_NOT_FOUND','Deleted copies cannot be read directly');
select is(public.get_mail((((select value from mail_results where key='reply')->>'mail_id')::bigint),true)->'history','[]'::jsonb,'Deleted parent is excluded from history');
select set_config('request.jwt.claims','{"sub":"afff0000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select is(public.get_mail((((select value from mail_results where key='mass')->>'mail_id')::bigint))->>'subject','Voyage','Recipient deletion leaves other copies intact');
select public.set_mail_ignored((select player_number from mail_fixture where display_name='MailOne'),false);
select is(jsonb_array_length(public.get_mail_ignored()),0,'Ignore removal restores receiving');
reset role;
select ok((select last_action_at is not null from private.character_actions where character_id=(select id from mail_fixture where display_name='MailOne')),'Sending records Last action');
select ok((select revision>0 from public.player_game_events where character_id=(select id from mail_fixture where display_name='MailTwo')),'Delivery signals owner live refresh');
-- Legacy migration preserves receipts and read state without resurrecting deleted copies.
select set_config('request.jwt.claims','{"sub":"afff0000-0000-4000-8000-000000000001","role":"authenticated"}',true);
insert into mail_results values('legacy',private.send_player_message((select player_number from mail_fixture where display_name='MailTwo'),'Legacy body','afff0000-0000-4000-8000-000000000013'));
update private.player_messages set read_at=created_at where request_id='afff0000-0000-4000-8000-000000000013';
select private.import_legacy_mail();
select is((select b.read_at from private.mail_boxes b join private.mail_messages m on m.id=b.mail_id where m.request_id='afff0000-0000-4000-8000-000000000013' and b.direction='inbox'),
  (select created_at from private.player_messages where request_id='afff0000-0000-4000-8000-000000000013'),'Imported read time is preserved exactly');
select is((select sent_at from private.mail_messages where request_id='afff0000-0000-4000-8000-000000000013'),
  (select created_at from private.player_messages where request_id='afff0000-0000-4000-8000-000000000013'),'Imported send time is preserved exactly');
insert into mail_results values('imported',jsonb_build_object('mail_id',(select id::text from private.mail_messages where legacy_message_id=((select value->>'message_id' from mail_results where key='legacy')::bigint))));
set local role authenticated;
select is(public.send_mail(array[(select player_number from mail_fixture where display_name='MailTwo')],'','Legacy body','afff0000-0000-4000-8000-000000000013')->>'mail_id',(select value from mail_results where key='imported')->>'mail_id','An old pending request confirms the imported mail');
select set_config('request.jwt.claims','{"sub":"afff0000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is(public.get_mail((((select value from mail_results where key='imported')->>'mail_id')::bigint))->>'body','Legacy body','Legacy body is preserved');
select is(public.get_mail((((select value from mail_results where key='imported')->>'mail_id')::bigint))->>'subject','','Legacy messages have no invented subject');
select public.update_mail(array[(((select value from mail_results where key='imported')->>'mail_id')::bigint)],'read');
select public.update_mail(array[(((select value from mail_results where key='imported')->>'mail_id')::bigint)],'delete');
reset role;
select private.import_legacy_mail();
set local role authenticated;
select throws_ok($$select public.get_mail((((select value from mail_results where key='imported')->>'mail_id')::bigint))$$,'P0002','MAIL_NOT_FOUND','Repeated import never resurrects deleted mail');
reset role;
-- Seed older mail to exercise bounded pages without relying on the live send quota.
with mails as (
 insert into private.mail_messages(sender_id,sender_name,sender_player_number,recipients,recipient_numbers,request_id,subject,body,sent_at)
 select (select id from mail_fixture where display_name='MailOne'),'MailOne',(select player_number from mail_fixture where display_name='MailOne'),'[]',array[(select player_number from mail_fixture where display_name='MailFour')],gen_random_uuid(),'Paged '||n,'Archive',clock_timestamp()-interval '1 hour' from generate_series(1,21) n returning id
) insert into private.mail_boxes(mail_id,character_id,direction) select id,(select id from mail_fixture where display_name='MailFour'),'inbox' from mails;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"afff0000-0000-4000-8000-000000000004","role":"authenticated"}',true);
select is(jsonb_array_length(public.get_mailbox()->'items'),20,'Pages are bounded to 20 rows');
select is(jsonb_array_length(public.get_mailbox('inbox','',1)->'items'),1,'Second page returns remaining mail');
select is(public.get_mailbox('inbox','',999)->>'page','1','Out of range pages clamp to the last page');
select is(public.get_message_summary()->>'unread_count','21','Unread count includes all inbox pages');
select public.update_mail(array[(public.get_mailbox()#>>'{items,0,id}')::bigint],'read');
select is(public.get_message_summary()->>'unread_count','20','Read acknowledgment never consumes unseen mail');
reset role;
-- Two deliveries in a bulk send count twice towards the sender limit.
update private.mail_messages set sent_at=clock_timestamp()-interval '1 hour' where sender_id=(select id from mail_fixture where display_name='MailOne');
with mails as (
 insert into private.mail_messages(sender_id,sender_name,sender_player_number,recipients,recipient_numbers,request_id,subject,body)
 select (select id from mail_fixture where display_name='MailOne'),'MailOne',(select player_number from mail_fixture where display_name='MailOne'),'[]',array[(select player_number from mail_fixture where display_name='MailTwo')],gen_random_uuid(),'Quota','Rate test' from generate_series(1,29) n returning id
) select count(*) from mails;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"afff0000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select throws_ok($$select public.send_mail(array[(select player_number from mail_fixture where display_name='MailTwo'),(select player_number from mail_fixture where display_name='MailThree')],'Rate','Too many deliveries',gen_random_uuid())$$,'P0001','MESSAGE_RATE_LIMIT','Bulk quota counts every delivery');
select lives_ok($$select public.send_mail(array[(select player_number from mail_fixture where display_name='MailTwo')],'Rate','Last delivery',gen_random_uuid())$$,'A single remaining delivery is permitted');
select throws_ok($$select public.send_mail(array[(select player_number from mail_fixture where display_name='MailTwo')],'Rate','Over limit',gen_random_uuid())$$,'P0001','MESSAGE_RATE_LIMIT','Quota is enforced transactionally');
select is(public.send_mail(array[(select player_number from mail_fixture where display_name='MailTwo'),(select player_number from mail_fixture where display_name='MailThree')],'Voyage',E'Hello\nCaptain!','afff0000-0000-4000-8000-000000000011')->>'mail_id',(select value from mail_results where key='mass')->>'mail_id','Retry remains available at quota');
reset role;
savepoint mail_rollback;
update private.mail_messages set sent_at=clock_timestamp()-interval '1 hour' where sender_id=(select id from mail_fixture where display_name='MailOne');
set local role authenticated;
select public.send_mail(array[(select player_number from mail_fixture where display_name='MailTwo')],'Rollback','Rolled back body',gen_random_uuid());
reset role;
rollback to savepoint mail_rollback;
select is((select count(*) from private.mail_messages where sender_id=(select id from mail_fixture where display_name='MailOne') and subject='Rollback'),0::bigint,'Mail rolls back with its transaction');
delete from auth.users where id='afff0000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"afff0000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select is(public.get_mail(((select value->>'mail_id' from mail_results where key='mass')::bigint))->>'subject','Voyage','Deleting a sender preserves recipient copies');
select is(public.get_mail(((select value->>'mail_id' from mail_results where key='mass')::bigint))->>'can_reply','false','Deleted senders cannot receive a reply');
reset role;
select * from finish();
rollback;
