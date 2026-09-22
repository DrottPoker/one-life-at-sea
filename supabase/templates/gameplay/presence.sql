-- Presence leases are per browser tab and live Auth session.
create table if not exists private.player_presence (
  session_id uuid not null references auth.sessions(id) on delete cascade,
  tab_id uuid not null,
  character_id uuid not null references public.characters(id) on delete cascade,
  seen_at timestamptz not null,
  active boolean not null,
  primary key(session_id,tab_id)
);
create index if not exists player_presence_character_idx on private.player_presence(character_id);
create table if not exists private.character_actions (
  character_id uuid primary key references public.characters(id) on delete cascade,
  last_action_at timestamptz not null
);
alter table private.player_presence enable row level security;
alter table private.character_actions enable row level security;
revoke all on private.player_presence,private.character_actions from public,anon,authenticated;

create or replace function private.record_character_action(target_id uuid)
returns void language sql volatile security definer set search_path='' as $$
  insert into private.character_actions(character_id,last_action_at)
  select id,statement_timestamp() from public.characters where id=target_id and user_id=auth.uid()
  on conflict(character_id) do update
    set last_action_at=greatest(private.character_actions.last_action_at,excluded.last_action_at);
$$;
revoke all on function private.record_character_action(uuid) from public,anon,authenticated;

create or replace function private.record_player_presence(tab_id uuid,is_active boolean,page_action boolean,closed boolean)
returns void language plpgsql volatile security definer set search_path='' as $$
declare observed timestamptz:=statement_timestamp(); session_key uuid; captain_id uuid;
begin
  select s.id into session_key from auth.sessions s join auth.users u on u.id=s.user_id
    where s.user_id=auth.uid() and s.id::text=auth.jwt()->>'session_id'
      and (s.not_after is null or s.not_after>observed) and u.deleted_at is null and not coalesce(u.is_anonymous,false);
  if session_key is null then raise exception 'UNAUTHORIZED' using errcode='42501'; end if;
  if tab_id is null or is_active is null or page_action is null or closed is null then
    raise exception 'INVALID_REQUEST' using errcode='22023'; end if;
  select id into captain_id from public.characters where user_id=auth.uid();
  if captain_id is null then return; end if;
  delete from private.player_presence p where p.character_id=captain_id
    and (p.seen_at<=observed-make_interval(secs=>{{gameplay.presence.leaseSeconds}})
      or (closed and p.session_id=session_key and p.tab_id=record_player_presence.tab_id));
  if closed then return; end if;
  insert into private.player_presence(session_id,tab_id,character_id,seen_at,active)
    values(session_key,tab_id,captain_id,observed,is_active)
    on conflict on constraint player_presence_pkey do update set seen_at=excluded.seen_at,active=excluded.active
      where player_presence.seen_at<=observed-interval '10 seconds' or player_presence.active<>excluded.active;
  if page_action then perform private.record_character_action(captain_id); end if;
end;
$$;
revoke all on function private.record_player_presence(uuid,boolean,boolean,boolean) from public,anon,authenticated;
grant execute on function private.record_player_presence(uuid,boolean,boolean,boolean) to authenticated;
create or replace function public.record_player_presence(tab_id uuid,is_active boolean,page_action boolean default false,closed boolean default false)
returns void language sql volatile security invoker set search_path='' as $$
  select private.record_player_presence(tab_id,is_active,page_action,closed);
$$;
revoke all on function public.record_player_presence(uuid,boolean,boolean,boolean) from public,anon;
grant execute on function public.record_player_presence(uuid,boolean,boolean,boolean) to authenticated;

create or replace function private.get_player_presence(target_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare connected_until timestamptz; online_until timestamptz; last_action timestamptz;
begin
  if not private.is_registered_player() then return null; end if;
  select max(least(p.seen_at+make_interval(secs=>{{gameplay.presence.leaseSeconds}}),s.not_after)),
    max(least(p.seen_at+make_interval(secs=>{{gameplay.presence.leaseSeconds}}),s.not_after)) filter(where p.active)
    into connected_until,online_until
    from private.player_presence p join auth.sessions s on s.id=p.session_id
    join public.characters c on c.id=p.character_id and c.user_id=s.user_id
    join auth.users u on u.id=c.user_id
    where p.character_id=target_id and u.deleted_at is null and not coalesce(u.is_anonymous,false)
      and (s.not_after is null or s.not_after>statement_timestamp());
  select last_action_at into last_action from private.character_actions where character_id=target_id;
  return jsonb_build_object('online_until',online_until,'connected_until',connected_until,'last_action_at',last_action);
end;
$$;
revoke all on function private.get_player_presence(uuid) from public,anon,authenticated;
grant execute on function private.get_player_presence(uuid) to authenticated;

-- Only new receipts count; replays, rejected actions and passive updates do not.
create or replace function private.track_character_action()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform private.record_character_action(new.character_id);
  return new;
end;
$$;
revoke all on function private.track_character_action() from public,anon,authenticated;
do $$
declare source_table text;
begin
  foreach source_table in array array['activity_requests','crafting_requests','training_requests','bank_transfers','tavern_requests',
    'inventory_requests','market_requests','sea_travel_requests','sea_scouts','combat_participants'] loop
    execute format('drop trigger if exists record_character_action on private.%I',source_table);
    execute format('create trigger record_character_action after insert on private.%I for each row execute function private.track_character_action()',source_table);
  end loop;
end;
$$;
