-- Stamina recovers at fixed UTC boundaries everywhere, including while offline.
alter table public.characters
  add column if not exists stamina integer not null default {{gameplay.stamina.maximum}},
  add column if not exists stamina_updated_at timestamptz not null default clock_timestamp();
alter table public.characters alter column stamina set default {{gameplay.stamina.maximum}};
alter table public.characters drop constraint if exists characters_stamina_check;
alter table public.characters add constraint characters_stamina_check
  check(stamina between 0 and {{gameplay.stamina.maximum}});

create or replace function private.stamina_snapshot(stored_stamina integer,anchor timestamptz,observed_at timestamptz)
returns table(stamina integer,stamina_updated_at timestamptz,stamina_next_at timestamptz)
language sql immutable strict security invoker set search_path='' as $$
  with recovered as (
    select least({{gameplay.stamina.maximum}},stored_stamina+greatest(0,
      floor(extract(epoch from observed_at)/{{gameplay.stamina.recoverySeconds}})
      -floor(extract(epoch from anchor)/{{gameplay.stamina.recoverySeconds}}))*{{gameplay.stamina.recoveryAmount}})::integer as value,
      greatest(anchor,observed_at) as checkpoint
  )
  select value,checkpoint,case when value<{{gameplay.stamina.maximum}} then
    date_bin(make_interval(secs=>{{gameplay.stamina.recoverySeconds}}),checkpoint,'1970-01-01Z'::timestamptz)
      +make_interval(secs=>{{gameplay.stamina.recoverySeconds}}) end from recovered;
$$;

-- Future activity RPCs call this inside their receipt/reward transaction.
create or replace function private.spend_activity_stamina(target_id uuid)
returns integer language plpgsql volatile security invoker set search_path='' as $$
declare c public.characters%rowtype; recovered record; observed_at timestamptz;
begin
  if auth.uid() is null or not private.is_registered_player() then
    raise exception 'UNAUTHORIZED' using errcode='42501'; end if;
  if not exists(select 1 from public.characters where id=target_id and user_id=auth.uid()) then
    raise exception 'UNAUTHORIZED' using errcode='42501'; end if;
  perform private.lock_combat_context(array[target_id]);
  select * into c from public.characters where id=target_id and user_id=auth.uid() for update;
  if not found then raise exception 'UNAUTHORIZED' using errcode='42501'; end if;
  observed_at:=clock_timestamp();
  select * into recovered from private.stamina_snapshot(c.stamina,c.stamina_updated_at,observed_at);
  if recovered.stamina<{{gameplay.stamina.activityCost}} then
    raise exception 'INSUFFICIENT_STAMINA' using errcode='P0001'; end if;
  update public.characters set stamina=recovered.stamina-{{gameplay.stamina.activityCost}},
    stamina_updated_at=recovered.stamina_updated_at where id=target_id;
  perform private.notify_training(target_id);
  return recovered.stamina-{{gameplay.stamina.activityCost}};
end;
$$;
revoke all on function private.stamina_snapshot(integer,timestamptz,timestamptz),
  private.spend_activity_stamina(uuid) from public,anon,authenticated;
