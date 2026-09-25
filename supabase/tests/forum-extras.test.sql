begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
insert into auth.users(id,email,is_anonymous,raw_user_meta_data) values
('f3f00000-0000-4000-8000-000000000001','extras-author@example.test',false,'{"character_name":"ExtrasAuthor"}'),
('f3f00000-0000-4000-8000-000000000002','extras-voter@example.test',false,'{"character_name":"ExtrasVoter"}'),
('f3f00000-0000-4000-8000-000000000003','extras-other@example.test',false,'{"character_name":"ExtrasOther"}'),
('f3f00000-0000-4000-8000-000000000004','extras-new@example.test',false,'{"character_name":"ExtrasNew"}'),
('f3f00000-0000-4000-8000-000000000005','extras-mod@example.test',false,'{"character_name":"ExtrasMod"}'),
('f3f00000-0000-4000-8000-000000000006','extras-admin@example.test',false,'{"character_name":"ExtrasAdmin"}');
insert into private.admin_members(user_id) values('f3f00000-0000-4000-8000-000000000006');
update public.characters set created_at=clock_timestamp()-interval '3 days' where user_id<>'f3f00000-0000-4000-8000-000000000004' and user_id::text like 'f3f00000-%';
insert into private.forum_moderators(character_id) select id from public.characters where user_id='f3f00000-0000-4000-8000-000000000005';
create temporary table extras_fixture as select id,user_id,player_number,display_name from public.characters where user_id::text like 'f3f00000-%';
create temporary table extras_results(key text primary key,value jsonb);
grant select on extras_fixture to authenticated;
grant all on extras_results to authenticated;
-- Cooldowns and the hourly thread limit are covered elsewhere; these checks post back to back.
create function pg_temp.cool() returns void language sql security definer set search_path='' as $$
  update private.forum_author_stats set last_post_at=null;
  update private.forum_threads t set created_at=t.created_at-interval '1 hour' where t.author_id in(select id from pg_temp.extras_fixture); $$;
create function pg_temp.notifications(target text,event_kind text) returns bigint language sql security definer set search_path='' as $$
  select count(*) from private.player_notifications n join pg_temp.extras_fixture f on f.id=n.character_id where f.display_name=target and n.kind=event_kind; $$;
create function pg_temp.as_player(name text) returns void language sql set search_path='' as $$
  select set_config('request.jwt.claims',jsonb_build_object('sub',(select user_id from pg_temp.extras_fixture where display_name=name),'role','authenticated')::text,true); $$;
create function pg_temp.number(name text) returns text language sql set search_path='' as $$ select player_number::text from pg_temp.extras_fixture where display_name=name; $$;
create function pg_temp.result(key text,field text) returns text language sql set search_path='' as $$ select value->>field from pg_temp.extras_results where extras_results.key=result.key; $$;
create function pg_temp.thread(key text) returns bigint language sql set search_path='' as $$ select (value->>'thread_id')::bigint from pg_temp.extras_results where extras_results.key=thread.key; $$;
create function pg_temp.thread_notices(key text) returns bigint language sql security definer set search_path='' as $$
  select count(*) from private.player_notifications n where n.kind='forum.reply' and n.payload->>'thread_id'=(select value->>'thread_id' from pg_temp.extras_results r where r.key=thread_notices.key); $$;
create function pg_temp.poll(key text) returns jsonb language sql set search_path='' as $$ select public.get_forum_thread(pg_temp.thread(key))#>'{thread,poll}'; $$;
grant execute on function pg_temp.cool(),pg_temp.notifications(text,text),pg_temp.as_player(text),pg_temp.number(text),pg_temp.result(text,text),pg_temp.thread(text),pg_temp.poll(text),pg_temp.thread_notices(text) to authenticated;
select ok((select bool_and(relrowsecurity) from pg_class where oid in('private.forum_polls'::regclass,'private.forum_poll_options'::regclass,'private.forum_poll_votes'::regclass,
  'private.forum_images'::regclass,'private.forum_post_images'::regclass,'private.forum_profiles'::regclass,'private.forum_popular_threads'::regclass,'private.forum_notification_jobs'::regclass)),
  'New forum tables use RLS');
select ok(not has_table_privilege('authenticated','private.forum_poll_votes','SELECT'),'Votes are private');
select ok(not has_table_privilege('authenticated','private.forum_images','SELECT'),'Image rows are private');
select ok(not has_table_privilege('authenticated','private.forum_profiles','UPDATE'),'Signatures change only through the RPC');
select is((select public from storage.buckets where id='forum-images'),false,'The image bucket is private');
select is((select count(*) from private.admin_resources where name='forum_poll_votes'),0::bigint,'Votes stay out of the admin browser');
select ok(exists(select 1 from cron.job where jobname='forum-popular-threads') and exists(select 1 from cron.job where jobname='forum-notifications')
  and exists(select 1 from cron.job where jobname='forum-image-sweep'),'Popular threads, notifications and the image sweep run on a schedule');
select ok(not has_function_privilege('authenticated','private.sweep_forum_images()','EXECUTE'),'Players cannot run the image sweep');
set local role authenticated;

-- Polls open with their thread.
select pg_temp.as_player('ExtrasAuthor');
select throws_ok($$select public.create_forum_thread('general_discussion','One option','A poll needs two options.',gen_random_uuid(),'{"question":"Pick","options":["Only"],"max_choices":1}')$$,
  '22023','INVALID_POLL','A poll needs two options');
select throws_ok($$select public.create_forum_thread('general_discussion','Twins','Options must differ.',gen_random_uuid(),'{"question":"Pick","options":["Sloop","sloop "],"max_choices":1}')$$,
  '22023','INVALID_POLL','Options must differ');
select throws_ok($$select public.create_forum_thread('general_discussion','Greedy','Too many choices.',gen_random_uuid(),'{"question":"Pick","options":["A","B"],"max_choices":3}')$$,
  '22023','INVALID_POLL','Voters cannot pick more options than there are');
select throws_ok($$select public.create_forum_thread('general_discussion','Forever','Too long.',gen_random_uuid(),'{"question":"Pick","options":["A","B"],"max_choices":1,"days":31}')$$,
  '22023','INVALID_POLL','Polls last at most the configured number of days');
select throws_ok($$select public.create_forum_thread('general_discussion','Extra','Unknown fields.',gen_random_uuid(),'{"question":"Pick","options":["A","B"],"max_choices":1,"secret":true}')$$,
  '22023','INVALID_POLL','Polls accept only known fields');
select throws_ok($$select public.create_forum_thread('general_discussion','Fraction','Whole numbers.',gen_random_uuid(),'{"question":"Pick","options":["A","B"],"max_choices":1.5}')$$,
  '22023','INVALID_POLL','Choices are a whole number');
insert into extras_results values('poll',public.create_forum_thread('general_discussion','Best ship','Which ship should the harbor build next?',
  'f3f00000-0000-4000-8000-0000000000a1','{"question":"Which ship?","options":["Sloop","Frigate","Galleon"],"max_choices":1,"days":3}'));
select pg_temp.cool();
select is(public.create_forum_thread('general_discussion','Best ship','Which ship should the harbor build next?','f3f00000-0000-4000-8000-0000000000a1',
  '{"question":" Which ship? ","options":["Sloop","Frigate","Galleon"],"max_choices":1,"days":3}'),(select value from extras_results where key='poll'),'A replayed thread with its poll returns the receipt');
select throws_ok($$select public.create_forum_thread('general_discussion','Best ship','Which ship should the harbor build next?','f3f00000-0000-4000-8000-0000000000a1',
  '{"question":"Which ship?","options":["Sloop","Brig","Galleon"],"max_choices":1,"days":3}')$$,'22023','REQUEST_MISMATCH','A replay with another poll is refused');
select is(pg_temp.poll('poll')->>'question','Which ship?','The thread shows its poll');
select is(jsonb_array_length(pg_temp.poll('poll')->'options'),3,'Every option is listed');
select is(pg_temp.poll('poll')#>'{options,0,votes}','null'::jsonb,'Results stay hidden until you vote');
select ok((pg_temp.poll('poll')->>'closes_at')::timestamptz between clock_timestamp()+interval '71 hours' and clock_timestamp()+interval '73 hours','The deadline follows the duration');
select is((public.get_forum_board('general_discussion')#>>'{items,0,poll}')::boolean,true,'The thread list marks threads with polls');
select is((pg_temp.poll('poll')->>'can_close')::boolean,true,'The author may close the poll');

select pg_temp.as_player('ExtrasVoter');
select is((public.vote_forum_poll(pg_temp.thread('poll'),array[2])#>>'{options,1,votes}')::integer,1,'Captains vote');
select is((public.vote_forum_poll(pg_temp.thread('poll'),array[2])->>'voters')::integer,1,'Voting again changes nothing');
select is(pg_temp.poll('poll')->'my_choices','[2]'::jsonb,'Voters see their own choice');
select is((pg_temp.poll('poll')->>'results')::boolean,true,'Voters see the results');
select throws_ok($$select public.vote_forum_poll(pg_temp.thread('poll'),array[1,2])$$,'22023','INVALID_VOTE','Single-choice polls take one option');
select throws_ok($$select public.vote_forum_poll(pg_temp.thread('poll'),array[4])$$,'22023','INVALID_VOTE','Unknown options are refused');
select throws_ok($$select public.vote_forum_poll(pg_temp.thread('poll'),array[0])$$,'22023','INVALID_REQUEST','Option numbers start at one');
select throws_ok($$select public.vote_forum_poll(pg_temp.thread('poll'),array[2,2])$$,'22023','INVALID_VOTE','An option counts once');
select is(public.vote_forum_poll(pg_temp.thread('poll'),array[1])->'options','[{"label":"Sloop","votes":1,"number":1},{"label":"Frigate","votes":0,"number":2},{"label":"Galleon","votes":0,"number":3}]'::jsonb,
  'Captains change their vote while the poll is open');
select is((public.vote_forum_poll(pg_temp.thread('poll'),'{}')->>'voters')::integer,0,'An empty vote withdraws it');
select is((public.vote_forum_poll(pg_temp.thread('poll'),array[3])->>'voters')::integer,1,'Captains can vote again');
select throws_ok($$select public.close_forum_poll(pg_temp.thread('poll'))$$,'42501','FORUM_FORBIDDEN','Only the author closes a poll');
select pg_temp.as_player('ExtrasNew');
select throws_ok($$select public.vote_forum_poll(pg_temp.thread('poll'),array[1])$$,'P0001','NEW_CHARACTER','New captains cannot vote');
select is((pg_temp.poll('poll')->>'can_vote')::boolean,false,'New captains are offered no vote');
select is((pg_temp.poll('poll')#>>'{options,2,votes}')::integer,1,'Captains who cannot vote see the results');
select pg_temp.as_player('ExtrasOther');
select is((public.vote_forum_poll(pg_temp.thread('poll'),array[3])#>>'{options,2,votes}')::integer,2,'Votes from several captains add up');
select pg_temp.as_player('ExtrasAuthor');
select is(public.close_forum_poll(pg_temp.thread('poll'))->>'closed_by','author','The author closes the poll early');
select is(public.close_forum_poll(pg_temp.thread('poll'))->>'closed_by','author','Closing again changes nothing');
select is((pg_temp.poll('poll')#>>'{options,2,votes}')::integer,2,'Closed polls show their results to everyone');
select pg_temp.as_player('ExtrasOther');
select throws_ok($$select public.vote_forum_poll(pg_temp.thread('poll'),array[1])$$,'P0001','POLL_CLOSED','Closed polls take no votes');

-- Multiple choice, deadlines and locks.
select pg_temp.as_player('ExtrasAuthor');
insert into extras_results values('multi',public.create_forum_thread('general_discussion','Supplies','What should we stock?',gen_random_uuid(),
  '{"question":"Stock up on?","options":["Rum","Rope","Powder"],"max_choices":2,"days":null}'));
select pg_temp.cool();
select is(pg_temp.poll('multi')->'closes_at','null'::jsonb,'Polls may run without a deadline');
select pg_temp.as_player('ExtrasVoter');
select is(public.vote_forum_poll(pg_temp.thread('multi'),array[3,1])->'my_choices','[1,3]'::jsonb,'Multiple-choice polls take several options');
select throws_ok($$select public.vote_forum_poll(pg_temp.thread('multi'),array[1,2,3])$$,'22023','INVALID_VOTE','Voters pick at most the allowed number');
reset role;
update private.forum_polls set closes_at=clock_timestamp()-interval '1 minute',duration_days=1 where thread_id=(select (value->>'thread_id')::bigint from extras_results where key='multi');
set local role authenticated;
select throws_ok($$select public.vote_forum_poll(pg_temp.thread('multi'),array[1])$$,'P0001','POLL_CLOSED','Polls close at their deadline');
select is((pg_temp.poll('multi')->>'closed')::boolean,true,'A passed deadline shows the poll as closed');
select pg_temp.as_player('ExtrasAuthor');
insert into extras_results values('locked',public.create_forum_thread('general_discussion','Lockable','This poll will be locked.',gen_random_uuid(),'{"question":"Lock?","options":["Yes","No"],"max_choices":1}'));
select pg_temp.cool();
select pg_temp.as_player('ExtrasMod');
select public.moderate_forum('lock_thread',jsonb_build_object('thread_id',pg_temp.result('locked','thread_id')),gen_random_uuid(),'Settled already');
select pg_temp.as_player('ExtrasVoter');
select throws_ok($$select public.vote_forum_poll(pg_temp.thread('locked'),array[1])$$,'P0001','POLL_CLOSED','Locked threads close their poll');

-- Moderators close, remove and restore polls.
select pg_temp.as_player('ExtrasAuthor');
insert into extras_results values('moderated',public.create_forum_thread('general_discussion','Rude poll','A poll with a rude option.',gen_random_uuid(),'{"question":"Who is worst?","options":["Them","Us"],"max_choices":1}'));
select pg_temp.cool();
select pg_temp.as_player('ExtrasMod');
select is(public.moderate_forum('remove_poll',jsonb_build_object('thread_id',pg_temp.result('moderated','thread_id')),gen_random_uuid(),'Insulting options')->>'message','Poll removed.','Moderators remove polls');
select throws_ok($$select public.moderate_forum('remove_poll',jsonb_build_object('thread_id',pg_temp.result('moderated','thread_id')),gen_random_uuid(),'Again')$$,'P0001','FORUM_NO_CHANGE','A poll is removed once');
select is((pg_temp.poll('moderated')->>'removed')::boolean,true,'Moderators still see removed polls');
select pg_temp.as_player('ExtrasVoter');
select is(pg_temp.poll('moderated'),'{"removed":true}'::jsonb,'Players see only that a poll was removed');
select throws_ok($$select public.vote_forum_poll(pg_temp.thread('moderated'),array[1])$$,'P0002','FORUM_NOT_FOUND','Removed polls take no votes');
select is(pg_temp.notifications('ExtrasAuthor','forum.moderation'),1::bigint,'The author hears that the poll was removed');
select pg_temp.as_player('ExtrasMod');
select is(public.moderate_forum('restore_poll',jsonb_build_object('thread_id',pg_temp.result('moderated','thread_id')),gen_random_uuid(),'Reviewed again')->>'message','Poll restored.','Moderators restore polls');
select is(public.moderate_forum('close_poll',jsonb_build_object('thread_id',pg_temp.result('moderated','thread_id')),gen_random_uuid(),'Enough votes')->>'message','Poll closed.','Moderators close polls');
select throws_ok($$select public.moderate_forum('close_poll',jsonb_build_object('thread_id',pg_temp.result('moderated','thread_id')),gen_random_uuid(),'Again')$$,'P0001','FORUM_NO_CHANGE','A closed poll stays closed');
select is(pg_temp.poll('moderated')->>'closed_by','moderator','The poll shows who closed it');
select throws_ok($$select public.moderate_forum('close_poll',jsonb_build_object('thread_id',pg_temp.result('lockable','thread_id')),gen_random_uuid(),'Nothing')$$,'22023','INVALID_REQUEST','Poll actions need a thread');

-- Signatures.
select pg_temp.as_player('ExtrasVoter');
select is(public.get_forum_settings(),jsonb_build_object('signature','','show_signatures',true,'ban',null,'can_sign',true),'Captains start without a signature');
select is(public.set_forum_settings(E'[b]Captain[/b] of the Sea Wolf\r\nFair winds ',true)->>'signature',E'[b]Captain[/b] of the Sea Wolf\nFair winds','Captains save a signature');
select throws_ok($$select public.set_forum_settings(E'one\ntwo\nthree\nfour',true)$$,'22023','INVALID_SIGNATURE','Signatures have few lines');
select throws_ok($$select public.set_forum_settings(repeat('x',201),true)$$,'22023','INVALID_SIGNATURE','Signatures are short');
select throws_ok($$select public.set_forum_settings(E'bell\u0007',true)$$,'22023','INVALID_SIGNATURE','Signatures have no control characters');
select public.create_forum_post(pg_temp.thread('poll'),'The Galleon, of course.',null,gen_random_uuid());
select pg_temp.cool();
select pg_temp.as_player('ExtrasAuthor');
select is(public.get_forum_thread(pg_temp.thread('poll'))->'signatures',jsonb_build_object(pg_temp.number('ExtrasVoter'),E'[b]Captain[/b] of the Sea Wolf\nFair winds'),
  'Thread pages carry the signatures of their authors');
select is(public.set_forum_settings('',false)->>'show_signatures','false','Captains hide signatures');
select is(public.get_forum_thread(pg_temp.thread('poll'))->'signatures','{}'::jsonb,'Hidden signatures are not sent');
select public.set_forum_settings('',true);
select pg_temp.as_player('ExtrasNew');
select throws_ok($$select public.set_forum_settings('Fresh sailor',true)$$,'P0001','NEW_CHARACTER','New captains cannot write a signature');
select is(public.set_forum_settings('',false)->>'show_signatures','false','New captains may still change their settings');
select pg_temp.as_player('ExtrasMod');
select throws_ok($$select public.moderate_forum('clear_signature',jsonb_build_object('player_number',pg_temp.number('ExtrasAuthor')),gen_random_uuid(),'Nothing to clear')$$,
  'P0001','FORUM_NO_CHANGE','An empty signature cannot be cleared');
select is(public.moderate_forum('clear_signature',jsonb_build_object('player_number',pg_temp.number('ExtrasVoter')),gen_random_uuid(),'Advertising')->>'message',
  'ExtrasVoter''s signature was cleared.','Moderators clear signatures');
select throws_ok($$select public.moderate_forum('clear_signature',jsonb_build_object('player_number',pg_temp.number('ExtrasAdmin')),gen_random_uuid(),'Nope')$$,
  '42501','FORUM_FORBIDDEN','Moderators cannot clear an administrator''s signature');
select is(pg_temp.notifications('ExtrasVoter','forum.moderation'),1::bigint,'The captain hears that the signature was cleared');
reset role;
select is((select before->>'signature' from private.forum_moderation_log where action='clear_signature' order by id desc limit 1),E'[b]Captain[/b] of the Sea Wolf\nFair winds',
  'The log keeps the cleared signature for moderators');
insert into private.forum_bans(character_id,starts_at,reason,created_by_name) select id,clock_timestamp(),'Spamming signatures','Test' from extras_fixture where display_name='ExtrasOther';
set local role authenticated;
select pg_temp.as_player('ExtrasOther');
select throws_ok($$select public.set_forum_settings('Buy my rum',true)$$,'42501','FORUM_BANNED','Banned captains cannot write a signature');
select is((public.get_forum_settings()->>'can_sign')::boolean,false,'Banned captains are told they cannot sign');
reset role;
update private.forum_bans set lifted_at=clock_timestamp() where character_id=(select id from extras_fixture where display_name='ExtrasOther');

-- Notifications are delivered in batches after the post commits.
set local role authenticated;
select pg_temp.as_player('ExtrasAuthor');
insert into extras_results values('busy',public.create_forum_thread('general_discussion','Busy harbor','Everyone is subscribed here.',gen_random_uuid()));
select pg_temp.cool();
select pg_temp.as_player('ExtrasVoter');
select public.set_forum_subscription(pg_temp.thread('busy'),true);
select pg_temp.as_player('ExtrasOther');
select public.set_forum_subscription(pg_temp.thread('busy'),true);
select pg_temp.as_player('ExtrasMod');
insert into extras_results values('busy_reply',public.create_forum_post(pg_temp.thread('busy'),'News for everyone.',null,gen_random_uuid()));
select pg_temp.cool();
reset role;
select is((select count(*) from private.forum_notification_jobs where post_id=(select (value->>'post_id')::bigint from extras_results where key='busy_reply')),1::bigint,'A reply queues one job');
select private.run_forum_notification_jobs(null,50,2);
select is(pg_temp.thread_notices('busy'),2::bigint,'A batch notifies at most its size');
select isnt((select delivered_through from private.forum_notification_jobs where post_id=(select (value->>'post_id')::bigint from extras_results where key='busy_reply')),null,'The job remembers where it stopped');
select private.run_forum_notification_jobs(null,50,2);
select is(pg_temp.thread_notices('busy'),3::bigint,'The next batch reaches the rest');
select is((select count(*) from private.forum_notification_jobs where post_id=(select (value->>'post_id')::bigint from extras_results where key='busy_reply')),0::bigint,'A finished job is removed');
set local role authenticated;
select pg_temp.as_player('ExtrasAuthor');
select public.mark_forum_thread_read(pg_temp.thread('busy'),2);
select pg_temp.as_player('ExtrasMod');
insert into extras_results values('regret',public.create_forum_post(pg_temp.thread('busy'),'Posted by mistake.',null,gen_random_uuid()));
select public.withdraw_forum_post((select (value->>'post_id')::bigint from extras_results where key='regret'));
select pg_temp.cool();
reset role;
select private.run_forum_notification_jobs(null,50,500);
select is(pg_temp.thread_notices('busy'),3::bigint,'A post deleted before delivery notifies nobody');
select is((select count(*) from private.forum_notification_jobs where post_id=(select (value->>'post_id')::bigint from extras_results where key='regret')),0::bigint,'Its job is dropped');

-- Popular threads rank recent replies, repliers and likes.
set local role authenticated;
select pg_temp.as_player('ExtrasAuthor');
insert into extras_results values('quiet',public.create_forum_thread('off_topic','Quiet thread','Nobody answers here.',gen_random_uuid()));
select pg_temp.cool();
insert into extras_results values('lively',public.create_forum_thread('off_topic','Lively thread','Everyone answers here.',gen_random_uuid()));
select pg_temp.cool();
select pg_temp.as_player('ExtrasVoter');
select public.create_forum_post(pg_temp.thread('lively'),'First answer.',null,gen_random_uuid());
select pg_temp.cool();
select public.set_forum_reaction(pg_temp.result('lively','post_id')::bigint,1);
select pg_temp.as_player('ExtrasOther');
select public.create_forum_post(pg_temp.thread('lively'),'Second answer.',null,gen_random_uuid());
select pg_temp.cool();
reset role;
select private.refresh_forum_popular();
set local role authenticated;
select pg_temp.as_player('ExtrasNew');
select ok(jsonb_path_exists(public.get_forum_index()->'popular','$[*] ? (@.title == "Lively thread")'),'Threads with replies and likes are popular');
select ok(not jsonb_path_exists(public.get_forum_index()->'popular','$[*] ? (@.title == "Quiet thread")'),'Threads without activity from others are not');
select ok((select min(ordinality) from jsonb_array_elements(public.get_forum_index()->'popular') with ordinality where value->>'title'='Lively thread')
  <(select min(ordinality) from jsonb_array_elements(public.get_forum_index()->'popular') with ordinality where value->>'title'='Best ship'),'More activity ranks higher');
select is((select value#>>'{board,name}' from jsonb_array_elements(public.get_forum_index()->'popular') where value->>'title'='Lively thread'),'Off Topic','Popular threads name their board');
select pg_temp.as_player('ExtrasMod');
select public.moderate_forum('remove_thread',jsonb_build_object('thread_id',pg_temp.result('lively','thread_id')),gen_random_uuid(),'Off the rails');
select pg_temp.as_player('ExtrasNew');
select ok(not jsonb_path_exists(public.get_forum_index()->'popular','$[*] ? (@.title == "Lively thread")'),'Removed threads leave the list before the next ranking');

-- Images: reservations, attachment, visibility and moderation.
select pg_temp.as_player('ExtrasNew');
select throws_ok($$select public.reserve_forum_image(gen_random_uuid(),1000,800,600)$$,'P0001','NEW_CHARACTER','New captains cannot upload images');
select pg_temp.as_player('ExtrasAuthor');
insert into extras_results values('image',public.reserve_forum_image('f3f00000-0000-4000-8000-0000000000b1',1000,800,600));
select is(pg_temp.result('image','path'),'f3f00000-0000-4000-8000-000000000001/'||pg_temp.result('image','image_id')||'.webp','Images are stored under the uploader''s folder');
select is(public.reserve_forum_image('f3f00000-0000-4000-8000-0000000000b1',1000,800,600),(select value from extras_results where key='image'),'A repeated reservation returns the same image');
select throws_ok($$select public.reserve_forum_image('f3f00000-0000-4000-8000-0000000000b1',999,800,600)$$,'22023','REQUEST_MISMATCH','A reservation cannot change');
select throws_ok($$select public.reserve_forum_image(gen_random_uuid(),1000,1601,600)$$,'22023','INVALID_IMAGE','Images fit the configured size');
select is(private.forum_image_uploadable(pg_temp.result('image','path')),true,'The owner may store a reserved image');
select throws_ok(format($$select public.create_forum_thread('general_discussion','Pictures','[img]%s[/img]',gen_random_uuid())$$,pg_temp.result('image','image_id')),
  '22023','INVALID_IMAGE','A post cannot show an image whose file is missing');
reset role;
insert into storage.objects(bucket_id,name,owner_id) values('forum-images',(select value->>'path' from extras_results where key='image'),'f3f00000-0000-4000-8000-000000000001');
set local role authenticated;
select pg_temp.as_player('ExtrasVoter');
select is(private.forum_image_readable(pg_temp.result('image','path')),false,'Unused uploads are private to their owner');
select throws_ok(format($$select public.create_forum_thread('general_discussion','Borrowed','[img]%s[/img]',gen_random_uuid())$$,pg_temp.result('image','image_id')),
  '22023','INVALID_IMAGE','Captains cannot show other captains'' uploads');
select pg_temp.as_player('ExtrasAuthor');
select is(private.forum_image_readable(pg_temp.result('image','path')),true,'Owners see their own uploads');
select throws_ok(format($$select public.create_forum_thread('general_discussion','Crowded','[img]%1$s[/img] %2$s',gen_random_uuid())$$,pg_temp.result('image','image_id'),
  (select string_agg('[img]'||gen_random_uuid()||'[/img]','') from generate_series(1,4))),'22023','TOO_MANY_IMAGES','Posts show a limited number of images');
insert into extras_results values('pictures',public.create_forum_thread('general_discussion','Pictures',format('Look: [img=The harbor]%s[/img]',upper(pg_temp.result('image','image_id'))),gen_random_uuid()));
select pg_temp.cool();
select is(public.get_forum_thread(pg_temp.thread('pictures'))#>'{posts,0,images}',jsonb_build_object(pg_temp.result('image','image_id'),
  jsonb_build_object('width',800,'height',600,'removed',false,'purged',false)),'Posts list the images they show with their sizes');
select is(private.forum_image_uploadable(pg_temp.result('image','path')),false,'Attached images cannot be replaced');
select is(private.forum_image_deletable(pg_temp.result('image','path')),false,'Owners cannot delete attached files');
select pg_temp.as_player('ExtrasVoter');
select is(private.forum_image_readable(pg_temp.result('image','path')),true,'Images in visible posts are visible to players');
select is(public.get_forum_image(pg_temp.result('image','image_id')::uuid)->>'path',pg_temp.result('image','path'),'The image route receives the file path');
select throws_ok($$select public.get_forum_image(gen_random_uuid())$$,'P0002','FORUM_NOT_FOUND','Unknown images are not found');
select pg_temp.as_player('ExtrasMod');
select is(public.moderate_forum('remove_image',jsonb_build_object('image_id',pg_temp.result('image','image_id')),gen_random_uuid(),'Graphic content')->>'message','Image hidden from players.',
  'Moderators hide images');
select is(private.forum_image_readable(pg_temp.result('image','path')),true,'Moderators still see hidden images');
select pg_temp.as_player('ExtrasVoter');
select is(private.forum_image_readable(pg_temp.result('image','path')),false,'Players no longer see hidden images');
select is((public.get_forum_thread(pg_temp.thread('pictures'))#>>array['posts','0','images',pg_temp.result('image','image_id'),'removed'])::boolean,true,'Players see that an image was hidden');
select is(pg_temp.notifications('ExtrasAuthor','forum.moderation'),3::bigint,'The owner hears that the image was hidden');
select pg_temp.as_player('ExtrasAuthor');
select ok(public.edit_forum_post(pg_temp.result('pictures','post_id')::bigint,format('Still: [img]%s[/img]',pg_temp.result('image','image_id')),null,0) is not null,
  'Authors keep editing posts with hidden images');
select pg_temp.as_player('ExtrasMod');
select is(public.moderate_forum('restore_image',jsonb_build_object('image_id',pg_temp.result('image','image_id')),gen_random_uuid(),'Mistake')->>'message','Image restored.','Moderators restore images');
select throws_ok($$select public.moderate_forum('purge_image',jsonb_build_object('image_id',pg_temp.result('image','image_id')),gen_random_uuid(),'Illegal content')$$,
  '42501','ADMIN_REQUIRED','Only administrators purge files');
select pg_temp.as_player('ExtrasAdmin');
select is(public.moderate_forum('purge_image',jsonb_build_object('image_id',pg_temp.result('image','image_id')),gen_random_uuid(),'Illegal content')->>'image_path',pg_temp.result('image','path'),
  'Purging returns the file for the app to delete');
select is(private.forum_image_readable(pg_temp.result('image','path')),false,'Purged images are gone for everyone');
select is(private.forum_image_deletable(pg_temp.result('image','path')),true,'Administrators may delete purged files');
select throws_ok($$select public.moderate_forum('restore_image',jsonb_build_object('image_id',pg_temp.result('image','image_id')),gen_random_uuid(),'Undo')$$,'P0001','CANNOT_RESTORE','Purged images cannot return');
select pg_temp.as_player('ExtrasAuthor');
select is((public.get_forum_thread(pg_temp.thread('pictures'))#>>array['posts','0','images',pg_temp.result('image','image_id'),'purged'])::boolean,true,'Posts show that a file was deleted');
select ok(public.edit_forum_post(pg_temp.result('pictures','post_id')::bigint,'No pictures now.',null,1) is not null,'Authors remove image tags');
select is(public.get_forum_thread(pg_temp.thread('pictures'))#>'{posts,0,images}','null'::jsonb,'Edits unlink images the text no longer shows');

-- Rate limits, expiry and the scheduled sweep.
select pg_temp.as_player('ExtrasOther');
select count(public.reserve_forum_image(gen_random_uuid(),500,100,100)) from generate_series(1,10);
select throws_ok($$select public.reserve_forum_image(gen_random_uuid(),500,100,100)$$,'P0001','IMAGE_RATE_LIMIT','Uploads per hour are limited');
reset role;
update private.forum_images set created_at=clock_timestamp()-interval '2 hours' where owner_id=(select id from extras_fixture where display_name='ExtrasOther');
set local role authenticated;
select throws_ok($$select public.reserve_forum_image(gen_random_uuid(),500,100,100)$$,'P0001','IMAGE_UNUSED_LIMIT','Unused uploads are limited');
reset role;
update private.forum_images set created_at=clock_timestamp()-interval '2 days' where owner_id=(select id from extras_fixture where display_name='ExtrasOther');
create temporary table expired_image as select id,storage_path from private.forum_images where owner_id=(select id from extras_fixture where display_name='ExtrasOther') order by id limit 1;
grant select on expired_image to authenticated;
insert into storage.objects(bucket_id,name,owner_id) select 'forum-images',storage_path,'f3f00000-0000-4000-8000-000000000003' from expired_image;
set local role authenticated;
select is(public.reserve_forum_image(gen_random_uuid(),500,100,100) ? 'image_id',true,'Uploads older than a day no longer count as unused');
select throws_ok(format($$select public.create_forum_thread('general_discussion','Too late','[img]%s[/img]',gen_random_uuid())$$,(select id from expired_image)),
  '22023','INVALID_IMAGE','Uploads older than a day cannot be used');
select is(private.forum_image_deletable((select storage_path from expired_image)),false,'Players never delete files directly');
reset role;
delete from vault.secrets where name in('forum_storage_url','forum_storage_key');
select is(private.sweep_forum_images(),0,'Without its settings the sweep sends nothing');
select is((select count(*) from private.forum_images where owner_id=(select id from extras_fixture where display_name='ExtrasOther') and discarded_at is not null),9::bigint,
  'Expired uploads whose file is gone are discarded');
select is((select discarded_at from private.forum_images where id=(select id from expired_image)),null,'An upload keeps its row while its file exists');
select vault.create_secret('http://storage.test/storage/v1/','forum_storage_url','Test'),vault.create_secret('test-key','forum_storage_key','Test');
select ok(private.sweep_forum_images()>=2,'The sweep sends the files it found');
create temporary table sweep_request as select q.url,q.headers,convert_from(q.body,'utf8')::jsonb body from net.http_request_queue q where q.method='DELETE' order by q.id desc limit 1;
select is((select url from sweep_request),'http://storage.test/storage/v1/object/forum-images','The sweep calls the Storage API delete endpoint');
select is((select headers->>'Authorization' from sweep_request),'Bearer test-key','The sweep uses the service key from Vault');
select ok((select body->'prefixes' ? (select storage_path from expired_image) from sweep_request),'Expired uploads are deleted');
select ok((select body->'prefixes' ? (select value->>'path' from extras_results where key='image') from sweep_request),'Purged files whose deletion failed are deleted again');
select ok(not (select body->'prefixes' ? (select storage_path from private.forum_images where owner_id=(select id from extras_fixture where display_name='ExtrasOther')
  and created_at>clock_timestamp()-interval '1 hour' limit 1) from sweep_request),'Recent uploads are kept');

-- Deleting a voter keeps the poll totals right.
reset role;
delete from auth.users where id='f3f00000-0000-4000-8000-000000000003';
select is((select count(*) from private.forum_poll_options o where o.votes<>(select count(*) from private.forum_poll_votes v where v.thread_id=o.thread_id and o.option_number=any(v.choices))),0::bigint,
  'Option totals match the stored votes');
select is((select count(*) from private.forum_polls p where p.voter_count<>(select count(*) from private.forum_poll_votes v where v.thread_id=p.thread_id)),0::bigint,'Voter counts match the stored votes');
select * from finish();
rollback;
