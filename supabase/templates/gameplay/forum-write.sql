create or replace function private.forum_post_receipt(post private.forum_posts)
returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('thread_id',post.thread_id::text,'post_id',post.id::text,'post_number',post.post_number,'created_at',post.created_at);
$$;
-- The original text decides whether a replayed request matches, even after later edits.
create or replace function private.forum_original(post private.forum_posts,thread_title text default null)
returns jsonb language sql stable security invoker set search_path='' as $$
  select coalesce((select jsonb_build_object('title',r.title,'body',r.body) from private.forum_post_revisions r where r.post_id=post.id and r.revision=0),
    jsonb_build_object('title',thread_title,'body',post.body));
$$;
-- Callers hold the author's character lock, which serializes these checks.
create or replace function private.forum_check_cooldown(author uuid,observed timestamptz)
returns void language plpgsql stable security invoker set search_path='' as $$
declare previous timestamptz;
begin
  select last_post_at into previous from private.forum_author_stats where character_id=author;
  if previous>observed-make_interval(secs=>{{gameplay.forum.postCooldownSeconds}}) then
    raise exception 'FORUM_COOLDOWN' using errcode='P0001',
      detail=greatest(1,ceil(extract(epoch from previous+make_interval(secs=>{{gameplay.forum.postCooldownSeconds}})-observed)))::integer::text;
  end if;
end;
$$;
create or replace function private.forum_count_new_post(author uuid,observed timestamptz,new_thread boolean)
returns void language sql volatile security invoker set search_path='' as $$
  insert into private.forum_author_stats(character_id,thread_count,post_count,last_post_at) values(author,case when new_thread then 1 else 0 end,1,observed)
    on conflict(character_id) do update set thread_count=private.forum_author_stats.thread_count+excluded.thread_count,
      post_count=private.forum_author_stats.post_count+1,last_post_at=excluded.last_post_at;
$$;
-- Read positions only move forward. A first read counts one unique reader and locks
-- the thread before the read row, the same order posting uses.
create or replace function private.forum_mark_read(reader uuid,target_thread bigint,through_number integer)
returns void language plpgsql volatile security invoker set search_path='' as $$
begin
  update private.forum_thread_reads set last_read_number=through_number,read_at=clock_timestamp()
    where character_id=reader and thread_id=target_thread and last_read_number<through_number;
  if found or exists(select 1 from private.forum_thread_reads where character_id=reader and thread_id=target_thread) then return; end if;
  perform 1 from private.forum_threads where id=target_thread for no key update;
  insert into private.forum_thread_reads(character_id,thread_id,last_read_number) values(reader,target_thread,through_number)
    on conflict(character_id,thread_id) do nothing;
  if found then
    update private.forum_threads set reader_count=reader_count+1 where id=target_thread;
  else
    update private.forum_thread_reads set last_read_number=through_number,read_at=clock_timestamp()
      where character_id=reader and thread_id=target_thread and last_read_number<through_number;
  end if;
end;
$$;
revoke all on function private.forum_post_receipt(private.forum_posts),private.forum_original(private.forum_posts,text),
  private.forum_check_cooldown(uuid,timestamptz),private.forum_count_new_post(uuid,timestamptz,boolean),private.forum_mark_read(uuid,bigint,integer)
  from public,anon,authenticated;

-- Lock order for forum writes: author character, thread, board, author statistics.
create or replace function private.create_forum_thread(board_id text,thread_title text,post_body text,request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare viewer_id uuid:=private.combat_captain(); moderator boolean:=private.forum_is_moderator(); observed timestamptz;
  new_body text; new_title text; original jsonb; board private.forum_boards%rowtype; actor public.characters%rowtype;
  thread private.forum_threads%rowtype; post private.forum_posts%rowtype;
begin
  if create_forum_thread.request_id is null or create_forum_thread.board_id is null or thread_title is null or post_body is null then
    raise exception 'INVALID_POST' using errcode='22023'; end if;
  new_body:=private.forum_normalize(post_body); new_title:=btrim(thread_title);
  perform 1 from public.characters where id=viewer_id for no key update;
  -- A confirmed request stays confirmable after later limit, board or permission changes.
  select * into thread from private.forum_threads t where t.author_id=viewer_id and t.request_id=create_forum_thread.request_id;
  if found then
    select * into post from private.forum_posts p where p.thread_id=thread.id and p.post_number=1;
    original:=private.forum_original(post,thread.title);
    if original->>'title'<>new_title or original->>'body'<>new_body then raise exception 'REQUEST_MISMATCH' using errcode='22023'; end if;
    return private.forum_post_receipt(post);
  end if;
  if not private.forum_valid_title(new_title) or not private.forum_valid_body(new_body) then raise exception 'INVALID_POST' using errcode='22023'; end if;
  select * into board from private.forum_boards b where b.id=create_forum_thread.board_id;
  if not found or not (board.active or moderator) then raise exception 'FORUM_NOT_FOUND' using errcode='P0002'; end if;
  if not private.forum_can_post(board.posting,moderator) then raise exception 'FORUM_READ_ONLY' using errcode='42501'; end if;
  observed:=clock_timestamp();
  perform private.forum_check_cooldown(viewer_id,observed);
  if (select count(*) from private.forum_threads t where t.author_id=viewer_id and t.created_at>observed-interval '1 hour')>={{gameplay.forum.threadsPerHour}} then
    raise exception 'FORUM_THREAD_LIMIT' using errcode='P0001'; end if;
  if exists(select 1 from private.forum_threads t where t.author_id=viewer_id and t.board_id=board.id and t.title=new_title and t.removed_at is null
    and t.created_at>observed-make_interval(mins=>{{gameplay.forum.duplicateWindowMinutes}})) then raise exception 'DUPLICATE_POST' using errcode='P0001'; end if;
  select * into actor from public.characters where id=viewer_id;
  insert into private.forum_threads(board_id,author_id,author_name,author_player_number,title,request_id,created_at,post_seq,post_count,last_post_number,last_post_at)
    values(board.id,viewer_id,actor.display_name,actor.player_number,new_title,create_forum_thread.request_id,observed,1,1,1,observed) returning * into thread;
  insert into private.forum_posts(thread_id,post_number,author_id,author_name,author_player_number,body,request_id,created_at)
    values(thread.id,1,viewer_id,actor.display_name,actor.player_number,new_body,create_forum_thread.request_id,observed) returning * into post;
  update private.forum_threads set last_post_id=post.id where id=thread.id;
  update private.forum_boards set thread_count=thread_count+1,post_count=post_count+1 where id=board.id;
  perform private.forum_count_new_post(viewer_id,observed,true);
  perform private.forum_mark_read(viewer_id,thread.id,1);
  perform private.record_character_action(viewer_id);
  return private.forum_post_receipt(post);
end;
$$;

create or replace function private.create_forum_post(thread_id bigint,post_body text,quoted_post_id bigint,request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare viewer_id uuid:=private.combat_captain(); moderator boolean:=private.forum_is_moderator(); observed timestamptz; new_body text;
  board private.forum_boards%rowtype; actor public.characters%rowtype; thread private.forum_threads%rowtype; post private.forum_posts%rowtype;
begin
  if create_forum_post.request_id is null or create_forum_post.thread_id is null or post_body is null then raise exception 'INVALID_POST' using errcode='22023'; end if;
  new_body:=private.forum_normalize(post_body);
  perform 1 from public.characters where id=viewer_id for no key update;
  select * into post from private.forum_posts p where p.author_id=viewer_id and p.request_id=create_forum_post.request_id;
  if found then
    if post.thread_id<>create_forum_post.thread_id or post.quoted_post_id is distinct from create_forum_post.quoted_post_id
      or private.forum_original(post)->>'body'<>new_body then raise exception 'REQUEST_MISMATCH' using errcode='22023'; end if;
    return private.forum_post_receipt(post);
  end if;
  if not private.forum_valid_body(new_body) then raise exception 'INVALID_POST' using errcode='22023'; end if;
  select * into thread from private.forum_threads t where t.id=create_forum_post.thread_id for no key update;
  if not found then raise exception 'FORUM_NOT_FOUND' using errcode='P0002'; end if;
  select * into board from private.forum_boards b where b.id=thread.board_id;
  if (thread.removed_at is not null or not board.active) and not moderator then raise exception 'FORUM_NOT_FOUND' using errcode='P0002'; end if;
  if thread.removed_at is not null or not private.forum_can_post(board.posting,moderator) then raise exception 'FORUM_READ_ONLY' using errcode='42501'; end if;
  if thread.locked_at is not null and not moderator then raise exception 'THREAD_LOCKED' using errcode='42501'; end if;
  -- Quotes point to a visible post in the same thread and are shown from the original.
  if create_forum_post.quoted_post_id is not null and not exists(select 1 from private.forum_posts q
    where q.id=create_forum_post.quoted_post_id and q.thread_id=thread.id and q.removed_at is null) then
    raise exception 'INVALID_QUOTE' using errcode='22023'; end if;
  observed:=clock_timestamp();
  perform private.forum_check_cooldown(viewer_id,observed);
  if exists(select 1 from private.forum_posts p where p.author_id=viewer_id and p.thread_id=thread.id and p.body=new_body and p.removed_at is null
    and p.created_at>observed-make_interval(mins=>{{gameplay.forum.duplicateWindowMinutes}})) then raise exception 'DUPLICATE_POST' using errcode='P0001'; end if;
  select * into actor from public.characters where id=viewer_id;
  insert into private.forum_posts(thread_id,post_number,author_id,author_name,author_player_number,body,quoted_post_id,request_id,created_at)
    values(thread.id,thread.post_seq+1,viewer_id,actor.display_name,actor.player_number,new_body,create_forum_post.quoted_post_id,create_forum_post.request_id,observed)
    returning * into post;
  update private.forum_threads set post_seq=post.post_number,post_count=post_count+1,last_post_id=post.id,last_post_number=post.post_number,last_post_at=observed
    where id=thread.id;
  update private.forum_boards set post_count=post_count+1 where id=board.id;
  perform private.forum_count_new_post(viewer_id,observed,false);
  perform private.forum_mark_read(viewer_id,thread.id,post.post_number);
  perform private.record_character_action(viewer_id);
  return private.forum_post_receipt(post);
end;
$$;

-- Authors edit through here; moderator edits go through moderate_forum with a reason.
create or replace function private.edit_forum_post(post_id bigint,post_body text,thread_title text,expected_edit_count integer)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare viewer_id uuid:=private.combat_captain(); moderator boolean:=private.forum_is_moderator(); observed timestamptz:=clock_timestamp();
  new_body text; new_title text; target bigint; board private.forum_boards%rowtype; actor public.characters%rowtype;
  thread private.forum_threads%rowtype; post private.forum_posts%rowtype;
begin
  if edit_forum_post.post_id is null or post_body is null or expected_edit_count is null then raise exception 'INVALID_POST' using errcode='22023'; end if;
  new_body:=private.forum_normalize(post_body); new_title:=btrim(thread_title);
  perform 1 from public.characters where id=viewer_id for no key update;
  select p.thread_id into target from private.forum_posts p where p.id=edit_forum_post.post_id;
  if target is null then raise exception 'FORUM_NOT_FOUND' using errcode='P0002'; end if;
  select * into thread from private.forum_threads t where t.id=target for no key update;
  select * into board from private.forum_boards b where b.id=thread.board_id;
  select * into post from private.forum_posts p where p.id=edit_forum_post.post_id for no key update;
  if (thread.removed_at is not null or not board.active) and not moderator then raise exception 'FORUM_NOT_FOUND' using errcode='P0002'; end if;
  if post.author_id is distinct from viewer_id then raise exception 'FORUM_FORBIDDEN' using errcode='42501'; end if;
  if post.removed_at is not null then raise exception 'POST_REMOVED' using errcode='P0001'; end if;
  if thread.removed_at is not null or not private.forum_can_post(board.posting,moderator) or (thread.locked_at is not null and not moderator) then
    raise exception 'THREAD_LOCKED' using errcode='42501'; end if;
  if (new_title is not null and post.post_number<>1) or not private.forum_valid_body(new_body) or (new_title is not null and not private.forum_valid_title(new_title)) then
    raise exception 'INVALID_POST' using errcode='22023'; end if;
  -- Repeating a saved edit is harmless; any other stale edit is rejected.
  if post.body=new_body and (new_title is null or new_title=thread.title) then
    return jsonb_build_object('post_id',post.id::text,'edit_count',post.edit_count);
  end if;
  if post.edit_count<>expected_edit_count then raise exception 'EDIT_CONFLICT' using errcode='P0001'; end if;
  select * into actor from public.characters where id=viewer_id;
  insert into private.forum_post_revisions(post_id,revision,title,body,replaced_at,editor_id)
    values(post.id,post.edit_count,case when post.post_number=1 then thread.title end,post.body,observed,viewer_id);
  update private.forum_posts set body=new_body,edit_count=edit_count+1,edited_at=observed,editor_id=viewer_id,editor_name=actor.display_name,edited_by_moderator=false
    where id=post.id returning * into post;
  if new_title is not null and new_title<>thread.title then update private.forum_threads set title=new_title where id=thread.id; end if;
  perform private.record_character_action(viewer_id);
  return jsonb_build_object('post_id',post.id::text,'edit_count',post.edit_count);
end;
$$;

-- Authors may withdraw their posts at any time. Withdrawing the last visible post removes the thread.
create or replace function private.withdraw_forum_post(post_id bigint)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare viewer_id uuid:=private.combat_captain(); moderator boolean:=private.forum_is_moderator(); observed timestamptz:=clock_timestamp();
  target bigint; board private.forum_boards%rowtype; thread private.forum_threads%rowtype; post private.forum_posts%rowtype;
begin
  if withdraw_forum_post.post_id is null then raise exception 'INVALID_REQUEST' using errcode='22023'; end if;
  perform 1 from public.characters where id=viewer_id for no key update;
  select p.thread_id into target from private.forum_posts p where p.id=withdraw_forum_post.post_id;
  if target is null then raise exception 'FORUM_NOT_FOUND' using errcode='P0002'; end if;
  select * into thread from private.forum_threads t where t.id=target for no key update;
  select * into board from private.forum_boards b where b.id=thread.board_id;
  select * into post from private.forum_posts p where p.id=withdraw_forum_post.post_id for no key update;
  if post.author_id is distinct from viewer_id then
    if (thread.removed_at is not null or not board.active) and not moderator then raise exception 'FORUM_NOT_FOUND' using errcode='P0002'; end if;
    raise exception 'FORUM_FORBIDDEN' using errcode='42501';
  end if;
  if post.removed_at is not null or thread.removed_at is not null then
    return jsonb_build_object('post_id',post.id::text,'thread_removed',thread.removed_at is not null);
  end if;
  if thread.post_count=1 then
    perform private.forum_count_thread(thread.id,-1);
    update private.forum_posts set removed_at=observed,removed_by='author' where id=post.id;
    update private.forum_threads set post_count=0,removed_at=observed,removed_by='author' where id=thread.id;
  else
    update private.forum_posts set removed_at=observed,removed_by='author' where id=post.id;
    update private.forum_threads set post_count=post_count-1 where id=thread.id;
    if post.id=thread.last_post_id then perform private.forum_refresh_last_post(thread.id); end if;
    update private.forum_boards set post_count=post_count-1 where id=board.id;
    update private.forum_author_stats set post_count=post_count-1 where character_id=viewer_id;
  end if;
  perform private.record_character_action(viewer_id);
  return jsonb_build_object('post_id',post.id::text,'thread_removed',thread.post_count=1);
end;
$$;

create or replace function private.mark_forum_thread_read(thread_id bigint,through_number integer)
returns void language plpgsql volatile security definer set search_path='' as $$
declare viewer_id uuid:=private.combat_captain(); moderator boolean:=private.forum_is_moderator(); thread private.forum_threads%rowtype; board_active boolean;
begin
  if mark_forum_thread_read.thread_id is null or through_number is null or through_number<1 then raise exception 'INVALID_REQUEST' using errcode='22023'; end if;
  select * into thread from private.forum_threads t where t.id=mark_forum_thread_read.thread_id;
  select b.active into board_active from private.forum_boards b where b.id=thread.board_id;
  if thread.id is null or ((thread.removed_at is not null or not board_active) and not moderator) then raise exception 'FORUM_NOT_FOUND' using errcode='P0002'; end if;
  perform private.forum_mark_read(viewer_id,thread.id,least(through_number,thread.post_seq));
end;
$$;

-- Marks every current thread in one board, or in every visible board, as read.
create or replace function private.mark_forum_board_read(board_id text default null)
returns void language plpgsql volatile security definer set search_path='' as $$
declare viewer_id uuid:=private.combat_captain(); moderator boolean:=private.forum_is_moderator();
begin
  insert into private.forum_board_reads(character_id,board_id,read_through)
    select viewer_id,b.id,clock_timestamp() from private.forum_boards b
    where (mark_forum_board_read.board_id is null or b.id=mark_forum_board_read.board_id) and (b.active or moderator) order by b.id
    on conflict on constraint forum_board_reads_pkey do update set read_through=greatest(private.forum_board_reads.read_through,excluded.read_through);
  if not found and mark_forum_board_read.board_id is not null then raise exception 'FORUM_NOT_FOUND' using errcode='P0002'; end if;
end;
$$;

create or replace function public.create_forum_thread(board_id text,thread_title text,post_body text,request_id uuid)
returns jsonb language sql volatile security invoker set search_path='' as $$ select private.create_forum_thread(board_id,thread_title,post_body,request_id); $$;
create or replace function public.create_forum_post(thread_id bigint,post_body text,quoted_post_id bigint,request_id uuid)
returns jsonb language sql volatile security invoker set search_path='' as $$ select private.create_forum_post(thread_id,post_body,quoted_post_id,request_id); $$;
create or replace function public.edit_forum_post(post_id bigint,post_body text,thread_title text,expected_edit_count integer)
returns jsonb language sql volatile security invoker set search_path='' as $$ select private.edit_forum_post(post_id,post_body,thread_title,expected_edit_count); $$;
create or replace function public.withdraw_forum_post(post_id bigint)
returns jsonb language sql volatile security invoker set search_path='' as $$ select private.withdraw_forum_post(post_id); $$;
create or replace function public.mark_forum_thread_read(thread_id bigint,through_number integer)
returns void language sql volatile security invoker set search_path='' as $$ select private.mark_forum_thread_read(thread_id,through_number); $$;
create or replace function public.mark_forum_board_read(board_id text default null)
returns void language sql volatile security invoker set search_path='' as $$ select private.mark_forum_board_read(board_id); $$;
revoke all on function private.create_forum_thread(text,text,text,uuid),public.create_forum_thread(text,text,text,uuid),
  private.create_forum_post(bigint,text,bigint,uuid),public.create_forum_post(bigint,text,bigint,uuid),
  private.edit_forum_post(bigint,text,text,integer),public.edit_forum_post(bigint,text,text,integer),
  private.withdraw_forum_post(bigint),public.withdraw_forum_post(bigint),
  private.mark_forum_thread_read(bigint,integer),public.mark_forum_thread_read(bigint,integer),
  private.mark_forum_board_read(text),public.mark_forum_board_read(text) from public,anon,authenticated;
grant execute on function private.create_forum_thread(text,text,text,uuid),public.create_forum_thread(text,text,text,uuid),
  private.create_forum_post(bigint,text,bigint,uuid),public.create_forum_post(bigint,text,bigint,uuid),
  private.edit_forum_post(bigint,text,text,integer),public.edit_forum_post(bigint,text,text,integer),
  private.withdraw_forum_post(bigint),public.withdraw_forum_post(bigint),
  private.mark_forum_thread_read(bigint,integer),public.mark_forum_thread_read(bigint,integer),
  private.mark_forum_board_read(text),public.mark_forum_board_read(text) to authenticated;
