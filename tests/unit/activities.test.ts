import { describe, expect, it } from "vitest";
import { activityMessage, parseActivityForm, type ActivityReceipt } from "../../src/lib/activities";
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
  it("reports the actual XP award and level-up", () => {
    const receipt = { skill_id: "fishing", xp_awarded: 10, stamina_cost: 1, level: 2, previous_level: 1 } as ActivityReceipt;
    expect(activityMessage(receipt)).toBe("+10 Fishing XP. Spent 1 Stamina. Fishing reached level 2!");
    expect(activityMessage({ ...receipt, level: 1 })).toBe("+10 Fishing XP. Spent 1 Stamina.");
  });
});
