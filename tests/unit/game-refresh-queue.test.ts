import { describe, expect, it } from "vitest";
import { createGameRefreshQueue } from "../../src/lib/game-refresh-queue";

describe("shared game refresh queue", () => {
  it("discards delayed events already included in a mutation response", () => {
    const queue = createGameRefreshQueue();
    queue.observe(10);
    queue.event(11);
    expect(queue.pending()).toBe(true);
    queue.observe(12);
    expect(queue.pending()).toBe(false);
    queue.event(11);
    expect(queue.pending()).toBe(false);
  });
  it("keeps later writes and explicit recovery requests", () => {
    const queue = createGameRefreshQueue();
    queue.observe(10);
    queue.event(12);
    queue.observe(11);
    expect(queue.pending()).toBe(true);
    queue.take();
    expect(queue.pending()).toBe(false);
    queue.event(13);
    queue.observe(12);
    expect(queue.pending()).toBe(true);
    queue.observe(13);
    queue.request();
    expect(queue.pending()).toBe(true);
  });
  it("handles missing revisions and out-of-order snapshots conservatively", () => {
    const queue = createGameRefreshQueue();
    queue.observe(12);
    queue.observe(10);
    queue.event(11);
    expect(queue.pending()).toBe(false);
    queue.event(null);
    expect(queue.pending()).toBe(true);
  });
});
