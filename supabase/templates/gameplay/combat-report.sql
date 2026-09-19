-- Derive damage by phase from saved events, including existing encounters.
create or replace function private.combat_people(battle_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  with damage as materialized (
    select r.actor_id,
      coalesce(sum((r.event->>'attacker_damage')::integer) filter (where r.event->>'phase'='sea'),0) ship_damage,
      coalesce(sum((r.event->>'attacker_damage')::integer) filter (where r.event->>'phase'='boarding'),0) crew_damage,
      coalesce(sum((r.event->>'defender_damage')::integer) filter (where r.event->>'phase'='sea'),0) defender_ship_damage,
      coalesce(sum((r.event->>'defender_damage')::integer) filter (where r.event->>'phase'='boarding'),0) defender_crew_damage,
      count(*) filter (where (r.event->>'defender_hit')::boolean) defender_hits
    from private.combat_rounds r where r.combat_id=battle_id group by r.actor_id
  )
  select coalesce(jsonb_agg(person order by joined_at,id),'[]'::jsonb) from (
    select p.joined_at,p.character_id id,jsonb_build_object('id',p.character_id,'name',p.snapshot->>'name',
      'role','attacker','status',p.status,'hits',p.hits,'damage',p.damage,
      'ship_damage',coalesce(d.ship_damage,0),'crew_damage',coalesce(d.crew_damage,0),
      'ship_health',p.snapshot->'ship_health','crew_health',p.snapshot->'crew_health','phase',p.phase) person
    from private.combat_participants p left join damage d on d.actor_id=p.character_id where p.combat_id=battle_id
    union all select b.started_at,b.defender_id,jsonb_build_object('id',b.defender_id,'name',b.state->'defender'->>'name',
      'role','defender','status',case when b.status='active' then 'active'
        when (b.state#>>'{defender,crew_health}')::integer=0 or (b.state#>>'{defender,ship_health}')::integer=0 then 'defeated' else 'survived' end,
      'hits',coalesce(d.hits,0),'damage',coalesce(d.ship_damage,0)+coalesce(d.crew_damage,0),
      'ship_damage',coalesce(d.ship_damage,0),'crew_damage',coalesce(d.crew_damage,0),
      'ship_health',b.state->'defender'->'ship_health','crew_health',b.state->'defender'->'crew_health','phase',null)
    from private.combats b cross join (
      select sum(defender_hits) hits,sum(defender_ship_damage) ship_damage,sum(defender_crew_damage) crew_damage from damage
    ) d where b.id=battle_id
  ) people;
$$;

