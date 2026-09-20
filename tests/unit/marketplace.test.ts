import { describe, expect, it } from "vitest";
import { affordableQuantity, isMarketCommand, marketCost, marketFee, marketFilters, marketHref } from "../../src/lib/marketplace";

const id = "a8600000-0000-4000-8000-000000000001";
describe("market boundaries", () => {
  it.each([[0, 1], [-1, 1], [1.5, 1], [1, 0], [1, 1.5], [Infinity, 1], [2, Number.MAX_SAFE_INTEGER]])("rejects unsafe cost %s x %s", (quantity, price) => {
    expect(marketCost(quantity, price)).toBeNull();
  });
  it("keeps money exact at the safe integer boundary", () => {
    expect(marketCost(1, Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER);
    expect(marketCost(7, 13)).toBe(91);
    expect(marketFee(Number.MAX_SAFE_INTEGER)).toBe(450359962737049);
    expect(affordableQuantity(19, 10, 5)).toBe(1);
    expect(affordableQuantity(100, 10, 3)).toBe(3);
  });
  it("requires whole quantities, unique entries and stable request IDs", () => {
    const entry = { entry_id: id, entry_type: "stack", quantity: 1, unit_price: 1 };
    expect(isMarketCommand({ action: "create", entries: [entry], request_id: id })).toBe(true);
    expect(isMarketCommand({ action: "create", entries: [entry, { ...entry, entry_id: id.toUpperCase() }], request_id: id })).toBe(false);
    expect(isMarketCommand({ action: "create", entries: [{ ...entry, entry_type: "instance", quantity: 2 }], request_id: id })).toBe(false);
    expect(isMarketCommand({ action: "buy", listing_id: id, quantity: 0.5, expected_unit_price: 1, request_id: id })).toBe(false);
    expect(isMarketCommand({ action: "cancel", listing_id: id, request_id: "bad" })).toBe(false);
  });
  it("retains category and literal query when paging between market views", () => {
    const url = new URL(marketHref("add", "crew_weapons", "Sailor's % & Cutlass", 2), "http://localhost");
    expect(url.pathname).toBe("/harbor/marketplace/add");
    expect(marketFilters(Object.fromEntries(url.searchParams))).toEqual({ category: "crew_weapons", query: "Sailor's % & Cutlass", page: 2 });
  });
});
