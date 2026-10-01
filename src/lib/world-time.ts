import { frontend } from "@/config/public";

export type DayPeriod = "day" | "night";
export type WorldTime = { observed_at: string; period: DayPeriod; next_change_at: string };

export function worldTimeAt(timestamp: number): WorldTime {
  const now = new Date(timestamp);
  const hour = now.getUTCHours();
  const { dayStartHour, nightStartHour } = frontend.dayNight;
  const period = hour < dayStartHour || hour >= nightStartHour ? "night" : "day";
  const next = new Date(timestamp);
  next.setUTCHours(period === "night" ? dayStartHour : nightStartHour, 0, 0, 0);
  if (next.getTime() <= timestamp) next.setUTCDate(next.getUTCDate() + 1);
  return { observed_at: now.toISOString(), period, next_change_at: next.toISOString() };
}
