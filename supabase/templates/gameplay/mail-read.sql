create or replace function private.get_message_summary()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare viewer_id uuid:=private.combat_captain();
begin
  return jsonb_build_object('unread_count',(select count(*) from private.mail_boxes where character_id=viewer_id and direction='inbox' and deleted_at is null and read_at is null));
end;
$$;

create or replace function private.get_mail_summary()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare viewer_id uuid:=private.combat_captain(); result jsonb;
begin
  select jsonb_build_object('inbox',count(*) filter(where direction='inbox'),'outbox',count(*) filter(where direction='outbox'),
    'saved',count(*) filter(where saved_at is not null),'unread_count',count(*) filter(where direction='inbox' and read_at is null)) into result
    from private.mail_boxes where character_id=viewer_id and deleted_at is null;
  return result||jsonb_build_object('ignored',(select count(*) from private.mail_ignored where character_id=viewer_id));
end;
$$;

-- This serializer is private: every caller must supply an owner-filtered mailbox.
create or replace function private.mail_json(m private.mail_messages,b private.mail_boxes,include_body boolean default false)
returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('id',m.id::text,'subject',m.subject,'sender',jsonb_build_object('display_name',m.sender_name,'player_number',m.sender_player_number),
    'recipients',case when b.direction='outbox' then m.recipients else '[]'::jsonb end,'direction',b.direction,
    'sent_at',m.sent_at,'read_at',b.read_at,'saved',b.saved_at is not null,'can_reply',b.direction='inbox' and m.sender_id is not null,
    'reply_to_id',case when exists(select 1 from private.mail_boxes parent where parent.mail_id=m.reply_to_id and parent.character_id=b.character_id and parent.deleted_at is null) then m.reply_to_id::text else null end)
    ||case when include_body then jsonb_build_object('body',m.body) else '{}'::jsonb end;
$$;
revoke all on function private.mail_json(private.mail_messages,private.mail_boxes,boolean) from public,anon,authenticated;

create or replace function private.get_mailbox(folder text default 'inbox',query text default '',page integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare viewer_id uuid:=private.combat_captain(); total bigint; current_page integer; items jsonb; search tsquery;
begin
  if folder is null or folder not in('inbox','outbox','saved') or query is null or length(query)>200 or page is null or page<0 then
    raise exception 'INVALID_REQUEST' using errcode='22023';
  end if;
  if btrim(query)<>'' then search:=websearch_to_tsquery('simple',query); end if;
  select count(*) into total from private.mail_boxes b join private.mail_messages m on m.id=b.mail_id
    where b.character_id=viewer_id and b.deleted_at is null and (b.direction=folder or (folder='saved' and b.saved_at is not null))
    and (search is null or m.search_vector@@search);
  current_page:=least(page,greatest(0,((total-1)/{{gameplay.messages.pageSize}})::integer));
  select coalesce(jsonb_agg(row.item order by row.id desc),'[]'::jsonb) into items from (
    select m.id,private.mail_json(m,b) item from private.mail_boxes b join private.mail_messages m on m.id=b.mail_id
    where b.character_id=viewer_id and b.deleted_at is null and (b.direction=folder or (folder='saved' and b.saved_at is not null))
      and (search is null or m.search_vector@@search)
    order by m.id desc limit {{gameplay.messages.pageSize}} offset current_page*{{gameplay.messages.pageSize}}
  ) row;
  return jsonb_build_object('items',items,'total',total,'page',current_page,'page_size',{{gameplay.messages.pageSize}});
end;
$$;

create or replace function private.get_mail(mail_id bigint,include_history boolean default false)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare viewer_id uuid:=private.combat_captain(); result jsonb; history jsonb:='[]';
begin
  select private.mail_json(m,b,true) into result from private.mail_messages m join private.mail_boxes b on b.mail_id=m.id
    where m.id=get_mail.mail_id and b.character_id=viewer_id and b.deleted_at is null;
  if result is null then raise exception 'MAIL_NOT_FOUND' using errcode='P0002'; end if;
  if include_history then
    with recursive ancestors as (
      select m.reply_to_id id,1 depth from private.mail_messages m where m.id=get_mail.mail_id
      union all
      select m.reply_to_id,a.depth+1 from ancestors a join private.mail_messages m on m.id=a.id where a.depth<{{gameplay.messages.conversationPageSize}}
    ) select coalesce(jsonb_agg(private.mail_json(m,b,true) order by a.depth desc),'[]'::jsonb) into history
      from ancestors a join private.mail_messages m on m.id=a.id join private.mail_boxes b on b.mail_id=m.id
      where b.character_id=viewer_id and b.deleted_at is null;
  end if;
  return result||jsonb_build_object('history',history);
end;
$$;

create or replace function private.get_mail_ignored()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare viewer_id uuid:=private.combat_captain();
begin
  return coalesce((select jsonb_agg(jsonb_build_object('player_number',c.player_number,'display_name',c.display_name) order by c.display_name,c.player_number)
    from private.mail_ignored i join public.characters c on c.id=i.ignored_id where i.character_id=viewer_id),'[]'::jsonb);
end;
$$;
create or replace function public.get_mail_summary() returns jsonb language sql stable security invoker set search_path='' as $$ select private.get_mail_summary(); $$;
create or replace function public.get_mailbox(folder text default 'inbox',query text default '',page integer default 0) returns jsonb language sql stable security invoker set search_path='' as $$ select private.get_mailbox(folder,query,page); $$;
create or replace function public.get_mail(mail_id bigint,include_history boolean default false) returns jsonb language sql stable security invoker set search_path='' as $$ select private.get_mail(mail_id,include_history); $$;
create or replace function public.get_mail_ignored() returns jsonb language sql stable security invoker set search_path='' as $$ select private.get_mail_ignored(); $$;
revoke all on function private.get_mail_summary(),public.get_mail_summary(),private.get_mailbox(text,text,integer),public.get_mailbox(text,text,integer),private.get_mail(bigint,boolean),public.get_mail(bigint,boolean),private.get_mail_ignored(),public.get_mail_ignored() from public,anon,authenticated;
grant execute on function private.get_mail_summary(),public.get_mail_summary(),private.get_mailbox(text,text,integer),public.get_mailbox(text,text,integer),private.get_mail(bigint,boolean),public.get_mail(bigint,boolean),private.get_mail_ignored(),public.get_mail_ignored() to authenticated;
