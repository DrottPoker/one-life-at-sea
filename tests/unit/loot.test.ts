import { describe, expect, it } from "vitest";
import { catchChance, itemIdentifier, lootChances, lootValidation, type LootEntry } from "../../src/lib/loot";
import { activityMessage, type ActivityReceipt } from "../../src/lib/activities";

const entry = (item_id: string, patch: Partial<LootEntry>): LootEntry => ({ item_id, mode: "weighted", fixed_chance: 0, weight_start: 10, weight_end: 10, quantity: 1, ...patch });
const entries = [entry("ring", { mode: "fixed", fixed_chance: 1, weight_start: 0, weight_end: 0 }), entry("small_fish", { weight_start: 90, weight_end: 10 }), entry("big_fish", { weight_start: 10, weight_end: 90 })];
describe("loot probabilities", () => {
  it("generates usable identifiers for numeric names and reserved page names", () => {
    expect(itemIdentifier("New")).toBe("new_item");
    expect(itemIdentifier("123 Fish")).toBe("item_123_fish");
    expect(itemIdentifier("Ål")).toBe("al");
    expect(itemIdentifier("⚓")).toBe("item");
    expect(itemIdentifier("")).toBe("");
  });
  it("keeps fixed chances independent of level and normalizes only the remainder", () => {
    for (let level = 1; level <= 100; level++) {
      const chances = lootChances(entries, level);
      expect(chances[0].chance).toBe(1);
      expect(chances.reduce((sum, item) => sum + item.chance, 0)).toBeCloseTo(100, 10);
    }
    expect(lootChances(entries, 1)[1].chance).toBeCloseTo(89.1);
    expect(lootChances(entries, 100)[1].chance).toBeCloseTo(9.9);
    expect(lootChances(entries, 50.5)[1].chance).toBeCloseTo(49.5);
  });
  it("does not dilute later fixed items with earlier fixed items", () => {
    const result = lootChances([...entries, entry("coin", { mode: "fixed", fixed_chance: 5, weight_start: 0, weight_end: 0 })], 50.5);
    expect(result[0].chance).toBe(1); expect(result[3].chance).toBe(5);
    expect(result[1].chance).toBe(47);
  });
  it("uses independent site difficulty and caps both curves at mastery", () => {
    const cliffs = { success_start: 30, success_end: 90, mastery_level: 50 };
    expect(catchChance(cliffs, 1)).toBe(30); expect(catchChance(cliffs, 50)).toBe(90); expect(catchChance(cliffs, 99)).toBe(90);
    expect(lootChances(entries, 50, 50)).toEqual(lootChances(entries, 99, 50));
    expect(catchChance({ ...cliffs, success_start: 0, success_end: 0 }, 99)).toBe(0);
  });
  it("rejects ambiguous or incomplete loot tables", () => {
    expect(lootValidation(entries)).toBeNull();
    expect(lootValidation([])).toMatch(/at least/);
    expect(lootValidation([...entries, entries[1]])).toMatch(/only once/);
    expect(lootValidation([entries[0]])).toMatch(/remaining chance/);
    expect(lootValidation([entry("ring", { mode: "fixed", fixed_chance: 100 })])).toBeNull();
    expect(lootValidation([entry("ring", { mode: "fixed", fixed_chance: 80 }), entry("coin", { mode: "fixed", fixed_chance: 40 })])).toMatch(/more than 100/);
    expect(lootValidation([entry("fish", { weight_start: 0 })])).toMatch(/remaining chance/);
    expect(lootValidation([entry("fish", { quantity: 1.2 })])).toMatch(/whole number/);
    expect(lootValidation([entry("fish", { weight_end: Infinity })])).toMatch(/valid numbers/);
  });
  it("reports saved catch or failure and preserves older receipt messages", () => {
    const receipt = { skill_id: "fishing", xp_awarded: 10, stamina_cost: 1, level: 1, previous_level: 1 } as ActivityReceipt;
    const loot = { caught: true, table_id: "shore", table_version: "v", skill_level: 1, success_chance: 70, name: "Sardine", quantity: 1 };
    expect(activityMessage({ ...receipt, loot })).toBe("Caught 1 × Sardine. Spent 1 Stamina.");
    expect(activityMessage({ ...receipt, loot: { ...loot, caught: false } })).toBe("Nothing caught. Spent 1 Stamina.");
    expect(activityMessage(receipt)).toBe("Spent 1 Stamina.");
  });
});
