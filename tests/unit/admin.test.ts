import { describe, expect, it } from "vitest";
import { adminPageNumber, changedValues, rowKey, type AdminResource } from "../../src/lib/admin";

describe("admin data boundaries", () => {
  it("keeps large database values and NULL distinct from empty strings", () => {
    expect(changedValues({ quantity: "9007199254740991", hospital_until: null, name: "captain" },
      { quantity: "9007199254740990", hospital_until: "", name: "captain" }))
      .toEqual({ quantity: "9007199254740990", hospital_until: "" });
  });
  it("identifies composite keys without including editable or user-supplied extra values", () => {
    const resource = { columns: [{ name: "character_id", primary: true }, { name: "training_group", primary: true }, { name: "xp", primary: false }] } as AdminResource;
    expect(rowKey(resource, { version: "v", values: { character_id: "captain", training_group: "crew", xp: "100" } }))
      .toEqual({ character_id: "captain", training_group: "crew" });
  });
  it("bounds pagination before the database integer conversion", () => {
    for (const input of [undefined, "-1", "1.5", "Infinity", "2147483648", "99999999999999999999"]) expect(adminPageNumber(input)).toBe(0);
    expect(adminPageNumber("2147483647")).toBe(2147483647);
    expect(adminPageNumber("2")).toBe(2);
  });
});

