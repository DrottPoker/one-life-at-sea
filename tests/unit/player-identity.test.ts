import { describe, expect, it } from "vitest";
import { isPlayerNumber, isPlayerProfilePath, playerSearchUrl } from "../../src/lib/player-identity";
import { isHospitalAccessiblePath } from "../../src/lib/hospital";
import { isSeaAccessiblePath } from "../../src/lib/sea-travel";
import { navigationRedirect } from "../../src/lib/game-navigation";

describe("public player identity", () => {
  it.each(["100001", "100002", "999999", "1000000", "9007199254740991"])("accepts canonical player number %s", value => {
    expect(isPlayerNumber(value)).toBe(true);
  });
  it.each(["100000", "0100001", "#100001", "1e6", "100001.0", "100001/other", " 100001", "9007199254740992", "", 100001, null])("rejects noncanonical or unsafe number %s", value => {
    expect(isPlayerNumber(value)).toBe(false);
  });
  it("encodes ID searches without turning # into a URL fragment", () => {
    expect(playerSearchUrl("#100001", 1)).toBe("/players?q=%23100001&page=1");
  });
  it("allows the directory and profiles wherever profiles are available", () => {
    for (const path of ["/players", "/players/100001"]) {
      expect(isHospitalAccessiblePath(path)).toBe(true);
      expect(isSeaAccessiblePath(path, "at_sea")).toBe(true);
      expect(isSeaAccessiblePath(path, "traveling")).toBe(false);
    }
    expect(isPlayerProfilePath("/players/100001/extra")).toBe(false);
    expect(isHospitalAccessiblePath("/players/0")).toBe(false);
    expect(isSeaAccessiblePath("/attack/100001", "at_sea")).toBe(true);
    expect(isSeaAccessiblePath("/attack/100000", "at_sea")).toBe(false);
  });
  it("keeps battle locks on the numeric route and lets legacy links resolve", () => {
    const target = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const lock = { hospital_until: null, sea_state: "at_sea" as const,
      attack: { target_id: target, target_player_number: 100001, battle_id: target } };
    expect(navigationRedirect("/players", lock)).toBe("/attack/100001");
    expect(navigationRedirect("/attack/100001", lock)).toBeNull();
    expect(navigationRedirect("/attack/" + target, lock)).toBeNull();
    expect(navigationRedirect("/attack/100002", lock)).toBe("/attack/100001");
  });
});
