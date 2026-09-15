begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, email, email_confirmed_at, is_anonymous, raw_user_meta_data) values
('a1000000-0000-4000-8000-000000000001', 'db-captain-one@example.test', now(), false, '{"character_name":"Test Captain"}'),
('a1000000-0000-4000-8000-000000000002', 'db-captain-two@example.test', now(), false, '{"character_name":"  Åsa  O''Neill  "}'),
('a1000000-0000-4000-8000-000000000003', 'db-anonymous@example.test', null, true, '{"email_verified":true}');

select is((select display_name from public.characters where user_id = 'a1000000-0000-4000-8000-000000000001'), 'Test Captain', 'Signup creates the character in the same transaction');
select is((select display_name from public.characters where user_id = 'a1000000-0000-4000-8000-000000000002'), 'Åsa O''Neill', 'Signup normalizes names and supports Swedish letters');
select throws_ok($$insert into auth.users(id, email, raw_user_meta_data) values ('a1000000-0000-4000-8000-000000000004', 'db-conflict@example.test', '{"character_name":"TEST CAPTAIN"}')$$, '23505', null, 'Signup rejects a taken name regardless of case');
select is((select count(*)::int from auth.users where id = 'a1000000-0000-4000-8000-000000000004'), 0, 'Rejected character creation leaves no account');
select throws_ok($$insert into auth.users(id, email, raw_user_meta_data) values ('a1000000-0000-4000-8000-000000000004', 'db-invalid@example.test', '{"character_name":"Captain123"}')$$, '23514', null, 'Direct Auth API signup must obey name rules');
select throws_ok($$insert into auth.users(id, email, raw_user_meta_data) values ('a1000000-0000-4000-8000-000000000004', 'db-missing@example.test', '{}')$$, '23514', null, 'Signup cannot omit the character name');
select is((select count(*)::int from auth.users where id = 'a1000000-0000-4000-8000-000000000004'), 0, 'Invalid or missing names leave no account');

set local role anon;
select throws_ok('select * from public.characters', '42501', null, 'Anonymous clients cannot read characters');
select throws_ok($$insert into public.characters(display_name) values ('Anonymous Pirate')$$, '42501', null, 'Anonymous clients cannot create characters');
select is(public.is_character_name_available('TEST CAPTAIN'), false, 'Availability detects names without exposing a character row');
select is(public.is_character_name_available('Available Captain'), true, 'Availability accepts an unused valid name');
select is(public.is_character_name_available('Captain123'), false, 'Availability rejects invalid names');

set local role authenticated;
select is(has_function_privilege('anon', 'private.create_signup_character()', 'execute'), false, 'Anonymous clients cannot call the signup trigger');
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is(private.is_registered_player(), false, 'User metadata cannot turn an anonymous account into a registered account');
select throws_ok($$insert into public.characters(display_name) values ('Unverified Pirate')$$, '42501', null, 'Anonymous accounts cannot create characters');

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is((select count(*)::int from public.characters), 1, 'The owner can read exactly one character');
select is((select user_id::text from public.characters), 'a1000000-0000-4000-8000-000000000001', 'The signup trigger assigns the new account as owner');
select is((select location from public.characters), 'the_harbor', 'The database assigns the harbor');
select throws_ok($$insert into public.characters(display_name) values ('Second Captain')$$, '23505', null, 'An account cannot create a second character');
select throws_ok($$insert into public.characters(display_name,user_id) values ('Stolen Captain','a1000000-0000-4000-8000-000000000002')$$, '42501', null, 'Clients cannot choose the owner');
select throws_ok($$insert into public.characters(display_name,location) values ('Lost Captain','open_sea')$$, '42501', null, 'Clients cannot choose the location');
select throws_ok($$insert into public.characters(display_name,id) values ('Chosen Identity','a1000000-0000-4000-8000-000000000002')$$, '42501', null, 'Clients cannot choose character identifiers');
select throws_ok($$update public.characters set display_name='Changed Name'$$, '42501', null, 'Character mutation is unavailable');
select throws_ok('delete from public.characters', '42501', null, 'Clients cannot delete characters');
select is(has_function_privilege('authenticated', 'private.create_signup_character()', 'execute'), false, 'Players cannot call the signup trigger directly');

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is((select count(*)::int from public.characters where user_id = 'a1000000-0000-4000-8000-000000000001'), 0, 'A different account cannot read the first character');
select is((select count(*)::int from public.characters), 1, 'The second account sees only their own row');
select throws_ok($$insert into public.characters(display_name) values ('Al')$$, '23514', null, 'Short names are rejected');
select throws_ok($$insert into public.characters(display_name) values ('Test  Captain')$$, '23514', null, 'Unnormalized direct inserts are rejected');

select * from finish();
rollback;
