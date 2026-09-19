-- Profiles share the existing public patient projection without exposing character data.
create or replace function public.get_hospital_status(target_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('hospital_until',(select hospital_until from public.hospital_patients
    where character_id=target_id and hospital_until>now()),'observed_at',now());
$$;
revoke all on function public.get_hospital_status(uuid) from public,anon,authenticated;
grant execute on function public.get_hospital_status(uuid) to authenticated;

