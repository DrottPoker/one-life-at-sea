import { describe, expect, it } from "vitest";
import { moraleMultiplier, formatMorale, formatMoraleBonus } from "../../src/lib/morale";
import { crewTrainingStatGain, trainingStatGain } from "../../src/lib/training";
import { formRequest, parseEconomyRequest } from "../../src/lib/economy-journal";

describe("Crew Morale", () => {
  it.each([[-100, 0.95], [-50, 0.975], [0, 1], [50, 1.025], [100, 1.05]])(
    "applies the same linear modifier at %s morale", (morale, factor) => {
      expect(moraleMultiplier(morale)).toBeCloseTo(factor, 12);
      expect(moraleMultiplier(morale, "training")).toBeCloseTo(factor, 12);
    },
  );
  it("applies training morale exactly once to the permanent-stat base gain", () => {
    const base = trainingStatGain(10, 1, 5);
    expect(crewTrainingStatGain(10, 1, 5, 0)).toBe(base);
    expect(crewTrainingStatGain(10, 1, 5, 100)).toBe(1.056542);
    expect(crewTrainingStatGain(10, 1, 5, -100)).toBe(0.955919);
    expect(crewTrainingStatGain(1000, 3, 5, 50)).toBe(Math.round(trainingStatGain(1000, 3, 5) * 1.025 * 1e6) / 1e6);
  });
  it("shows one decimal and preserves small modifier percentages", () => {
    expect(formatMorale(0)).toBe("0.0");
    expect(formatMorale(2.5)).toBe("+2.5");
    expect(formatMorale(-100)).toBe("-100.0");
    expect(formatMoraleBonus(25)).toBe("+1.25%");
    expect(formatMoraleBonus(-0.1)).toBe("-0.005%");
  });
  it.each([NaN, Infinity, -Infinity, 100.1, -100.1, 0.01, -1.25])("rejects invalid morale %s", value => {
    expect(() => moraleMultiplier(value)).toThrow(RangeError);
  });
  it("preserves the exact tavern offer and ID for safe retries", () => {
    const form = new FormData();
    form.set("request_id", "a9700000-0000-4000-8000-000000000001");
    form.set("gold_cost", "1000");
    form.set("morale_gain", "25");
    form.set("character_id", "ignored");
    const request = formRequest("tavern", form);
    expect(parseEconomyRequest(JSON.stringify(request))).toEqual({
      kind: "tavern", id: form.get("request_id"),
      fields: { request_id: form.get("request_id"), gold_cost: "1000", morale_gain: "25" },
    });
  });
});
