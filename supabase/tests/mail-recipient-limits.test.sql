begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
insert into auth.users(id,email,is_anonymous,raw_user_meta_data)
select ('affa0000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'mail-limit-'||n||'@example.test',false,
 jsonb_build_object('character_name','MailLimit'||chr(65+n)) from generate_series(0,20) n;
create temporary table mail_limit_fixture as select id,player_number,display_name from public.characters where user_id::text like 'affa0000-%';
create temporary table mail_limit_receipts(key text primary key,value jsonb);
grant select on mail_limit_fixture to authenticated;
grant all on mail_limit_receipts to authenticated;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"affa0000-0000-4000-8000-000000000000","role":"authenticated"}',true);
insert into mail_limit_receipts values('ten',public.send_mail(array(select player_number from mail_limit_fixture where display_name<>'MailLimitA' order by player_number limit 10),'Ten recipients','Allowed',gen_random_uuid()));
select is((select value->>'recipient_count' from mail_limit_receipts where key='ten'),'10','An ordinary player can send to exactly ten recipients');
select throws_ok($$select public.send_mail(array(select player_number from mail_limit_fixture where display_name<>'MailLimitA' order by player_number limit 11),'Eleven recipients','Denied',gen_random_uuid())$$,'22023','TOO_MANY_RECIPIENTS','Eleven distinct recipients are rejected');
select is(public.get_mail_summary()->>'outbox','1','Rejected sends do not create an outbox entry');
select throws_ok($$select private.send_mail(array(select player_number from mail_limit_fixture where display_name<>'MailLimitA' order by player_number limit 11),'Private helper','Denied',gen_random_uuid())$$,'22023','TOO_MANY_RECIPIENTS','The private helper enforces the same ordinary-mail limit');
reset role;
select is((select count(*) from private.mail_boxes where direction='inbox' and mail_id=(select (value->>'mail_id')::bigint from mail_limit_receipts where key='ten')),10::bigint,'Exactly ten recipient copies were delivered');
-- Simulate a committed request from the previous twenty-recipient policy.
with old_mail as (
 insert into private.mail_messages(sender_id,sender_name,sender_player_number,recipients,recipient_numbers,request_id,subject,body)
 select sender.id,sender.display_name,sender.player_number,
   (select jsonb_agg(jsonb_build_object('display_name',display_name,'player_number',player_number) order by player_number) from mail_limit_fixture where display_name<>'MailLimitA'),
   array(select player_number from mail_limit_fixture where display_name<>'MailLimitA' order by player_number),
   'affa0000-0000-4000-8000-000000000099','Earlier bulk mail','Previously sent'
 from mail_limit_fixture sender where sender.display_name='MailLimitA' returning id,sender_id,sent_at
) insert into private.mail_boxes(mail_id,character_id,direction,read_at) select id,sender_id,'outbox',sent_at from old_mail;
insert into private.mail_boxes(mail_id,character_id,direction)
 select m.id,f.id,'inbox' from private.mail_messages m cross join mail_limit_fixture f
 where m.request_id='affa0000-0000-4000-8000-000000000099' and f.display_name<>'MailLimitA';
set local role authenticated;
insert into mail_limit_receipts values('old',public.send_mail(array(select player_number from mail_limit_fixture where display_name<>'MailLimitA' order by player_number),'Earlier bulk mail','Previously sent','affa0000-0000-4000-8000-000000000099'));
select is((select value->>'recipient_count' from mail_limit_receipts where key='old'),'20','An existing twenty-recipient request can still be confirmed');
select is(public.get_mail_summary()->>'outbox','2','Confirming an older request does not create another envelope');
select throws_ok($$select public.send_mail(array(select player_number from mail_limit_fixture where display_name<>'MailLimitA' order by player_number),'Earlier bulk mail','Previously sent',gen_random_uuid())$$,'22023','TOO_MANY_RECIPIENTS','A new request cannot reuse the old recipient allowance');
select throws_ok($$select public.send_mail(array(select player_number from mail_limit_fixture where display_name<>'MailLimitA' order by player_number),'Earlier bulk mail','Changed','affa0000-0000-4000-8000-000000000099')$$,'22023','REQUEST_MISMATCH','An older receipt cannot authorize changed content');
reset role;
select is((select count(*) from private.mail_boxes where mail_id=(select (value->>'mail_id')::bigint from mail_limit_receipts where key='old')),21::bigint,'Confirming an older receipt preserves exactly its original copies');
select * from finish();
rollback;
