import { frontend } from "@/config/public";

type SnapshotPollerOptions<T> = {
  load: (signal: AbortSignal) => Promise<T>;
  onData: (data: T) => void;
  onError: () => void;
  nextDelay?: (data: T) => number;
};

export function createSnapshotPoller<T>({ load, onData, onError, nextDelay }: SnapshotPollerOptions<T>) {
  let disposed = false;
  let fetching = false;
  let dirty = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let activeRequest: AbortController | undefined;

  function queue(delay: number) {
    clearTimeout(timer);
    timer = setTimeout(() => void refresh(), delay);
  }

  async function refresh() {
    if (disposed) return;
    fetching = true;
    dirty = false;
    let delay = frontend.refresh.fallbackMs;
    const controller = new AbortController();
    activeRequest = controller;
    const timeout = setTimeout(() => controller.abort(new Error("Snapshot request timed out.")), frontend.refresh.requestTimeoutMs);
    const aborted = new Promise<never>((_resolve, reject) => {
      controller.signal.addEventListener("abort", () => reject(controller.signal.reason), { once: true });
    });
    try {
      // The race also releases the queue if a transport ignores its abort signal.
      const data = await Promise.race([load(controller.signal), aborted]);
      if (disposed) return;
      onData(data);
      if (nextDelay) delay = nextDelay(data);
    } catch {
      if (!disposed) onError();
    } finally {
      clearTimeout(timeout);
      activeRequest = undefined;
      fetching = false;
      if (!disposed) queue(dirty ? frontend.refresh.realtimeDebounceMs : delay);
    }
  }

  return {
    schedule() {
      if (disposed) return;
      if (fetching) dirty = true;
      else queue(frontend.refresh.realtimeDebounceMs);
    },
    dispose() {
      disposed = true;
      activeRequest?.abort(new Error("Snapshot poller disposed."));
      clearTimeout(timer);
    },
  };
}

export function snapshotRefreshDelay(deadline: string | null, observedAt: string): number {
  if (!deadline) return frontend.refresh.fallbackMs;
  return Math.max(frontend.refresh.resourceMinimumMs, Math.min(frontend.refresh.fallbackMs,
    Date.parse(deadline) - Date.parse(observedAt) + frontend.refresh.resourceGraceMs));
}
