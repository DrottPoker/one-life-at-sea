-- Selectable captain portraits. Only the IDs from config reach SQL; names and artwork are for the frontend.
-- Runs first because the profile synchronization in sea-travel copies the chosen portrait.
create table if not exists private.portrait_definitions (
  id text primary key, position integer not null check(position>=0)
);
alter table private.portrait_definitions enable row level security;
revoke all on private.portrait_definitions from public,anon,authenticated;
{{portraits.catalogSql}}
alter table public.characters add column if not exists portrait_id text not null default {{gameplay.portraits.defaultId}}
  references private.portrait_definitions(id);
alter table public.characters alter column portrait_id set default {{gameplay.portraits.defaultId}};
alter table public.character_profiles add column if not exists portrait_id text not null default {{gameplay.portraits.defaultId}};
alter table public.character_profiles alter column portrait_id set default {{gameplay.portraits.defaultId}};
