begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();

create temp table invalid_names(name text);
insert into invalid_names values
('Captain1'),('Alva Storm'),(' Alva'),('Alva '),(E'Alva\tStorm'),(E'Alva\nStorm'),
(U&'Alva\00a0Storm'),(U&'Alva\202fStorm'),(U&'Alva\0085Storm'),(U&'Alva\feffStorm'),
('Captain١'),('Captain１'),('Captain²'),('CaptainⅣ'),(''),(null);
grant select on invalid_names to anon;
select is(private.is_valid_character_name(name),false,'Invalid name rejected by database validator: '||coalesce(name,'null')) from invalid_names;
select throws_ok(format(
  'insert into auth.users(id,email,is_anonymous,raw_user_meta_data) values (%L,%L,false,%L::jsonb)',
  'ab200000-0000-4000-8000-000000000001','invalid-name@example.test',jsonb_build_object('character_name',name)),
  '23514',null,'Direct Auth signup rejects invalid name: '||coalesce(name,'null')) from invalid_names;
select is((select count(*)::int from auth.users where id='ab200000-0000-4000-8000-000000000001'),0,
  'Rejected names leave no orphan Auth account');

set local role anon;
select is(public.is_character_name_available(name),false,'Availability rejects invalid names') from invalid_names;
reset role;

insert into auth.users(id,email,is_anonymous,raw_user_meta_data) values
('ab200000-0000-4000-8000-000000000002','unicode-name@example.test',false,jsonb_build_object('character_name',U&'A\030asaO''Neill_🦜')),
('ab200000-0000-4000-8000-000000000003','legacy-name@example.test',false,'{"character_name":"LegacyCaptain"}'),
('ab200000-0000-4000-8000-000000000004','unfinished-name@example.test',false,'{"character_name":"UnfinishedCaptain"}');
select is((select display_name from public.characters where user_id='ab200000-0000-4000-8000-000000000002'),
  'ÅsaO''Neill_🦜','Signup preserves symbols and normalizes Unicode letters');
create temp table legacy_identity as select id,player_number from public.characters where user_id='ab200000-0000-4000-8000-000000000003';
alter table public.characters disable trigger characters_validate_name;
update public.characters set display_name='Legacy Captain7' where user_id='ab200000-0000-4000-8000-000000000003';
alter table public.characters enable trigger characters_validate_name;
select lives_ok($$update public.characters set gold_coins=gold_coins+1,display_name=display_name
  where user_id='ab200000-0000-4000-8000-000000000003'$$,'Existing names do not prevent unrelated updates');
select throws_ok($$update public.characters set display_name='Another Captain2'
  where user_id='ab200000-0000-4000-8000-000000000003'$$,'23514','INVALID_CHARACTER_NAME','Server-side renames follow the new rule');
update public.characters set display_name='LegacyCaptainRenamed' where user_id='ab200000-0000-4000-8000-000000000003';
select is((select count(*)::int from public.characters c join legacy_identity l on c.id=l.id and c.player_number=l.player_number),
  1,'A valid rename preserves the UUID and public player number');

delete from public.characters where user_id='ab200000-0000-4000-8000-000000000004';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"ab200000-0000-4000-8000-000000000004","role":"authenticated"}',true);
select throws_ok($$insert into public.characters(display_name) values ('Captain9')$$,'23514','INVALID_CHARACTER_NAME',
  'Direct character creation cannot bypass number validation');
select throws_ok($$insert into public.characters(display_name) values ('Captain Storm')$$,'23514','INVALID_CHARACTER_NAME',
  'Direct character creation cannot bypass whitespace validation');
select lives_ok($$insert into public.characters(display_name) values ('ÅsaStorm')$$,
  'An unfinished account can create a character with a valid name');
select ok((select player_number>=100001 from public.characters),'The completed character receives a public number');
reset role;
select * from finish();
rollback;
