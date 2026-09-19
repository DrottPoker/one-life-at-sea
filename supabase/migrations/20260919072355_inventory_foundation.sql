create table private.item_categories (
  id text primary key check (id ~ '^[a-z][a-z0-9_]{0,47}$'),
  name text not null check (length(name) between 1 and 60),
  position integer not null check (position >= 0)
);
create table private.item_definitions (
  id text primary key check (id ~ '^[a-z][a-z0-9_]{0,47}$'),
  category_id text not null references private.item_categories(id),
  name text not null check (length(name) between 1 and 100),
  description text not null check (length(description) between 1 and 2000),
  effect_description text not null check (length(effect_description) between 1 and 1000),
  image_path text not null check (image_path ~ '^/images/items/[a-z0-9-]+\.(png|webp)$'),
  kind text not null check (kind in ('equipment','consumable','passive')),
  stackable boolean not null,
  slot text check (slot in ('crew_weapon','cannons')),
  active boolean not null default true,
  unique(id,stackable),
  check (stackable = (kind <> 'equipment')),
  check ((kind = 'equipment' and slot is not null) or (kind <> 'equipment' and slot is null))
);
create index item_definitions_category_idx on private.item_definitions(category_id);
create table private.item_stacks (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.characters(id) on delete cascade,
  item_id text not null,
  stackable boolean not null default true check (stackable),
  quantity bigint not null check (quantity between 1 and 9007199254740991),
  created_at timestamptz not null default clock_timestamp(),
  unique(character_id,item_id),
  foreign key(item_id,stackable) references private.item_definitions(id,stackable)
);
create index item_stacks_definition_idx on private.item_stacks(item_id,stackable);
create table private.item_instances (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.characters(id) on delete cascade,
  item_id text not null,
  stackable boolean not null default false check (not stackable),
  damage numeric(12,2) not null check (damage between 0 and 1000000000),
  accuracy numeric(5,2) not null check (accuracy between 0 and 100),
  created_at timestamptz not null default clock_timestamp(),
  foreign key(item_id,stackable) references private.item_definitions(id,stackable)
);
create index item_instances_owner_idx on private.item_instances(character_id,item_id,id);
create index item_instances_definition_idx on private.item_instances(item_id,stackable);
create table private.inventory_requests (
  character_id uuid not null references public.characters(id) on delete cascade,
  request_id uuid not null,
  payload jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key(character_id,request_id)
);
alter table private.item_categories enable row level security;
alter table private.item_definitions enable row level security;
alter table private.item_stacks enable row level security;
alter table private.item_instances enable row level security;
alter table private.inventory_requests enable row level security;
revoke all on private.item_categories,private.item_definitions,private.item_stacks,
  private.item_instances,private.inventory_requests from public,anon,authenticated;
comment on table private.item_instances is 'Owned equipment with durable per-instance stats; no combat effects yet.';
comment on table private.inventory_requests is 'Private receipts for atomic, retry-safe item destruction.';
