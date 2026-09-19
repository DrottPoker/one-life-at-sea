import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const { loadConfig, localOrigin } = await import("./config/core.mjs");
const config = loadConfig();
const file = resolve(".env.local");
if (existsSync(file)) {
  console.error(".env.local already exists. It has been left unchanged.");
  process.exit(1);
}
const cli = resolve("node_modules/supabase/dist/supabase.js");
const status = JSON.parse(execFileSync(process.execPath, [cli, "status", "--output", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
const url = status.API_URL;
const key = status.PUBLISHABLE_KEY || status.ANON_KEY;
if (!url || !key || !new URL(url).hostname.match(/^(127\.0\.0\.1|localhost)$/)) throw new Error("Expected a running local Supabase instance.");
writeFileSync(file, `NEXT_PUBLIC_SUPABASE_URL=${url}\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${key}\nSITE_URL=${localOrigin(config)}\n`, { flag: "wx", mode: 0o600 });
console.log("Created .env.local for local Supabase. No credentials were printed.");
