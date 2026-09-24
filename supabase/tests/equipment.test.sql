begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();

insert into auth.users(id,email,is_anonymous,raw_user_meta_data) values
('e9000000-0000-4000-8000-000000000001','equip-one@example.test',false,'{"character_name":"EquipCaptainOne"}'),
('e9000000-0000-4000-8000-000000000002','equip-two@example.test',false,'{"character_name":"EquipCaptainTwo"}');
create temporary table f as select
  (select id from public.characters where user_id='e9000000-0000-4000-8000-000000000001') a,
  (select id from public.characters where user_id='e9000000-0000-4000-8000-000000000002') d;
create temporary table results(key text primary key,value jsonb);
grant all on f,results to authenticated;
insert into private.item_instances(id,character_id,item_id,quality)
select v.id::uuid,case when v.owner='a' then f.a else f.d end,v.item_id,v.quality from f cross join (values
  ('e9100000-0000-4000-8000-000000000001','a','cutlass',0),('e9100000-0000-4000-8000-000000000002','a','cutlass',100),
  ('e9100000-0000-4000-8000-000000000003','a','flintlock_pistol',50),('e9100000-0000-4000-8000-000000000004','a','oak_sheathing',100),
  ('e9100000-0000-4000-8000-000000000005','a','canvas_sails',50),('e9100000-0000-4000-8000-000000000006','a','buff_coat',50),
  ('e9100000-0000-4000-8000-000000000007','d','cutlass',50),('e9100000-0000-4000-8000-000000000008','d','buff_coat',100)
) v(id,owner,item_id,quality);

-- Definition ranges and Quality.
select is(private.item_stats(d,0),'{"quality":0,"damage":12,"precision":48}'::jsonb,'Zero Quality uses the minimum of each range')
  from private.item_definitions d where id='cutlass';
select is(private.item_stats(d,100),'{"quality":100,"damage":15,"precision":56}'::jsonb,'Full Quality uses the maximum of each range')
  from private.item_definitions d where id='cutlass';
select is(private.item_stats(d,50),'{"quality":50,"armor":7.5,"health":18}'::jsonb,'Hull health is a whole number')
  from private.item_definitions d where id='oak_sheathing';
select is(private.item_stats(d,50)->'shots','2'::jsonb,'Firearms carry a fixed number of shots') from private.item_definitions d where id='flintlock_pistol';
select throws_ok($$update private.item_definitions set armor_min=1,armor_max=2 where id='cutlass'$$,'23514',null,'Weapons cannot carry armor');
select throws_ok($$update private.item_definitions set damage_min=null,damage_max=null where id='cutlass'$$,'23514',null,'Weapons require damage');
select throws_ok($$update private.item_definitions set armor_max=99 where id='buff_coat'$$,'23514',null,'Armor respects the configured limit');
select throws_ok($$update private.item_definitions set shots=null where id='flintlock_pistol'$$,'23514',null,'Firearms require shots');
select throws_ok($$update private.item_definitions set slot='crew_weapon' where id='cutlass'$$,'23514',null,'The former crew weapon slot is gone');
select is((select count(*) from private.item_definitions where slot='crew_weapon'),0::bigint,'Former crew weapons were moved to melee');

-- Hit zones, Precision and damage.
select is((select zone||':'||critical from private.combat_zone('crew',roll)),expected,label) from (values
  (0.05::double precision,'head:true','Crew zone rolls start with the critical head'),(0.3,'body:false','Body covers the middle crew rolls'),
  (0.65,'legs:false','Legs follow the body'),(0.95,'feet:false','Feet end the crew zones')) v(roll,expected,label);
select is((select zone||':'||armor_slot from private.combat_zone('ship',roll)),expected,label) from (values
  (0.05::double precision,'waterline:hull','The waterline is protected by the hull'),(0.5,'hull:hull','Most ship hits strike the hull'),
  (0.8,'rigging:sails','Sails protect the rigging')) v(roll,expected,label);
select is(round(private.combat_precision_chance(chance,precision)::numeric,4),expected,label) from (values
  (0.5::double precision,60::numeric,0.6000::numeric,'Precision has full effect at even odds'),
  (0.1,60,0.1200,'Precision fades toward certain misses'),(0.9,60,0.9200,'Precision fades toward certain hits'),
  (0.5,50,0.5000,'Fifty Precision is neutral'),(0,100,0.0000,'Guaranteed misses stay guaranteed'),
  (1,0,1.0000,'Guaranteed hits stay guaranteed')) v(chance,precision,expected,label);
select is(private.combat_damage(10,10,10,1,0),32,'Neutral weapon, zone and armor keep the base damage');
select is(private.combat_damage(10,10,20,1,0),64,'Weapon Damage scales linearly from the weapon scale');
select is(private.combat_damage(10,10,10,2.5,0),80,'Critical zones multiply damage');
select is(private.combat_damage(10,10,10,1,50),16,'Armor reduces damage by its percentage');
select is(private.combat_damage(1,25,40,2.5,0),0,'Full Defense mitigation still blocks everything');
select is(private.combat_damage(1,24,10,0.4,75),1,'Partial mitigation keeps the one damage floor');

-- A boarding state with equipment built from real snapshots.
insert into results select 'boarding',jsonb_build_object('status','active','phase','boarding','round',0,
  'attacker',private.combat_snapshot(ac,clock_timestamp())||jsonb_build_object('crew',jsonb_build_object('attack',1,'defense',1,'speed',1,'accuracy',1),
    'shots',2,'loadout',jsonb_build_object('firearm',jsonb_build_object('name','Test Pistol','damage',20,'precision',50,'shots',2))),
  'defender',private.combat_snapshot(dc,clock_timestamp())||jsonb_build_object('crew',jsonb_build_object('attack',1,'defense',1,'speed',1,'accuracy',1),
    'shots',0,'loadout',jsonb_build_object('body',jsonb_build_object('name','Test Coat','armor',50))))
  from public.characters ac,public.characters dc,f where ac.id=f.a and dc.id=f.d;
insert into results select 'shoot',private.resolve_combat_round(value,'crew_shoot',array[0.0,0.0,0.0,0.3,0.3]) from results where key='boarding';
select is((select value#>>'{event,attacker_damage}' from results where key='shoot'),'15','A firearm shot into armored body applies weapon and armor');
select is((select value#>>'{event,attacker_zone}' from results where key='shoot'),'body','The hit zone is recorded');
select is((select value#>>'{event,attacker_weapon}' from results where key='shoot'),'Test Pistol','The weapon is recorded');
select is((select value#>>'{event,attacker_critical}' from results where key='shoot'),'false','Body hits are not critical');
select is((select value#>>'{state,attacker,shots}' from results where key='shoot'),'1','A shot spends one charge');
select is((select value#>>'{event,defender_order}' from results where key='shoot'),'crew_attack','A defender without shots uses melee');
select is((select value#>>'{event,defender_weapon}' from results where key='shoot'),'Fists','An empty melee slot fights with fists');
select is((select value#>>'{event,defender_damage}' from results where key='shoot'),'15','Unarmored fists deal the base damage');
select is((select private.resolve_combat_round(value,'crew_shoot',array[0.0,0.0,0.0,0.05,0.3])#>>'{event,attacker_damage}' from results where key='boarding'),
  '75','A head shot multiplies the damage and ignores body armor');
select is((select private.resolve_combat_round(value,'crew_shoot',array[0.0,0.0,0.0,0.05,0.3])#>>'{event,attacker_critical}' from results where key='boarding'),
  'true','Head hits are critical');
select is((select private.resolve_combat_round(value,'crew_attack',array[0.0,0.0,0.0,0.3,0.3])#>>'{event,attacker_damage}' from results where key='boarding'),
  '8','Melee without a weapon uses fists against the armor');
select throws_ok($$select private.resolve_combat_round(jsonb_set(value,'{attacker,shots}','0'),'crew_shoot',array[0.0,0.0,0.0,0.3,0.3]) from results where key='boarding'$$,
  'P0001','NO_SHOTS','An empty firearm cannot shoot');
select throws_ok($$select private.resolve_combat_round(value #- '{attacker,loadout,firearm}','crew_shoot',array[0.0,0.0,0.0,0.3,0.3]) from results where key='boarding'$$,
  'P0001','NO_SHOTS','A captain without a firearm cannot shoot');
select is((select private.resolve_combat_round(jsonb_set(jsonb_set(value,'{defender,shots}','1'),'{defender,loadout,firearm}',
  '{"name":"Guard Pistol","damage":20,"precision":50,"shots":1}'),'crew_attack',array[0.0,0.0,0.0,0.3,0.3])#>>'{event,defender_order}' from results where key='boarding'),
  'crew_shoot','Defenders shoot while they have charges');
select is((select private.resolve_combat_round(value #- '{attacker,loadout}' #- '{attacker,shots}','crew_attack',array[0.0,0.0,0.0,0.3,0.3])#>>'{event,attacker_damage}'
  from results where key='boarding'),'8','Snapshots from before equipment still resolve with fallback weapons');
select throws_ok($$select private.resolve_combat_round(value,'crew_attack',array[0.0,0.0,0.0]) from results where key='boarding'$$,
  'P0001','INVALID_ROLLS','Rounds require hit, boarding and zone rolls');

-- Temporaries, shot types and effects in a single round.
insert into results select 'throw',private.resolve_combat_round(jsonb_set(jsonb_set(value,'{attacker,loadout,temporary}',
  '{"item_id":"grenado","name":"Test Grenado","damage":25,"precision":60}'),'{attacker,temporary_uses}','1'),'crew_throw',array[0.0,0.0,0.0,0.3,0.3]) from results where key='boarding';
select is((select value#>>'{event,attacker_damage}' from results where key='throw'),'19','A thrown grenado strikes like a weapon through armor');
select is((select value#>>'{event,attacker_consumed}' from results where key='throw'),'grenado','A thrown temporary is consumed');
select is((select value#>>'{state,attacker,temporary_uses}' from results where key='throw'),'0','A throw spends the fight allowance');
select throws_ok($$select private.resolve_combat_round(value,'crew_throw',array[0.0,0.0,0.0,0.3,0.3]) from results where key='boarding'$$,
  'P0001','NO_TEMPORARY','A captain without a temporary cannot throw');
insert into results select 'smoke',private.resolve_combat_round(jsonb_set(jsonb_set(value,'{attacker,loadout,temporary}',
  '{"item_id":"smoke_pot","name":"Test Smoke","precision":100,"debuff_multiplier":0.33,"debuff_rounds":3}'),'{attacker,temporary_uses}','1'),'crew_throw',array[0.0,0.0,0.0,0.3,0.3]) from results where key='boarding';
select is((select value#>>'{event,attacker_damage}' from results where key='smoke'),'0','Smoke deals no damage');
select is((select value#>'{state,defender,effects,crew_accuracy}' from results where key='smoke'),'{"multiplier":0.33,"rounds":3}'::jsonb,'Smoke weakens the target crew for its rounds');
select is((select value#>>'{event,attacker_effect}' from results where key='smoke'),'crew_accuracy','The effect is recorded');
select is((select value#>'{event,attacker_zone}' from results where key='smoke'),'null'::jsonb,'Smoke lands on the crew as a whole, not on one zone');
insert into results select 'blinded',private.resolve_combat_round(jsonb_set(value,'{defender,effects}','{"crew_accuracy":{"multiplier":0.01,"rounds":1}}'),
  'crew_attack',array[0.0,0.0,0.0,0.3,0.3]) from results where key='boarding';
select is((select value#>>'{event,defender_hit}' from results where key='blinded'),'false','A blinded crew misses even a zero roll');
select is((select value#>'{state,defender,effects}' from results where key='blinded'),'{}'::jsonb,'Effects expire after their last round');
insert into results select 'sea',jsonb_set(jsonb_set(jsonb_set(jsonb_set(value,'{phase}','"sea"'),'{attacker,ship}','{"attack":1,"defense":1,"speed":1,"accuracy":1}'),
  '{defender,ship}','{"attack":1,"defense":1,"speed":1,"accuracy":1}'),'{attacker,shot_stock}','{"chain":1,"grape":1}') from results where key='boarding';
insert into results select 'chain',private.resolve_combat_round(value,'fire_chain',array[0.0,0.99,0.0,0.05,0.3]) from results where key='sea';
select is((select value#>>'{event,attacker_zone}' from results where key='chain'),'rigging','Chain shot always strikes the rigging');
select is((select value#>>'{event,attacker_damage}' from results where key='chain'),'15','Chain shot keeps full damage in the rigging');
select is((select value#>'{state,defender,effects,ship_speed}' from results where key='chain'),'{"multiplier":0.8,"rounds":3}'::jsonb,'Chain shot slows the target ship');
select is((select value#>>'{state,attacker,shot_stock,chain}' from results where key='chain'),'0','Chain shot spends one from the stock');
select is((select value#>>'{event,attacker_consumed}' from results where key='chain'),'chain_shot','Chain shot is consumed from inventory');
select is((select value#>>'{state,attacker,ammo}' from results where key='chain'),'9','Special shot still uses a salvo');
insert into results select 'grape',private.resolve_combat_round(value,'fire_grape',array[0.0,0.99,0.0,0.3,0.3]) from results where key='sea';
select is((select value#>>'{event,attacker_target}' from results where key='grape'),'crew','Grape shot strikes the crew');
select is((select value#>>'{event,attacker_damage}' from results where key='grape'),'5','Grape shot is reduced and meets crew armor');
select is((select value#>>'{state,defender,ship_health}' from results where key='grape'),(select value#>>'{defender,ship_health}' from results where key='sea'),'Grape shot spares the hull');
select throws_ok($$select private.resolve_combat_round(jsonb_set(value,'{attacker,shot_stock,chain}','0'),'fire_chain',array[0.0,0.0,0.0,0.3,0.3]) from results where key='sea'$$,
  'P0001','NO_SHOT_STOCK','Special shot requires stock');
select is((select private.resolve_combat_round(jsonb_set(jsonb_set(value,'{defender,loadout,temporary}','{"item_id":"smoke_pot","name":"Guard Smoke","precision":100,"debuff_multiplier":0.33,"debuff_rounds":3}'),
  '{defender,temporary_uses}','1'),'crew_attack',array[0.0,0.0,0.0,0.3,0.3])#>>'{event,defender_order}' from results where key='boarding'),'crew_throw','Defenders throw their temporary first');

-- Equip, receipts and ownership.
select set_config('request.jwt.claims','{"sub":"e9000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
select throws_ok($$select * from private.character_equipment$$,'42501',null,'Raw equipment rows are private');
insert into results select 'equip',public.equip_item('e9100000-0000-4000-8000-000000000001','e9200000-0000-4000-8000-000000000001');
select is((select value->>'slot' from results where key='equip'),'melee','Equip uses the definition slot');
select is(public.equip_item('e9100000-0000-4000-8000-000000000001','e9200000-0000-4000-8000-000000000001'),(select value from results where key='equip'),
  'Equip retry returns the receipt');
select throws_ok($$select public.equip_item('e9100000-0000-4000-8000-000000000002','e9200000-0000-4000-8000-000000000001')$$,'22023','REQUEST_CONFLICT',
  'A receipt cannot be reused for another item');
select is(public.equip_item('e9100000-0000-4000-8000-000000000002',gen_random_uuid())->>'replaced_entry_id','e9100000-0000-4000-8000-000000000001',
  'Equipping replaces the previous item in the slot');
select is((select i->>'equipped_slot' from jsonb_array_elements(public.list_inventory()->'items') i where i->>'id'='e9100000-0000-4000-8000-000000000002'),'melee',
  'Inventory marks the equipped instance');
select is((select i->'equipped_slot' from jsonb_array_elements(public.list_inventory()->'items') i where i->>'id'='e9100000-0000-4000-8000-000000000001'),'null'::jsonb,
  'The replaced instance returns to the bag');
select is(public.list_inventory()#>>'{loadout,melee,damage}','15.00','Inventory returns the loadout with stats');
select throws_ok($$select public.equip_item('e9100000-0000-4000-8000-000000000007',gen_random_uuid())$$,'P0001','ITEM_NOT_FOUND','Another captain''s item cannot be equipped');
select throws_ok($$select public.trash_inventory_item('e9100000-0000-4000-8000-000000000002','instance',1,gen_random_uuid())$$,'P0001','ITEM_EQUIPPED',
  'Equipped items cannot be destroyed');
select throws_ok($$select public.create_market_listings('[{"entry_id":"e9100000-0000-4000-8000-000000000002","entry_type":"instance","quantity":1,"unit_price":10}]',gen_random_uuid())$$,
  'P0001','ITEM_EQUIPPED','Equipped items cannot be listed');
select is((select count(*) from jsonb_array_elements(public.list_market_inventory()->'items') i where i->>'id'='e9100000-0000-4000-8000-000000000002'),0::bigint,
  'The sell list leaves out equipped items');
select lives_ok($$select public.equip_item('e9100000-0000-4000-8000-000000000003',gen_random_uuid())$$,'A firearm can be equipped');
select lives_ok($$select public.equip_item('e9100000-0000-4000-8000-000000000005',gen_random_uuid())$$,'Sails can be equipped');
select lives_ok($$select public.equip_item('e9100000-0000-4000-8000-000000000006',gen_random_uuid())$$,'Body armor can be equipped');

-- Hull health follows the equipped hull without free healing.
select is((public.get_game_state()->>'ship_health_max')::integer,100,'The base Ship Health applies without a hull');
select lives_ok($$select public.equip_item('e9100000-0000-4000-8000-000000000004',gen_random_uuid())$$,'A hull can be equipped');
select is((public.get_game_state()->>'ship_health_max')::integer,125,'The hull raises maximum Ship Health');
select is((public.get_game_state()->>'ship_health')::integer,100,'A new hull does not heal instantly');
reset role;
update public.characters set ship_recovery_at=clock_timestamp()-interval '1 hour' where id=(select a from f);
set local role authenticated;
select is((public.get_game_state()->>'ship_health')::integer,125,'Ship Health recovers to the new maximum');
reset role;
insert into results select 'snapshot',private.combat_snapshot(c,clock_timestamp()) from public.characters c where id=(select a from f);
select is((select value->>'ship_health_max' from results where key='snapshot'),'125','Combat snapshots include the hull maximum');
select is((select value->>'shots' from results where key='snapshot'),'2','Combat snapshots load the firearm charges');
select is((select value#>>'{ship,speed}' from results where key='snapshot'),'10.4','Sails raise Ship Speed in combat');
select is((select value#>>'{loadout,body,armor}' from results where key='snapshot'),'10.00','Combat snapshots include armor');
select is((select value#>'{loadout,melee,entry_id}' from results where key='snapshot'),null,'Combat snapshots leave out inventory identifiers');
select is((select ship_speed from public.characters where id=(select a from f)),10::numeric,'Trained Ship Speed is unchanged');
set local role authenticated;
select is(public.unequip_item('hull',gen_random_uuid())->>'entry_id','e9100000-0000-4000-8000-000000000004','Unequip returns the removed item');
select is((public.get_game_state()->>'ship_health')::integer,100,'Removing the hull clamps Ship Health to the base maximum');
select throws_ok($$select public.unequip_item('hull',gen_random_uuid())$$,'P0001','NOT_EQUIPPED','An empty slot cannot be unequipped');
select throws_ok($$select public.unequip_item('crew_weapon',gen_random_uuid())$$,'22023','INVALID_SLOT','Unknown slots are rejected');
select lives_ok($$select public.equip_item('e9100000-0000-4000-8000-000000000004',gen_random_uuid())$$,'The hull can be equipped again');
reset role;
update public.characters set ship_health=0 where id=(select a from f);
update public.characters set hospital_started_at=clock_timestamp()-interval '10 minutes',hospital_until=clock_timestamp()-interval '1 minute' where id=(select a from f);
set local role authenticated;
select is((public.get_game_state()->>'ship_health')::integer,125,'Hospital discharge fills the equipped maximum');
reset role;
update public.characters set crew_health=0 where id=(select a from f);
set local role authenticated;
select throws_ok($$select public.unequip_item('melee',gen_random_uuid())$$,'P0001','IN_HOSPITAL','Equipment cannot change in hospital');
reset role;
update public.characters set hospital_started_at=null,hospital_until=null,crew_health=100 where id=(select a from f);

-- Temporaries are equipped as stacks and consumed from inventory during a fight.
insert into private.item_stacks(id,character_id,item_id,quantity) select v.id::uuid,case when v.owner='a' then f.a else f.d end,v.item_id,v.quantity from f cross join (values
  ('e9300000-0000-4000-8000-000000000001','a','grenado',2),('e9300000-0000-4000-8000-000000000002','a','chain_shot',3),
  ('e9300000-0000-4000-8000-000000000003','a','grape_shot',1),('e9300000-0000-4000-8000-000000000004','d','smoke_pot',1),
  ('e9300000-0000-4000-8000-000000000005','a','oak_planks',1)) v(id,owner,item_id,quantity);
set local role authenticated;
select throws_ok($$select public.equip_item('e9300000-0000-4000-8000-000000000005',gen_random_uuid())$$,'P0001','NOT_EQUIPPABLE','Materials cannot be equipped');
select is(public.equip_item('e9300000-0000-4000-8000-000000000001',gen_random_uuid())->>'slot','temporary','A temporary stack is equipped in the temporary slot');
select is(public.list_inventory()#>>'{loadout,temporary,quantity}','2','The loadout shows the temporary stock');
select is((select i->>'equipped_slot' from jsonb_array_elements(public.list_inventory()->'items') i where i->>'id'='e9300000-0000-4000-8000-000000000001'),'temporary','The equipped stack is marked');
select is((select i->>'slot' from jsonb_array_elements(public.list_inventory()->'items') i where i->>'id'='e9300000-0000-4000-8000-000000000002'),null,'Shot types are not equippable');
select is(public.unequip_item('temporary',gen_random_uuid())->>'name','Grenado','The temporary can be unequipped');
select lives_ok($$select public.equip_item('e9300000-0000-4000-8000-000000000001',gen_random_uuid())$$,'The temporary can be equipped again');
-- Combat snapshots load the loadout and reveal only names to the opponent.
select set_config('request.jwt.claims','{"sub":"e9000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
set local role authenticated;
select lives_ok($$select public.equip_item('e9100000-0000-4000-8000-000000000008',gen_random_uuid())$$,'The defender equips body armor');
select lives_ok($$select public.equip_item('e9300000-0000-4000-8000-000000000004',gen_random_uuid())$$,'The defender equips a smoke pot');
select set_config('request.jwt.claims','{"sub":"e9000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
insert into results select 'battle',public.start_combat(d,gen_random_uuid()) from f;
select is((select value#>>'{battle,attacker,loadout,firearm,name}' from results where key='battle'),'Flintlock Pistol','The own loadout is visible');
select is((select value#>>'{battle,attacker,shots}' from results where key='battle'),'2','The own firearm charges are visible');
select is((select value#>>'{battle,defender,loadout,body,name}' from results where key='battle'),'Buff Coat','Opponent equipment names are revealed');
select is((select value#>'{battle,defender,loadout,body,armor}' from results where key='battle'),null,'Opponent equipment stats stay hidden');
select throws_ok($$select public.unequip_item('melee',gen_random_uuid())$$,'P0001','IN_COMBAT','Equipment cannot change during combat');
reset role;
select is((select defender_shots from private.combat_participants where character_id=(select a from f)),0,'A defender without a firearm has no shots');
select is((select defender_temporary_uses from private.combat_participants where character_id=(select a from f)),1,'The defender brings its temporary allowance');
select is((select value#>>'{battle,attacker,shot_stock,chain}' from results where key='battle'),'3','The own shot stock is visible');
select is((select value#>>'{battle,attacker,temporary_uses}' from results where key='battle'),'1','The own temporary allowance is visible');
-- Deterministic misses keep both ships afloat while stock is spent.
create or replace function private.combat_roll() returns double precision language sql volatile security invoker set search_path='' as $$ select 0.99::double precision $$;
select set_config('request.jwt.claims','{"sub":"e9000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
select public.submit_combat_order((value#>>'{battle,id}')::uuid,0,'fire_chain',gen_random_uuid()) from results where key='battle';
select public.submit_combat_order((value#>>'{battle,id}')::uuid,1,'fire_grape',gen_random_uuid()) from results where key='battle';
select is((select public.submit_combat_order((value#>>'{battle,id}')::uuid,2,'fire_grape',gen_random_uuid())->>'error' from results where key='battle'),'NO_SHOT_STOCK','Spent shot stock is refused');
reset role;
select is(private.stack_quantity((select a from f),'chain_shot'),2::bigint,'A chain shot left the inventory even on a miss');
select is(private.stack_quantity((select a from f),'grape_shot'),0::bigint,'The last grape shot was used');
update private.combat_participants set phase='boarding' where character_id=(select a from f);
set local role authenticated;
select public.submit_combat_order((value#>>'{battle,id}')::uuid,2,'crew_throw',gen_random_uuid()) from results where key='battle';
select is((select public.submit_combat_order((value#>>'{battle,id}')::uuid,3,'crew_throw',gen_random_uuid())->>'error' from results where key='battle'),'NO_TEMPORARY','One throw per fight');
reset role;
select is(private.stack_quantity((select a from f),'grenado'),1::bigint,'The thrown grenado left the inventory');
select is(private.stack_quantity((select d from f),'smoke_pot'),0::bigint,'The defender threw its smoke pot');
select is((select defender_temporary_uses from private.combat_participants where character_id=(select a from f)),0,'The defender allowance is spent');
select is((select count(*) from private.combat_rounds r join private.combats b on b.id=r.combat_id where b.defender_id=(select d from f)
  and r.event->>'defender_order'='crew_throw'),1::bigint,'The defender threw only once');
select is((select state#>>'{defender,temporary_uses}' from private.combats where defender_id=(select d from f)),'0','The defender view keeps its spent allowance');
select set_config('request.jwt.claims','{"sub":"e9000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
select is((select public.get_combat((value#>>'{battle,id}')::uuid)#>'{attacker,effects,crew_accuracy,rounds}' from results where key='battle'),'3'::jsonb,
  'The attacker sees the smoke that blinds its crew');
select is((select public.get_combat((value#>>'{battle,id}')::uuid)#>'{defender,effects}' from results where key='battle'),'{}'::jsonb,
  'Opponent effects are visible, and the missed grenado applied none');
reset role;
select is((select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='private' and c.relname='character_equipment' and c.relrowsecurity),1::bigint,'Equipment rows have RLS');
select * from finish();
rollback;
