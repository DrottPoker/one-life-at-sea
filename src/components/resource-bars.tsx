"use client";

import { gameplay, durationLabel } from "@/config/public";


import { Coins } from "lucide-react";
import { formatGold } from "@/lib/bank";
import { useGameState } from "@/components/game-state";
import { MAX_ENERGY, MAX_HEALTH } from "@/lib/game";

export function ResourceBars() {
  const state = useGameState();
  const resources = [
    { key: "energy", label: "Energy", value: state.energy, max: MAX_ENERGY },
    { key: "ship", label: "Ship Health", value: state.ship_health, max: MAX_HEALTH },
    { key: "crew", label: "Crew Health", value: state.crew_health, max: MAX_HEALTH },
  ];
  return <section className="o-side-module" aria-labelledby="resources-title">
    <div className="o-gold-coins"><span><Coins aria-hidden="true" />Gold Coins</span><output aria-label="Gold Coins on character">{formatGold(state.gold_coins)}</output></div>
    <h2 className="o-side-title" id="resources-title">Condition</h2>
    <div className="o-resources">{resources.map(resource => <div className="o-resource" key={resource.key}>
      <div className="o-resource-label"><span>{resource.label}</span><span>{resource.value} / {resource.max}</span></div>
      <div className={"o-resource-track o-resource-" + resource.key} role="progressbar"
        aria-label={resource.label} aria-valuemin={0} aria-valuemax={resource.max} aria-valuenow={resource.value}
        aria-valuetext={resource.value + " of " + resource.max}>
        <span style={{ width: (resource.value / resource.max * 100) + "%" }} />
      </div>
    </div>)}
      <p className="o-resource-note">Energy: +{gameplay.resources.energyRecoveryAmount} every {durationLabel(gameplay.resources.energyRecoverySeconds)}</p>
      {state.hospital_until && <p className="o-resource-note">In hospital. Game actions are locked until discharge.</p>}
      {state.health_next_at && <p className="o-resource-note">Recovering: ship +1 / {gameplay.resources.shipRecoverySeconds}s, crew +1 / {gameplay.resources.crewRecoverySeconds}s</p>}
      {state.protected_until && <p className="o-resource-note">Protected from attacks. Starting a fight ends protection.</p>}
    </div>
  </section>;
}
