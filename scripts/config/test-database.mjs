import { execFileSync } from "node:child_process";
import { loadConfig, migrationSql, revision, validateConfig } from "./core.mjs";

const config = loadConfig();
const originalRevision = revision(config);
Object.assign(config.gameplay.resources, { energyMax: 120, energyRecoverySeconds: 60, healthMax: 150,
  shipHealthInitial: 120, crewHealthInitial: 110, shipRecoverySeconds: 7, crewRecoverySeconds: 4 });
Object.assign(config.gameplay.training, { energyCost: 7, statGain: 3 });
for (const group of Object.values(config.gameplay.startingStats)) for (const stat of Object.keys(group)) group[stat] = 12;
Object.assign(config.gameplay.combat, { energyCost: 13, maxRounds: 7, startingAmmo: 6, ammoPerShot: 2,
  minimumHealth: 2, idleSeconds: 90, maxDurationSeconds: 360, protectionSeconds: 45 });
config.gameplay.combat.hitChance.extremeRatio = 100;
config.gameplay.combat.mitigation.fullReductionDefenseRatio = 50;
Object.assign(config.gameplay.combat.damage, { quadratic: 0, linear: 0, constant: 40 });
config.gameplay.combat.equipment.cannons = "Captain's test cannons";
config.gameplay.harbor.pageSize = 3;
validateConfig(config);
const checks = [
"select is(public.get_gameplay_revision(),'" + revision(config) + "','Alternative revision is installed within transaction');",
"select is((select energy from private.energy_snapshot(118,'2026-01-01Z','2026-01-01 00:02Z')),120,'Energy interval and cap are configurable');",
"select is(private.health_snapshot(149,'2026-01-01Z','2026-01-02Z',7),150,'Health cap is configurable');",
"select is(private.combat_hit_chance(1,100),0.0::double precision,'Alternative evasion threshold applies');",
"select ok(private.combat_hit_chance(1,64)>0,'Old evasion threshold no longer guarantees misses');",
"select is(private.combat_damage(12,12),20,'Damage coefficients are configurable');",
"select is(private.combat_damage(1,50),0,'Alternative full mitigation threshold applies');",
"select ok(private.combat_damage(1,25)>0,'Old mitigation threshold no longer blocks everything');",
"create temporary table config_users as select gen_random_uuid() a,gen_random_uuid() d;",
"insert into auth.users(id,email,is_anonymous,raw_user_meta_data) select id,id::text||'@example.test',false,jsonb_build_object('character_name','Config '||id::text) from config_users cross join lateral(values(a),(d)) u(id);",
"create temporary table config_captains as select (select id from public.characters where user_id=u.a) a,(select id from public.characters where user_id=u.d) d from config_users u;",
"select is((select ship_attack from public.characters where id=(select a from config_captains)),12,'Creation uses changed starting stats');",
"select is((select ship_health from public.characters where id=(select a from config_captains)),120,'Creation uses changed ship health');",
"select is((select crew_health from public.characters where id=(select a from config_captains)),110,'Creation uses changed crew health');",
"select set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true) from config_users;",
"select public.train_stat('crew','attack');",
"select is((select crew_attack from public.characters where id=(select a from config_captains)),15,'Training applies configured gain');",
"select is((select energy from public.characters where id=(select a from config_captains)),93,'Training applies configured cost');",
"update public.characters set ship_health=1,ship_recovery_at=clock_timestamp()+interval '1 hour' where id=(select a from config_captains);",
"select is((select public.get_combat_preview(d)->>'reason' from config_captains),'NO_HEALTH','Minimum attack health is configurable');",
"update public.characters set ship_health=120,ship_recovery_at=clock_timestamp() where id=(select a from config_captains);",
"create temporary table config_battle as select public.start_combat(d,gen_random_uuid()) value from config_captains;",
"select is((select value#>>'{battle,attacker,ammo}' from config_battle),'6','Attack starts with configured ammunition');",
"select is((select value#>>'{battle,attacker,cannons}' from config_battle),$$Captain's test cannons$$,'Equipment text is safely escaped');",
"select is((select energy from public.characters where id=(select a from config_captains)),80,'Combat applies configured energy cost');",
"select is((select extract(epoch from (deadline-started_at))::int from private.combats where id=(select (value#>>'{battle,id}')::uuid from config_battle)),90,'Idle deadline is configurable');",
"select is((select extract(epoch from (hard_deadline-started_at))::int from private.combats where id=(select (value#>>'{battle,id}')::uuid from config_battle)),360,'Encounter deadline is configurable');",
"create temporary table config_round as select private.resolve_combat_round(state||jsonb_build_object('phase','sea','round',0),'fire',array[0.99,0.99,0.0]) value from private.combats where id=(select (value#>>'{battle,id}')::uuid from config_battle);",
"select is((select value#>>'{state,attacker,ammo}' from config_round),'4','A shot consumes configured ammunition');",
"select is((select private.resolve_combat_round(state||jsonb_build_object('phase','sea','round',6),'fire',array[0.99,0.99,0.0])#>>'{state,outcome}' from private.combats where id=(select (value#>>'{battle,id}')::uuid from config_battle)),'draw','Alternative round limit is enforced');",
"select public.submit_combat_order((value#>>'{battle,id}')::uuid,0,'retreat',gen_random_uuid()) from config_battle;",
"select is((select extract(epoch from(protected_until-ship_recovery_at))::int from public.characters where id=(select a from config_captains)),45,'Protection duration is configurable');",
"select ok(jsonb_array_length(public.list_harbor_players()->'players')<=3,'Harbor page size is configurable');",
];
const sql = "begin;\ncreate extension if not exists pgtap with schema extensions;\nset local search_path=public,extensions;\n" +
  migrationSql(config) + "\nselect no_plan();\n" + checks.join("\n") + "\nselect * from finish();\nrollback;\n" +
  "select case when public.get_gameplay_revision()='" + originalRevision + "' then 'CONFIG_RESTORED' else 'CONFIG_NOT_RESTORED' end;\n";
const output = execFileSync("docker", ["exec", "-i", "supabase_db_" + config.server.local.supabaseProjectId,
  "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-q", "-t"], { input: sql, encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
const failures = output.split("\n").filter(line => /^\s*(not ok|#)/.test(line));
if (/\bnot ok\b/.test(output) || !output.includes("CONFIG_RESTORED")) throw new Error("Alternative configuration failed:\n" + failures.join("\n"));
console.log("Alternative configuration: " + (output.match(/^\s*ok \d+/gm) ?? []).length + " assertions passed; transaction rolled back and original configuration restored.");
