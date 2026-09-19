import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const root = fileURLToPath(new URL("../../", import.meta.url));
export const read = path => readFileSync(resolve(root, path), "utf8").replace(/\r\n/g, "\n");
export const names = ["gameplay", "auth", "frontend", "server", "testing"];
export function loadConfig() {
  const config = Object.fromEntries(names.map(name => [name, JSON.parse(read("config/" + name + ".json"))]));
  validateConfig(config);
  return config;
}
export function validateConfig(config) {
  const schema = JSON.parse(read("config/schema.json"));
  function visit(value, rule, path) {
    if (rule.type === "object") {
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(path + " must be an object.");
      for (const key of Object.keys(value)) if (!Object.hasOwn(rule.properties, key)) throw new Error("Unknown setting: " + path + "." + key);
      for (const [key, child] of Object.entries(rule.properties)) visit(value[key], child, path + "." + key);
    } else if (rule.type === "array") {
      if (!Array.isArray(value) || !value.length) throw new Error(path + " must be a nonempty array.");
      value.forEach((entry, index) => visit(entry, rule.items, path + "[" + index + "]"));
    } else {
      if (typeof value !== rule.type || (rule.type === "string" && !value.trim())) throw new Error(path + " must be " + rule.type + ".");
      if (rule.type === "number" && (!Number.isFinite(value) || value < rule.minimum || value > rule.maximum || (rule.integer && !Number.isInteger(value)))) {
        throw new Error(path + " must be " + (rule.integer ? "an integer" : "a number") + " between " + rule.minimum + " and " + rule.maximum + ".");
      }
    }
  }
  visit(config, schema, "config");
  const { gameplay: g, auth: a, server: s, frontend: f } = config;
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  check(g.resources.energyInitial <= g.resources.energyMax, "Initial Energy exceeds its cap.");
  check(Math.max(g.resources.shipHealthInitial, g.resources.crewHealthInitial) <= g.resources.healthMax, "Initial health exceeds its cap.");
  check(Math.max(g.training.energyCost, g.combat.energyCost) <= g.resources.energyMax, "An action costs more than maximum Energy.");
  check(g.combat.minimumHealth <= Math.min(g.resources.shipHealthInitial, g.resources.crewHealthInitial), "Starting health cannot be below minimum attack health.");
  check(g.combat.ammoPerShot <= g.combat.startingAmmo, "Starting ammunition must allow at least one shot.");
  check(g.combat.idleSeconds <= g.combat.maxDurationSeconds, "Idle deadline exceeds the encounter deadline.");
  check(["cannon", "boarding"].includes(g.combat.defaultDefenceOrder), "Unknown defence preset.");
  check(g.combat.boarding.minimumChance <= g.combat.boarding.baseChance && g.combat.boarding.baseChance <= g.combat.boarding.maximumChance, "Boarding chances must be ordered.");
  check(a.passwordMinLength >= 6 && a.passwordMinLength <= a.passwordMaxLength, "Password lengths must match Supabase's minimum of six.");
  check(s.playerWindows.defaultCount <= s.playerWindows.maxCount, "Default player window count exceeds its maximum.");
  const ports = Object.entries(s.local).filter(([key]) => /Port$/.test(key)).map(([, value]) => value);
  check(new Set(ports).size === ports.length && ports.every(port => port <= 65535), "Local ports must be distinct and valid.");
  check(["127.0.0.1", "localhost", "::1"].includes(s.local.host), "Local tools must bind to a loopback host.");
  check(/^[a-z0-9_-]+$/.test(s.local.supabaseProjectId), "Supabase project ID must contain lowercase letters, digits, underscores or dashes.");
  check(g.combat.mitigation.equalStatsReduction > 0 && g.combat.mitigation.equalStatsReduction < 1, "Equal-stat reduction must be strictly between zero and one.");
  new Intl.DateTimeFormat(f.site.locale, { timeZone: f.site.logTimeZone });
}
export function pathValue(object, path) {
  const value = path.split(".").reduce((current, key) => current?.[key], object);
  if (value === undefined || (typeof value === "object" && value !== null)) throw new Error("Unknown scalar config token: " + path);
  return value;
}
export function render(template, config, mode = "sql") {
  return template.replace(/\{\{([\w.]+)\}\}/g, (_, path) => {
    const value = pathValue(config, path);
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    return mode === "sql" ? "'" + value.replaceAll("'", "''") + "'" : String(value);
  });
}
export function localOrigin(config, test = false) {
  const host = config.server.local.host;
  return "http://" + (host.includes(":") ? "[" + host + "]" : host) + ":" + (test ? config.server.local.testPort : config.server.local.appPort);
}
export function gameplaySql(config) {
  return render(read("supabase/templates/gameplay.sql"), config);
}
export function revision(config) {
  return createHash("sha256").update(JSON.stringify(config.gameplay)).update(gameplaySql(config)).digest("hex");
}
export function migrationSql(config) {
  const hash = revision(config);
  return "-- Generated by npm run config:sync. Edit config/gameplay.json or supabase/templates/gameplay.sql.\n" +
    "-- gameplay-revision: " + hash + "\n\n" + gameplaySql(config) +
    "\ncreate or replace function public.get_gameplay_revision()\nreturns text language sql immutable security invoker set search_path='' as $$\n  select '" + hash + "'::text;\n$$;\n" +
    "revoke all on function public.get_gameplay_revision() from public;\ngrant execute on function public.get_gameplay_revision() to anon,authenticated;\n";
}
export function latestConfigMigration() {
  return readdirSync(resolve(root, "supabase/migrations")).sort().reverse()
    .map(name => "supabase/migrations/" + name).find(path => read(path).includes("-- gameplay-revision: "));
}
export function generatedFiles(config) {
  const origin = localOrigin(config), testOrigin = localOrigin(config, true);
  const tokens = { ...config, origins: { app: origin, test: testOrigin } };
  return {
    "supabase/config.toml": "# Generated by npm run config:sync. Edit config/supabase.toml.\n" + render(read("config/supabase.toml"), tokens, "text"),
    "src/config/gameplay-revision.json": JSON.stringify({ revision: revision(config) }, null, 2) + "\n",
    "src/styles/interface.generated.css": "/* Generated by npm run config:sync. Edit config/interface.css.template or config/frontend.json. */\n" +
      render(read("config/interface.css.template"), config, "text"),
  };
}
