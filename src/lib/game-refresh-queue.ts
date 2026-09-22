// A confirmed snapshot covers older realtime events, including our own writes.
export function createGameRefreshQueue() {
  let observed = -1, latest = -1, forced = false;
  return {
    observe(revision: number | null) { if (revision !== null) observed = Math.max(observed, revision); },
    event(revision: number | null) { if (revision === null) forced = true; else latest = Math.max(latest, revision); },
    request() { forced = true; },
    pending() { return forced || latest > observed; },
    take() { forced = false; latest = -1; },
  };
}
