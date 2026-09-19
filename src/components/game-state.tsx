"use client";

import { frontend } from "@/config/public";

import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { GameState } from "@/lib/game";

const StateContext = createContext<GameState | null>(null);

export function GameStateProvider({ state, children }: { state: GameState; children: ReactNode }) {
  const router = useRouter();
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === "visible") router.refresh(); };
    const next = [state.energy_next_at, state.health_next_at, state.combat_next_at, state.protected_until, state.hospital_until, state.training.ship_job?.finishes_at]
      .filter((value): value is string => Boolean(value)).map(value => Date.parse(value));
    const delay = next.length ? Math.max(frontend.refresh.resourceMinimumMs, Math.min(...next) - Date.parse(state.observed_at) + frontend.refresh.resourceGraceMs) : null;
    const timer = delay === null ? undefined : window.setTimeout(refresh, delay);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [state.energy_next_at, state.health_next_at, state.combat_next_at, state.protected_until, state.hospital_until, state.training.ship_job?.finishes_at, state.observed_at, router]);
  return <StateContext.Provider value={state}>{children}</StateContext.Provider>;
}

export function useGameState() {
  const state = useContext(StateContext);
  if (!state) throw new Error("Game state is unavailable.");
  return state;
}
