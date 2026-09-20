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
    'location',case when p.arrives_at<=statement_timestamp() then p.arrival_location else p.location end,
    'arrives_at',case when p.arrives_at>statement_timestamp() then p.arrives_at end,
    'max_sea_distance',greatest(p.max_sea_distance,
      case when p.arrives_at<=statement_timestamp() then p.arrival_max_sea_distance end),
    'hospital_until',(select hospital_until from public.hospital_patients
      where character_id=target_id and hospital_until>statement_timestamp()),
    'can_attack_here',private.can_attack_here(target_id),
    'observed_at',statement_timestamp())
  from public.character_profiles p where p.character_id=target_id;
$$;
revoke all on function public.get_character_status(uuid) from public,anon,authenticated;
grant execute on function public.get_character_status(uuid) to authenticated;
