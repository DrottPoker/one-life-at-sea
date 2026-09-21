import Image from "next/image";
import { Anchor, Swords } from "lucide-react";
import { CombatantPanel } from "@/components/combatant-panel";
import type { Combatant } from "@/lib/combat";

export function CombatStage({ attacker, defender, phase }: {
  attacker: Combatant;
  defender: Combatant;
  phase: "sea" | "boarding";
}) {
  const boarding = phase === "boarding";
  const Icon = boarding ? Swords : Anchor;
  return <div className="o-combat-stage" data-phase={phase}>
    <CombatantPanel captain={attacker} own phase={phase} />
    <figure className="o-combat-scene">
      <div className="o-combat-scene-art">
        <Image
          src={boarding ? "/images/combat-boarding.webp" : "/images/combat-sea.webp"}
          alt={boarding ? "Two pirate crews clash across the decks of their ships." : "Two sailing ships face each other on the open sea."}
          width={1774} height={887}
          sizes="(max-width: 800px) 100vw, (max-width: 1400px) 45vw, 600px"
          loading="eager"
        />
        <span className="o-combat-versus" aria-hidden="true">VS</span>
      </div>
      <figcaption><Icon aria-hidden="true" /><span>{boarding ? "Steel. Blood. Plunder." : "Two ships. One victory."}</span></figcaption>
    </figure>
    <CombatantPanel captain={defender} own={false} phase={phase} />
  </div>;
}
