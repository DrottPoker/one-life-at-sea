-- Keep shared profile details separate from private character state.
create table public.character_profiles (
  character_id uuid primary key references public.characters(id) on delete cascade,
  display_name text not null,
  location text not null,
  created_at timestamptz not null
);
alter table public.character_profiles enable row level security;
revoke all on public.character_profiles from public, anon, authenticated;
grant select on public.character_profiles to authenticated;
create policy character_profiles_read on public.character_profiles
for select to authenticated using ((select private.is_registered_player()));

create function private.sync_character_profile()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.character_profiles(character_id, display_name, location, created_at)
  values (new.id, new.display_name, new.location, new.created_at)
  on conflict (character_id) do update
    set display_name = excluded.display_name,
        location = excluded.location,
        created_at = excluded.created_at
    where (character_profiles.display_name, character_profiles.location, character_profiles.created_at)
      is distinct from (excluded.display_name, excluded.location, excluded.created_at);
  return new;
end;
$$;
revoke all on function private.sync_character_profile() from public, anon, authenticated;

create trigger characters_sync_profile
after insert or update of display_name, location, created_at on public.characters
for each row execute function private.sync_character_profile();

insert into public.character_profiles(character_id, display_name, location, created_at)
select id, display_name, location, created_at from public.characters;

comment on table public.character_profiles is 'Read-only character identity for registered players. No account IDs, email, resources or combat stats.';
