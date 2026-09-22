-- An immutable envelope has independent, owner-controlled mailbox copies.
create table if not exists private.mail_messages (
  id bigint generated always as identity primary key,
  sender_id uuid references public.characters(id) on delete set null,
  sender_name text not null,
  sender_player_number bigint not null,
  recipients jsonb not null check(jsonb_typeof(recipients)='array'),
  recipient_numbers bigint[] not null,
  request_id uuid not null,
  subject text not null default '',
  body text not null check(length(body)>0),
  sent_at timestamptz not null default clock_timestamp(),
  reply_to_id bigint references private.mail_messages(id) on delete set null,
  legacy_message_id bigint unique,
  search_vector tsvector generated always as (to_tsvector('simple',subject||' '||body||' '||sender_name)) stored,
  constraint mail_messages_request unique(sender_id,request_id)
);
create index if not exists mail_messages_search_idx on private.mail_messages using gin(search_vector);
create index if not exists mail_messages_reply_idx on private.mail_messages(reply_to_id);
create index if not exists mail_messages_sender_time_idx on private.mail_messages(sender_id,sent_at desc);
create table if not exists private.mail_boxes (
  mail_id bigint not null references private.mail_messages(id) on delete cascade,
  character_id uuid not null references public.characters(id) on delete cascade,
  direction text not null check(direction in('inbox','outbox')),
  read_at timestamptz,
  saved_at timestamptz,
  deleted_at timestamptz,
  primary key(mail_id,character_id)
);
create index if not exists mail_boxes_owner_idx on private.mail_boxes(character_id,mail_id desc);
create index if not exists mail_boxes_folder_idx on private.mail_boxes(character_id,direction,mail_id desc) where deleted_at is null;
create index if not exists mail_boxes_saved_idx on private.mail_boxes(character_id,mail_id desc) where deleted_at is null and saved_at is not null;
create index if not exists mail_boxes_unread_idx on private.mail_boxes(character_id,mail_id) where deleted_at is null and direction='inbox' and read_at is null;
create table if not exists private.mail_ignored (
  character_id uuid not null references public.characters(id) on delete cascade,
  ignored_id uuid not null references public.characters(id) on delete cascade,
  created_at timestamptz not null default clock_timestamp(),
  primary key(character_id,ignored_id), check(character_id<>ignored_id)
);
create index if not exists mail_ignored_target_idx on private.mail_ignored(ignored_id);
alter table private.mail_messages enable row level security;
alter table private.mail_boxes enable row level security;
alter table private.mail_ignored enable row level security;
revoke all on private.mail_messages,private.mail_boxes,private.mail_ignored from public,anon,authenticated;
revoke all on sequence private.mail_messages_id_seq from public,anon,authenticated;

-- Repeated configuration migrations must not reset read, saved or deleted state.
create or replace function private.import_legacy_mail()
returns void language plpgsql volatile security invoker set search_path='' as $$
begin
  insert into private.mail_messages(sender_id,sender_name,sender_player_number,recipients,recipient_numbers,request_id,body,sent_at,legacy_message_id)
  select m.sender_id,s.display_name,s.player_number,jsonb_build_array(jsonb_build_object('display_name',r.display_name,'player_number',r.player_number)),
    array[r.player_number],m.request_id,m.body,m.created_at,m.id
    from private.player_messages m join public.characters s on s.id=m.sender_id join public.characters r on r.id=m.recipient_id
    where not exists(select 1 from private.mail_messages existing where existing.legacy_message_id=m.id)
    order by m.id on conflict(legacy_message_id) do nothing;
  insert into private.mail_boxes(mail_id,character_id,direction,read_at)
    select n.id,o.sender_id,'outbox',o.created_at from private.mail_messages n join private.player_messages o on o.id=n.legacy_message_id
    union all
    select n.id,o.recipient_id,'inbox',o.read_at from private.mail_messages n join private.player_messages o on o.id=n.legacy_message_id
    on conflict(mail_id,character_id) do nothing;
  with previous as (select id,lag(id) over(partition by thread_id order by id) as parent from private.player_messages)
  update private.mail_messages m set reply_to_id=p.id from previous old join private.mail_messages p on p.legacy_message_id=old.parent
    where m.legacy_message_id=old.id and m.reply_to_id is null;
end;
$$;
revoke all on function private.import_legacy_mail() from public,anon,authenticated;
select private.import_legacy_mail();
