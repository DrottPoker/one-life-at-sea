"use client";

import { Panel } from "@/components/shell";

export default function PlayersError({ reset }: { reset: () => void }) {
  return <Panel title="Players unavailable"><div className="o-panel-body">
    <p>We could not load these players. Please try again.</p>
    <button type="button" className="o-primary" onClick={reset}>Try again</button>
  </div></Panel>;
}
