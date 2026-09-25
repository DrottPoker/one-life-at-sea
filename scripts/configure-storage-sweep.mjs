// Stores the Storage API address and the service key in the local database's Vault, so the
// scheduled forum image sweep can delete files. Runs after db:start; nothing secret is printed.
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const { loadConfig } = await import("./config/core.mjs");
const config = loadConfig();
const cli = resolve("node_modules/supabase/dist/supabase.js");
const status = JSON.parse(execFileSync(process.execPath, [cli, "status", "--output", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
if (!status.API_URL || !new URL(status.API_URL).hostname.match(/^(127\.0\.0\.1|localhost)$/)) throw new Error("Expected a running local Supabase instance.");
const key = status.SERVICE_ROLE_KEY;
if (typeof key !== "string" || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key)) throw new Error("The local service key could not be read.");
// The database reaches the API gateway by its name inside the local Docker network.
const secrets = { forum_storage_url: "http://kong:8000/storage/v1", forum_storage_key: key };
const sql = Object.entries(secrets).map(([name, value]) => "do $sweep$ declare existing uuid; begin " +
  "select id into existing from vault.secrets where name='" + name + "'; " +
  "if existing is null then perform vault.create_secret($value$" + value + "$value$,'" + name + "','Forum image sweep'); " +
  "else perform vault.update_secret(existing,$value$" + value + "$value$); end if; end $sweep$;").join("\n");
execFileSync("docker", ["exec", "-i", "supabase_db_" + config.server.local.supabaseProjectId, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-q"],
  { input: sql, stdio: ["pipe", "ignore", "inherit"] });
console.log("Stored the forum image sweep settings in the local Vault. No credentials were printed.");
