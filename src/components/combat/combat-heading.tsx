"use client";

import Link from "next/link";
import { Hourglass, Ship, Swords, Zap } from "lucide-react";
import { frontend, gameplay } from "@/config/public";
import { useServerCountdown } from "@/hooks/use-server-countdown";
import { formatCountdown } from "@/lib/time";
import { MAX_ROUNDS, PHASE_SKILLS, skillName, type Battle } from "@/lib/combat";
import { skillProgress, type SkillProgress } from "@/lib/skills";

const formatXp = new Intl.NumberFormat(frontend.site.locale);

function FightClock({ deadline, observedAt }: { deadline: string; observedAt: string }) {
  const remaining = useServerCountdown(deadline, observedAt);
  return <div className="o-combat-header-resource" data-urgent={remaining <= 15}>
    <Hourglass aria-hidden="true" />
    <span>Next order within<strong>{formatCountdown(remaining)}</strong></span>
  </div>;
}

// The battling skill of the current phase. Every attack adds its XP at once; a new level raises health only after the fight.
function BattlingXp({ skills, phase }: { skills: SkillProgress; phase: "sea" | "boarding" }) {
  const id = PHASE_SKILLS[phase], skill = skills.skills.find(entry => entry.id === id);
  if (!skill) return null;
  const Icon = phase === "sea" ? Ship : Swords, name = skillName(id);
  return <div className="o-combat-header-resource o-combat-header-xp">
    <Icon aria-hidden="true" />
    <span>{name} · Level {skillProgress(skill.xp).level}<strong><output aria-label={name + " XP"}>{formatXp.format(skill.xp)}</output> XP</strong></span>
  </div>;
}

export function CombatHeading({ battle, energy, skills, backUrl, backLabel, canLeave, finished = false }: {
  battle: Battle | null;
  energy: number;
  skills?: SkillProgress | null;
  backUrl: string;
  backLabel: string;
  canLeave: boolean;
  finished?: boolean;
}) {
  // A fight that just ended keeps its heading while the final round plays out.
  const encounter = battle?.status === "active" || finished ? battle : null;
  const active = !finished && encounter?.participant_status === "active";
  return <header className="o-combat-heading">
    <div className="o-combat-title">
      <Swords aria-hidden="true" />
      <div><span className="o-attack-brand">{frontend.site.name}</span><h1>Attacking</h1>
        <p>{encounter ? <>{finished ? "Battle over" : active ? encounter.phase === "sea" ? "Cannon combat" : "Boarding combat" : "You have left this encounter"}<span className="o-combat-round">Round {encounter.round} / {MAX_ROUNDS}</span></> : "Prepare your ship and crew"}</p>
      </div>
    </div>
    <div className="o-combat-header-resources">
      <div className="o-combat-header-resource"><Zap aria-hidden="true" /><span>Energy<strong>{energy} / {gameplay.resources.energyMax}</strong></span></div>
      {active && <FightClock deadline={encounter.deadline} observedAt={encounter.observed_at} key={encounter.observed_at} />}
      {encounter && skills && <BattlingXp skills={skills} phase={encounter.phase} />}
      {canLeave && !finished && <Link href={backUrl}>Back to {backLabel}</Link>}
    </div>
  </header>;
}
