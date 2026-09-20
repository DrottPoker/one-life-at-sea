"use client";

import { frontend } from "@/config/public";

import { Suspense, useEffect, useId, useMemo, useRef, useTransition, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { GameRefreshContext } from "@/components/game-refresh";
import { Masthead } from "@/components/shell";
import { subscribeToForeground } from "@/lib/browser-events";
import { createClient } from "@/lib/supabase/browser";
import { navigationRedirect } from "@/lib/game-navigation";
import type { SeaPhase } from "@/lib/sea-travel";
import type { AttackLock } from "@/lib/combat";

function SessionFrame({ children, characterId, attack, hospitalUntil, seaState, isAdmin }: { isAdmin: boolean; children: ReactNode; characterId: string | null; attack: AttackLock | null; hospitalUntil: string | null; seaState: SeaPhase | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const instance = useId();
  const [pending, startTransition] = useTransition();
  const refreshing = useRef(false);
  const dirty = useRef(false);
  const requestRefresh = useRef<() => void>(() => {});
  const navigationHolds = useRef(new Set<symbol>());
  const refreshControl = useMemo(() => ({
    request: () => requestRefresh.current(),
    hold() {
      const token = Symbol();
      navigationHolds.current.add(token);
      return () => {
        navigationHolds.current.delete(token);
        if (!navigationHolds.current.size && dirty.current) requestRefresh.current();
      };
    },
  }), []);
  const attackScreen = pathname === "/attack" || pathname.startsWith("/attack/");
  const destination = navigationRedirect(pathname, { hospital_until: hospitalUntil, attack, sea_state: seaState });
  const adminScreen = pathname === "/admin" || pathname.startsWith("/admin/");
  const blocked = !(isAdmin && adminScreen) && !!destination;

  useEffect(() => {
    if (blocked && destination) router.replace(destination);
  }, [blocked, destination, router]);

  useEffect(() => {
    refreshing.current = pending;
    if (!pending && dirty.current) requestRefresh.current();
  }, [pending]);

  useEffect(() => {
    if (!characterId) return;
    const client = createClient();
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    function schedule() {
      dirty.current = true;
      if (timer || refreshing.current || navigationHolds.current.size || disposed) return;
      timer = setTimeout(() => {
        timer = undefined;
        if (disposed || navigationHolds.current.size) return;
        dirty.current = false;
        refreshing.current = true;
        startTransition(() => router.refresh());
      }, frontend.refresh.realtimeDebounceMs);
    }
    requestRefresh.current = schedule;
    const channel = client.channel("game-state-" + instance, { config: { postgres_changes_options: { wait: true } } })
      .on("postgres_changes", { event: "*", schema: "public", table: "player_game_events", filter: "character_id=eq." + characterId }, schedule);
    void client.realtime.setAuth().then(() => {
      if (!disposed) channel.subscribe(status => { if (status === "SUBSCRIBED") schedule(); });
    }).catch(() => { if (!disposed) schedule(); });
    const foreground = () => { if (document.visibilityState === "visible") schedule(); };
    const unsubscribeForeground = subscribeToForeground(schedule, true);
    const fallback = setInterval(foreground, frontend.refresh.fallbackMs);
    return () => {
      disposed = true;
      clearTimeout(timer);
      clearInterval(fallback);
      unsubscribeForeground();
      void client.removeChannel(channel);
    };
  }, [characterId, instance, router]);

  if (blocked) return <main id="main" className="o-attack-loading"><span className="o-spinner" /> {hospitalUntil ? "Returning to hospital..." : attack ? "Returning to your battle..." : "Returning to your voyage..."}</main>;
  return <GameRefreshContext value={refreshControl}><div className={attackScreen || (isAdmin && adminScreen) ? "o-attack-shell" : "game-shell"}>
    {!attackScreen && <Masthead isAdmin={isAdmin} />}
    {children}
    {!attackScreen && <footer className="o-bottom"><span>{frontend.site.name}</span><span>A life to remember.</span></footer>}
  </div></GameRefreshContext>;
}

export function AppFrame(props: { isAdmin: boolean; children: ReactNode; characterId: string | null; attack: AttackLock | null; hospitalUntil: string | null; seaState: SeaPhase | null }) {
  return <Suspense fallback={<main id="main" className="o-attack-loading">Loading...</main>}><SessionFrame {...props} /></Suspense>;
}
