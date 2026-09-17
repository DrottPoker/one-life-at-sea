-- Development names may contain any characters and have no game length limit.
alter table public.characters
  drop constraint characters_name_length,
  drop constraint characters_name_characters,
  add constraint characters_name_required check (btrim(display_name) <> '');

create or replace function public.is_character_name_available(candidate text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  with proposed as (
    select normalize(regexp_replace(btrim(coalesce(candidate, '')), '[[:space:]]+', ' ', 'g'), NFC) as name
  )
  select btrim(name) <> ''
    and not exists (select 1 from public.characters where name_key = lower(proposed.name))
  from proposed;
$$;
