begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
select is((select count(*) from private.skill_definitions),7::bigint,'Seven skills are configured');
select is((select count(*) from private.skill_levels),100::bigint,'One hundred levels are configured');
select is((select xp from private.skill_levels where level=2),200::bigint,'Rebalanced level two threshold');
select is((select xp from private.skill_levels where level=92),2704683::bigint,'Rebalanced level ninety-two threshold');
select is((select xp from private.skill_levels where level=100),5000000::bigint,'Level one hundred requires five million total XP');
select ok(not exists(select 1 from private.skill_levels where private.skill_level(xp)<>level),'Every threshold grants its exact level');
select ok(not exists(select 1 from private.skill_levels where level>1 and private.skill_level(xp-1)<>level-1),'One XP below each threshold remains at the previous level');
select is(private.skill_level(9007199254740991),100,'Levels stop at one hundred while XP can continue');
select ok(not exists(select 1 from public.characters c cross join private.skill_definitions d
  left join private.character_skills s on s.character_id=c.id and s.skill_id=d.id where s.character_id is null),'Existing characters have every skill');
select ok(not exists(select 1 from public.character_profiles p where character_level<>private.character_level(character_id)),'Public totals match private progression');
select ok(not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='character_skills'),'Private skill XP is not published through realtime');
select ok((select relrowsecurity from pg_class where oid='private.character_skills'::regclass),'Skill XP has row-level security');
insert into auth.users(id,email,is_anonymous,raw_user_meta_data) values
('a9900000-0000-4000-8000-000000000001','skills-one@example.test',false,'{"character_name":"SkillsCaptain"}'),
('a9900000-0000-4000-8000-000000000002','skills-two@example.test',false,'{"character_name":"SkillsObserver"}'),
('a9900000-0000-4000-8000-000000000003','skills-anon@example.test',true,'{}');
create temporary table skill_fixture as select
(select id from public.characters where user_id='a9900000-0000-4000-8000-000000000001') a,
(select id from public.characters where user_id='a9900000-0000-4000-8000-000000000002') b;
grant select on skill_fixture to authenticated;
select is((select count(*) from private.character_skills where character_id=(select a from skill_fixture) and xp=0),7::bigint,'New characters start with zero XP in seven skills');
select is((select character_level from public.character_profiles where character_id=(select a from skill_fixture)),7,'New Character Level is seven');
select set_config('request.jwt.claims','{"sub":"a9900000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
select is(jsonb_array_length(public.get_own_skills()->'skills'),7,'Owner can read seven skills');
select is((public.get_own_skills()->>'character_level')::integer,7,'Owner receives the total level');
select throws_ok('select * from private.character_skills','42501',null,'Clients cannot read the underlying XP table');
select throws_ok($$update private.character_skills set xp=5000000$$,'42501',null,'Clients cannot grant themselves XP');
select throws_ok($$select private.award_skill_xp(a,'fishing',200) from skill_fixture$$,'42501',null,'XP award helper is not client callable');
reset role;
select is((select (private.award_skill_xp(a,'fishing',200)->>'level')::integer from skill_fixture),2,'Server awards XP and levels at the threshold');
select is((select (private.award_skill_xp(a,'crafting',2495)->>'level')::integer from skill_fixture),10,'One award can grant several levels');
select is((select character_level from public.character_profiles where character_id=(select a from skill_fixture)),17,'Public Character Level sums all skills');
select is((select count(*) from private.character_skills where character_id=(select a from skill_fixture) and xp=0),5::bigint,'Other skills are unchanged');
create temporary table skill_profile_version as select ctid version from public.character_profiles where character_id=(select a from skill_fixture);
select private.award_skill_xp(a,'fishing',1) from skill_fixture;
select is((select ctid::text from public.character_profiles where character_id=(select a from skill_fixture)),(select version::text from skill_profile_version),'XP below the next level does not publish a profile change');
select set_config('request.jwt.claims','{"sub":"a9900000-0000-4000-8000-000000000002","role":"authenticated"}',true);
set local role authenticated;
select is((public.get_own_skills()->>'character_level')::integer,7,'Another player receives only their own progression');
select is((select (public.get_character_status(a)->>'character_level')::integer from skill_fixture),17,'Other players can see the public total');
select ok(not (select public.get_character_status(a) ?| array['skills','xp','fishing'] from skill_fixture),'Public status contains no private skill data');
select throws_ok($$select public.get_own_skills(a) from skill_fixture$$,'42883',null,'No target parameter exists for reading other skills');
select throws_ok($$update public.character_profiles set character_level=700$$,'42501',null,'Public total cannot be forged');
reset role;
select throws_ok($$select private.award_skill_xp(a,'fishing',-1) from skill_fixture$$,'22023','INVALID_SKILL_XP','Negative awards are rejected');
select throws_ok($$select private.award_skill_xp(a,'fishing',0.5) from skill_fixture$$,'22023','INVALID_SKILL_XP','Fractional awards are rejected');
select throws_ok($$select private.award_skill_xp(a,'fishing','NaN') from skill_fixture$$,'22023','INVALID_SKILL_XP','Non-finite awards are rejected');
select throws_ok($$select private.award_skill_xp(a,'invalid_skill',1) from skill_fixture$$,'22023','INVALID_SKILL','Unknown skills are rejected');
select throws_ok($$select private.award_skill_xp('ffffffff-ffff-ffff-ffff-ffffffffffff','fishing',1)$$,'P0001','CHARACTER_NOT_FOUND','Missing characters are rejected');
savepoint rollback_award;
select private.award_skill_xp(a,'logging',500) from skill_fixture;
rollback to savepoint rollback_award;
select is((select xp from private.character_skills where character_id=(select a from skill_fixture) and skill_id='logging'),0::bigint,'Rolling back an activity also rolls back its XP');
select is((select character_level from public.character_profiles where character_id=(select a from skill_fixture)),17,'Rolled-back levels do not change the public total');
select private.award_skill_xp(a,'crafting',9007199254740991) from skill_fixture;
select is((select xp from private.character_skills where character_id=(select a from skill_fixture) and skill_id='crafting'),9007199254740991::bigint,'XP saturates safely without integer overflow');
select is((select (private.award_skill_xp(a,'crafting',1)->>'xp_awarded')::integer from skill_fixture),0,'An award beyond the storage limit reports zero actual XP');
select is((select character_level from public.character_profiles where character_id=(select a from skill_fixture)),107,'Level cap is reflected in the public sum');
select set_config('request.jwt.claims','{"sub":"a9900000-0000-4000-8000-000000000003","role":"authenticated"}',true);
set local role authenticated;
select throws_ok('select public.get_own_skills()','42501','UNAUTHORIZED','Anonymous Auth users cannot read skill progression');
reset role;
set local role anon;
select throws_ok('select public.get_own_skills()','42501',null,'Logged-out clients cannot read skill progression');
reset role;
insert into private.admin_members(user_id) values('a9900000-0000-4000-8000-000000000002');
select set_config('request.jwt.claims','{"sub":"a9900000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select public.admin_mutate('update',jsonb_build_object('resource','character_skills','key',jsonb_build_object('character_id',s.character_id::text,'skill_id',s.skill_id),
  'version',md5(to_jsonb(s)::text),'changes',jsonb_build_object('xp','200')),gen_random_uuid(),'Verify skill XP correction')
  from private.character_skills s where character_id=(select a from skill_fixture) and skill_id='logging';
select is((select character_level from public.character_profiles where character_id=(select a from skill_fixture)),108,'Audited administrator XP correction updates the public sum');
update private.character_skills set xp=5000000 where character_id=(select a from skill_fixture);
select is((select character_level from public.character_profiles where character_id=(select a from skill_fixture)),700,'Seven maximum skills give Character Level 700');
delete from auth.users where id='a9900000-0000-4000-8000-000000000001';
select is((select count(*) from private.character_skills where character_id=(select a from skill_fixture)),0::bigint,'Account deletion removes private progression');
select * from finish();
rollback;
