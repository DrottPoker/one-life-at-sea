import { describe, expect, it } from "vitest";
import { remainingSeconds, formatCountdown } from "../../src/lib/time";

describe("server-anchored countdowns", () => {
  it("uses server timestamps and monotonic elapsed time", () => {
    const observed = "2026-09-20T00:00:00Z", deadline = "2026-09-20T00:05:00Z";
    expect(remainingSeconds(deadline, observed)).toBe(300);
    expect(remainingSeconds(deadline, observed, 1500)).toBe(299);
    expect(remainingSeconds(deadline, observed, 300001)).toBe(0);
    expect(remainingSeconds(observed, deadline)).toBe(0);
  });
  it("formats a new observation immediately with padded seconds", () => {
    expect(formatCountdown(remainingSeconds("2026-09-20T00:05:00Z", "2026-09-20T00:03:58Z"))).toBe("1:02");
    expect(formatCountdown(0)).toBe("0:00");
  });
});
