"use client";

import Link from "next/link";
import { Hourglass, Swords, Zap } from "lucide-react";
import { frontend, gameplay } from "@/config/public";
import { useServerCountdown } from "@/hooks/use-server-countdown";
import { formatCountdown } from "@/lib/time";
import { MAX_ROUNDS, type Battle } from "@/lib/combat";

function FightClock({ deadline, observedAt }: { deadline: string; observedAt: string }) {
  const remaining = useServerCountdown(deadline, observedAt);
  return <div className="o-combat-header-resource" data-urgent={remaining <= 15}>
    <Hourglass aria-hidden="true" />
    <span>Next order within<strong>{formatCountdown(remaining)}</strong></span>
  </div>;
}

export function CombatHeading({ battle, energy, backUrl, backLabel, canLeave, finished = false }: {
  battle: Battle | null;
  energy: number;
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
      {canLeave && !finished && <Link href={backUrl}>Back to {backLabel}</Link>}
    </div>
  </header>;
}
