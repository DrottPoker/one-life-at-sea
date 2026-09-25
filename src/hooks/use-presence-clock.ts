"use client";

import { useEffect, useState } from "react";
import { lastActionLabel, nextPresenceRefreshMs, presenceStatus, type PlayerPresence } from "@/lib/player-presence";

// Ages a presence snapshot locally so status and last action change without a new request.
export function usePresenceClock(presence: PlayerPresence, observedAt: string) {
  const [elapsed, setElapsed] = useState({ anchor: observedAt, milliseconds: 0 });
  useEffect(() => {
    const start = performance.now();
    let timer: ReturnType<typeof setTimeout>;
    function schedule() {
      timer = setTimeout(() => {
        setElapsed({ anchor: observedAt, milliseconds: performance.now() - start });
        schedule();
      }, nextPresenceRefreshMs(presence, observedAt, performance.now() - start));
    }
    schedule();
    return () => clearTimeout(timer);
  }, [observedAt, presence]);
  const milliseconds = elapsed.anchor === observedAt ? elapsed.milliseconds : 0;
  return { status: presenceStatus(presence, observedAt, milliseconds), lastAction: lastActionLabel(presence.last_action_at, observedAt, milliseconds) };
}
