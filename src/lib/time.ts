export function remainingSeconds(deadline: string, observedAt: string, elapsedMs = 0): number {
  return Math.max(0, Math.ceil((Date.parse(deadline) - Date.parse(observedAt) - elapsedMs) / 1000));
}

export function formatCountdown(seconds: number): string {
  return Math.floor(seconds / 60) + ":" + String(seconds % 60).padStart(2, "0");
}
