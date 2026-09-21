begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select is((select count(*)::int from public.harbor_players), (select count(*)::int from public.characters where location='the_harbor' or travel_kind='return'), 'Harbor projection includes scheduled arrivals');
select columns_are('public','harbor_players',array['character_id','display_name','arrives_at'],'The realtime table contains public identity and scheduled arrival');
select ok(exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='harbor_players'),'Harbor roster is published to Realtime');
select ok(not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='characters'),'Private character rows are not published');

insert into auth.users(id,email,is_anonymous,raw_user_meta_data) values
('c3000000-0000-4000-8000-000000000001','roster-one@example.test',false,'{"character_name":"RosterCaptainOne"}'),
('c3000000-0000-4000-8000-000000000002','roster-two@example.test',false,'{"character_name":"RosterCaptainTwo"}'),
('c3000000-0000-4000-8000-000000000003','roster-anonymous@example.test',true,'{}');
select is((select count(*)::int from public.harbor_players where display_name like 'RosterCaptain%'),2,'Signup adds captains to the harbor');

set local role anon;
select throws_ok('select * from public.harbor_players','42501',null,'Anonymous clients cannot list captains');
select throws_ok('select public.list_harbor_players(0)','42501',null,'Anonymous clients cannot call the directory RPC');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c3000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is((select count(*)::int from public.harbor_players where display_name like 'RosterCaptain%'),2,'Registered players see other docked captains');
select is((public.list_harbor_players(0)->>'total')::int,(select count(*)::int from public.harbor_players),'The count covers the whole roster');
select ok(jsonb_array_length(public.list_harbor_players(0)->'players')<=20,'Pages contain at most twenty players');
select is((public.list_harbor_players(-1)->>'page')::int,0,'Negative pages clamp to the first page');
select is((public.list_harbor_players(2147483647)->>'page')::int,greatest(0,((select count(*)::int from public.harbor_players)-1)/20),'A deleted or oversized last page clamps to a valid page');
select throws_ok($$insert into public.harbor_players(character_id,display_name) values(gen_random_uuid(),'Fake Captain')$$,'42501',null,'Players cannot forge roster entries');
select throws_ok($$update public.harbor_players set display_name='Fake Captain'$$,'42501',null,'Players cannot change roster names');
select throws_ok('delete from public.harbor_players','42501',null,'Players cannot remove roster entries');
select is(has_function_privilege('authenticated','private.sync_harbor_player()','execute'),false,'The projection trigger cannot be called directly');
select is((select count(*)::int from public.characters where user_id='c3000000-0000-4000-8000-000000000002'),0,'Other character stats remain private');

reset role;
update public.characters set display_name='RosterRenamedCaptain'
where user_id='c3000000-0000-4000-8000-000000000002';
select is((select h.display_name from public.harbor_players h join public.characters c on c.id=h.character_id where c.user_id='c3000000-0000-4000-8000-000000000002'),'RosterRenamedCaptain','Server name changes update the roster');
create temp table before_training as select h.ctid as roster_version,h.character_id from public.harbor_players h join public.characters c on c.id=h.character_id where c.user_id='c3000000-0000-4000-8000-000000000001';
update public.characters set crew_attack=crew_attack+1 where user_id='c3000000-0000-4000-8000-000000000001';
select ok(exists(select 1 from public.harbor_players h join before_training b on h.character_id=b.character_id where h.ctid=b.roster_version),'Training does not emit unnecessary roster updates');

select set_config('request.jwt.claims','{"sub":"c3000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select public.depart_harbor(sea_version,gen_random_uuid()) from public.characters where user_id='c3000000-0000-4000-8000-000000000002';
select private.settle_sea_travel(id,travel_arrives_at) from public.characters where user_id='c3000000-0000-4000-8000-000000000002';
select is((select count(*)::int from public.harbor_players where display_name='RosterRenamedCaptain'),0,'Leaving the harbor removes the captain');
select public.return_to_harbor(sea_version,gen_random_uuid()) from public.characters where user_id='c3000000-0000-4000-8000-000000000002';
select private.settle_sea_travel(id,travel_arrives_at) from public.characters where user_id='c3000000-0000-4000-8000-000000000002';
select is((select count(*)::int from public.harbor_players where display_name='RosterRenamedCaptain'),1,'Returning adds the same captain exactly once');
delete from auth.users where id='c3000000-0000-4000-8000-000000000002';
select is((select count(*)::int from public.harbor_players where display_name='RosterRenamedCaptain'),0,'Account deletion removes the captain through the foreign key');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c3000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select is((select count(*)::int from public.harbor_players),0,'Anonymous Auth accounts cannot see the roster');
select is((public.list_harbor_players(0)->>'total')::int,0,'Anonymous Auth accounts receive no directory data');
select set_config('request.jwt.claims','{"sub":"c3000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is((select count(*)::int from public.harbor_players),0,'Deleted accounts cannot read with an old token');
select * from finish();
rollback;
