-- Skill XP stays private; only the sum of skill levels is projected publicly.
create table if not exists private.skill_definitions (
  id text primary key, name text not null, position integer not null check(position>=0)
);
create table if not exists private.skill_levels (
  level integer primary key check(level between 1 and 100), xp bigint not null check(xp>=0)
);
create table if not exists private.character_skills (
  character_id uuid not null references public.characters(id) on delete cascade,
  skill_id text not null references private.skill_definitions(id), xp bigint not null default 0,
  primary key(character_id,skill_id), check(xp between 0 and 9007199254740991)
);
alter table private.skill_definitions enable row level security;
alter table private.skill_levels enable row level security;
alter table private.character_skills enable row level security;
revoke all on private.skill_definitions,private.skill_levels,private.character_skills from public,anon,authenticated;
alter table private.skill_levels drop constraint if exists skill_levels_level_check;
alter table private.skill_levels add constraint skill_levels_level_check check(level between 1 and 100);
{{skills.catalogSql}}

create or replace function private.skill_level(experience bigint)
returns integer language sql stable strict security invoker set search_path='' as $$
  select coalesce(max(level),1) from private.skill_levels where xp<=experience;
$$;
create or replace function private.character_level(target_id uuid)
returns integer language sql stable strict security invoker set search_path='' as $$
  select sum(private.skill_level(coalesce(s.xp,0)))::integer from private.skill_definitions d
    left join private.character_skills s on s.skill_id=d.id and s.character_id=target_id;
$$;
alter table public.character_profiles add column if not exists character_level integer not null default 7;
-- The default also covers the brief interval before a new character's skills are initialized.
do $skill_default$ begin
  execute format('alter table public.character_profiles alter column character_level set default %s',
    (select count(*) from private.skill_definitions));
end; $skill_default$;

create or replace function private.sync_skill_progress()
returns trigger language plpgsql security definer set search_path='' as $$
declare captain_id uuid:=case when tg_op='DELETE' then old.character_id else new.character_id end; total integer;
begin
  if exists(select 1 from public.characters where id=captain_id) then
    total:=private.character_level(captain_id);
    update public.character_profiles set character_level=total
      where character_id=captain_id and character_level is distinct from total;
    perform private.notify_training(captain_id);
  end if;
  return null;
end;
$$;
drop trigger if exists character_skills_sync on private.character_skills;
create trigger character_skills_sync after insert or update of xp or delete on private.character_skills
for each row execute function private.sync_skill_progress();

create or replace function private.initialize_skills()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into private.character_skills(character_id,skill_id) select new.id,id from private.skill_definitions;
  return new;
end;
$$;
drop trigger if exists initialize_skills on public.characters;
create trigger initialize_skills after insert on public.characters for each row execute function private.initialize_skills();
insert into private.character_skills(character_id,skill_id)
  select c.id,s.id from public.characters c cross join private.skill_definitions s
  on conflict(character_id,skill_id) do nothing;
update public.character_profiles p set character_level=private.character_level(p.character_id)
  where character_level is distinct from private.character_level(p.character_id);

create or replace function private.get_own_skills()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare captain_id uuid;
begin
  if auth.uid() is null or not private.is_registered_player() then raise exception 'UNAUTHORIZED' using errcode='42501'; end if;
  select id into captain_id from public.characters where user_id=auth.uid();
  if not found then return null; end if;
  return (select jsonb_build_object('character_level',sum(private.skill_level(s.xp)),
    'skills',jsonb_agg(jsonb_build_object('id',d.id,'xp',s.xp,'level',private.skill_level(s.xp)) order by d.position))
    from private.skill_definitions d join private.character_skills s on s.skill_id=d.id where s.character_id=captain_id);
end;
$$;
create or replace function public.get_own_skills()
returns jsonb language sql stable security invoker set search_path='' as $$ select private.get_own_skills(); $$;

-- Trusted activity transactions own eligibility, costs, rewards and idempotency.
create or replace function private.award_skill_xp(target_id uuid,target_skill text,amount numeric)
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare previous_xp bigint; next_xp bigint;
begin
  if amount is null or amount::text in ('NaN','Infinity','-Infinity') or amount<>trunc(amount)
    or amount<1 or amount>9007199254740991 then raise exception 'INVALID_SKILL_XP' using errcode='22023'; end if;
  perform private.lock_combat_context(array[target_id]);
  perform 1 from public.characters where id=target_id for update;
  if not found then raise exception 'CHARACTER_NOT_FOUND' using errcode='P0001'; end if;
  select xp into previous_xp from private.character_skills where character_id=target_id and skill_id=target_skill for update;
  if not found then raise exception 'INVALID_SKILL' using errcode='22023'; end if;
  next_xp:=least(9007199254740991::numeric,previous_xp::numeric+amount)::bigint;
  update private.character_skills set xp=next_xp where character_id=target_id and skill_id=target_skill and xp<>next_xp;
  return jsonb_build_object('skill_id',target_skill,'xp_awarded',next_xp-previous_xp,'xp',next_xp,
    'previous_level',private.skill_level(previous_xp),'level',private.skill_level(next_xp),
    'character_level',private.character_level(target_id));
end;
$$;
revoke all on function private.skill_level(bigint),private.character_level(uuid),private.sync_skill_progress(),
  private.initialize_skills(),private.award_skill_xp(uuid,text,numeric),private.get_own_skills(),public.get_own_skills()
  from public,anon,authenticated;
grant execute on function private.get_own_skills(),public.get_own_skills() to authenticated;
