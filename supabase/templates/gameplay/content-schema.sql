-- Admin-authored content survives later configuration migrations.
alter table private.item_definitions add column if not exists managed_by_admin boolean not null default false;
alter table private.item_definitions drop constraint if exists item_definitions_image_path_check;
alter table private.item_definitions add constraint item_definitions_image_path_check check (
  image_path='/images/items/placeholder.svg'
  or image_path ~ '^/images/items/[a-z0-9-]+\.(png|webp)$'
  or image_path ~ '^/api/item-images/[0-9a-f-]{36}/[0-9a-f-]{36}\.(png|jpg|webp)$'
);
alter table private.item_definitions alter column image_path set default '/images/items/placeholder.svg';

create table if not exists private.loot_tables (
  id text primary key check(id ~ '^[a-z][a-z0-9_]{0,47}$'),
  name text not null check(length(btrim(name)) between 1 and 100),
  description text not null default '' check(length(description)<=2000),
  active boolean not null default true,
  version uuid not null default gen_random_uuid()
);
create table if not exists private.loot_entries (
  loot_table_id text not null references private.loot_tables(id),
  item_id text not null references private.item_definitions(id),
  mode text not null check(mode in ('fixed','weighted')),
  fixed_chance numeric not null default 0 check(fixed_chance between 0 and 100 and fixed_chance=trunc(fixed_chance,4)),
  weight_start numeric not null default 0 check(weight_start between 0 and 1000000 and weight_start=trunc(weight_start,4)),
  weight_end numeric not null default 0 check(weight_end between 0 and 1000000 and weight_end=trunc(weight_end,4)),
  quantity integer not null default 1 check(quantity between 1 and 100),
  primary key(loot_table_id,item_id),
  check((mode='fixed' and fixed_chance>0 and weight_start=0 and weight_end=0)
    or (mode='weighted' and fixed_chance=0 and (weight_start>0 or weight_end>0)))
);
create index if not exists loot_entries_item_idx on private.loot_entries(item_id);
-- Equipment from loot rolls its own Quality, so entries no longer carry fixed stats.
alter table private.loot_entries drop column if exists damage,drop column if exists accuracy;
alter table private.loot_tables enable row level security;
alter table private.loot_entries enable row level security;
revoke all on private.loot_tables,private.loot_entries from public,anon,authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('item-images','item-images',true,4194304,array['image/png','image/jpeg','image/webp'])
on conflict(id) do update set public=true,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists "Admins upload item images" on storage.objects;
create policy "Admins upload item images" on storage.objects for insert to authenticated with check (
  bucket_id='item-images' and (select public.is_admin())
  and (storage.foldername(name))[1]=(select auth.uid())::text
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(png|jpg|webp)$'
);
