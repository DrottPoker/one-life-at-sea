begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();

select ok(not exists(select 1 from public.characters c join public.character_profiles p on p.character_id=c.id
  where p.player_number<>c.player_number),'Existing profiles have the same public number as their character');
select ok(not exists(select 1 from public.characters where player_number<100001),'Player numbers start at or above 100001, including an empty database');

insert into auth.users(id,email,is_anonymous,raw_user_meta_data) values
('aa100000-0000-4000-8000-000000000001','number-one@example.test',false,'{"character_name":"NumberTestOne","player_number":1}'),
('aa100000-0000-4000-8000-000000000002','number-two@example.test',false,'{"character_name":"NumberTest%_literal"}'),
('aa100000-0000-4000-8000-000000000003','number-anonymous@example.test',true,'{}');
create temp table number_ids as select id,user_id,player_number from public.characters
where user_id in ('aa100000-0000-4000-8000-000000000001','aa100000-0000-4000-8000-000000000002');
grant select on number_ids to authenticated;
select is((select count(distinct player_number)::int from number_ids),2,'Registration allocates distinct numbers and ignores supplied metadata');
select ok((select min(player_number)>=100001 from number_ids),'Registration cannot select a number through metadata');
select throws_ok($$update public.characters set player_number=player_number+1000000 where user_id='aa100000-0000-4000-8000-000000000001'$$,
  '428C9',null,'Even server-side edits cannot explicitly assign a new number');
select throws_ok($$update public.characters set player_number=default where user_id='aa100000-0000-4000-8000-000000000001'$$,
  '23514','PLAYER_NUMBER_IMMUTABLE','Regenerating an identity is also blocked');
-- Simulate a name created before the naming policy.
alter table public.characters disable trigger characters_validate_name;
update public.characters set display_name=(select player_number::text from number_ids where user_id='aa100000-0000-4000-8000-000000000001')
where user_id='aa100000-0000-4000-8000-000000000002';
alter table public.characters enable trigger characters_validate_name;
select ok(not exists(select 1 from number_ids n join public.characters c on c.id=n.id where c.player_number<>n.player_number),
  'Name changes preserve public numbers');

set local role anon;
select throws_ok($$select public.search_players('Number')$$,'42501',null,'Logged-out callers cannot search players');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"aa100000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is((public.search_players((select player_number::text from number_ids where user_id='aa100000-0000-4000-8000-000000000001'))->>'total')::int,
  2,'Plain numbers find the exact ID and matching numeric names');
select is((public.search_players('#'||(select player_number::text from number_ids where user_id='aa100000-0000-4000-8000-000000000001'))->>'total')::int,
  1,'Hash-prefixed numbers search exclusively by ID');
select is((public.search_players('nUmBeRtEsToNe')->>'total')::int,1,'Name searches are case insensitive');
select is((public.search_players('#9007199254740992')->>'total')::int,0,'Numbers beyond the supported range do not overflow');
select is((public.search_players('#9999999999999999999999999999999999999999')->>'total')::int,0,'Very large numeric input is harmless');
select is((public.search_players('#missing')->>'total')::int,0,'Invalid ID input has no matches');
select is((public.search_players('NumberTestOne',2147483647)->>'page')::int,0,'Pagination clamps to the last matching page without overflow');
select throws_ok($$select public.search_players(repeat('x',101))$$,'22023','INVALID_FILTER','Search length is bounded');
select throws_ok($$select public.search_players('',-1)$$,'22023','INVALID_FILTER','Negative pages are rejected');
select is((select count(*)::int from public.characters where user_id='aa100000-0000-4000-8000-000000000002'),0,
  'Knowing a public number does not reveal another player private character');
select throws_ok($$update public.characters set player_number=100001$$,'428C9',null,'Players cannot assign their own public number');
select throws_ok($$select nextval('public.characters_player_number_seq')$$,'42501',null,'Players cannot advance the identity sequence');
select is((select count(*)::int from jsonb_object_keys(public.search_players('NumberTestOne')->'players'->0)),3,
  'Search returns only character identity, public number and display name');
select set_config('request.jwt.claims','{"sub":"aa100000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select is((public.search_players('')->>'total')::int,0,'Anonymous Auth users cannot enumerate players');

reset role;
update public.characters set display_name='NumberTest%_literal' where user_id='aa100000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"aa100000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is((public.search_players('%_')->>'total')::int,1,'Search treats percent and underscore as literal name characters');
reset role;
delete from auth.users where id='aa100000-0000-4000-8000-000000000002';
insert into auth.users(id,email,is_anonymous,raw_user_meta_data) values
('aa100000-0000-4000-8000-000000000004','number-new@example.test',false,'{"character_name":"NumberTestReplacement"}');
select ok((select player_number from public.characters where user_id='aa100000-0000-4000-8000-000000000004')>
  (select max(player_number) from number_ids),'Deleted player numbers are not reused');

select * from finish();
rollback;
