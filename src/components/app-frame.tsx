"use client";

import type { MessageSummary } from "@/lib/messages";

import { usePlayerActivity } from "@/components/player-activity";
import { frontend } from "@/config/public";

import { Suspense, useEffect, useLayoutEffect, useId, useMemo, useRef, useTransition, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { GameRefreshContext } from "@/components/game-refresh";
import { GameNavigationProvider } from "@/components/game-navigation";
import { Masthead } from "@/components/shell";
import { createGameRefreshQueue } from "@/lib/game-refresh-queue";
import { subscribeToForeground } from "@/lib/browser-events";
import { createClient } from "@/lib/supabase/browser";
import { navigationRedirect } from "@/lib/game-navigation";
import type { SeaPhase } from "@/lib/sea-travel";
import type { NotificationSummary } from "@/lib/notifications";
import type { AttackLock } from "@/lib/combat";

function SessionFrame({ children, accountId, characterId, attack, hospitalUntil, seaState, isAdmin, notifications, revision, messages }: { messages: MessageSummary | null; revision: number | null; notifications: NotificationSummary | null; accountId: string | null; isAdmin: boolean; children: ReactNode; characterId: string | null; attack: AttackLock | null; hospitalUntil: string | null; seaState: SeaPhase | null }) {
  usePlayerActivity(accountId);
  const pathname = usePathname();
  const router = useRouter();
  const instance = useId();
  const [pending, startTransition] = useTransition();
  const refreshing = useRef(false);
  const queue = useMemo(() => ({ ...createGameRefreshQueue(), characterId }), [characterId]);
  const requestRefresh = useRef<(force?: boolean) => void>(() => {});
  useLayoutEffect(() => { queue.observe(revision); }, [queue, revision]);
  const navigationHolds = useRef(new Set<symbol>());
  const refreshControl = useMemo(() => ({
    request: () => requestRefresh.current(),
    hold() {
      const token = Symbol();
      navigationHolds.current.add(token);
      return () => {
        navigationHolds.current.delete(token);
        if (!navigationHolds.current.size && queue.pending()) requestRefresh.current(false);
      };
    },
  }), [queue]);
  const attackScreen = pathname === "/attack" || pathname.startsWith("/attack/");
  const destination = navigationRedirect(pathname, { hospital_until: hospitalUntil, attack, sea_state: seaState });
  const adminScreen = pathname === "/admin" || pathname.startsWith("/admin/");
  const blocked = !(isAdmin && adminScreen) && !!destination;

  useEffect(() => {
    if (blocked && destination) router.replace(destination);
  }, [blocked, destination, router]);

  useEffect(() => {
    refreshing.current = pending;
    if (!pending && queue.pending()) requestRefresh.current(false);
  }, [pending, queue]);

  useEffect(() => {
    if (!characterId) return;
    const client = createClient();
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    function schedule(force = true) {
      if (force) queue.request();
      if (!queue.pending() || document.visibilityState !== "visible" || timer || refreshing.current || navigationHolds.current.size || disposed) return;
      timer = setTimeout(() => {
        timer = undefined;
        if (disposed || navigationHolds.current.size || document.visibilityState !== "visible" || !queue.pending()) return;
        queue.take();
        refreshing.current = true;
        startTransition(() => router.refresh());
      }, frontend.refresh.realtimeDebounceMs);
    }
    requestRefresh.current = schedule;
    const channel = client.channel("game-state-" + instance, { config: { postgres_changes_options: { wait: true } } })
      .on("postgres_changes", { event: "*", schema: "public", table: "player_game_events", filter: "character_id=eq." + characterId }, payload => {
        const next = "revision" in payload.new ? payload.new.revision : null;
        queue.event(typeof next === "number" ? next : null);
        schedule(false);
      });
    // Changes committed between the server render and the subscription send no realtime event, but
    // they raise the stored revision. Refresh only when it moved; a failed read refreshes anyway.
    async function catchUp() {
      const { data, error } = await client.from("player_game_events").select("revision").eq("character_id", characterId!).maybeSingle();
      if (disposed) return;
      if (error) { schedule(); return; }
      queue.event(data?.revision ?? 0);
      schedule(false);
    }
    void client.realtime.setAuth().then(() => {
      if (!disposed) channel.subscribe(status => { if (status === "SUBSCRIBED") void catchUp(); });
    }).catch(() => { if (!disposed) schedule(); });
    const foreground = () => { if (document.visibilityState === "visible") schedule(); };
    const unsubscribeForeground = subscribeToForeground(() => schedule(), true);
    const fallback = setInterval(foreground, frontend.refresh.fallbackMs);
    return () => {
      disposed = true;
      clearTimeout(timer);
      clearInterval(fallback);
      unsubscribeForeground();
      void client.removeChannel(channel);
    };
  }, [characterId, instance, router, queue]);

  if (blocked) return <main id="main" className="o-attack-loading"><span className="o-spinner" /> {hospitalUntil ? "Returning to hospital..." : attack ? "Returning to your battle..." : "Returning to your voyage..."}</main>;
  // Navigation state spans the masthead and the game pages, so its links show the same loading view.
  return <GameRefreshContext value={refreshControl}><GameNavigationProvider key={characterId ?? "guest"}>
    <div className={attackScreen ? "o-attack-shell o-encounter-shell" : isAdmin && adminScreen ? "o-attack-shell" : "game-shell"}>
    {!attackScreen && <Masthead messages={characterId ? messages : undefined} isAdmin={isAdmin} notifications={characterId ? notifications : undefined} />}
    {children}
    {!attackScreen && <footer className="o-bottom"><span>{frontend.site.name}</span><span>A life to remember.</span></footer>}
  </div></GameNavigationProvider></GameRefreshContext>;
}

export function AppFrame(props: { messages: MessageSummary | null; revision: number | null; notifications: NotificationSummary | null; accountId: string | null; isAdmin: boolean; children: ReactNode; characterId: string | null; attack: AttackLock | null; hospitalUntil: string | null; seaState: SeaPhase | null }) {
  return <Suspense fallback={<main id="main" className="o-attack-loading">Loading...</main>}><SessionFrame {...props} /></Suspense>;
}
