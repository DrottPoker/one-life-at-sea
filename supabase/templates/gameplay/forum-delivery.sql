-- Reply and quote notifications are delivered after the post has committed, in batches of
-- recipients, so a thread with many subscribers never slows posting or holds their locks. The app
-- delivers right after a reply; a scheduled job picks up whatever is left.
create table if not exists private.forum_notification_jobs (
  post_id bigint primary key references private.forum_posts(id),
  -- No foreign key: deleting a character must never wait for a delivery in progress.
  author_id uuid,
  created_at timestamptz not null default clock_timestamp(),
  delivered_through uuid
);
create index if not exists forum_notification_jobs_author_idx on private.forum_notification_jobs(author_id,post_id);
alter table private.forum_notification_jobs enable row level security;
revoke all on private.forum_notification_jobs from public,anon,authenticated;

-- A quoted author hears about the quote; other subscribers get one reply notice per thread until
-- they read it. Recipients are decided at delivery, so a deleted post, a hidden thread, an ignore
-- or a read that happened meanwhile is respected. Each batch locks its recipients in character
-- order before their subscriptions and notifications, the shared order for character locks.
create or replace function private.forum_deliver_job(job private.forum_notification_jobs,batch integer)
returns void language plpgsql volatile security invoker set search_path='' as $$
declare post private.forum_posts%rowtype; thread private.forum_threads%rowtype; board_active boolean; actor public.characters%rowtype;
  quoted_author uuid; recipients uuid[]; payload jsonb; target record;
begin
  select * into post from private.forum_posts p where p.id=job.post_id;
  select * into thread from private.forum_threads t where t.id=post.thread_id;
  select b.active into board_active from private.forum_boards b where b.id=thread.board_id;
  select * into actor from public.characters c where c.id=post.author_id;
  if post.removed_at is not null or thread.removed_at is not null or not board_active or actor.id is null then
    delete from private.forum_notification_jobs j where j.post_id=job.post_id;
    return;
  end if;
  select q.author_id into quoted_author from private.forum_posts q where q.id=post.quoted_post_id and q.removed_at is null;
  select array_agg(chosen.recipient order by chosen.recipient) into recipients from (
    select candidates.recipient from (
      select quoted_author recipient
      union select s.character_id from private.forum_subscriptions s where s.thread_id=thread.id and s.subscribed and s.notified_number is null
    ) candidates
    where candidates.recipient is not null and candidates.recipient<>actor.id and (job.delivered_through is null or candidates.recipient>job.delivered_through)
    order by candidates.recipient limit batch) chosen;
  if recipients is null then
    delete from private.forum_notification_jobs j where j.post_id=job.post_id;
    return;
  end if;
  perform 1 from public.characters c where c.id=any(recipients) order by c.id for key share;
  payload:=jsonb_build_object('version',1,'thread_id',thread.id::text,'title',thread.title,'post_id',post.id::text,'post_number',post.post_number,
    'author',jsonb_build_object('name',actor.display_name,'player_number',actor.player_number));
  for target in
    select c.id character_id,'forum.quote' kind from public.characters c
      where c.id=quoted_author and c.id=any(recipients)
        and not exists(select 1 from private.mail_ignored i where i.character_id=c.id and i.ignored_id=actor.id)
    union all
    select s.character_id,'forum.reply' from private.forum_subscriptions s
      where s.thread_id=thread.id and s.subscribed and s.notified_number is null and s.character_id=any(recipients)
        and s.character_id is distinct from quoted_author
        and not exists(select 1 from private.forum_thread_reads r where r.character_id=s.character_id and r.thread_id=thread.id and r.last_read_number>=post.post_number)
        and not exists(select 1 from private.mail_ignored i where i.character_id=s.character_id and i.ignored_id=actor.id)
    order by 1
  loop
    if target.kind='forum.reply' then
      update private.forum_subscriptions set notified_number=post.post_number where character_id=target.character_id and thread_id=thread.id;
    end if;
    perform private.emit_notification(target.character_id,target.kind,post.id::text,payload,post.created_at);
  end loop;
  if cardinality(recipients)<batch then
    delete from private.forum_notification_jobs j where j.post_id=job.post_id;
  else
    update private.forum_notification_jobs j set delivered_through=recipients[cardinality(recipients)] where j.post_id=job.post_id;
  end if;
end;
$$;
-- Workers skip jobs another worker holds, so the app and the schedule never wait for each other.
create or replace function private.run_forum_notification_jobs(author uuid,max_jobs integer,batch integer)
returns integer language plpgsql volatile security invoker set search_path='' as $$
declare job private.forum_notification_jobs%rowtype; handled integer:=0;
begin
  for job in select * from private.forum_notification_jobs j where author is null or j.author_id=author order by j.post_id limit max_jobs for update skip locked loop
    perform private.forum_deliver_job(job,batch);
    handled:=handled+1;
  end loop;
  return handled;
end;
$$;
-- The app calls this after a reply; it only delivers the caller's own posts.
create or replace function private.deliver_forum_notifications()
returns integer language sql volatile security definer set search_path='' as $$
  select private.run_forum_notification_jobs(private.combat_captain(),5,500);
$$;
create or replace function private.run_all_forum_notification_jobs()
returns integer language sql volatile security definer set search_path='' as $$
  select private.run_forum_notification_jobs(null,50,1000);
$$;
create or replace function public.deliver_forum_notifications()
returns integer language sql volatile security invoker set search_path='' as $$ select private.deliver_forum_notifications(); $$;
revoke all on function private.forum_deliver_job(private.forum_notification_jobs,integer),private.run_forum_notification_jobs(uuid,integer,integer),
  private.deliver_forum_notifications(),public.deliver_forum_notifications(),private.run_all_forum_notification_jobs() from public,anon,authenticated;
grant execute on function private.deliver_forum_notifications(),public.deliver_forum_notifications() to authenticated;
select cron.schedule('forum-notifications','* * * * *','select private.run_all_forum_notification_jobs()');
