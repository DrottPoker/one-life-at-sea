-- Account and character creation share the Auth transaction.
create function private.create_signup_character()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(new.is_anonymous, false) then
    return new;
  end if;

  insert into public.characters (user_id, display_name)
  values (
    new.id,
    normalize(regexp_replace(btrim(coalesce(new.raw_user_meta_data ->> 'character_name', '')), '[[:space:]]+', ' ', 'g'), NFC)
  );
  return new;
end;
$$;
revoke all on function private.create_signup_character() from public, anon, authenticated;

create trigger create_character_after_signup
after insert on auth.users
for each row execute function private.create_signup_character();

-- Expose only availability, never character rows or account information.
create function public.is_character_name_available(candidate text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with proposed as (
    select normalize(regexp_replace(btrim(coalesce(candidate, '')), '[[:space:]]+', ' ', 'g'), NFC) as name
  )
  select char_length(name) between 3 and 24
    and name ~ '^[[:alpha:]][[:alpha:] ''-]*[[:alpha:]]$'
    and not exists (select 1 from public.characters where name_key = lower(proposed.name))
  from proposed;
$$;
revoke all on function public.is_character_name_available(text) from public;
grant execute on function public.is_character_name_available(text) to anon, authenticated;

comment on function private.create_signup_character() is 'Creates a registered account character atomically; invalid or taken names roll back the account.';
comment on function public.is_character_name_available(text) is 'Registration availability hint only. The unique constraint resolves races.';
