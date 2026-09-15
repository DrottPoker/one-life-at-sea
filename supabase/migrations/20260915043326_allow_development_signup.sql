alter function private.is_verified_player() rename to is_registered_player;

-- Email confirmation is disabled for the initial development release.
create or replace function private.is_registered_player()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1 from auth.users
    where id = auth.uid() and coalesce(is_anonymous, false) = false
  );
$$;
revoke all on function private.is_registered_player() from public, anon;
grant execute on function private.is_registered_player() to authenticated;
