"use client";

import { frontend } from "@/config/public";

import { Suspense, useEffect, useId, useRef, useTransition, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Masthead } from "@/components/shell";
import { createClient } from "@/lib/supabase/browser";
import { isHospitalAccessiblePath } from "@/lib/hospital";
import { attackUrl, type AttackLock } from "@/lib/combat";

function SessionFrame({ children, characterId, attack, hospitalUntil, isAdmin }: { isAdmin: boolean; children: ReactNode; characterId: string | null; attack: AttackLock | null; hospitalUntil: string | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const instance = useId();
  const [pending, startTransition] = useTransition();
  const refreshing = useRef(false);
  const dirty = useRef(false);
  const requestRefresh = useRef<() => void>(() => {});
  const attackScreen = pathname === "/attack" || pathname.startsWith("/attack/");
  const destination = hospitalUntil ? "/harbor/hospital" : attack ? attackUrl(attack.target_id) : null;
  const adminScreen = pathname === "/admin" || pathname.startsWith("/admin/");
  const blocked = !(isAdmin && adminScreen) && !!destination && pathname !== destination && !(hospitalUntil && isHospitalAccessiblePath(pathname));

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
      if (timer || refreshing.current || disposed) return;
      timer = setTimeout(() => {
        timer = undefined;
        if (disposed) return;
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
    // Reconcile after reconnects and cached back/forward navigation.
    window.addEventListener("focus", foreground);
    window.addEventListener("online", foreground);
    window.addEventListener("popstate", foreground);
    window.addEventListener("pageshow", foreground);
    document.addEventListener("visibilitychange", foreground);
    const fallback = setInterval(foreground, frontend.refresh.fallbackMs);
    return () => {
      disposed = true;
      clearTimeout(timer);
      clearInterval(fallback);
      window.removeEventListener("focus", foreground);
      window.removeEventListener("online", foreground);
      window.removeEventListener("popstate", foreground);
      window.removeEventListener("pageshow", foreground);
      document.removeEventListener("visibilitychange", foreground);
      void client.removeChannel(channel);
    };
  }, [characterId, instance, router]);

  if (blocked) return <main id="main" className="o-attack-loading"><span className="o-spinner" /> {hospitalUntil ? "Returning to hospital..." : "Returning to your battle..."}</main>;
  return <div className={attackScreen || (isAdmin && adminScreen) ? "o-attack-shell" : "game-shell"}>
    {!attackScreen && <Masthead isAdmin={isAdmin} />}
    {children}
    {!attackScreen && <footer className="o-bottom"><span>{frontend.site.name}</span><span>A life to remember.</span></footer>}
  </div>;
}

export function AppFrame(props: { isAdmin: boolean; children: ReactNode; characterId: string | null; attack: AttackLock | null; hospitalUntil: string | null }) {
  return <Suspense fallback={<main id="main" className="o-attack-loading">Loading...</main>}><SessionFrame {...props} /></Suspense>;
}
