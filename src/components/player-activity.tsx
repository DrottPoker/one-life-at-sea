"use client";

import { useEffect } from "react";
import { usePlayerPresence } from "@/hooks/use-player-presence";
import { subscribeToForeground } from "@/lib/browser-events";
import { createClient } from "@/lib/supabase/browser";

export function usePlayerActivity(accountId: string | null) {
  usePlayerPresence(accountId);
  useEffect(() => {
    if (!accountId) return;
    const client = createClient();
    let disposed = false;
    let signedIn = true;
    let request: AbortController | null = null;
    async function record() {
      if (disposed || !signedIn || request || document.visibilityState !== "visible") return;
      const controller = new AbortController();
      request = controller;
      const timeout = setTimeout(() => controller.abort(), 10000);
      try { await client.rpc("record_player_activity").abortSignal(controller.signal); }
      catch { /* Analytics must not interrupt play; retry on the next refresh. */ }
      finally { clearTimeout(timeout); request = null; }
    }
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      signedIn = session?.user.id === accountId;
      if (signedIn) queueMicrotask(() => { void record(); });
      else request?.abort();
    });
    const unsubscribe = subscribeToForeground(() => { void record(); });
    const timer = setInterval(() => { void record(); }, 60000);
    void record();
    return () => { disposed = true; clearInterval(timer); unsubscribe(); data.subscription.unsubscribe(); request?.abort(); };
  }, [accountId]);
}
