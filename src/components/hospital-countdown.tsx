"use client";

import { useServerCountdown } from "@/hooks/use-server-countdown";
import { formatCountdown } from "@/lib/time";

export function HospitalCountdown({ until, observedAt }: { until: string; observedAt: string }) {
  const seconds = useServerCountdown(until, observedAt);
  return <output aria-label="Hospital time remaining">{seconds ? formatCountdown(seconds) : "Discharging..."}</output>;
}
