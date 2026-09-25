import { describe, expect, it } from "vitest";
import { craftingMessage, parseCraftingForm } from "../../src/lib/crafting";
import { formRequest, parseEconomyRequest, requestForm } from "../../src/lib/economy-journal";

const fields = { request_id: "a9940000-0000-4000-8000-000000000001", recipe_id: "oak_plank", expected_version: "a".repeat(64) };

describe("crafting requests", () => {
  it("retains the exact recipe offer through browser recovery", () => {
    const request = formRequest("crafting", requestForm({ ...fields, output_quantity: "999" }));
    expect(parseEconomyRequest(JSON.stringify(request))).toEqual({ kind: "crafting", id: fields.request_id, fields });
    expect(parseCraftingForm(requestForm(request.fields))).toEqual({ recipe_id: fields.recipe_id, expected_version: fields.expected_version });
  });
  it.each([{ recipe_id: "" }, { recipe_id: "x".repeat(49) }, { recipe_id: "Oak Plank" }, { expected_version: "old" }, { expected_version: "g".repeat(64) }])("rejects malformed offers %j", change => {
    expect(parseCraftingForm(requestForm({ ...fields, ...change }))).toBeNull();
  });
  it("leaves awarded Crafting XP and level-ups to the XP drop", () => {
    expect(craftingMessage({ recipe_id: "oak_plank", recipe_name: "Oak Plank", output: { item_id: "oak_planks", name: "Oak Planks", quantity: 1 },
      consumed: [{ item_id: "oak_logs", name: "Oak Logs", quantity: 5 }],
      progression: { xp_awarded: 10, xp: 200, previous_level: 1, level: 2, character_level: 8 } }))
      .toBe("Crafted 1 × Oak Plank. Used 5 × Oak Logs.");
  });
  it("formats the confirmed output and all consumed materials", () => {
    expect(craftingMessage({ recipe_id: "oak_plank", recipe_name: "Oak Plank", output: { item_id: "oak_planks", name: "Oak Planks", quantity: 1 },
      consumed: [{ item_id: "oak_logs", name: "Oak Logs", quantity: 5 }] })).toBe("Crafted 1 × Oak Plank. Used 5 × Oak Logs.");
  });
});
