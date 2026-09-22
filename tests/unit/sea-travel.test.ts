import { describe, expect, it } from "vitest";
import { navigationRedirect, type NavigationLock } from "../../src/lib/game-navigation";

const target = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const base: NavigationLock = { attack: null, hospital_until: null, sea_state: "in_harbor" };

describe("sea navigation locks", () => {
  it.each(["/harbor", "/harbor/bank", "/harbor/crew-training", "/attack/not-a-captain", "/combatlog/not-a-battle"])("locks %s at a sea stop", path => {
    expect(navigationRedirect(path, { ...base, sea_state: "at_sea" })).toBe("/sea");
  });
  it.each(["/sea", "/inventory", "/characters/" + target, "/attack/" + target, "/combatlog/" + target])("permits %s at a sea stop", path => {
    expect(navigationRedirect(path, { ...base, sea_state: "at_sea" })).toBeNull();
  });
  it.each(["/inventory", "/characters/" + target, "/attack/" + target, "/harbor", "/"])("locks %s while traveling", path => {
    expect(navigationRedirect(path, { ...base, sea_state: "traveling" })).toBe("/sea");
  });
  it("keeps the waiting page and account recovery accessible", () => {
    for (const path of ["/sea", "/notifications", "/combatlog/" + target, "/reset-password", "/auth/callback"]) {
      expect(navigationRedirect(path, { ...base, sea_state: "traveling" })).toBeNull();
    }
  });
  it("retains battle and hospital priority", () => {
    expect(navigationRedirect("/sea", { ...base, attack: { target_id: target, target_player_number: 100001, battle_id: target } })).toBe("/attack/100001");
    expect(navigationRedirect("/sea", { ...base, hospital_until: "2026-12-01Z" })).toBe("/harbor/hospital");
    expect(navigationRedirect("/inventory", { ...base, hospital_until: "2026-12-01Z" })).toBeNull();
    expect(navigationRedirect("/harbor/bank", base)).toBeNull();
  });
});
