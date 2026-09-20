"use client";

import { createContext, useContext, useEffect } from "react";

export type GameRefreshControl = { request: () => void; hold: () => () => void };
export const GameRefreshContext = createContext<GameRefreshControl | null>(null);

export function useGameRefresh() {
  const control = useContext(GameRefreshContext);
  if (!control) throw new Error("Game refresh is unavailable.");
  return control;
}

export function useNavigationActivity(active: boolean) {
  const { hold } = useGameRefresh();
  useEffect(() => {
    if (active) return hold();
  }, [active, hold]);
}
