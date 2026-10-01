begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select ok((select relrowsecurity from pg_class where oid='private.portrait_definitions'::regclass), 'Portrait definitions have row-level security');
select is(has_table_privilege('authenticated','private.portrait_definitions','select'), false, 'Players cannot read the portrait table directly');
select ok((select count(*) from private.portrait_definitions)>=2, 'The portrait catalog is seeded from configuration');
select is((select count(*)::int from public.characters c left join private.portrait_definitions d on d.id=c.portrait_id where d.id is null), 0, 'Every character has a catalog portrait');
select is((select count(*)::int from public.characters c join public.character_profiles p on p.character_id=c.id where p.portrait_id<>c.portrait_id), 0, 'Profiles mirror every chosen portrait');
select is(has_function_privilege('anon','public.set_portrait(text)','execute'), false, 'Logged-out clients cannot choose portraits');
select is(has_function_privilege('authenticated','public.set_portrait(text)','execute'), true, 'Players can choose portraits');

insert into auth.users(id,email,is_anonymous,raw_user_meta_data) values
('d5000000-0000-4000-8000-000000000001','portrait-one@example.test',false,'{"character_name":"PortraitTestOne"}'),
('d5000000-0000-4000-8000-000000000002','portrait-two@example.test',false,'{"character_name":"PortraitTestTwo"}'),
('d5000000-0000-4000-8000-000000000003','portrait-anonymous@example.test',true,'{}');
create temp table portrait_test as select
  (select id from public.characters where user_id='d5000000-0000-4000-8000-000000000001') own,
  (select id from public.characters where user_id='d5000000-0000-4000-8000-000000000002') other,
  (select column_default from information_schema.columns where table_schema='public' and table_name='characters' and column_name='portrait_id') default_expression,
  (select id from private.portrait_definitions where id<>(select portrait_id from public.characters where user_id='d5000000-0000-4000-8000-000000000001') order by position limit 1) chosen;
grant select on portrait_test to authenticated;
select is((select portrait_id from public.characters where id=(select own from portrait_test)),
  (select d.id from private.portrait_definitions d, portrait_test t where t.default_expression like '''' || d.id || '''%'), 'New characters start with the configured default portrait');
select is((select portrait_id from public.character_profiles where character_id=(select own from portrait_test)),
  (select portrait_id from public.characters where id=(select own from portrait_test)), 'New profiles show the starting portrait');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d5000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select throws_ok($$update public.characters set portrait_id=(select chosen from portrait_test)$$, '42501', null, 'Players cannot write their portrait directly');
select throws_ok($$select public.set_portrait('no_such_portrait')$$, '22023', 'INVALID_PORTRAIT', 'Unknown portraits are rejected');
select throws_ok($$select public.set_portrait(null)$$, '22023', 'INVALID_PORTRAIT', 'A missing portrait is rejected');
select is(public.set_portrait((select chosen from portrait_test))->>'portrait_id', (select chosen from portrait_test), 'A player chooses a catalog portrait');
select is((public.get_game_state()->>'portrait_id'), (select chosen from portrait_test), 'The game state reports the chosen portrait');
reset role;
select ok(exists(select 1 from private.character_actions where character_id=(select own from portrait_test)), 'Choosing a portrait counts as an action');
select is((select portrait_id from public.characters where id=(select own from portrait_test)), (select chosen from portrait_test), 'The choice is stored on the character');
select is((select portrait_id from public.character_profiles where character_id=(select own from portrait_test)), (select chosen from portrait_test), 'The public profile follows the choice');
create temp table portrait_profile_version as select ctid as version from public.character_profiles where character_id=(select own from portrait_test);
create temp table portrait_action as select last_action_at from private.character_actions where character_id=(select own from portrait_test);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d5000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select lives_ok($$select public.set_portrait((select chosen from portrait_test))$$, 'Choosing the current portrait again succeeds');
reset role;
select is((select ctid from public.character_profiles where character_id=(select own from portrait_test)), (select version from portrait_profile_version), 'Choosing the current portrait again rewrites nothing');
select is((select last_action_at from private.character_actions where character_id=(select own from portrait_test)), (select last_action_at from portrait_action), 'Choosing the current portrait again is no action');
select is((select portrait_id from public.characters where id=(select other from portrait_test)),
  (select d.id from private.portrait_definitions d, portrait_test t where t.default_expression like '''' || d.id || '''%'), 'Another captain keeps their own portrait');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d5000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is(public.get_character_status((select own from portrait_test))->>'portrait_id', (select chosen from portrait_test), 'Other players see the chosen portrait in the profile status');
select set_config('request.jwt.claims','{"sub":"d5000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select throws_ok($$select public.set_portrait((select chosen from portrait_test))$$, '42501', 'NOT_AUTHORIZED', 'Anonymous Auth users cannot choose portraits');
reset role;
select throws_ok($$update public.characters set portrait_id='no_such_portrait' where id=(select own from portrait_test)$$, '23503', null, 'The database only stores catalog portraits');

select * from finish();
rollback;
