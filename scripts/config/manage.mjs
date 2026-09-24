import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { loadConfig, root, read, generatedFiles, latestConfigMigration, migrationSql, revision } from "./core.mjs";

// Windows can briefly lock a freshly written file (indexing or antivirus); retry before failing.
function writeFile(target, content) {
  for (let attempt = 0; ; attempt++) {
    try { return writeFileSync(target, content); }
    catch (error) {
      if (attempt >= 4 || !["UNKNOWN", "EBUSY", "EPERM"].includes(error.code)) throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100 * (attempt + 1));
    }
  }
}
const mode = process.argv[2] ?? "check";
if (!["check", "sync"].includes(mode)) throw new Error("Use check or sync.");
const config = loadConfig();
const files = generatedFiles(config);
const latest = latestConfigMigration();
const sql = migrationSql(config);
if (mode === "check") {
  const stale = Object.entries(files).filter(([path, expected]) => !existsSync(resolve(root, path)) || read(path) !== expected).map(([path]) => path);
  if (!latest || read(latest) !== sql) stale.push("gameplay migration");
  if (stale.length) throw new Error("Config artifacts are stale: " + stale.join(", ") + ". Run npm run config:sync, then npm run db:migrate.");
  console.log("Configuration and generated artifacts match.");
} else {
  if (!latest || read(latest) !== sql) {
    const cli = resolve(root, "node_modules/supabase/dist/supabase.js");
    const directory = resolve(root, "supabase/migrations");
    const before = new Set(readdirSync(directory));
    const name = "central_gameplay_config_" + revision(config).slice(0, 12);
    execFileSync(process.execPath, [cli, "migration", "new", name], { cwd: root, stdio: "pipe" });
    const created = readdirSync(directory).filter(name => !before.has(name));
    if (created.length !== 1 || !created[0].endsWith("_" + name + ".sql")) throw new Error("Could not identify the new migration.");
    const target = resolve(directory, created[0]);
    writeFile(target, sql);
    console.log("Created gameplay migration: " + target);
  }
  for (const [path, content] of Object.entries(files)) {
    const target = resolve(root, path);
    mkdirSync(dirname(target), { recursive: true });
    if (!existsSync(target) || read(path) !== content) writeFile(target, content);
  }
  console.log("Config artifacts synchronized. Apply database changes with npm run db:migrate; restart Supabase after infrastructure/auth changes.");
}
