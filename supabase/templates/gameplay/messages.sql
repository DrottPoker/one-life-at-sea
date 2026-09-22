-- Private conversations are addressed through the other player's public number.
create table if not exists private.message_threads (
  id uuid primary key default gen_random_uuid(),
  participant_a uuid not null references public.characters(id) on delete cascade,
  participant_b uuid not null references public.characters(id) on delete cascade,
  latest_message_id bigint,
  constraint message_threads_pair unique(participant_a,participant_b),
  check(participant_a<participant_b)
);
create index if not exists message_threads_a_idx on private.message_threads(participant_a,latest_message_id desc);
create index if not exists message_threads_b_idx on private.message_threads(participant_b,latest_message_id desc);
create table if not exists private.player_messages (
  id bigint generated always as identity primary key,
  thread_id uuid not null references private.message_threads(id) on delete cascade,
  sender_id uuid not null references public.characters(id) on delete cascade,
  recipient_id uuid not null references public.characters(id) on delete cascade,
  request_id uuid not null,
  body text not null check(length(body)>0),
  created_at timestamptz not null default clock_timestamp(),
  read_at timestamptz,
  constraint player_messages_request unique(sender_id,request_id),
  check(sender_id<>recipient_id)
);
create index if not exists player_messages_thread_idx on private.player_messages(thread_id,id desc);
create index if not exists player_messages_unread_idx on private.player_messages(recipient_id,thread_id,id) where read_at is null;
create index if not exists player_messages_sender_time_idx on private.player_messages(sender_id,created_at desc);
alter table private.message_threads enable row level security;
alter table private.player_messages enable row level security;
revoke all on private.message_threads,private.player_messages from public,anon,authenticated;
revoke all on sequence private.player_messages_id_seq from public,anon,authenticated;

create or replace function private.get_message_summary()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare viewer_id uuid:=private.combat_captain();
begin
  return jsonb_build_object('unread_count',(select count(*) from private.player_messages where recipient_id=viewer_id and read_at is null));
end;
$$;
create or replace function public.get_message_summary()
returns jsonb language sql stable security invoker set search_path='' as $$ select private.get_message_summary(); $$;

create or replace function private.send_player_message(target_player_number bigint,message_body text,request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare viewer_id uuid:=private.combat_captain(); target_id uuid; thread_key uuid; saved private.player_messages%rowtype; normalized text;
begin
  if request_id is null or message_body is null then raise exception 'INVALID_MESSAGE' using errcode='22023'; end if;
  normalized:=btrim(replace(replace(message_body,E'\r\n',E'\n'),E'\r',E'\n'),E' \t\n');
  if length(normalized) not between 1 and {{gameplay.messages.maxLength}} or normalized !~ '[^[:space:]]' or translate(normalized,E'\t\n','') ~ '[[:cntrl:]]' then
    raise exception 'INVALID_MESSAGE' using errcode='22023';
  end if;
  select id into target_id from public.characters where player_number=target_player_number;
  if target_id is null then raise exception 'PLAYER_NOT_FOUND' using errcode='P0002'; end if;
  if target_id=viewer_id then raise exception 'SELF_MESSAGE' using errcode='22023'; end if;
  -- Match gameplay lock order before receipts, conversation and owner events.
  perform 1 from public.characters where id in(viewer_id,target_id) order by id for update;
  select * into saved from private.player_messages m where m.sender_id=viewer_id and m.request_id=send_player_message.request_id;
  if found then
    if saved.recipient_id<>target_id or saved.body<>normalized then raise exception 'REQUEST_MISMATCH' using errcode='22023'; end if;
    return jsonb_build_object('message_id',saved.id::text,'recipient_player_number',target_player_number,'created_at',saved.created_at);
  end if;
  if (select count(*) from private.player_messages where sender_id=viewer_id and created_at>clock_timestamp()-interval '1 minute') >= {{gameplay.messages.perMinute}} then
    raise exception 'MESSAGE_RATE_LIMIT' using errcode='P0001';
  end if;
  insert into private.message_threads(participant_a,participant_b) values(least(viewer_id,target_id),greatest(viewer_id,target_id))
    on conflict on constraint message_threads_pair do nothing;
  select id into thread_key from private.message_threads where participant_a=least(viewer_id,target_id) and participant_b=greatest(viewer_id,target_id) for update;
  insert into private.player_messages(thread_id,sender_id,recipient_id,request_id,body)
    values(thread_key,viewer_id,target_id,request_id,normalized) returning * into saved;
  update private.message_threads set latest_message_id=saved.id where id=thread_key;
  perform private.record_character_action(viewer_id);
  perform private.notify_training(least(viewer_id,target_id));
  perform private.notify_training(greatest(viewer_id,target_id));
  return jsonb_build_object('message_id',saved.id::text,'recipient_player_number',target_player_number,'created_at',saved.created_at);
end;
$$;
create or replace function public.send_player_message(target_player_number bigint,message_body text,request_id uuid)
returns jsonb language sql volatile security invoker set search_path='' as $$ select private.send_player_message(target_player_number,message_body,request_id); $$;

create or replace function private.get_message_inbox(before_id bigint default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare viewer_id uuid:=private.combat_captain(); items jsonb; next_id text;
begin
  if before_id is not null and before_id<1 then raise exception 'INVALID_REQUEST' using errcode='22023'; end if;
  with own_threads as (
    select id,participant_b as other_id,latest_message_id from private.message_threads where participant_a=viewer_id
    union all
    select id,participant_a,latest_message_id from private.message_threads where participant_b=viewer_id
  ), page as materialized (
    select * from own_threads where latest_message_id is not null and (before_id is null or latest_message_id<before_id)
    order by latest_message_id desc limit {{gameplay.messages.pageSize}}+1
  ), visible as (select * from page order by latest_message_id desc limit {{gameplay.messages.pageSize}})
  select coalesce(jsonb_agg(jsonb_build_object('player_number',c.player_number,'display_name',c.display_name,
    'last_message_id',m.id::text,'preview',left(m.body,160),'sent_by_you',m.sender_id=viewer_id,'created_at',m.created_at,
    'unread_count',(select count(*) from private.player_messages u where u.recipient_id=viewer_id and u.thread_id=v.id and u.read_at is null))
    order by v.latest_message_id desc),'[]'::jsonb),
    case when (select count(*) from page)>{{gameplay.messages.pageSize}} then min(v.latest_message_id)::text end
    into items,next_id from visible v join public.characters c on c.id=v.other_id join private.player_messages m on m.id=v.latest_message_id;
  return private.get_message_summary()||jsonb_build_object('items',items,'next_before',next_id);
end;
$$;
create or replace function public.get_message_inbox(before_id bigint default null)
returns jsonb language sql stable security invoker set search_path='' as $$ select private.get_message_inbox(before_id); $$;

create or replace function private.get_message_conversation(target_player_number bigint,before_id bigint default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare viewer_id uuid:=private.combat_captain(); target_id uuid; target_name text; thread_key uuid; items jsonb; next_id text; through_id text;
begin
  if before_id is not null and before_id<1 then raise exception 'INVALID_REQUEST' using errcode='22023'; end if;
  select id,display_name into target_id,target_name from public.characters where player_number=target_player_number;
  if target_id is null then return null; end if;
  if target_id=viewer_id then raise exception 'SELF_MESSAGE' using errcode='22023'; end if;
  select id into thread_key from private.message_threads where participant_a=least(viewer_id,target_id) and participant_b=greatest(viewer_id,target_id);
  with page as materialized (
    select id,body,sender_id,created_at,read_at from private.player_messages where thread_id=thread_key and (before_id is null or id<before_id)
    order by id desc limit {{gameplay.messages.conversationPageSize}}+1
  ), visible as (select * from page order by id desc limit {{gameplay.messages.conversationPageSize}})
  select coalesce(jsonb_agg(jsonb_build_object('id',id::text,'body',body,'sent_by_you',sender_id=viewer_id,'created_at',created_at,'read_at',read_at) order by id),'[]'::jsonb),
    case when (select count(*) from page)>{{gameplay.messages.conversationPageSize}} then min(id)::text end,
    max(id) filter(where sender_id<>viewer_id and read_at is null)::text
    into items,next_id,through_id from visible;
  return jsonb_build_object('player_number',target_player_number,'display_name',target_name,'items',items,'next_before',next_id,'read_through',through_id);
end;
$$;
create or replace function public.get_message_conversation(target_player_number bigint,before_id bigint default null)
returns jsonb language sql stable security invoker set search_path='' as $$ select private.get_message_conversation(target_player_number,before_id); $$;

create or replace function private.mark_messages_read(target_player_number bigint,through_id bigint)
returns void language plpgsql volatile security definer set search_path='' as $$
declare viewer_id uuid:=private.combat_captain(); target_id uuid; thread_key uuid;
begin
  if through_id is null or through_id<1 then raise exception 'INVALID_REQUEST' using errcode='22023'; end if;
  select id into target_id from public.characters where player_number=target_player_number;
  -- Serialize with send and gameplay; a read never locks the other player's state.
  perform 1 from public.characters where id=viewer_id for update;
  select id into thread_key from private.message_threads where participant_a=least(viewer_id,target_id) and participant_b=greatest(viewer_id,target_id);
  update private.player_messages set read_at=clock_timestamp()
    where thread_id=thread_key and recipient_id=viewer_id and id<=through_id and read_at is null;
  if found then perform private.notify_training(viewer_id); end if;
end;
$$;
create or replace function public.mark_messages_read(target_player_number bigint,through_id bigint)
returns void language sql volatile security invoker set search_path='' as $$ select private.mark_messages_read(target_player_number,through_id); $$;

revoke all on function private.get_message_summary(),public.get_message_summary(),
  private.send_player_message(bigint,text,uuid),public.send_player_message(bigint,text,uuid),
  private.get_message_inbox(bigint),public.get_message_inbox(bigint),
  private.get_message_conversation(bigint,bigint),public.get_message_conversation(bigint,bigint),
  private.mark_messages_read(bigint,bigint),public.mark_messages_read(bigint,bigint) from public,anon,authenticated;
grant execute on function private.get_message_summary(),public.get_message_summary(),
  private.send_player_message(bigint,text,uuid),public.send_player_message(bigint,text,uuid),
  private.get_message_inbox(bigint),public.get_message_inbox(bigint),
  private.get_message_conversation(bigint,bigint),public.get_message_conversation(bigint,bigint),
  private.mark_messages_read(bigint,bigint),public.mark_messages_read(bigint,bigint) to authenticated;
