import { existsSync, readFileSync, readdirSync } from "node:fs";
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
    if (value === undefined && rule.optional) return;
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
  for (const value of [g.morale.lossPerEnergy, g.morale.recoveryAmount, g.morale.tavernGain]) {
    check(Math.abs(value * 10 - Math.round(value * 10)) < 0.000001, "Morale supports at most one decimal.");
  }
  check(g.morale.recoveryAmount <= g.morale.maximum, "Morale recovery exceeds the range.");
  check(g.morale.tavernGain <= g.morale.maximum * 2, "Tavern gain exceeds the morale range.");
  check(g.morale.tavernGoldCost <= g.economy.maxGoldCoins, "Tavern price exceeds the Gold Coins limit.");
  check(g.resources.energyMax <= g.resources.energyStorageMax, "Energy recovery cap exceeds its storage limit.");
  check(g.stamina.maximum <= g.stamina.storageMaximum, "Stamina recovery cap exceeds its storage limit.");
  check(g.stamina.activityCost <= g.stamina.maximum, "Activity cost exceeds maximum Stamina.");
  check(g.stamina.recoveryAmount <= g.stamina.maximum, "Stamina recovery exceeds its cap.");
  check(g.skills.catalog.length <= 100, "At most 100 skills are supported.");
  check(new Set(g.skills.catalog.map(skill => skill.id)).size === g.skills.catalog.length, "Skill IDs must be unique.");
  for (const skill of g.skills.catalog) {
    check(/^[a-z][a-z0-9_]{0,47}$/.test(skill.id) && skill.name.length <= 60, "Invalid skill definition.");
  }
  check(g.skills.xpThresholds.length === 100 && g.skills.xpThresholds[0] === 0, "Skills start at level 1 and end at level 100.");
  check(g.skills.xpThresholds.every((xp, i, rows) => i === 0 || xp > rows[i - 1]), "Skill XP thresholds must strictly increase.");
  check(["crew_battling", "ship_battling"].every(id => g.skills.catalog.some(skill => skill.id === id)), "Combat requires the Crew Battling and Ship Battling skills.");
  // The top battling level gives the largest health bonus; health is a 32-bit integer.
  const battling = g.skills.battlingHealth;
  check(battling.maxLevelBonus >= battling.perLevel * (g.skills.xpThresholds.length - 2), "The top battling level cannot lower the health bonus.");
  check(g.resources.healthMax + g.equipment.limits.maxShipHealth + battling.maxLevelBonus <= 2147483647, "Maximum health exceeds the integer limit.");
  const portraits = g.portraits;
  check(portraits.catalog.length <= 100, "At most 100 portraits are supported.");
  check(new Set(portraits.catalog.map(portrait => portrait.id)).size === portraits.catalog.length, "Portrait IDs must be unique.");
  for (const portrait of portraits.catalog) {
    check(/^[a-z][a-z0-9_]{0,47}$/.test(portrait.id) && portrait.name.length <= 60 && /^\/images\/portraits\/[a-z0-9-]+\.webp$/.test(portrait.image) &&
      existsSync(resolve(root, "public" + portrait.image)), "Invalid portrait definition: " + portrait.id + ".");
  }
  check(portraits.catalog.some(portrait => portrait.id === portraits.defaultId), "The default portrait must be in the catalog.");
  check(g.activities.catalog.length <= 100, "At most 100 activities are supported.");
  check(new Set(g.activities.catalog.map(activity => activity.id)).size === g.activities.catalog.length, "Activity IDs must be unique.");
  for (const activity of g.activities.catalog) {
    check(/^[a-z][a-z0-9_]{0,47}$/.test(activity.id), "Invalid activity ID.");
    check(g.skills.catalog.some(skill => skill.id === activity.skillId), "Unknown activity skill.");
    check(activity.name.length <= 60 && activity.description.length <= 300 && activity.buttonLabel.length <= 40, "Activity text is too long.");
  }
  const forum = g.forum;
  check(forum.boards.length <= 50, "At most 50 forum boards are supported.");
  check(new Set(forum.boards.map(board => board.id)).size === forum.boards.length, "Forum board IDs must be unique.");
  for (const board of forum.boards) {
    check(/^[a-z][a-z0-9_]{0,47}$/.test(board.id), "Invalid forum board ID.");
    check(["open", "moderators", "closed"].includes(board.posting), "Unknown forum posting rule.");
    check(board.section.length <= 40 && board.name.length <= 60 && board.description.length <= 300, "Forum board text is too long.");
  }
  // Moderators move retired threads to the single closed board.
  check(forum.boards.filter(board => board.posting === "closed").length === 1 && forum.boards.some(board => board.posting === "closed" && board.active), "The forum requires exactly one active closed board.");
  check(forum.boards.some(board => board.posting === "open" && board.active), "The forum requires an active open board.");
  check(forum.imagesUnusedMax >= forum.imagesPerPost && forum.imagesPerHour >= forum.imagesPerPost, "Image limits must allow one post with the most images.");
  const sea = g.seaTravel;
  check(sea.departureEnergyCost <= g.resources.energyMax, "Departure costs more than maximum Energy.");
  check(sea.scoutEnergyCost <= g.resources.energyMax, "Scouting costs more than maximum Energy.");
  check(sea.locationTypes.filter(place => place.active).length >= 2, "Sea travel requires two active place types.");
  check(new Set(sea.locationTypes.map(place => place.id)).size === sea.locationTypes.length, "Sea place IDs must be unique.");
  for (const place of sea.locationTypes) {
    check(/^[a-z][a-z0-9_]{0,47}$/.test(place.id) && !["the_harbor", "harbor_outskirts"].includes(place.id), "Invalid sea place ID.");
    check(place.name.length <= 100, "Sea place name is too long.");
  }
  const inventory = g.inventory;
  check(new Set(inventory.categories.map(c => c.id)).size === inventory.categories.length, "Inventory category IDs must be unique.");
  check(new Set(inventory.items.map(i => i.id)).size === inventory.items.length, "Item IDs must be unique.");
  for (const category of inventory.categories) {
    check(/^[a-z][a-z0-9_]{0,47}$/.test(category.id) && category.id !== "all", "Invalid inventory category ID.");
    check(category.name.length <= 60, "Category name is too long.");
    check(["swords","shield","cannon","sail","bomb","cross","flask","boxes","compass"].includes(category.icon), "Unknown inventory category icon.");
  }
  for (const item of inventory.items) {
    check(/^[a-z][a-z0-9_]{0,47}$/.test(item.id), "Item IDs must be stable lowercase identifiers.");
    check(inventory.categories.some(c => c.id === item.categoryId), "Unknown item category.");
    check(["equipment","consumable","passive"].includes(item.kind), "Unknown item kind.");
    check(item.kind === "equipment" ? Object.hasOwn(equipmentSlotStats, item.slot) : item.slot === "none", "Item slot does not match its kind.");
    checkItemStats(item, g.equipment.limits, check);
    check(item.imagePath === '/images/items/placeholder.svg' || /^\/images\/items\/[a-z0-9-]+\.(png|webp)$/.test(item.imagePath), "Item images must be local inventory assets.");
    check(item.name.length <= 100 && item.description.length <= 2000 && item.effectDescription.length <= 1000, "Item text is too long.");
  }
  check(g.crafting.recipes.length <= 100, "At most 100 crafting recipes are supported.");
  check(new Set(g.crafting.recipes.map(recipe => recipe.id)).size === g.crafting.recipes.length, "Recipe IDs must be unique.");
  for (const recipe of g.crafting.recipes) {
    check(/^[a-z][a-z0-9_]{0,47}$/.test(recipe.id) && recipe.name.length <= 100, "Invalid crafting recipe.");
    check(recipe.ingredients.length <= 16, "At most 16 ingredients are supported.");
    check(new Set(recipe.ingredients.map(ingredient => ingredient.itemId)).size === recipe.ingredients.length, "Recipe ingredients must be unique.");
    check(!recipe.ingredients.some(ingredient => ingredient.itemId === recipe.outputItemId), "A recipe cannot consume its output.");
    for (const id of [recipe.outputItemId, ...recipe.ingredients.map(ingredient => ingredient.itemId)]) {
      const item = inventory.items.find(item => item.id === id);
      check(item && item.kind !== "equipment", "Recipes require known stackable items.");
    }
  }
  for (const [group, tiers] of [["crew", g.training.crewTiers], ["ship", g.training.shipTiers]]) {
    check(new Set(tiers.map(t => t.id)).size === tiers.length, group + " tier IDs must be unique.");
    check(tiers[0].xpRequired === 0 && tiers[0].goldCost === 0, "The first tier must be free at zero XP.");
    for (const [i, tier] of tiers.entries()) {
      check(/^[a-z][a-z0-9_]{0,47}$/.test(tier.id), "Tier IDs must be stable lowercase identifiers.");
      check(tier.goldCost <= g.economy.maxGoldCoins, "Tier price exceeds the Gold Coins limit.");
      if (i) check(tier.xpRequired > tiers[i - 1].xpRequired && tier.efficiency > tiers[i - 1].efficiency && tier.goldCost > 0,
        "Tier XP and gains must increase and later tiers must cost Gold Coins.");
      check(Math.abs(tier.efficiency * 1_000_000 - Math.round(tier.efficiency * 1_000_000)) < 0.000001, "Tier efficiency supports at most six decimals.");
    }
  }
  check(g.training.shipMaterials.length <= 16, "At most 16 ship materials are supported.");
  check(new Set(g.training.shipMaterials.map(item => item.itemId)).size === g.training.shipMaterials.length, "Ship materials must be unique.");
  for (const material of g.training.shipMaterials) {
    const item = inventory.items.find(item => item.id === material.itemId);
    check(item && item.kind !== "equipment" && item.categoryId === "materials" && item.active, "Ship materials require active stackable materials.");
    check(Number.isSafeInteger(Math.ceil(g.resources.energyStorageMax / g.training.shipMaterialEnergy) * material.quantity), "Ship material cost exceeds the safe integer limit.");
  }
  check(g.training.shipTiers.every(tier => tier.efficiency * g.training.shipGainMultiplier <= 1000), "Multiplied ship efficiency exceeds the supported limit.");
  check(g.training.shipMinEnergy <= g.resources.energyMax, "Minimum ship work exceeds maximum Energy.");
  check(Number.isSafeInteger(g.resources.energyStorageMax * g.training.shipSecondsPerEnergy), "Ship duration exceeds the safe integer limit.");
  check(Number.isSafeInteger(g.resources.energyStorageMax * g.training.xpPerEnergy), "Ship XP exceeds the safe integer limit.");
  check(g.resources.energyStorageMax <= 10_000, "Training supports at most 10000 Energy per action.");
  for (const tier of [...g.training.crewTiers, ...g.training.shipTiers.map(tier => ({ ...tier, efficiency: tier.efficiency * g.training.shipGainMultiplier }))]) {
    const rate = tier.efficiency / g.training.energyPerUnit;
    check(Math.round(rate * 1_000_000) > 0, "Training gain must survive six-decimal rounding.");
    const maximumGain = rate * (1 + Number.MAX_SAFE_INTEGER / g.training.statScale) ** g.training.statExponent * g.resources.energyStorageMax * g.training.perfectMultiplier;
    check(Number.isFinite(maximumGain) && maximumGain <= Number.MAX_SAFE_INTEGER, "Training gain exceeds the supported stat limit.");
  }
  check(Number.isSafeInteger(g.training.energyCost * g.training.xpPerEnergy), "Crew XP exceeds the safe integer limit.");
  check(g.economy.initialGoldCoins <= g.economy.maxGoldCoins, "Initial Gold Coins exceeds the balance limit.");
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
  const equipment = g.equipment;
  for (const weapon of Object.values(equipment.fallbackWeapons)) {
    check(weapon.name.length <= 100 && weapon.damage <= equipment.limits.maxDamage && hasTwoDecimals(weapon.damage) && hasTwoDecimals(weapon.precision), "Invalid fallback weapon.");
  }
  const consumable = id => inventory.items.some(item => item.id === id && item.kind === "consumable");
  check(new Set(equipment.temporaries.map(item => item.itemId)).size === equipment.temporaries.length, "Temporary items must be unique.");
  for (const temporary of equipment.temporaries) {
    check(consumable(temporary.itemId), "Temporaries must be consumable items.");
    check((temporary.damage !== undefined) !== (temporary.debuff !== undefined), "A temporary either deals damage or applies a debuff.");
    check(temporary.damage === undefined || (temporary.damage <= equipment.limits.maxDamage && hasTwoDecimals(temporary.damage)), "Invalid temporary damage.");
    check(hasTwoDecimals(temporary.precision) && (!temporary.debuff || (temporary.debuff.stat === "accuracy" && hasTwoDecimals(temporary.debuff.multiplier))), "Invalid temporary effect.");
  }
  const shots = equipment.shotTypes;
  check(consumable(shots.chain.itemId) && consumable(shots.grape.itemId) && shots.chain.itemId !== shots.grape.itemId, "Shot types must be distinct consumable items.");
  check(!equipment.temporaries.some(item => [shots.chain.itemId, shots.grape.itemId].includes(item.itemId)), "A shot type cannot also be a temporary.");
  check(equipment.zones.ship.some(zone => zone.id === shots.chain.zone), "Chain shot needs a ship hit zone.");
  check([shots.chain.multiplier, shots.chain.speedMultiplier, shots.grape.crewMultiplier].every(hasTwoDecimals), "Shot multipliers support at most two decimals.");
  for (const [group, slots] of [["crew", ["head", "body", "legs", "feet"]], ["ship", ["hull", "sails"]]]) {
    const zones = equipment.zones[group];
    check(zones.length <= 20 && new Set(zones.map(zone => zone.id)).size === zones.length, "Hit zone IDs must be unique.");
    for (const zone of zones) {
      check(/^[a-z][a-z0-9_]{0,47}$/.test(zone.id) && zone.name.length <= 60, "Invalid hit zone.");
      check(slots.includes(zone.armorSlot), "A " + group + " hit zone must use " + group + " armor.");
      check(hasTwoDecimals(zone.multiplier), "Hit zone multipliers support at most two decimals.");
    }
  }
  check(f.dayNight.dayStartHour < f.dayNight.nightStartHour, "Day must start before night in UTC.");
  new Intl.DateTimeFormat(f.site.locale, { timeZone: f.site.logTimeZone });
}
// Each equipment slot requires exactly these stats; other stats must be absent.
export const equipmentSlotStats = {
  firearm: ["damage", "precision", "shots"], melee: ["damage", "precision"], cannons: ["damage", "precision"],
  head: ["armor"], body: ["armor"], legs: ["armor"], feet: ["armor"], hull: ["armor", "health"], sails: ["armor", "speed"],
};
const statLimits = { damage: "maxDamage", armor: "maxArmor", health: "maxShipHealth", speed: "maxSpeed" };
const hasTwoDecimals = value => Math.abs(value * 100 - Math.round(value * 100)) < 0.000001;
function checkItemStats(item, limits, check) {
  const required = item.kind === "equipment" ? equipmentSlotStats[item.slot] ?? [] : [];
  const present = Object.keys(item.stats ?? {});
  check(present.length === required.length && required.every(key => present.includes(key)), "Item " + item.id + " must define exactly the stats of its slot.");
  for (const key of required) {
    const value = item.stats[key];
    if (key === "shots") { check(value <= limits.maxShots, "Item " + item.id + " has too many shots."); continue; }
    check(value.min <= value.max && hasTwoDecimals(value.min) && hasTwoDecimals(value.max), "Item " + item.id + " has an invalid " + key + " range.");
    if (statLimits[key]) check(value.max <= limits[statLimits[key]], "Item " + item.id + " exceeds the " + key + " limit.");
  }
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
export function trainingCatalogSql(config) {
  const quote = value => "'" + value.replaceAll("'", "''") + "'";
  const rows = [["crew", config.gameplay.training.crewTiers], ["ship", config.gameplay.training.shipTiers]]
    .flatMap(([group, tiers]) => tiers.map((t, i) =>
      "(" + [quote(group), quote(t.id), i, quote(t.name), t.xpRequired, t.goldCost, t.efficiency].join(",") + ")")).join(",\n");
  let delimiter = "$catalog$";
  while (rows.includes(delimiter)) delimiter = delimiter.slice(0, -1) + "_$";
  return "do " + delimiter + " begin if exists(select 1 from private.training_tiers old left join (values\n" + rows +
    "\n) incoming(training_group,id,position,name,xp_required,gold_cost,efficiency) using(training_group,id) " +
    "where incoming.id is null or incoming.position<>old.position) then raise exception 'Existing tier IDs and positions must be preserved'; end if; end " + delimiter + ";\n" +
    "insert into private.training_tiers(training_group,id,position,name,xp_required,gold_cost,efficiency) values\n" + rows +
    "\non conflict(training_group,id) do update set name=excluded.name,xp_required=excluded.xp_required,gold_cost=excluded.gold_cost,efficiency=excluded.efficiency;\n";
}
export function gameplaySql(config) {
  const template = read("supabase/templates/gameplay.sql").replace(/\{\{include\.([a-z-]+)\}\}\n/g,
    (_, name) => read("supabase/templates/gameplay/" + name + ".sql"));
  return render(template
    .replace("{{activities.catalogSql}}", () => activityCatalogSql(config))
    .replace("{{crafting.catalogSql}}", () => craftingCatalogSql(config))
    .replace("{{skills.catalogSql}}", () => skillCatalogSql(config))
    .replace("{{portraits.catalogSql}}", () => portraitCatalogSql(config))
    .replace("{{training.catalogSql}}", () => trainingCatalogSql(config))
    .replaceAll("{{training.materialsSql}}", () => config.gameplay.training.shipMaterials.map(item =>
      "('" + item.itemId.replaceAll("'", "''") + "'," + item.quantity + "::bigint)").join(","))
    .replace("{{inventory.catalogSql}}", () => inventoryCatalogSql(config))
    .replaceAll("{{equipment.zonesSql}}", () => equipmentZonesSql(config))
    .replaceAll("{{equipment.temporariesSql}}", () => equipmentTemporariesSql(config))
    .replace("{{seaTravel.catalogSql}}", () => seaTravelCatalogSql(config))
    .replace("{{forum.catalogSql}}", () => forumCatalogSql(config)), config);
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

const equipmentStatColumns = "damage_min,damage_max,precision_min,precision_max,armor_min,armor_max,health_min,health_max,speed_min,speed_max,shots";
// Temporaries as SQL rows: item, damage, precision, debuff multiplier, debuff rounds.
export function equipmentTemporariesSql(config) {
  const quote = value => "'" + value.replaceAll("'", "''") + "'";
  return config.gameplay.equipment.temporaries.map(item => "(" + [quote(item.itemId), item.damage === undefined ? "null::numeric" : item.damage + "::numeric",
    item.precision + "::numeric", item.debuff ? item.debuff.multiplier + "::numeric" : "null::numeric", item.debuff ? item.debuff.rounds : "null::integer"].join(",") + ")").join(",");
}
export function equipmentZonesSql(config) {
  const quote = value => "'" + value.replaceAll("'", "''") + "'";
  return Object.entries(config.gameplay.equipment.zones).flatMap(([group, zones]) => zones.map((zone, i) =>
    "(" + [quote(group), i, quote(zone.id), zone.weight, zone.multiplier + "::numeric", quote(zone.armorSlot), zone.critical].join(",") + ")")).join(",");
}
export function inventoryCatalogSql(config) {
  const quote = value => "'" + value.replaceAll("'", "''") + "'";
  const catalog = config.gameplay.inventory;
  const categories = catalog.categories.map((c, i) => "(" + [quote(c.id), quote(c.name), i].join(",") + ")").join(",\n");
  const range = (stats, key) => stats?.[key] ? [stats[key].min + "::numeric", stats[key].max + "::numeric"] : ["null::numeric", "null::numeric"];
  const items = catalog.items.map(i => "(" + [quote(i.id),quote(i.categoryId),quote(i.name),quote(i.description),
    quote(i.effectDescription),quote(i.imagePath),quote(i.kind),i.kind !== "equipment",
    i.slot === "none" ? "null::text" : quote(i.slot),i.active,i.tradable,
    ...["damage", "precision", "armor", "health", "speed"].flatMap(key => range(i.stats, key)),
    i.stats?.shots ? i.stats.shots + "::integer" : "null::integer"].join(",") + ")").join(",\n");
  let delimiter = "$inventory$";
  while ((categories + items).includes(delimiter)) delimiter = delimiter.slice(0, -1) + "_$";
  const columns = "id,category_id,name,description,effect_description,image_path,kind,stackable,slot,active,tradable," + equipmentStatColumns;
  return "do " + delimiter + " begin " +
    "if exists(select 1 from private.item_categories old left join (values\n" + categories +
    "\n) incoming(id,name,position) using(id) where incoming.id is null) then raise exception 'Existing category IDs must be preserved'; end if; " +
    "if exists(select 1 from private.item_definitions old left join (values\n" + items +
    "\n) incoming(" + columns + ") using(id) where not old.managed_by_admin and (incoming.id is null or old.kind<>incoming.kind or old.stackable<>incoming.stackable or old.slot is distinct from incoming.slot)) " +
    "then raise exception 'Existing item IDs, kinds and slots must be preserved'; end if; end " + delimiter + ";\n" +
    "insert into private.item_categories(id,name,position) values\n" + categories +
    "\non conflict(id) do update set name=excluded.name,position=excluded.position;\n" +
    "insert into private.item_definitions(" + columns + ") values\n" + items +
    "\non conflict(id) do update set category_id=excluded.category_id,name=excluded.name,description=excluded.description," +
    "effect_description=excluded.effect_description,image_path=excluded.image_path,active=excluded.active,tradable=excluded.tradable," +
    equipmentStatColumns.split(",").map(column => column + "=excluded." + column).join(",") + " where not item_definitions.managed_by_admin;\n";
}

export function seaTravelCatalogSql(config) {
  const quote = value => "'" + value.replaceAll("'", "''") + "'";
  const rows = config.gameplay.seaTravel.locationTypes.map(place =>
    "(" + [quote(place.id), quote(place.name), place.active].join(",") + ")").join(",\n");
  return "update private.sea_location_types set active=false;\n" +
    "insert into private.sea_location_types(id,name,active) values\n" + rows +
    "\non conflict(id) do update set name=excluded.name,active=excluded.active;\n";
}

export function forumCatalogSql(config) {
  const quote = value => "'" + value.replaceAll("'", "''") + "'";
  const rows = config.gameplay.forum.boards.map((board, i) => "(" + [quote(board.id), quote(board.section), quote(board.name),
    quote(board.description), quote(board.posting), board.karma, board.active, i].join(",") + ")").join(",\n");
  let delimiter = "$forum$";
  while (rows.includes(delimiter)) delimiter = delimiter.slice(0, -1) + "_$";
  return "do " + delimiter + " begin if exists(select 1 from private.forum_boards old left join (values\n" + rows +
    "\n) incoming(id,section,name,description,posting,karma,active,position) using(id) where incoming.id is null) " +
    "then raise exception 'Existing forum board IDs must be preserved'; end if; end " + delimiter + ";\n" +
    "insert into private.forum_boards(id,section,name,description,posting,karma,active,position) values\n" + rows +
    "\non conflict(id) do update set section=excluded.section,name=excluded.name,description=excluded.description," +
    "posting=excluded.posting,karma=excluded.karma,active=excluded.active,position=excluded.position;\n";
}

// Portrait IDs are validated by pattern, so they need no dollar-quote search.
export function portraitCatalogSql(config) {
  const rows = config.gameplay.portraits.catalog.map((portrait, i) => "('" + portrait.id + "'," + i + ")").join(",");
  return "do $portraits$ begin if exists(select 1 from private.portrait_definitions old left join (values " + rows +
    ") incoming(id,position) using(id) where incoming.id is null) then raise exception 'Existing portrait IDs must be preserved'; end if; end $portraits$;\n" +
    "insert into private.portrait_definitions(id,position) values " + rows + " on conflict(id) do update set position=excluded.position;\n";
}

export function skillCatalogSql(config) {
  const quote = value => "'" + value.replaceAll("'", "''") + "'";
  const skills = config.gameplay.skills;
  const catalog = skills.catalog.map((skill, i) => "(" + [quote(skill.id), quote(skill.name), i].join(",") + ")").join(",\n");
  const levels = skills.xpThresholds.map((xp, i) => "(" + (i + 1) + "," + xp + ")").join(",");
  let delimiter = "$skills$";
  while (catalog.includes(delimiter)) delimiter = delimiter.slice(0, -1) + "_$";
  return "do " + delimiter + " begin if exists(select 1 from private.skill_definitions old left join (values " +
    catalog + ") incoming(id,name,position) using(id) where incoming.id is null) then raise exception 'Existing skill IDs must be preserved'; end if; end " + delimiter + ";\n" +
    "insert into private.skill_definitions(id,name,position) values " + catalog +
    " on conflict(id) do update set name=excluded.name,position=excluded.position;\n" +
    "insert into private.skill_levels(level,xp) values " + levels +
    " on conflict(level) do update set xp=excluded.xp;\n";
}

export function activityCatalogSql(config) {
  const quote = value => "'" + value.replaceAll("'", "''") + "'";
  const rows = config.gameplay.activities.catalog.map((activity, i) => "(" + [quote(activity.id), quote(activity.skillId), activity.xpGain, activity.active, i].join(",") + ")").join(",");
  return "do $activities$ begin if exists(select 1 from private.activity_definitions old left join (values " + rows +
    ") incoming(id,skill_id,xp_gain,active,position) using(id) where incoming.id is null or incoming.skill_id<>old.skill_id) " +
    "then raise exception 'Existing activity IDs and skills must be preserved'; end if; end $activities$;\n" +
    "insert into private.activity_definitions(id,skill_id,xp_gain,active,position) values " + rows +
    " on conflict(id) do update set xp_gain=excluded.xp_gain,active=excluded.active,position=excluded.position;\n";
}

export function craftingCatalogSql(config) {
  const quote = value => "'" + value.replaceAll("'", "''") + "'";
  const recipes = config.gameplay.crafting.recipes;
  const rows = recipes.map((recipe, index) => {
    const version = createHash("sha256").update(JSON.stringify({
      outputItemId: recipe.outputItemId, outputQuantity: recipe.outputQuantity, xpGain: config.gameplay.crafting.xpGain,
      ingredients: [...recipe.ingredients].sort((a, b) => a.itemId.localeCompare(b.itemId)),
    })).digest("hex");
    return "(" + [quote(recipe.id), quote(recipe.name), quote(recipe.outputItemId), recipe.outputQuantity,
      quote(version), recipe.active, index].join(",") + ")";
  }).join(",\n");
  const ingredients = recipes.flatMap(recipe => recipe.ingredients.map(ingredient =>
    "(" + [quote(recipe.id), quote(ingredient.itemId), ingredient.quantity].join(",") + ")")).join(",\n");
  return "update private.crafting_recipes set active=false;\n" +
    "insert into private.crafting_recipes(id,name,output_item_id,output_quantity,version,active,position) values\n" + rows +
    "\non conflict(id) do update set name=excluded.name,output_item_id=excluded.output_item_id,output_quantity=excluded.output_quantity,version=excluded.version,active=excluded.active,position=excluded.position;\n" +
    "delete from private.crafting_ingredients where recipe_id in(" + recipes.map(recipe => quote(recipe.id)).join(",") + ");\n" +
    "insert into private.crafting_ingredients(recipe_id,item_id,quantity) values\n" + ingredients + ";\n";
}
