begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();

select is(private.training_gain(10,1,5),1.00623::numeric,'Starter drill scales from the chosen permanent stat');
select is(private.training_gain(10,1,6),1.207548::numeric,'Fractional gain is retained per whole Energy');
select is(private.training_gain(10,1.15,25),5.793975::numeric,'Tier efficiency scales each Energy unit');
select is(private.training_gain(10,1,50),10.089358::numeric,'Long jobs include virtual stat growth');
select is(private.training_gain(10,1,100),20.23895::numeric,'Full Energy reference matches the UI');
select is(private.training_gain(1000,1,5),1.515992::numeric,'Higher stats improve absolute gains');
select is(private.training_gain(1000000,3,5),189.409355::numeric,'Late-game reference matches the UI');
select is(private.crew_training_gain(1.00623,0),2.01246::numeric,'Perfect Drill doubles the completed normal gain');
select is(private.crew_training_gain(1.00623,0.01),1.00623::numeric,'Normal scaled drills are not marked perfect');
select throws_ok($$select private.training_gain(0,1,5)$$,'22023','INVALID_TRAINING_INPUT','Nonpositive stats rejected');
select throws_ok($$select private.training_gain('NaN',1,5)$$,'22023','INVALID_TRAINING_INPUT','NaN stats rejected');
select throws_ok($$select private.training_gain(10,'Infinity',5)$$,'22023','INVALID_TRAINING_INPUT','Infinite efficiency rejected');
select throws_ok($$select private.training_gain(10,1,0)$$,'22023','INVALID_TRAINING_INPUT','Empty work rejected');
select throws_ok($$select private.training_gain(10,1,101)$$,'22023','INVALID_TRAINING_INPUT','Work loop bounded by Energy cap');
select throws_ok($$select private.training_gain(9007199254740991,1,5)$$,'P0001','PROGRESSION_LIMIT','Overflow rejected before charging');

select ok(bool_and(private.training_gain(s*10,1,5)>private.training_gain(s,1,5)
  and private.training_gain(s*10,1,5)/(s*10)<private.training_gain(s,1,5)/s),
  'Absolute gains rise while percentage growth falls')
  from unnest(array[10,100,1000,10000,100000]::numeric[]) s;

create temporary table partitions(stat numeric, efficiency numeric, whole numeric, split numeric);
do $$
declare s numeric; m numeric; gain numeric; amount integer;
begin
  foreach s in array array[10,123.456789,1000,1000000,1000000000]::numeric[] loop
    foreach m in array array[1,1.15,1.35,1.55,1.8,2.05,2.3,2.55,2.8,3]::numeric[] loop
      gain:=0;
      foreach amount in array array[5,6,7,32,50] loop
        gain:=gain+private.training_gain(s+gain,m,amount);
      end loop;
      insert into partitions values(s,m,private.training_gain(s,m,100),gain);
    end loop;
  end loop;
end; $$;
select ok(bool_and(whole=split),'All 50 stat/tier combinations preserve exact gains across unequal job sizes') from partitions;
select ok(bool_and(whole=round(whole,6)),'Every normal reward has at most six decimals') from partitions;
select is((select data_type from information_schema.columns where table_schema='public'
  and table_name='characters' and column_name='crew_attack'),'numeric','Crew decimals persist in the database');
select is((select data_type from information_schema.columns where table_schema='private'
  and table_name='training_tiers' and column_name='efficiency'),'numeric','Tier efficiencies are fractional');
select ok(to_regprocedure('private.crew_training_gain(bigint,double precision)') is null,'Obsolete integer overload cannot truncate gains');

set local role authenticated;
select throws_ok($$select private.training_gain(10,1,5)$$,'42501',null,'Clients cannot invoke the internal gain resolver');
reset role;
select * from finish();
rollback;
