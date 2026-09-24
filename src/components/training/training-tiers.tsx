"use client";

import { Check, ChevronsUp, Hammer, LockKeyhole, ShipWheel, UsersRound } from "lucide-react";
import { useGameState } from "@/components/game-state";
import { TrainingActionForm } from "@/components/training/training-action-form";
import { trainingTier, trainingTiers } from "@/lib/training";
import { formatGold } from "@/lib/bank";
import { formatStat } from "@/lib/format";
import type { TrainingGroup } from "@/lib/game";

const copy = {
  crew: { region: "Crew progression", progress: "Crew progress", title: "Drill Schools", lead: "Unlock stronger exercises. Your highest purchased tier is always active.", keepGoing: "Keep training", ActiveIcon: UsersRound },
  ship: { region: "Workshop progression", progress: "Workshop progress", title: "Shipyard Workshops", lead: "Unlock better workshops. Your highest purchased workshop is always active.", keepGoing: "Keep upgrading", ActiveIcon: Hammer },
};

export function TrainingTiers({ group }: { group: TrainingGroup }) {
  const state = useGameState(), progress = state.training.progress[group], text = copy[group];
  const tiers = trainingTiers(group), current = trainingTier(group, progress.tier_id);
  const currentIndex = tiers.findIndex(tier => tier.id === current.id), next = tiers[currentIndex + 1];
  const unlocked = !!next && progress.xp >= next.xpRequired;
  const percent = !next || unlocked ? 100 : Math.min(99, Math.floor(progress.xp / next.xpRequired * 100));
  return <section className="o-training-tiers" aria-label={text.region}>
    <header className="o-training-section-heading"><ShipWheel aria-hidden="true" /><div><h2>{text.title}</h2><p>{text.lead}</p></div></header>
    <div className="o-training-unlock"><div><span>{next ? "Progress to " + next.name : "Fully upgraded"}</span><strong>{percent}%</strong></div>
      <progress aria-label={text.progress} max={100} value={percent} aria-valuetext={`${percent}%`} />
    </div>
    <TrainingActionForm label={next ? "Purchase " + next.name : text.title + " purchases"} fields={{ action: "purchase", group, tier_id: next?.id ?? current.id }}>
      {blocked => <ul className="o-training-tier-grid">{tiers.map((tier, index) => {
        const active = index === currentIndex, owned = index < currentIndex, isNext = index === currentIndex + 1;
        const locked = !active && !owned && (!isNext || !unlocked);
        return <li className="o-training-tier" data-active={active} data-locked={locked} key={tier.id} aria-label={tier.name + (active ? ", active" : owned ? ", owned" : locked ? ", locked" : ", available")}>
          <div className="o-training-tier-art" aria-hidden="true">{locked ? <LockKeyhole /> : active ? <text.ActiveIcon /> : <Check />}</div>
          <div className="o-training-tier-content"><small>Tier {index + 1}</small><h3>{tier.name}</h3><p>{formatStat(tier.efficiency)}x efficiency</p>
            {active ? <span className="o-training-tier-status"><Check size={13} aria-hidden="true" />Active</span> : owned ? <span className="o-training-tier-status">Owned</span> : isNext ?
              <button className="o-training-button" type="submit" disabled={blocked || !unlocked || state.gold_coins < tier.goldCost}>Buy for {formatGold(tier.goldCost)} Gold Coins</button> :
              <span className="o-training-tier-status"><LockKeyhole size={12} aria-hidden="true" />Requires Tier {index}</span>}
          </div>
        </li>;
      })}</ul>}
    </TrainingActionForm>
    {next && <p className="o-training-tier-hint"><ChevronsUp size={15} aria-hidden="true" />{!unlocked ? text.keepGoing + " to unlock " + next.name + "." : state.gold_coins < next.goldCost ? "Not enough carried Gold Coins. Withdraw stored coins from the bank." : "Unlocked. Purchase to use this tier."}</p>}
  </section>;
}
