"use client";

import { Check, ChevronsUp, LockKeyhole, ShipWheel, UsersRound } from "lucide-react";
import { useGameState } from "@/components/game-state";
import { TrainingActionForm } from "@/components/training-action-form";
import { trainingTier, trainingTiers } from "@/lib/training";
import { formatGold } from "@/lib/bank";
import { formatStat } from "@/lib/format";

export function CrewDrillSchools() {
  const state = useGameState(), progress = state.training.progress.crew;
  const tiers = trainingTiers("crew"), current = trainingTier("crew", progress.tier_id);
  const currentIndex = tiers.findIndex(tier => tier.id === current.id), next = tiers[currentIndex + 1];
  const unlocked = !!next && progress.xp >= next.xpRequired;
  const percent = !next || unlocked ? 100 : Math.min(99, Math.floor(progress.xp / next.xpRequired * 100));
  return <section className="o-crew-schools" aria-label="Crew progression">
    <header className="o-crew-section-heading"><ShipWheel aria-hidden="true" /><div><h2>Drill Schools</h2><p>Unlock stronger exercises. Your highest purchased tier is always active.</p></div></header>
    <div className="o-crew-unlock"><div><span>{next ? "Progress to " + next.name : "Fully upgraded"}</span><strong>{percent}%</strong></div>
      <progress aria-label="Crew progress" max={100} value={percent} aria-valuetext={`${percent}%`} />
    </div>
    <TrainingActionForm label={next ? "Purchase " + next.name : "Crew exercise purchases"} fields={{ action: "purchase", group: "crew", tier_id: next?.id ?? current.id }}>
      {blocked => <ul className="o-crew-school-grid">{tiers.map((tier, index) => {
        const active = index === currentIndex, owned = index < currentIndex, isNext = index === currentIndex + 1;
        const locked = !active && !owned && (!isNext || !unlocked);
        return <li className="o-crew-school" data-active={active} data-locked={locked} key={tier.id} aria-label={tier.name + (active ? ", active" : owned ? ", owned" : locked ? ", locked" : ", available")}>
          <div className="o-crew-school-art" aria-hidden="true">{locked ? <LockKeyhole /> : active ? <UsersRound /> : <Check />}</div>
          <div className="o-crew-school-content"><small>Tier {index + 1}</small><h3>{tier.name}</h3><p>{formatStat(tier.efficiency)}x efficiency</p>
            {active ? <span className="o-crew-school-status"><Check size={13} aria-hidden="true" />Active</span> : owned ? <span className="o-crew-school-status">Owned</span> : isNext ?
              <button className="o-training-button" type="submit" disabled={blocked || !unlocked || state.gold_coins < tier.goldCost}>Buy for {formatGold(tier.goldCost)} Gold Coins</button> :
              <span className="o-crew-school-status"><LockKeyhole size={12} aria-hidden="true" />Requires Tier {index}</span>}
          </div>
        </li>;
      })}</ul>}
    </TrainingActionForm>
    {next && <p className="o-crew-school-hint"><ChevronsUp size={15} aria-hidden="true" />{!unlocked ? "Keep training to unlock " + next.name + "." : state.gold_coins < next.goldCost ? "Not enough carried Gold Coins. Withdraw stored coins from the bank." : "Unlocked. Purchase to use this tier."}</p>}
  </section>;
}
