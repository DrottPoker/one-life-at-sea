begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users(id,email,is_anonymous,raw_user_meta_data) values
('bc000000-0000-4000-8000-000000000001','bank-one@example.test',false,'{"character_name":"BankOne"}'),
('bc000000-0000-4000-8000-000000000002','bank-two@example.test',false,'{"character_name":"BankTwo"}'),
('bc000000-0000-4000-8000-000000000003','bank-anon@example.test',true,'{}');

set local role anon;
select throws_ok($$select public.transfer_gold('deposit',1,gen_random_uuid())$$,'42501',null,'Anonymous callers cannot transfer');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"bc000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is((public.get_game_state()->>'gold_coins')::bigint,0::bigint,'New characters carry zero Gold Coins');
select is((public.get_game_state()->>'bank_gold_coins')::bigint,0::bigint,'New bank accounts start at zero');
select throws_ok($$update public.characters set gold_coins=1000$$,'42501',null,'Clients cannot mint carried coins');
select throws_ok($$update public.characters set bank_gold_coins=1000$$,'42501',null,'Clients cannot mint bank coins');
select throws_ok($$insert into public.characters(display_name,gold_coins) values('Forged Gold',1000)$$,'42501',null,'Signup cannot set starting coins');
select throws_ok($$select * from private.bank_transfers$$,'42501',null,'Transfer receipts are private');
select throws_ok($$select public.transfer_gold('deposit',1,gen_random_uuid())$$,'P0001','NOT_ENOUGH_GOLD','Cannot deposit without carried coins');
select throws_ok($$select public.transfer_gold('withdraw',1,gen_random_uuid())$$,'P0001','NOT_ENOUGH_BANK_GOLD','Cannot withdraw from empty account');
select throws_ok($$select public.transfer_gold('deposit',0,gen_random_uuid())$$,'22023','INVALID_AMOUNT','Zero rejected');
select throws_ok($$select public.transfer_gold('deposit',-1,gen_random_uuid())$$,'22023','INVALID_AMOUNT','Negative amount rejected');
select throws_ok($$select public.transfer_gold('deposit',1.5,gen_random_uuid())$$,'22023','INVALID_AMOUNT','Fractional coins rejected, never rounded');
select throws_ok($$select public.transfer_gold('deposit',null,gen_random_uuid())$$,'22023','INVALID_AMOUNT','Null amount rejected');
select throws_ok($$select public.transfer_gold('deposit','NaN',gen_random_uuid())$$,'22023','INVALID_AMOUNT','NaN rejected');
select throws_ok($$select public.transfer_gold('deposit','Infinity',gen_random_uuid())$$,'22023','INVALID_AMOUNT','Infinite amount rejected');
select throws_ok($$select public.transfer_gold('deposit',9007199254740992,gen_random_uuid())$$,'22023','INVALID_AMOUNT','Unsafe integer rejected');
select throws_ok($$select public.transfer_gold('mint',1,gen_random_uuid())$$,'22023','INVALID_DIRECTION','Unknown direction rejected');
select throws_ok($$select public.transfer_gold(null,1,gen_random_uuid())$$,'22023','INVALID_DIRECTION','Null direction rejected');
select throws_ok($$select public.transfer_gold('deposit',1,null)$$,'22023','INVALID_REQUEST','Request ID is required');

reset role;
update public.characters set gold_coins=1000 where user_id='bc000000-0000-4000-8000-000000000001';
set local role authenticated;
select is((public.transfer_gold('deposit',400,'bc100000-0000-4000-8000-000000000001')->>'gold_coins')::bigint,600::bigint,'Deposit subtracts carried coins');
select is((public.get_game_state()->>'bank_gold_coins')::bigint,400::bigint,'Deposit adds the same bank coins');
select is((public.get_game_state()->>'energy')::int,100,'Banking does not use Energy');
select is((public.get_game_state()->>'crew_attack')::int,10,'Banking does not affect stats');
select is((public.transfer_gold('deposit',400,'bc100000-0000-4000-8000-000000000001')->>'gold_coins')::bigint,600::bigint,'Retry returns original receipt');
select is((public.get_game_state()->>'bank_gold_coins')::bigint,400::bigint,'Retry does not transfer again');
select throws_ok($$select public.transfer_gold('deposit',401,'bc100000-0000-4000-8000-000000000001')$$,'22023','REQUEST_CONFLICT','Same ID cannot change amount');
select throws_ok($$select public.transfer_gold('withdraw',400,'bc100000-0000-4000-8000-000000000001')$$,'22023','REQUEST_CONFLICT','Same ID cannot change direction');
select throws_ok($$select public.transfer_gold('deposit',601,gen_random_uuid())$$,'P0001','NOT_ENOUGH_GOLD','Bank balance cannot fund a carried-coin debit');
select throws_ok($$select public.transfer_gold('withdraw',401,gen_random_uuid())$$,'P0001','NOT_ENOUGH_BANK_GOLD','Withdrawal limited to bank balance');
select is((public.get_game_state()->>'gold_coins')::bigint,600::bigint,'Failed transfers preserve carried balance');
select is((public.get_game_state()->>'bank_gold_coins')::bigint,400::bigint,'Failed transfers preserve stored balance');
select lives_ok($$select public.transfer_gold('withdraw',125,'bc100000-0000-4000-8000-000000000002')$$,'Partial withdrawal works');
select is((public.get_game_state()->>'gold_coins')::bigint,725::bigint,'Withdrawal restores carried coins');
select is((public.get_game_state()->>'bank_gold_coins')::bigint,275::bigint,'Withdrawal subtracts stored coins');
select lives_ok($$select public.transfer_gold('withdraw',275,gen_random_uuid())$$,'Entire available balance can be withdrawn');
select is((public.get_game_state()->>'bank_gold_coins')::bigint,0::bigint,'Full withdrawal empties bank');
select is((public.get_game_state()->>'gold_coins')::bigint,1000::bigint,'Round trip conserves all coins');
select is((public.transfer_gold('deposit',400,'bc100000-0000-4000-8000-000000000001')->>'gold_coins')::bigint,600::bigint,'Old retry returns old receipt');
select is((public.get_game_state()->>'gold_coins')::bigint,1000::bigint,'Old retry does not replace current balances');

select set_config('request.jwt.claims','{"sub":"bc000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is((select count(*) from public.characters where user_id='bc000000-0000-4000-8000-000000000001'),0::bigint,'Other balances cannot be read');
select is((public.get_game_state()->>'gold_coins')::bigint,0::bigint,'Other account retains own balance');
select throws_ok($$select public.transfer_gold('deposit',400,'bc100000-0000-4000-8000-000000000001')$$,'P0001','NOT_ENOUGH_GOLD','Request ID does not access another account receipt');

reset role;
update public.characters set gold_coins=9007199254740991,bank_gold_coins=1 where user_id='bc000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"bc000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select throws_ok($$select public.transfer_gold('withdraw',1,gen_random_uuid())$$,'P0001','BALANCE_LIMIT','Destination overflow rolls back withdrawal');
select is((public.get_game_state()->>'bank_gold_coins')::bigint,1::bigint,'Overflow does not lose source coins');
reset role;
update public.characters set gold_coins=1,bank_gold_coins=9007199254740991 where user_id='bc000000-0000-4000-8000-000000000001';
set local role authenticated;
select throws_ok($$select public.transfer_gold('deposit',1,gen_random_uuid())$$,'P0001','BALANCE_LIMIT','Destination overflow rolls back deposit');
reset role;
update public.characters set gold_coins=9007199254740991,bank_gold_coins=0 where user_id='bc000000-0000-4000-8000-000000000001';
set local role authenticated;
select lives_ok($$select public.transfer_gold('deposit',9007199254740991,gen_random_uuid())$$,'Largest safe integer transfers exactly');
select is((public.get_game_state()->>'bank_gold_coins')::bigint,9007199254740991::bigint,'Large balance retains integer precision');
select lives_ok($$select public.transfer_gold('withdraw',9007199254740991,gen_random_uuid())$$,'Largest safe balance can be withdrawn');

select public.start_combat((select character_id from public.character_profiles where display_name='BankTwo'),gen_random_uuid());
select throws_ok($$select public.transfer_gold('deposit',1,gen_random_uuid())$$,'P0001','IN_COMBAT','Active attackers cannot bypass the harbor lock');
select set_config('request.jwt.claims','{"sub":"bc000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select throws_ok($$select public.transfer_gold('deposit',1,gen_random_uuid())$$,'42501','NOT_AUTHORIZED','Anonymous Auth users cannot transfer');
reset role;
delete from auth.users where id='bc000000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"bc000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_ok($$select public.transfer_gold('deposit',1,gen_random_uuid())$$,'42501','NOT_AUTHORIZED','Deleted accounts cannot transfer with an old token');

select * from finish();
rollback;
