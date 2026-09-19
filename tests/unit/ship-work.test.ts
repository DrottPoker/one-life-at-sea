import { describe, expect, it } from "vitest";
import { formatStat, parseShipEnergy, shipStatGain } from "../../src/lib/training";

describe("variable ship work", () => {
  it.each(["", "0", "1", "4", "-5", "5.5", "1e1", "101", "9007199254740991", null, 5])("rejects invalid Energy %s", value => {
    expect(parseShipEnergy(value)).toBeNull();
  });
  it("accepts whole Energy from the minimum to the cap", () => {
    for (const amount of [5, 6, 37, 100]) expect(parseShipEnergy(String(amount))).toBe(amount);
  });
  it("preserves fractional gains and equal efficiency across work sizes", () => {
    expect(shipStatGain(1, 6)).toBe(1.2);
    expect(shipStatGain(2, 7)).toBe(2.8);
    expect(shipStatGain(1, 6) + shipStatGain(1, 7)).toBeCloseTo(shipStatGain(1, 13), 12);
    expect(shipStatGain(1500, 100)).toBe(30000);
    expect(formatStat(11.2)).toBe("11.2");
    expect(formatStat(10)).toBe("10");
  });
});
