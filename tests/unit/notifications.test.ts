import { describe, expect, it } from "vitest";
import { isNotificationId, notificationContent, type PlayerNotification } from "../../src/lib/notifications";
import { isHospitalAccessiblePath } from "../../src/lib/hospital";
import { isSeaAccessiblePath } from "../../src/lib/sea-travel";

const battle = "a9970000-0000-4000-8000-000000000011";
const notification: PlayerNotification = { id: "1", kind: "combat.attacked", created_at: "2026-09-22T12:00:00Z", read_at: null,
  payload: { version: 1, battle_id: battle, hospitalized: false, attackers: [
    { name: "First", player_number: 100001 }, { name: "Second", player_number: 100002 }, { name: "Third", player_number: 100003 },
  ] } };
describe("notifications", () => {
  it("links every attacker and the completed combat log", () => {
    expect(notificationContent(notification)).toEqual({ actors: [
      { name: "First", href: "/players/100001" }, { name: "Second", href: "/players/100002" }, { name: "Third", href: "/players/100003" },
    ], text: "attacked you", href: "/combatlog/" + battle, linkLabel: "View combat log" });
    expect(notificationContent({ ...notification, payload: { ...notification.payload, hospitalized: true } }).text).toBe("attacked and hospitalized you");
  });
  it("reports attacker defeat for both solo and group attacks", () => {
    for (const attackers of [notification.payload.attackers, [{ name: "Solo", player_number: 100001 }]]) {
      expect(notificationContent({ ...notification, payload: { ...notification.payload, attackers, outcome: "defended" } }).text)
        .toBe("attacked you but lost");
    }
  });
  it.each(["retreated", "draw", undefined])("does not label %s as a defeat", outcome => {
    expect(notificationContent({ ...notification, payload: { ...notification.payload, outcome } }).text).toBe("attacked you");
  });
  it("handles future kinds and unsupported versions without unsafe links", () => {
    for (const value of [{ ...notification, kind: "test.future" }, { ...notification, kind: "constructor" },
      { ...notification, payload: { ...notification.payload, version: 2 } },
      { ...notification, payload: { ...notification.payload, battle_id: "javascript:alert(1)" } }]) {
      expect(notificationContent(value)).toEqual({ actors: [], text: "You have a new notification.", href: null });
    }
  });
  it("keeps historical names when a profile number is unavailable", () => {
    expect(notificationContent({ ...notification, payload: { ...notification.payload, attackers: [{ name: "Deleted", player_number: null }] } }).actors)
      .toEqual([{ name: "Deleted", href: null }]);
  });
  it.each(["1", "9007199254740992", "9223372036854775807"])("preserves bigint cursor %s exactly", id => expect(isNotificationId(id)).toBe(true));
  it.each([null, 1, "0", "-1", "1.2", "1e2", "01", "9223372036854775808", "<script>"])("rejects cursor %s", id => expect(isNotificationId(id)).toBe(false));
  it("keeps notifications and their reports accessible in Hospital and while traveling", () => {
    for (const path of ["/notifications", "/combatlog/" + battle]) {
      expect(isHospitalAccessiblePath(path)).toBe(true);
      expect(isSeaAccessiblePath(path, "traveling")).toBe(true);
      expect(isSeaAccessiblePath(path, "at_sea")).toBe(true);
    }
    expect(isHospitalAccessiblePath("/combatlog/not-a-uuid")).toBe(false);
  });
});
