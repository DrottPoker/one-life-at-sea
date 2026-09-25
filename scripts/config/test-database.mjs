import { execFileSync } from "node:child_process";
import { loadConfig, migrationSql, revision, validateConfig, inventoryCatalogSql, forumCatalogSql } from "./core.mjs";

const config = loadConfig();
const originalRevision = revision(config);
const originalShipSecondsPerEnergy = config.gameplay.training.shipSecondsPerEnergy;
config.gameplay.economy.initialGoldCoins = 77;
config.gameplay.activities.catalog[0].xpGain = 17;
config.gameplay.crafting.recipes[0].ingredients[0].quantity = 3;
config.gameplay.crafting.recipes[0].ingredients.push({ itemId: "brass_compass", quantity: 2 });
config.gameplay.crafting.recipes[0].outputQuantity = 2;
config.gameplay.crafting.xpGain = 17;
config.gameplay.skills.xpThresholds = config.gameplay.skills.xpThresholds.map(xp => xp * 2);
config.gameplay.skills.catalog.push({ id: "mining", name: "Mining" });
Object.assign(config.gameplay.stamina, { maximum: 80, recoveryAmount: 2, recoverySeconds: 60, activityCost: 3 });
Object.assign(config.gameplay.morale, { lossPerEnergy: 0.2, recoveryAmount: 2, recoverySeconds: 60, statBonusBps: 250, trainingBonusBps: 300, tavernGain: 10, tavernGoldCost: 17 });
config.gameplay.hospital.durationSeconds = 19;
Object.assign(config.gameplay.resources, { energyMax: 120, energyRecoverySeconds: 60, energyRecoveryAmount: 3, healthMax: 150,
  shipHealthInitial: 120, crewHealthInitial: 110, shipRecoverySeconds: 7, crewRecoverySeconds: 4, healthRecoveryPercent: 10 });
Object.assign(config.gameplay.training, { energyCost: 7, perfectChanceBps: 0, statScale: 2000, statExponent: 0.5 });
for (const tier of [...config.gameplay.training.crewTiers, ...config.gameplay.training.shipTiers]) tier.efficiency *= 3;
config.gameplay.training.xpPerEnergy = 2;
config.gameplay.training.shipTiers[0].name = "Captain\'s $catalog$ Workshop";
config.gameplay.training.shipSecondsPerEnergy *= 2;
config.gameplay.training.energyPerUnit = 7;
config.gameplay.training.shipGainMultiplier = 4;
config.gameplay.training.shipMaterialEnergy = 3;
config.gameplay.training.shipMaterials.forEach(item => { item.quantity = 2; });
config.gameplay.training.shipMinEnergy = 7;
for (const group of Object.values(config.gameplay.startingStats)) for (const stat of Object.keys(group)) group[stat] = 12;
Object.assign(config.gameplay.combat, { energyCost: 13, maxRounds: 7, startingAmmo: 6, ammoPerShot: 2,
  minimumHealth: 2, idleSeconds: 90, maxDurationSeconds: 360, protectionSeconds: 45, xpGain: 7 });
config.gameplay.skills.battlingHealth = { perLevel: 3, maxLevelBonus: 400 };
config.gameplay.combat.hitChance.extremeRatio = 100;
config.gameplay.notifications.pageSize = 2;
config.gameplay.combat.mitigation.fullReductionDefenseRatio = 50;
Object.assign(config.gameplay.combat.damage, { quadratic: 0, linear: 0, constant: 40 });
config.gameplay.equipment.fallbackWeapons.cannons.name = "Captain's test cannons";
Object.assign(config.gameplay.equipment, { weaponScale: 20 });
Object.assign(config.gameplay.equipment.limits, { maxShipHealth: 60 });
config.gameplay.equipment.zones.crew[0].weight = 100;
config.gameplay.harbor.pageSize = 3;
config.gameplay.inventory.pageSize = 2;
Object.assign(config.gameplay.inventory.items[0], { name: "Captain\'s $inventory$ Cutlass", active: false, stats: { damage: { min: 20, max: 30 }, precision: { min: 40, max: 60 } } });
Object.assign(config.gameplay.seaTravel, { scoutEnergyCost: 9, scoutPageSize: 2, departureEnergyCost: 8, outwardDurationSeconds: 7, returnSecondsPerStep: 11,
  locationTypes: [{ id: "test_cove", name: "Captain's $sea$ Cove", active: true }, { id: "test_depths", name: "Test depths", active: true }] });
Object.assign(config.gameplay.marketplace, { feeBps: 1000, popularityHours: 6, valueWindowHours: 2, pageSize: 2, listingsPageSize: 1, maxBatchSize: 2 });
config.gameplay.inventory.items.find(item => item.id === "brass_compass").tradable = false;
Object.assign(config.gameplay.forum, { threadTitleMaxLength: 10, postMaxLength: 50, threadsPageSize: 1, postsPageSize: 2, postCooldownSeconds: 0, threadsPerHour: 2,
  reactionsPerMinute: 1, newCharacterHours: 0, searchPageSize: 1, reportsPerHour: 1, karmaMinPostLength: 0, karmaPerAuthorPerDay: 1 });
config.gameplay.forum.boards.find(board => board.id === "off_topic").karma = false;
config.gameplay.forum.boards.find(board => board.id === "general_discussion").name = "Captain's $forum$ Deck";
config.gameplay.forum.boards.find(board => board.id === "fun_games").active = false;
config.gameplay.forum.boards.push({ id: "config_new_board", section: "Game", name: "New board", description: "Added by configuration.", posting: "open", karma: true, active: true });
validateConfig(config);
const removedItem = structuredClone(config), changedKind = structuredClone(config), removedBoard = structuredClone(config);
removedBoard.gameplay.forum.boards = removedBoard.gameplay.forum.boards.filter(board => board.id !== "config_new_board" && board.id !== "off_topic");
removedItem.gameplay.inventory.items.pop();
Object.assign(changedKind.gameplay.inventory.items[0], { kind: "consumable", slot: "none" });
const checks = [
"select is((select public.train_crew('speed','crew_1',request) from old_crew_request),(select value from old_crew_receipt),'Old crew receipt survives changed curve, efficiency, Energy cost and Perfect chance');",
"select is((select crew_speed from public.characters where id=(select captain from old_training_fixture)),10+(select (value->>'stat_gain')::numeric from old_crew_receipt),'Receipt replay does not grant a second scaled reward');",
"select throws_ok($guard$" + inventoryCatalogSql(removedItem) + "$guard$, 'P0001', 'Existing item IDs, kinds and slots must be preserved', 'Catalog sync cannot remove a durable definition');",
"select throws_ok($guard$" + inventoryCatalogSql(changedKind) + "$guard$, 'P0001', 'Existing item IDs, kinds and slots must be preserved', 'Catalog sync cannot change ownership shape');",
"select is(public.list_inventory()->>'total','4','Catalog sync preserves existing inventory');",
"select is(jsonb_array_length(public.list_inventory()->'items'),2,'Inventory page size follows configuration');",
"select is(public.list_inventory('crew_weapons')->>'total','3','Inactive definitions remain visible in owned inventory');",
"select is(public.list_inventory('crew_weapons')#>>'{items,0,name}', $$Captain's $inventory$ Cutlass$$,'Inventory prose escapes quotes and delimiters');",
"select is(public.list_inventory('crew_weapons','',1)->>'page','1','Inventory supports multiple pages');",
"select is(jsonb_array_length(public.list_inventory('crew_weapons','',1)->'items'),1,'Final inventory page is bounded');",
"select is((select sum(quality) from private.item_instances where character_id=(select captain from old_training_fixture)),61.50::numeric,'Catalog changes preserve individual Quality');",
"select is(private.item_stats(d,10.25)->>'damage','21.03','Stat ranges follow the configured definition') from private.item_definitions d where id='cutlass';",
"select is(private.combat_damage(12,12,40,1,0),40,'Weapon scale is configurable');",
"select is((select zone from private.combat_zone('crew',0.4)),'head','Hit zone weights are configurable');",
"select lives_ok($$update public.characters set ship_health=610 where id=(select captain from old_training_fixture)$$,'Ship Health may reach the configured equipment and battling maximum');",
"select throws_ok($$update public.characters set ship_health=611 where id=(select captain from old_training_fixture)$$,'23514',null,'Ship Health cannot exceed the configured equipment and battling maximum');",
"select lives_ok($$update public.characters set crew_health=550 where id=(select captain from old_training_fixture)$$,'Crew Health may reach the configured battling maximum');",
"select throws_ok($$update public.characters set crew_health=551 where id=(select captain from old_training_fixture)$$,'23514',null,'Crew Health cannot exceed the configured battling maximum');",
"select is(public.list_inventory('medical')#>>'{items,0,quantity}','7','Catalog changes preserve stack quantities');",
"create temporary table hospital_config_fixture as select gen_random_uuid() id;",
"insert into auth.users(id,email,is_anonymous,raw_user_meta_data) select id,id::text||'@example.test',false,jsonb_build_object('character_name','HospitalConfig'||translate(id::text,'0123456789','ghijklmnop')) from hospital_config_fixture;",
"update public.characters set crew_health=0 where user_id=(select id from hospital_config_fixture);",
"select is((select extract(epoch from(hospital_until-hospital_started_at))::int from public.characters where user_id=(select id from hospital_config_fixture)),19,'Hospital duration is configurable');",

"select is((select energy from private.energy_snapshot(50,\'2026-01-01Z\',\'2026-01-01 00:02Z\')),56,\'Alternative recovery amount applies to every interval\');",
"select is((select stat_gain from private.ship_upgrade_jobs where character_id=(select captain from old_training_fixture) and applied_at is null),20.237736::numeric,'Old job keeps its original gain after config change');",
"select is((select xp_gain from private.ship_upgrade_jobs where character_id=(select captain from old_training_fixture) and applied_at is null),50::bigint,'Old job keeps its original XP');",
"select is((select energy_cost from private.ship_upgrade_jobs where character_id=(select captain from old_training_fixture) and applied_at is null),50,'Old job keeps its original Energy cost');",
"select is((select extract(epoch from(finishes_at-started_at))::int from private.ship_upgrade_jobs where character_id=(select captain from old_training_fixture) and applied_at is null)," + (50 * originalShipSecondsPerEnergy) + ",'Old job keeps its original duration');",
"select is((select bank_gold_coins from public.characters where id=(select captain from old_training_fixture)),123::bigint,'Config migration preserves existing bank coins');",
"select is((select ship_attack from public.characters where id=(select captain from old_training_fixture)),10::numeric,'Config migration preserves existing stats');",
"select is(public.get_gameplay_revision(),'" + revision(config) + "','Alternative revision is installed within transaction');",
"select is((select energy from private.energy_snapshot(118,'2026-01-01Z','2026-01-01 00:02Z')),120,'Energy interval and cap are configurable');",
"select is(private.battling_health_bonus(3),6,'Battling health per level is configurable');",
"select is(private.health_snapshot(0,'2026-01-01Z','2026-01-01 00:00:07Z',7,150),15,'The recovered share of maximum health is configurable');",
"select is(private.battling_health_bonus(100),400,'The level 100 battling bonus is configurable');",
"select is(private.combat_hit_chance(1,100),0.0::double precision,'Alternative evasion threshold applies');",
"select ok(private.combat_hit_chance(1,64)>0,'Old evasion threshold no longer guarantees misses');",
"select is(private.combat_damage(12,12),20,'Damage coefficients are configurable');",
"select is(private.combat_damage(1,50),0,'Alternative full mitigation threshold applies');",
"select ok(private.combat_damage(1,25)>0,'Old mitigation threshold no longer blocks everything');",
"create temporary table config_users as select gen_random_uuid() a,gen_random_uuid() d;",
"insert into auth.users(id,email,is_anonymous,raw_user_meta_data) select id,id::text||'@example.test',false,jsonb_build_object('character_name','Config'||translate(id::text,'0123456789','ghijklmnop')) from config_users cross join lateral(values(a),(d)) u(id);",
"create temporary table config_captains as select (select id from public.characters where user_id=u.a) a,(select id from public.characters where user_id=u.d) d from config_users u;",
// A fixed one-minute recovery tick between a cost and its check would otherwise add Energy.
"update public.characters set energy_updated_at=clock_timestamp()+interval '1 day' where id in(select a from config_captains union all select d from config_captains);",
"select is((select ship_attack from public.characters where id=(select a from config_captains)),12::numeric,'Creation uses changed starting stats');",
"select is((select ship_health from public.characters where id=(select a from config_captains)),120,'Creation uses changed ship health');",
"select is((select crew_health from public.characters where id=(select a from config_captains)),110,'Creation uses changed crew health');",
"select is((select private.crew_health_max(a) from config_captains),150,'Health cap is configurable');",
"select private.award_skill_xp(a,'crew_battling',400) from config_captains;",
"select is((select private.crew_health_max(a) from config_captains),153,'Configured thresholds and health per level set the Crew Health maximum');",
"select set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true) from config_users;",
"select is((public.get_game_state()->>\'gold_coins\')::bigint,77::bigint,\'Configured starting Gold Coins are used\');",
"select is((public.get_game_state()->>\'bank_gold_coins\')::bigint,0::bigint,\'Bank still starts empty\');",
"select public.transfer_gold(\'deposit\',17,gen_random_uuid());",
"select is((public.get_game_state()->>\'gold_coins\')::bigint,60::bigint,\'Bank uses carried coins with alternative config\');",
"select public.train_crew('attack','crew_1',gen_random_uuid());",
"select is((select crew_attack from public.characters where id=(select a from config_captains)),15.009951::numeric,'Training applies configured gain');",
"select is(public.get_game_state()#>>'{training,progress,crew,xp}','14','Crew XP uses the configured rate');",
"insert into private.item_stacks(character_id,item_id,quantity) select a,item_id,10 from config_captains cross join (values('oak_planks'),('iron_nails')) m(item_id);",
"select public.start_ship_upgrade('speed',7,'ship_1',gen_random_uuid());",
"select is((public.get_game_state()#>>'{training,ship_job,stat_gain}')::numeric,private.training_gain(12,12,7),'New ship gain uses configured multiplier');",
"select is(public.get_game_state()#>>'{training,ship_job,materials,0,quantity}','6','New job uses configured material rate and batch size');",
"select is((select materials#>>'{0,quantity}' from private.ship_upgrade_jobs where character_id=(select captain from old_training_fixture) and applied_at is null),'10','Old job keeps original materials after config change');",
"select is(public.get_game_state()#>>'{training,ship_job,xp_gain}','14','New ship XP uses changed rate');",
"select is(public.get_game_state()#>>'{training,ship_job,workshop_name}','Captain''s $catalog$ Workshop','Catalog strings safely escape quotes and dollar delimiters');",
"select is((select extract(epoch from(finishes_at-started_at))::int from private.ship_upgrade_jobs where character_id=(select a from config_captains) and applied_at is null)," + (7 * config.gameplay.training.shipSecondsPerEnergy) + ",'New ship duration uses changed config');",
"select is((select energy from public.characters where id=(select a from config_captains)),86,'Training applies configured cost');",
"update public.characters set ship_health=1,ship_recovery_at=clock_timestamp()+interval '1 hour' where id=(select a from config_captains);",
"select is((select public.get_combat_preview(d)->>'reason' from config_captains),'NO_HEALTH','Minimum attack health is configurable');",
"update public.characters set ship_health=120,ship_recovery_at=clock_timestamp() where id=(select a from config_captains);",
"create temporary table config_battle as select public.start_combat(d,gen_random_uuid()) value from config_captains;",
"select is((select value#>>'{battle,attacker,ammo}' from config_battle),'6','Attack starts with configured ammunition');",
"select is((select energy from public.characters where id=(select a from config_captains)),73,'Combat applies configured energy cost');",
"select is((select extract(epoch from (deadline-started_at))::int from private.combats where id=(select (value#>>'{battle,id}')::uuid from config_battle)),90,'Idle deadline is configurable');",
"select is((select extract(epoch from (hard_deadline-started_at))::int from private.combats where id=(select (value#>>'{battle,id}')::uuid from config_battle)),360,'Encounter deadline is configurable');",
"create temporary table config_round as select private.resolve_combat_round(state||jsonb_build_object('phase','sea','round',0),'fire',array[0.99,0.99,0.0,0.3,0.3]) value from private.combats where id=(select (value#>>'{battle,id}')::uuid from config_battle);",
"select is((select value#>>'{event,attacker_weapon}' from config_round),$$Captain's test cannons$$,'Fallback weapon names are safely escaped');",
"select is((select value#>>'{state,attacker,ammo}' from config_round),'4','A shot consumes configured ammunition');",
"select is((select private.resolve_combat_round(state||jsonb_build_object('phase','sea','round',6),'fire',array[0.99,0.99,0.0,0.3,0.3])#>>'{state,outcome}' from private.combats where id=(select (value#>>'{battle,id}')::uuid from config_battle)),'draw','Alternative round limit is enforced');",
"select public.submit_combat_order((value#>>'{battle,id}')::uuid,0,'retreat',gen_random_uuid()) from config_battle;",
"select is((select xp from private.character_skills where character_id=(select d from config_captains) and skill_id='ship_battling'),7::bigint,'Combat XP per attack follows configuration');",
"select is((select extract(epoch from(protected_until-ship_recovery_at))::int from public.characters where id=(select a from config_captains)),45,'Protection duration is configurable');",
"select ok(jsonb_array_length(public.list_harbor_players()->'players')<=3,'Harbor page size is configurable');",
"select is((select travel_arrives_at from public.characters where id=(select id from old_sea_fixture)),(select travel_arrives_at from old_sea_fixture),'Config changes preserve saved arrival time');",
"select is((select jsonb_agg(to_jsonb(o) order by o.position) from private.sea_route_options o where character_id=(select id from old_sea_fixture)),(select options from old_sea_fixture),'Config changes preserve offered routes even if types are removed');",
"select set_config('request.jwt.claims',jsonb_build_object('sub',id,'role','authenticated')::text,true) from old_sea_user;",
"select private.settle_sea_travel(id,travel_arrives_at) from public.characters where id=(select id from old_sea_fixture);",
"select public.choose_sea_route((public.get_game_state()#>>'{sea,version}')::uuid,(public.get_game_state()#>>'{sea,options,0,id}')::uuid,gen_random_uuid());",
"select is(public.get_game_state()#>>'{sea,journey,destination,name}',(select options#>>'{0,place_name}' from old_sea_fixture),'Stored choice name survives catalog removal');",
"select is((select extract(epoch from(travel_arrives_at-travel_started_at))::int from public.characters where id=(select id from old_sea_fixture)),7,'New onward duration follows updated configuration');",
"select private.settle_sea_travel(id,travel_arrives_at) from public.characters where id=(select id from old_sea_fixture);",
"select ok(exists(select 1 from jsonb_array_elements(public.get_game_state()#>'{sea,options}') p where p->>'name'=$quote$Captain's $sea$ Cove$quote$),'Sea names safely escape quotes and dollar delimiters');",
"select public.return_to_harbor((public.get_game_state()#>>'{sea,version}')::uuid,gen_random_uuid());",
"select is((select extract(epoch from(travel_arrives_at-travel_started_at))::int from public.characters where id=(select id from old_sea_fixture)),22,'New return duration is depth times configured seconds');",
"select private.settle_sea_travel(id,travel_arrives_at) from public.characters where id=(select id from old_sea_fixture);",
"update public.characters set energy=100,energy_updated_at=clock_timestamp() where id=(select id from old_sea_fixture);",
"select public.depart_harbor((public.get_game_state()#>>'{sea,version}')::uuid,gen_random_uuid());",
"select is(public.get_game_state()->>'energy','92','New departure charges updated configured cost');",
"select is((select extract(epoch from(travel_arrives_at-travel_started_at))::int from public.characters where id=(select id from old_sea_fixture)),7,'New departure duration follows configuration');",
"select private.settle_sea_travel(id,travel_arrives_at) from public.characters where id=(select id from old_sea_fixture);",
"select is(public.scout_nearby_ships((public.get_game_state()#>>'{sea,version}')::uuid,gen_random_uuid())->>'energy_cost','9','Scouting price follows configuration');",
"select is(public.get_game_state()->>'energy','83','Configured scouting price is deducted from recovered Energy');",
"select ok(jsonb_array_length(public.get_sea_scout()->'players')<=2,'Scouting result page size follows configuration');",
];
checks.push(
"select is((select fee_bps from private.market_listings where id=(select (value#>>'{listings,0,id}')::uuid from old_market_fixture)),500,'Existing listing keeps its captured fee after config change');",
"create temporary table market_config_users as select gen_random_uuid() seller,gen_random_uuid() buyer;",
"insert into auth.users(id,email,is_anonymous,raw_user_meta_data) select id,id::text||'@example.test',false,jsonb_build_object('character_name','MarketConfig'||translate(id::text,'0123456789','ghijklmnop')) from market_config_users cross join lateral(values(seller),(buyer)) u(id);",
"create temporary table market_config_captains as select (select id from public.characters where user_id=seller) seller,(select id from public.characters where user_id=buyer) buyer from market_config_users;",
"update public.characters set gold_coins=1000 where id=(select buyer from market_config_captains);",
"insert into private.item_stacks(character_id,item_id,quantity) select seller,i,10 from market_config_captains cross join(values('linen_bandages'),('oak_planks'),('brass_compass')) v(i);",
"insert into private.item_instances(character_id,item_id,quality) select seller,'cutlass',50 from market_config_captains;",
"select set_config('request.jwt.claims',jsonb_build_object('sub',seller,'role','authenticated')::text,true) from market_config_users;",
"select is(public.list_market_inventory()->>'total','2','Sale inventory excludes inactive and nontradable items before pagination');",
"select is(jsonb_array_length(public.list_market_items()->'items'),2,'Market catalog page size follows configuration');",
"select is(public.list_market_items(null,'Brass Compass')->>'total','0','Nontradable definitions are excluded from the market catalog');",
"create temporary table market_config_entries as select jsonb_agg(jsonb_build_object('entry_id',id,'entry_type','stack','quantity',1,'unit_price',100) order by item_id) value from private.item_stacks where character_id=(select seller from market_config_captains) and item_id<>'brass_compass';",
"select throws_ok($batch$select public.create_market_listings(value||jsonb_build_array(value->0),gen_random_uuid()) from market_config_entries$batch$,'22023','INVALID_BATCH','Configured listing batch limit is enforced');",
"create temporary table market_config_listings as select public.create_market_listings(value,gen_random_uuid()) value from market_config_entries;",
"select is((select fee_bps from private.market_listings where id=(select (value#>>'{listings,0,id}')::uuid from market_config_listings)),1000,'New listing captures updated fee');",
"select is(jsonb_array_length(public.list_market_listings(null,true)->'items'),1,'Own listing page size follows configuration');",
"select is(public.list_market_listings(null,true)->>'total','2','Listing pagination retains the full own count');",
"select is(jsonb_array_length(public.list_market_listings(\'linen_bandages\',false,1)->\'items\'),2,\'Expanded offers use the configured batch size\');",
"create temporary table market_config_baseline as select (public.list_market_items('medical')#>>'{items,0,sold}')::bigint sold;",
"select set_config('request.jwt.claims',jsonb_build_object('sub',buyer,'role','authenticated')::text,true) from market_config_users;",
"select is((select public.buy_market_listing((value#>>'{listings,0,id}')::uuid,1,100,gen_random_uuid())->>'fee' from market_config_listings),'10','New sale deducts the configured 10 percent fee');",
"select is((select public.buy_market_listing((value#>>'{listings,0,id}')::uuid,1,100,gen_random_uuid())->>'fee' from old_market_fixture),'5','Existing sale still deducts its original 5 percent fee');",
"update private.market_sales set sold_at=statement_timestamp()-interval '7 hours' where listing_id=(select (value#>>'{listings,0,id}')::uuid from market_config_listings);",
"select is((public.list_market_items('medical')#>>'{items,0,sold}')::bigint,(select sold+1 from market_config_baseline),'Popularity uses the configured 6 hour window instead of 12 hours');",
"select is(private.item_market_value_at('linen_bandages',statement_timestamp()),(select floor(sum(gross)::numeric/nullif(sum(quantity),0)) from private.market_sales where item_id='linen_bandages' and sold_at>statement_timestamp()-interval '2 hours' and sold_at<=statement_timestamp()),'Market value uses the configured two-hour window');",
"select is((select gold_coins from public.characters where id=(select seller from market_config_captains)),167::bigint,'Configured fee is withheld from actual carried proceeds');"
);
checks.push(
"select is((select morale from private.morale_snapshot(10,'2026-01-01Z','2026-01-01 00:02Z')),6::numeric,'Morale recovery amount and interval follow config');",
"select is(private.morale_multiplier(100,250),1.025::numeric,'Morale stat effect follows its basis points');",
"create temporary table morale_config_user as select gen_random_uuid() id;",
"insert into auth.users(id,email,is_anonymous,raw_user_meta_data) select id,id::text||'@example.test',false,jsonb_build_object('character_name','MoraleConfig'||translate(id::text,'0123456789','ghijklmnop')) from morale_config_user;",
"update public.characters set morale_updated_at=clock_timestamp()+interval '1 day',stamina_updated_at=clock_timestamp()+interval '1 day' where user_id=(select id from morale_config_user);",
"select set_config('request.jwt.claims',jsonb_build_object('sub',id,'role','authenticated')::text,true) from morale_config_user;",
"select public.buy_tavern_meal(17,10,gen_random_uuid());",
"select is((public.get_game_state()->>'crew_morale')::numeric,10::numeric,'Tavern gain follows config');",
"select is((public.get_game_state()->>'gold_coins')::numeric,60::numeric,'Tavern price follows config');",
"select is((select (private.combat_snapshot(c,clock_timestamp())#>>'{crew,attack}')::numeric from public.characters c where user_id=(select id from morale_config_user)),12.03::numeric,'Combat snapshot uses configured morale stat bonus');",
"create temporary table morale_config_drill as select public.train_crew('attack','crew_1',gen_random_uuid()) value;",
"select is((select (value->>'normal_gain')::numeric from morale_config_drill),round(private.training_gain(12,3,7)*1.003,6),'Crew gain uses configured morale training bonus');",
"select is((public.get_game_state()->>'crew_morale')::numeric,8.6::numeric,'Morale cost uses configured cost per Energy');",
"select is((public.get_game_state()->>'stamina')::integer,80,'New Stamina capacity follows config');",
"select is((select stamina from private.stamina_snapshot(0,'2026-01-01Z','2026-01-01 00:02Z')),4,'Stamina recovery follows configured amount and interval');",
"select is((select private.spend_activity_stamina(id) from public.characters where user_id=(select id from morale_config_user)),77,'Stamina spending follows configured activity cost');",
"select is((public.get_own_skills()->>'character_level')::integer,8,'Adding a skill changes the starting total');",
"select is(private.skill_level(200),1,'Skill levels use the configured threshold table');",
"select is((select (private.award_skill_xp(id,'fishing',400)->>'character_level')::integer from public.characters where user_id=(select id from morale_config_user)),9,'Configured thresholds drive XP awards and the public total');",
// Keep cost/XP checks independent of randomized inventory rewards.
"update private.activity_loot set loot_table_id=null where activity_id='shore_fishing';",
"select is((public.perform_activity('shore_fishing',3,17,gen_random_uuid())->>'xp_awarded')::integer,17,'Activity reward follows configuration');",
"select is((public.get_game_state()->>'stamina')::integer,74,'Activity uses the configured Stamina cost');"
);
checks.push(
"select set_config('request.jwt.claims',jsonb_build_object('sub',id,'role','authenticated')::text,true) from old_craft_user;",
"select is((select public.craft_item('oak_plank',version,request) from old_craft_fixture),(select value from old_craft_receipt),'Old crafting receipt survives changed ingredients and output');",
"select is(public.list_crafting_recipes()#>>'{0,output,owned}','1','Recipe sync and receipt replay preserve previous output');",
"select is((select xp from private.character_skills where character_id=(select captain from old_craft_fixture) and skill_id='crafting'),10::bigint,'Config and receipt replay preserve existing Crafting XP');",
"select is(public.list_crafting_recipes()#>>'{0,xp_gain}','17','Crafting XP offer follows configuration');",
"select is((select character_level from public.character_profiles where character_id=(select captain from old_craft_fixture)),8,'Rebalanced public levels match preserved XP and the added skill');",
"select throws_ok($craft$select public.craft_item('oak_plank',version,gen_random_uuid()) from old_craft_fixture$craft$,'P0001','STALE_OFFER','Changed recipe rejects the old offer');",
"select is(public.list_crafting_recipes()#>>'{0,output,quantity}','2','Recipe output follows configuration');",
"select throws_ok($craft$select public.craft_item('oak_plank',public.list_crafting_recipes()#>>'{0,version}',gen_random_uuid())$craft$,'P0001','INSUFFICIENT_MATERIALS','All configured ingredients are required');",
"select is((select quantity from private.item_stacks where character_id=(select captain from old_craft_fixture) and item_id='oak_logs'),5::bigint,'Missing second ingredient leaves logs untouched');",
"insert into private.item_stacks(character_id,item_id,quantity) select captain,'brass_compass',2 from old_craft_fixture;",
"select public.craft_item('oak_plank',public.list_crafting_recipes()#>>'{0,version}',gen_random_uuid());",
"select is((select quantity from private.item_stacks where character_id=(select captain from old_craft_fixture) and item_id='oak_logs'),2::bigint,'Crafting uses configured ingredient cost');",
"select is((select count(*) from private.item_stacks where character_id=(select captain from old_craft_fixture) and item_id='brass_compass'),0::bigint,'Crafting consumes the entire second ingredient');",
"select is(public.list_crafting_recipes()#>>'{0,output,owned}','3','Crafting creates the configured output quantity');",
"select is((select xp from private.character_skills where character_id=(select captain from old_craft_fixture) and skill_id='crafting'),27::bigint,'Changed Crafting XP applies only to a new craft');"
);
checks.push(
"select private.emit_notification(captain,'test.config','config-'||n,jsonb_build_object('value',n)) from old_craft_fixture cross join generate_series(1,3) n;",
"select is(jsonb_array_length(public.get_notifications()->'items'),2,'Notification page size follows configuration');",
"select is(public.get_notification_summary()->>'unread_count','3','Summary counts unread notifications beyond the configured page');"
);
checks.push(
"create temporary table forum_config_user as select gen_random_uuid() id;",
"insert into auth.users(id,email,is_anonymous,raw_user_meta_data) select id,id::text||'@example.test',false,jsonb_build_object('character_name','ForumConfig'||translate(id::text,'0123456789','ghijklmnop')) from forum_config_user;",
"select set_config('request.jwt.claims',jsonb_build_object('sub',id,'role','authenticated')::text,true) from forum_config_user;",
"select is((select name from private.forum_boards where id='general_discussion'),$$Captain's $forum$ Deck$$,'Board names follow configuration and escape delimiters');",
"select is((select active from private.forum_boards where id='fun_games'),false,'Configuration deactivates boards');",
"select is((select position from private.forum_boards where id='config_new_board'),10,'Configuration adds boards');",
"select throws_ok($guard$" + forumCatalogSql(removedBoard) + "$guard$,'P0001','Existing forum board IDs must be preserved','Config sync cannot remove a board');",
"create temporary table forum_config_thread as select public.create_forum_thread('general_discussion','Short','Opening post',gen_random_uuid()) value;",
"select public.create_forum_post((select (value->>'thread_id')::bigint from forum_config_thread),'Second',null,gen_random_uuid());",
"select public.create_forum_post((select (value->>'thread_id')::bigint from forum_config_thread),'Third',null,gen_random_uuid());",
"select is((public.get_forum_thread((select (value->>'thread_id')::bigint from forum_config_thread))->>'page_count')::integer,2,'Thread page size and cooldown follow configuration');",
"select throws_ok($forum_test$select public.create_forum_post((select (value->>'thread_id')::bigint from forum_config_thread),repeat('x',51),null,gen_random_uuid())$forum_test$,'22023','INVALID_POST','Post length follows configuration');",
"select throws_ok($forum_test$select public.create_forum_thread('general_discussion','Elevenchars','Body',gen_random_uuid())$forum_test$,'22023','INVALID_POST','Title length follows configuration');",
"select public.create_forum_thread('general_discussion','Second','Body',gen_random_uuid());",
"select throws_ok($forum_test$select public.create_forum_thread('general_discussion','Third','Body',gen_random_uuid())$forum_test$,'P0001','FORUM_THREAD_LIMIT','Thread limit follows configuration');",
"select is(jsonb_array_length(public.get_forum_board('general_discussion')->'items'),1,'Board page size follows configuration');",
"select throws_ok($forum_test$select public.get_forum_board('fun_games')$forum_test$,'P0002','FORUM_NOT_FOUND','Deactivated boards are hidden');",
"select is(public.search_forums('second')->>'total','2','Search finds the reply and the thread title');",
"select is(jsonb_array_length(public.search_forums('second')->'items'),1,'Search page size follows configuration');",
"create temporary table forum_reactor_user as select gen_random_uuid() id;",
"insert into auth.users(id,email,is_anonymous,raw_user_meta_data) select id,id::text||'@example.test',false,jsonb_build_object('character_name','ForumReactor'||translate(id::text,'0123456789','ghijklmnop')) from forum_reactor_user;",
"select set_config('request.jwt.claims',jsonb_build_object('sub',id,'role','authenticated')::text,true) from forum_reactor_user;",
"select is(public.set_forum_reaction((select (value->>'post_id')::bigint from forum_config_thread),-1)->>'dislikes','1','New-captain dislike limit follows configuration');",
"select throws_ok($forum_test$select public.set_forum_reaction((select (value->>'post_id')::bigint from forum_config_thread),1)$forum_test$,'P0001','FORUM_RATE_LIMIT','Reaction rate follows configuration');",
"select is((select karma from private.forum_posts where id=(select (value->>'post_id')::bigint from forum_config_thread)),-1,'Karma minimum length follows configuration');",
"select is((select karma from private.forum_boards where id='off_topic'),false,'Board karma follows configuration');",
"select is(public.report_forum_post((select (value->>'post_id')::bigint from forum_config_thread),'spam','')->>'already','false','Captains report with the configured age limit');",
"select throws_ok($forum_test$select public.report_forum_post((select id from private.forum_posts where thread_id=(select (value->>'thread_id')::bigint from forum_config_thread) and post_number=2),'spam','')$forum_test$,'P0001','FORUM_RATE_LIMIT','Report rate follows configuration');"
);
const sql = "begin;\ncreate extension if not exists pgtap with schema extensions;\nset local search_path=public,extensions;\n" +
  "create temporary table old_training_user as select gen_random_uuid() id;\n" +
  "insert into auth.users(id,email,is_anonymous,raw_user_meta_data) select id,id::text||\'@example.test\',false,jsonb_build_object(\'character_name\','OldConfig'||translate(id::text,'0123456789','ghijklmnop')) from old_training_user;\n" +
  "create temporary table old_training_fixture as select c.id captain from public.characters c join old_training_user u on c.user_id=u.id;\n" +
  "update public.characters set bank_gold_coins=123 where id=(select captain from old_training_fixture);\n" +
  "insert into private.item_stacks(character_id,item_id,quantity) select captain,item_id,10 from old_training_fixture cross join (values('oak_planks'),('iron_nails')) m(item_id);\n" +
  "select set_config(\'request.jwt.claims\',jsonb_build_object(\'sub\',id,\'role\',\'authenticated\')::text,true) from old_training_user;\n" +
  "select public.start_ship_upgrade(\'attack\',50,\'ship_1\',gen_random_uuid());\n" +
  "create temporary table old_crew_request as select gen_random_uuid() request;\ncreate temporary table old_crew_receipt as select public.train_crew('speed','crew_1',request) value from old_crew_request;\n" +
  "insert into private.item_stacks(character_id,item_id,quantity) select captain,'linen_bandages',7 from old_training_fixture;\n" +
  "insert into private.item_instances(character_id,item_id,quality) select captain,'cutlass',q from old_training_fixture cross join(values(10.25),(20.50),(30.75)) v(q);\n" +
  "create temp table old_sea_user as select gen_random_uuid() id;\ninsert into auth.users(id,email,is_anonymous,raw_user_meta_data) select id,id::text||'@example.test',false,jsonb_build_object('character_name','SeaConfig'||translate(id::text,'0123456789','ghijklmnop')) from old_sea_user;\nselect set_config('request.jwt.claims',jsonb_build_object('sub',id,'role','authenticated')::text,true) from old_sea_user;\nselect public.depart_harbor((public.get_game_state()#>>'{sea,version}')::uuid,gen_random_uuid());\ncreate temp table old_sea_fixture as select c.id,c.travel_arrives_at,(select jsonb_agg(to_jsonb(o) order by o.position) from private.sea_route_options o where o.character_id=c.id) options from public.characters c where user_id=(select id from old_sea_user);\nselect set_config('request.jwt.claims',jsonb_build_object('sub',id,'role','authenticated')::text,true) from old_training_user;\n" +
  "create temporary table old_market_user as select gen_random_uuid() id;\ninsert into auth.users(id,email,is_anonymous,raw_user_meta_data) select id,id::text||'@example.test',false,jsonb_build_object('character_name','OldMarket'||translate(id::text,'0123456789','ghijklmnop')) from old_market_user;\nselect set_config('request.jwt.claims',jsonb_build_object('sub',id,'role','authenticated')::text,true) from old_market_user;\ninsert into private.item_stacks(character_id,item_id,quantity) select id,'linen_bandages',1 from public.characters where user_id=(select id from old_market_user);\ncreate temporary table old_market_fixture as select public.create_market_listings(jsonb_build_array(jsonb_build_object('entry_id',s.id,'entry_type','stack','quantity',1,'unit_price',100)),gen_random_uuid()) value from private.item_stacks s join public.characters c on c.id=s.character_id where c.user_id=(select id from old_market_user);\nselect set_config('request.jwt.claims',jsonb_build_object('sub',id,'role','authenticated')::text,true) from old_training_user;\n" +
  "insert into private.item_definitions(id,category_id,name,description,effect_description,image_path,kind,stackable,active,tradable,managed_by_admin) values('config_admin_item','materials','Admin item','Admin-owned item','No effect','/images/items/placeholder.svg','passive',true,true,true,true);\n" +
  "update private.item_definitions set name='Owner Sprat',managed_by_admin=true where id='sprat'; update private.loot_tables set name='Owner Shore' where id='harbor_shore'; update private.activity_loot set success_start=42 where activity_id='shore_fishing';\n" +
  "create temporary table old_craft_user as select gen_random_uuid() id;\n" +
  "insert into auth.users(id,email,is_anonymous,raw_user_meta_data) select id,id::text||'@example.test',false,jsonb_build_object('character_name','CraftConfig'||translate(id::text,'0123456789','ghijklmnop')) from old_craft_user;\n" +
  "select set_config('request.jwt.claims',jsonb_build_object('sub',id,'role','authenticated')::text,true) from old_craft_user;\n" +
  "create temporary table old_craft_fixture as select c.id captain,gen_random_uuid() request,(select version from private.crafting_recipes where id='oak_plank') version from public.characters c where user_id=(select id from old_craft_user);\n" +
  "insert into private.item_stacks(character_id,item_id,quantity) select captain,'oak_logs',10 from old_craft_fixture;\n" +
  "create temporary table old_craft_receipt as select public.craft_item('oak_plank',version,request) value from old_craft_fixture;\n" +
  "select set_config('request.jwt.claims',jsonb_build_object('sub',id,'role','authenticated')::text,true) from old_training_user;\n" +
  "update private.loot_tables set name='Owner Woodland' where id='woodland_logging'; update private.loot_entries set quantity=3 where loot_table_id='woodland_logging'; update private.activity_loot set loot_table_id=null,mastery_level=99 where activity_id='woodland_logging';\n" +
  migrationSql(config) + "\nselect no_plan();\n" +
  "select is((select name from private.item_definitions where id='config_admin_item'),'Admin item','Config preserves newly created admin items');\n" +
  "select is((select name from private.item_definitions where id='sprat'),'Owner Sprat','Config preserves admin edits to seeded items');\n" +
  "select is((select name from private.loot_tables where id='woodland_logging'),'Owner Woodland','Config preserves edited Logging loot table');\n" +
  "select is((select quantity from private.loot_entries where loot_table_id='woodland_logging'),3,'Config preserves edited Logging quantity');\n" +
  "select is((select loot_table_id from private.activity_loot where activity_id='woodland_logging'),null::text,'Config preserves deliberate Logging unlink');\n" +
  "select is((select mastery_level from private.activity_loot where activity_id='woodland_logging'),99,'Later config sync preserves an admin-selected mastery level below the new cap');\n" +
  "select is((select name from private.loot_tables where id='harbor_shore'),'Owner Shore','Config preserves edited loot tables');\n" +
  "select is((select success_start from private.activity_loot where activity_id='shore_fishing'),42::numeric,'Config preserves activity loot settings');\n" + checks.join("\n") + "\nselect * from finish();\nrollback;\n" +
  "select case when public.get_gameplay_revision()='" + originalRevision + "' then 'CONFIG_RESTORED' else 'CONFIG_NOT_RESTORED' end;\n";
const output = execFileSync("docker", ["exec", "-i", "supabase_db_" + config.server.local.supabaseProjectId,
  "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-q", "-t"], { input: sql, encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
const failures = output.split("\n").filter(line => /^\s*(not ok|#)/.test(line));
if (/\bnot ok\b/.test(output) || !output.includes("CONFIG_RESTORED")) throw new Error("Alternative configuration failed:\n" + failures.join("\n"));
console.log("Alternative configuration: " + (output.match(/^\s*ok \d+/gm) ?? []).length + " assertions passed; transaction rolled back and original configuration restored.");
