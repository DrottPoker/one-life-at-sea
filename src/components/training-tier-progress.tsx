"use client";

import { gameplay } from "@/config/public";
import { useGameState } from "@/components/game-state";
import { TrainingActionForm } from "@/components/training-action-form";
import { trainingTier, trainingTiers } from "@/lib/training";
import { formatGold } from "@/lib/bank";
import type { TrainingGroup } from "@/lib/game";

export function TrainingTierProgress({ group }: { group: TrainingGroup }) {
  const state = useGameState(), progress = state.training.progress[group];
  const tiers = trainingTiers(group), current = trainingTier(group, progress.tier_id);
  const index = tiers.findIndex(t => t.id === current.id), next = tiers[index + 1];
  const unlocked = !!next && progress.xp >= next.xpRequired;
  const percent = !next || unlocked ? 100 : Math.min(99, Math.floor(progress.xp / next.xpRequired * 100));
  return <section className="o-tier-progress" aria-label={group === "crew" ? "Crew progression" : "Workshop progression"}>
    <div className="o-tier-heading"><div><span className="o-eyebrow">{group === "crew" ? "Current exercise" : "Current workshop"}</span>
      <h2>{current.name}</h2></div><span>Tier {index + 1} / {tiers.length}</span></div>
    <p className="o-copy"><strong>{percent}%</strong>{!next && " · Fully upgraded"}</p>
    <progress aria-label={group === "crew" ? "Crew progress" : "Workshop progress"} max={100} value={percent} aria-valuetext={`${percent}%`} />
    {next && <>
      <TrainingActionForm label={"Purchase " + next.name} fields={{ action: "purchase", group, tier_id: next.id }}>
        {blocked => <div className="o-tier-purchase"><p><strong>{next.name}</strong><span>+{formatGold(next.statGain)} per {group === "crew" ? "drill" : gameplay.training.shipEnergyPerUnit + " Energy"}</span></p>
          <button className="o-training-button" type="submit" disabled={blocked || !unlocked || state.gold_coins < next.goldCost || !!state.active_attack || !!state.hospital_until}>
            Buy for {formatGold(next.goldCost)} Gold Coins
          </button></div>}
      </TrainingActionForm>
      {unlocked && <p className="o-form-hint">{state.gold_coins < next.goldCost ? "Not enough carried Gold Coins. Withdraw stored coins from the bank." : "Unlocked. Purchase to use this tier."}</p>}
    </>}
  </section>;
}
