-- Public header details for a post author. Deleted characters keep only their snapshot.
create or replace function private.forum_author(character_id uuid,snapshot_name text,snapshot_number bigint)
returns jsonb language sql stable security invoker set search_path='' as $$
  select private.forum_person(character_id,snapshot_name,snapshot_number)||coalesce((select jsonb_build_object(
    'level',p.character_level,'posts',coalesce(s.post_count,0),'joined_at',c.created_at,
    'role',case when exists(select 1 from private.admin_members m where m.user_id=c.user_id) then 'admin' end)
    from public.characters c left join public.character_profiles p on p.character_id=c.id
    left join private.forum_author_stats s on s.character_id=c.id where c.id=forum_author.character_id),
    jsonb_build_object('level',null,'posts',null,'joined_at',null,'role',null));
$$;
-- A thread is unread when a visible post is newer than the reader's position and baseline.
create or replace function private.forum_thread_json(thread private.forum_threads,read_number integer,baseline timestamptz)
returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('id',thread.id::text,'title',thread.title,'board_id',thread.board_id,
    'author',private.forum_person(thread.author_id,thread.author_name,thread.author_player_number),'created_at',thread.created_at,
    'replies',greatest(thread.post_count-1,0),'views',thread.reader_count,'post_seq',thread.post_seq,
    'pinned',thread.pinned_at is not null,'locked',thread.locked_at is not null,
    'last_post',(select jsonb_build_object('post_id',p.id::text,'post_number',p.post_number,'posted_at',p.created_at,
      'author',private.forum_person(p.author_id,p.author_name,p.author_player_number)) from private.forum_posts p where p.id=thread.last_post_id),
    'last_read_number',read_number,
    'unread',thread.removed_at is null and thread.last_post_at>baseline and thread.last_post_number>coalesce(read_number,0));
$$;
-- Moderators see removed text so they can review and restore it.
create or replace function private.forum_post_json(post private.forum_posts,viewer_id uuid,moderator boolean,writable boolean)
returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('id',post.id::text,'number',post.post_number,
    'author',private.forum_author(post.author_id,post.author_name,post.author_player_number),'created_at',post.created_at,
    'body',case when post.removed_at is null or moderator then post.body end,'format_version',post.format_version,
    'edited',case when post.edit_count>0 then jsonb_build_object('at',post.edited_at,'by',post.editor_name,'moderator',post.edited_by_moderator,'count',post.edit_count) end,
    'edit_count',post.edit_count,
    'removed',case when post.removed_at is not null then jsonb_build_object('by',post.removed_by,'at',post.removed_at) end,
    'quote',(select jsonb_build_object('post_id',q.id::text,'number',q.post_number,'author',private.forum_person(q.author_id,q.author_name,q.author_player_number),
      'body',case when q.removed_at is null then q.body end,'removed',q.removed_at is not null,'edited_after',coalesce(q.edited_at>post.created_at,false))
      from private.forum_posts q where q.id=post.quoted_post_id),
    'own',post.author_id is not distinct from viewer_id,
    'can_edit',post.author_id is not distinct from viewer_id and post.removed_at is null and writable,
    'can_withdraw',post.author_id is not distinct from viewer_id and post.removed_at is null);
$$;
revoke all on function private.forum_author(uuid,text,bigint),private.forum_thread_json(private.forum_threads,integer,timestamptz),
  private.forum_post_json(private.forum_posts,uuid,boolean,boolean) from public,anon,authenticated;

create or replace function private.get_forum_index()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare viewer_id uuid:=private.combat_captain(); moderator boolean:=private.forum_is_moderator(); joined timestamptz;
begin
  select created_at into joined from public.characters where id=viewer_id;
  return jsonb_build_object('can_moderate',moderator,'boards',coalesce((select jsonb_agg(jsonb_build_object(
    'id',b.id,'section',b.section,'name',b.name,'description',b.description,'posting',b.posting,'active',b.active,
    'thread_count',b.thread_count,'post_count',b.post_count,
    'last_post',(select jsonb_build_object('thread_id',t.id::text,'title',t.title,'post_id',p.id::text,'post_number',p.post_number,'posted_at',p.created_at,
        'author',private.forum_person(p.author_id,p.author_name,p.author_player_number))
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
  select coalesce(jsonb_agg(private.forum_thread_json(t,r.last_read_number,baseline) order by t.pinned_at is not null desc,t.last_post_at desc,t.id desc),'[]'::jsonb) into items
    from (select * from private.forum_threads x where x.board_id=board.id and x.removed_at is null
      order by x.pinned_at is not null desc,x.last_post_at desc,x.id desc limit {{gameplay.forum.threadsPageSize}} offset current_page*{{gameplay.forum.threadsPageSize}}) t
    left join private.forum_thread_reads r on r.character_id=viewer_id and r.thread_id=t.id;
  return jsonb_build_object('board',jsonb_build_object('id',board.id,'section',board.section,'name',board.name,'description',board.description,
      'posting',board.posting,'active',board.active,'can_post',board.active and private.forum_can_post(board.posting,moderator)),
    'items',items,'total',board.thread_count,'page',current_page,'page_size',{{gameplay.forum.threadsPageSize}},'can_moderate',moderator);
end;
$$;

create or replace function private.get_forum_thread(thread_id bigint,page integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare viewer_id uuid:=private.combat_captain(); moderator boolean:=private.forum_is_moderator(); thread private.forum_threads%rowtype;
  board private.forum_boards%rowtype; page_count integer; current_page integer; read_number integer; writable boolean; posts jsonb;
begin
  if get_forum_thread.thread_id is null or page is null or page<0 then raise exception 'INVALID_REQUEST' using errcode='22023'; end if;
  select * into thread from private.forum_threads t where t.id=get_forum_thread.thread_id;
  select * into board from private.forum_boards b where b.id=thread.board_id;
  if thread.id is null or ((thread.removed_at is not null or not board.active) and not moderator) then raise exception 'FORUM_NOT_FOUND' using errcode='P0002'; end if;
  page_count:=greatest(1,ceil(thread.post_seq::numeric/{{gameplay.forum.postsPageSize}})::integer);
  current_page:=least(page,page_count-1);
  select r.last_read_number into read_number from private.forum_thread_reads r where r.character_id=viewer_id and r.thread_id=thread.id;
  writable:=thread.removed_at is null and board.active and private.forum_can_post(board.posting,moderator) and (thread.locked_at is null or moderator);
  select coalesce(jsonb_agg(private.forum_post_json(p,viewer_id,moderator,writable) order by p.post_number),'[]'::jsonb) into posts
    from private.forum_posts p where p.thread_id=thread.id
      and p.post_number between current_page*{{gameplay.forum.postsPageSize}}+1 and (current_page+1)*{{gameplay.forum.postsPageSize}};
  return jsonb_build_object('thread',jsonb_build_object('id',thread.id::text,'title',thread.title,
      'board',jsonb_build_object('id',board.id,'name',board.name,'section',board.section,'posting',board.posting),
      'author',private.forum_person(thread.author_id,thread.author_name,thread.author_player_number),'created_at',thread.created_at,
      'pinned',thread.pinned_at is not null,'locked',thread.locked_at is not null,
      'removed',case when thread.removed_at is not null then jsonb_build_object('by',thread.removed_by,'at',thread.removed_at) end,
      'post_count',thread.post_count,'post_seq',thread.post_seq,'views',thread.reader_count,'last_read_number',read_number,
      'can_reply',writable,'can_moderate',moderator),
    'posts',posts,'page',current_page,'page_count',page_count,'page_size',{{gameplay.forum.postsPageSize}});
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
revoke all on function private.get_forum_index(),public.get_forum_index(),private.get_forum_board(text,integer),public.get_forum_board(text,integer),
  private.get_forum_thread(bigint,integer),public.get_forum_thread(bigint,integer),private.locate_forum_post(bigint,bigint),public.locate_forum_post(bigint,bigint),
  private.get_forum_post_history(bigint),public.get_forum_post_history(bigint) from public,anon,authenticated;
grant execute on function private.get_forum_index(),public.get_forum_index(),private.get_forum_board(text,integer),public.get_forum_board(text,integer),
  private.get_forum_thread(bigint,integer),public.get_forum_thread(bigint,integer),private.locate_forum_post(bigint,bigint),public.locate_forum_post(bigint,bigint),
  private.get_forum_post_history(bigint),public.get_forum_post_history(bigint) to authenticated;
