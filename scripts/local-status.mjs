import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const cli = resolve("node_modules/supabase/dist/supabase.js");
const status = JSON.parse(execFileSync(process.execPath, [cli, "status", "--output", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
console.log(JSON.stringify({ api: status.API_URL, studio: status.STUDIO_URL, inbox: status.INBUCKET_URL || status.MAILPIT_URL }, null, 2));
