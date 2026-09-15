create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

-- Read server-owned verification state without exposing auth.users.
create function private.is_verified_player()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1 from auth.users
    where id = auth.uid()
      and email_confirmed_at is not null
      and coalesce(is_anonymous, false) = false
  );
$$;
revoke all on function private.is_verified_player() from public, anon;
grant execute on function private.is_verified_player() to authenticated;

create table public.characters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  display_name text not null,
  name_key text generated always as (lower(display_name)) stored,
  location text not null default 'the_harbor',
  created_at timestamptz not null default now(),
  constraint characters_one_per_user unique (user_id),
  constraint characters_unique_name unique (name_key),
  constraint characters_name_length check (char_length(display_name) between 3 and 24),
  constraint characters_name_characters check (display_name ~ '^[[:alpha:]][[:alpha:] ''-]*[[:alpha:]]$'),
  constraint characters_name_normalized check (
    display_name = normalize(regexp_replace(btrim(display_name), '[[:space:]]+', ' ', 'g'), NFC)
  ),
  constraint characters_start_location check (location = 'the_harbor')
);

alter table public.characters enable row level security;
revoke all on public.characters from public, anon, authenticated;
grant select on public.characters to authenticated;
grant insert (display_name) on public.characters to authenticated;

create policy characters_read_own on public.characters
for select to authenticated
using ((select auth.uid()) = user_id and (select private.is_verified_player()));

create policy characters_create_own on public.characters
for insert to authenticated
with check ((select auth.uid()) = user_id and (select private.is_verified_player()));

comment on table public.characters is 'Private character identity. One character per account in the first release.';
