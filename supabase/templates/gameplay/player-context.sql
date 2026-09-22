-- Read identity and configuration without settling or locking gameplay state.
create or replace function private.get_player_context()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare captain jsonb;
begin
  if auth.uid() is null or not private.is_registered_player() then return null; end if;
  select to_jsonb(c) into captain from public.characters c where c.user_id=auth.uid();
  return jsonb_build_object('character',captain,'is_admin',public.is_admin(),
    'config_revision',public.get_gameplay_revision());
end;
$$;
create or replace function public.get_player_context()
returns jsonb language sql stable security invoker set search_path='' as $$ select private.get_player_context(); $$;

-- One authoritative snapshot replaces separate resource, skill and inbox reads.
create or replace function private.get_player_snapshot()
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare state jsonb;
begin
  state:=private.get_game_state();
  if state is null then return null; end if;
  return jsonb_build_object('state',state,'skills',private.get_own_skills(),
    'notifications',private.get_notification_summary(),'messages',private.get_message_summary());
end;
$$;
create or replace function public.get_player_snapshot()
returns jsonb language sql volatile security invoker set search_path='' as $$ select private.get_player_snapshot(); $$;
revoke all on function private.get_player_context(),public.get_player_context(),
  private.get_player_snapshot(),public.get_player_snapshot() from public,anon,authenticated;
grant execute on function private.get_player_context(),public.get_player_context(),
  private.get_player_snapshot(),public.get_player_snapshot() to authenticated;
