
alter table public.characters
  add column hospital_started_at timestamptz,
  add column hospital_until timestamptz,
  add constraint characters_hospital_period_check check(
    (hospital_started_at is null and hospital_until is null) or
    (hospital_started_at is not null and hospital_until is not null and hospital_until>hospital_started_at));
create table public.hospital_patients (
  character_id uuid primary key references public.characters(id) on delete cascade,
  display_name text not null,
  hospital_until timestamptz not null
);
create index hospital_patients_expiry_idx on public.hospital_patients(hospital_until,character_id);
create index hospital_patients_name_idx on public.hospital_patients(display_name,character_id);
alter table public.hospital_patients enable row level security;
revoke all on public.hospital_patients from public,anon,authenticated;
grant select on public.hospital_patients to authenticated;
create policy hospital_patients_read on public.hospital_patients for select to authenticated
using ((select private.is_registered_player()) and hospital_until>now());
alter publication supabase_realtime add table public.hospital_patients;
