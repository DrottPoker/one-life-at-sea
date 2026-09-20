import { describe, expect, it } from "vitest";
import { itemHistoryGeometry, formatHistoryValue, type ItemHistory } from "../../src/lib/item-history";

const history = (values: (string | null)[]): ItemHistory => ({
  item_id: "cutlass", period: "all", total: values.at(-1) ?? null, tracked_since: "2026-01-01T00:00:00Z",
  from: "2026-01-01T00:00:00Z", to: "2026-01-04T00:00:00Z", sampled: false,
  points: values.map((total, i) => ({ at: "2026-01-0" + (i + 1) + "T00:00:00Z", total })),
});
describe("market value chart", () => {
  it("distinguishes unavailable values from zero and preserves integer precision", () => {
    expect(formatHistoryValue(null)).toBe("N/A");
    expect(formatHistoryValue("0")).toBe("0");
    expect(formatHistoryValue("9007199254740991")).toBe("9,007,199,254,740,991");
  });
  it("does not invent zero values for explicitly missing observations", () => {
    const graph = itemHistoryGeometry(history(["190", null, "400", "300"]), 600);
    expect(graph.line.match(/M /g)).toHaveLength(2);
    expect(graph.area.match(/ Z/g)).toHaveLength(2);
    expect(graph.line).not.toContain("V " + graph.bottom);
    expect(graph.line).toContain(" H " + graph.points[1].x);
  });
  it.each([[], [null, null, null, null]])("handles missing data without an invented curve", (...values) => {
    const graph = itemHistoryGeometry(history(values), 320);
    expect(graph.line).toBe("");
    expect(graph.area).toBe("");
    expect(JSON.stringify(graph)).not.toMatch(/NaN|Infinity/);
  });
});
