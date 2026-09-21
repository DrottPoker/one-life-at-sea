import { describe, expect, it } from "vitest";
import { worldTimeAt } from "../../src/lib/world-time";

describe("UTC world day and night", () => {
  it.each([
    ["2026-09-21T05:59:59.999Z", "night", "2026-09-21T06:00:00.000Z"],
    ["2026-09-21T06:00:00.000Z", "day", "2026-09-21T21:00:00.000Z"],
    ["2026-09-21T20:59:59.999Z", "day", "2026-09-21T21:00:00.000Z"],
    ["2026-09-21T21:00:00.000Z", "night", "2026-09-22T06:00:00.000Z"],
    ["2026-09-22T00:00:00.000Z", "night", "2026-09-22T06:00:00.000Z"],
    ["2026-12-31T23:59:59.999Z", "night", "2027-01-01T06:00:00.000Z"],
    ["2028-02-29T21:00:00.000Z", "night", "2028-03-01T06:00:00.000Z"],
    ["2026-09-21T23:00:00+02:00", "night", "2026-09-22T06:00:00.000Z"],
  ])("%s is %s until %s", (timestamp, period, next) => {
    expect(worldTimeAt(Date.parse(timestamp))).toEqual({
      observed_at: new Date(timestamp).toISOString(), period, next_change_at: next,
    });
  });
  it("does not let a missing timestamp silently select a period", () => {
    expect(() => worldTimeAt(NaN)).toThrow();
  });
});
