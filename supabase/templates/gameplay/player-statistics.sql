-- Keep only analytics timestamps. Removed accounts lose their auth identifier.
create table if not exists private.player_statistics_config (
  singleton boolean primary key default true check(singleton),
  tracked_since timestamptz not null default statement_timestamp()
);
insert into private.player_statistics_config(singleton) values(true) on conflict do nothing;
alter table private.player_statistics_config add column if not exists activity_tracked_since timestamptz not null default statement_timestamp();
create table if not exists private.player_statistics_accounts (
  id bigint generated always as identity primary key,
  user_id uuid unique references auth.users(id) on delete set null,
  registered_at timestamptz not null,
  last_sign_in_at timestamptz,
  deleted_at timestamptz
);
alter table private.player_statistics_accounts add column if not exists last_active_at timestamptz;
create index if not exists player_statistics_registered_idx on private.player_statistics_accounts(registered_at);
create index if not exists player_statistics_last_active_idx on private.player_statistics_accounts(last_active_at);
create table if not exists private.player_activity_daily (
  account_id bigint not null references private.player_statistics_accounts(id) on delete cascade,
  day date not null,
  first_at timestamptz not null,
  last_at timestamptz not null,
  primary key(day,account_id)
);
create index if not exists player_activity_account_idx on private.player_activity_daily(account_id);
alter table private.player_statistics_config enable row level security;
alter table private.player_statistics_accounts enable row level security;
alter table private.player_activity_daily enable row level security;
revoke all on private.player_statistics_config,private.player_statistics_accounts,private.player_activity_daily from public,anon,authenticated;
revoke all on sequence private.player_statistics_accounts_id_seq from public,anon,authenticated;

-- Known sign-ins contribute to recent unique accounts, not invented daily history.
insert into private.player_statistics_accounts(user_id,registered_at,last_sign_in_at,last_active_at)
select id,coalesce(created_at,statement_timestamp()),last_sign_in_at,last_sign_in_at from auth.users
where not coalesce(is_anonymous,false) and deleted_at is null
on conflict(user_id) do nothing;
update private.player_statistics_accounts set last_active_at=last_sign_in_at where last_active_at is null and last_sign_in_at is not null;

create or replace function private.track_player_statistics()
returns trigger language plpgsql security definer set search_path='' as $$
declare account_key bigint; login_changed boolean; observed timestamptz:=statement_timestamp();
begin
  if tg_op='DELETE' then
    update private.player_statistics_accounts set deleted_at=coalesce(deleted_at,observed) where user_id=old.id;
    return old;
  end if;
  if new.deleted_at is not null or coalesce(new.is_anonymous,false) then
    update private.player_statistics_accounts set deleted_at=coalesce(deleted_at,new.deleted_at,observed) where user_id=new.id;
    return new;
  end if;
  insert into private.player_statistics_accounts(user_id,registered_at,last_sign_in_at,last_active_at)
  values(new.id,coalesce(new.created_at,observed),new.last_sign_in_at,case when new.last_sign_in_at is not null then least(new.last_sign_in_at,observed) end)
  on conflict(user_id) do update set last_sign_in_at=greatest(private.player_statistics_accounts.last_sign_in_at,excluded.last_sign_in_at),
    last_active_at=greatest(private.player_statistics_accounts.last_active_at,excluded.last_active_at),deleted_at=null
  returning id into account_key;
  login_changed:=new.last_sign_in_at is not null;
  if tg_op='UPDATE' then login_changed:=login_changed and (old.last_sign_in_at is null or new.last_sign_in_at>old.last_sign_in_at); end if;
  if login_changed and new.last_sign_in_at between (select activity_tracked_since from private.player_statistics_config) and observed then
    insert into private.player_activity_daily(account_id,day,first_at,last_at)
    values(account_key,(new.last_sign_in_at at time zone 'UTC')::date,new.last_sign_in_at,new.last_sign_in_at)
    on conflict(day,account_id) do update set
      first_at=least(private.player_activity_daily.first_at,excluded.first_at),last_at=greatest(private.player_activity_daily.last_at,excluded.last_at);
  end if;
  return new;
end;
$$;
revoke all on function private.track_player_statistics() from public,anon,authenticated;
drop trigger if exists track_player_statistics_insert on auth.users;
drop trigger if exists track_player_statistics_update on auth.users;
drop trigger if exists track_player_statistics_delete on auth.users;
create trigger track_player_statistics_insert after insert on auth.users for each row execute function private.track_player_statistics();
create trigger track_player_statistics_update after update of last_sign_in_at,is_anonymous,deleted_at on auth.users for each row
  when ((new.last_sign_in_at,new.is_anonymous,new.deleted_at) is distinct from (old.last_sign_in_at,old.is_anonymous,old.deleted_at)) execute function private.track_player_statistics();
create trigger track_player_statistics_delete before delete on auth.users for each row execute function private.track_player_statistics();

create or replace function private.record_player_activity()
returns void language plpgsql volatile security definer set search_path='' as $$
declare observed timestamptz:=statement_timestamp(); account_key bigint;
begin
  if auth.uid() is null or not exists(select 1 from auth.users where id=auth.uid() and not coalesce(is_anonymous,false) and deleted_at is null)
    or not exists(select 1 from auth.sessions where user_id=auth.uid() and id::text=auth.jwt()->>'session_id' and (not_after is null or not_after>observed)) then
    raise exception 'UNAUTHORIZED' using errcode='42501';
  end if;
  -- Throttle writes across tabs, but never skip a new UTC day.
  update private.player_statistics_accounts set last_active_at=observed
  where user_id=auth.uid() and deleted_at is null and (last_active_at is null or last_active_at<=observed-interval '1 minute'
    or (last_active_at at time zone 'UTC')::date<(observed at time zone 'UTC')::date
    or not exists(select 1 from private.player_activity_daily d where d.account_id=private.player_statistics_accounts.id and d.day=(observed at time zone 'UTC')::date))
  returning id into account_key;
  if account_key is null then return; end if;
  insert into private.player_activity_daily(account_id,day,first_at,last_at)
  values(account_key,(observed at time zone 'UTC')::date,observed,observed)
  on conflict(day,account_id) do update set last_at=greatest(private.player_activity_daily.last_at,excluded.last_at);
end;
$$;
revoke all on function private.record_player_activity() from public,anon,authenticated;
grant execute on function private.record_player_activity() to authenticated;
create or replace function public.record_player_activity()
returns void language sql volatile security invoker set search_path='' as $$ select private.record_player_activity(); $$;
revoke all on function public.record_player_activity() from public,anon;
grant execute on function public.record_player_activity() to authenticated;

create or replace function private.admin_player_statistics(period text default '1m')
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare observed timestamptz:=statement_timestamp(); starts date; today date; tracking timestamptz; bucket_days integer; result jsonb;
begin
  perform private.require_admin();
  if period is null or period not in ('1m','12m','all') then raise exception 'INVALID_PLAYER_PERIOD' using errcode='22023'; end if;
  today:=(observed at time zone 'UTC')::date;
  starts:=case period when '1m' then (today-interval '1 month')::date+1 when '12m' then (today-interval '12 months')::date+1
    else least(today,coalesce((select min(registered_at at time zone 'UTC')::date from private.player_statistics_accounts),today)) end;
  bucket_days:=greatest(1,ceil((today-starts+1)::numeric/500)::integer);
  select activity_tracked_since into tracking from private.player_statistics_config;
  with accounts as materialized (select * from private.player_statistics_accounts where registered_at<=observed),
  current_accounts as (select * from accounts where user_id is not null and deleted_at is null),
  buckets as (select starts+n*bucket_days as day,least(today,starts+(n+1)*bucket_days-1) as until
    from generate_series(0,(today-starts)/bucket_days) n),
  registrations as (select ((registered_at at time zone 'UTC')::date-starts)/bucket_days bucket,count(*) n
    from accounts where (registered_at at time zone 'UTC')::date>=starts group by 1),
  removals as (select ((deleted_at at time zone 'UTC')::date-starts)/bucket_days bucket,count(*) n
    from accounts where deleted_at<=observed and (deleted_at at time zone 'UTC')::date>=starts group by 1),
  activity as (select (day-starts)/bucket_days bucket,count(distinct account_id) unique_players from private.player_activity_daily
    where day between starts and today and first_at<=observed group by 1),
  history as (
    select b.day,b.until,coalesce(r.n,0) registrations,coalesce(x.n,0) removals,
      (select count(*) from accounts where (registered_at at time zone 'UTC')::date<starts
        and (deleted_at is null or (deleted_at at time zone 'UTC')::date>=starts))
        +sum(coalesce(r.n,0)-coalesce(x.n,0)) over(order by b.day) accounts,
      case when b.until<(tracking at time zone 'UTC')::date then null else coalesce(a.unique_players,0) end unique_players
    from buckets b left join registrations r on r.bucket=(b.day-starts)/bucket_days
      left join removals x on x.bucket=(b.day-starts)/bucket_days left join activity a on a.bucket=(b.day-starts)/bucket_days
  )
  select jsonb_build_object('observed_at',observed,'period',period,'tracked_since',tracking,'bucket_days',bucket_days,
    'totals',jsonb_build_object('players',(select count(*)::text from public.characters c join current_accounts a on a.user_id=c.user_id),
      'accounts',(select count(*)::text from current_accounts),
      'without_character',(select count(*)::text from current_accounts a where not exists(select 1 from public.characters c where c.user_id=a.user_id)),
      'active_24h',(select count(*)::text from current_accounts where last_active_at between observed-interval '24 hours' and observed),
      'active_7d',(select count(*)::text from current_accounts where last_active_at between observed-interval '7 days' and observed),
      'active_1m',(select count(*)::text from current_accounts where last_active_at between observed-interval '1 month' and observed),
      'new_24h',(select count(*)::text from accounts where registered_at>=observed-interval '24 hours'),
      'new_7d',(select count(*)::text from accounts where registered_at>=observed-interval '7 days'),
      'new_1m',(select count(*)::text from accounts where registered_at>=observed-interval '1 month')),
    'period_totals',jsonb_build_object('new_accounts',(select sum(registrations)::text from history),
      'removed_accounts',(select sum(removals)::text from history),'net_growth',(select sum(registrations-removals)::text from history),
      'unique_active',(select count(*)::text from accounts where last_active_at between (starts::timestamp at time zone 'UTC') and observed)),
    'history',(select jsonb_agg(jsonb_build_object('at',day::timestamp at time zone 'UTC','until',until::timestamp at time zone 'UTC',
      'registrations',registrations::text,'removals',removals::text,'accounts',accounts::text,'unique_players',unique_players::text) order by day) from history)
  ) into result;
  return result;
end;
$$;
revoke all on function private.admin_player_statistics(text) from public,anon,authenticated;
grant execute on function private.admin_player_statistics(text) to authenticated;
create or replace function public.admin_player_statistics(period text default '1m')
returns jsonb language sql volatile security invoker set search_path='' as $$ select private.admin_player_statistics(period); $$;
revoke all on function public.admin_player_statistics(text) from public,anon;
grant execute on function public.admin_player_statistics(text) to authenticated;

create or replace function private.admin_players(search_term text default '',requested_page integer default 0,sort_by text default 'newest',activity text default 'all')
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare result jsonb; observed timestamptz:=statement_timestamp();
begin
  perform private.require_admin();
  if search_term is null or length(search_term)>200 or requested_page is null or requested_page<0
    or sort_by is null or sort_by not in ('newest','oldest','last_active','name') or activity is null or activity not in ('all','24h','7d','30d','inactive','never') then
    raise exception 'INVALID_PLAYER_FILTER' using errcode='22023';
  end if;
  with matching as materialized (
    select c.id,c.display_name,c.player_number,c.gold_coins::text,c.bank_gold_coins::text,c.energy,c.stamina,c.ship_health,c.crew_health,c.hospital_until,
      a.registered_at,a.last_active_at
    from public.characters c join private.player_statistics_accounts a on a.user_id=c.user_id and a.deleted_at is null
    where (position(lower(btrim(search_term)) in lower(c.display_name||' '||c.player_number::text||' '||c.id::text||' '||c.user_id::text))>0)
      and case activity when '24h' then a.last_active_at between observed-interval '24 hours' and observed
        when '7d' then a.last_active_at between observed-interval '7 days' and observed
        when '30d' then a.last_active_at between observed-interval '30 days' and observed
        when 'inactive' then a.last_active_at<observed-interval '30 days' or a.last_active_at is null
        when 'never' then a.last_active_at is null else true end
  ), bounds as (
    select count(*) total,least(requested_page,greatest(0,(count(*)-1)/50))::integer page from matching
  ), ordered as (
    select *,row_number() over(order by
      case when sort_by='last_active' then last_active_at end desc nulls last,
      case when sort_by='newest' then registered_at end desc,
      case when sort_by='oldest' then registered_at end asc,
      case when sort_by='name' then lower(display_name) end asc,player_number) ordinal from matching
  )
  select jsonb_build_object('total',b.total::text,'page',b.page,'page_size',50,'rows',coalesce((select jsonb_agg(to_jsonb(o)-'ordinal' order by ordinal)
    from ordered o where ordinal>b.page::bigint*50 and ordinal<=(b.page::bigint+1)*50),'[]'::jsonb)) into result from bounds b;
  return result;
end;
$$;
revoke all on function private.admin_players(text,integer,text,text) from public,anon,authenticated;
grant execute on function private.admin_players(text,integer,text,text) to authenticated;
create or replace function public.admin_players(search_term text default '',requested_page integer default 0,sort_by text default 'newest',activity text default 'all')
returns jsonb language sql volatile security invoker set search_path='' as $$ select private.admin_players(search_term,requested_page,sort_by,activity); $$;
revoke all on function public.admin_players(text,integer,text,text) from public,anon;
grant execute on function public.admin_players(text,integer,text,text) to authenticated;
