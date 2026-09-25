"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

// False in server HTML and during hydration. Controls whose only effect is a client handler, such
// as file inputs and toggles, stay disabled until then; earlier input would be silently dropped.
export function useHydrated() {
  return useSyncExternalStore(subscribe, () => true, () => false);
}
