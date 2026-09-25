begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
insert into auth.users(id,email,is_anonymous,raw_user_meta_data) values
('f2f00000-0000-4000-8000-000000000001','safety-author@example.test',false,'{"character_name":"SafetyAuthor"}'),
('f2f00000-0000-4000-8000-000000000002','safety-fan@example.test',false,'{"character_name":"SafetyFan"}'),
('f2f00000-0000-4000-8000-000000000003','safety-critic@example.test',false,'{"character_name":"SafetyCritic"}'),
('f2f00000-0000-4000-8000-000000000004','safety-new@example.test',false,'{"character_name":"SafetyNew"}'),
('f2f00000-0000-4000-8000-000000000005','safety-mod@example.test',false,'{"character_name":"SafetyMod"}'),
('f2f00000-0000-4000-8000-000000000006','safety-admin@example.test',false,'{"character_name":"SafetyAdmin"}');
insert into private.admin_members(user_id) values('f2f00000-0000-4000-8000-000000000006');
update public.characters set created_at=clock_timestamp()-interval '3 days' where user_id<>'f2f00000-0000-4000-8000-000000000004' and user_id::text like 'f2f00000-%';
create temporary table safety_fixture as select id,user_id,player_number,display_name from public.characters where user_id::text like 'f2f00000-%';
create temporary table safety_results(key text primary key,value jsonb);
grant select on safety_fixture to authenticated;
grant all on safety_results to authenticated;
create function pg_temp.cool() returns void language sql security definer set search_path='' as $$ update private.forum_author_stats set last_post_at=null; $$;
create function pg_temp.karma() returns integer language sql security definer set search_path='' as $$
  select karma from private.forum_author_stats s join pg_temp.safety_fixture f on f.id=s.character_id where f.display_name='SafetyAuthor'; $$;
create function pg_temp.notifications(target text,event_kind text) returns bigint language sql security definer set search_path='' as $$
  select count(*) from private.player_notifications n join pg_temp.safety_fixture f on f.id=n.character_id where f.display_name=target and n.kind=event_kind; $$;
create function pg_temp.as_player(name text) returns void language sql set search_path='' as $$
  select set_config('request.jwt.claims',jsonb_build_object('sub',(select user_id from pg_temp.safety_fixture where display_name=name),'role','authenticated')::text,true); $$;
create function pg_temp.number(name text) returns text language sql set search_path='' as $$ select player_number::text from pg_temp.safety_fixture where display_name=name; $$;
create function pg_temp.post(key text) returns bigint language sql set search_path='' as $$ select (value->>'post_id')::bigint from pg_temp.safety_results where safety_results.key=post.key; $$;
grant execute on function pg_temp.cool(),pg_temp.karma(),pg_temp.notifications(text,text),pg_temp.as_player(text),pg_temp.number(text),pg_temp.post(text) to authenticated;
select ok((select bool_and(relrowsecurity) from pg_class where oid in('private.forum_moderators'::regclass,'private.forum_bans'::regclass,'private.forum_reports'::regclass)),'Moderation tables use RLS');
select ok(not has_table_privilege('authenticated','private.forum_reports','SELECT'),'Reports are private');
select ok(not has_table_privilege('authenticated','private.forum_bans','INSERT'),'Players cannot ban directly');
select ok(not has_table_privilege('authenticated','private.forum_moderators','INSERT'),'Players cannot appoint themselves');
select is((select count(*) from private.admin_resources where name in('forum_reports','forum_bans','forum_moderators')),3::bigint,'Administrators can inspect the new tables');
set local role authenticated;

-- Moderators are appointed by administrators.
select pg_temp.as_player('SafetyMod');
select throws_ok($$select public.moderate_forum('grant_moderator',jsonb_build_object('player_number',pg_temp.number('SafetyMod')),gen_random_uuid(),'Self promotion')$$,
  '42501','MODERATOR_REQUIRED','Players cannot appoint moderators');
select is((public.get_forum_index()->>'can_moderate')::boolean,false,'Players are not moderators');
select pg_temp.as_player('SafetyAdmin');
select is(public.moderate_forum('grant_moderator',jsonb_build_object('player_number',pg_temp.number('SafetyMod')),gen_random_uuid(),'Trusted helper')->>'message',
  'SafetyMod is now a forum moderator.','Administrators appoint moderators');
select throws_ok($$select public.moderate_forum('grant_moderator',jsonb_build_object('player_number',pg_temp.number('SafetyMod')),gen_random_uuid(),'Again')$$,
  'P0001','FORUM_NO_CHANGE','A moderator is appointed once');
select is(pg_temp.notifications('SafetyMod','forum.role'),1::bigint,'The new moderator is told');
select pg_temp.as_player('SafetyMod');
select is((public.get_forum_index()->>'can_moderate')::boolean,true,'Appointed moderators moderate');
select throws_ok($$select public.moderate_forum('grant_moderator',jsonb_build_object('player_number',pg_temp.number('SafetyFan')),gen_random_uuid(),'Friend')$$,
  '42501','ADMIN_REQUIRED','Only administrators appoint moderators');
select throws_ok($$select public.moderate_forum('ban_player',jsonb_build_object('player_number',pg_temp.number('SafetyAdmin'),'hours','1'),gen_random_uuid(),'Not allowed')$$,
  '42501','FORUM_FORBIDDEN','Nobody bans an administrator');
select throws_ok($$select public.moderate_forum('ban_player',jsonb_build_object('player_number',pg_temp.number('SafetyMod'),'hours','1'),gen_random_uuid(),'Myself')$$,
  '42501','FORUM_FORBIDDEN','Moderators cannot ban themselves');
insert into safety_results values('announcement',public.create_forum_thread('announcements','Welcome','Moderators may post announcements.',gen_random_uuid()));
select pg_temp.cool();
select is(public.get_forum_thread((select (value->>'thread_id')::bigint from safety_results where key='announcement'))#>>'{posts,0,author,role}','moderator','Posts show the moderator role');

-- Karma follows Torn's rules and the owner's deletion rule.
select pg_temp.as_player('SafetyAuthor');
insert into safety_results values('k1',public.create_forum_thread('general_discussion','Karma thread','A long enough opening post for karma to count.',gen_random_uuid()));
select pg_temp.cool();
select pg_temp.as_player('SafetyFan');
select public.set_forum_reaction(pg_temp.post('k1'),1);
select is(pg_temp.karma(),1,'A like on a long post earns karma');
select pg_temp.as_player('SafetyCritic');
select public.set_forum_reaction(pg_temp.post('k1'),-1);
select is(pg_temp.karma(),0,'A dislike takes karma away');
select public.set_forum_reaction(pg_temp.post('k1'),1);
select is(pg_temp.karma(),2,'Changing a dislike to a like counts both ways');
select pg_temp.as_player('SafetyNew');
select public.set_forum_reaction(pg_temp.post('k1'),1);
select is(pg_temp.karma(),2,'New captains earn nobody karma');
select pg_temp.as_player('SafetyAuthor');
insert into safety_results values('short',public.create_forum_post((select (value->>'thread_id')::bigint from safety_results where key='k1'),'Thanks!',null,gen_random_uuid()));
select pg_temp.cool();
insert into safety_results values('trade',public.create_forum_thread('trading_post','Selling planks','Fine oak planks for sale, ask for a price here.',gen_random_uuid()));
select pg_temp.cool();
select pg_temp.as_player('SafetyFan');
select public.set_forum_reaction(pg_temp.post('short'),1);
select public.set_forum_reaction(pg_temp.post('trade'),1);
select is(pg_temp.karma(),2,'Short posts and trading posts earn no karma');
select pg_temp.as_player('SafetyAuthor');
select pg_temp.cool();
do $replies$ begin
  for n in 3..7 loop
    perform pg_temp.cool();
    insert into safety_results values('k'||n,public.create_forum_post((select (value->>'thread_id')::bigint from safety_results where key='k1'),'Another long reply number '||n||' with enough words.',null,gen_random_uuid()));
  end loop;
end $replies$;
select pg_temp.as_player('SafetyFan');
select public.set_forum_reaction(pg_temp.post('k'||n),1) from generate_series(3,7) n;
select is(pg_temp.karma(),6,'One captain adds karma to one author at most five times a day');
select pg_temp.as_player('SafetyAuthor');
select public.withdraw_forum_post(pg_temp.post('k3'));
select is(pg_temp.karma(),5,'Deleting a post loses its positive karma');
select pg_temp.cool();
insert into safety_results values('k8',public.create_forum_post((select (value->>'thread_id')::bigint from safety_results where key='k1'),'An unpopular opinion that is long enough.',null,gen_random_uuid()));
select pg_temp.cool();
select pg_temp.as_player('SafetyCritic');
select public.set_forum_reaction(pg_temp.post('k8'),-1);
select is(pg_temp.karma(),4,'Disliked posts cost karma');
select pg_temp.as_player('SafetyAuthor');
select public.withdraw_forum_post(pg_temp.post('k8'));
select is(pg_temp.karma(),4,'Deleting a disliked post keeps its negative karma');
select is((public.get_forum_thread((select (value->>'thread_id')::bigint from safety_results where key='k1'))#>>'{posts,0,author,karma}')::integer,4,'Post headers show karma');
select pg_temp.as_player('SafetyMod');
select public.moderate_forum('remove_post',jsonb_build_object('post_id',pg_temp.post('k4')::text),gen_random_uuid(),'Off topic');
select is(pg_temp.karma(),3,'A removed post loses its positive karma');
select is(pg_temp.notifications('SafetyAuthor','forum.moderation'),1::bigint,'Authors hear about removed posts');
select public.moderate_forum('restore_post',jsonb_build_object('post_id',pg_temp.post('k4')::text),gen_random_uuid(),'Mistake');
select is(pg_temp.karma(),4,'A restored post earns its karma back');
select public.moderate_forum('remove_thread',jsonb_build_object('thread_id',(select value->>'thread_id' from safety_results where key='k1')),gen_random_uuid(),'Spam thread');
select is(pg_temp.karma(),0,'Karma never drops below zero');
select is(pg_temp.notifications('SafetyAuthor','forum.moderation'),2::bigint,'Authors hear about removed threads');
select public.moderate_forum('restore_thread',jsonb_build_object('thread_id',(select value->>'thread_id' from safety_results where key='k1')),gen_random_uuid(),'Mistake');
select is(pg_temp.karma(),4,'Restoring a thread restores its karma');
select is(public.get_forum_author_stats(pg_temp.number('SafetyAuthor')::bigint)->>'karma','4','Profiles show karma');

-- Reports.
select pg_temp.as_player('SafetyFan');
insert into safety_results values('report',public.report_forum_post(pg_temp.post('k5'),'spam','Repeats the same text.'));
select is((select value->>'already' from safety_results where key='report'),'false','Players report posts');
select is(public.report_forum_post(pg_temp.post('k5'),'spam','Again')->>'already','true','A second report on the same post changes nothing');
select is((public.get_forum_thread((select (value->>'thread_id')::bigint from safety_results where key='k1'))#>>'{posts,4,reported}')::boolean,true,'The reporter sees their open report');
select throws_ok($$select public.report_forum_post(pg_temp.post('k5'),'bribery','')$$,'22023','INVALID_REQUEST','Report reasons come from a fixed list');
select throws_ok($$select public.report_forum_post(pg_temp.post('k3'),'spam','')$$,'P0001','POST_REMOVED','Deleted posts cannot be reported');
select pg_temp.as_player('SafetyAuthor');
select throws_ok($$select public.report_forum_post(pg_temp.post('k5'),'spam','')$$,'22023','SELF_REPORT','Authors cannot report themselves');
select pg_temp.as_player('SafetyNew');
select throws_ok($$select public.report_forum_post(pg_temp.post('k5'),'spam','')$$,'P0001','NEW_CHARACTER','New captains cannot report');
select is((public.get_forum_thread((select (value->>'thread_id')::bigint from safety_results where key='k1'))#>>'{posts,4,can_report}')::boolean,false,'New captains are offered no report');
select pg_temp.as_player('SafetyCritic');
select public.report_forum_post(pg_temp.post('k5'),'offensive','Rude.');
select throws_ok($$select public.get_forum_reports()$$,'42501','MODERATOR_REQUIRED','Players cannot read the queue');
select pg_temp.as_player('SafetyMod');
select is(public.get_forum_reports()->>'total','1','Reports on one post form one queue entry');
select is(jsonb_array_length(public.get_forum_reports()#>'{items,0,reports}'),2,'The entry lists every report');
select is((public.get_forum_index()->>'open_reports')::integer,1,'Moderators see the open report count');
select public.moderate_forum('dismiss_reports',jsonb_build_object('post_id',pg_temp.post('k5')::text),gen_random_uuid(),'Not spam');
select is(public.get_forum_reports()->>'total','0','Dismissed reports leave the queue');
select is(public.get_forum_reports('dismissed')->>'total','1','Dismissed reports stay in the history');
select throws_ok($$select public.moderate_forum('dismiss_reports',jsonb_build_object('post_id',pg_temp.post('k5')::text),gen_random_uuid(),'Twice')$$,'P0001','FORUM_NO_CHANGE','Nothing left to dismiss');
select pg_temp.as_player('SafetyFan');
select public.report_forum_post(pg_temp.post('k6'),'rules','Wrong board.');
select pg_temp.as_player('SafetyMod');
select public.moderate_forum('remove_post',jsonb_build_object('post_id',pg_temp.post('k6')::text),gen_random_uuid(),'Upheld report');
select is(public.get_forum_reports('resolved')->>'total','1','Removing a reported post resolves its reports');
select pg_temp.as_player('SafetyAuthor');
select is(public.get_forum_index()->'open_reports','null'::jsonb,'Players see no report count');

-- Bans stop writing, reactions and reports, but not reading or deleting.
select pg_temp.as_player('SafetyMod');
select is(public.moderate_forum('ban_player',jsonb_build_object('player_number',pg_temp.number('SafetyFan'),'hours','24'),gen_random_uuid(),'Harassment')->>'message' like 'SafetyFan is banned from posting until %','t'::boolean,'Moderators ban for a time');
select is(pg_temp.notifications('SafetyFan','forum.ban'),1::bigint,'The banned captain is told');
select pg_temp.as_player('SafetyFan');
select pg_temp.cool();
select throws_ok($$select public.create_forum_post((select (value->>'thread_id')::bigint from safety_results where key='k1'),'Let me speak.',null,gen_random_uuid())$$,'42501','FORUM_BANNED','Banned captains cannot reply');
select throws_ok($$select public.create_forum_thread('off_topic','Hello','Let me speak.',gen_random_uuid())$$,'42501','FORUM_BANNED','Banned captains cannot start threads');
select throws_ok($$select public.set_forum_reaction(pg_temp.post('k7'),-1)$$,'42501','FORUM_BANNED','Banned captains cannot react');
select throws_ok($$select public.report_forum_post(pg_temp.post('k7'),'spam','')$$,'42501','FORUM_BANNED','Banned captains cannot report');
select is(public.get_forum_thread((select (value->>'thread_id')::bigint from safety_results where key='k1'))#>>'{ban,reason}','Harassment','Banned captains see why');
select is((public.get_forum_thread((select (value->>'thread_id')::bigint from safety_results where key='k1'))#>>'{thread,can_reply}')::boolean,false,'Banned captains get no reply form');
select is((public.get_forum_board('general_discussion')#>>'{board,can_post}')::boolean,false,'Banned captains cannot start threads from the board');
select pg_temp.as_player('SafetyMod');
select public.moderate_forum('ban_player',jsonb_build_object('player_number',pg_temp.number('SafetyFan')),gen_random_uuid(),'Permanent now');
reset role;
select is((select count(*) from private.forum_bans b join safety_fixture f on f.id=b.character_id where f.display_name='SafetyFan' and b.lifted_at is null),1::bigint,'A new ban replaces the old one');
select is((select ends_at from private.forum_bans b join safety_fixture f on f.id=b.character_id where f.display_name='SafetyFan' and b.lifted_at is null),null,'Bans without hours are permanent');
set local role authenticated;
select pg_temp.as_player('SafetyMod');
select is(public.moderate_forum('unban_player',jsonb_build_object('player_number',pg_temp.number('SafetyFan')),gen_random_uuid(),'Served')->>'message','SafetyFan can post again.','Moderators lift bans');
select throws_ok($$select public.moderate_forum('unban_player',jsonb_build_object('player_number',pg_temp.number('SafetyFan')),gen_random_uuid(),'Again')$$,'P0001','FORUM_NO_CHANGE','Only an active ban can be lifted');
select is(pg_temp.notifications('SafetyFan','forum.unban'),1::bigint,'The captain hears the ban was lifted');
select public.moderate_forum('ban_player',jsonb_build_object('player_number',pg_temp.number('SafetyCritic'),'hours','1'),gen_random_uuid(),'Short timeout');
reset role;
update private.forum_bans set starts_at=clock_timestamp()-interval '2 hours',ends_at=clock_timestamp()-interval '1 hour' where lifted_at is null;
set local role authenticated;
select pg_temp.as_player('SafetyCritic');
select is(public.get_forum_index()->'ban','null'::jsonb,'Expired bans end on their own');
select lives_ok($$select public.set_forum_reaction(pg_temp.post('k7'),-1)$$,'Captains react again after a ban ends');

-- Ignored captains are collapsed for the reader.
select pg_temp.as_player('SafetyAuthor');
select public.set_mail_ignored(pg_temp.number('SafetyCritic')::bigint,true);
select pg_temp.as_player('SafetyCritic');
select pg_temp.cool();
insert into safety_results values('ignored',public.create_forum_post((select (value->>'thread_id')::bigint from safety_results where key='k1'),'You will not see this.',null,gen_random_uuid()));
select pg_temp.as_player('SafetyAuthor');
select is((select (p->>'ignored')::boolean from jsonb_array_elements(public.get_forum_thread((select (value->>'thread_id')::bigint from safety_results where key='k1'))->'posts') p
  where p->>'id'=(select value->>'post_id' from safety_results where key='ignored')),true,'Posts by ignored captains are marked for collapsing');
select is((select (p->>'ignored')::boolean from jsonb_array_elements(public.get_forum_thread((select (value->>'thread_id')::bigint from safety_results where key='k1'))->'posts') p
  where p->>'number'='1'),false,'Other posts stay open');

-- Revoked moderators lose their tools.
select pg_temp.as_player('SafetyAdmin');
select public.moderate_forum('revoke_moderator',jsonb_build_object('player_number',pg_temp.number('SafetyMod')),gen_random_uuid(),'Stepped down');
select pg_temp.as_player('SafetyMod');
select throws_ok($$select public.moderate_forum('lock_thread',jsonb_build_object('thread_id',(select value->>'thread_id' from safety_results where key='k1')),gen_random_uuid(),'Lock')$$,
  '42501','MODERATOR_REQUIRED','Revoked moderators cannot moderate');
reset role;
select is((select count(*) from private.forum_author_stats s where s.karma<>greatest(0,coalesce((select sum(case when p.removed_at is null and t.removed_at is null then p.karma else least(p.karma,0) end)
  from private.forum_posts p join private.forum_threads t on t.id=p.thread_id where p.author_id=s.character_id),0))),0::bigint,'Stored karma matches the reactions');
select is((select count(*) from private.forum_posts p where p.karma<>coalesce((select sum(r.value) from private.forum_reactions r where r.post_id=p.id and r.counts),0)),0::bigint,'Post karma matches its counted reactions');
select * from finish();
rollback;
