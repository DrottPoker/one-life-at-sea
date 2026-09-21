import { describe, expect, it } from "vitest";
import { formatStat, formatStatGain } from "../../src/lib/format";
import { parseShipEnergy, trainingStatGain } from "../../src/lib/training";

describe("variable ship work", () => {
  it.each(["", "0", "1", "4", "-5", "5.5", "1e1", "101", "9007199254740991", null, 5])("rejects invalid Energy %s", value => {
    expect(parseShipEnergy(value)).toBeNull();
  });
  it("accepts whole Energy from the minimum to the cap", () => {
    for (const amount of [5, 6, 37, 100]) expect(parseShipEnergy(String(amount))).toBe(amount);
  });
});

describe("stat-dependent training", () => {
  it.each([
    [10, 1, 5, 1.00623], [10, 1, 6, 1.207548], [10, 1.15, 25, 5.793975],
    [10, 1, 50, 10.089358], [10, 1, 100, 20.23895],
    [1000, 1, 5, 1.515992], [1000000, 3, 5, 189.409355],
  ])("matches server reference vectors (%s, %s, %s)", (stat, efficiency, energy, expected) => {
    expect(trainingStatGain(stat, efficiency, energy)).toBe(expected);
  });
  it.each([10, 1000, 1000000])("keeps sequential job partitions equivalent at stat %s", stat => {
    for (const efficiency of [1, 1.15, 3]) {
      const total = trainingStatGain(stat, efficiency, 100);
      for (const partition of [[50, 50], [5, 6, 7, 32, 50], Array(20).fill(5)]) {
        let gained = 0;
        for (const energy of partition) gained = Math.round((gained + trainingStatGain(stat + gained, efficiency, energy)) * 1e6) / 1e6;
        expect(gained).toBe(total);
      }
    }
  });
  it("increases absolute gains while reducing percentage growth at higher stats", () => {
    for (const stat of [10, 100, 1000, 10000, 100000]) {
      const lower = trainingStatGain(stat, 1, 5), higher = trainingStatGain(stat * 10, 1, 5);
      expect(higher).toBeGreaterThan(lower);
      expect(higher / (stat * 10)).toBeLessThan(lower / stat);
      expect(trainingStatGain(stat, 3, 5)).toBeGreaterThan(lower);
    }
  });
  it.each([[NaN, 1, 5], [0, 1, 5], [10, Infinity, 5], [10, 0, 5], [10, 1, 0], [10, 1, 5.5], [10, 1, 101]])(
    "rejects invalid preview input (%s, %s, %s)", (stat, efficiency, energy) => {
      expect(() => trainingStatGain(stat, efficiency, energy)).toThrow(RangeError);
    });
  it.each([[10, "10"], [11.00623, "11.01"], [9999.994, "9,999.99"], [9999.999, "10,000"], [10000, "10,000"], [10000.49, "10,000"], [10000.5, "10,001"]])("formats owned stat %s at the display threshold", (value, expected) => {
    expect(formatStat(value)).toBe(expected);
  });
  it.each([[1, "1"], [1.00623, "1.01"], [1.2, "1.2"], [10000.123456, "10,000.12"], [10000.999, "10,001"]])("keeps at most two decimals on gains, even above 10000 (%s)", (value, expected) => {
    expect(formatStatGain(value)).toBe(expected);
  });
});
