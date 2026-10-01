// Read-only checks of the local database against the repository: the applied gameplay revision and
// the hand-maintained RPC types in src/lib/database.types.ts (names, parameters and defaults).
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { loadConfig, root } from "./config/core.mjs";

const config = loadConfig();
function sql(statement) {
  return execFileSync("docker", ["exec", "-i", "supabase_db_" + config.server.local.supabaseProjectId, "psql", "-U", "postgres", "-d", "postgres",
    "-v", "ON_ERROR_STOP=1", "-q", "-t", "-A"], { input: statement, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
}
const errors = [];

const expected = JSON.parse(readFileSync(resolve(root, "src/config/gameplay-revision.json"), "utf8")).revision;
const applied = sql("select public.get_gameplay_revision();");
if (applied !== expected) errors.push("The local database runs gameplay revision " + applied + ", the repository " + expected + ". Run npm run db:migrate.");

const typed = new Map();
const source = ts.createSourceFile("database.types.ts", readFileSync(resolve(root, "src/lib/database.types.ts"), "utf8"), ts.ScriptTarget.Latest, true);
(function visit(node) {
  if (ts.isPropertySignature(node) && node.name.getText(source) === "Functions" && node.type && ts.isTypeLiteralNode(node.type)) {
    for (const member of node.type.members) {
      const args = member.type && ts.isTypeLiteralNode(member.type) ? member.type.members.find(entry => entry.name?.getText(source) === "Args") : null;
      if (!ts.isPropertySignature(member) || !args?.type) { errors.push("database.types.ts: " + member.getText(source).slice(0, 60) + " has no Args"); continue; }
      const parameters = ts.isTypeLiteralNode(args.type) ? args.type.members.map(entry => ({ name: entry.name.getText(source), optional: !!entry.questionToken })) : [];
      typed.set(member.name.getText(source), parameters);
    }
  }
  ts.forEachChild(node, visit);
})(source);
if (!typed.size) errors.push("database.types.ts: no Functions found");

const functions = JSON.parse(sql(`select coalesce(json_agg(json_build_object('name',p.proname,'arguments',
  (select coalesce(json_agg(json_build_object('name',a.name,'default',a.position>p.pronargs-p.pronargdefaults) order by a.position),'[]')
    from unnest(coalesce(p.proargnames,array_fill(''::text,array[p.pronargs])),coalesce(p.proargmodes,array_fill('i'::"char",array[p.pronargs])))
      with ordinality a(name,mode,position) where a.mode in('i','b','v')))),'[]')
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public';`));
for (const [name, parameters] of typed) {
  const matches = functions.filter(entry => entry.name === name);
  if (!matches.length) { errors.push(name + ": no public function with this name"); continue; }
  const fits = matches.some(entry => entry.arguments.length === parameters.length && entry.arguments.every(argument => {
    const parameter = parameters.find(item => item.name === argument.name);
    return parameter && parameter.optional === argument.default;
  }));
  if (!fits) errors.push(name + ": typed (" + parameters.map(item => item.name + (item.optional ? "?" : "")).join(", ") + ") but the database has " +
    matches.map(entry => "(" + entry.arguments.map(item => item.name + (item.default ? "?" : "")).join(", ") + ")").join(" or "));
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log("Local database matches gameplay revision " + expected + " and all " + typed.size + " typed RPC signatures.");
}
