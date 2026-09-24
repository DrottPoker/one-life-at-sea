"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

// Length of the roll in both directions; passed to the CSS so the animation and the unmount stay in step.
const ROLL_MS = 100;

// Renders its content while open, rolling it down on open and up on close before removing it, so panels never pop away.
// The closing copy is inert, so it cannot take focus or clicks while it rolls up.
export function Collapsible({ open, className, children }: { open: boolean; className?: string; children: ReactNode }) {
  const [present, setPresent] = useState(open);
  if (open && !present) setPresent(true);
  const closing = present && !open;
  useEffect(() => {
    if (!closing) return;
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = setTimeout(() => setPresent(false), still ? 0 : ROLL_MS);
    return () => clearTimeout(timer);
  }, [closing]);
  if (!present) return null;
  return <div className={"o-collapsible" + (className ? " " + className : "")} data-closing={closing || undefined} inert={closing}
    style={{ "--o-roll": ROLL_MS + "ms" } as CSSProperties}>
    <div className="o-collapsible-clip">{children}</div>
  </div>;
}
