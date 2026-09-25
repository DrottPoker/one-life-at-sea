begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
insert into auth.users(id,email,is_anonymous,raw_user_meta_data) values
('f0f00000-0000-4000-8000-000000000001','forum-one@example.test',false,'{"character_name":"ForumOne"}'),
('f0f00000-0000-4000-8000-000000000002','forum-two@example.test',false,'{"character_name":"ForumTwo"}'),
('f0f00000-0000-4000-8000-000000000003','forum-three@example.test',false,'{"character_name":"ForumThree"}'),
('f0f00000-0000-4000-8000-000000000004','forum-admin@example.test',false,'{"character_name":"ForumAdmin"}'),
('f0f00000-0000-4000-8000-000000000005','forum-anon@example.test',true,'{}');
insert into private.admin_members(user_id) values('f0f00000-0000-4000-8000-000000000004');
create temporary table forum_fixture as select id,user_id,player_number,display_name from public.characters where user_id::text like 'f0f00000-%';
create temporary table forum_results(key text primary key,value jsonb);
grant select on forum_fixture to authenticated;
grant all on forum_results to authenticated;
insert into forum_results values('active_boards',to_jsonb((select count(*) from private.forum_boards where active)));

-- Storage is private; only RPCs expose forum content.
select ok((select bool_and(relrowsecurity) from pg_class where oid in('private.forum_boards'::regclass,'private.forum_threads'::regclass,'private.forum_posts'::regclass,
  'private.forum_post_revisions'::regclass,'private.forum_thread_reads'::regclass,'private.forum_board_reads'::regclass,'private.forum_author_stats'::regclass,
  'private.forum_moderation_log'::regclass)),'All forum tables use RLS');
select ok(not has_table_privilege('authenticated','private.forum_posts','SELECT'),'Posts are not directly readable');
select ok(not has_table_privilege('authenticated','private.forum_threads','UPDATE'),'Threads are not directly writable');
select ok(not has_table_privilege('authenticated','private.forum_moderation_log','SELECT'),'The moderation log is private');
select ok(not has_sequence_privilege('authenticated','private.forum_posts_id_seq','USAGE'),'Post IDs are private');
select ok(not has_function_privilege('authenticated','private.forum_count_thread(bigint,integer)','EXECUTE'),'Counter helpers are not client callable');
select ok(not has_function_privilege('authenticated','private.forum_mark_read(uuid,bigint,integer)','EXECUTE'),'Read helpers cannot target another reader');
select is((select count(*) from private.forum_boards where posting='closed' and active),1::bigint,'Configuration installs one closed board');
set local role anon;
select throws_ok($$select public.get_forum_index()$$,'42501',null,'Logged out users cannot read the forum');
select throws_ok($$select public.create_forum_thread('general_discussion','Hi','Body',gen_random_uuid())$$,'42501',null,'Logged out users cannot post');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f0f00000-0000-4000-8000-000000000005","role":"authenticated"}',true);
select throws_ok($$select public.get_forum_index()$$,'42501','NOT_AUTHORIZED','Anonymous accounts cannot read the forum');

-- Creating a thread.
select set_config('request.jwt.claims','{"sub":"f0f00000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is((public.get_forum_index()->>'can_moderate')::boolean,false,'Players are not moderators');
select is(public.get_forum_index()#>>'{boards,0,id}','announcements','Boards follow configured order');
select is(jsonb_array_length(public.get_forum_index()->'boards'),(select value::integer from forum_results where key='active_boards'),'Players see every active board');
insert into forum_results values('thread',public.create_forum_thread('general_discussion','  Harbor news  ',E'  First line\r\nSecond line  ','f0f00000-0000-4000-8000-0000000000a1'));
select is((select value->>'post_number' from forum_results where key='thread'),'1','The opening post is number one');
select is(public.create_forum_thread('general_discussion','Harbor news',E'First line\nSecond line','f0f00000-0000-4000-8000-0000000000a1'),(select value from forum_results where key='thread'),'A replayed thread returns its receipt');
select throws_ok($$select public.create_forum_thread('general_discussion','Harbor news','Changed','f0f00000-0000-4000-8000-0000000000a1')$$,'22023','REQUEST_MISMATCH','A replay cannot change the text');
select throws_ok($$select public.create_forum_thread('general_discussion','Other title',E'First line\nSecond line','f0f00000-0000-4000-8000-0000000000a1')$$,'22023','REQUEST_MISMATCH','A replay cannot change the title');
select throws_ok($$select public.create_forum_thread('general_discussion','  ','Body',gen_random_uuid())$$,'22023','INVALID_POST','Blank titles are rejected');
select throws_ok($$select public.create_forum_thread('general_discussion',repeat('x',101),'Body',gen_random_uuid())$$,'22023','INVALID_POST','Long titles are rejected');
select throws_ok($$select public.create_forum_thread('general_discussion',E'Two\nlines','Body',gen_random_uuid())$$,'22023','INVALID_POST','Title control characters are rejected');
select throws_ok($$select public.create_forum_thread('general_discussion','Title',E' \n ',gen_random_uuid())$$,'22023','INVALID_POST','Blank posts are rejected');
select throws_ok($$select public.create_forum_thread('general_discussion','Title',repeat('x',10001),gen_random_uuid())$$,'22023','INVALID_POST','Long posts are rejected');
select throws_ok($$select public.create_forum_thread('general_discussion','Title',chr(7),gen_random_uuid())$$,'22023','INVALID_POST','Post control characters are rejected');
select throws_ok($$select public.create_forum_thread('missing','Title','Body',gen_random_uuid())$$,'P0002','FORUM_NOT_FOUND','Unknown boards are rejected');
select throws_ok($$select public.create_forum_thread('announcements','Title','Body',gen_random_uuid())$$,'42501','FORUM_READ_ONLY','Only moderators start announcements');
select throws_ok($$select public.create_forum_thread('graveyard','Title','Body',gen_random_uuid())$$,'42501','FORUM_READ_ONLY','Nobody starts threads in the closed board');
select throws_ok($$select public.create_forum_thread('general_discussion','Another','Body',gen_random_uuid())$$,'P0001','FORUM_COOLDOWN','Posting waits for the cooldown');
select is(public.get_forum_board('general_discussion')->>'total','1','The board lists the thread');
select is(public.get_forum_board('general_discussion')#>>'{items,0,title}','Harbor news','Titles are trimmed');
select is((public.get_forum_board('general_discussion')#>>'{items,0,views}')::integer,1,'The author is the first reader');
select is((public.get_forum_board('general_discussion')#>>'{items,0,unread}')::boolean,false,'Own posts are never unread');
select is(public.get_forum_thread((select (value->>'thread_id')::bigint from forum_results where key='thread'))#>>'{posts,0,body}',E'First line\nSecond line','Post text is normalized');
reset role;
select ok((select last_action_at is not null from private.character_actions where character_id=(select id from forum_fixture where display_name='ForumOne')),'Posting records Last action');
update private.forum_author_stats set last_post_at=null;
set local role authenticated;

-- Replies and quotes.
select set_config('request.jwt.claims','{"sub":"f0f00000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is((public.get_forum_board('general_discussion')#>>'{items,0,unread}')::boolean,true,'A new thread is unread for other players');
select is((public.get_forum_index()#>>'{boards,1,unread}')::boolean,true,'The board shows unread activity');
insert into forum_results values('first',jsonb_build_object('id',public.get_forum_thread((select (value->>'thread_id')::bigint from forum_results where key='thread'))#>>'{posts,0,id}'));
insert into forum_results values('reply',public.create_forum_post((select (value->>'thread_id')::bigint from forum_results where key='thread'),'I agree with this.',
  (select (value->>'id')::bigint from forum_results where key='first'),'f0f00000-0000-4000-8000-0000000000b1'));
select is((select value->>'post_number' from forum_results where key='reply'),'2','Replies take the next number');
select is(public.create_forum_post((select (value->>'thread_id')::bigint from forum_results where key='thread'),'I agree with this.',
  (select (value->>'id')::bigint from forum_results where key='first'),'f0f00000-0000-4000-8000-0000000000b1'),(select value from forum_results where key='reply'),'A replayed reply returns its receipt');
select throws_ok($$select public.create_forum_post((select (value->>'thread_id')::bigint from forum_results where key='thread'),'I agree with this.',null,'f0f00000-0000-4000-8000-0000000000b1')$$,
  '22023','REQUEST_MISMATCH','A replay cannot drop its quote');
select is((public.get_forum_board('general_discussion')#>>'{items,0,unread}')::boolean,false,'Replying marks the thread read');
select is((public.get_forum_board('general_discussion')#>>'{items,0,replies}')::integer,1,'The thread counts one reply');
select is(public.get_forum_board('general_discussion')#>>'{items,0,last_post,author,display_name}','ForumTwo','The last post shows its author');
select is(public.get_forum_thread((select (value->>'thread_id')::bigint from forum_results where key='thread'))#>>'{posts,1,quote,author,display_name}','ForumOne','Quotes show the quoted author');
select is(public.get_forum_thread((select (value->>'thread_id')::bigint from forum_results where key='thread'))#>>'{posts,1,quote,body}',E'First line\nSecond line','Quotes show the original text');
select is((public.get_forum_thread((select (value->>'thread_id')::bigint from forum_results where key='thread'))#>>'{posts,1,author,posts}')::integer,1,'Author headers count visible posts');
select is((public.get_forum_thread((select (value->>'thread_id')::bigint from forum_results where key='thread'))#>>'{posts,0,can_edit}')::boolean,false,'Players cannot edit others posts');
select is((public.get_forum_thread((select (value->>'thread_id')::bigint from forum_results where key='thread'))#>>'{posts,1,can_edit}')::boolean,true,'Authors can edit their posts');
reset role;
update private.forum_author_stats set last_post_at=null;
set local role authenticated;
select throws_ok($$select public.create_forum_post((select (value->>'thread_id')::bigint from forum_results where key='thread'),'I agree with this.',null,gen_random_uuid())$$,
  'P0001','DUPLICATE_POST','Repeated text in the same thread is rejected');
select throws_ok($$select public.create_forum_post(-1,'Hello',null,gen_random_uuid())$$,'P0002','FORUM_NOT_FOUND','Unknown threads are rejected');

-- Reading.
select set_config('request.jwt.claims','{"sub":"f0f00000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is((public.get_forum_board('general_discussion')#>>'{items,0,unread}')::boolean,true,'A new reply makes the thread unread');
select is((public.get_forum_thread((select (value->>'thread_id')::bigint from forum_results where key='thread'))#>>'{thread,last_read_number}')::integer,1,'Reading a page does not mark it read');
select is(public.locate_forum_post(null,(select (value->>'thread_id')::bigint from forum_results where key='thread'))->>'post_number','2','The first unread post is located');
select public.mark_forum_thread_read((select (value->>'thread_id')::bigint from forum_results where key='thread'),99);
select is((public.get_forum_thread((select (value->>'thread_id')::bigint from forum_results where key='thread'))#>>'{thread,last_read_number}')::integer,2,'Read positions stop at the last post');
select public.mark_forum_thread_read((select (value->>'thread_id')::bigint from forum_results where key='thread'),1);
select is((public.get_forum_thread((select (value->>'thread_id')::bigint from forum_results where key='thread'))#>>'{thread,last_read_number}')::integer,2,'Read positions never move backwards');
select is((public.get_forum_board('general_discussion')#>>'{items,0,views}')::integer,2,'Views count unique readers');
select throws_ok($$select public.mark_forum_thread_read((select (value->>'thread_id')::bigint from forum_results where key='thread'),0)$$,'22023','INVALID_REQUEST','Read positions start at one');

-- Editing.
select throws_ok($$select public.edit_forum_post((select (value->>'post_id')::bigint from forum_results where key='reply'),'Mine now',null,0)$$,'42501','FORUM_FORBIDDEN','Players cannot edit others posts');
select is(public.edit_forum_post((select (value->>'post_id')::bigint from forum_results where key='thread'),'Updated opening','Harbor news update',0)->>'edit_count','1','Authors edit their posts');
select is(public.edit_forum_post((select (value->>'post_id')::bigint from forum_results where key='thread'),'Updated opening','Harbor news update',0)->>'edit_count','1','Repeating a saved edit changes nothing');
select throws_ok($$select public.edit_forum_post((select (value->>'post_id')::bigint from forum_results where key='thread'),'Stale text',null,0)$$,'P0001','EDIT_CONFLICT','Stale edits are rejected');
select is(public.get_forum_board('general_discussion')#>>'{items,0,title}','Harbor news update','Editing the opening post can rename the thread');
select is(public.get_forum_thread((select (value->>'thread_id')::bigint from forum_results where key='thread'))#>>'{posts,0,edited,by}','ForumOne','Edits show who edited');
select is((public.get_forum_thread((select (value->>'thread_id')::bigint from forum_results where key='thread'))#>>'{posts,1,quote,edited_after}')::boolean,true,'Quotes show later edits of the original');
select is(public.create_forum_thread('general_discussion','Harbor news',E'First line\nSecond line','f0f00000-0000-4000-8000-0000000000a1'),(select value from forum_results where key='thread'),'The original request stays confirmable after editing');
reset role;
select is((select body from private.forum_post_revisions where post_id=(select (value->>'post_id')::bigint from forum_results where key='thread') and revision=0),E'First line\nSecond line','The original text is kept');
select is((select title from private.forum_post_revisions where post_id=(select (value->>'post_id')::bigint from forum_results where key='thread') and revision=0),'Harbor news','The original title is kept');
update private.forum_author_stats set last_post_at=null;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f0f00000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_ok($$select public.edit_forum_post((select (value->>'post_id')::bigint from forum_results where key='reply'),'Reply',E'Title',0)$$,'22023','INVALID_POST','Only the opening post carries the title');

-- Withdrawing posts.
select is(public.withdraw_forum_post((select (value->>'post_id')::bigint from forum_results where key='reply'))->>'post_id',(select value->>'post_id' from forum_results where key='reply'),'Authors delete replies');
select is(public.withdraw_forum_post((select (value->>'post_id')::bigint from forum_results where key='reply'))->>'post_id',(select value->>'post_id' from forum_results where key='reply'),'Deleting twice changes nothing');
select is(public.get_forum_thread((select (value->>'thread_id')::bigint from forum_results where key='thread'))#>'{posts,1,author}','null'::jsonb,'Players see a deleted post as [deleted]');
select is(public.get_forum_thread((select (value->>'thread_id')::bigint from forum_results where key='thread'))#>>'{posts,1,removed,by}','author','The withdrawn post leaves a placeholder');
select is(public.get_forum_thread((select (value->>'thread_id')::bigint from forum_results where key='thread'))#>'{posts,1,body}','null'::jsonb,'Withdrawn text is hidden');
select is((public.get_forum_board('general_discussion')#>>'{items,0,replies}')::integer,0,'Withdrawn replies are not counted');
select is((public.get_forum_board('general_discussion')#>>'{items,0,last_post,post_number}')::integer,1,'The last post falls back to the newest visible post');
select throws_ok($$select public.edit_forum_post((select (value->>'post_id')::bigint from forum_results where key='reply'),'Back again',null,0)$$,'P0001','POST_REMOVED','Withdrawn posts cannot be edited');
select throws_ok($$select public.withdraw_forum_post((select (value->>'post_id')::bigint from forum_results where key='thread'))$$,'42501','FORUM_FORBIDDEN','Players cannot withdraw others posts');
select throws_ok($$select public.create_forum_post((select (value->>'thread_id')::bigint from forum_results where key='thread'),'Quoting a removed post',(select (value->>'post_id')::bigint from forum_results where key='reply'),gen_random_uuid())$$,
  '22023','INVALID_QUOTE','Removed posts cannot be quoted');

-- Moderation.
select set_config('request.jwt.claims','{"sub":"f0f00000-0000-4000-8000-000000000003","role":"authenticated"}',true);
insert into forum_results values('other',public.create_forum_thread('off_topic','Other thread','Somewhere else',gen_random_uuid()));
select throws_ok($$select public.create_forum_post((select (value->>'thread_id')::bigint from forum_results where key='thread'),'Quoting across threads',(select (value->>'post_id')::bigint from forum_results where key='other'),gen_random_uuid())$$,
  '22023','INVALID_QUOTE','Quotes stay within their thread');
select throws_ok($$select public.moderate_forum('pin_thread',jsonb_build_object('thread_id',(select value->>'thread_id' from forum_results where key='thread')),gen_random_uuid(),'Pin it')$$,
  '42501','MODERATOR_REQUIRED','Players cannot moderate');
select throws_ok($$select public.get_forum_post_history((select (value->>'post_id')::bigint from forum_results where key='thread'))$$,'42501','FORUM_FORBIDDEN','Players cannot read revisions');
select set_config('request.jwt.claims','{"sub":"f0f00000-0000-4000-8000-000000000004","role":"authenticated"}',true);
select is((public.get_forum_index()->>'can_moderate')::boolean,true,'Administrators moderate the forum');
select is(jsonb_array_length(public.get_forum_post_history((select (value->>'post_id')::bigint from forum_results where key='thread'))->'revisions'),1,'Moderators read earlier versions');
insert into forum_results values('pin',public.moderate_forum('pin_thread',jsonb_build_object('thread_id',(select value->>'thread_id' from forum_results where key='other')),'f0f00000-0000-4000-8000-0000000000c1','Important thread'));
select is((select value->>'message' from forum_results where key='pin'),'Thread pinned.','Moderators pin threads');
select is(public.moderate_forum('pin_thread',jsonb_build_object('thread_id',(select value->>'thread_id' from forum_results where key='other')),'f0f00000-0000-4000-8000-0000000000c1','Important thread'),
  (select value from forum_results where key='pin'),'A replayed moderator request returns its receipt');
select throws_ok($$select public.moderate_forum('pin_thread',jsonb_build_object('thread_id',(select value->>'thread_id' from forum_results where key='other')),'f0f00000-0000-4000-8000-0000000000c1','Another reason')$$,
  '22023','REQUEST_MISMATCH','A replay cannot change the reason');
select throws_ok($$select public.moderate_forum('pin_thread',jsonb_build_object('thread_id',(select value->>'thread_id' from forum_results where key='other')),gen_random_uuid(),'Pin again')$$,
  'P0001','FORUM_NO_CHANGE','A stale action reports no change');
select throws_ok($$select public.moderate_forum('pin_thread',jsonb_build_object('thread_id',(select value->>'thread_id' from forum_results where key='other')),gen_random_uuid(),'x')$$,
  '22023','INVALID_REQUEST','Moderator actions need a reason');
select throws_ok($$select public.moderate_forum('explode',jsonb_build_object('thread_id',(select value->>'thread_id' from forum_results where key='other')),gen_random_uuid(),'Unknown action')$$,
  '22023','INVALID_REQUEST','Unknown actions are rejected');
select public.moderate_forum('move_thread',jsonb_build_object('thread_id',(select value->>'thread_id' from forum_results where key='other'),'board_id','general_discussion'),gen_random_uuid(),'Belongs in general');
select is(public.get_forum_board('general_discussion')#>>'{items,0,title}','Other thread','Pinned threads come first');
select is(public.get_forum_board('general_discussion')->>'total','2','Moving adds the thread to its new board');
select is(public.get_forum_board('off_topic')->>'total','0','Moving removes the thread from its old board');
select public.moderate_forum('lock_thread',jsonb_build_object('thread_id',(select value->>'thread_id' from forum_results where key='thread')),gen_random_uuid(),'Heated discussion');
select set_config('request.jwt.claims','{"sub":"f0f00000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_ok($$select public.create_forum_post((select (value->>'thread_id')::bigint from forum_results where key='thread'),'Can I still post?',null,gen_random_uuid())$$,'42501','THREAD_LOCKED','Locked threads refuse player replies');
select is((public.get_forum_thread((select (value->>'thread_id')::bigint from forum_results where key='thread'))#>>'{thread,can_reply}')::boolean,false,'Locked threads show no reply form');
select set_config('request.jwt.claims','{"sub":"f0f00000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select throws_ok($$select public.edit_forum_post((select (value->>'post_id')::bigint from forum_results where key='thread'),'Edited while locked',null,1)$$,'42501','THREAD_LOCKED','Locked threads freeze author edits');
select set_config('request.jwt.claims','{"sub":"f0f00000-0000-4000-8000-000000000004","role":"authenticated"}',true);
insert into forum_results values('staff',public.create_forum_post((select (value->>'thread_id')::bigint from forum_results where key='thread'),'Please keep it civil.',null,gen_random_uuid()));
select is((select value->>'post_number' from forum_results where key='staff'),'3','Moderators reply in locked threads');
select public.moderate_forum('remove_post',jsonb_build_object('post_id',(select value->>'post_id' from forum_results where key='other')),gen_random_uuid(),'Only post');
select is(public.get_forum_board('general_discussion')->>'total','2','Removing the last visible post keeps the thread');
select is(public.get_forum_thread((select (value->>'thread_id')::bigint from forum_results where key='thread'))#>>'{posts,1,body}','I agree with this.','Moderators still read posts that authors deleted');
select is(public.get_forum_thread((select (value->>'thread_id')::bigint from forum_results where key='thread'))#>>'{posts,1,author,display_name}','ForumTwo','Moderators still see who deleted a post');
select public.moderate_forum('remove_post',jsonb_build_object('post_id',(select value->>'post_id' from forum_results where key='staff')),gen_random_uuid(),'Duplicate notice');
select is(public.get_forum_thread((select (value->>'thread_id')::bigint from forum_results where key='thread'))#>>'{posts,2,body}','Please keep it civil.','Moderators still read removed text');
select set_config('request.jwt.claims','{"sub":"f0f00000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is(public.get_forum_thread((select (value->>'thread_id')::bigint from forum_results where key='thread'))#>>'{posts,2,removed,by}','moderator','Players see a moderator placeholder');
select is(public.get_forum_thread((select (value->>'thread_id')::bigint from forum_results where key='thread'))#>'{posts,2,body}','null'::jsonb,'Players cannot read removed text');
select set_config('request.jwt.claims','{"sub":"f0f00000-0000-4000-8000-000000000004","role":"authenticated"}',true);
select public.moderate_forum('restore_post',jsonb_build_object('post_id',(select value->>'post_id' from forum_results where key='staff')),gen_random_uuid(),'Restored notice');
select throws_ok($$select public.moderate_forum('restore_post',jsonb_build_object('post_id',(select value->>'post_id' from forum_results where key='reply')),gen_random_uuid(),'Undo withdrawal')$$,
  'P0001','CANNOT_RESTORE','Withdrawn posts stay withdrawn');
select public.moderate_forum('edit_post',jsonb_build_object('post_id',(select value->>'post_id' from forum_results where key='thread'),'body','Moderated opening'),gen_random_uuid(),'Removed personal details');
select is((public.get_forum_thread((select (value->>'thread_id')::bigint from forum_results where key='thread'))#>>'{posts,0,edited,moderator}')::boolean,true,'Moderator edits are marked');
select public.moderate_forum('grave_thread',jsonb_build_object('thread_id',(select value->>'thread_id' from forum_results where key='other')),gen_random_uuid(),'Resolved');
select is(public.get_forum_board('graveyard')#>>'{items,0,title}','Other thread','Retired threads move to the closed board');
select is((public.get_forum_board('graveyard')#>>'{items,0,pinned}')::boolean,false,'Retired threads are unpinned');
select is((public.get_forum_board('graveyard')#>>'{items,0,locked}')::boolean,true,'Retired threads are locked');
select throws_ok($$select public.moderate_forum('grave_thread',jsonb_build_object('thread_id',(select value->>'thread_id' from forum_results where key='other')),gen_random_uuid(),'Resolved again')$$,
  'P0001','FORUM_NO_CHANGE','A retired thread cannot be retired twice');
select public.moderate_forum('remove_thread',jsonb_build_object('thread_id',(select value->>'thread_id' from forum_results where key='thread')),gen_random_uuid(),'Spam thread');
select is(public.get_forum_board('general_discussion')->>'total','0','Removed threads leave the board');
select is((public.get_forum_thread((select (value->>'thread_id')::bigint from forum_results where key='thread'))#>>'{thread,removed,by}'),'moderator','Moderators still open removed threads');
select set_config('request.jwt.claims','{"sub":"f0f00000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select throws_ok($$select public.get_forum_thread((select (value->>'thread_id')::bigint from forum_results where key='thread'))$$,'P0002','FORUM_NOT_FOUND','Players cannot open removed threads');
select throws_ok($$select public.locate_forum_post((select (value->>'post_id')::bigint from forum_results where key='thread'))$$,'P0002','FORUM_NOT_FOUND','Permalinks cannot reveal removed threads');
reset role;
select is((select post_count from private.forum_author_stats where character_id=(select id from forum_fixture where display_name='ForumOne')),0,'Removed threads leave author post counts');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f0f00000-0000-4000-8000-000000000004","role":"authenticated"}',true);
select public.moderate_forum('restore_thread',jsonb_build_object('thread_id',(select value->>'thread_id' from forum_results where key='thread')),gen_random_uuid(),'Removed by mistake');
select is(public.get_forum_board('general_discussion')->>'total','1','Restored threads return to their board');
reset role;
select is((select count(*) from private.forum_moderation_log where actor_id=(select id from forum_fixture where display_name='ForumAdmin')),10::bigint,'Every moderator action is logged once');
select is((select reason from private.forum_moderation_log where action='remove_thread'),'Spam thread','The log keeps the reason');
update private.forum_author_stats set last_post_at=null;
set local role authenticated;

-- Announcements.
insert into forum_results values('announcement',public.create_forum_thread('announcements','Patch notes','New forum is live.',gen_random_uuid()));
select set_config('request.jwt.claims','{"sub":"f0f00000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select throws_ok($$select public.create_forum_post((select (value->>'thread_id')::bigint from forum_results where key='announcement'),'Nice!',null,gen_random_uuid())$$,'42501','FORUM_READ_ONLY','Players cannot reply to announcements');
select is(public.get_forum_thread((select (value->>'thread_id')::bigint from forum_results where key='announcement'))#>>'{posts,0,author,role}','admin','Staff posts show their role');

-- Authors delete content, never the thread; the deletion hides it only from players.
select set_config('request.jwt.claims','{"sub":"f0f00000-0000-4000-8000-000000000002","role":"authenticated"}',true);
insert into forum_results values('solo',public.create_forum_thread('questions_answers','Quick question','How do I sail?',gen_random_uuid()));
select is(public.withdraw_forum_post((select (value->>'post_id')::bigint from forum_results where key='solo'))->>'post_id',(select value->>'post_id' from forum_results where key='solo'),'Authors delete their only post');
select is(public.get_forum_board('questions_answers')->>'total','1','The thread stays on its board');
select is(public.get_forum_board('questions_answers')#>>'{items,0,title}','Quick question','The thread keeps its title');
select is(public.get_forum_board('questions_answers')#>'{items,0,author}','null'::jsonb,'Lists show the deleted opening post as [deleted]');
select is((public.get_forum_board('questions_answers')#>>'{items,0,replies}')::integer,0,'A deleted opening post is not a reply');
select is(public.get_forum_thread((select (value->>'thread_id')::bigint from forum_results where key='solo'))#>'{thread,author}','null'::jsonb,'The thread header hides the deleted author');
select is(public.get_forum_thread((select (value->>'thread_id')::bigint from forum_results where key='solo'))#>>'{posts,0,removed,by}','author','The opening post keeps a placeholder');
select is(public.get_forum_thread((select (value->>'thread_id')::bigint from forum_results where key='solo'))#>'{posts,0,body}','null'::jsonb,'Players cannot read the deleted text');
select set_config('request.jwt.claims','{"sub":"f0f00000-0000-4000-8000-000000000004","role":"authenticated"}',true);
select is(public.get_forum_thread((select (value->>'thread_id')::bigint from forum_results where key='solo'))#>>'{posts,0,body}','How do I sail?','Moderators read the deleted text');
select is(public.get_forum_board('questions_answers')#>>'{items,0,author,display_name}','ForumTwo','Moderator lists still name the author');
select is(public.get_forum_thread((select (value->>'thread_id')::bigint from forum_results where key='solo'))#>>'{thread,author,display_name}','ForumTwo','The moderator thread header names the author');
select throws_ok($$select public.moderate_forum('restore_post',jsonb_build_object('post_id',(select value->>'post_id' from forum_results where key='solo')),gen_random_uuid(),'Restore it')$$,
  'P0001','CANNOT_RESTORE','Author deletions cannot be restored by moderators');

-- Limits.
reset role;
update private.forum_author_stats set last_post_at=null;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f0f00000-0000-4000-8000-000000000003","role":"authenticated"}',true);
reset role;
do $limits$ begin
  for i in 2..5 loop
    update private.forum_author_stats set last_post_at=null;
    perform public.create_forum_thread('fun_games','Game '||i,'Round '||i,gen_random_uuid());
  end loop;
  update private.forum_author_stats set last_post_at=null;
end $limits$;
set local role authenticated;
select throws_ok($$select public.create_forum_thread('fun_games','Game 6','Round 6',gen_random_uuid())$$,'P0001','FORUM_THREAD_LIMIT','New threads per hour are limited');

-- Pages.
select set_config('request.jwt.claims','{"sub":"f0f00000-0000-4000-8000-000000000001","role":"authenticated"}',true);
reset role;
update private.forum_author_stats set last_post_at=null;
insert into forum_results values('long',public.create_forum_thread('tutorials_guides','Long guide','Part 1',gen_random_uuid()));
do $pages$ begin
  for i in 2..45 loop
    update private.forum_author_stats set last_post_at=null;
    perform public.create_forum_post((select (value->>'thread_id')::bigint from forum_results where key='long'),'Part '||i,null,gen_random_uuid());
  end loop;
end $pages$;
set local role authenticated;
select is((public.get_forum_thread((select (value->>'thread_id')::bigint from forum_results where key='long'))->>'page_count')::integer,3,'Threads split into pages of 20 posts');
select is(public.get_forum_thread((select (value->>'thread_id')::bigint from forum_results where key='long'),1)#>>'{posts,0,number}','21','The second page starts at post 21');
select is(public.get_forum_thread((select (value->>'thread_id')::bigint from forum_results where key='long'),99)->>'page','2','Pages clamp to the last page');
select is(jsonb_array_length(public.get_forum_thread((select (value->>'thread_id')::bigint from forum_results where key='long'),2)->'posts'),5,'The last page is bounded');
select is(public.locate_forum_post((select (p->>'id')::bigint from jsonb_array_elements(public.get_forum_thread((select (value->>'thread_id')::bigint from forum_results where key='long'),1)->'posts') p where p->>'number'='30'))->>'page','1','Permalinks resolve their page');
select throws_ok($$select public.get_forum_board('tutorials_guides',-1)$$,'22023','INVALID_REQUEST','Negative pages are rejected');
select throws_ok($$select public.locate_forum_post(1,1)$$,'22023','INVALID_REQUEST','Locate takes a post or a thread');

-- Marking boards read.
select set_config('request.jwt.claims','{"sub":"f0f00000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is((public.get_forum_board('tutorials_guides')#>>'{items,0,unread}')::boolean,true,'Unread before marking the board');
select public.mark_forum_board_read('tutorials_guides');
select is((public.get_forum_board('tutorials_guides')#>>'{items,0,unread}')::boolean,false,'Marking a board read clears its threads');
select is((select b->>'unread' from jsonb_array_elements(public.get_forum_index()->'boards') b where b->>'id'='tutorials_guides'),'false','The index follows the board mark');
select public.mark_forum_board_read();
select ok(not exists(select 1 from jsonb_array_elements(public.get_forum_index()->'boards') b where (b->>'unread')::boolean),'Marking all boards clears every board');
select throws_ok($$select public.mark_forum_board_read('missing')$$,'P0002','FORUM_NOT_FOUND','Unknown boards cannot be marked');

-- Inactive boards are hidden from players but not from moderators.
reset role;
update private.forum_boards set active=false where id='tutorials_guides';
set local role authenticated;
select throws_ok($$select public.get_forum_board('tutorials_guides')$$,'P0002','FORUM_NOT_FOUND','Inactive boards are hidden');
select throws_ok($$select public.get_forum_thread((select (value->>'thread_id')::bigint from forum_results where key='long'))$$,'P0002','FORUM_NOT_FOUND','Threads in inactive boards are hidden');
select set_config('request.jwt.claims','{"sub":"f0f00000-0000-4000-8000-000000000004","role":"authenticated"}',true);
select is(public.get_forum_board('tutorials_guides')->>'total','1','Moderators still open inactive boards');
reset role;
update private.forum_boards set active=true where id='tutorials_guides';

-- Deleted characters keep their posts under the saved name.
delete from auth.users where id='f0f00000-0000-4000-8000-000000000003';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f0f00000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is((select t->'author'->>'deleted' from jsonb_array_elements(public.get_forum_board('fun_games')->'items') t limit 1),'true','Deleted authors are marked');
select is((select t->'author'->>'display_name' from jsonb_array_elements(public.get_forum_board('fun_games')->'items') t limit 1),'ForumThree','Deleted authors keep their name');
reset role;

-- Counters match the stored rows after every action above.
select is((select count(*) from private.forum_boards b where b.thread_count<>(select count(*) from private.forum_threads t where t.board_id=b.id and t.removed_at is null)),0::bigint,'Board thread counters match');
select is((select count(*) from private.forum_boards b where b.post_count<>(select count(*) from private.forum_posts p join private.forum_threads t on t.id=p.thread_id
  where t.board_id=b.id and t.removed_at is null and p.removed_at is null)),0::bigint,'Board post counters match');
select is((select count(*) from private.forum_threads t where t.post_count<>(select count(*) from private.forum_posts p where p.thread_id=t.id and p.removed_at is null)),0::bigint,'Thread post counters match');
select is((select count(*) from private.forum_threads t where t.removed_at is null and t.last_post_id<>(select p.id from private.forum_posts p where p.thread_id=t.id and p.removed_at is null order by p.post_number desc limit 1)),0::bigint,'Threads point at their newest visible post');
select is((select count(*) from private.forum_author_stats s where s.post_count<>(select count(*) from private.forum_posts p join private.forum_threads t on t.id=p.thread_id
  where p.author_id=s.character_id and p.removed_at is null and t.removed_at is null)),0::bigint,'Author post counters match');
select is((select count(*) from private.forum_author_stats s where s.thread_count<>(select count(*) from private.forum_threads t where t.author_id=s.character_id and t.removed_at is null)),0::bigint,'Author thread counters match');
select is((select count(*) from private.forum_threads t where t.reader_count<(select count(*) from private.forum_thread_reads r where r.thread_id=t.id)),0::bigint,'Views count every current reader and keep deleted ones');
select * from finish();
rollback;
