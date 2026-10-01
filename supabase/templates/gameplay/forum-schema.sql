-- Boards come from configuration. Their counters belong to the database and survive config sync.
create table if not exists private.forum_boards (
  id text primary key check(id ~ '^[a-z][a-z0-9_]{0,47}$'),
  section text not null, name text not null, description text not null,
  posting text not null check(posting in('open','moderators','closed')),
  active boolean not null, position integer not null,
  thread_count integer not null default 0 check(thread_count>=0),
  post_count bigint not null default 0 check(post_count>=0)
);
alter table private.forum_boards add column if not exists karma boolean not null default true;
{{forum.catalogSql}}
-- Authors keep a name/number snapshot so content survives character deletion.
create table if not exists private.forum_threads (
  id bigint generated always as identity primary key,
  board_id text not null references private.forum_boards(id),
  author_id uuid references public.characters(id) on delete set null,
  author_name text not null, author_player_number bigint not null,
  title text not null check(length(title) between 1 and 200),
  request_id uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  post_seq integer not null default 0 check(post_seq>=0),
  post_count integer not null default 0 check(post_count>=0 and post_count<=post_seq),
  reader_count integer not null default 0 check(reader_count>=0),
  last_post_id bigint, last_post_number integer not null default 0, last_post_at timestamptz not null default clock_timestamp(),
  pinned_at timestamptz, locked_at timestamptz,
  removed_at timestamptz, removed_by text check(removed_by='moderator'),
  constraint forum_threads_request unique(author_id,request_id),
  constraint forum_threads_removed check((removed_at is null)=(removed_by is null))
);
create index if not exists forum_threads_board_idx on private.forum_threads(board_id,(pinned_at is not null) desc,last_post_at desc,id desc) where removed_at is null;
create index if not exists forum_threads_recent_idx on private.forum_threads(board_id,last_post_at desc,id desc) where removed_at is null;
create index if not exists forum_threads_author_idx on private.forum_threads(author_id,created_at desc);
-- Post numbers are never reused, so removed posts keep their place and links stay stable.
create table if not exists private.forum_posts (
  id bigint generated always as identity primary key,
  thread_id bigint not null references private.forum_threads(id),
  post_number integer not null check(post_number>0),
  author_id uuid references public.characters(id) on delete set null,
  author_name text not null, author_player_number bigint not null,
  body text not null check(length(body) between 1 and 20000),
  format_version smallint not null default 1 check(format_version=1),
  quoted_post_id bigint references private.forum_posts(id),
  request_id uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  edit_count integer not null default 0 check(edit_count>=0), edited_at timestamptz,
  editor_id uuid references public.characters(id) on delete set null, editor_name text, edited_by_moderator boolean not null default false,
  removed_at timestamptz, removed_by text check(removed_by in('author','moderator')),
  constraint forum_posts_number unique(thread_id,post_number),
  constraint forum_posts_request unique(author_id,request_id),
  constraint forum_posts_removed check((removed_at is null)=(removed_by is null)),
  constraint forum_posts_edited check((edit_count=0)=(edited_at is null))
);
create index if not exists forum_posts_author_idx on private.forum_posts(author_id,created_at desc);
create index if not exists forum_posts_quoted_idx on private.forum_posts(quoted_post_id) where quoted_post_id is not null;
do $forum_schema$ begin
  if not exists(select 1 from pg_constraint where conname='forum_threads_last_post' and conrelid='private.forum_threads'::regclass) then
    alter table private.forum_threads add constraint forum_threads_last_post foreign key(last_post_id) references private.forum_posts(id);
  end if;
end $forum_schema$;
-- Revision zero is the original text; moderators can review every replaced version.
create table if not exists private.forum_post_revisions (
  post_id bigint not null references private.forum_posts(id),
  revision integer not null check(revision>=0),
  title text, body text not null,
  replaced_at timestamptz not null default clock_timestamp(),
  editor_id uuid references public.characters(id) on delete set null,
  primary key(post_id,revision)
);
create table if not exists private.forum_thread_reads (
  character_id uuid not null references public.characters(id) on delete cascade,
  thread_id bigint not null references private.forum_threads(id),
  last_read_number integer not null check(last_read_number>=0),
  read_at timestamptz not null default clock_timestamp(),
  primary key(character_id,thread_id)
);
create index if not exists forum_thread_reads_thread_idx on private.forum_thread_reads(thread_id);
create table if not exists private.forum_board_reads (
  character_id uuid not null references public.characters(id) on delete cascade,
  board_id text not null references private.forum_boards(id),
  read_through timestamptz not null,
  primary key(character_id,board_id)
);
-- Visible posts and threads per author for the post header.
create table if not exists private.forum_author_stats (
  character_id uuid primary key references public.characters(id) on delete cascade,
  thread_count integer not null default 0 check(thread_count>=0),
  post_count integer not null default 0 check(post_count>=0),
  last_post_at timestamptz
);
-- Each moderator action is its own receipt, so a retried request cannot act twice.
create table if not exists private.forum_moderation_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.characters(id) on delete set null,
  actor_name text not null, request_id uuid not null,
  action text not null, payload jsonb not null check(jsonb_typeof(payload)='object'),
  reason text not null check(length(reason) between 3 and 500),
  thread_id bigint references private.forum_threads(id), post_id bigint references private.forum_posts(id),
  before jsonb, after jsonb, result jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  constraint forum_moderation_request unique(actor_id,request_id)
);
create index if not exists forum_moderation_thread_idx on private.forum_moderation_log(thread_id,id desc);
alter table private.forum_boards enable row level security;
alter table private.forum_threads enable row level security;
alter table private.forum_posts enable row level security;
alter table private.forum_post_revisions enable row level security;
alter table private.forum_thread_reads enable row level security;
alter table private.forum_board_reads enable row level security;
alter table private.forum_author_stats enable row level security;
alter table private.forum_moderation_log enable row level security;
revoke all on private.forum_boards,private.forum_threads,private.forum_posts,private.forum_post_revisions,private.forum_thread_reads,
  private.forum_board_reads,private.forum_author_stats,private.forum_moderation_log from public,anon,authenticated;
revoke all on sequence private.forum_threads_id_seq,private.forum_posts_id_seq,private.forum_moderation_log_id_seq from public,anon,authenticated;

-- One like or dislike per captain and post. The post keeps the totals, which a trigger maintains
-- even when a reacting character is deleted.
create table if not exists private.forum_reactions (
  post_id bigint not null references private.forum_posts(id),
  character_id uuid not null references public.characters(id) on delete cascade,
  value smallint not null check(value in(-1,1)),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  primary key(post_id,character_id)
);
create index if not exists forum_reactions_character_idx on private.forum_reactions(character_id,updated_at desc);
-- Reaction changes per captain in a one-minute window. Removing a reaction deletes its row, so the
-- rows themselves cannot count how often a captain changes their mind.
create table if not exists private.forum_reaction_limits (
  character_id uuid primary key references public.characters(id) on delete cascade,
  window_started_at timestamptz not null,
  changes integer not null check(changes>0)
);
alter table private.forum_reaction_limits enable row level security;
revoke all on private.forum_reaction_limits from public,anon,authenticated;
alter table private.forum_posts add column if not exists likes integer not null default 0 check(likes>=0),
  add column if not exists dislikes integer not null default 0 check(dislikes>=0);
-- Whether a reaction earns karma is decided once, when it is first given.
alter table private.forum_reactions add column if not exists counts boolean not null default false;
alter table private.forum_posts add column if not exists karma integer not null default 0;
alter table private.forum_author_stats add column if not exists karma integer not null default 0 check(karma>=0);
-- Karma is the sum of counted reactions on an author's posts. A removed or deleted post keeps its
-- minus but loses its plus, and the total never drops below zero.
-- The author's row is locked first, so the sum, taken in the next statement, includes reactions
-- that another transaction committed while this one waited.
create or replace function private.forum_refresh_karma(author uuid)
returns void language sql volatile security invoker set search_path='' as $$
  select 1 from private.forum_author_stats s where s.character_id=author for update;
  update private.forum_author_stats s set karma=greatest(0,coalesce((select sum(case when p.removed_at is null and t.removed_at is null then p.karma else least(p.karma,0) end)
    from private.forum_posts p join private.forum_threads t on t.id=p.thread_id where p.author_id=author),0))::integer
  where s.character_id=author;
$$;
create or replace function private.count_forum_reaction()
returns trigger language plpgsql volatile security invoker set search_path='' as $$
declare author uuid;
begin
  if tg_op in('UPDATE','DELETE') then
    update private.forum_posts set likes=likes-(old.value=1)::integer,dislikes=dislikes-(old.value=-1)::integer,karma=karma-case when old.counts then old.value else 0 end
      where id=old.post_id returning author_id into author;
  end if;
  if tg_op in('INSERT','UPDATE') then
    update private.forum_posts set likes=likes+(new.value=1)::integer,dislikes=dislikes+(new.value=-1)::integer,karma=karma+case when new.counts then new.value else 0 end
      where id=new.post_id returning author_id into author;
  end if;
  if author is not null then perform private.forum_refresh_karma(author); end if;
  return null;
end;
$$;
revoke all on function private.forum_refresh_karma(uuid),private.count_forum_reaction() from public,anon,authenticated;
drop trigger if exists count_forum_reaction on private.forum_reactions;
create trigger count_forum_reaction after insert or update of value or delete on private.forum_reactions
  for each row execute function private.count_forum_reaction();
-- A false row is an explicit unsubscribe that later posting does not undo. notified_number is the
-- post behind the one reply notification that waits until the subscriber reads the thread.
create table if not exists private.forum_subscriptions (
  character_id uuid not null references public.characters(id) on delete cascade,
  thread_id bigint not null references private.forum_threads(id),
  subscribed boolean not null,
  notified_number integer check(notified_number>0),
  created_at timestamptz not null default clock_timestamp(),
  primary key(character_id,thread_id)
);
create index if not exists forum_subscriptions_thread_idx on private.forum_subscriptions(thread_id) where subscribed and notified_number is null;
alter table private.forum_posts add column if not exists search_vector tsvector generated always as (to_tsvector('simple',body)) stored;
alter table private.forum_threads add column if not exists search_vector tsvector generated always as (to_tsvector('simple',title)) stored;
create index if not exists forum_posts_search_idx on private.forum_posts using gin(search_vector);
create index if not exists forum_threads_search_idx on private.forum_threads using gin(search_vector);
alter table private.forum_reactions enable row level security;
alter table private.forum_subscriptions enable row level security;
revoke all on private.forum_reactions,private.forum_subscriptions from public,anon,authenticated;

-- Player moderators appointed by administrators; administrators always moderate.
create table if not exists private.forum_moderators (
  character_id uuid primary key references public.characters(id) on delete cascade,
  granted_by uuid references public.characters(id) on delete set null,
  granted_at timestamptz not null default clock_timestamp()
);
-- A ban stops posting, editing, reactions and reports until it ends or is lifted. Reading and
-- deleting your own posts stay open. At most one ban per captain is unlifted at a time.
create table if not exists private.forum_bans (
  id bigint generated always as identity primary key,
  character_id uuid not null references public.characters(id) on delete cascade,
  starts_at timestamptz not null, ends_at timestamptz, reason text not null check(length(reason) between 3 and 500),
  created_by uuid references public.characters(id) on delete set null, created_by_name text not null,
  lifted_at timestamptz, lifted_by uuid references public.characters(id) on delete set null,
  constraint forum_bans_period check(ends_at is null or ends_at>starts_at)
);
create unique index if not exists forum_bans_open_idx on private.forum_bans(character_id) where lifted_at is null;
-- One open report per captain and post. Moderators settle every open report on a post together.
create table if not exists private.forum_reports (
  id bigint generated always as identity primary key,
  post_id bigint not null references private.forum_posts(id),
  reporter_id uuid references public.characters(id) on delete set null, reporter_name text not null,
  reason text not null check(reason in('spam','harassment','offensive','rules','other')),
  note text not null default '' check(length(note)<=500),
  created_at timestamptz not null default clock_timestamp(),
  status text not null default 'open' check(status in('open','resolved','dismissed')),
  handled_at timestamptz, handled_by uuid references public.characters(id) on delete set null, handled_by_name text,
  constraint forum_reports_handled check((status='open')=(handled_at is null))
);
create unique index if not exists forum_reports_open_idx on private.forum_reports(post_id,reporter_id) where status='open';
create index if not exists forum_reports_status_idx on private.forum_reports(status,created_at desc);
create index if not exists forum_reports_reporter_idx on private.forum_reports(reporter_id,created_at desc);
alter table private.forum_moderators enable row level security;
alter table private.forum_bans enable row level security;
alter table private.forum_reports enable row level security;
revoke all on private.forum_moderators,private.forum_bans,private.forum_reports from public,anon,authenticated;
revoke all on sequence private.forum_bans_id_seq,private.forum_reports_id_seq from public,anon,authenticated;

-- A banned player moderator keeps the role but cannot use it until the ban ends.
create or replace function private.forum_is_moderator()
returns boolean language sql stable security definer set search_path='' as $$
  select private.is_admin() or exists(select 1 from private.forum_moderators m join public.characters c on c.id=m.character_id where c.user_id=auth.uid()
    and not exists(select 1 from private.forum_bans b where b.character_id=c.id and b.lifted_at is null and (b.ends_at is null or b.ends_at>statement_timestamp())));
$$;
-- A share lock lets a revocation wait for an action that is already running, like require_admin.
create or replace function private.forum_require_moderator()
returns void language plpgsql volatile security definer set search_path='' as $$
declare moderator_id uuid;
begin
  if private.is_admin() then perform private.require_admin(); return; end if;
  select m.character_id into moderator_id from private.forum_moderators m join public.characters c on c.id=m.character_id where c.user_id=auth.uid() for share of m;
  if not found then raise exception 'MODERATOR_REQUIRED' using errcode='42501'; end if;
  perform private.forum_require_unbanned(moderator_id);
end;
$$;
-- Player moderators do not moderate themselves, administrators or other moderators.
create or replace function private.forum_may_moderate(target uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select private.is_admin() or target is null or not exists(select 1 from public.characters c where c.id=target and (c.user_id=auth.uid()
    or exists(select 1 from private.admin_members m where m.user_id=c.user_id) or exists(select 1 from private.forum_moderators m where m.character_id=c.id)));
$$;
create or replace function private.forum_active_ban(target uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('ends_at',b.ends_at,'reason',b.reason) from private.forum_bans b
    where b.character_id=target and b.lifted_at is null and (b.ends_at is null or b.ends_at>statement_timestamp());
$$;
create or replace function private.forum_require_unbanned(target uuid)
returns void language plpgsql stable security invoker set search_path='' as $$
declare ban jsonb:=private.forum_active_ban(target);
begin
  if ban is not null then raise exception 'FORUM_BANNED' using errcode='42501',detail=coalesce(ban->>'ends_at','permanent'); end if;
end;
$$;
create or replace function private.forum_can_post(posting text,moderator boolean)
returns boolean language sql immutable security invoker set search_path='' as $$
  select posting='open' or (posting='moderators' and moderator);
$$;
create or replace function private.forum_normalize(value text)
returns text language sql immutable security invoker set search_path='' as $$
  select btrim(replace(replace(value,E'\r\n',E'\n'),E'\r',E'\n'),E' \t\n');
$$;
create or replace function private.forum_valid_body(value text)
returns boolean language sql immutable security invoker set search_path='' as $$
  select value is not null and length(value) between 1 and {{gameplay.forum.postMaxLength}} and value ~ '[^[:space:]]'
    and translate(value,E'\t\n','') !~ '[[:cntrl:]]';
$$;
create or replace function private.forum_valid_title(value text)
returns boolean language sql immutable security invoker set search_path='' as $$
  select value is not null and value=btrim(value) and length(value) between 1 and {{gameplay.forum.threadTitleMaxLength}} and value !~ '[[:cntrl:]]';
$$;
-- One trimmed line of text without control characters, for poll questions and options.
create or replace function private.forum_valid_line(value text,max_length integer)
returns boolean language sql immutable security invoker set search_path='' as $$
  select value is not null and value=btrim(value) and length(value) between 1 and max_length and value !~ '[[:cntrl:]]';
$$;
revoke all on function private.forum_valid_line(text,integer) from public,anon,authenticated;
-- Current name for living authors, the saved snapshot after deletion.
create or replace function private.forum_person(character_id uuid,snapshot_name text,snapshot_number bigint)
returns jsonb language sql stable security invoker set search_path='' as $$
  select coalesce((select jsonb_build_object('display_name',c.display_name,'player_number',c.player_number,'deleted',false)
    from public.characters c where c.id=character_id),
    jsonb_build_object('display_name',snapshot_name,'player_number',snapshot_number,'deleted',true));
$$;
-- The newest visible post; callers hold the thread lock.
create or replace function private.forum_refresh_last_post(target_thread bigint)
returns void language sql volatile security invoker set search_path='' as $$
  update private.forum_threads t set last_post_id=p.id,last_post_number=p.post_number,last_post_at=p.created_at
    from (select id,post_number,created_at from private.forum_posts where thread_id=target_thread and removed_at is null
      order by post_number desc limit 1) p
    where t.id=target_thread;
$$;
-- Adds or subtracts every visible post of a thread from board and author counters.
-- Callers hold the thread lock; author rows are locked in character order.
create or replace function private.forum_count_thread(target_thread bigint,direction integer)
returns void language plpgsql volatile security invoker set search_path='' as $$
declare thread private.forum_threads%rowtype;
begin
  select * into thread from private.forum_threads where id=target_thread;
  update private.forum_boards set thread_count=thread_count+direction,post_count=post_count+direction*thread.post_count where id=thread.board_id;
  insert into private.forum_author_stats(character_id)
    select author_id from private.forum_posts where thread_id=target_thread and removed_at is null and author_id is not null
    union select thread.author_id where thread.author_id is not null order by 1 on conflict do nothing;
  perform 1 from private.forum_author_stats s where s.character_id in(
    select author_id from private.forum_posts where thread_id=target_thread and removed_at is null union select thread.author_id)
    order by s.character_id for update;
  update private.forum_author_stats s set post_count=s.post_count+direction*a.posts,
    thread_count=s.thread_count+case when s.character_id=thread.author_id then direction else 0 end
    from (select character_id,sum(posts)::integer posts from (
      select author_id character_id,count(*)::integer posts from private.forum_posts
        where thread_id=target_thread and removed_at is null and author_id is not null group by author_id
      union all select thread.author_id,0 where thread.author_id is not null) counted group by character_id) a
    where s.character_id=a.character_id;
end;
$$;
revoke all on function private.forum_is_moderator(),private.forum_require_moderator(),private.forum_may_moderate(uuid),private.forum_active_ban(uuid),private.forum_require_unbanned(uuid),private.forum_can_post(text,boolean),private.forum_normalize(text),private.forum_valid_body(text),
  private.forum_valid_title(text),private.forum_person(uuid,text,bigint),private.forum_refresh_last_post(bigint),private.forum_count_thread(bigint,integer)
  from public,anon,authenticated;

-- Authors delete the content of posts, never whole threads; only moderators remove threads.
alter table private.forum_threads drop constraint if exists forum_threads_removed_by_check;
alter table private.forum_threads add constraint forum_threads_removed_by_check check(removed_by='moderator');
