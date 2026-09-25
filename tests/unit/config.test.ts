import { describe, expect, it } from "vitest";
import { generatedFiles, latestConfigMigration, loadConfig, migrationSql, read, render, revision, validateConfig } from "../../scripts/config/core.mjs";
import { durationLabel, gameplay } from "../../src/config/public";

describe("configuration contract", () => {
  it("matches generated migration, SQL, frontend and infrastructure artifacts", () => {
    const config = loadConfig();
    expect(config.gameplay).toEqual(gameplay);
    expect(read(latestConfigMigration()!)).toBe(migrationSql(config));
    for (const [path, expected] of Object.entries(generatedFiles(config))) expect(read(path), path).toBe(expected);
  });
  it.each([
    ["fractional crafting XP", (c: ReturnType<typeof loadConfig>) => { c.gameplay.crafting.xpGain = 0.5; }],
    ["unknown recipe output", (c: ReturnType<typeof loadConfig>) => { c.gameplay.crafting.recipes[0].outputItemId = "missing"; }],
    ["equipment recipe output", (c: ReturnType<typeof loadConfig>) => { c.gameplay.crafting.recipes[0].outputItemId = "cutlass"; }],
    ["self-consuming recipe", (c: ReturnType<typeof loadConfig>) => { c.gameplay.crafting.recipes[0].outputItemId = "oak_logs"; }],
    ["fractional recipe cost", (c: ReturnType<typeof loadConfig>) => { c.gameplay.crafting.recipes[0].ingredients[0].quantity = 0.5; }],
    ["unsafe recipe output", (c: ReturnType<typeof loadConfig>) => { c.gameplay.crafting.recipes[0].outputQuantity = Number.MAX_SAFE_INTEGER + 1; }],
    ["duplicate recipe", (c: ReturnType<typeof loadConfig>) => { c.gameplay.crafting.recipes.push(c.gameplay.crafting.recipes[0]); }],
    ["duplicate ingredient", (c: ReturnType<typeof loadConfig>) => { c.gameplay.crafting.recipes[0].ingredients.push(c.gameplay.crafting.recipes[0].ingredients[0]); }],
    ["duplicate activity", (c: ReturnType<typeof loadConfig>) => { c.gameplay.activities.catalog[1].id = c.gameplay.activities.catalog[0].id; }],
    ["unknown activity skill", (c: ReturnType<typeof loadConfig>) => { c.gameplay.activities.catalog[0].skillId = "missing"; }],
    ["fractional activity XP", (c: ReturnType<typeof loadConfig>) => { c.gameplay.activities.catalog[0].xpGain = 0.5; }],
    ["duplicate skill", (c: ReturnType<typeof loadConfig>) => { c.gameplay.skills.catalog[1].id = c.gameplay.skills.catalog[0].id; }],
    ["nonzero starting XP", (c: ReturnType<typeof loadConfig>) => { c.gameplay.skills.xpThresholds[0] = 1; }],
    ["repeated skill threshold", (c: ReturnType<typeof loadConfig>) => { c.gameplay.skills.xpThresholds[1] = 0; }],
    ["missing level 100", (c: ReturnType<typeof loadConfig>) => { c.gameplay.skills.xpThresholds.pop(); }],
    ["Energy recovery above storage", (c: ReturnType<typeof loadConfig>) => { c.gameplay.resources.energyStorageMax = 99; }],
    ["Stamina recovery above storage", (c: ReturnType<typeof loadConfig>) => { c.gameplay.stamina.storageMaximum = 49; }],
    ["fractional stamina cost", (c: ReturnType<typeof loadConfig>) => { c.gameplay.stamina.activityCost = 0.5; }],
    ["zero stamina interval", (c: ReturnType<typeof loadConfig>) => { c.gameplay.stamina.recoverySeconds = 0; }],
    ["unaffordable stamina cost", (c: ReturnType<typeof loadConfig>) => { c.gameplay.stamina.activityCost = 51; }],
    ["excessive stamina recovery", (c: ReturnType<typeof loadConfig>) => { c.gameplay.stamina.recoveryAmount = 51; }],
    ["morale precision", (c: ReturnType<typeof loadConfig>) => { c.gameplay.morale.lossPerEnergy = 0.25; }],
    ["morale recovery precision", (c: ReturnType<typeof loadConfig>) => { c.gameplay.morale.recoveryAmount = 1.25; }],
    ["morale range", (c: ReturnType<typeof loadConfig>) => { c.gameplay.morale.maximum = 0; }],
    ["tavern gain range", (c: ReturnType<typeof loadConfig>) => { c.gameplay.morale.tavernGain = 201; }],
    ["tavern price range", (c: ReturnType<typeof loadConfig>) => { c.gameplay.morale.tavernGoldCost = c.gameplay.economy.maxGoldCoins + 1; }],
    ["invalid night hour", (c: ReturnType<typeof loadConfig>) => { c.frontend.dayNight.nightStartHour = 24; }],
    ["fractional day hour", (c: ReturnType<typeof loadConfig>) => { c.frontend.dayNight.dayStartHour = 6.5; }],
    ["equal day and night", (c: ReturnType<typeof loadConfig>) => { c.frontend.dayNight.dayStartHour = 21; }],
    ["inverted day hours", (c: ReturnType<typeof loadConfig>) => { c.frontend.dayNight.dayStartHour = 22; }],
    ["too few sea places", (c: ReturnType<typeof loadConfig>) => { c.gameplay.seaTravel.locationTypes = c.gameplay.seaTravel.locationTypes.slice(0, 1); }],
    ["inactive sea catalog", (c: ReturnType<typeof loadConfig>) => { c.gameplay.seaTravel.locationTypes.forEach(p => p.active = false); }],
    ["duplicate sea type", (c: ReturnType<typeof loadConfig>) => { c.gameplay.seaTravel.locationTypes[1].id = c.gameplay.seaTravel.locationTypes[0].id; }],
    ["reserved sea type", (c: ReturnType<typeof loadConfig>) => { c.gameplay.seaTravel.locationTypes[0].id = "harbor_outskirts"; }],
    ["unaffordable scouting", (c: ReturnType<typeof loadConfig>) => { c.gameplay.seaTravel.scoutEnergyCost = 101; }],
    ["empty scouting pages", (c: ReturnType<typeof loadConfig>) => { c.gameplay.seaTravel.scoutPageSize = 0; }],
    ["unaffordable departure", (c: ReturnType<typeof loadConfig>) => { c.gameplay.seaTravel.departureEnergyCost = 101; }],
    ["zero outward duration", (c: ReturnType<typeof loadConfig>) => { c.gameplay.seaTravel.outwardDurationSeconds = 0; }],
    ["fractional return duration", (c: ReturnType<typeof loadConfig>) => { c.gameplay.seaTravel.returnSecondsPerStep = 1.5; }],
    ["duplicate tier ID", (c: ReturnType<typeof loadConfig>) => { c.gameplay.training.crewTiers[1].id = c.gameplay.training.crewTiers[0].id; }],
    ["tier XP ordering", (c: ReturnType<typeof loadConfig>) => { c.gameplay.training.shipTiers[2].xpRequired = 0; }],
    ["unsafe Perfect Drill", (c: ReturnType<typeof loadConfig>) => { c.gameplay.training.crewTiers[9].efficiency = Number.MAX_SAFE_INTEGER; }],
    ["unknown ship material", (c: ReturnType<typeof loadConfig>) => { c.gameplay.training.shipMaterials[0].itemId = "missing"; }],
    ["duplicate ship material", (c: ReturnType<typeof loadConfig>) => { c.gameplay.training.shipMaterials.push(c.gameplay.training.shipMaterials[0]); }],
    ["unsafe ship material cost", (c: ReturnType<typeof loadConfig>) => { c.gameplay.training.shipMaterials[0].quantity = Number.MAX_SAFE_INTEGER; }],
    ["zero material interval", (c: ReturnType<typeof loadConfig>) => { c.gameplay.training.shipMaterialEnergy = 0; }],
    ["excessive ship multiplier", (c: ReturnType<typeof loadConfig>) => { c.gameplay.training.shipGainMultiplier = 1001; }],
    ["invalid minimum ship Energy", (c: ReturnType<typeof loadConfig>) => { c.gameplay.training.shipMinEnergy = 101; }],
    ["invalid ship duration", (c: ReturnType<typeof loadConfig>) => { c.gameplay.training.shipSecondsPerEnergy = 0; }],
    ["unsafe ship XP", (c: ReturnType<typeof loadConfig>) => { c.gameplay.training.xpPerEnergy = Number.MAX_SAFE_INTEGER; }],
    ["unsafe ship gain", (c: ReturnType<typeof loadConfig>) => { c.gameplay.training.shipTiers[9].efficiency = 1_000_000_000; }],
    ["linear training exponent", (c: ReturnType<typeof loadConfig>) => { c.gameplay.training.statExponent = 1; }],
    ["zero training scale", (c: ReturnType<typeof loadConfig>) => { c.gameplay.training.statScale = 0; }],
    ["unbounded training loop", (c: ReturnType<typeof loadConfig>) => { c.gameplay.resources.energyStorageMax = 10001; }],
    ["lost gain precision", (c: ReturnType<typeof loadConfig>) => { c.gameplay.training.energyPerUnit = 1000000000; }],
    ["excess efficiency precision", (c: ReturnType<typeof loadConfig>) => { c.gameplay.training.crewTiers[0].efficiency = 1.0000001; }],
    ["invalid chance", (c: ReturnType<typeof loadConfig>) => { c.gameplay.training.perfectChanceBps = 10001; }],
    ["paid first tier", (c: ReturnType<typeof loadConfig>) => { c.gameplay.training.crewTiers[0].goldCost = 1; }],
    ["misspelled key", (c: ReturnType<typeof loadConfig>) => Object.assign(c.gameplay.training, { energyCosts: 7 })],
    ["negative starting coins", (c: ReturnType<typeof loadConfig>) => { c.gameplay.economy.initialGoldCoins = -1; }],
    ["unsafe coin limit", (c: ReturnType<typeof loadConfig>) => { c.gameplay.economy.maxGoldCoins = 9007199254740992; }],
    ["starting coins above cap", (c: ReturnType<typeof loadConfig>) => { c.gameplay.economy.maxGoldCoins = 1; c.gameplay.economy.initialGoldCoins = 2; }],
    ["zero recovery amount", (c: ReturnType<typeof loadConfig>) => { c.gameplay.resources.energyRecoveryAmount = 0; }],
    ["zero recovery interval", (c: ReturnType<typeof loadConfig>) => { c.gameplay.resources.energyRecoverySeconds = 0; }],
    ["fractional round limit", (c: ReturnType<typeof loadConfig>) => { c.gameplay.combat.maxRounds = 2.5; }],
    ["invalid hit curve", (c: ReturnType<typeof loadConfig>) => { c.gameplay.combat.hitChance.extremeRatio = 1; }],
    ["zero hit exponent", (c: ReturnType<typeof loadConfig>) => { c.gameplay.combat.hitChance.exponent = 0; }],
    ["invalid capacity", (c: ReturnType<typeof loadConfig>) => { c.gameplay.resources.energyMax = 50; }],
    ["unaffordable action", (c: ReturnType<typeof loadConfig>) => { c.gameplay.training.energyCost = 101; }],
    ["invalid deadline", (c: ReturnType<typeof loadConfig>) => { c.gameplay.combat.idleSeconds = 601; }],
    ["invalid boarding range", (c: ReturnType<typeof loadConfig>) => { c.gameplay.combat.boarding.minimumChance = 0.95; }],
    ["invalid ammunition", (c: ReturnType<typeof loadConfig>) => { c.gameplay.combat.ammoPerShot = 11; }],
    ["fractional combat XP", (c: ReturnType<typeof loadConfig>) => { c.gameplay.combat.xpGain = 0.5; }],
    ["missing battling skill", (c: ReturnType<typeof loadConfig>) => { c.gameplay.skills.catalog = c.gameplay.skills.catalog.filter(skill => skill.id !== "ship_battling"); }],
    ["fractional battling health", (c: ReturnType<typeof loadConfig>) => { c.gameplay.skills.battlingHealth.perLevel = 1.5; }],
    ["top battling level lowering health", (c: ReturnType<typeof loadConfig>) => { c.gameplay.skills.battlingHealth.maxLevelBonus = 489; }],
    ["battling health overflow", (c: ReturnType<typeof loadConfig>) => { c.gameplay.resources.healthMax = 2_147_483_000; }],
    ["unknown equipment slot", (c: ReturnType<typeof loadConfig>) => { c.gameplay.inventory.items[0].slot = "crew_weapon"; }],
    ["weapon without precision", (c: ReturnType<typeof loadConfig>) => { delete (c.gameplay.inventory.items[0].stats as { precision?: unknown }).precision; }],
    ["armor on a weapon", (c: ReturnType<typeof loadConfig>) => { Object.assign(c.gameplay.inventory.items[0].stats!, { armor: { min: 1, max: 2 } }); }],
    ["stats on a material", (c: ReturnType<typeof loadConfig>) => { Object.assign(c.gameplay.inventory.items.find(i => i.id === "oak_logs")!, { stats: { armor: { min: 1, max: 2 } } }); }],
    ["inverted stat range", (c: ReturnType<typeof loadConfig>) => { c.gameplay.inventory.items[0].stats!.damage!.min = 16; }],
    ["armor above the limit", (c: ReturnType<typeof loadConfig>) => { c.gameplay.inventory.items.find(i => i.slot === "body")!.stats!.armor!.max = 76; }],
    ["fractional hull health", (c: ReturnType<typeof loadConfig>) => { c.gameplay.inventory.items.find(i => i.slot === "hull")!.stats!.health!.max = 25.5; }],
    ["excess stat precision", (c: ReturnType<typeof loadConfig>) => { c.gameplay.inventory.items[0].stats!.damage!.max = 15.001; }],
    ["duplicate hit zone", (c: ReturnType<typeof loadConfig>) => { c.gameplay.equipment.zones.crew[1].id = "head"; }],
    ["ship armor on a crew zone", (c: ReturnType<typeof loadConfig>) => { c.gameplay.equipment.zones.crew[0].armorSlot = "hull"; }],
    ["fallback weapon above the damage limit", (c: ReturnType<typeof loadConfig>) => { c.gameplay.equipment.fallbackWeapons.melee.damage = 101; }],
    ["duplicate forum board", (c: ReturnType<typeof loadConfig>) => { c.gameplay.forum.boards[1].id = c.gameplay.forum.boards[0].id; }],
    ["invalid forum board ID", (c: ReturnType<typeof loadConfig>) => { c.gameplay.forum.boards[0].id = "General"; }],
    ["unknown forum posting rule", (c: ReturnType<typeof loadConfig>) => { c.gameplay.forum.boards[0].posting = "staff"; }],
    ["second closed forum board", (c: ReturnType<typeof loadConfig>) => { c.gameplay.forum.boards[0].posting = "closed"; }],
    ["missing closed forum board", (c: ReturnType<typeof loadConfig>) => { c.gameplay.forum.boards = c.gameplay.forum.boards.filter(board => board.posting !== "closed"); }],
    ["inactive closed forum board", (c: ReturnType<typeof loadConfig>) => { c.gameplay.forum.boards.find(board => board.posting === "closed")!.active = false; }],
    ["no open forum board", (c: ReturnType<typeof loadConfig>) => { c.gameplay.forum.boards.forEach(board => { if (board.posting === "open") board.active = false; }); }],
    ["long forum board name", (c: ReturnType<typeof loadConfig>) => { c.gameplay.forum.boards[0].name = "x".repeat(61); }],
    ["zero forum page size", (c: ReturnType<typeof loadConfig>) => { c.gameplay.forum.postsPageSize = 0; }],
    ["oversized forum posts", (c: ReturnType<typeof loadConfig>) => { c.gameplay.forum.postMaxLength = 20001; }],
    ["conflicting ports", (c: ReturnType<typeof loadConfig>) => { c.server.local.testPort = c.server.local.appPort; }],
    ["remote test host", (c: ReturnType<typeof loadConfig>) => { c.server.local.host = "example.com"; }],
  ])("rejects %s", (_name, change) => {
    const config = loadConfig();
    change(config);
    expect(() => validateConfig(config)).toThrow();
  });
  it("detects changed balance but does not invalidate gameplay for frontend-only edits", () => {
    const config = loadConfig(), baseline = revision(config);
    config.frontend.refresh.fallbackMs += 100;
    expect(revision(config)).toBe(baseline);
    config.gameplay.training.crewTiers[0].efficiency += 1;
    expect(revision(config)).not.toBe(baseline);
  });
  it("escapes SQL strings and rejects missing template parameters", () => {
    expect(render("select {{name}}", { name: "Captain's cannon" })).toBe("select 'Captain''s cannon'");
    expect(() => render("{{missing}}", {})).toThrow();
  });
  it("formats durations from the configured value", () => {
    expect(durationLabel(60)).toBe("1 minute");
    expect(durationLabel(300)).toBe("5 minutes");
    expect(durationLabel(25)).toBe("25 seconds");
  });
});
