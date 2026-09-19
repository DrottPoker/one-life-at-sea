import { execFileSync } from "node:child_process";
import { loadConfig } from "./config/core.mjs";

const [operation, name] = process.argv.slice(2);
if (!["grant", "revoke"].includes(operation) || !name?.trim() || process.argv.length !== 4) {
  throw new Error('Usage: node scripts/admin-access.mjs grant|revoke "Character name"');
}
const container = "supabase_db_" + loadConfig().server.local.supabaseProjectId;
const run = sql => execFileSync("docker", ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-q", "-t", "-A"],
  { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
const userId = run("select user_id from public.characters where lower(display_name)=lower('" + name.trim().replaceAll("'", "''") + "');").trim();
if (!/^[0-9a-f-]{36}$/.test(userId)) throw new Error("Exactly one existing local character is required.");
run(operation === "grant"
  ? "insert into private.admin_members(user_id) values('" + userId + "') on conflict do nothing;"
  : "delete from private.admin_members where user_id='" + userId + "';");
console.log("Local admin access " + (operation === "grant" ? "granted to " : "revoked from ") + name + ".");

