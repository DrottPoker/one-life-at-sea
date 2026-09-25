import { CombatantPanel } from "@/components/combat/combatant-panel";
import { CombatScene, type SceneFinale } from "@/components/combat/combat-scene";
import type { CombatEvent, Combatant } from "@/lib/combat";
import type { SkillProgress } from "@/lib/skills";

export function CombatStage({ attacker, defender, phase, events, skills, finale }: {
  attacker: Combatant;
  defender: Combatant;
  phase: "sea" | "boarding";
  events?: CombatEvent[];
  skills?: SkillProgress | null;
  finale?: SceneFinale;
}) {
  return <div className="o-combat-stage" data-phase={phase}>
    <CombatantPanel captain={attacker} own phase={phase} />
    <CombatScene phase={phase} events={events} attackerId={attacker.id} defenderName={defender.name} skills={skills} finale={finale} />
    <CombatantPanel captain={defender} own={false} phase={phase} />
  </div>;
}
