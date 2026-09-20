-- Gold Coins are separate carried and bank balances.
alter table public.characters
  alter column gold_coins set default {{gameplay.economy.initialGoldCoins}},
  drop constraint characters_gold_coins_check,
  add constraint characters_gold_coins_check check (gold_coins between 0 and {{gameplay.economy.maxGoldCoins}}),
  drop constraint characters_bank_gold_coins_check,
  add constraint characters_bank_gold_coins_check check (bank_gold_coins between 0 and {{gameplay.economy.maxGoldCoins}});

create or replace function private.transfer_gold(direction text, amount numeric, request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  viewer_id uuid := private.combat_captain();
  captain public.characters%rowtype;
  previous private.bank_transfers%rowtype;
  coins bigint;
begin
  if request_id is null then raise exception 'INVALID_REQUEST' using errcode='22023'; end if;
  if direction is null or direction not in ('deposit','withdraw') then
    raise exception 'INVALID_DIRECTION' using errcode='22023'; end if;
  if amount is null or amount < 1 or amount > {{gameplay.economy.maxGoldCoins}} or amount <> trunc(amount) then
    raise exception 'INVALID_AMOUNT' using errcode='22023'; end if;
  coins := amount::bigint;
  perform private.settle_combat_context(array[viewer_id]);
  select * into previous from private.bank_transfers t
    where t.character_id=viewer_id and t.request_id=transfer_gold.request_id;
  if found then
    if previous.direction <> direction or previous.amount <> coins then
      raise exception 'REQUEST_CONFLICT' using errcode='22023';
    end if;
    return jsonb_build_object('direction',previous.direction,'amount',previous.amount,
      'gold_coins',previous.gold_coins,'bank_gold_coins',previous.bank_gold_coins);
  end if;
  perform private.assert_can_act(viewer_id);
  select * into captain from public.characters where id=viewer_id for update;
  if captain.location <> 'the_harbor' then raise exception 'NOT_IN_HARBOR' using errcode='P0001'; end if;
  if direction='deposit' then
    if captain.gold_coins < coins then raise exception 'NOT_ENOUGH_GOLD' using errcode='P0001'; end if;
    if captain.bank_gold_coins > {{gameplay.economy.maxGoldCoins}} - coins then
      raise exception 'BALANCE_LIMIT' using errcode='P0001'; end if;
    update public.characters set gold_coins=gold_coins-coins, bank_gold_coins=bank_gold_coins+coins
      where id=viewer_id returning * into captain;
  else
    if captain.bank_gold_coins < coins then raise exception 'NOT_ENOUGH_BANK_GOLD' using errcode='P0001'; end if;
    if captain.gold_coins > {{gameplay.economy.maxGoldCoins}} - coins then
      raise exception 'BALANCE_LIMIT' using errcode='P0001'; end if;
    update public.characters set gold_coins=gold_coins+coins, bank_gold_coins=bank_gold_coins-coins
      where id=viewer_id returning * into captain;
  end if;
  insert into private.bank_transfers(character_id,request_id,direction,amount,gold_coins,bank_gold_coins)
    values(viewer_id,request_id,direction,coins,captain.gold_coins,captain.bank_gold_coins);
  insert into public.player_game_events(character_id,revision) values(viewer_id,1)
    on conflict(character_id) do update set revision=player_game_events.revision+1;
  return jsonb_build_object('direction',direction,'amount',coins,
    'gold_coins',captain.gold_coins,'bank_gold_coins',captain.bank_gold_coins);
end;
$$;
revoke all on function private.transfer_gold(text,numeric,uuid) from public,anon,authenticated;
grant execute on function private.transfer_gold(text,numeric,uuid) to authenticated;

create or replace function public.transfer_gold(direction text, amount numeric, request_id uuid)
returns jsonb language sql volatile security invoker set search_path='' as $$
  select private.transfer_gold(direction,amount,request_id);
$$;
revoke all on function public.transfer_gold(text,numeric,uuid) from public,anon,authenticated;
grant execute on function public.transfer_gold(text,numeric,uuid) to authenticated;

