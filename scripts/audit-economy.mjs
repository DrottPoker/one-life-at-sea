import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import server from "../config/server.json" with { type: "json" };

const sql = readFileSync(new URL("./economy-integrity.sql", import.meta.url), "utf8");
const output = execFileSync("docker", ["exec", "-i", "supabase_db_" + server.local.supabaseProjectId,
  "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-q", "-t", "-A"],
{ input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
const checks = JSON.parse(output.trim());
console.log(JSON.stringify(checks, null, 2));
if (Object.values(checks).some(count => count !== 0)) {
  console.error("Economy integrity check failed. No game data was changed.");
  process.exitCode = 1;
}
