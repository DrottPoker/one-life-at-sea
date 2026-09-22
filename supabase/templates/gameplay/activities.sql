create table if not exists private.activity_definitions (
  id text primary key, skill_id text not null references private.skill_definitions(id),
  xp_gain bigint not null check(xp_gain between 1 and 9007199254740991),
  active boolean not null, position integer not null
);
create table if not exists private.activity_requests (
  character_id uuid not null references public.characters(id) on delete cascade,
  request_id uuid not null, activity_id text not null references private.activity_definitions(id),
  expected_stamina_cost integer not null, expected_xp_gain bigint not null,
  result jsonb not null, created_at timestamptz not null default clock_timestamp(),
  primary key(character_id,request_id)
);
alter table private.activity_definitions enable row level security;
alter table private.activity_requests enable row level security;
revoke all on private.activity_definitions,private.activity_requests from public,anon,authenticated;
{{activities.catalogSql}}
create table if not exists private.activity_loot (
  activity_id text primary key references private.activity_definitions(id),
  loot_table_id text references private.loot_tables(id),
  success_start numeric not null default 70 check(success_start between 0 and 100 and success_start=trunc(success_start,4)),
  success_end numeric not null default 90 check(success_end between success_start and 100 and success_end=trunc(success_end,4)),
  mastery_level integer not null default 100 check(mastery_level between 2 and 100),
  version uuid not null default gen_random_uuid()
);
-- Move the former cap once; later admin mastery edits remain authoritative.
do $mastery_cap$
declare previous_cap boolean;
begin
  select exists(select 1 from pg_constraint where conrelid='private.activity_loot'::regclass
    and conname='activity_loot_mastery_level_check' and pg_get_constraintdef(oid) like '%<= 99%') into previous_cap;
  alter table private.activity_loot drop constraint if exists activity_loot_mastery_level_check;
  alter table private.activity_loot add constraint activity_loot_mastery_level_check check(mastery_level between 2 and 100);
  alter table private.activity_loot alter column mastery_level set default 100;
  if previous_cap then
    update private.activity_loot set mastery_level=100,version=gen_random_uuid() where mastery_level=99;
  end if;
end;
$mastery_cap$;
create index if not exists activity_loot_table_idx on private.activity_loot(loot_table_id);
alter table private.activity_loot enable row level security;
revoke all on private.activity_loot from public,anon,authenticated;

create or replace function private.perform_activity(activity_id text,expected_stamina_cost numeric,expected_xp_gain numeric,request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  viewer_id uuid:=private.combat_captain(); previous private.activity_requests%rowtype;
  definition private.activity_definitions%rowtype; captain public.characters%rowtype;
  remaining_stamina integer; awarded jsonb; result jsonb; loot_result jsonb; before_level integer;
begin
  if request_id is null or activity_id is null or length(activity_id) not between 1 and 48
    or expected_stamina_cost is null or expected_stamina_cost not between 1 and 2147483647
    or expected_stamina_cost<>trunc(expected_stamina_cost)
    or expected_xp_gain is null or expected_xp_gain not between 1 and 9007199254740991
    or expected_xp_gain<>trunc(expected_xp_gain) then raise exception 'INVALID_REQUEST' using errcode='22023'; end if;
  perform private.settle_combat_context(array[viewer_id]);
  select * into previous from private.activity_requests r where r.character_id=viewer_id and r.request_id=perform_activity.request_id;
  if found then
    if previous.activity_id<>activity_id or previous.expected_stamina_cost<>expected_stamina_cost or previous.expected_xp_gain<>expected_xp_gain then
      raise exception 'REQUEST_CONFLICT' using errcode='22023'; end if;
    return previous.result;
  end if;
  perform private.assert_can_act(viewer_id);
  select * into captain from public.characters where id=viewer_id for update;
  if captain.location<>'the_harbor' then raise exception 'NOT_IN_HARBOR'; end if;
  select * into definition from private.activity_definitions d where d.id=activity_id and d.active;
  if not found then raise exception 'INVALID_ACTIVITY' using errcode='22023'; end if;
  if expected_stamina_cost<>{{gameplay.stamina.activityCost}} or expected_xp_gain<>definition.xp_gain then
    raise exception 'STALE_OFFER'; end if;
  if exists(select 1 from private.character_skills where character_id=viewer_id and skill_id=definition.skill_id and xp=9007199254740991) then
    raise exception 'SKILL_XP_LIMIT'; end if;
  remaining_stamina:=private.spend_activity_stamina(viewer_id);
  select private.skill_level(xp) into before_level from private.character_skills where character_id=viewer_id and skill_id=definition.skill_id;
  loot_result:=private.roll_activity_loot(viewer_id,definition.id,before_level);
  awarded:=private.award_skill_xp(viewer_id,definition.skill_id,definition.xp_gain);
  result:=awarded||jsonb_build_object('activity_id',definition.id,'stamina_cost',{{gameplay.stamina.activityCost}},
    'stamina_after',remaining_stamina,'loot',loot_result,'config_revision',public.get_gameplay_revision());
  insert into private.activity_requests(character_id,request_id,activity_id,expected_stamina_cost,expected_xp_gain,result)
    values(viewer_id,request_id,definition.id,expected_stamina_cost::integer,expected_xp_gain::bigint,result);
  return result;
end;
$$;
revoke all on function private.perform_activity(text,numeric,numeric,uuid) from public,anon,authenticated;
grant execute on function private.perform_activity(text,numeric,numeric,uuid) to authenticated;
create or replace function public.perform_activity(activity_id text,expected_stamina_cost numeric,expected_xp_gain numeric,request_id uuid)
returns jsonb language sql volatile security invoker set search_path='' as $$
  select private.perform_activity(activity_id,expected_stamina_cost,expected_xp_gain,request_id);
$$;
revoke all on function public.perform_activity(text,numeric,numeric,uuid) from public,anon,authenticated;
grant execute on function public.perform_activity(text,numeric,numeric,uuid) to authenticated;
