begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select is((select count(*)::int from public.character_profiles), (select count(*)::int from public.characters), 'Existing characters have profiles');
select columns_are('public', 'character_profiles', array['character_id','display_name','location','created_at','arrives_at','arrival_location','max_sea_distance','arrival_max_sea_distance','player_number','character_level','portrait_id'], 'Profiles expose identity, portrait, travel timing and distance records');
select ok((select relrowsecurity from pg_class where oid='public.character_profiles'::regclass), 'Profile row-level security is enabled');
select ok(exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='character_profiles'), 'Coarse profile changes are published for travel updates');

insert into auth.users(id,email,is_anonymous,raw_user_meta_data) values
('d4000000-0000-4000-8000-000000000001','profile-one@example.test',false,'{"character_name":"ProfileTestOne"}'),
('d4000000-0000-4000-8000-000000000002','profile-two@example.test',false,'{"character_name":"ProfileTestTwo"}'),
('d4000000-0000-4000-8000-000000000003','profile-anonymous@example.test',true,'{}');
create temp table profile_test_ids as select id, user_id from public.characters where user_id in
('d4000000-0000-4000-8000-000000000001','d4000000-0000-4000-8000-000000000002');
grant select on profile_test_ids to authenticated;
select is((select count(*)::int from public.character_profiles where display_name like 'ProfileTest%'), 2, 'Signup creates one profile per character');
select ok(exists(select 1 from public.character_profiles p join public.characters c on c.id=p.character_id where c.user_id='d4000000-0000-4000-8000-000000000002' and p.created_at=c.created_at and p.location=c.location), 'Profile dates and locations come from the character');

set local role anon;
select throws_ok('select * from public.character_profiles','42501',null,'Logged-out clients cannot read profiles');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d4000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is((select count(*)::int from public.character_profiles where display_name like 'ProfileTest%'), 2, 'Registered players can read both their own and other profiles');
select is((select display_name from public.character_profiles where character_id=(select id from profile_test_ids where user_id='d4000000-0000-4000-8000-000000000002')), 'ProfileTestTwo', 'A profile is addressable by its character ID');
select is((select count(*)::int from public.character_profiles where character_id='ffffffff-ffff-ffff-ffff-ffffffffffff'), 0, 'Unknown character IDs have no profile');
select is((select count(*)::int from public.characters where user_id='d4000000-0000-4000-8000-000000000002'), 0, 'The other character private state remains inaccessible');
select throws_ok($$insert into public.character_profiles values(gen_random_uuid(),'Forged Captain','the_harbor',now())$$, '42501', null, 'Players cannot forge profiles');
select throws_ok($$update public.character_profiles set display_name='Forged Captain'$$, '42501', null, 'Players cannot change profiles');
select throws_ok('delete from public.character_profiles','42501',null,'Players cannot remove profiles');
select is(has_function_privilege('authenticated','private.sync_character_profile()','execute'), false, 'Players cannot execute the synchronization trigger');

reset role;
update public.characters set display_name='ProfileRenamedCaptain' where user_id='d4000000-0000-4000-8000-000000000002';
select is((select p.display_name from public.character_profiles p join profile_test_ids i on i.id=p.character_id where i.user_id='d4000000-0000-4000-8000-000000000002'), 'ProfileRenamedCaptain', 'Server name changes update profiles');
create temp table profile_before_training as select p.ctid as version, p.character_id from public.character_profiles p join profile_test_ids i on i.id=p.character_id;
update public.characters set crew_attack=crew_attack+1, energy=95, ship_health=90 where user_id='d4000000-0000-4000-8000-000000000001';
select is((select count(*)::int from public.character_profiles p join profile_before_training b on p.character_id=b.character_id where p.ctid=b.version), 2, 'Private stat and resource changes do not rewrite profiles');
update public.characters set created_at=created_at-interval '2 days' where user_id='d4000000-0000-4000-8000-000000000002';
select ok(exists(select 1 from public.character_profiles p join public.characters c on c.id=p.character_id where c.user_id='d4000000-0000-4000-8000-000000000002' and p.created_at=c.created_at), 'Server corrections preserve the real creation date');

select set_config('request.jwt.claims','{"sub":"d4000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select public.depart_harbor(sea_version,gen_random_uuid()) from public.characters where user_id='d4000000-0000-4000-8000-000000000002';
select private.settle_sea_travel(id,travel_arrives_at) from public.characters where user_id='d4000000-0000-4000-8000-000000000002';
select is((select p.location from public.character_profiles p join profile_test_ids i on i.id=p.character_id where i.user_id='d4000000-0000-4000-8000-000000000002'), 'open_sea', 'Profiles remain available outside the harbor');
select is((select count(*)::int from public.harbor_players where display_name='ProfileRenamedCaptain'), 0, 'The harbor directory retains its location-specific scope');
delete from auth.users where id='d4000000-0000-4000-8000-000000000002';
select is((select count(*)::int from public.character_profiles where display_name='ProfileRenamedCaptain'), 0, 'Deleting a character removes its profile');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d4000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select is((select count(*)::int from public.character_profiles), 0, 'Anonymous Auth users cannot read profiles');
select set_config('request.jwt.claims','{"sub":"d4000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is((select count(*)::int from public.character_profiles), 0, 'Deleted accounts cannot read profiles with an old token');
select set_config('request.jwt.claims','{}',true);
select is((select count(*)::int from public.character_profiles), 0, 'Missing identity cannot read profiles');

select * from finish();
rollback;
