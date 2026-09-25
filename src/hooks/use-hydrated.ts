"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

// False in server HTML and during hydration. File inputs stay disabled until then, since a file
// chosen before React attaches its handlers is silently dropped.
export function useHydrated() {
  return useSyncExternalStore(subscribe, () => true, () => false);
}
