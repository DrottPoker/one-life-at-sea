import { afterEach, describe, expect, it, vi } from "vitest";
import { createSnapshotPoller, snapshotRefreshDelay } from "../../src/lib/snapshot-poller";
import { frontend } from "../../src/config/public";

afterEach(() => vi.useRealTimers());

describe("snapshot refresh lifecycle", () => {
  it("coalesces events and serializes an update arriving during a request", async () => {
    vi.useFakeTimers();
    let resolve!: (value: string) => void;
    const load = vi.fn().mockImplementationOnce(() => new Promise<string>(done => { resolve = done; })).mockResolvedValue("latest");
    const onData = vi.fn(), onError = vi.fn();
    const poller = createSnapshotPoller({ load, onData, onError });
    try {
      poller.schedule(); poller.schedule();
      await vi.advanceTimersByTimeAsync(frontend.refresh.realtimeDebounceMs);
      expect(load).toHaveBeenCalledTimes(1);
      poller.schedule(); poller.schedule();
      await vi.advanceTimersByTimeAsync(frontend.refresh.fallbackMs);
      expect(load).toHaveBeenCalledTimes(1);
      resolve("first");
      await vi.advanceTimersByTimeAsync(frontend.refresh.realtimeDebounceMs);
      expect(load).toHaveBeenCalledTimes(2);
      expect(onData.mock.calls.map(([value]) => value)).toEqual(["first", "latest"]);
      expect(onError).not.toHaveBeenCalled();
    } finally { poller.dispose(); }
  });

  it("aborts requests and ignores late results when the view changes", async () => {
    vi.useFakeTimers();
    let resolve!: (value: string) => void;
    let signal: AbortSignal | undefined;
    const load = vi.fn((requestSignal: AbortSignal) => {
      signal = requestSignal;
      return new Promise<string>(done => { resolve = done; });
    });
    const onData = vi.fn(), onError = vi.fn();
    const poller = createSnapshotPoller({ load, onData, onError });
    poller.schedule();
    await vi.advanceTimersByTimeAsync(frontend.refresh.realtimeDebounceMs);
    poller.dispose();
    expect(signal?.aborted).toBe(true);
    resolve("stale");
    poller.schedule();
    await vi.advanceTimersByTimeAsync(frontend.refresh.fallbackMs);
    expect(load).toHaveBeenCalledTimes(1);
    expect(onData).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("recovers from failures and refreshes at the next server deadline", async () => {
    vi.useFakeTimers();
    const load = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue("recovered");
    const onData = vi.fn(), onError = vi.fn();
    const poller = createSnapshotPoller({ load, onData, onError, nextDelay: () => 500 });
    try {
      poller.schedule();
      await vi.advanceTimersByTimeAsync(frontend.refresh.realtimeDebounceMs);
      expect(onError).toHaveBeenCalledTimes(1);
      expect(onData).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(frontend.refresh.fallbackMs);
      expect(onData).toHaveBeenCalledWith("recovered");
      await vi.advanceTimersByTimeAsync(500);
      expect(load).toHaveBeenCalledTimes(3);
    } finally { poller.dispose(); }
  });

  it("bounds refresh deadlines and keeps periodic recovery without a deadline", () => {
    const now = "2026-09-20T00:00:00Z";
    expect(snapshotRefreshDelay(null, now)).toBe(frontend.refresh.fallbackMs);
    expect(snapshotRefreshDelay(now, now)).toBe(frontend.refresh.resourceMinimumMs);
    expect(snapshotRefreshDelay("2026-09-20T00:00:02Z", now)).toBe(2000 + frontend.refresh.resourceGraceMs);
    expect(snapshotRefreshDelay("2026-09-20T01:00:00Z", now)).toBe(frontend.refresh.fallbackMs);
  });
});
