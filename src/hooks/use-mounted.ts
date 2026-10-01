import { useEffect, useRef } from "react";

// Whether the component is still on the page, for work that finishes after the player may have moved on.
export function useMountedRef() {
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  return mounted;
}
