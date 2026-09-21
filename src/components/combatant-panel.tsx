import { gameplay } from "@/config/public";
import Link from "next/link";
import { Ship, ShipWheel, Skull, Swords, Crosshair, HelpCircle, Shield } from "lucide-react";
import { STATS, STAT_LABELS } from "@/lib/game";
import { formatStat } from "@/lib/format";
import type { Combatant } from "@/lib/combat";

const statIcons = { attack: Swords, defense: Shield, speed: Ship, accuracy: Crosshair };

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
        const label = kind === "ship" ? "Ship Health" : "Crew Health";
        return <div className={"o-combat-health-row " + (phase === (kind === "ship" ? "sea" : "boarding") ? "is-current" : "")} key={kind}>
          <div><span>{label}</span><strong>{hp} / {gameplay.resources.healthMax}</strong></div>
          <div className={"o-resource-track o-resource-" + kind} role="progressbar" aria-label={prefix + " " + label}
            aria-valuenow={hp} aria-valuemin={0} aria-valuemax={gameplay.resources.healthMax}>
            <span style={{ width: (hp / gameplay.resources.healthMax * 100) + "%" }} />
          </div>
        </div>;
      })}
    </div>
    <div className="o-combat-equipment-heading">Ship equipment</div>
    <dl className="o-combat-equipment">
      <div className={phase === "sea" ? "is-current" : ""}>
        <dt><Crosshair aria-hidden="true" />Cannons</dt>
        <dd>{captain.cannons ?? <span className="o-unknown"><HelpCircle aria-hidden="true" />Unknown</span>}</dd>
        <small>{captain.ammo === null ? "Ammunition unknown" : captain.ammo + " salvos remaining"}</small>
      </div>
      <div className={phase === "boarding" ? "is-current" : ""}>
        <dt><Swords aria-hidden="true" />Crew weapon</dt>
        <dd>{captain.weapon ?? <span className="o-unknown"><HelpCircle aria-hidden="true" />Unknown</span>}</dd>
        <small>{captain.weapon ? "No ammunition required" : "Equipment concealed"}</small>
      </div>
    </dl>
    <div className="o-combat-stats-heading">{phase === "sea" ? "Ship stats" : "Crew stats"}</div>
    <dl className="o-combat-stats" aria-label={prefix + " " + (phase === "sea" ? "ship" : "crew") + " stats"}>
      {STATS.map(stat => {
        const Icon = statIcons[stat];
        return <div key={stat}><dt><Icon aria-hidden="true" />{STAT_LABELS[stat]}</dt><dd>{stats ? formatStat(stats[stat]) : "?"}</dd></div>;
      })}
    </dl>
  </section>;
}
