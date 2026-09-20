alter table private.item_definitions add column tradable boolean not null default true;

create table private.market_listings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.characters(id) on delete cascade,
  item_id text not null references private.item_definitions(id),
  entry_type text not null check(entry_type in ('stack','instance')),
  original_entry_id uuid not null,
  quantity bigint not null check(quantity between 0 and 9007199254740991),
  initial_quantity bigint not null check(initial_quantity between 1 and 9007199254740991),
  sold_quantity bigint not null default 0 check(sold_quantity>=0),
  returned_quantity bigint not null default 0 check(returned_quantity>=0),
  unit_price bigint not null check(unit_price between 1 and 9007199254740991),
  fee_bps integer not null check(fee_bps between 0 and 10000),
  fee_paid bigint not null default 0 check(fee_paid>=0),
  damage numeric(12,2),
  accuracy numeric(5,2),
  item_created_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  closed_at timestamptz,
  check(quantity+sold_quantity+returned_quantity=initial_quantity),
  check(unit_price::numeric*initial_quantity<=9007199254740991),
  check((quantity=0)=(closed_at is not null)),
  check((entry_type='stack' and damage is null and accuracy is null)
    or (entry_type='instance' and initial_quantity=1 and damage between 0 and 1000000000 and accuracy between 0 and 100)),
  check((entry_type='instance')=(damage is not null and accuracy is not null))
);
create index market_listings_offers_idx on private.market_listings(item_id,unit_price,created_at,id) where quantity>0;
create index market_listings_owner_idx on private.market_listings(seller_id,created_at desc,id) where quantity>0;
create unique index market_listings_instance_idx on private.market_listings(original_entry_id) where entry_type='instance' and quantity>0;
create index market_listings_seller_fk_idx on private.market_listings(seller_id);

create table private.market_requests (
  character_id uuid not null references public.characters(id) on delete cascade,
  request_id uuid not null,
  payload jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key(character_id,request_id)
);
create table private.market_sales (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid references private.market_listings(id) on delete set null,
  item_id text not null references private.item_definitions(id),
  buyer_id uuid references public.characters(id) on delete set null,
  seller_id uuid references public.characters(id) on delete set null,
  quantity bigint not null check(quantity between 1 and 9007199254740991),
  unit_price bigint not null check(unit_price between 1 and 9007199254740991),
  gross bigint not null check(gross between 1 and 9007199254740991),
  fee bigint not null check(fee between 0 and gross),
  sold_at timestamptz not null default clock_timestamp(),
  check(gross=quantity::numeric*unit_price),
  check(buyer_id is distinct from seller_id or buyer_id is null)
);
create index market_sales_recent_idx on private.market_sales(sold_at,item_id) include(quantity);
create index market_sales_item_idx on private.market_sales(item_id);
create index market_sales_listing_idx on private.market_sales(listing_id);
create index market_sales_buyer_idx on private.market_sales(buyer_id);
create index market_sales_seller_idx on private.market_sales(seller_id);

alter table private.market_listings enable row level security;
alter table private.market_requests enable row level security;
alter table private.market_sales enable row level security;
revoke all on private.market_listings,private.market_requests,private.market_sales from public,anon,authenticated;

create table public.market_item_events (
  item_id text primary key references private.item_definitions(id),
  revision bigint not null default 1
);
alter table public.market_item_events enable row level security;
revoke all on public.market_item_events from public,anon,authenticated;
grant select on public.market_item_events to authenticated;
create policy market_events_registered_read on public.market_item_events for select to authenticated
  using ((select private.is_registered_player()));
alter publication supabase_realtime add table public.market_item_events;
comment on table private.market_listings is 'Escrowed items. Transfers preserve instance identity, stats and world circulation.';
comment on table private.market_sales is 'Completed sales only; rolling popularity is based on units sold.';
