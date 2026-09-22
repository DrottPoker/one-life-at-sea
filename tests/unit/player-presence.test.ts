import { describe, expect, it } from "vitest";
import { lastActionLabel, nextPresenceRefreshMs, presenceStatus } from "@/lib/player-presence";

const observed = "2026-09-22T12:00:00.000Z";
const ago = (seconds: number) => new Date(Date.parse(observed) - seconds * 1000).toISOString();

describe("profile presence", () => {
  it("keeps active and idle tabs independent and expires leases without a response", () => {
    const snapshot = { online_until: ago(-30), connected_until: ago(-60), last_action_at: ago(3600) };
    expect(presenceStatus(snapshot, observed)).toBe("online");
    expect(presenceStatus(snapshot, observed, 30000)).toBe("idle");
    expect(presenceStatus(snapshot, observed, 60000)).toBe("offline");
    expect(presenceStatus({ online_until: null, connected_until: null, last_action_at: observed }, observed)).toBe("offline");
  });
  it.each([
    [0, "Just now"], [4, "Just now"], [5, "Just now"], [59, "Just now"], [59.999, "Just now"],
    [60, "1 minute ago"], [119, "1 minute ago"], [120, "2 minutes ago"], [3600, "1 hour ago"],
    [7200, "2 hours ago"], [86400, "1 day ago"], [172800, "2 days ago"],
  ])("formats an action %s seconds ago", (seconds, label) => expect(lastActionLabel(ago(seconds), observed)).toBe(label));
  it("updates relative labels on minute boundaries without a second-by-second timer", () => {
    const snapshot = { online_until: null, connected_until: null, last_action_at: observed };
    expect(nextPresenceRefreshMs(snapshot, observed)).toBe(60000);
    expect(nextPresenceRefreshMs(snapshot, observed, 15000)).toBe(45000);
    expect(nextPresenceRefreshMs(snapshot, observed, 59999.5)).toBe(1);
    expect(nextPresenceRefreshMs(snapshot, observed, 60000)).toBe(60000);
    expect(nextPresenceRefreshMs({ ...snapshot, last_action_at: null }, observed)).toBe(60000);
  });
  it("still expires presence leases at their deadlines", () => {
    const snapshot = { online_until: ago(-20), connected_until: ago(-40), last_action_at: observed };
    expect(nextPresenceRefreshMs(snapshot, observed)).toBe(20000);
    expect(nextPresenceRefreshMs(snapshot, observed, 20000)).toBe(20000);
    expect(nextPresenceRefreshMs(snapshot, observed, 40000)).toBe(20000);
    expect(nextPresenceRefreshMs(snapshot, observed, 60000)).toBe(60000);
  });
  it("uses elapsed server time and preserves unknown history", () => {
    expect(lastActionLabel(ago(59), observed, 1000)).toBe("1 minute ago");
    expect(lastActionLabel(ago(-60), observed)).toBe("Just now");
    expect(lastActionLabel(null, observed)).toBe("Not recorded yet");
    expect(lastActionLabel("invalid", observed)).toBe("Not recorded yet");
  });
});
