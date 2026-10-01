-- Forum settings per captain: a short text signature and whether to show other signatures.
create table if not exists private.forum_profiles (
  character_id uuid primary key references public.characters(id) on delete cascade,
  signature text not null default '' check(length(signature)<=500),
  signature_updated_at timestamptz,
  show_signatures boolean not null default true
);
alter table private.forum_profiles enable row level security;
revoke all on private.forum_profiles from public,anon,authenticated;

-- Signatures are short: a few lines of the post markup, where images show only as a placeholder.
create or replace function private.forum_valid_signature(value text)
returns boolean language sql immutable security invoker set search_path='' as $$
  select value is not null and (value='' or (value=private.forum_normalize(value) and length(value)<={{gameplay.forum.signatureMaxLength}}
    and translate(value,E'\n','') !~ '[[:cntrl:]]' and cardinality(string_to_array(value,E'\n'))<={{gameplay.forum.signatureMaxLines}}));
$$;
create or replace function private.forum_settings_json(viewer_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('signature',coalesce(f.signature,''),'show_signatures',coalesce(f.show_signatures,true),'ban',private.forum_active_ban(c.id),
    'can_sign',private.forum_active_ban(c.id) is null and c.created_at<=statement_timestamp()-make_interval(hours=>{{gameplay.forum.newCharacterHours}}))
  from public.characters c left join private.forum_profiles f on f.character_id=c.id where c.id=viewer_id;
$$;
revoke all on function private.forum_valid_signature(text),private.forum_settings_json(uuid) from public,anon,authenticated;

create or replace function private.get_forum_settings()
returns jsonb language sql stable security definer set search_path='' as $$ select private.forum_settings_json(private.combat_captain()); $$;
-- Saving the same settings again changes nothing. A banned or new captain may clear a signature
-- but not write a new one.
create or replace function private.set_forum_settings(signature text,show_signatures boolean)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare viewer_id uuid:=private.combat_captain(); observed timestamptz:=clock_timestamp(); new_signature text:=private.forum_normalize(signature);
  joined timestamptz; previous text; changed boolean;
begin
  if signature is null or set_forum_settings.show_signatures is null then raise exception 'INVALID_REQUEST' using errcode='22023'; end if;
  select c.created_at into joined from public.characters c where c.id=viewer_id for no key update;
  select f.signature into previous from private.forum_profiles f where f.character_id=viewer_id;
  changed:=new_signature<>coalesce(previous,'');
  if changed and new_signature<>'' then
    perform private.forum_require_unbanned(viewer_id);
    if joined>observed-make_interval(hours=>{{gameplay.forum.newCharacterHours}}) then raise exception 'NEW_CHARACTER' using errcode='P0001'; end if;
    if not private.forum_valid_signature(new_signature) then raise exception 'INVALID_SIGNATURE' using errcode='22023'; end if;
  end if;
  insert into private.forum_profiles(character_id,signature,signature_updated_at,show_signatures)
    values(viewer_id,new_signature,case when changed then observed end,set_forum_settings.show_signatures)
    on conflict(character_id) do update set signature=excluded.signature,show_signatures=excluded.show_signatures,
      signature_updated_at=case when changed then excluded.signature_updated_at else private.forum_profiles.signature_updated_at end;
  return private.forum_settings_json(viewer_id);
end;
$$;
create or replace function public.get_forum_settings()
returns jsonb language sql stable security invoker set search_path='' as $$ select private.get_forum_settings(); $$;
create or replace function public.set_forum_settings(signature text,show_signatures boolean)
returns jsonb language sql volatile security invoker set search_path='' as $$ select private.set_forum_settings(signature,show_signatures); $$;
revoke all on function private.get_forum_settings(),public.get_forum_settings(),private.set_forum_settings(text,boolean),public.set_forum_settings(text,boolean)
  from public,anon,authenticated;
grant execute on function private.get_forum_settings(),public.get_forum_settings(),private.set_forum_settings(text,boolean),public.set_forum_settings(text,boolean)
  to authenticated;

-- Popular threads are ranked every few minutes instead of on every page load. Replies, other
-- captains who reply and likes given within the window count; newer activity breaks ties.
create table if not exists private.forum_popular_threads (
  rank smallint primary key check(rank between 1 and 20),
  thread_id bigint not null unique references private.forum_threads(id),
  score integer not null check(score>0),
  replies integer not null check(replies>=0), repliers integer not null check(repliers>=0), likes integer not null check(likes>=0),
  computed_at timestamptz not null
);
alter table private.forum_popular_threads enable row level security;
revoke all on private.forum_popular_threads from public,anon,authenticated;
create index if not exists forum_posts_created_idx on private.forum_posts(created_at);
create index if not exists forum_reactions_created_idx on private.forum_reactions(created_at);
create or replace function private.refresh_forum_popular()
returns void language plpgsql volatile security definer set search_path='' as $$
declare observed timestamptz:=clock_timestamp(); since timestamptz;
begin
  since:=observed-make_interval(hours=>{{gameplay.forum.popularWindowHours}});
  perform pg_advisory_xact_lock(hashtextextended('forum-popular-threads',58213));
  delete from private.forum_popular_threads where true;
  insert into private.forum_popular_threads(rank,thread_id,score,replies,repliers,likes,computed_at)
    select row_number() over(order by ranked.score desc,ranked.last_post_at desc,ranked.id desc),ranked.id,ranked.score,ranked.replies,ranked.repliers,ranked.likes,observed
    from (select t.id,t.last_post_at,a.replies,a.repliers,a.likes,a.replies+2*a.repliers+a.likes score
      from (select activity.thread_id,sum(activity.replies)::integer replies,sum(activity.repliers)::integer repliers,sum(activity.likes)::integer likes
        from (select p.thread_id,count(*) filter(where p.author_id is distinct from t.author_id) replies,
            count(distinct p.author_id) filter(where p.author_id is distinct from t.author_id) repliers,0 likes
            from private.forum_posts p join private.forum_threads t on t.id=p.thread_id
            where p.created_at>since and p.post_number>1 and p.removed_at is null group by p.thread_id
          union all
          select p.thread_id,0,0,count(*) from private.forum_reactions r join private.forum_posts p on p.id=r.post_id
            where r.created_at>since and r.value=1 and p.removed_at is null group by p.thread_id) activity
        group by activity.thread_id) a
      join private.forum_threads t on t.id=a.thread_id join private.forum_boards b on b.id=t.board_id
      where t.removed_at is null and b.active and b.posting<>'closed' and a.replies+2*a.repliers+a.likes>0
      order by score desc,t.last_post_at desc,t.id desc limit {{gameplay.forum.popularThreadsCount}}) ranked;
end;
$$;
revoke all on function private.refresh_forum_popular() from public,anon,authenticated;
select cron.schedule('forum-popular-threads','*/5 * * * *','select private.refresh_forum_popular()');
select private.refresh_forum_popular();
