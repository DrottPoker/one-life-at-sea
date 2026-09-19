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
    ["misspelled key", (c: ReturnType<typeof loadConfig>) => Object.assign(c.gameplay.training, { energyCosts: 7 })],
    ["zero recovery interval", (c: ReturnType<typeof loadConfig>) => { c.gameplay.resources.energyRecoverySeconds = 0; }],
    ["fractional round limit", (c: ReturnType<typeof loadConfig>) => { c.gameplay.combat.maxRounds = 2.5; }],
    ["invalid hit curve", (c: ReturnType<typeof loadConfig>) => { c.gameplay.combat.hitChance.extremeRatio = 1; }],
    ["zero hit exponent", (c: ReturnType<typeof loadConfig>) => { c.gameplay.combat.hitChance.exponent = 0; }],
    ["invalid capacity", (c: ReturnType<typeof loadConfig>) => { c.gameplay.resources.energyMax = 50; }],
    ["unaffordable action", (c: ReturnType<typeof loadConfig>) => { c.gameplay.training.energyCost = 101; }],
    ["invalid deadline", (c: ReturnType<typeof loadConfig>) => { c.gameplay.combat.idleSeconds = 601; }],
    ["invalid boarding range", (c: ReturnType<typeof loadConfig>) => { c.gameplay.combat.boarding.minimumChance = 0.95; }],
    ["invalid ammunition", (c: ReturnType<typeof loadConfig>) => { c.gameplay.combat.ammoPerShot = 11; }],
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
    config.gameplay.training.statGain += 1;
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
