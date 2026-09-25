"use client";

import { useEffect, useRef, useState } from "react";

// A quick ease-out from one value to another; progress runs from 0 to 1.
export function countUpAt(from: number, to: number, progress: number) {
  return from + (to - from) * (1 - (1 - progress) ** 3);
}

// Counts a number to its new value instead of jumping, starting from `start` on mount.
// Reduced motion shows the new value on the next frame.
export function useCountUp(value: number, start: number, duration: number) {
  const [shown, setShown] = useState(start);
  const current = useRef(start);
  useEffect(() => {
    const from = current.current, still = matchMedia("(prefers-reduced-motion: reduce)").matches, began = performance.now();
    let frame = requestAnimationFrame(function step(now) {
      const progress = still ? 1 : Math.min(1, Math.max(0, (now - began) / duration));
      current.current = countUpAt(from, value, progress);
      setShown(current.current);
      if (progress < 1) frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);
  return shown;
}
