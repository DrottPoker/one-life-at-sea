insert into private.admin_resources(name,schema_name,table_name,editable,deletable,note) values
('forum_boards','private','forum_boards','{}',false,'Forum boards. Managed by gameplay configuration.'),
('forum_threads','private','forum_threads','{}',false,'Forum threads. Moderate them from the thread page.'),
('forum_posts','private','forum_posts','{}',false,'Forum posts, including removed text. Moderate them from the thread page.'),
('forum_post_revisions','private','forum_post_revisions','{}',false,'Earlier versions of edited forum posts.'),
('forum_moderation_log','private','forum_moderation_log','{}',false,'Forum moderator actions with reasons and receipts.'),
('forum_reports','private','forum_reports','{}',false,'Player reports. Handle them in the forum moderation queue.'),
('forum_bans','private','forum_bans','{}',false,'Forum bans. Ban and lift them in the forum moderation tools.'),
('forum_moderators','private','forum_moderators','{}',false,'Player forum moderators. Appointed by administrators in the forum moderation tools.') on conflict(name) do nothing;

-- Tells an author what a moderator did to their content. The reason stays with the moderators.
create or replace function private.forum_notify_moderation(recipient uuid,moderator_id uuid,event_action text,thread private.forum_threads,post private.forum_posts,request_id uuid,observed timestamptz)
returns void language sql volatile security invoker set search_path='' as $$
  select private.emit_notification(recipient,'forum.moderation',request_id::text,
    jsonb_build_object('version',1,'action',event_action,'thread_id',thread.id::text,'title',thread.title,'post_id',post.id::text,'post_number',post.post_number),observed)
  where recipient is not null and recipient<>moderator_id;
$$;
-- Resolves every open report on the given posts in one pass.
create or replace function private.forum_settle_reports(post_ids bigint[],outcome text,moderator public.characters,observed timestamptz)
returns integer language plpgsql volatile security invoker set search_path='' as $$
declare settled integer;
begin
  update private.forum_reports set status=outcome,handled_at=observed,handled_by=moderator.id,handled_by_name=moderator.display_name
    where post_id=any(post_ids) and status='open';
  get diagnostics settled=row_count;
  return settled;
end;
$$;
revoke all on function private.forum_notify_moderation(uuid,uuid,text,private.forum_threads,private.forum_posts,uuid,timestamptz),
  private.forum_settle_reports(bigint[],text,public.characters,timestamptz) from public,anon,authenticated;

-- One receipt per moderator request. Every action reports FORUM_NO_CHANGE instead of
-- repeating a state that a stale screen asked for. Player moderators may act on content and bans;
-- only administrators appoint moderators or ban moderators, and nobody bans an administrator.
create or replace function private.moderate_forum(action text,payload jsonb,request_id uuid,reason text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare viewer_id uuid:=private.combat_captain(); observed timestamptz:=clock_timestamp(); note text:=btrim(reason);
  actor public.characters%rowtype; previous private.forum_moderation_log%rowtype; target bigint; person public.characters%rowtype; admin boolean;
  thread private.forum_threads%rowtype; post private.forum_posts%rowtype; destination private.forum_boards%rowtype;
  before_state jsonb; after_state jsonb; message text; new_body text; new_title text; result jsonb; ends timestamptz;
begin
  perform private.forum_require_moderator();
  admin:=private.is_admin();
  if moderate_forum.request_id is null or action is null or payload is null or jsonb_typeof(payload)<>'object' or length(payload::text)>64000
    or note is null or length(note) not between 3 and 500 then raise exception 'INVALID_REQUEST' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(viewer_id::text||moderate_forum.request_id::text,58213));
  select * into previous from private.forum_moderation_log l where l.actor_id=viewer_id and l.request_id=moderate_forum.request_id;
  if found then
    if previous.action<>action or previous.payload<>payload or previous.reason<>note then raise exception 'REQUEST_MISMATCH' using errcode='22023'; end if;
    return previous.result;
  end if;
  select * into actor from public.characters where id=viewer_id;
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
      update private.forum_threads set removed_at=observed,removed_by='moderator' where id=thread.id;
      perform private.forum_settle_reports(array(select p.id from private.forum_posts p where p.thread_id=thread.id),'resolved',actor,observed);
      message:='Thread removed.';
    else
      if thread.removed_at is null then raise exception 'FORUM_NO_CHANGE' using errcode='P0001'; end if;
      update private.forum_threads set removed_at=null,removed_by=null where id=thread.id;
      perform private.forum_count_thread(thread.id,1); message:='Thread restored.';
    end if;
    if action in('remove_thread','restore_thread') then
      perform private.forum_refresh_karma(author) from (select distinct p.author_id author from private.forum_posts p
        where p.thread_id=thread.id and p.author_id is not null order by 1) authors;
    end if;
    select * into thread from private.forum_threads t where t.id=thread.id;
    after_state:=jsonb_build_object('board_id',thread.board_id,'pinned',thread.pinned_at is not null,'locked',thread.locked_at is not null,'removed_by',thread.removed_by);
    if action='remove_thread' then perform private.forum_notify_moderation(thread.author_id,viewer_id,action,thread,post,moderate_forum.request_id,observed); end if;
  elsif action in('remove_post','restore_post','edit_post','dismiss_reports') then
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
      perform private.forum_settle_reports(array[post.id],'resolved',actor,observed);
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
    elsif action='dismiss_reports' then
      if private.forum_settle_reports(array[post.id],'dismissed',actor,observed)=0 then raise exception 'FORUM_NO_CHANGE' using errcode='P0001'; end if;
      message:='Reports dismissed.';
    else
      new_body:=private.forum_normalize(payload->>'body'); new_title:=btrim(payload->>'title');
      if post.removed_at is not null then raise exception 'POST_REMOVED' using errcode='P0001'; end if;
      if (new_title is not null and post.post_number<>1) or not private.forum_valid_body(new_body) or (new_title is not null and not private.forum_valid_title(new_title)) then
        raise exception 'INVALID_POST' using errcode='22023'; end if;
      if post.body=new_body and (new_title is null or new_title=thread.title) then raise exception 'FORUM_NO_CHANGE' using errcode='P0001'; end if;
      insert into private.forum_post_revisions(post_id,revision,title,body,replaced_at,editor_id)
        values(post.id,post.edit_count,case when post.post_number=1 then thread.title end,post.body,observed,viewer_id);
      update private.forum_posts set body=new_body,edit_count=edit_count+1,edited_at=observed,editor_id=viewer_id,editor_name=actor.display_name,edited_by_moderator=true
        where id=post.id;
      if new_title is not null and new_title<>thread.title then update private.forum_threads set title=new_title where id=thread.id; end if;
      message:='Post edited.';
    end if;
    if action in('remove_post','restore_post') and post.author_id is not null then perform private.forum_refresh_karma(post.author_id); end if;
    select * into post from private.forum_posts p where p.id=post.id;
    select * into thread from private.forum_threads t where t.id=thread.id;
    after_state:=jsonb_build_object('removed_by',post.removed_by,'edit_count',post.edit_count);
    if action in('remove_post','edit_post') then perform private.forum_notify_moderation(post.author_id,viewer_id,action,thread,post,moderate_forum.request_id,observed); end if;
  elsif action in('ban_player','unban_player','grant_moderator','revoke_moderator') then
    if coalesce(payload->>'player_number','') !~ '^[1-9][0-9]{0,15}$' then raise exception 'INVALID_REQUEST' using errcode='22023'; end if;
    if action in('grant_moderator','revoke_moderator') then perform private.require_admin(); end if;
    select * into person from public.characters c where c.player_number=(payload->>'player_number')::bigint;
    if person.id is null then raise exception 'FORUM_NOT_FOUND' using errcode='P0002'; end if;
    before_state:=jsonb_build_object('ban',private.forum_active_ban(person.id),'moderator',exists(select 1 from private.forum_moderators m where m.character_id=person.id));
    if action='ban_player' then
      if person.id=viewer_id or exists(select 1 from private.admin_members m where m.user_id=person.user_id)
        or (not admin and exists(select 1 from private.forum_moderators m where m.character_id=person.id)) then
        raise exception 'FORUM_FORBIDDEN' using errcode='42501'; end if;
      if payload ? 'hours' and coalesce(payload->>'hours','') !~ '^[1-9][0-9]{0,3}$' then raise exception 'INVALID_REQUEST' using errcode='22023'; end if;
      ends:=case when payload ? 'hours' then observed+make_interval(hours=>least((payload->>'hours')::integer,8760)) end;
      update private.forum_bans set lifted_at=observed,lifted_by=viewer_id where character_id=person.id and lifted_at is null;
      insert into private.forum_bans(character_id,starts_at,ends_at,reason,created_by,created_by_name) values(person.id,observed,ends,note,viewer_id,actor.display_name);
      perform private.emit_notification(person.id,'forum.ban',moderate_forum.request_id::text,jsonb_build_object('version',1,'ends_at',ends,'reason',note),observed);
      message:=person.display_name||' is banned from posting'||case when ends is null then ' permanently.' else ' until '||to_char(ends at time zone 'UTC','YYYY-MM-DD HH24:MI')||' UTC.' end;
    elsif action='unban_player' then
      if private.forum_active_ban(person.id) is null then raise exception 'FORUM_NO_CHANGE' using errcode='P0001'; end if;
      update private.forum_bans set lifted_at=observed,lifted_by=viewer_id where character_id=person.id and lifted_at is null;
      perform private.emit_notification(person.id,'forum.unban',moderate_forum.request_id::text,jsonb_build_object('version',1),observed);
      message:=person.display_name||' can post again.';
    elsif action='grant_moderator' then
      if exists(select 1 from private.admin_members m where m.user_id=person.user_id) then raise exception 'FORUM_NO_CHANGE' using errcode='P0001'; end if;
      insert into private.forum_moderators(character_id,granted_by,granted_at) values(person.id,viewer_id,observed) on conflict do nothing;
      if not found then raise exception 'FORUM_NO_CHANGE' using errcode='P0001'; end if;
      perform private.emit_notification(person.id,'forum.role',moderate_forum.request_id::text,jsonb_build_object('version',1,'moderator',true),observed);
      message:=person.display_name||' is now a forum moderator.';
    else
      delete from private.forum_moderators m where m.character_id=person.id;
      if not found then raise exception 'FORUM_NO_CHANGE' using errcode='P0001'; end if;
      perform private.emit_notification(person.id,'forum.role',moderate_forum.request_id::text,jsonb_build_object('version',1,'moderator',false),observed);
      message:=person.display_name||' is no longer a forum moderator.';
    end if;
    after_state:=jsonb_build_object('ban',private.forum_active_ban(person.id),'moderator',exists(select 1 from private.forum_moderators m where m.character_id=person.id));
  else
    raise exception 'INVALID_REQUEST' using errcode='22023';
  end if;
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

-- The moderation queue groups open reports by post, newest report first.
create or replace function private.get_forum_reports(status text default 'open',page integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare total bigint; current_page integer; items jsonb;
begin
  perform private.combat_captain();
  if not private.forum_is_moderator() then raise exception 'MODERATOR_REQUIRED' using errcode='42501'; end if;
  if get_forum_reports.status is null or get_forum_reports.status not in('open','resolved','dismissed') or page is null or page<0 then
    raise exception 'INVALID_REQUEST' using errcode='22023'; end if;
  select count(distinct r.post_id) into total from private.forum_reports r where r.status=get_forum_reports.status;
  current_page:=least(page,greatest(0,(total-1)/{{gameplay.forum.threadsPageSize}})::integer);
  select coalesce(jsonb_agg(entry.item order by entry.latest desc,entry.post_id desc),'[]'::jsonb) into items from (
    select grouped.post_id,grouped.latest,jsonb_build_object(
      'post',jsonb_build_object('id',p.id::text,'number',p.post_number,'excerpt',left(p.body,500),'removed',p.removed_by,
        'author',private.forum_person(p.author_id,p.author_name,p.author_player_number)),
      'thread',jsonb_build_object('id',t.id::text,'title',t.title,'removed',t.removed_at is not null),'board',jsonb_build_object('id',b.id,'name',b.name),
      'reports',(select jsonb_agg(jsonb_build_object('id',r.id::text,'reason',r.reason,'note',r.note,'created_at',r.created_at,'status',r.status,
          'reporter',private.forum_person(r.reporter_id,r.reporter_name,coalesce((select c.player_number from public.characters c where c.id=r.reporter_id),0)),
          'handled_by',r.handled_by_name,'handled_at',r.handled_at) order by r.created_at desc)
        from private.forum_reports r where r.post_id=p.id and r.status=get_forum_reports.status)) item
    from (select r.post_id,max(r.created_at) latest from private.forum_reports r where r.status=get_forum_reports.status group by r.post_id
      order by max(r.created_at) desc,r.post_id desc limit {{gameplay.forum.threadsPageSize}} offset current_page*{{gameplay.forum.threadsPageSize}}) grouped
    join private.forum_posts p on p.id=grouped.post_id join private.forum_threads t on t.id=p.thread_id join private.forum_boards b on b.id=t.board_id
  ) entry;
  return jsonb_build_object('items',items,'total',total,'page',current_page,'page_size',{{gameplay.forum.threadsPageSize}});
end;
$$;

-- Active bans, forum moderators and the moderation log for the moderator tools.
create or replace function private.get_forum_moderation(page integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare total bigint; current_page integer;
begin
  perform private.combat_captain();
  if not private.forum_is_moderator() then raise exception 'MODERATOR_REQUIRED' using errcode='42501'; end if;
  if page is null or page<0 then raise exception 'INVALID_REQUEST' using errcode='22023'; end if;
  select count(*) into total from private.forum_moderation_log;
  current_page:=least(page,greatest(0,(total-1)/{{gameplay.forum.threadsPageSize}})::integer);
  return jsonb_build_object('can_manage_moderators',private.is_admin(),
    'open_reports',(select count(distinct r.post_id) from private.forum_reports r where r.status='open'),
    'bans',coalesce((select jsonb_agg(jsonb_build_object('player',jsonb_build_object('display_name',c.display_name,'player_number',c.player_number,'deleted',false),
      'starts_at',b.starts_at,'ends_at',b.ends_at,'reason',b.reason,'banned_by',b.created_by_name) order by b.starts_at desc)
      from private.forum_bans b join public.characters c on c.id=b.character_id
      where b.lifted_at is null and (b.ends_at is null or b.ends_at>statement_timestamp())),'[]'::jsonb),
    'moderators',coalesce((select jsonb_agg(jsonb_build_object('player',jsonb_build_object('display_name',c.display_name,'player_number',c.player_number,'deleted',false),
      'granted_at',m.granted_at,'granted_by',(select g.display_name from public.characters g where g.id=m.granted_by)) order by c.display_name)
      from private.forum_moderators m join public.characters c on c.id=m.character_id),'[]'::jsonb),
    'log',coalesce((select jsonb_agg(entry.item order by entry.id desc) from (select l.id,jsonb_build_object('id',l.id::text,'action',l.action,'actor',l.actor_name,'reason',l.reason,
      'created_at',l.created_at,'payload',l.payload,'thread',case when t.id is not null then jsonb_build_object('id',t.id::text,'title',t.title) end,'post_id',l.post_id::text) item
      from private.forum_moderation_log l left join private.forum_threads t on t.id=l.thread_id
      order by l.id desc limit {{gameplay.forum.threadsPageSize}} offset current_page*{{gameplay.forum.threadsPageSize}}) entry),'[]'::jsonb),
    'log_total',total,'page',current_page,'page_size',{{gameplay.forum.threadsPageSize}});
end;
$$;
create or replace function public.get_forum_reports(status text default 'open',page integer default 0)
returns jsonb language sql stable security invoker set search_path='' as $$ select private.get_forum_reports(status,page); $$;
create or replace function public.get_forum_moderation(page integer default 0)
returns jsonb language sql stable security invoker set search_path='' as $$ select private.get_forum_moderation(page); $$;
revoke all on function private.get_forum_reports(text,integer),public.get_forum_reports(text,integer),private.get_forum_moderation(integer),public.get_forum_moderation(integer)
  from public,anon,authenticated;
grant execute on function private.get_forum_reports(text,integer),public.get_forum_reports(text,integer),private.get_forum_moderation(integer),public.get_forum_moderation(integer)
  to authenticated;
