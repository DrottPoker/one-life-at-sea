import { gameplay } from "@/config/public";
import Link from "next/link";
import { Bomb, Ship, ShipWheel, Skull, Swords, Crosshair, HelpCircle, Shield, Sailboat, Target } from "lucide-react";
import { STATS, STAT_LABELS } from "@/lib/game";
import { formatMorale, formatMoraleMultiplier } from "@/lib/morale";
import { formatStat } from "@/lib/format";
import type { Combatant } from "@/lib/combat";
import { effectLines, fallbackWeapons, hasStats, itemStatRows, SLOT_LABELS, temporaryEffect, type LoadoutItem, type RevealedItem } from "@/lib/equipment";

const statIcons = { attack: Swords, defense: Shield, speed: Ship, accuracy: Crosshair };
const statText = (item: LoadoutItem | RevealedItem | undefined) => hasStats(item) ? itemStatRows(item).filter(row => row.key !== "shots").map(row => row.label + " " + row.text).join(" · ") : "";

// Sea shows the ship's fittings, boarding the crew's arms and armor.
function equipmentCells(captain: Combatant, own: boolean, phase: "sea" | "boarding") {
  const loadout = captain.loadout;
  if (phase === "sea") return [
    { key: "cannons", label: "Cannons", Icon: Crosshair, name: loadout?.cannons?.name ?? fallbackWeapons.cannons.name,
      note: own ? (captain.ammo ?? 0) + ((captain.ammo ?? 0) === 1 ? " salvo" : " salvos") + " remaining" + (loadout?.cannons ? " · " + statText(loadout.cannons) : "") : "Ammunition unknown" },
    { key: "hull", label: "Hull", Icon: Ship, name: loadout?.hull?.name ?? "None", note: own ? statText(loadout?.hull) : "" },
    { key: "sails", label: "Sails", Icon: Sailboat, name: loadout?.sails?.name ?? "None", note: own ? statText(loadout?.sails) : "" },
  ];
  const temporary = loadout?.temporary;
  const armor = (["head", "body", "legs", "feet"] as const).filter(slot => loadout?.[slot]);
  return [
    { key: "firearm", label: "Firearm", Icon: Target, name: loadout?.firearm?.name ?? "None",
      note: own && loadout?.firearm ? (captain.shots ?? 0) + ((captain.shots ?? 0) === 1 ? " shot" : " shots") + " remaining · " + statText(loadout.firearm) : "" },
    { key: "melee", label: "Melee", Icon: Swords, name: loadout?.melee?.name ?? fallbackWeapons.melee.name, note: own ? statText(loadout?.melee) : "" },
    { key: "temporary", label: "Temporary", Icon: Bomb, name: temporary?.name ?? "None",
      note: own && temporary && "precision" in temporary ? (captain.temporary_uses ? "Ready" : (temporary.quantity ?? 0) < 1 ? "None in inventory" : "Used") + " · " + temporaryEffect(temporary) : "" },
    { key: "armor", label: "Armor", Icon: Shield, name: armor.length ? armor.map(slot => loadout![slot]!.name).join(", ") : "None",
      note: own ? armor.flatMap(slot => { const item = loadout![slot]; return hasStats(item) ? [SLOT_LABELS[slot] + " " + itemStatRows(item)[0].text] : []; }).join(" · ") : "" },
  ];
}

export function CombatantPanel({ captain, own, phase }: { captain: Combatant; own: boolean; phase: "sea" | "boarding" }) {
  const stats = phase === "sea" ? captain.ship : captain.crew;
  const prefix = own ? "Your" : "Opponent";
  return <section className={"o-combatant " + (own ? "o-combatant-own" : "o-combatant-opponent")} aria-label={prefix + " ship and crew"}>
    <header className="o-combatant-heading">
      <div className="o-combat-pennant" aria-hidden="true">{own ? <Skull /> : <ShipWheel />}</div>
      <div><h2><Link href={"/players/" + captain.player_number}>{captain.name}</Link></h2>
        <span>[{captain.player_number}] · {own ? "Your command" : "Opponent"}</span></div>
    </header>
    <div className="o-combat-health">
      {(["ship", "crew"] as const).map(kind => {
        const hp = kind === "ship" ? captain.ship_health : captain.crew_health;
        const max = kind === "ship" ? captain.ship_health_max ?? gameplay.resources.healthMax : gameplay.resources.healthMax;
        const label = kind === "ship" ? "Ship Health" : "Crew Health";
        return <div className={"o-combat-health-row " + (phase === (kind === "ship" ? "sea" : "boarding") ? "is-current" : "")} key={kind}>
          <div><span>{label}</span><strong>{hp} / {max}</strong></div>
          <div className={"o-resource-track o-resource-" + kind} role="progressbar" aria-label={prefix + " " + label}
            aria-valuenow={hp} aria-valuemin={0} aria-valuemax={max}>
            <span style={{ width: Math.min(100, hp / max * 100) + "%" }} />
          </div>
        </div>;
      })}
    </div>
    {effectLines(captain.effects).length > 0 && <ul className="o-combat-effects" aria-label={prefix + " active effects"}>
      {effectLines(captain.effects).map(line => <li key={line}>{line}</li>)}
    </ul>}
    <div className="o-combat-equipment-heading">{phase === "sea" ? "Ship equipment" : "Crew equipment"}</div>
    <dl className="o-combat-equipment">
      {equipmentCells(captain, own, phase).map(({ key, label, Icon, name, note }) => <div key={key} data-slot={key}>
        <dt><Icon aria-hidden="true" />{label}</dt>
        <dd>{captain.loadout ? name : <span className="o-unknown"><HelpCircle aria-hidden="true" />Unknown</span>}</dd>
        <small>{captain.loadout ? note : "Equipment concealed"}</small>
      </div>)}
    </dl>
    <div className="o-combat-stats-heading">{phase === "sea" ? "Ship stats" : "Crew stats"}</div>
    {own && phase === "boarding" && captain.crew_morale != null && <p className="o-combat-morale">Crew Morale {formatMorale(captain.crew_morale)} · {formatMoraleMultiplier(captain.morale_multiplier ?? 1)} stats at entry</p>}
    <dl className="o-combat-stats" aria-label={prefix + " " + (phase === "sea" ? "ship" : "crew") + " stats"}>
      {STATS.map(stat => {
        const Icon = statIcons[stat];
        return <div key={stat}><dt><Icon aria-hidden="true" />{STAT_LABELS[stat]}</dt><dd>{stats ? formatStat(stats[stat]) : "?"}</dd></div>;
      })}
    </dl>
  </section>;
}
