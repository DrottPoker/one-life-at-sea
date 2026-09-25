insert into private.admin_resources(name,schema_name,table_name,editable,deletable,note) values
('forum_boards','private','forum_boards','{}',false,'Forum boards. Managed by gameplay configuration.'),
('forum_threads','private','forum_threads','{}',false,'Forum threads. Moderate them from the thread page.'),
('forum_posts','private','forum_posts','{}',false,'Forum posts, including removed text. Moderate them from the thread page.'),
('forum_post_revisions','private','forum_post_revisions','{}',false,'Earlier versions of edited forum posts.'),
('forum_moderation_log','private','forum_moderation_log','{}',false,'Forum moderator actions with reasons and receipts.') on conflict(name) do nothing;

-- One receipt per moderator request. Every action reports FORUM_NO_CHANGE instead of
-- repeating a state that a stale screen asked for.
create or replace function private.moderate_forum(action text,payload jsonb,request_id uuid,reason text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare viewer_id uuid:=private.combat_captain(); observed timestamptz:=clock_timestamp(); note text:=btrim(reason);
  actor public.characters%rowtype; previous private.forum_moderation_log%rowtype; target bigint;
  thread private.forum_threads%rowtype; post private.forum_posts%rowtype; destination private.forum_boards%rowtype;
  before_state jsonb; after_state jsonb; message text; new_body text; new_title text; result jsonb;
begin
  perform private.require_admin();
  if moderate_forum.request_id is null or action is null or payload is null or jsonb_typeof(payload)<>'object' or length(payload::text)>64000
    or note is null or length(note) not between 3 and 500 then raise exception 'INVALID_REQUEST' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(viewer_id::text||moderate_forum.request_id::text,58213));
  select * into previous from private.forum_moderation_log l where l.actor_id=viewer_id and l.request_id=moderate_forum.request_id;
  if found then
    if previous.action<>action or previous.payload<>payload or previous.reason<>note then raise exception 'REQUEST_MISMATCH' using errcode='22023'; end if;
    return previous.result;
  end if;
  if action in('pin_thread','unpin_thread','lock_thread','unlock_thread','move_thread','grave_thread','remove_thread','restore_thread') then
    if coalesce(payload->>'thread_id','') !~ '^[1-9][0-9]{0,18}$' then raise exception 'INVALID_REQUEST' using errcode='22023'; end if;
    select * into thread from private.forum_threads t where t.id=(payload->>'thread_id')::bigint for no key update;
    if not found then raise exception 'FORUM_NOT_FOUND' using errcode='P0002'; end if;
    before_state:=jsonb_build_object('board_id',thread.board_id,'pinned',thread.pinned_at is not null,'locked',thread.locked_at is not null,'removed_by',thread.removed_by);
    if thread.removed_at is not null and action<>'restore_thread' then raise exception 'THREAD_REMOVED' using errcode='P0001'; end if;
    if action='pin_thread' then
      if thread.pinned_at is not null then raise exception 'FORUM_NO_CHANGE' using errcode='P0001'; end if;
      update private.forum_threads set pinned_at=observed where id=thread.id; message:='Thread pinned.';
    elsif action='unpin_thread' then
      if thread.pinned_at is null then raise exception 'FORUM_NO_CHANGE' using errcode='P0001'; end if;
      update private.forum_threads set pinned_at=null where id=thread.id; message:='Thread unpinned.';
    elsif action='lock_thread' then
      if thread.locked_at is not null then raise exception 'FORUM_NO_CHANGE' using errcode='P0001'; end if;
      update private.forum_threads set locked_at=observed where id=thread.id; message:='Thread locked.';
    elsif action='unlock_thread' then
      if thread.locked_at is null then raise exception 'FORUM_NO_CHANGE' using errcode='P0001'; end if;
      update private.forum_threads set locked_at=null where id=thread.id; message:='Thread unlocked.';
    elsif action in('move_thread','grave_thread') then
      if action='move_thread' then
        select * into destination from private.forum_boards b where b.id=payload->>'board_id';
      else
        select * into destination from private.forum_boards b where b.posting='closed' order by b.position limit 1;
      end if;
      if destination.id is null then raise exception 'FORUM_NOT_FOUND' using errcode='P0002'; end if;
      if destination.id=thread.board_id and (action='move_thread' or thread.locked_at is not null) then raise exception 'FORUM_NO_CHANGE' using errcode='P0001'; end if;
      if destination.id<>thread.board_id then
        perform 1 from private.forum_boards b where b.id in(thread.board_id,destination.id) order by b.id for no key update;
        update private.forum_boards set thread_count=thread_count-1,post_count=post_count-thread.post_count where id=thread.board_id;
        update private.forum_boards set thread_count=thread_count+1,post_count=post_count+thread.post_count where id=destination.id;
      end if;
      -- Graveyard threads are closed for good: moved, locked and no longer pinned.
      update private.forum_threads set board_id=destination.id,
        locked_at=case when action='grave_thread' then coalesce(locked_at,observed) else locked_at end,
        pinned_at=case when action='grave_thread' then null else pinned_at end where id=thread.id;
      message:=case when action='grave_thread' then 'Thread moved to '||destination.name||' and locked.' else 'Thread moved to '||destination.name||'.' end;
    elsif action='remove_thread' then
      perform private.forum_count_thread(thread.id,-1);
      update private.forum_threads set removed_at=observed,removed_by='moderator' where id=thread.id; message:='Thread removed.';
    else
      if thread.removed_at is null then raise exception 'FORUM_NO_CHANGE' using errcode='P0001'; end if;
      update private.forum_threads set removed_at=null,removed_by=null where id=thread.id;
      perform private.forum_count_thread(thread.id,1); message:='Thread restored.';
    end if;
    select * into thread from private.forum_threads t where t.id=thread.id;
    after_state:=jsonb_build_object('board_id',thread.board_id,'pinned',thread.pinned_at is not null,'locked',thread.locked_at is not null,'removed_by',thread.removed_by);
  elsif action in('remove_post','restore_post','edit_post') then
    if coalesce(payload->>'post_id','') !~ '^[1-9][0-9]{0,18}$' then raise exception 'INVALID_REQUEST' using errcode='22023'; end if;
    select p.thread_id into target from private.forum_posts p where p.id=(payload->>'post_id')::bigint;
    if target is null then raise exception 'FORUM_NOT_FOUND' using errcode='P0002'; end if;
    select * into thread from private.forum_threads t where t.id=target for no key update;
    select * into post from private.forum_posts p where p.id=(payload->>'post_id')::bigint for no key update;
    before_state:=jsonb_build_object('removed_by',post.removed_by,'edit_count',post.edit_count);
    if action='remove_post' then
      if post.removed_at is not null then raise exception 'FORUM_NO_CHANGE' using errcode='P0001'; end if;
      update private.forum_posts set removed_at=observed,removed_by='moderator' where id=post.id;
      update private.forum_threads set post_count=post_count-1 where id=thread.id;
      if post.id=thread.last_post_id then perform private.forum_refresh_last_post(thread.id); end if;
      if thread.removed_at is null then
        update private.forum_boards set post_count=post_count-1 where id=thread.board_id;
        update private.forum_author_stats set post_count=post_count-1 where character_id=post.author_id;
      end if;
      message:='Post removed.';
    elsif action='restore_post' then
      if post.removed_at is null then raise exception 'FORUM_NO_CHANGE' using errcode='P0001'; end if;
      if post.removed_by<>'moderator' then raise exception 'CANNOT_RESTORE' using errcode='P0001'; end if;
      update private.forum_posts set removed_at=null,removed_by=null where id=post.id;
      update private.forum_threads set post_count=post_count+1 where id=thread.id;
      perform private.forum_refresh_last_post(thread.id);
      if thread.removed_at is null then
        update private.forum_boards set post_count=post_count+1 where id=thread.board_id;
        if post.author_id is not null then
          insert into private.forum_author_stats(character_id,post_count) values(post.author_id,1)
            on conflict(character_id) do update set post_count=private.forum_author_stats.post_count+1;
        end if;
      end if;
      message:='Post restored.';
    else
      new_body:=private.forum_normalize(payload->>'body'); new_title:=btrim(payload->>'title');
      if post.removed_at is not null then raise exception 'POST_REMOVED' using errcode='P0001'; end if;
      if (new_title is not null and post.post_number<>1) or not private.forum_valid_body(new_body) or (new_title is not null and not private.forum_valid_title(new_title)) then
        raise exception 'INVALID_POST' using errcode='22023'; end if;
      if post.body=new_body and (new_title is null or new_title=thread.title) then raise exception 'FORUM_NO_CHANGE' using errcode='P0001'; end if;
      select * into actor from public.characters where id=viewer_id;
      insert into private.forum_post_revisions(post_id,revision,title,body,replaced_at,editor_id)
        values(post.id,post.edit_count,case when post.post_number=1 then thread.title end,post.body,observed,viewer_id);
      update private.forum_posts set body=new_body,edit_count=edit_count+1,edited_at=observed,editor_id=viewer_id,editor_name=actor.display_name,edited_by_moderator=true
        where id=post.id;
      if new_title is not null and new_title<>thread.title then update private.forum_threads set title=new_title where id=thread.id; end if;
      message:='Post edited.';
    end if;
    select * into post from private.forum_posts p where p.id=post.id;
    after_state:=jsonb_build_object('removed_by',post.removed_by,'edit_count',post.edit_count);
  else
    raise exception 'INVALID_REQUEST' using errcode='22023';
  end if;
  select * into actor from public.characters where id=viewer_id;
  result:=jsonb_build_object('message',message,'thread_id',thread.id::text,'post_id',post.id::text);
  insert into private.forum_moderation_log(actor_id,actor_name,request_id,action,payload,reason,thread_id,post_id,before,after,result,created_at)
    values(viewer_id,actor.display_name,moderate_forum.request_id,action,payload,note,thread.id,post.id,before_state,after_state,result,observed);
  return result;
end;
$$;
create or replace function public.moderate_forum(action text,payload jsonb,request_id uuid,reason text)
returns jsonb language sql volatile security invoker set search_path='' as $$ select private.moderate_forum(action,payload,request_id,reason); $$;
revoke all on function private.moderate_forum(text,jsonb,uuid,text),public.moderate_forum(text,jsonb,uuid,text) from public,anon,authenticated;
grant execute on function private.moderate_forum(text,jsonb,uuid,text),public.moderate_forum(text,jsonb,uuid,text) to authenticated;
