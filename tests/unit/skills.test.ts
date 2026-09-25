import { describe, expect, it } from "vitest";
import { gameplay } from "../../src/config/public";
import { MAX_CHARACTER_LEVEL, MAX_SKILL_LEVEL, battlingHealthBonus, skillProgress } from "../../src/lib/skills";

describe("rebalanced skill progression", () => {
  it.each([[1,0],[2,200],[3,416],[10,2495],[50,105265],[92,2704683],[99,4630405],[100,5000000]])("matches level %i at %i XP", (level, xp) => {
    expect(gameplay.skills.xpThresholds[level - 1]).toBe(xp);
    expect(skillProgress(xp).level).toBe(level);
  });
  it("handles every exact boundary, including multiple levels in one award", () => {
    for (const [index, xp] of gameplay.skills.xpThresholds.entries()) {
      expect(skillProgress(xp).level).toBe(index + 1);
      if (index) expect(skillProgress(xp - 1).level).toBe(index);
    }
  });
  it("shows progress within the current level", () => {
    expect(skillProgress(250)).toMatchObject({ level: 2, nextXp: 416, remaining: 166 });
    expect(skillProgress(250).percent).toBeCloseTo(50 / 216 * 100);
    expect(skillProgress(5000000)).toMatchObject({ level: 100, nextXp: null, remaining: 0, percent: 100 });
    expect(skillProgress(Number.MAX_SAFE_INTEGER).level).toBe(100);
    expect(MAX_SKILL_LEVEL).toBe(100);
    expect(MAX_CHARACTER_LEVEL).toBe(700);
  });
  it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])("rejects invalid XP %s", xp => {
    expect(() => skillProgress(xp)).toThrow(RangeError);
  });
});

describe("battling health bonus", () => {
  it.each([[1, 0], [2, 2], [3, 3], [4, 4], [10, 10], [100, 100]])("level %i adds %i maximum health", (level, bonus) => {
    expect(battlingHealthBonus(level)).toBe(bonus * gameplay.skills.battlingHealthPerLevel);
  });
  it("equals the level from level two without stacking earlier levels", () => {
    for (let level = 2; level <= MAX_SKILL_LEVEL; level++) expect(battlingHealthBonus(level)).toBe(level * gameplay.skills.battlingHealthPerLevel);
  });
  it.each([0, 101, 1.5, NaN])("rejects invalid level %s", level => {
    expect(() => battlingHealthBonus(level)).toThrow(RangeError);
  });
});
