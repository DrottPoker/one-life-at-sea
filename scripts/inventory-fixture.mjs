import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { loadConfig } from "./config/core.mjs";

export function inventoryFixtureSql(characterId) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(characterId)) throw new Error("Invalid character ID.");
  const id = "'" + characterId + "'::uuid";
  return "begin;\nselect private.lock_combat_context(array[" + id + "]);\n" +
    "select 1 from private.item_circulation where item_id in('linen_bandages','drill_tonic','oak_planks','brass_compass','cutlass','deck_cannon') order by item_id for update;\n" +
    "insert into private.item_stacks(id,character_id,item_id,quantity) select md5(" + id + "::text||':inventory-fixture:'||item_id)::uuid," + id +
    ",item_id,quantity from (values('linen_bandages',10),('drill_tonic',3),('oak_planks',20),('brass_compass',1)) v(item_id,quantity) on conflict(character_id,item_id) do nothing;\n" +
    "insert into private.item_instances(id,character_id,item_id,damage,accuracy) select md5(" + id + "::text||':inventory-fixture:'||tag)::uuid," + id +
    ",item_id,damage,accuracy from (values('cutlass-one','cutlass',32.15,54.60),('cutlass-two','cutlass',35.20,52.80),('cannon-one','deck_cannon',48.70,61.00)) v(tag,item_id,damage,accuracy) " +
    "where not exists(select 1 from private.market_listings l where l.original_entry_id=md5(" + id +
    "::text||':inventory-fixture:'||tag)::uuid and l.entry_type='instance' and l.quantity>0) on conflict(id) do nothing;\n" +
    "select private.notify_training(" + id + ");\ncommit;\n";
}

function main() {
  const name = process.argv[2]?.trim();
  if (!name || name.length > 100 || process.argv.length !== 3) throw new Error('Usage: node scripts/inventory-fixture.mjs "Character name"');
  const config = loadConfig();
  const container = "supabase_db_" + config.server.local.supabaseProjectId;
  const run = sql => execFileSync("docker", ["exec","-i",container,"psql","-U","postgres","-d","postgres","-v","ON_ERROR_STOP=1","-q","-t","-A"],
    { input: sql, encoding: "utf8", stdio: ["pipe","pipe","pipe"] });
  const id = run("select id from public.characters where lower(display_name)=lower('" + name.replaceAll("'", "''") + "');").trim();
  if (!id) throw new Error("No local character found with that name.");
  run(inventoryFixtureSql(id));
  console.log("Local inventory fixtures added for " + name + ". Existing items and quantities were preserved.");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main();
