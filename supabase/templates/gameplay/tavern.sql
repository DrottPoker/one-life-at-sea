create table if not exists private.tavern_requests (
  character_id uuid not null references public.characters(id) on delete cascade,
  request_id uuid not null,
  expected_gold_cost bigint not null,
  expected_morale_gain numeric not null,
  result jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key(character_id,request_id)
);
alter table private.tavern_requests enable row level security;
revoke all on private.tavern_requests from public,anon,authenticated;

create or replace function private.buy_tavern_meal(expected_gold_cost numeric,expected_morale_gain numeric,request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  viewer_id uuid:=private.combat_captain();
  captain public.characters%rowtype; previous private.tavern_requests%rowtype;
  recovered record; observed_at timestamptz; morale_after numeric; result jsonb;
begin
  if request_id is null or expected_gold_cost is null or expected_gold_cost not between 1 and 9007199254740991
    or expected_gold_cost<>trunc(expected_gold_cost) or expected_morale_gain is null
    or expected_morale_gain not between 0.1 and 200 or expected_morale_gain<>round(expected_morale_gain,1) then
    raise exception 'INVALID_REQUEST' using errcode='22023'; end if;
  perform private.settle_combat_context(array[viewer_id]);
  select * into previous from private.tavern_requests r
    where r.character_id=viewer_id and r.request_id=buy_tavern_meal.request_id;
  if found then
    if previous.expected_gold_cost<>expected_gold_cost or previous.expected_morale_gain<>expected_morale_gain then
      raise exception 'REQUEST_CONFLICT' using errcode='22023'; end if;
    return previous.result;
  end if;
  perform private.assert_can_act(viewer_id);
  select * into captain from public.characters where id=viewer_id for update;
  if captain.location<>'the_harbor' then raise exception 'NOT_IN_HARBOR'; end if;
  if expected_gold_cost<>{{gameplay.morale.tavernGoldCost}} or expected_morale_gain<>{{gameplay.morale.tavernGain}} then
    raise exception 'STALE_OFFER'; end if;
  observed_at:=clock_timestamp();
  select * into recovered from private.morale_snapshot(captain.crew_morale,captain.morale_updated_at,observed_at);
  if recovered.morale>={{gameplay.morale.maximum}} then raise exception 'MORALE_FULL'; end if;
  if captain.gold_coins<{{gameplay.morale.tavernGoldCost}} then raise exception 'NOT_ENOUGH_GOLD'; end if;
  morale_after:=least({{gameplay.morale.maximum}},recovered.morale+{{gameplay.morale.tavernGain}});
  update public.characters set gold_coins=gold_coins-{{gameplay.morale.tavernGoldCost}},
    crew_morale=morale_after,morale_updated_at=recovered.morale_updated_at where id=viewer_id;
  result:=jsonb_build_object('kind','crew_meal','gold_cost',{{gameplay.morale.tavernGoldCost}},
    'morale_before',recovered.morale,'morale_after',morale_after,'morale_gained',morale_after-recovered.morale,
    'gold_coins',captain.gold_coins-{{gameplay.morale.tavernGoldCost}},'config_revision',public.get_gameplay_revision());
  insert into private.tavern_requests(character_id,request_id,expected_gold_cost,expected_morale_gain,result)
    values(viewer_id,request_id,expected_gold_cost::bigint,expected_morale_gain,result);
  perform private.notify_training(viewer_id);
  return result;
end;
$$;
revoke all on function private.buy_tavern_meal(numeric,numeric,uuid) from public,anon,authenticated;
grant execute on function private.buy_tavern_meal(numeric,numeric,uuid) to authenticated;

create or replace function public.buy_tavern_meal(expected_gold_cost numeric,expected_morale_gain numeric,request_id uuid)
returns jsonb language sql volatile security invoker set search_path='' as $$
  select private.buy_tavern_meal(expected_gold_cost,expected_morale_gain,request_id);
$$;
revoke all on function public.buy_tavern_meal(numeric,numeric,uuid) from public,anon,authenticated;
grant execute on function public.buy_tavern_meal(numeric,numeric,uuid) to authenticated;
