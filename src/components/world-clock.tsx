"use client";

import { useEffect, useRef, useState } from "react";
import { frontend } from "@/config/public";
import { subscribeToForeground } from "@/lib/browser-events";
import { worldTimeAt, type WorldTime } from "@/lib/world-time";

export function WorldClock({ initialTime }: { initialTime: WorldTime }) {
  const [seed] = useState(initialTime.observed_at);
  const observe = useRef<(timestamp: string) => void>(() => {});
  useEffect(() => {
    let anchor = { time: Date.parse(seed), elapsed: performance.now() };
    let disposed = false;
    let transitionTimer: ReturnType<typeof setTimeout> | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let request: AbortController | null = null;

    const update = () => {
      if (disposed) return;
      const now = anchor.time + performance.now() - anchor.elapsed;
      const snapshot = worldTimeAt(now);
      document.body.dataset.dayPeriod = snapshot.period;
      clearTimeout(transitionTimer);
      transitionTimer = setTimeout(update, Math.max(1, Date.parse(snapshot.next_change_at) - now));
    };
    const synchronize = async () => {
      if (disposed || request) return;
      clearTimeout(retryTimer);
      const controller = new AbortController();
      request = controller;
      const started = performance.now();
      const timeout = setTimeout(() => controller.abort(), frontend.dayNight.requestTimeoutMs);
      try {
        const response = await fetch("/api/world-time", { cache: "no-store", credentials: "omit", signal: controller.signal });
        if (!response.ok) throw new Error("World time unavailable.");
        const data: unknown = await response.json();
        const timestamp = data && typeof data === "object" && "observed_at" in data && typeof data.observed_at === "string"
          ? Date.parse(data.observed_at) : NaN;
        if (!Number.isFinite(timestamp)) throw new Error("Invalid world time.");
        if (disposed || controller.signal.aborted) return;
        const received = performance.now();
        // Approximate return latency without trusting the device clock.
        anchor = { time: timestamp + (received - started) / 2, elapsed: received };
        update();
      } catch {
        // Keep advancing from the last server observation while offline.
        if (!disposed) retryTimer = setTimeout(() => { void synchronize(); }, frontend.refresh.fallbackMs);
      } finally {
        clearTimeout(timeout);
        request = null;
      }
    };
    observe.current = timestamp => {
      anchor = { time: Date.parse(timestamp), elapsed: performance.now() };
      update();
    };
    const foreground = () => { update(); void synchronize(); };
    update();
    void synchronize();
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") void synchronize();
    }, frontend.dayNight.resyncMs);
    const unsubscribe = subscribeToForeground(foreground, true);
    return () => {
      disposed = true;
      observe.current = () => {};
      clearTimeout(transitionTimer);
      clearTimeout(retryTimer);
      clearInterval(interval);
      request?.abort();
      unsubscribe();
    };
  }, [seed]);
  // A server render already carries fresh time; it needs no extra clock request.
  useEffect(() => { observe.current(initialTime.observed_at); }, [initialTime.observed_at]);
  return null;
}
