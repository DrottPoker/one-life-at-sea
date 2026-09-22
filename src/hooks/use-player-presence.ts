"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { gameplay } from "@/config/public";
import { createClient } from "@/lib/supabase/browser";

export function usePlayerPresence(accountId: string | null) {
  const pathname = usePathname();
  const navigate = useRef<() => void>(() => {});
  useEffect(() => {
    if (!accountId) return;
    const client = createClient(), tabId = crypto.randomUUID();
    const idleMs = gameplay.presence.idleSeconds * 1000;
    const unfocusedMs = gameplay.presence.unfocusedSeconds * 1000;
    const focused = () => document.visibilityState === "visible" && document.hasFocus();
    let disposed = false, signedIn = true, pageAction = true, closing = false, dirty = false;
    let lastInput = performance.now(), request: AbortController | null = null;
    let unfocusedSince: number | null = focused() ? null : lastInput;
    let lastSentActive: boolean | undefined;
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    const untilIdle = () => Math.min(lastInput + idleMs, unfocusedSince === null ? Infinity : unfocusedSince + unfocusedMs) - performance.now();
    const active = () => !closing && untilIdle() > 0;
    function scheduleIdle() {
      clearTimeout(idleTimer);
      const delay = Math.ceil(untilIdle());
      if (delay > 0) idleTimer = setTimeout(() => { void send(); scheduleIdle(); }, delay);
    }

    async function send(force = false) {
      if (disposed || !signedIn) return;
      if (request) { dirty = true; return; }
      const isActive = active();
      if (!force && !pageAction && !closing && isActive === lastSentActive) return;
      const action = pageAction;
      pageAction = false;
      dirty = false;
      const controller = new AbortController();
      request = controller;
      const timeout = setTimeout(() => controller.abort(), 10000);
      try {
        const { error } = await client.rpc("record_player_presence", {
          tab_id: tabId, is_active: isActive, page_action: action, closed: closing,
        }).abortSignal(controller.signal);
        if (error) throw error;
        lastSentActive = isActive;
      } catch {
        // Preserve navigation through a transient failure, then retry on the next heartbeat.
        pageAction ||= action;
        lastSentActive = undefined;
      } finally {
        clearTimeout(timeout);
        request = null;
        if (dirty && !disposed) queueMicrotask(() => { void send(); });
      }
    }
    function interact() {
      if (!focused()) return;
      lastInput = performance.now();
      scheduleIdle();
      void send();
    }
    function focus() {
      if (focused()) {
        unfocusedSince = null;
        interact();
      } else {
        // Blur and visibility events must share the same continuous absence.
        unfocusedSince ??= performance.now();
        scheduleIdle();
        void send();
      }
    }
    function reconnect() { void send(true); }
    function hide() { closing = true; void send(true); }
    function show() { closing = false; focus(); void send(true); }
    const inputs = ["pointerdown", "pointermove", "keydown", "wheel"] as const;
    for (const event of inputs) window.addEventListener(event, interact, { passive: true });
    window.addEventListener("focus", focus);
    window.addEventListener("blur", focus);
    window.addEventListener("online", reconnect);
    window.addEventListener("pagehide", hide);
    window.addEventListener("pageshow", show);
    document.addEventListener("visibilitychange", focus);
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      signedIn = session?.user.id === accountId;
      if (!signedIn) request?.abort();
      else queueMicrotask(() => { void send(); });
    });
    navigate.current = () => { pageAction = true; if (focused()) interact(); else void send(); };
    const timer = setInterval(() => { if (!closing) void send(true); }, gameplay.presence.leaseSeconds * 1000 / 3);
    focus();
    return () => {
      disposed = true;
      navigate.current = () => {};
      clearTimeout(idleTimer);
      clearInterval(timer);
      request?.abort();
      data.subscription.unsubscribe();
      for (const event of inputs) window.removeEventListener(event, interact);
      window.removeEventListener("focus", focus);
      window.removeEventListener("blur", focus);
      window.removeEventListener("online", reconnect);
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("pageshow", show);
      document.removeEventListener("visibilitychange", focus);
      // Best effort on navigation away; missing closes expire on the server.
      if (signedIn) void client.rpc("record_player_presence", { tab_id: tabId, is_active: false, closed: true }).then(() => {}, () => {});
    };
  }, [accountId]);
  useEffect(() => { navigate.current(); }, [pathname, accountId]);
}
