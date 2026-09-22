-- Durable inbox; only authenticated owner RPCs expose notification data.
create table if not exists private.player_notifications (
  id bigint generated always as identity primary key,
  character_id uuid not null references public.characters(id) on delete cascade,
  kind text not null check(kind ~ '^[a-z][a-z0-9_.]{0,63}$'),
  event_key text not null check(length(event_key) between 1 and 200),
  payload jsonb not null check(jsonb_typeof(payload)='object'),
  created_at timestamptz not null default clock_timestamp(),
  read_at timestamptz,
  constraint player_notifications_event_key unique(character_id,kind,event_key)
);
create index if not exists player_notifications_inbox_idx on private.player_notifications(character_id,id desc);
create index if not exists player_notifications_unread_idx on private.player_notifications(character_id,id) where read_at is null;
alter table private.player_notifications enable row level security;
revoke all on private.player_notifications from public,anon,authenticated;
revoke all on sequence private.player_notifications_id_seq from public,anon,authenticated;

-- Emit in the same transaction as the event. Replays keep the original payload/read state.
create or replace function private.emit_notification(recipient_id uuid,event_kind text,event_key text,event_payload jsonb,event_at timestamptz default clock_timestamp())
returns bigint language plpgsql volatile security invoker set search_path='' as $$
declare notification_id bigint;
begin
  insert into private.player_notifications(character_id,kind,event_key,payload,created_at)
    values(recipient_id,event_kind,event_key,event_payload,event_at)
    on conflict on constraint player_notifications_event_key do nothing returning id into notification_id;
  if notification_id is not null then
    perform private.notify_training(recipient_id);
  else
    select n.id into notification_id from private.player_notifications n
      where n.character_id=recipient_id and n.kind=event_kind and n.event_key=emit_notification.event_key;
  end if;
  return notification_id;
end;
$$;
revoke all on function private.emit_notification(uuid,text,text,jsonb,timestamptz) from public,anon,authenticated;

create or replace function private.notify_completed_attack()
returns trigger language plpgsql volatile security invoker set search_path='' as $$
declare attackers jsonb;
begin
  select jsonb_agg(jsonb_build_object('name',p.snapshot->>'name',
    'player_number',coalesce(p.snapshot->'player_number',to_jsonb(c.player_number))) order by p.joined_at,p.character_id)
    into attackers from private.combat_participants p
    join public.characters c on c.id=p.character_id where p.combat_id=new.id;
  -- Older encounter formats may have no participant rows.
  if attackers is null then
    attackers:=jsonb_build_array(jsonb_build_object('name',new.state#>>'{attacker,name}',
      'player_number',coalesce(new.state#>'{attacker,player_number}',
        (select to_jsonb(player_number) from public.characters where id=new.attacker_id))));
  end if;
  perform private.emit_notification(new.defender_id,'combat.attacked',new.id::text,
    jsonb_build_object('version',1,'battle_id',new.id,'attackers',attackers,'outcome',new.state->'outcome',
      'hospitalized',coalesce((new.state#>>'{defender,ship_health}')::integer=0
        or (new.state#>>'{defender,crew_health}')::integer=0,false)),coalesce(new.finished_at,clock_timestamp()));
  return new;
end;
$$;
revoke all on function private.notify_completed_attack() from public,anon,authenticated;
drop trigger if exists notify_completed_attack on private.combats;
create trigger notify_completed_attack after update on private.combats
  for each row when (old.status='active' and new.status='completed') execute function private.notify_completed_attack();

-- Enrich existing attack notifications without changing read state or creating duplicates.
with updated as (
  update private.player_notifications n set payload=n.payload||jsonb_build_object('outcome',b.state->'outcome')
    from private.combats b where n.kind='combat.attacked' and n.payload->>'version'='1'
      and not (n.payload ? 'outcome') and n.event_key=b.id::text and n.character_id=b.defender_id
      and b.status='completed'
    returning n.character_id
)
select private.notify_training(character_id) from (select distinct character_id from updated) recipients;

create or replace function private.get_notification_summary()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare viewer_id uuid:=private.combat_captain();
begin
  return jsonb_build_object('unread_count',(select count(*) from private.player_notifications where character_id=viewer_id and read_at is null),
    'latest_id',(select n.id::text from private.player_notifications n where n.character_id=viewer_id order by n.id desc limit 1));
end;
$$;
revoke all on function private.get_notification_summary() from public,anon,authenticated;
grant execute on function private.get_notification_summary() to authenticated;
create or replace function public.get_notification_summary()
returns jsonb language sql stable security invoker set search_path='' as $$ select private.get_notification_summary(); $$;
revoke all on function public.get_notification_summary() from public,anon,authenticated;
grant execute on function public.get_notification_summary() to authenticated;

create or replace function private.get_notifications(before_id bigint default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare viewer_id uuid:=private.combat_captain(); items jsonb; next_id text;
begin
  if before_id is not null and before_id<1 then raise exception 'INVALID_REQUEST' using errcode='22023'; end if;
  with page as materialized (
    select id,kind,payload,created_at,read_at from private.player_notifications
    where character_id=viewer_id and (before_id is null or id<before_id)
    order by id desc limit {{gameplay.notifications.pageSize}}+1
  ), visible as (select * from page order by id desc limit {{gameplay.notifications.pageSize}})
  select coalesce(jsonb_agg(jsonb_build_object('id',id::text,'kind',kind,'payload',payload,'created_at',created_at,'read_at',read_at) order by id desc),'[]'::jsonb),
    case when (select count(*) from page)>{{gameplay.notifications.pageSize}} then min(id)::text end
    into items,next_id from visible;
  return private.get_notification_summary()||jsonb_build_object('items',items,'next_before',next_id);
end;
$$;
revoke all on function private.get_notifications(bigint) from public,anon,authenticated;
grant execute on function private.get_notifications(bigint) to authenticated;
create or replace function public.get_notifications(before_id bigint default null)
returns jsonb language sql stable security invoker set search_path='' as $$ select private.get_notifications(before_id); $$;
revoke all on function public.get_notifications(bigint) from public,anon,authenticated;
grant execute on function public.get_notifications(bigint) to authenticated;

create or replace function private.mark_notification_read(notification_id bigint)
returns void language plpgsql volatile security definer set search_path='' as $$
declare viewer_id uuid:=private.combat_captain();
begin
  if notification_id is null or notification_id<1 then raise exception 'INVALID_REQUEST' using errcode='22023'; end if;
  update private.player_notifications set read_at=clock_timestamp()
    where character_id=viewer_id and id=notification_id and read_at is null;
  if found then perform private.notify_training(viewer_id); end if;
end;
$$;
revoke all on function private.mark_notification_read(bigint) from public,anon,authenticated;
grant execute on function private.mark_notification_read(bigint) to authenticated;
create or replace function public.mark_notification_read(notification_id bigint)
returns void language sql volatile security invoker set search_path='' as $$ select private.mark_notification_read(notification_id); $$;
revoke all on function public.mark_notification_read(bigint) from public,anon,authenticated;
grant execute on function public.mark_notification_read(bigint) to authenticated;

create or replace function private.mark_all_notifications_read(through_id bigint)
returns void language plpgsql volatile security definer set search_path='' as $$
declare viewer_id uuid:=private.combat_captain();
begin
  if through_id is null or through_id<1 then raise exception 'INVALID_REQUEST' using errcode='22023'; end if;
  perform 1 from private.player_notifications where character_id=viewer_id and id<=through_id and read_at is null order by id for update;
  update private.player_notifications set read_at=clock_timestamp()
    where character_id=viewer_id and id<=through_id and read_at is null;
  if found then perform private.notify_training(viewer_id); end if;
end;
$$;
revoke all on function private.mark_all_notifications_read(bigint) from public,anon,authenticated;
grant execute on function private.mark_all_notifications_read(bigint) to authenticated;
create or replace function public.mark_all_notifications_read(through_id bigint)
returns void language sql volatile security invoker set search_path='' as $$ select private.mark_all_notifications_read(through_id); $$;
revoke all on function public.mark_all_notifications_read(bigint) from public,anon,authenticated;
grant execute on function public.mark_all_notifications_read(bigint) to authenticated;
