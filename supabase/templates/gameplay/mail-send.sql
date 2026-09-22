create or replace function private.send_mail(target_numbers bigint[],mail_subject text,mail_body text,request_id uuid,reply_to_id bigint default null)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare viewer_id uuid:=private.combat_captain(); targets bigint[]; participants uuid[]; recipient_data jsonb;
  saved private.mail_messages%rowtype; actor public.characters%rowtype; parent_sender bigint; normalized text; title text; owner_id uuid;
begin
  if request_id is null or target_numbers is null or array_ndims(target_numbers)<>1 or cardinality(target_numbers)=0
    or cardinality(target_numbers)>50 or array_position(target_numbers,null) is not null
    or mail_body is null or mail_subject is null then raise exception 'INVALID_MAIL' using errcode='22023'; end if;
  targets:=array(select distinct n from unnest(target_numbers) n order by n);
  normalized:=btrim(replace(replace(mail_body,E'\r\n',E'\n'),E'\r',E'\n'),E' \t\n');
  title:=btrim(mail_subject);
  -- A completed request remains confirmable if recipients later ignore or leave.
  select * into saved from private.mail_messages m where m.sender_id=viewer_id and m.request_id=send_mail.request_id;
  if found then
    if saved.recipient_numbers<>targets or saved.body<>normalized or saved.subject<>title or saved.reply_to_id is distinct from send_mail.reply_to_id then
      -- Legacy sends acquire a history parent during import, without changing the original request.
      if not (saved.legacy_message_id is not null and send_mail.reply_to_id is null and saved.recipient_numbers=targets and saved.body=normalized and saved.subject=title) then
        raise exception 'REQUEST_MISMATCH' using errcode='22023';
      end if;
    end if;
    return jsonb_build_object('mail_id',saved.id::text,'recipient_count',cardinality(saved.recipient_numbers),'sent_at',saved.sent_at);
  end if;
  if cardinality(target_numbers)>{{gameplay.messages.maxRecipients}} then
    raise exception 'TOO_MANY_RECIPIENTS' using errcode='22023';
  end if;
  if length(normalized) not between 1 and {{gameplay.messages.maxLength}} or normalized !~ '[^[:space:]]'
    or translate(normalized,E'\t\n','') ~ '[[:cntrl:]]' or length(title)>{{gameplay.messages.subjectMaxLength}} or title ~ '[[:cntrl:]]' then
    raise exception 'INVALID_MAIL' using errcode='22023';
  end if;
  select array_agg(id order by id) into participants from public.characters where player_number=any(targets);
  if cardinality(participants) is distinct from cardinality(targets) then raise exception 'RECIPIENT_UNAVAILABLE' using errcode='P0002'; end if;
  if viewer_id=any(participants) then raise exception 'SELF_MESSAGE' using errcode='22023'; end if;
  -- All recipients and the sender use gameplay's deterministic character lock order.
  perform 1 from public.characters where id=viewer_id or id=any(participants) order by id for update;
  select * into actor from public.characters where id=viewer_id;
  select * into saved from private.mail_messages m where m.sender_id=viewer_id and m.request_id=send_mail.request_id;
  if found then
    if saved.recipient_numbers<>targets or saved.body<>normalized or saved.subject<>title or saved.reply_to_id is distinct from send_mail.reply_to_id then
      raise exception 'REQUEST_MISMATCH' using errcode='22023';
    end if;
    return jsonb_build_object('mail_id',saved.id::text,'recipient_count',cardinality(saved.recipient_numbers),'sent_at',saved.sent_at);
  end if;
  select jsonb_agg(jsonb_build_object('display_name',display_name,'player_number',player_number) order by player_number) into recipient_data
    from public.characters where id=any(participants);
  if jsonb_array_length(recipient_data) is distinct from cardinality(targets) or exists(select 1 from private.mail_ignored where character_id=any(participants) and ignored_id=viewer_id) then
    raise exception 'RECIPIENT_UNAVAILABLE' using errcode='P0002';
  end if;
  if send_mail.reply_to_id is not null then
    select m.sender_player_number into parent_sender from private.mail_messages m join private.mail_boxes b on b.mail_id=m.id
      where m.id=send_mail.reply_to_id and b.character_id=viewer_id and b.direction='inbox' and b.deleted_at is null and m.sender_id is not null;
    if parent_sender is null or targets<>array[parent_sender] then raise exception 'INVALID_REPLY' using errcode='22023'; end if;
  end if;
  if coalesce((select sum(cardinality(recipient_numbers)) from private.mail_messages where sender_id=viewer_id and sent_at>clock_timestamp()-interval '1 minute'),0)+cardinality(targets)>{{gameplay.messages.perMinute}} then
    raise exception 'MESSAGE_RATE_LIMIT' using errcode='P0001';
  end if;
  insert into private.mail_messages(sender_id,sender_name,sender_player_number,recipients,recipient_numbers,request_id,subject,body,reply_to_id)
    values(viewer_id,actor.display_name,actor.player_number,recipient_data,targets,request_id,title,normalized,send_mail.reply_to_id) returning * into saved;
  insert into private.mail_boxes(mail_id,character_id,direction,read_at) values(saved.id,viewer_id,'outbox',saved.sent_at);
  insert into private.mail_boxes(mail_id,character_id,direction) select saved.id,id,'inbox' from unnest(participants) id;
  perform private.record_character_action(viewer_id);
  for owner_id in select id from public.characters where id=viewer_id or id=any(participants) order by id loop
    perform private.notify_training(owner_id);
  end loop;
  return jsonb_build_object('mail_id',saved.id::text,'recipient_count',cardinality(saved.recipient_numbers),'sent_at',saved.sent_at);
end;
$$;
create or replace function public.send_mail(target_numbers bigint[],mail_subject text,mail_body text,request_id uuid,reply_to_id bigint default null)
returns jsonb language sql volatile security invoker set search_path='' as $$ select private.send_mail(target_numbers,mail_subject,mail_body,request_id,reply_to_id); $$;
revoke all on function private.send_mail(bigint[],text,text,uuid,bigint),public.send_mail(bigint[],text,text,uuid,bigint) from public,anon,authenticated;
grant execute on function private.send_mail(bigint[],text,text,uuid,bigint),public.send_mail(bigint[],text,text,uuid,bigint) to authenticated;
