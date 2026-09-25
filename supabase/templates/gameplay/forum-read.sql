-- Public header details for a post author. Deleted characters keep only their snapshot.
create or replace function private.forum_author(character_id uuid,snapshot_name text,snapshot_number bigint)
returns jsonb language sql stable security invoker set search_path='' as $$
  select private.forum_person(character_id,snapshot_name,snapshot_number)||coalesce((select jsonb_build_object(
    'level',p.character_level,'posts',coalesce(s.post_count,0),'karma',coalesce(s.karma,0),'joined_at',c.created_at,
    'role',case when exists(select 1 from private.admin_members m where m.user_id=c.user_id) then 'admin'
      when exists(select 1 from private.forum_moderators m where m.character_id=c.id) then 'moderator' end)
    from public.characters c left join public.character_profiles p on p.character_id=c.id
    left join private.forum_author_stats s on s.character_id=c.id where c.id=forum_author.character_id),
    jsonb_build_object('level',null,'posts',null,'karma',null,'joined_at',null,'role',null));
$$;
-- Deletion hides a post only from players, like Reddit's [deleted]. Moderators keep seeing who wrote it.
create or replace function private.forum_visible_person(character_id uuid,snapshot_name text,snapshot_number bigint,removed_by text,moderator boolean)
returns jsonb language sql stable security invoker set search_path='' as $$
  select case when removed_by='author' and not moderator then null else private.forum_person(character_id,snapshot_name,snapshot_number) end;
$$;
-- A thread is unread when a visible post is newer than the reader's position and baseline.
drop function if exists private.forum_thread_json(private.forum_threads,integer,timestamptz);
create or replace function private.forum_thread_json(thread private.forum_threads,read_number integer,baseline timestamptz,moderator boolean)
returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('id',thread.id::text,'title',thread.title,'board_id',thread.board_id,
    'author',private.forum_visible_person(thread.author_id,thread.author_name,thread.author_player_number,opening.removed_by,moderator),'created_at',thread.created_at,
    'replies',thread.post_count-case when opening.removed_at is null then 1 else 0 end,'views',thread.reader_count,'post_seq',thread.post_seq,
    'pinned',thread.pinned_at is not null,'locked',thread.locked_at is not null,
    'rating',case when opening.removed_at is null then opening.likes-opening.dislikes end,
    'last_post',(select jsonb_build_object('post_id',p.id::text,'post_number',p.post_number,'posted_at',p.created_at,
      'author',private.forum_visible_person(p.author_id,p.author_name,p.author_player_number,p.removed_by,moderator)) from private.forum_posts p where p.id=thread.last_post_id),
    'last_read_number',read_number,
    'unread',thread.removed_at is null and thread.last_post_at>baseline and thread.last_post_number>coalesce(read_number,0))
  from (select p.removed_at,p.removed_by,p.likes,p.dislikes from private.forum_posts p where p.thread_id=thread.id and p.post_number=1) opening;
$$;
-- Moderators see removed text so they can review and restore it. Players see no reactions on
-- removed posts; the rows stay for karma.
drop function if exists private.forum_post_json(private.forum_posts,uuid,boolean,boolean);
drop function if exists private.forum_post_json(private.forum_posts,uuid,boolean,boolean,boolean,boolean);
create or replace function private.forum_post_json(post private.forum_posts,viewer_id uuid,moderator boolean,writable boolean,reactable boolean,may_dislike boolean,may_report boolean)
returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('id',post.id::text,'number',post.post_number,
    'author',case when post.removed_by='author' and not moderator then null else private.forum_author(post.author_id,post.author_name,post.author_player_number) end,
    'created_at',post.created_at,
    'body',case when post.removed_at is null or moderator then post.body end,'format_version',post.format_version,
    'edited',case when post.edit_count>0 then jsonb_build_object('at',post.edited_at,'by',post.editor_name,'moderator',post.edited_by_moderator,'count',post.edit_count) end,
    'edit_count',post.edit_count,
    'removed',case when post.removed_at is not null then jsonb_build_object('by',post.removed_by,'at',post.removed_at) end,
    'quote',(select jsonb_build_object('post_id',q.id::text,'number',q.post_number,'author',private.forum_visible_person(q.author_id,q.author_name,q.author_player_number,q.removed_by,moderator),
      'body',case when q.removed_at is null or moderator then q.body end,'removed',q.removed_at is not null,'edited_after',coalesce(q.edited_at>post.created_at,false))
      from private.forum_posts q where q.id=post.quoted_post_id),
    'own',post.author_id is not distinct from viewer_id,
    'likes',case when post.removed_at is null or moderator then post.likes end,'dislikes',case when post.removed_at is null or moderator then post.dislikes end,
    'my_reaction',coalesce((select r.value from private.forum_reactions r where r.post_id=post.id and r.character_id=viewer_id),0),
    'ignored',exists(select 1 from private.mail_ignored i where i.character_id=viewer_id and i.ignored_id=post.author_id),
    'reported',exists(select 1 from private.forum_reports r where r.post_id=post.id and r.reporter_id=viewer_id and r.status='open'),
    'can_report',may_report and post.removed_at is null and post.author_id is distinct from viewer_id,
    'can_react',reactable and post.removed_at is null and post.author_id is distinct from viewer_id,
    'can_dislike',reactable and may_dislike and post.removed_at is null and post.author_id is distinct from viewer_id,
    'can_edit',post.author_id is not distinct from viewer_id and post.removed_at is null and writable,
    'can_withdraw',post.author_id is not distinct from viewer_id and post.removed_at is null);
$$;
revoke all on function private.forum_author(uuid,text,bigint),private.forum_visible_person(uuid,text,bigint,text,boolean),private.forum_thread_json(private.forum_threads,integer,timestamptz,boolean),
  private.forum_post_json(private.forum_posts,uuid,boolean,boolean,boolean,boolean,boolean) from public,anon,authenticated;

create or replace function private.get_forum_index()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare viewer_id uuid:=private.combat_captain(); moderator boolean:=private.forum_is_moderator(); joined timestamptz;
begin
  select created_at into joined from public.characters where id=viewer_id;
  return jsonb_build_object('can_moderate',moderator,'ban',private.forum_active_ban(viewer_id),
    'open_reports',case when moderator then (select count(distinct r.post_id) from private.forum_reports r where r.status='open') end,
    'boards',coalesce((select jsonb_agg(jsonb_build_object(
    'id',b.id,'section',b.section,'name',b.name,'description',b.description,'posting',b.posting,'active',b.active,
    'thread_count',b.thread_count,'post_count',b.post_count,
    'last_post',(select jsonb_build_object('thread_id',t.id::text,'title',t.title,'post_id',p.id::text,'post_number',p.post_number,'posted_at',p.created_at,
        'author',private.forum_visible_person(p.author_id,p.author_name,p.author_player_number,p.removed_by,moderator))
      from private.forum_threads t join private.forum_posts p on p.id=t.last_post_id
      where t.board_id=b.id and t.removed_at is null order by t.last_post_at desc,t.id desc limit 1),
    'unread',exists(select 1 from private.forum_threads t left join private.forum_thread_reads r on r.character_id=viewer_id and r.thread_id=t.id
      where t.board_id=b.id and t.removed_at is null and t.last_post_at>greatest(joined,coalesce(br.read_through,'-infinity'))
        and t.last_post_number>coalesce(r.last_read_number,0))) order by b.position)
    from private.forum_boards b left join private.forum_board_reads br on br.character_id=viewer_id and br.board_id=b.id
    where b.active or moderator),'[]'::jsonb));
end;
$$;

create or replace function private.get_forum_board(board_id text,page integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare viewer_id uuid:=private.combat_captain(); moderator boolean:=private.forum_is_moderator(); board private.forum_boards%rowtype;
  baseline timestamptz; current_page integer; items jsonb;
begin
  if get_forum_board.board_id is null or page is null or page<0 then raise exception 'INVALID_REQUEST' using errcode='22023'; end if;
  select * into board from private.forum_boards b where b.id=get_forum_board.board_id;
  if not found or not (board.active or moderator) then raise exception 'FORUM_NOT_FOUND' using errcode='P0002'; end if;
  select greatest(c.created_at,coalesce(br.read_through,'-infinity')) into baseline from public.characters c
    left join private.forum_board_reads br on br.character_id=c.id and br.board_id=board.id where c.id=viewer_id;
  current_page:=least(page,greatest(0,(board.thread_count-1)/{{gameplay.forum.threadsPageSize}}));
  select coalesce(jsonb_agg(private.forum_thread_json(t,r.last_read_number,baseline,moderator) order by t.pinned_at is not null desc,t.last_post_at desc,t.id desc),'[]'::jsonb) into items
    from (select * from private.forum_threads x where x.board_id=board.id and x.removed_at is null
      order by x.pinned_at is not null desc,x.last_post_at desc,x.id desc limit {{gameplay.forum.threadsPageSize}} offset current_page*{{gameplay.forum.threadsPageSize}}) t
    left join private.forum_thread_reads r on r.character_id=viewer_id and r.thread_id=t.id;
  return jsonb_build_object('board',jsonb_build_object('id',board.id,'section',board.section,'name',board.name,'description',board.description,
      'posting',board.posting,'active',board.active,'can_post',board.active and private.forum_can_post(board.posting,moderator) and private.forum_active_ban(viewer_id) is null),
    'items',items,'total',board.thread_count,'page',current_page,'page_size',{{gameplay.forum.threadsPageSize}},'can_moderate',moderator,'ban',private.forum_active_ban(viewer_id));
end;
$$;

create or replace function private.get_forum_thread(thread_id bigint,page integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare viewer_id uuid:=private.combat_captain(); moderator boolean:=private.forum_is_moderator(); thread private.forum_threads%rowtype;
  board private.forum_boards%rowtype; page_count integer; current_page integer; read_number integer; writable boolean; posts jsonb;
  reactable boolean; may_dislike boolean; may_report boolean; subscribed boolean; ban jsonb:=private.forum_active_ban(viewer_id);
begin
  if get_forum_thread.thread_id is null or page is null or page<0 then raise exception 'INVALID_REQUEST' using errcode='22023'; end if;
  select * into thread from private.forum_threads t where t.id=get_forum_thread.thread_id;
  select * into board from private.forum_boards b where b.id=thread.board_id;
  if thread.id is null or ((thread.removed_at is not null or not board.active) and not moderator) then raise exception 'FORUM_NOT_FOUND' using errcode='P0002'; end if;
  page_count:=greatest(1,ceil(thread.post_seq::numeric/{{gameplay.forum.postsPageSize}})::integer);
  current_page:=least(page,page_count-1);
  select r.last_read_number into read_number from private.forum_thread_reads r where r.character_id=viewer_id and r.thread_id=thread.id;
  -- A banned captain keeps reading, deleting and subscribing, but cannot write, react or report.
  writable:=ban is null and thread.removed_at is null and board.active and private.forum_can_post(board.posting,moderator) and (thread.locked_at is null or moderator);
  reactable:=ban is null and thread.removed_at is null and board.active and board.posting='open' and thread.locked_at is null;
  select c.created_at<=statement_timestamp()-make_interval(hours=>{{gameplay.forum.newCharacterHours}}) into may_dislike from public.characters c where c.id=viewer_id;
  may_report:=ban is null and may_dislike and thread.removed_at is null;
  select s.subscribed into subscribed from private.forum_subscriptions s where s.character_id=viewer_id and s.thread_id=thread.id;
  select coalesce(jsonb_agg(private.forum_post_json(p,viewer_id,moderator,writable,reactable,may_dislike,may_report) order by p.post_number),'[]'::jsonb) into posts
    from private.forum_posts p where p.thread_id=thread.id
      and p.post_number between current_page*{{gameplay.forum.postsPageSize}}+1 and (current_page+1)*{{gameplay.forum.postsPageSize}};
  return jsonb_build_object('thread',jsonb_build_object('id',thread.id::text,'title',thread.title,
      'board',jsonb_build_object('id',board.id,'name',board.name,'section',board.section,'posting',board.posting),
      'author',private.forum_visible_person(thread.author_id,thread.author_name,thread.author_player_number,
        (select p.removed_by from private.forum_posts p where p.thread_id=thread.id and p.post_number=1),moderator),'created_at',thread.created_at,
      'pinned',thread.pinned_at is not null,'locked',thread.locked_at is not null,
      'removed',case when thread.removed_at is not null then jsonb_build_object('by',thread.removed_by,'at',thread.removed_at) end,
      'post_count',thread.post_count,'post_seq',thread.post_seq,'views',thread.reader_count,'last_read_number',read_number,
      'can_reply',writable,'can_moderate',moderator,'subscribed',coalesce(subscribed,false)),
    'posts',posts,'page',current_page,'page_count',page_count,'page_size',{{gameplay.forum.postsPageSize}},'ban',ban);
end;
$$;

-- Resolves permalinks and first-unread links to a thread and post number.
create or replace function private.locate_forum_post(post_id bigint default null,thread_id bigint default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare viewer_id uuid:=private.combat_captain(); moderator boolean:=private.forum_is_moderator(); thread private.forum_threads%rowtype;
  board_active boolean; target integer; target_thread bigint;
begin
  if (locate_forum_post.post_id is null)=(locate_forum_post.thread_id is null) then raise exception 'INVALID_REQUEST' using errcode='22023'; end if;
  if locate_forum_post.post_id is not null then
    select p.thread_id,p.post_number into target_thread,target from private.forum_posts p where p.id=locate_forum_post.post_id;
    select * into thread from private.forum_threads t where t.id=target_thread;
  else
    select * into thread from private.forum_threads t where t.id=locate_forum_post.thread_id;
    select coalesce(min(p.post_number),thread.last_post_number) into target from private.forum_posts p
      where p.thread_id=thread.id and p.removed_at is null and p.post_number>coalesce((select r.last_read_number from private.forum_thread_reads r
        where r.character_id=viewer_id and r.thread_id=thread.id),0);
  end if;
  select b.active into board_active from private.forum_boards b where b.id=thread.board_id;
  if thread.id is null or ((thread.removed_at is not null or not board_active) and not moderator) then raise exception 'FORUM_NOT_FOUND' using errcode='P0002'; end if;
  return jsonb_build_object('thread_id',thread.id::text,'post_number',greatest(target,1),'page',(greatest(target,1)-1)/{{gameplay.forum.postsPageSize}});
end;
$$;

-- Earlier versions of an edited post, oldest first, for moderators.
create or replace function private.get_forum_post_history(post_id bigint)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare post private.forum_posts%rowtype;
begin
  perform private.combat_captain();
  if not private.forum_is_moderator() then raise exception 'FORUM_FORBIDDEN' using errcode='42501'; end if;
  select * into post from private.forum_posts p where p.id=get_forum_post_history.post_id;
  if not found then raise exception 'FORUM_NOT_FOUND' using errcode='P0002'; end if;
  return jsonb_build_object('post_id',post.id::text,'revisions',coalesce((select jsonb_agg(jsonb_build_object('revision',r.revision,'title',r.title,
    'body',r.body,'replaced_at',r.replaced_at,'editor',(select c.display_name from public.characters c where c.id=r.editor_id)) order by r.revision)
    from private.forum_post_revisions r where r.post_id=post.id),'[]'::jsonb));
end;
$$;

-- Words, "phrases", -exclusions and an author filter. Deleted and removed content never matches,
-- so a search by author cannot reveal what someone deleted.
create or replace function private.search_forums(query text,author text default null,board_id text default null,threads_only boolean default false,page integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare moderator boolean:=private.forum_is_moderator(); search tsquery; author_filter uuid; total bigint; current_page integer; items jsonb;
begin
  perform private.combat_captain();
  if query is null or length(query)>200 or threads_only is null or page is null or page<0 or (author is not null and length(author)>40)
    or (search_forums.board_id is not null and search_forums.board_id !~ '^[a-z][a-z0-9_]{0,47}$') then
    raise exception 'INVALID_REQUEST' using errcode='22023'; end if;
  if btrim(query)<>'' then search:=websearch_to_tsquery('simple',query); end if;
  if search is not null and numnode(search)=0 then search:=null; end if;
  if author is not null then
    select c.id into author_filter from public.characters c
      where (author ~ '^#?[1-9][0-9]{0,15}$' and c.player_number=ltrim(author,'#')::bigint) or c.name_key=lower(author);
    if author_filter is null then return jsonb_build_object('items','[]'::jsonb,'total',0,'page',0,'page_size',{{gameplay.forum.searchPageSize}}); end if;
  end if;
  if search is null and author_filter is null then raise exception 'INVALID_REQUEST' using errcode='22023'; end if;
  select count(*) into total from private.forum_posts p join private.forum_threads t on t.id=p.thread_id join private.forum_boards b on b.id=t.board_id
    where p.removed_at is null and t.removed_at is null and (b.active or moderator)
      and (search_forums.board_id is null or t.board_id=search_forums.board_id) and (author_filter is null or p.author_id=author_filter)
      and (not threads_only or p.post_number=1)
      and (search is null or p.search_vector@@search or (p.post_number=1 and t.search_vector@@search));
  current_page:=least(page,greatest(0,(total-1)/{{gameplay.forum.searchPageSize}})::integer);
  select coalesce(jsonb_agg(row.item order by row.id desc),'[]'::jsonb) into items from (
    select p.id,jsonb_build_object('post_id',p.id::text,'post_number',p.post_number,'created_at',p.created_at,'excerpt',left(p.body,300),
      'author',private.forum_person(p.author_id,p.author_name,p.author_player_number),
      'thread',jsonb_build_object('id',t.id::text,'title',t.title),'board',jsonb_build_object('id',b.id,'name',b.name)) item
    from private.forum_posts p join private.forum_threads t on t.id=p.thread_id join private.forum_boards b on b.id=t.board_id
    where p.removed_at is null and t.removed_at is null and (b.active or moderator)
      and (search_forums.board_id is null or t.board_id=search_forums.board_id) and (author_filter is null or p.author_id=author_filter)
      and (not threads_only or p.post_number=1)
      and (search is null or p.search_vector@@search or (p.post_number=1 and t.search_vector@@search))
    order by p.id desc limit {{gameplay.forum.searchPageSize}} offset current_page*{{gameplay.forum.searchPageSize}}
  ) row;
  return jsonb_build_object('items',items,'total',total,'page',current_page,'page_size',{{gameplay.forum.searchPageSize}});
end;
$$;

-- Subscribed threads with the number of visible posts after the reader's position.
create or replace function private.get_forum_subscriptions(page integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare viewer_id uuid:=private.combat_captain(); moderator boolean:=private.forum_is_moderator(); total bigint; current_page integer; items jsonb;
begin
  if page is null or page<0 then raise exception 'INVALID_REQUEST' using errcode='22023'; end if;
  select count(*) into total from private.forum_subscriptions s join private.forum_threads t on t.id=s.thread_id join private.forum_boards b on b.id=t.board_id
    where s.character_id=viewer_id and s.subscribed and t.removed_at is null and (b.active or moderator);
  current_page:=least(page,greatest(0,(total-1)/{{gameplay.forum.threadsPageSize}})::integer);
  select coalesce(jsonb_agg(row.item order by row.last_post_at desc,row.id desc),'[]'::jsonb) into items from (
    select t.id,t.last_post_at,private.forum_thread_json(t,r.last_read_number,'-infinity',moderator)||jsonb_build_object(
      'board',jsonb_build_object('id',b.id,'name',b.name),
      'new_posts',(select count(*) from private.forum_posts p where p.thread_id=t.id and p.removed_at is null and p.post_number>coalesce(r.last_read_number,0))) item
    from private.forum_subscriptions s join private.forum_threads t on t.id=s.thread_id join private.forum_boards b on b.id=t.board_id
      left join private.forum_thread_reads r on r.character_id=viewer_id and r.thread_id=t.id
    where s.character_id=viewer_id and s.subscribed and t.removed_at is null and (b.active or moderator)
    order by t.last_post_at desc,t.id desc limit {{gameplay.forum.threadsPageSize}} offset current_page*{{gameplay.forum.threadsPageSize}}
  ) row;
  return jsonb_build_object('items',items,'total',total,'page',current_page,'page_size',{{gameplay.forum.threadsPageSize}});
end;
$$;

-- Visible posts and threads for a profile.
create or replace function private.get_forum_author_stats(player_number bigint)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare target uuid;
begin
  perform private.combat_captain();
  select c.id into target from public.characters c where c.player_number=get_forum_author_stats.player_number;
  if target is null then raise exception 'FORUM_NOT_FOUND' using errcode='P0002'; end if;
  return coalesce((select jsonb_build_object('post_count',s.post_count,'thread_count',s.thread_count,'karma',s.karma) from private.forum_author_stats s where s.character_id=target),
    jsonb_build_object('post_count',0,'thread_count',0,'karma',0));
end;
$$;

create or replace function public.get_forum_index()
returns jsonb language sql stable security invoker set search_path='' as $$ select private.get_forum_index(); $$;
create or replace function public.get_forum_board(board_id text,page integer default 0)
returns jsonb language sql stable security invoker set search_path='' as $$ select private.get_forum_board(board_id,page); $$;
create or replace function public.get_forum_thread(thread_id bigint,page integer default 0)
returns jsonb language sql stable security invoker set search_path='' as $$ select private.get_forum_thread(thread_id,page); $$;
create or replace function public.locate_forum_post(post_id bigint default null,thread_id bigint default null)
returns jsonb language sql stable security invoker set search_path='' as $$ select private.locate_forum_post(post_id,thread_id); $$;
create or replace function public.get_forum_post_history(post_id bigint)
returns jsonb language sql stable security invoker set search_path='' as $$ select private.get_forum_post_history(post_id); $$;
create or replace function public.search_forums(query text,author text default null,board_id text default null,threads_only boolean default false,page integer default 0)
returns jsonb language sql stable security invoker set search_path='' as $$ select private.search_forums(query,author,board_id,threads_only,page); $$;
create or replace function public.get_forum_subscriptions(page integer default 0)
returns jsonb language sql stable security invoker set search_path='' as $$ select private.get_forum_subscriptions(page); $$;
create or replace function public.get_forum_author_stats(player_number bigint)
returns jsonb language sql stable security invoker set search_path='' as $$ select private.get_forum_author_stats(player_number); $$;
revoke all on function private.get_forum_index(),public.get_forum_index(),private.get_forum_board(text,integer),public.get_forum_board(text,integer),
  private.get_forum_thread(bigint,integer),public.get_forum_thread(bigint,integer),private.locate_forum_post(bigint,bigint),public.locate_forum_post(bigint,bigint),
  private.get_forum_post_history(bigint),public.get_forum_post_history(bigint),private.search_forums(text,text,text,boolean,integer),public.search_forums(text,text,text,boolean,integer),
  private.get_forum_subscriptions(integer),public.get_forum_subscriptions(integer),private.get_forum_author_stats(bigint),public.get_forum_author_stats(bigint)
  from public,anon,authenticated;
grant execute on function private.get_forum_index(),public.get_forum_index(),private.get_forum_board(text,integer),public.get_forum_board(text,integer),
  private.get_forum_thread(bigint,integer),public.get_forum_thread(bigint,integer),private.locate_forum_post(bigint,bigint),public.locate_forum_post(bigint,bigint),
  private.get_forum_post_history(bigint),public.get_forum_post_history(bigint),private.search_forums(text,text,text,boolean,integer),public.search_forums(text,text,text,boolean,integer),
  private.get_forum_subscriptions(integer),public.get_forum_subscriptions(integer),private.get_forum_author_stats(bigint),public.get_forum_author_stats(bigint)
  to authenticated;
