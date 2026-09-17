-- Serialize overlapping participants without rejecting ordinary concurrent training.
create or replace function private.lock_combat_context(captain_ids uuid[])
returns void language plpgsql volatile security invoker set search_path = ''
as $$
declare lock_ids uuid[]; captain_id uuid;
begin
  select array_agg(distinct id order by id) into lock_ids from (
    select unnest(captain_ids) as id
    union select b.attacker_id from private.combats b join private.combat_engagements e on e.combat_id=b.id where e.character_id=any(captain_ids)
    union select b.defender_id from private.combats b join private.combat_engagements e on e.combat_id=b.id where e.character_id=any(captain_ids)
  ) ids where id is not null;
  foreach captain_id in array lock_ids loop
    perform pg_advisory_xact_lock(hashtextextended(captain_id::text, 71829));
  end loop;
  if exists(select 1 from private.combat_engagements e join private.combats b on b.id=e.combat_id
    where e.character_id=any(captain_ids) and (not b.attacker_id=any(lock_ids) or not b.defender_id=any(lock_ids))) then
    raise exception 'COMBAT_BUSY' using errcode = '40001';
  end if;
  perform id from public.characters where id=any(lock_ids) order by id for update;
end;
$$;
