"use client";

import { Panel } from "@/components/shell";

export default function CombatError({ retry }: { retry: () => void }) {
  return <Panel title="The encounter could not be loaded"><div className="o-panel-body">
    <p>Your saved fight is still on record. Try loading its latest state.</p>
    <button className="o-training-button" onClick={retry}>Try again</button>
  </div></Panel>;
}
