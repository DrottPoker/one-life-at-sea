-- Morale is independent of location and uses fixed server-clock boundaries.
alter table public.characters
  add column if not exists crew_morale numeric not null default 0,
  add column if not exists morale_updated_at timestamptz not null default clock_timestamp();
alter table public.characters drop constraint if exists characters_crew_morale_check;
alter table public.characters add constraint characters_crew_morale_check
  check(crew_morale between -{{gameplay.morale.maximum}} and {{gameplay.morale.maximum}}
    and crew_morale=round(crew_morale,1));

create or replace function private.morale_snapshot(stored_morale numeric,anchor timestamptz,observed_at timestamptz)
returns table(morale numeric,morale_updated_at timestamptz,morale_next_at timestamptz)
language sql immutable strict security invoker set search_path='' as $$
  with recovered as (
    select sign(stored_morale)*greatest(0,abs(stored_morale)-greatest(0,
      floor(extract(epoch from observed_at)/{{gameplay.morale.recoverySeconds}})
      -floor(extract(epoch from anchor)/{{gameplay.morale.recoverySeconds}}))*{{gameplay.morale.recoveryAmount}}) as value,
      greatest(anchor,observed_at) as checkpoint
  )
  select round(value,1),checkpoint,case when value<>0 then
    date_bin(make_interval(secs=>{{gameplay.morale.recoverySeconds}}),checkpoint,'1970-01-01Z'::timestamptz)
      +make_interval(secs=>{{gameplay.morale.recoverySeconds}}) end from recovered;
$$;
create or replace function private.morale_multiplier(morale numeric,bonus_bps integer)
returns numeric language sql immutable strict security invoker set search_path='' as $$
  select 1+greatest(-{{gameplay.morale.maximum}},least({{gameplay.morale.maximum}},morale))
    /{{gameplay.morale.maximum}}::numeric*bonus_bps/10000;
$$;
revoke all on function private.morale_snapshot(numeric,timestamptz,timestamptz),
  private.morale_multiplier(numeric,integer) from public,anon,authenticated;
