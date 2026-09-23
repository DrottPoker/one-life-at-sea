import { describe, expect, it } from "vitest";
import { isAdminRequest, parseAdminRequests } from "../../src/lib/admin-journal";

const request = { id: "11111111-1111-4111-8111-111111111111", action: "update", reason: "Correct a value", payload: { value: 2 } };

describe("saved administrator requests", () => {
  it("preserves valid request values and treats missing storage as empty", () => {
    expect(parseAdminRequests(null)).toEqual([]);
    expect(parseAdminRequests(JSON.stringify([request]))).toEqual([request]);
  });

  it.each([{}, [null], [{ ...request, action: "unknown" }], [{ ...request, reason: {} }], [{ ...request, payload: [] }], [request, request]])(
    "rejects malformed storage instead of treating it as an empty journal: %j", value => {
      expect(() => parseAdminRequests(JSON.stringify(value))).toThrow();
    },
  );

  it("rejects invalid JSON and non-JSON or oversized payloads", () => {
    expect(() => parseAdminRequests("broken")).toThrow();
    expect(isAdminRequest({ ...request, payload: { value: NaN } })).toBe(false);
    expect(isAdminRequest({ ...request, payload: { value: 1n } })).toBe(false);
    expect(isAdminRequest({ ...request, payload: { value: "x".repeat(16001) } })).toBe(false);
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    expect(isAdminRequest({ ...request, payload: cycle })).toBe(false);
  });
});
