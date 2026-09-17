"use client";


import { useGameState } from "@/components/game-state";
import { MAX_RESOURCE } from "@/lib/game";

export function ResourceBars() {
  const state = useGameState();
  const resources = [
    { key: "energy", label: "Energy", value: state.energy },
    { key: "ship", label: "Ship Health", value: state.ship_health },
    { key: "crew", label: "Crew Health", value: state.crew_health },
  ];
  return <section className="o-side-module" aria-labelledby="resources-title">
    <h2 className="o-side-title" id="resources-title">Condition</h2>
    <div className="o-resources">{resources.map(resource => <div className="o-resource" key={resource.key}>
      <div className="o-resource-label"><span>{resource.label}</span><span>{resource.value} / {MAX_RESOURCE}</span></div>
      <div className={"o-resource-track o-resource-" + resource.key} role="progressbar"
        aria-label={resource.label} aria-valuemin={0} aria-valuemax={MAX_RESOURCE} aria-valuenow={resource.value}
        aria-valuetext={resource.value + " of " + MAX_RESOURCE}>
        <span style={{ width: resource.value + "%" }} />
      </div>
    </div>)}
      <p className="o-resource-note">Energy: +1 every 5 minutes</p>
      {state.health_next_at && <p className="o-resource-note">Recovering: ship +1 / 30s, crew +1 / 10s</p>}
      {state.protected_until && <p className="o-resource-note">Protected from attacks. Starting a fight ends protection.</p>}
    </div>
  </section>;
}
