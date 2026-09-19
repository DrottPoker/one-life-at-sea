"use client";

import { useEffect, useState } from "react";
import { frontend } from "@/config/public";
import { remainingSeconds } from "@/lib/time";

export function useServerCountdown(deadline: string, observedAt: string): number {
  const [elapsed, setElapsed] = useState({ anchor: observedAt, milliseconds: 0 });
  useEffect(() => {
    const start = performance.now();
    const timer = window.setInterval(() => {
      setElapsed({ anchor: observedAt, milliseconds: performance.now() - start });
    }, frontend.refresh.countdownTickMs);
    return () => window.clearInterval(timer);
  }, [observedAt]);

  return remainingSeconds(deadline, observedAt, elapsed.anchor === observedAt ? elapsed.milliseconds : 0);
}
