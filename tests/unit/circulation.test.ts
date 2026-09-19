import { describe, expect, it } from "vitest";
import { circulationGeometry, circulationPeriods, formatCirculation, nearestCirculationPoint, type CirculationHistory } from "../../src/lib/circulation";

const history = (values: string[]): CirculationHistory => ({
  item_id: "cutlass", period: "all", total: values.at(-1)!, tracked_since: "2026-01-01T00:00:00Z",
  from: "2026-01-01T00:00:00Z", to: "2026-01-04T00:00:00Z", sampled: false,
  points: values.map((total, i) => ({ at: "2026-01-0" + (i + 1) + "T00:00:00Z", total })),
});
describe("circulation chart", () => {
  it("offers the six periods with all-time support", () => {
    expect(circulationPeriods.map(p => p.id)).toEqual(["1m","3m","6m","1y","3y","all"]);
  });
  it("formats counts without losing integer precision", () => {
    expect(formatCirculation("18014398509481982")).toBe("18,014,398,509,481,982");
  });
  it("finds the closest real observation and clamps beyond either endpoint", () => {
    const points = history(["1","5","10","12"]).points;
    expect(nearestCirculationPoint(points, Date.parse("2025-01-01"))).toBe(0);
    expect(nearestCirculationPoint(points, Date.parse("2027-01-01"))).toBe(3);
    expect(nearestCirculationPoint(points, Date.parse("2026-01-02T18:00Z"))).toBe(2);
    expect(nearestCirculationPoint(points, Date.parse("2026-01-02T04:00Z"))).toBe(1);
  });
  it.each([["0","0","0","0"],["10","10","10","10"],["8","0","4","12"],["18014398509481982","18014398509481983","18014398509481984","18014398509481985"]])("plots bounded exact counts including flat and large series", (...values) => {
    const graph = circulationGeometry(history(values), 320);
    expect(graph.points[0].x).toBe(graph.left);
    expect(graph.points.at(-1)!.x).toBe(graph.right);
    expect(graph.line).not.toMatch(/NaN|Infinity/);
    expect(graph.points.every(p => p.y >= graph.top && p.y <= graph.bottom)).toBe(true);
    expect(graph.yTicks.length).toBeGreaterThan(1);
  });
  it("shows same-millisecond histories without dividing by zero", () => {
    const data = history(["2","2"]); data.to = data.from; data.points[1].at = data.from;
    const graph = circulationGeometry(data, 280);
    expect(graph.points[0].x).toBe(graph.left);
    expect(graph.points[1].x).toBe(graph.right);
    expect(graph.line).not.toMatch(/NaN|Infinity/);
  });
  it("uses fewer date labels on small screens", () => {
    expect(circulationGeometry(history(["0","1","2","3"]),320).xTicks).toHaveLength(2);
    expect(circulationGeometry(history(["0","1","2","3"]),900).xTicks).toHaveLength(4);
  });
});
