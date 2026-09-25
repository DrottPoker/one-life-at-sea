import { describe, expect, it } from "vitest";
import { activityMessage, activityOutcome, activityRewards, parseActivityForm, type ActivityReceipt } from "../../src/lib/activities";
import { formRequest, parseEconomyRequest, requestForm } from "../../src/lib/economy-journal";

const fields = { request_id: "a9920000-0000-4000-8000-000000000001", activity_id: "shore_fishing", stamina_cost: "1", xp_gain: "10" };
describe("activity requests", () => {
  it("preserves the complete activity offer through browser recovery", () => {
    const request = formRequest("activity", requestForm(fields));
    expect(parseEconomyRequest(JSON.stringify(request))).toEqual(request);
    expect(parseActivityForm(requestForm(fields))).toEqual({ activity_id: "shore_fishing", expected_stamina_cost: 1, expected_xp_gain: 10 });
  });
  it.each(["-1", "0", "1.5", "NaN", "Infinity", "1e3", "9007199254740992"])("rejects invalid amounts %s", value => {
    expect(parseActivityForm(requestForm({ ...fields, xp_gain: value }))).toBeNull();
    expect(parseActivityForm(requestForm({ ...fields, stamina_cost: value }))).toBeNull();
  });
  it("leaves XP and level-ups to the XP drop and reports the Stamina cost", () => {
    const receipt = { skill_id: "fishing", xp_awarded: 10, stamina_cost: 1, level: 2, previous_level: 1 } as ActivityReceipt;
    expect(activityMessage(receipt)).toBe("Spent 1 Stamina.");
    expect(activityMessage({ ...receipt, level: 1 })).toBe("Spent 1 Stamina.");
  });
});

const receipt = { skill_id: "fishing", xp_awarded: 10, stamina_cost: 1, level: 1, previous_level: 1 } as ActivityReceipt;
const fish = { item_id: "fish", name: "Silver Fish", image_path: "/images/items/placeholder.svg", quantity: 2 };
const ring = { item_id: "ring", name: "Golden Ring", image_path: "/images/items/placeholder.svg", quantity: 1 };
describe("activity reward presentation", () => {
  it("adapts saved single-item receipts with the default image", () => {
    const caught = { ...receipt, loot: { caught: true, item_id: fish.item_id, name: fish.name, quantity: fish.quantity } } as ActivityReceipt;
    expect(activityRewards(caught)).toEqual({ items: [fish], gold_coins: 0 });
    expect(activityOutcome(caught)).toBe("success");
    expect(activityMessage(caught)).toBe("Caught 2 × Silver Fish. Spent 1 Stamina.");
  });
  it("supports several rewards and coins without also rendering legacy loot", () => {
    const multiple = { ...receipt, loot: { caught: true, ...fish }, rewards: { items: [fish, ring], gold_coins: 1251 } } as ActivityReceipt;
    expect(activityRewards(multiple)).toEqual({ items: [fish, ring], gold_coins: 1251 });
    expect(activityMessage(multiple)).toBe("Received 2 × Silver Fish, 1 × Golden Ring. +1,251 Gold Coins. Spent 1 Stamina.");
  });
  it("supports coin-only and XP-only successes", () => {
    expect(activityRewards({ ...receipt, rewards: { gold_coins: 251 } })).toEqual({ items: [], gold_coins: 251 });
    expect(activityRewards(receipt)).toEqual({ items: [], gold_coins: 0 });
    expect(activityOutcome(receipt)).toBe("success");
  });
  it("never displays a reward for a failed outcome", () => {
    const missed = { ...receipt, loot: { caught: false } } as ActivityReceipt;
    expect(activityOutcome(missed)).toBe("failure");
    expect(activityRewards(missed)).toEqual({ items: [], gold_coins: 0 });
    expect(activityRewards({ ...receipt, outcome: "failure", rewards: { items: [fish], gold_coins: 10 } })).toEqual({ items: [], gold_coins: 0 });
    expect(activityMessage(missed)).toBe("Nothing caught. Spent 1 Stamina.");
  });
});
