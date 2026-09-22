import { describe, expect, it } from "vitest";
import { gameplay } from "../../src/config/public";
import { MAX_CHARACTER_LEVEL, MAX_SKILL_LEVEL, skillProgress } from "../../src/lib/skills";

describe("classic skill progression", () => {
  it.each([[1,0],[2,83],[3,174],[10,1154],[50,101333],[92,6517253],[99,13034431]])("matches level %i at %i XP", (level, xp) => {
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
    expect(skillProgress(100)).toMatchObject({ level: 2, nextXp: 174, remaining: 74 });
    expect(skillProgress(100).percent).toBeCloseTo(17 / 91 * 100);
    expect(skillProgress(13034431)).toMatchObject({ level: 99, nextXp: null, remaining: 0, percent: 100 });
    expect(skillProgress(Number.MAX_SAFE_INTEGER).level).toBe(99);
    expect(MAX_SKILL_LEVEL).toBe(99);
    expect(MAX_CHARACTER_LEVEL).toBe(693);
  });
  it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])("rejects invalid XP %s", xp => {
    expect(() => skillProgress(xp)).toThrow(RangeError);
  });
});
