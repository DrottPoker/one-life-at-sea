create or replace function private.update_mail(mail_ids bigint[],operation text)
returns void language plpgsql volatile security definer set search_path='' as $$
declare viewer_id uuid:=private.combat_captain(); changed integer;
begin
  if mail_ids is null or cardinality(mail_ids) not between 1 and 100 or array_ndims(mail_ids)<>1 or array_position(mail_ids,null) is not null
    or operation is null or operation not in('read','unread','save','unsave','delete') then raise exception 'INVALID_REQUEST' using errcode='22023'; end if;
  perform 1 from public.characters where id=viewer_id for update;
  update private.mail_boxes b set
    read_at=case when direction='inbox' and operation='read' then coalesce(read_at,clock_timestamp()) when direction='inbox' and operation='unread' then null else read_at end,
    saved_at=case when operation='save' then coalesce(saved_at,clock_timestamp()) when operation='unsave' then null else saved_at end,
    deleted_at=case when operation='delete' then clock_timestamp() else deleted_at end
    where b.character_id=viewer_id and b.mail_id=any(mail_ids) and b.deleted_at is null
      and (operation='delete' or (operation='read' and direction='inbox' and read_at is null) or (operation='unread' and direction='inbox' and read_at is not null)
        or (operation='save' and saved_at is null) or (operation='unsave' and saved_at is not null));
  get diagnostics changed=row_count;
  if changed>0 then perform private.notify_training(viewer_id); end if;
end;
$$;
create or replace function public.update_mail(mail_ids bigint[],operation text) returns void language sql volatile security invoker set search_path='' as $$ select private.update_mail(mail_ids,operation); $$;

create or replace function private.set_mail_ignored(target_player_number bigint,ignored boolean)
returns void language plpgsql volatile security definer set search_path='' as $$
declare viewer_id uuid:=private.combat_captain(); target_id uuid; changed integer;
begin
  if ignored is null then raise exception 'INVALID_REQUEST' using errcode='22023'; end if;
  select id into target_id from public.characters where player_number=target_player_number;
  if target_id is null then raise exception 'PLAYER_NOT_FOUND' using errcode='P0002'; end if;
  if target_id=viewer_id then raise exception 'SELF_MESSAGE' using errcode='22023'; end if;
  perform 1 from public.characters where id in(viewer_id,target_id) order by id for update;
  if not exists(select 1 from public.characters where id=target_id) then raise exception 'PLAYER_NOT_FOUND' using errcode='P0002'; end if;
  if ignored then
    insert into private.mail_ignored(character_id,ignored_id) values(viewer_id,target_id) on conflict do nothing;
  else delete from private.mail_ignored where character_id=viewer_id and ignored_id=target_id;
  end if;
  get diagnostics changed=row_count;
  if changed>0 then perform private.notify_training(viewer_id); end if;
end;
$$;
create or replace function public.set_mail_ignored(target_player_number bigint,ignored boolean) returns void language sql volatile security invoker set search_path='' as $$ select private.set_mail_ignored(target_player_number,ignored); $$;
revoke all on function private.update_mail(bigint[],text),public.update_mail(bigint[],text),private.set_mail_ignored(bigint,boolean),public.set_mail_ignored(bigint,boolean) from public,anon,authenticated;
grant execute on function private.update_mail(bigint[],text),public.update_mail(bigint[],text),private.set_mail_ignored(bigint,boolean),public.set_mail_ignored(bigint,boolean) to authenticated;
-- Imported conversation tables remain an inaccessible archive. New writes use mail only.
revoke all on function private.send_player_message(bigint,text,uuid),public.send_player_message(bigint,text,uuid),
  private.get_message_inbox(bigint),public.get_message_inbox(bigint),private.get_message_conversation(bigint,bigint),public.get_message_conversation(bigint,bigint),
  private.mark_messages_read(bigint,bigint),public.mark_messages_read(bigint,bigint) from public,anon,authenticated;
