-- Preserve imported conversation data; no legacy conversation API remains.
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

drop function if exists public.send_player_message(bigint,text,uuid);
drop function if exists private.send_player_message(bigint,text,uuid);
drop function if exists public.get_message_inbox(bigint);
drop function if exists private.get_message_inbox(bigint);
drop function if exists public.get_message_conversation(bigint,bigint);
drop function if exists private.get_message_conversation(bigint,bigint);
drop function if exists public.mark_messages_read(bigint,bigint);
drop function if exists private.mark_messages_read(bigint,bigint);
