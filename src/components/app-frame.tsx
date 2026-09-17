"use client";

import { Suspense, useEffect, useId, useRef, useTransition, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Masthead } from "@/components/shell";
import { createClient } from "@/lib/supabase/browser";
import { attackUrl, type AttackLock } from "@/lib/combat";

function SessionFrame({ children, characterId, attack }: { children: ReactNode; characterId: string | null; attack: AttackLock | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const instance = useId();
  const [pending, startTransition] = useTransition();
  const refreshing = useRef(false);
  const dirty = useRef(false);
  const requestRefresh = useRef<() => void>(() => {});
  const attackScreen = pathname === "/attack" || pathname.startsWith("/attack/");
  const blocked = !!attack && pathname !== attackUrl(attack.target_id);

  useEffect(() => {
    if (blocked && attack) router.replace(attackUrl(attack.target_id));
  }, [blocked, attack, router]);

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
      }, 100);
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
    const fallback = setInterval(foreground, 15000);
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

  if (blocked) return <main id="main" className="o-attack-loading"><span className="o-spinner" /> Returning to your battle...</main>;
  return <div className={attackScreen ? "o-attack-shell" : "game-shell"}>
    {!attackScreen && <Masthead />}
    {children}
    {!attackScreen && <footer className="o-bottom"><span>One Life At Sea</span><span>A life to remember.</span></footer>}
  </div>;
}

export function AppFrame(props: { children: ReactNode; characterId: string | null; attack: AttackLock | null }) {
  return <Suspense fallback={<main id="main" className="o-attack-loading">Loading...</main>}><SessionFrame {...props} /></Suspense>;
}
