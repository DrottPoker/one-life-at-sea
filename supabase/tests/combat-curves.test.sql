begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();

-- Published reference points, rounded to the wiki's displayed precision.
select is(round((private.combat_hit_chance(accuracy,speed)*100)::numeric,2),expected,label)
from (values
  (1::numeric,1000::numeric,0.00::numeric,'Extreme evasion guarantees misses'),
  (1,64,0.00,'64 to 1 evasion is exactly zero'),
  (1,20,5.63,'One twentieth accuracy follows the reference curve'),
  (1,10,10.93,'One tenth accuracy follows the reference curve'),
  (1,5,18.41,'One fifth accuracy follows the reference curve'),
  (1,2,33.26,'Half accuracy follows the reference curve'),
  (1,1,50.00,'Equal stats have fifty percent hit chance'),
  (3,2,60.49,'One and a half accuracy follows the reference curve'),
  (2,1,66.74,'Double accuracy follows the reference curve'),
  (4,1,78.57,'Fourfold accuracy follows the reference curve'),
  (10,1,89.07,'Tenfold accuracy follows the reference curve'),
  (20,1,94.37,'Twentyfold accuracy follows the reference curve'),
  (64,1,100.00,'64 to 1 accuracy guarantees hits'),
  (1000,1,100.00,'Extreme accuracy stays at one hundred')
) reference(accuracy,speed,expected,label);
select ok(private.combat_hit_chance(1,63)>0,'Evasion below the zero threshold still permits hits');
select ok(private.combat_hit_chance(63,1)<1,'Accuracy below the certainty threshold can still miss');
select ok(abs(private.combat_hit_chance(7,13)+private.combat_hit_chance(13,7)-1)<0.00000001,'Reversing stats gives complementary chances');
select is(private.combat_hit_chance(2,1),private.combat_hit_chance(2000000,1000000),'Hit chance uses ratios at every scale');

select ok(abs(private.combat_damage_reduction(attack,defense)*100-expected)<0.02,label)
from (values
  (32::numeric,1::numeric,0::numeric,'32 to 1 attack removes defense mitigation'),
  (16,1,10,'Sixteenfold attack leaves ten percent mitigation'),
  (8,1,20,'Eightfold attack leaves twenty percent mitigation'),
  (4,1,30,'Fourfold attack leaves thirty percent mitigation'),
  (2,1,40,'Double attack leaves forty percent mitigation'),
  (1,1,50,'Equal attack and defense reduce damage by half'),
  (1,2,60.77,'Double defense follows the adjusted curve'),
  (1,4,71.53,'Fourfold defense follows the adjusted curve'),
  (1,10,85.77,'Tenfold defense follows the adjusted curve'),
  (1,14,90.99,'The former fourteenfold threshold no longer fully blocks damage'),
  (1,20,96.53,'Twentyfold defense still allows damage'),
  (1,25,100,'Twenty-fivefold defense blocks all damage'),
  (1,1000,100,'Extreme defense remains fully blocking')
) reference(attack,defense,expected,label);
select ok(private.combat_damage_reduction(100,2499)<1,'Defense below twenty-fivefold is not full mitigation');
select is(private.combat_damage(1,1),15,'Stats at one deal fifteen damage on a hit');
select is(private.combat_damage(10,10),32,'New captains at ten deal thirty-two damage on a hit');
select is(private.combat_damage(100,100),56,'Damage is no longer capped at forty');
select is(private.combat_damage(1000,1000),87,'Base damage follows logarithmic growth');
select is(private.combat_damage(1,25),0,'Full mitigation reaches zero damage');
select is(private.combat_damage(1,14),3,'Fourteenfold defense still receives damage');
select is(private.combat_damage(1,24),1,'Rounding cannot fully block damage below twenty-fivefold');
select is(private.combat_damage(100,2499),1,'Just below the threshold still deals one damage');
select ok(private.combat_damage(100,1)>private.combat_damage(10,1),'More attack increases damage');
select ok(private.combat_damage(100,100)<private.combat_damage(100,10),'More defense reduces damage');
select throws_ok('select private.combat_hit_chance(0,1)','22023','INVALID_COMBAT_STAT','Zero accuracy is rejected');
select throws_ok('select private.combat_damage(1,0)','22023','INVALID_COMBAT_STAT','Zero defense is rejected');

create temporary table curve_fixtures(name text primary key,value jsonb);
insert into curve_fixtures values('base','{
  "status":"active","phase":"sea","round":0,
  "attacker":{"id":"00000000-0000-4000-8000-000000000001","ship_health":100,"crew_health":100,"ammo":10,
    "ship":{"attack":1,"defense":1,"accuracy":1,"speed":1},"crew":{"attack":1,"defense":1,"accuracy":1,"speed":1}},
  "defender":{"id":"00000000-0000-4000-8000-000000000002","ship_health":100,"crew_health":100,"ammo":10,"defence_order":"cannon",
    "ship":{"attack":1,"defense":1,"accuracy":1,"speed":1},"crew":{"attack":1,"defense":1,"accuracy":1,"speed":1}}
}');
select is((select private.resolve_combat_round(value,'fire',array[0.499999,0.5,0.0])#>>'{event,attacker_hit}' from curve_fixtures where name='base'),'true','Roll below hit chance hits');
select is((select private.resolve_combat_round(value,'fire',array[0.499999,0.5,0.0])#>>'{event,defender_hit}' from curve_fixtures where name='base'),'false','Roll at hit chance misses');

insert into curve_fixtures select 'miss',private.resolve_combat_round(
  jsonb_set(jsonb_set(value,'{defender,ship,speed}','64'),'{attacker,ship,speed}','64'),'fire',array[0.0,0.0,0.0])
from curve_fixtures where name='base';
select is((select value#>>'{event,attacker_hit}' from curve_fixtures where name='miss'),'false','Attacker cannot hit extreme speed even with a zero roll');
select is((select value#>>'{event,defender_hit}' from curve_fixtures where name='miss'),'false','The same evasion rule applies to counterattacks');
select is((select value#>>'{state,attacker,ship_health}' from curve_fixtures where name='miss'),'100','Misses preserve health');
select is((select value#>>'{state,defender,ammo}' from curve_fixtures where name='miss'),'9','Guaranteed misses still spend ammunition');

insert into curve_fixtures select 'blocked',private.resolve_combat_round(
  jsonb_set(jsonb_set(value,'{defender,ship,defense}','25'),'{attacker,ship,defense}','25'),'fire',array[0.0,0.0,0.0])
from curve_fixtures where name='base';
select is((select value#>>'{event,attacker_hit}' from curve_fixtures where name='blocked'),'true','A blocked hit is still a hit');
select is((select value#>>'{event,attacker_damage}' from curve_fixtures where name='blocked'),'0','Defense can completely stop attacker damage');
select is((select value#>>'{event,defender_damage}' from curve_fixtures where name='blocked'),'0','Defense can completely stop counterattack damage');
select is((select value#>>'{state,status}' from curve_fixtures where name='blocked'),'active','Fully blocked hits do not end the encounter');

insert into curve_fixtures select 'certain',private.resolve_combat_round(
  jsonb_set(jsonb_set(value,'{attacker,ship,accuracy}','64'),'{defender,ship,accuracy}','64'),'fire',array[0.999999999,0.999999999,0.0])
from curve_fixtures where name='base';
select is((select value#>>'{event,attacker_hit}' from curve_fixtures where name='certain'),'true','Extreme accuracy removes the old miss floor');
select is((select value#>>'{event,defender_hit}' from curve_fixtures where name='certain'),'true','Counterattacks can also guarantee a hit');

insert into curve_fixtures select 'crew',private.resolve_combat_round(
  jsonb_set(jsonb_set(jsonb_set(value,'{phase}','"boarding"'),'{defender,crew,speed}','64'),'{attacker,crew,defense}','25'),
  'crew_attack',array[0.0,0.0,0.0])
from curve_fixtures where name='base';
select is((select value#>>'{event,attacker_hit}' from curve_fixtures where name='crew'),'false','Boarding uses crew speed for guaranteed evasion');
select is((select value#>>'{event,defender_damage}' from curve_fixtures where name='crew'),'0','Boarding uses crew defense for full mitigation');
select is((select value#>>'{state,attacker,ship_health}' from curve_fixtures where name='crew'),'100','Crew combat does not use ship health');
select is((select value#>>'{state,attacker,ammo}' from curve_fixtures where name='crew'),'10','Crew attacks do not consume salvos');

insert into curve_fixtures select 'overkill',private.resolve_combat_round(
  jsonb_set(jsonb_set(value,'{attacker,ship,attack}','10000'),'{defender,ship_health}','3'),'fire',array[0.0,0.0,0.0])
from curve_fixtures where name='base';
select is((select value#>>'{event,attacker_damage}' from curve_fixtures where name='overkill'),'3','Recorded damage is capped to remaining HP');
select is((select value#>>'{event,defender_damage}' from curve_fixtures where name='overkill'),'15','A defeated defender still executes its simultaneous counterattack');
select is((select private.resolve_combat_round(
  jsonb_set(jsonb_set(jsonb_set(value,'{round}','24'),'{attacker,ship,speed}','64'),'{defender,ship,speed}','64'),
  'fire',array[0.0,0.0,0.0])#>>'{state,outcome}' from curve_fixtures where name='base'),'draw','Mutual evasion respects the existing round limit');
select is((select private.resolve_combat_round(
  jsonb_set(jsonb_set(value,'{attacker,ship,defense}','25'),'{attacker,ship_health}','1'),
  'retreat',array[0.0,0.0,0.0])#>>'{state,outcome}' from curve_fixtures where name='base'),'retreated','A blocked counterattack permits retreat with one HP');

set local role authenticated;
select throws_ok('select private.combat_hit_chance(1,1)','42501',null,'Clients cannot invoke private hit calculations');
select throws_ok('select private.combat_damage(1,1)','42501',null,'Clients cannot invoke private damage calculations');
reset role;
select * from finish();
rollback;

