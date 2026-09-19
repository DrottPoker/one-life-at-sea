import { describe, expect, it } from "vitest";
import { inventoryFilters, inventoryHref, parseItemQuantity } from "../../src/lib/inventory";
import { isHospitalAccessiblePath } from "../../src/lib/hospital";
import { loadConfig, validateConfig, inventoryCatalogSql } from "../../scripts/config/core.mjs";

describe("inventory boundaries", () => {
  it.each(["", "0", "-1", "1.2", "1e2", "Infinity", "NaN", "9007199254740992", null, 1])("rejects invalid item quantity %s", value => {
    expect(parseItemQuantity(value)).toBeNull();
  });
  it("accepts exact whole quantities up to the safe integer boundary", () => {
    expect(parseItemQuantity(" 10 ")).toBe(10);
    expect(parseItemQuantity("9007199254740991")).toBe(Number.MAX_SAFE_INTEGER);
  });
  it("bounds untrusted filters and round-trips a literal search term", () => {
    expect(inventoryFilters({ category: "missing", q: ["a", "b"], page: "-1" })).toEqual({ category: null, query: "", page: 0 });
    expect(inventoryFilters({ category: "medical", q: "x".repeat(110), page: "999999999999" })).toEqual({ category: "medical", query: "x".repeat(100), page: 0 });
    const href = inventoryHref("crew_weapons", "Sailor's % & Cutlass", 2);
    expect(inventoryFilters(Object.fromEntries(new URL(href, "http://localhost").searchParams))).toEqual({
      category: "crew_weapons", query: "Sailor's % & Cutlass", page: 2,
    });
  });
  it("allows only the exact inventory route as a hospital exception", () => {
    expect(isHospitalAccessiblePath("/inventory")).toBe(true);
    expect(isHospitalAccessiblePath("/inventory/trash")).toBe(false);
    expect(isHospitalAccessiblePath("/harbor/bank")).toBe(false);
  });
  it.each([
    (c: ReturnType<typeof loadConfig>) => { c.gameplay.inventory.items[1].id = c.gameplay.inventory.items[0].id; },
    (c: ReturnType<typeof loadConfig>) => { c.gameplay.inventory.items[0].kind = "unknown"; },
    (c: ReturnType<typeof loadConfig>) => { c.gameplay.inventory.items[0].categoryId = "missing"; },
    (c: ReturnType<typeof loadConfig>) => { c.gameplay.inventory.items[0].slot = "none"; },
    (c: ReturnType<typeof loadConfig>) => { c.gameplay.inventory.items[2].slot = "cannons"; },
    (c: ReturnType<typeof loadConfig>) => { c.gameplay.inventory.items[0].imagePath = "https://example.test/item.png"; },
    (c: ReturnType<typeof loadConfig>) => { c.gameplay.inventory.categories[1].id = c.gameplay.inventory.categories[0].id; },
    (c: ReturnType<typeof loadConfig>) => { c.gameplay.inventory.pageSize = 0; },
  ])("rejects incompatible catalog configuration", change => {
    const config = loadConfig(); change(config);
    expect(() => validateConfig(config)).toThrow();
  });
  it("quotes catalog prose and protects SQL dollar delimiters", () => {
    const config = loadConfig();
    config.gameplay.inventory.items[0].description = "Captain's $inventory$ cutlass";
    const sql = inventoryCatalogSql(config);
    expect(sql).toContain("Captain''s $inventory$ cutlass");
    expect(sql).toContain("do $inventory_$");
  });
});
