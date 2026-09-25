-- Profiles share the existing public patient projection without exposing character data.
create or replace function public.get_hospital_status(target_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('hospital_until',(select hospital_until from public.hospital_patients
    where character_id=target_id and hospital_until>now()),'observed_at',now());
$$;
revoke all on function public.get_hospital_status(uuid) from public,anon,authenticated;
grant execute on function public.get_hospital_status(uuid) to authenticated;


-- Public location and deadlines resolve without requiring the owner to log in.
create or replace function public.get_character_status(target_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object(
    'character_level',p.character_level,
    'location',case when p.arrives_at<=statement_timestamp() then p.arrival_location else p.location end,
    'arrives_at',case when p.arrives_at>statement_timestamp() then p.arrives_at end,
    'max_sea_distance',greatest(p.max_sea_distance,
      case when p.arrives_at<=statement_timestamp() then p.arrival_max_sea_distance end),
    'hospital_until',(select hospital_until from public.hospital_patients
      where character_id=target_id and hospital_until>statement_timestamp()),
    'can_attack_here',private.can_attack_here(target_id),
    'presence',private.get_player_presence(target_id),
    'portrait_id',p.portrait_id,
    'observed_at',statement_timestamp())
  from public.character_profiles p where p.character_id=target_id;
$$;
revoke all on function public.get_character_status(uuid) from public,anon,authenticated;
grant execute on function public.get_character_status(uuid) to authenticated;


-- Portraits are cosmetic, so a captain may change one anywhere: in hospital, at sea or in combat.
-- Choosing the current portrait again changes nothing.
create or replace function private.set_portrait(portrait_id text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare viewer_id uuid:=private.combat_captain();
begin
  if set_portrait.portrait_id is null or not exists(select 1 from private.portrait_definitions d where d.id=set_portrait.portrait_id) then
    raise exception 'INVALID_PORTRAIT' using errcode='22023';
  end if;
  update public.characters c set portrait_id=set_portrait.portrait_id where c.id=viewer_id and c.portrait_id<>set_portrait.portrait_id;
  perform private.record_character_action(viewer_id);
  return jsonb_build_object('portrait_id',set_portrait.portrait_id);
end;
$$;
create or replace function public.set_portrait(portrait_id text)
returns jsonb language sql volatile security invoker set search_path='' as $$ select private.set_portrait(portrait_id); $$;
revoke all on function private.set_portrait(text),public.set_portrait(text) from public,anon,authenticated;
grant execute on function private.set_portrait(text),public.set_portrait(text) to authenticated;
