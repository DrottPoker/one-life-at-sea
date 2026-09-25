import { CombatantPanel } from "@/components/combat/combatant-panel";
import { CombatScene, type SceneFinale } from "@/components/combat/combat-scene";
import type { CombatEvent, Combatant } from "@/lib/combat";

export function CombatStage({ attacker, defender, phase, events, finale }: {
  attacker: Combatant;
  defender: Combatant;
  phase: "sea" | "boarding";
  events?: CombatEvent[];
  finale?: SceneFinale;
}) {
  return <div className="o-combat-stage" data-phase={phase}>
    <CombatantPanel captain={attacker} own phase={phase} />
    <CombatScene phase={phase} events={events} attackerId={attacker.id} defenderName={defender.name} finale={finale} />
    <CombatantPanel captain={defender} own={false} phase={phase} />
  </div>;
}
