"use client";

import { useEffect, useState } from "react";
import { frontend } from "@/config/public";

export function HospitalCountdown({ until, observedAt }: { until: string; observedAt: string }) {
  const [elapsed, setElapsed] = useState({ anchor: observedAt, seconds: 0 });
  useEffect(() => {
    const start = performance.now();
    const timer = setInterval(() => setElapsed({ anchor: observedAt, seconds: (performance.now() - start) / 1000 }), frontend.refresh.countdownTickMs);
    return () => clearInterval(timer);
  }, [observedAt]);
  const seconds = Math.max(0, Math.ceil((Date.parse(until) - Date.parse(observedAt)) / 1000 -
    (elapsed.anchor === observedAt ? elapsed.seconds : 0)));
  return <output aria-label="Hospital time remaining">{seconds ? Math.floor(seconds / 60) + ":" + String(seconds % 60).padStart(2, "0") : "Discharging..."}</output>;
}
