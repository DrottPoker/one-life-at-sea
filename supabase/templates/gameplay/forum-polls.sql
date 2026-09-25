-- A thread can open with one poll. Nobody sees who voted for what: each voter has one row with
-- their choices, and a trigger keeps the option totals and the number of voters.
create table if not exists private.forum_polls (
  thread_id bigint primary key references private.forum_threads(id),
  question text not null check(length(question) between 1 and 200),
  max_choices smallint not null check(max_choices between 1 and 20),
  duration_days smallint check(duration_days between 1 and 365),
  closes_at timestamptz,
  closed_at timestamptz, closed_by text check(closed_by in('author','moderator')),
  removed_at timestamptz,
  voter_count integer not null default 0 check(voter_count>=0),
  created_at timestamptz not null default clock_timestamp(),
  constraint forum_polls_closed check((closed_at is null)=(closed_by is null)),
  constraint forum_polls_deadline check((duration_days is null)=(closes_at is null))
);
create table if not exists private.forum_poll_options (
  thread_id bigint not null references private.forum_polls(thread_id),
  option_number smallint not null check(option_number between 1 and 20),
  label text not null check(length(label) between 1 and 200),
  votes integer not null default 0 check(votes>=0),
  primary key(thread_id,option_number)
);
create table if not exists private.forum_poll_votes (
  thread_id bigint not null references private.forum_polls(thread_id),
  character_id uuid not null references public.characters(id) on delete cascade,
  choices smallint[] not null check(cardinality(choices) between 1 and 20),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  primary key(thread_id,character_id)
);
create index if not exists forum_poll_votes_character_idx on private.forum_poll_votes(character_id);
alter table private.forum_polls enable row level security;
alter table private.forum_poll_options enable row level security;
alter table private.forum_poll_votes enable row level security;
revoke all on private.forum_polls,private.forum_poll_options,private.forum_poll_votes from public,anon,authenticated;

-- The poll row is updated before its options, the same order a vote locks them in, also when a
-- deleted character's votes cascade away.
create or replace function private.count_forum_poll_vote()
returns trigger language plpgsql volatile security invoker set search_path='' as $$
begin
  if tg_op in('INSERT','DELETE') then
    update private.forum_polls set voter_count=voter_count+case when tg_op='INSERT' then 1 else -1 end where thread_id=coalesce(new.thread_id,old.thread_id);
  end if;
  if tg_op in('UPDATE','DELETE') then
    update private.forum_poll_options set votes=votes-1 where thread_id=old.thread_id and option_number=any(old.choices);
  end if;
  if tg_op in('INSERT','UPDATE') then
    update private.forum_poll_options set votes=votes+1 where thread_id=new.thread_id and option_number=any(new.choices);
  end if;
  return null;
end;
$$;
drop trigger if exists count_forum_poll_vote on private.forum_poll_votes;
create trigger count_forum_poll_vote after insert or update of choices or delete on private.forum_poll_votes
  for each row execute function private.count_forum_poll_vote();

-- Trimmed text with the shape the database stores, without limits, so a replayed request compares
-- against the original even after the limits change.
create or replace function private.forum_poll_canonical(poll jsonb)
returns jsonb language sql immutable security invoker set search_path='' as $$
  select case when jsonb_typeof(poll)='object' and jsonb_typeof(poll->'question')='string' and jsonb_typeof(poll->'options')='array'
    and not exists(select 1 from jsonb_array_elements(poll->'options') o where jsonb_typeof(o)<>'string') then
    jsonb_build_object('question',btrim(poll->>'question'),
      'options',coalesce((select jsonb_agg(btrim(o) order by n) from jsonb_array_elements_text(poll->'options') with ordinality x(o,n)),'[]'::jsonb),
      'max_choices',poll->'max_choices','days',coalesce(poll->'days','null'::jsonb)) end;
$$;
-- A new poll: 2 or more distinct options, choices up to the number of options and an optional
-- duration in whole days.
create or replace function private.forum_poll_input(poll jsonb)
returns jsonb language plpgsql immutable security invoker set search_path='' as $$
declare canonical jsonb:=private.forum_poll_canonical(poll); total integer;
begin
  if poll is null or jsonb_typeof(poll)='null' then return null; end if;
  if canonical is null then raise exception 'INVALID_POLL' using errcode='22023'; end if;
  if exists(select 1 from jsonb_object_keys(poll) k where k not in('question','options','max_choices','days')) then raise exception 'INVALID_POLL' using errcode='22023'; end if;
  total:=jsonb_array_length(canonical->'options');
  if not private.forum_valid_line(canonical->>'question',{{gameplay.forum.pollQuestionMaxLength}}) or total not between 2 and {{gameplay.forum.pollOptionsMax}}
    or exists(select 1 from jsonb_array_elements_text(canonical->'options') o where not private.forum_valid_line(o,{{gameplay.forum.pollOptionMaxLength}}))
    or (select count(distinct lower(o)) from jsonb_array_elements_text(canonical->'options') o)<>total then
    raise exception 'INVALID_POLL' using errcode='22023'; end if;
  -- Numbers are checked as text before any cast.
  if jsonb_typeof(canonical->'max_choices')<>'number' or (canonical->>'max_choices') !~ '^[1-9][0-9]?$' then raise exception 'INVALID_POLL' using errcode='22023'; end if;
  if (canonical->>'max_choices')::integer>total then raise exception 'INVALID_POLL' using errcode='22023'; end if;
  if jsonb_typeof(canonical->'days')<>'null' then
    if jsonb_typeof(canonical->'days')<>'number' or (canonical->>'days') !~ '^[1-9][0-9]{0,2}$' then raise exception 'INVALID_POLL' using errcode='22023'; end if;
    if (canonical->>'days')::integer>{{gameplay.forum.pollMaxDays}} then raise exception 'INVALID_POLL' using errcode='22023'; end if;
  end if;
  return canonical;
end;
$$;
create or replace function private.forum_poll_original(target_thread bigint)
returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('question',p.question,'options',(select jsonb_agg(o.label order by o.option_number) from private.forum_poll_options o where o.thread_id=p.thread_id),
    'max_choices',p.max_choices,'days',p.duration_days) from private.forum_polls p where p.thread_id=target_thread;
$$;
create or replace function private.forum_save_poll(target_thread bigint,poll jsonb,observed timestamptz)
returns void language sql volatile security invoker set search_path='' as $$
  insert into private.forum_polls(thread_id,question,max_choices,duration_days,closes_at,created_at)
    select target_thread,poll->>'question',(poll->>'max_choices')::smallint,(poll->>'days')::smallint,observed+make_interval(days=>(poll->>'days')::integer),observed
    where poll is not null;
  insert into private.forum_poll_options(thread_id,option_number,label)
    select target_thread,n,o from jsonb_array_elements_text(poll->'options') with ordinality x(o,n) where poll is not null;
$$;
-- A poll closes at its deadline, when its author or a moderator closes it, or when its thread is
-- locked, removed or moved to the closed board.
create or replace function private.forum_poll_closed(poll private.forum_polls,thread private.forum_threads,board private.forum_boards)
returns boolean language sql stable security invoker set search_path='' as $$
  select poll.closed_at is not null or coalesce(poll.closes_at<=statement_timestamp(),false) or poll.removed_at is not null
    or thread.locked_at is not null or thread.removed_at is not null or board.posting='closed';
$$;
-- Results appear once you have voted, when the poll has closed or when you cannot vote, so they
-- do not steer anyone who is still deciding. Moderators always see them.
create or replace function private.forum_poll_json(thread private.forum_threads,board private.forum_boards,viewer_id uuid,moderator boolean,may_vote boolean)
returns jsonb language sql stable security invoker set search_path='' as $$
  select case when p.removed_at is not null and not moderator then jsonb_build_object('removed',true) else
    jsonb_build_object('question',p.question,'max_choices',p.max_choices,'closes_at',p.closes_at,'closed',state.closed,'closed_by',p.closed_by,
      'removed',p.removed_at is not null,'voters',p.voter_count,'my_choices',coalesce(to_jsonb(v.choices),'[]'::jsonb),
      'can_vote',may_vote and not state.closed,'results',state.results,
      'can_close',not state.closed and thread.author_id is not distinct from viewer_id,
      'options',(select jsonb_agg(jsonb_build_object('number',o.option_number,'label',o.label,'votes',case when state.results then o.votes end) order by o.option_number)
        from private.forum_poll_options o where o.thread_id=p.thread_id)) end
  from private.forum_polls p
    left join private.forum_poll_votes v on v.thread_id=p.thread_id and v.character_id=viewer_id
    cross join lateral (select private.forum_poll_closed(p,thread,board) closed) closing
    cross join lateral (select closing.closed,moderator or closing.closed or v.character_id is not null or not may_vote results) state
  where p.thread_id=thread.id;
$$;
revoke all on function private.count_forum_poll_vote(),private.forum_poll_canonical(jsonb),private.forum_poll_input(jsonb),private.forum_poll_original(bigint),
  private.forum_save_poll(bigint,jsonb,timestamptz),private.forum_poll_closed(private.forum_polls,private.forum_threads,private.forum_boards),
  private.forum_poll_json(private.forum_threads,private.forum_boards,uuid,boolean,boolean) from public,anon,authenticated;

-- Voting sets your choices, so a repeated request changes nothing, and an empty list withdraws the
-- vote while the poll is open. New and banned captains cannot vote.
create or replace function private.vote_forum_poll(thread_id bigint,choices integer[])
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare viewer_id uuid:=private.combat_captain(); moderator boolean:=private.forum_is_moderator(); observed timestamptz:=clock_timestamp(); joined timestamptz;
  picked smallint[]; current_choices smallint[]; thread private.forum_threads%rowtype; board private.forum_boards%rowtype; poll private.forum_polls%rowtype;
begin
  if vote_forum_poll.thread_id is null or choices is null or cardinality(choices)>20 or array_position(choices,null) is not null
    or exists(select 1 from unnest(choices) c where c not between 1 and 20) then raise exception 'INVALID_REQUEST' using errcode='22023'; end if;
  select c.created_at into joined from public.characters c where c.id=viewer_id for no key update;
  select * into thread from private.forum_threads t where t.id=vote_forum_poll.thread_id;
  select * into board from private.forum_boards b where b.id=thread.board_id;
  if thread.id is null or ((thread.removed_at is not null or not board.active) and not moderator) then raise exception 'FORUM_NOT_FOUND' using errcode='P0002'; end if;
  select * into poll from private.forum_polls p where p.thread_id=thread.id for no key update;
  if not found or (poll.removed_at is not null and not moderator) then raise exception 'FORUM_NOT_FOUND' using errcode='P0002'; end if;
  if private.forum_poll_closed(poll,thread,board) then raise exception 'POLL_CLOSED' using errcode='P0001'; end if;
  perform private.forum_require_unbanned(viewer_id);
  if joined>observed-make_interval(hours=>{{gameplay.forum.newCharacterHours}}) then raise exception 'NEW_CHARACTER' using errcode='P0001'; end if;
  select array_agg(distinct c order by c)::smallint[] into picked from unnest(choices) c;
  if coalesce(cardinality(picked),0)<>cardinality(choices) or coalesce(cardinality(picked),0)>poll.max_choices
    or exists(select 1 from unnest(picked) c where not exists(select 1 from private.forum_poll_options o where o.thread_id=poll.thread_id and o.option_number=c)) then
    raise exception 'INVALID_VOTE' using errcode='22023'; end if;
  select v.choices into current_choices from private.forum_poll_votes v where v.thread_id=poll.thread_id and v.character_id=viewer_id;
  if picked is null then
    delete from private.forum_poll_votes v where v.thread_id=poll.thread_id and v.character_id=viewer_id;
  elsif current_choices is null then
    insert into private.forum_poll_votes(thread_id,character_id,choices,created_at,updated_at) values(poll.thread_id,viewer_id,picked,observed,observed);
  elsif current_choices<>picked then
    update private.forum_poll_votes v set choices=picked,updated_at=observed where v.thread_id=poll.thread_id and v.character_id=viewer_id;
  end if;
  return private.forum_poll_json(thread,board,viewer_id,moderator,true);
end;
$$;

-- The thread's author may close the poll early. Closing twice changes nothing.
create or replace function private.close_forum_poll(thread_id bigint)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare viewer_id uuid:=private.combat_captain(); moderator boolean:=private.forum_is_moderator(); observed timestamptz:=clock_timestamp();
  thread private.forum_threads%rowtype; board private.forum_boards%rowtype; poll private.forum_polls%rowtype; target bigint;
begin
  if close_forum_poll.thread_id is null then raise exception 'INVALID_REQUEST' using errcode='22023'; end if;
  select t.id into target from private.forum_threads t where t.id=close_forum_poll.thread_id for no key update;
  select * into thread from private.forum_threads t where t.id=target;
  select * into board from private.forum_boards b where b.id=thread.board_id;
  if thread.id is null or ((thread.removed_at is not null or not board.active) and not moderator) then raise exception 'FORUM_NOT_FOUND' using errcode='P0002'; end if;
  select * into poll from private.forum_polls p where p.thread_id=thread.id for no key update;
  if not found or (poll.removed_at is not null and not moderator) then raise exception 'FORUM_NOT_FOUND' using errcode='P0002'; end if;
  if thread.author_id is distinct from viewer_id then raise exception 'FORUM_FORBIDDEN' using errcode='42501'; end if;
  if not private.forum_poll_closed(poll,thread,board) then
    update private.forum_polls p set closed_at=observed,closed_by='author' where p.thread_id=poll.thread_id;
  end if;
  return private.forum_poll_json(thread,board,viewer_id,moderator,false);
end;
$$;
create or replace function public.vote_forum_poll(thread_id bigint,choices integer[])
returns jsonb language sql volatile security invoker set search_path='' as $$ select private.vote_forum_poll(thread_id,choices); $$;
create or replace function public.close_forum_poll(thread_id bigint)
returns jsonb language sql volatile security invoker set search_path='' as $$ select private.close_forum_poll(thread_id); $$;
revoke all on function private.vote_forum_poll(bigint,integer[]),public.vote_forum_poll(bigint,integer[]),private.close_forum_poll(bigint),public.close_forum_poll(bigint)
  from public,anon,authenticated;
grant execute on function private.vote_forum_poll(bigint,integer[]),public.vote_forum_poll(bigint,integer[]),private.close_forum_poll(bigint),public.close_forum_poll(bigint)
  to authenticated;
