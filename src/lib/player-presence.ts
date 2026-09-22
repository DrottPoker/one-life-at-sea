export type PlayerPresence = {
  online_until: string | null;
  connected_until: string | null;
  last_action_at: string | null;
};

export function lastActionLabel(lastActionAt: string | null, observedAt: string, elapsedMs = 0): string {
  if (!lastActionAt) return "Not recorded yet";
  const seconds = Math.max(0, Math.floor((Date.parse(observedAt) + elapsedMs - Date.parse(lastActionAt)) / 1000));
  if (!Number.isFinite(seconds)) return "Not recorded yet";
  if (seconds < 60) return "Just now";
  for (const [size, unit] of [[86400, "day"], [3600, "hour"], [60, "minute"]] as const) {
    if (seconds >= size) {
      const count = Math.floor(seconds / size);
      return `${count} ${unit}${count === 1 ? "" : "s"} ago`;
    }
  }
  return "Just now";
}

export function presenceStatus(presence: PlayerPresence, observedAt: string, elapsedMs = 0): "online" | "idle" | "offline" {
  const now = Date.parse(observedAt) + elapsedMs;
  if (presence.online_until && Date.parse(presence.online_until) > now) return "online";
  if (presence.connected_until && Date.parse(presence.connected_until) > now) return "idle";
  return "offline";
}

export function nextPresenceRefreshMs(presence: PlayerPresence, observedAt: string, elapsedMs = 0): number {
  const now = Date.parse(observedAt) + elapsedMs;
  const age = now - Date.parse(presence.last_action_at ?? "");
  const minuteDelay = Number.isFinite(age) && age >= 0 ? 60000 - age % 60000 : 60000;
  const expirations = [presence.online_until, presence.connected_until]
    .map(until => Date.parse(until ?? "") - now).filter(delay => delay > 0);
  return Math.max(1, Math.ceil(Math.min(minuteDelay, ...expirations)));
}
