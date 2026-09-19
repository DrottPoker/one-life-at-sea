
-- Add progression without rewriting existing stats, resources or coin balances.
create table private.training_tiers (
  training_group text not null check(training_group in ('crew','ship')),
  id text not null,
  position integer not null check(position>=0),
  name text not null,
  xp_required bigint not null check(xp_required between 0 and 9007199254740991),
  gold_cost bigint not null check(gold_cost between 0 and 9007199254740991),
  stat_gain bigint not null check(stat_gain between 1 and 9007199254740991),
  primary key(training_group,id),
  unique(training_group,position)
);
create table private.ship_work_sizes (
  id text primary key,
  name text not null,
  units integer not null check(units>0),
  duration_seconds integer not null check(duration_seconds>0)
);
create table private.character_training (
  character_id uuid not null references public.characters(id) on delete cascade,
  training_group text not null,
  tier_id text not null,
  xp bigint not null default 0 check(xp between 0 and 9007199254740991),
  primary key(character_id,training_group),
  foreign key(training_group,tier_id) references private.training_tiers(training_group,id)
);
create index character_training_tier_idx on private.character_training(training_group,tier_id);
create table private.training_requests (
  character_id uuid not null references public.characters(id) on delete cascade,
  request_id uuid not null,
  action text not null,
  payload jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key(character_id,request_id)
);
create table private.ship_upgrade_jobs (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.characters(id) on delete cascade,
  stat text not null check(stat in ('attack','defense','speed','accuracy')),
  size_id text not null,
  workshop_id text not null,
  workshop_name text not null,
  energy_cost integer not null check(energy_cost>0),
  stat_gain bigint not null check(stat_gain between 1 and 9007199254740991),
  xp_gain bigint not null check(xp_gain between 1 and 9007199254740991),
  config_revision text not null,
  started_at timestamptz not null,
  finishes_at timestamptz not null,
  applied_at timestamptz,
  check(finishes_at>started_at),
  check(applied_at is null or applied_at>=finishes_at)
);
create unique index ship_upgrade_one_pending_idx on private.ship_upgrade_jobs(character_id) where applied_at is null;
create index ship_upgrade_history_idx on private.ship_upgrade_jobs(character_id,finishes_at desc,id);
alter table private.training_tiers enable row level security;
alter table private.ship_work_sizes enable row level security;
alter table private.character_training enable row level security;
alter table private.training_requests enable row level security;
alter table private.ship_upgrade_jobs enable row level security;
revoke all on private.training_tiers,private.ship_work_sizes,private.character_training,private.training_requests,private.ship_upgrade_jobs from public,anon,authenticated;
alter table public.characters alter column ship_attack type bigint,
  add constraint characters_ship_attack_safe_check check(ship_attack<=9007199254740991);
alter table public.characters alter column ship_defense type bigint,
  add constraint characters_ship_defense_safe_check check(ship_defense<=9007199254740991);
alter table public.characters alter column ship_speed type bigint,
  add constraint characters_ship_speed_safe_check check(ship_speed<=9007199254740991);
alter table public.characters alter column ship_accuracy type bigint,
  add constraint characters_ship_accuracy_safe_check check(ship_accuracy<=9007199254740991);
alter table public.characters alter column crew_attack type bigint,
  add constraint characters_crew_attack_safe_check check(crew_attack<=9007199254740991);
alter table public.characters alter column crew_defense type bigint,
  add constraint characters_crew_defense_safe_check check(crew_defense<=9007199254740991);
alter table public.characters alter column crew_speed type bigint,
  add constraint characters_crew_speed_safe_check check(crew_speed<=9007199254740991);
alter table public.characters alter column crew_accuracy type bigint,
  add constraint characters_crew_accuracy_safe_check check(crew_accuracy<=9007199254740991);
drop function public.train_stat(text,text);
drop function private.train_stat(text,text);
