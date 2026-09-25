begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
insert into auth.users(id,email,is_anonymous,raw_user_meta_data) values
('f1f00000-0000-4000-8000-000000000001','community-one@example.test',false,'{"character_name":"CommunityOne"}'),
('f1f00000-0000-4000-8000-000000000002','community-two@example.test',false,'{"character_name":"CommunityTwo"}'),
('f1f00000-0000-4000-8000-000000000003','community-three@example.test',false,'{"character_name":"CommunityThree"}'),
('f1f00000-0000-4000-8000-000000000004','community-new@example.test',false,'{"character_name":"CommunityNew"}');
-- Only CommunityNew is younger than the dislike threshold.
update public.characters set created_at=clock_timestamp()-interval '3 days' where user_id in('f1f00000-0000-4000-8000-000000000001','f1f00000-0000-4000-8000-000000000002','f1f00000-0000-4000-8000-000000000003');
create temporary table community_fixture as select id,user_id,player_number,display_name from public.characters where user_id::text like 'f1f00000-%';
create temporary table community_results(key text primary key,value jsonb);
grant select on community_fixture to authenticated;
grant all on community_results to authenticated;
-- Cooldowns are covered by forums.test.sql; these checks post back to back.
create function pg_temp.cool() returns void language sql security definer set search_path='' as $$ update private.forum_author_stats set last_post_at=null; $$;
grant execute on function pg_temp.cool() to authenticated;
create function pg_temp.notifications(target text,event_kind text) returns bigint language sql security definer set search_path='' as $$
  select count(*) from private.player_notifications n join pg_temp.community_fixture f on f.id=n.character_id where f.display_name=target and n.kind=event_kind; $$;
grant execute on function pg_temp.notifications(text,text) to authenticated;
select ok((select bool_and(relrowsecurity) from pg_class where oid in('private.forum_reactions'::regclass,'private.forum_subscriptions'::regclass)),'Reactions and subscriptions use RLS');
select ok(not has_table_privilege('authenticated','private.forum_reactions','SELECT'),'Who reacted is private');
select ok(not has_table_privilege('authenticated','private.forum_subscriptions','SELECT'),'Subscriptions are private');
select ok(not has_function_privilege('authenticated','private.forum_notify(private.forum_threads,private.forum_posts,public.characters,uuid[],uuid,timestamptz)','EXECUTE'),'Players cannot send forum notifications');
set local role authenticated;

-- Reactions.
select set_config('request.jwt.claims','{"sub":"f1f00000-0000-4000-8000-000000000001","role":"authenticated"}',true);
insert into community_results values('thread',public.create_forum_thread('general_discussion','Fair winds and following seas','The harbor is busy today.',gen_random_uuid()));
select pg_temp.cool();
select is((public.get_forum_thread((select (value->>'thread_id')::bigint from community_results where key='thread'))#>>'{thread,subscribed}')::boolean,true,'Starting a thread subscribes its author');
select is((public.get_forum_thread((select (value->>'thread_id')::bigint from community_results where key='thread'))#>>'{posts,0,can_react}')::boolean,false,'Authors cannot react to their own posts');
select throws_ok($$select public.set_forum_reaction((select (value->>'post_id')::bigint from community_results where key='thread'),1)$$,'22023','SELF_REACTION','The database refuses self reactions');
select set_config('request.jwt.claims','{"sub":"f1f00000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is(public.set_forum_reaction((select (value->>'post_id')::bigint from community_results where key='thread'),1)->>'likes','1','Captains like posts');
select is(public.set_forum_reaction((select (value->>'post_id')::bigint from community_results where key='thread'),1)->>'likes','1','Liking again changes nothing');
select is((public.get_forum_thread((select (value->>'thread_id')::bigint from community_results where key='thread'))#>>'{posts,0,my_reaction}')::integer,1,'The reader sees their own like');
select is(public.set_forum_reaction((select (value->>'post_id')::bigint from community_results where key='thread'),-1)->>'dislikes','1','A like can become a dislike');
select is((public.get_forum_board('general_discussion')#>>'{items,0,rating}')::integer,-1,'The thread rating is the opening post rating');
select is(public.set_forum_reaction((select (value->>'post_id')::bigint from community_results where key='thread'),0)->>'dislikes','0','Reactions can be withdrawn');
select throws_ok($$select public.set_forum_reaction((select (value->>'post_id')::bigint from community_results where key='thread'),2)$$,'22023','INVALID_REQUEST','Only like, dislike or none');
select set_config('request.jwt.claims','{"sub":"f1f00000-0000-4000-8000-000000000004","role":"authenticated"}',true);
select is((public.get_forum_thread((select (value->>'thread_id')::bigint from community_results where key='thread'))#>>'{posts,0,can_dislike}')::boolean,false,'New captains are offered no dislike');
select throws_ok($$select public.set_forum_reaction((select (value->>'post_id')::bigint from community_results where key='thread'),-1)$$,'P0001','NEW_CHARACTER','New captains cannot dislike');
select is(public.set_forum_reaction((select (value->>'post_id')::bigint from community_results where key='thread'),1)->>'likes','1','New captains can like');
select set_config('request.jwt.claims','{"sub":"f1f00000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select is(public.set_forum_reaction((select (value->>'post_id')::bigint from community_results where key='thread'),1)->>'likes','2','Likes from several captains add up');
select is((public.get_forum_thread((select (value->>'thread_id')::bigint from community_results where key='thread'))#>>'{posts,0,my_reaction}')::integer,1,'Each reader sees only their own reaction');

-- Subscriptions and reply notifications.
select set_config('request.jwt.claims','{"sub":"f1f00000-0000-4000-8000-000000000002","role":"authenticated"}',true);
insert into community_results values('reply1',public.create_forum_post((select (value->>'thread_id')::bigint from community_results where key='thread'),'Aye, fair winds.',null,gen_random_uuid()));
select pg_temp.cool();
select is(pg_temp.notifications('CommunityOne','forum.reply'),1::bigint,'A reply notifies the subscribed author');
select is((public.get_forum_thread((select (value->>'thread_id')::bigint from community_results where key='thread'))#>>'{thread,subscribed}')::boolean,true,'Replying subscribes the replier');
select public.create_forum_post((select (value->>'thread_id')::bigint from community_results where key='thread'),'And calm waters.',null,gen_random_uuid());
select pg_temp.cool();
select is(pg_temp.notifications('CommunityOne','forum.reply'),1::bigint,'Further replies wait until the thread is read');
select set_config('request.jwt.claims','{"sub":"f1f00000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is(public.get_notifications()#>>'{items,0,payload,title}','Fair winds and following seas','The notice names the thread');
select is(public.get_notifications()#>>'{items,0,payload,author,name}','CommunityTwo','The notice names the replier');
select is(public.get_notifications()#>>'{items,0,payload,post_id}',(select value->>'post_id' from community_results where key='reply1'),'The notice points at the first unread reply');
select is((public.get_forum_subscriptions()#>>'{items,0,new_posts}')::integer,2,'Subscriptions count unread posts');
select public.mark_forum_thread_read((select (value->>'thread_id')::bigint from community_results where key='thread'),3);
select is((public.get_forum_subscriptions()#>>'{items,0,new_posts}')::integer,0,'Reading clears the unread count');
select set_config('request.jwt.claims','{"sub":"f1f00000-0000-4000-8000-000000000002","role":"authenticated"}',true);
insert into community_results values('reply3',public.create_forum_post((select (value->>'thread_id')::bigint from community_results where key='thread'),'Fresh news from the docks.',null,'f1f00000-0000-4000-8000-0000000000d1'));
select pg_temp.cool();
select is(pg_temp.notifications('CommunityOne','forum.reply'),2::bigint,'After reading, the next reply notifies again');
select is(public.create_forum_post((select (value->>'thread_id')::bigint from community_results where key='thread'),'Fresh news from the docks.',null,'f1f00000-0000-4000-8000-0000000000d1'),
  (select value from community_results where key='reply3'),'A replayed reply returns its receipt');
select is(pg_temp.notifications('CommunityOne','forum.reply'),2::bigint,'A replayed reply sends no second notice');
select set_config('request.jwt.claims','{"sub":"f1f00000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.mark_forum_board_read('general_discussion');
select set_forum_subscription((select (value->>'thread_id')::bigint from community_results where key='thread'),false);
select is((public.get_forum_thread((select (value->>'thread_id')::bigint from community_results where key='thread'))#>>'{thread,subscribed}')::boolean,false,'Captains unsubscribe');
select is(public.get_forum_subscriptions()->>'total','0','Unsubscribed threads leave the list');
select public.create_forum_post((select (value->>'thread_id')::bigint from community_results where key='thread'),'Still here.',null,gen_random_uuid());
select pg_temp.cool();
select is((public.get_forum_thread((select (value->>'thread_id')::bigint from community_results where key='thread'))#>>'{thread,subscribed}')::boolean,false,'Replying does not undo an unsubscribe');
select set_config('request.jwt.claims','{"sub":"f1f00000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select public.create_forum_post((select (value->>'thread_id')::bigint from community_results where key='thread'),'Anyone listening?',null,gen_random_uuid());
select pg_temp.cool();
select is(pg_temp.notifications('CommunityOne','forum.reply'),2::bigint,'Unsubscribed captains get no reply notices');

-- Quotes notify the quoted author, unless they ignore the quoting captain.
select set_config('request.jwt.claims','{"sub":"f1f00000-0000-4000-8000-000000000003","role":"authenticated"}',true);
insert into community_results values('quote',public.create_forum_post((select (value->>'thread_id')::bigint from community_results where key='thread'),'Busy indeed.',
  (select (value->>'post_id')::bigint from community_results where key='thread'),gen_random_uuid()));
select pg_temp.cool();
select is(pg_temp.notifications('CommunityOne','forum.quote'),1::bigint,'Quoting notifies the quoted author');
select set_config('request.jwt.claims','{"sub":"f1f00000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.set_mail_ignored((select player_number from community_fixture where display_name='CommunityThree'),true);
select set_config('request.jwt.claims','{"sub":"f1f00000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select public.create_forum_post((select (value->>'thread_id')::bigint from community_results where key='thread'),'Quoting again.',
  (select (value->>'post_id')::bigint from community_results where key='thread'),gen_random_uuid());
select pg_temp.cool();
select is(pg_temp.notifications('CommunityOne','forum.quote'),1::bigint,'Ignored captains send no quote notices');
select is(pg_temp.notifications('CommunityThree','forum.quote'),0::bigint,'Quoting yourself or others never notifies the quoter');

-- Reactions follow the thread state.
select set_config('request.jwt.claims','{"sub":"f1f00000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.withdraw_forum_post((select (value->>'post_id')::bigint from community_results where key='thread'));
select set_config('request.jwt.claims','{"sub":"f1f00000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_ok($$select public.set_forum_reaction((select (value->>'post_id')::bigint from community_results where key='thread'),1)$$,'P0001','POST_REMOVED','Deleted posts take no reactions');
select is(public.get_forum_thread((select (value->>'thread_id')::bigint from community_results where key='thread'))#>'{posts,0,likes}','null'::jsonb,'Players see no reactions on deleted posts');
select is(public.get_forum_board('general_discussion')#>'{items,0,rating}','null'::jsonb,'A deleted opening post has no rating');
reset role;
update private.forum_threads set locked_at=clock_timestamp() where id=(select (value->>'thread_id')::bigint from community_results where key='thread');
set local role authenticated;
select throws_ok($$select public.set_forum_reaction((select (value->>'post_id')::bigint from community_results where key='quote'),1)$$,'42501','THREAD_LOCKED','Locked threads take no reactions');
select is((public.get_forum_thread((select (value->>'thread_id')::bigint from community_results where key='thread'))#>>'{posts,1,can_react}')::boolean,false,'Locked threads offer no reactions');

-- Search.
select set_config('request.jwt.claims','{"sub":"f1f00000-0000-4000-8000-000000000003","role":"authenticated"}',true);
insert into community_results values('guide',public.create_forum_thread('tutorials_guides','Navigation basics','Use the compass and read the charts carefully.',gen_random_uuid()));
select pg_temp.cool();
select is(public.search_forums('compass')->>'total','1','Search finds words in posts');
select is(public.search_forums('navigation')#>>'{items,0,thread,title}','Navigation basics','Search finds thread titles');
select is(public.search_forums('"read the charts"')->>'total','1','Search matches phrases');
select is(public.search_forums('compass -charts')->>'total','0','Search excludes words');
select is(public.search_forums('',(select display_name from community_fixture where display_name='CommunityThree'))->>'total','3','Search filters by author name');
select is(public.search_forums('','#'||(select player_number from community_fixture where display_name='CommunityThree'),null,true)->>'total','1','Author threads are the opening posts');
select is(public.search_forums('compass',null,'general_discussion')->>'total','0','Search filters by board');
select is(public.search_forums('harbor')->>'total','0','Deleted posts are never found');
select is(public.search_forums('','#'||(select player_number from community_fixture where display_name='CommunityOne'),null,true)->>'total','0','A deleted opening post is not listed under its author');
select is(public.search_forums('','Nobody')->>'total','0','An unknown author finds nothing');
select throws_ok($$select public.search_forums('  ')$$,'22023','INVALID_REQUEST','Search needs words or an author');
select throws_ok($$select public.search_forums(repeat('x',201))$$,'22023','INVALID_REQUEST','Search text is bounded');
select is(public.get_forum_author_stats((select player_number from community_fixture where display_name='CommunityThree'))->>'post_count','3','Profiles count visible forum posts');
select is(public.get_forum_author_stats((select player_number from community_fixture where display_name='CommunityThree'))->>'thread_count','1','Profiles count visible threads');
select throws_ok($$select public.get_forum_author_stats(1)$$,'P0002','FORUM_NOT_FOUND','Unknown captains have no forum profile');

-- Deleting a reacting captain keeps the totals right.
reset role;
delete from auth.users where id='f1f00000-0000-4000-8000-000000000004';
select is((select count(*) from private.forum_posts p where p.likes<>(select count(*) from private.forum_reactions r where r.post_id=p.id and r.value=1)
  or p.dislikes<>(select count(*) from private.forum_reactions r where r.post_id=p.id and r.value=-1)),0::bigint,'Reaction totals match the stored reactions');
select is((select likes from private.forum_posts where id=(select (value->>'post_id')::bigint from community_results where key='thread')),1,'Deleted captains no longer count');
select is((select count(*) from private.forum_subscriptions s where s.notified_number is not null and exists(select 1 from private.forum_thread_reads r
  where r.character_id=s.character_id and r.thread_id=s.thread_id and r.last_read_number>=s.notified_number)),0::bigint,'Read threads never keep a waiting notice');
select * from finish();
rollback;
