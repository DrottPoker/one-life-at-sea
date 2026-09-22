"use client";

import { useEffect, useRef, useState } from "react";
import { gameplay, durationLabel } from "@/config/public";
import { Coins, Zap, Ship, Users, Heart, Footprints } from "lucide-react";
import { formatMorale, formatMoraleBonus } from "@/lib/morale";
import { formatGold } from "@/lib/bank";
import { useGameState } from "@/components/game-state";
import { MAX_ENERGY, MAX_HEALTH, MAX_STAMINA } from "@/lib/game";

export function ResourceBars() {
  const state = useGameState();
  const [activeHint, setActiveHint] = useState<string | null>(null);
  const resourcesRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!activeHint) return;
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !resourcesRef.current?.contains(event.target)) setActiveHint(null);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setActiveHint(null); };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [activeHint]);
  const healthHint = (seconds: number) => state.hospital_until ? "Restored on discharge. Actions are locked in hospital." :
    state.active_combat_id ? "Recovery is paused during combat." :
    "Recovers 1 HP every " + durationLabel(seconds) + " outside combat.";
  const resources = [
    { key: "energy", label: "Energy", value: state.energy, min: 0, max: MAX_ENERGY, Icon: Zap,
      description: "Increases by " + gameplay.resources.energyRecoveryAmount + " every " +
        durationLabel(gameplay.resources.energyRecoverySeconds * (state.sea.state === "in_harbor" ? 1 : 2)) + "." +
        (state.energy >= MAX_ENERGY ? " Recovery paused at " + MAX_ENERGY + ". Storage limit: " + gameplay.resources.energyStorageMax + "." : "") },
    { key: "stamina", label: "Stamina", value: state.stamina, min: 0, max: MAX_STAMINA, Icon: Footprints,
      description: "Increases by " + gameplay.stamina.recoveryAmount + " every " + durationLabel(gameplay.stamina.recoverySeconds) + ". Used for skill activities." +
        (state.stamina >= MAX_STAMINA ? " Recovery paused at " + MAX_STAMINA + ". Storage limit: " + gameplay.stamina.storageMaximum + "." : "") },
    { key: "ship", label: "Ship Health", value: state.ship_health, min: 0, max: MAX_HEALTH, Icon: Ship,
      description: healthHint(gameplay.resources.shipRecoverySeconds) },
    { key: "crew", label: "Crew Health", value: state.crew_health, min: 0, max: MAX_HEALTH, Icon: Users,
      description: healthHint(gameplay.resources.crewRecoverySeconds) +
        (state.protected_until ? " Protected until you attack." : "") },
    { key: "morale", label: "Crew Morale", value: state.crew_morale, min: -gameplay.morale.maximum, max: gameplay.morale.maximum, Icon: Heart,
      description: formatMoraleBonus(state.crew_morale) + " Crew stats, " + formatMoraleBonus(state.crew_morale, "training") +
        " training gains. Moves " + gameplay.morale.recoveryAmount + " towards 0 every " + durationLabel(gameplay.morale.recoverySeconds) + "." },
  ];
  return <section className="o-side-module o-condition-card" aria-labelledby="resources-title">
    <div className="o-gold-coins"><span><Coins aria-hidden="true" />Gold Coins</span><output aria-label="Gold Coins on character">{formatGold(state.gold_coins)}</output></div>
    <h2 className="o-side-title" id="resources-title">Condition</h2>
    <div className="o-resources" ref={resourcesRef}>{resources.map(resource => {
      const morale = resource.key === "morale", hintId = "resource-hint-" + resource.key;
      return <div className="o-resource" key={resource.key}
        onPointerEnter={event => { if (event.pointerType !== "touch") setActiveHint(resource.key); }}
        onPointerLeave={event => { if (!event.currentTarget.contains(document.activeElement)) setActiveHint(current => current === resource.key ? null : current); }}>
        <div className="o-resource-control" role={morale ? "meter" : "progressbar"} tabIndex={0}
          aria-label={resource.label} aria-valuemin={resource.min} aria-valuemax={Math.max(resource.max, resource.value)} aria-valuenow={resource.value}
          aria-valuetext={morale ? formatMorale(resource.value) + " morale" : resource.value > resource.max ? resource.value + ", above recovery limit of " + resource.max : resource.value + " of " + resource.max}
          aria-describedby={hintId} onFocus={() => setActiveHint(resource.key)} onBlur={() => setActiveHint(current => current === resource.key ? null : current)}
          onPointerDown={event => { if (event.pointerType === "touch") { event.currentTarget.focus(); setActiveHint(resource.key); } }}>
          <div className="o-resource-label"><span><resource.Icon aria-hidden="true" />{resource.label}</span>
            {morale ? <output aria-label="Crew morale value">{formatMorale(resource.value)}</output> : <span>{resource.value} / {resource.max}</span>}
          </div>
          <div className={"o-resource-track o-resource-" + resource.key}>
            <span data-negative={morale && resource.value < 0} style={morale ?
              { left: (50 + Math.min(0, resource.value) / resource.max * 50) + "%", width: (Math.abs(resource.value) / resource.max * 50) + "%" } :
              { width: (Math.min(1, resource.value / resource.max) * 100) + "%" }} />
          </div>
        </div>
        <div className="o-resource-tooltip" id={hintId} role="tooltip" hidden={activeHint !== resource.key}>
          <span>{resource.description}</span>
        </div>
      </div>;
    })}</div>
  </section>;
}
