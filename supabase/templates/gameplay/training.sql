-- Upgrade storage once without changing existing stats, jobs or receipts.
do $training_storage$
declare field text;
begin
  foreach field in array array['crew_attack','crew_defense','crew_speed','crew_accuracy'] loop
    if exists(select 1 from information_schema.columns where table_schema='public'
      and table_name='characters' and column_name=field and data_type='bigint') then
      execute format('alter table public.characters alter column %I type numeric',field);
    end if;
  end loop;
  if exists(select 1 from information_schema.columns where table_schema='private'
    and table_name='training_tiers' and column_name='stat_gain') then
    alter table private.training_tiers rename column stat_gain to efficiency;
    alter table private.training_tiers alter column efficiency type numeric;
    alter table private.training_tiers drop constraint training_tiers_stat_gain_check;
  end if;
end;
$training_storage$;
drop function if exists private.crew_training_gain(bigint,double precision);

-- Tier IDs and positions are durable; balance values may change.
{{training.catalogSql}}

do $training_constraint$ begin
  if not exists(select 1 from pg_constraint where conrelid='private.training_tiers'::regclass and conname='training_tiers_efficiency_check') then
    alter table private.training_tiers add constraint training_tiers_efficiency_check check(efficiency>0 and efficiency<=1000);
  end if;
end; $training_constraint$;

create or replace function private.initialize_training_progress()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into private.character_training(character_id,training_group,tier_id)
    select new.id,training_group,id from private.training_tiers where position=0;
  return new;
end;
$$;
revoke all on function private.initialize_training_progress() from public,anon,authenticated;
drop trigger if exists initialize_training_progress on public.characters;
create trigger initialize_training_progress after insert on public.characters
for each row execute function private.initialize_training_progress();
insert into private.character_training(character_id,training_group,tier_id)
  select c.id,t.training_group,t.id from public.characters c cross join private.training_tiers t where t.position=0
  on conflict(character_id,training_group) do nothing;

create or replace function private.notify_training(captain_id uuid)
returns void language sql volatile security invoker set search_path='' as $$
  insert into public.player_game_events(character_id,revision) values(captain_id,1)
    on conflict(character_id) do update set revision=player_game_events.revision+1;
$$;

-- Caller holds the character/combat locks. The caller's observation time also drives snapshots.
create or replace function private.settle_ship_upgrade(captain_id uuid, observed_at timestamptz)
returns void language plpgsql volatile security invoker set search_path='' as $$
declare job private.ship_upgrade_jobs%rowtype;
begin
  select * into job from private.ship_upgrade_jobs where character_id=captain_id and applied_at is null for update;
  if not found or job.finishes_at>observed_at then return; end if;
  execute format('update public.characters set %I=%I+$1 where id=$2','ship_'||job.stat,'ship_'||job.stat)
    using job.stat_gain,captain_id;
  update private.character_training set xp=xp+job.xp_gain where character_id=captain_id and training_group='ship';
  update private.ship_upgrade_jobs set applied_at=observed_at where id=job.id;
  perform private.notify_training(captain_id);
end;
$$;

create or replace function private.training_state(captain_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object(
    'progress',(select jsonb_object_agg(training_group,jsonb_build_object('xp',xp,'tier_id',tier_id))
      from private.character_training where character_id=captain_id),
    'ship_job',(select to_jsonb(j)-'character_id'-'config_revision' from private.ship_upgrade_jobs j
      where character_id=captain_id and applied_at is null),
    'last_ship_job',(select to_jsonb(j)-'character_id'-'config_revision' from private.ship_upgrade_jobs j
      where character_id=captain_id and applied_at is not null order by finishes_at desc,id desc limit 1));
$$;

-- Round each Energy unit, then advance the permanent stat virtually.
-- This makes sequential jobs at the same tier independent of job size.
create or replace function private.training_gain(stat_value numeric, efficiency numeric, energy_amount integer)
returns numeric language plpgsql immutable strict security invoker set search_path='' as $$
declare current_value numeric:=stat_value; unit_gain numeric; total_gain numeric:=0; i integer;
begin
  if not (stat_value between 1 and 9007199254740991)
    or not (efficiency between 0.000001 and 1000)
    or not (energy_amount between 1 and {{gameplay.resources.energyStorageMax}}) then
    raise exception 'INVALID_TRAINING_INPUT' using errcode='22023';
  end if;
  for i in 1..energy_amount loop
    unit_gain:=round(efficiency / {{gameplay.training.energyPerUnit}}
      * power(1 + current_value / {{gameplay.training.statScale}}, {{gameplay.training.statExponent}}::numeric),6);
    if unit_gain<=0 then raise exception 'INVALID_TRAINING_INPUT' using errcode='22023'; end if;
    total_gain:=total_gain+unit_gain;
    current_value:=current_value+unit_gain;
    if current_value>9007199254740991 then raise exception 'PROGRESSION_LIMIT'; end if;
  end loop;
  return trim_scale(total_gain);
end;
$$;

-- Deterministic resolver is internal only; callers cannot choose the random roll.
create or replace function private.crew_training_gain(base_gain numeric, roll double precision)
returns numeric language plpgsql immutable strict security invoker set search_path='' as $$
begin
  if not (base_gain between 0.000001 and 9007199254740991) or roll<0 or roll>=1 then raise exception 'INVALID_TRAINING_ROLL' using errcode='22023'; end if;
  return base_gain * case when roll < {{gameplay.training.perfectChanceBps}} / 10000.0
    then {{gameplay.training.perfectMultiplier}} else 1 end;
end;
$$;

create or replace function private.training_action(action text,payload jsonb,request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  viewer_id uuid:=private.combat_captain();
  captain public.characters%rowtype;
  progress private.character_training%rowtype;
  tier private.training_tiers%rowtype;
  current_tier private.training_tiers%rowtype;
  previous private.training_requests%rowtype;
  job private.ship_upgrade_jobs%rowtype;
  recovered record; morale_state record; morale_before numeric; morale_after numeric; morale_factor numeric; base_gain numeric;
  group_name text:=case when action='crew' then 'crew' when action='ship' then 'ship' else payload->>'group' end;
  stat text:=payload->>'stat';
  observed_at timestamptz;
  gain numeric; normal_gain numeric; stat_before numeric; xp_gain bigint; energy_cost integer; result jsonb;
begin
  if request_id is null or action is null or action not in ('crew','ship','purchase') or payload is null then
    raise exception 'INVALID_REQUEST' using errcode='22023'; end if;
  if group_name is null or group_name not in ('crew','ship') then raise exception 'INVALID_GROUP' using errcode='22023'; end if;
  if action in ('crew','ship') and (stat is null or stat not in ('attack','defense','speed','accuracy')) then
    raise exception 'INVALID_STAT' using errcode='22023'; end if;
  perform private.settle_combat_context(array[viewer_id]);
  select * into previous from private.training_requests r where r.character_id=viewer_id and r.request_id=training_action.request_id;
  if found then
    if previous.action<>action or previous.payload<>payload then raise exception 'REQUEST_CONFLICT' using errcode='22023'; end if;
    return previous.result;
  end if;
  observed_at:=clock_timestamp();
  perform private.settle_ship_upgrade(viewer_id,observed_at);
  perform private.assert_can_act(viewer_id);
  select * into captain from public.characters where id=viewer_id for update;
  if captain.location<>'the_harbor' then raise exception 'NOT_IN_HARBOR'; end if;
  select * into progress from private.character_training where character_id=viewer_id and training_group=group_name for update;
  select * into current_tier from private.training_tiers where training_group=group_name and id=progress.tier_id;
  if action='purchase' then
    select * into tier from private.training_tiers where training_group=group_name and id=payload->>'tier_id';
    if tier.id is null or tier.position<>current_tier.position+1 then raise exception 'INVALID_TIER' using errcode='22023'; end if;
    if progress.xp<tier.xp_required then raise exception 'NOT_ENOUGH_XP'; end if;
    if captain.gold_coins<tier.gold_cost then raise exception 'NOT_ENOUGH_GOLD'; end if;
    update public.characters set gold_coins=gold_coins-tier.gold_cost where id=viewer_id;
    update private.character_training set tier_id=tier.id where character_id=viewer_id and training_group=group_name;
    result:=jsonb_build_object('kind','purchase','group',group_name,'tier_id',tier.id,'tier_name',tier.name,'gold_cost',tier.gold_cost);
  else
    if payload->>'tier_id' is distinct from current_tier.id then raise exception 'STALE_TIER' using errcode='22023'; end if;
    energy_cost:={{gameplay.training.energyCost}};
    stat_before:=(to_jsonb(captain)->>(group_name||'_'||stat))::numeric;
    if action='ship' then
      if exists(select 1 from private.ship_upgrade_jobs where character_id=viewer_id and applied_at is null) then raise exception 'SHIP_WORK_ACTIVE'; end if;
      if jsonb_typeof(payload->'energy_amount') is distinct from 'number'
        or (payload->>'energy_amount')::numeric<>trunc((payload->>'energy_amount')::numeric)
        or (payload->>'energy_amount')::numeric not between {{gameplay.training.shipMinEnergy}} and {{gameplay.resources.energyStorageMax}}
      then raise exception 'INVALID_ENERGY' using errcode='22023'; end if;
      energy_cost:=(payload->>'energy_amount')::integer;
    end if;
    base_gain:=private.training_gain(stat_before,current_tier.efficiency,energy_cost);
    normal_gain:=base_gain;
    if action='crew' then
      select * into morale_state from private.morale_snapshot(captain.crew_morale,captain.morale_updated_at,observed_at);
      morale_before:=morale_state.morale;
      morale_after:=greatest(-{{gameplay.morale.maximum}},morale_before-energy_cost*{{gameplay.morale.lossPerEnergy}});
      morale_factor:=private.morale_multiplier(morale_before,{{gameplay.morale.trainingBonusBps}});
      normal_gain:=trim_scale(round(base_gain*morale_factor,6));
    end if;
    gain:=case when action='crew' then private.crew_training_gain(normal_gain,private.combat_roll()) else normal_gain end;
    xp_gain:=energy_cost::bigint*{{gameplay.training.xpPerEnergy}};
    if (to_jsonb(captain)->>(group_name||'_'||stat))::numeric>9007199254740991-gain
      or progress.xp>9007199254740991-xp_gain then raise exception 'PROGRESSION_LIMIT'; end if;
    select * into recovered from private.character_energy_snapshot(captain,observed_at);
    if recovered.energy<energy_cost then raise exception 'NOT_ENOUGH_ENERGY'; end if;
    update public.characters set energy=recovered.energy-energy_cost,energy_updated_at=recovered.energy_updated_at where id=viewer_id;
    if action='crew' then
      update public.characters set crew_morale=morale_after,morale_updated_at=morale_state.morale_updated_at where id=viewer_id;
      execute format('update public.characters set %I=%I+$1 where id=$2','crew_'||stat,'crew_'||stat) using gain,viewer_id;
      update private.character_training set xp=xp+xp_gain where character_id=viewer_id and training_group='crew';
      result:=jsonb_build_object('kind','crew','stat',stat,'stat_gain',gain,'xp_gain',xp_gain,'energy_cost',energy_cost,
        'perfect',gain>normal_gain,'tier_id',current_tier.id,'morale_before',morale_before,'morale_after',morale_after,
        'morale_multiplier',morale_factor,'base_gain',base_gain);
    else
      insert into private.ship_upgrade_jobs(character_id,stat,workshop_id,workshop_name,energy_cost,stat_gain,xp_gain,config_revision,started_at,finishes_at)
        values(viewer_id,stat,current_tier.id,current_tier.name,energy_cost,gain,xp_gain,public.get_gameplay_revision(),
          observed_at,observed_at+make_interval(secs=>energy_cost::double precision*{{gameplay.training.shipSecondsPerEnergy}})) returning * into job;
      result:=jsonb_build_object('kind','ship','job_id',job.id,'stat',stat,'stat_gain',gain,'xp_gain',xp_gain,
        'energy_cost',energy_cost,'finishes_at',job.finishes_at);
    end if;
  end if;
  if action in ('crew','ship') then
    result:=result||jsonb_build_object('stat_before',stat_before,'normal_gain',normal_gain,
      'efficiency',current_tier.efficiency,'config_revision',public.get_gameplay_revision());
  end if;
  insert into private.training_requests(character_id,request_id,action,payload,result) values(viewer_id,request_id,action,payload,result);
  perform private.notify_training(viewer_id);
  return result;
end;
$$;

revoke all on function private.notify_training(uuid),private.settle_ship_upgrade(uuid,timestamptz),
  private.training_state(uuid),private.training_gain(numeric,numeric,integer),private.crew_training_gain(numeric,double precision),private.training_action(text,jsonb,uuid)
  from public,anon,authenticated;
grant execute on function private.training_action(text,jsonb,uuid) to authenticated;

create or replace function public.train_crew(stat text,expected_tier_id text,request_id uuid)
returns jsonb language sql volatile security invoker set search_path='' as $$
  select private.training_action('crew',jsonb_build_object('stat',stat,'tier_id',expected_tier_id),request_id);
$$;
create or replace function public.purchase_training_tier(training_group text,tier_id text,request_id uuid)
returns jsonb language sql volatile security invoker set search_path='' as $$
  select private.training_action('purchase',jsonb_build_object('group',training_group,'tier_id',tier_id),request_id);
$$;
create or replace function public.start_ship_upgrade(stat text,energy_amount integer,expected_workshop_id text,request_id uuid)
returns jsonb language sql volatile security invoker set search_path='' as $$
  select private.training_action('ship',jsonb_build_object('stat',stat,'energy_amount',energy_amount,'tier_id',expected_workshop_id),request_id);
$$;
revoke all on function public.train_crew(text,text,uuid),public.purchase_training_tier(text,text,uuid),
  public.start_ship_upgrade(text,integer,text,uuid) from public,anon,authenticated;
grant execute on function public.train_crew(text,text,uuid),public.purchase_training_tier(text,text,uuid),
  public.start_ship_upgrade(text,integer,text,uuid) to authenticated;

