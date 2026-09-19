alter table public.characters
  add column gold_coins bigint not null default 0,
  add column bank_gold_coins bigint not null default 0,
  add constraint characters_gold_coins_check check (gold_coins between 0 and 9007199254740991),
  add constraint characters_bank_gold_coins_check check (bank_gold_coins between 0 and 9007199254740991);

create table private.bank_transfers (
  character_id uuid not null references public.characters(id) on delete cascade,
  request_id uuid not null,
  direction text not null check (direction in ('deposit', 'withdraw')),
  amount bigint not null check (amount > 0),
  gold_coins bigint not null check (gold_coins >= 0),
  bank_gold_coins bigint not null check (bank_gold_coins >= 0),
  created_at timestamptz not null default clock_timestamp(),
  primary key (character_id, request_id)
);
alter table private.bank_transfers enable row level security;
revoke all on private.bank_transfers from public, anon, authenticated;
comment on column public.characters.gold_coins is 'Carried Gold Coins. Only this balance may fund purchases.';
comment on column public.characters.bank_gold_coins is 'Stored Gold Coins. Withdraw before spending.';
comment on table private.bank_transfers is 'Private transfer receipts prevent duplicate debits on retries.';
