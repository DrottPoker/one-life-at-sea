"use client";

import { gameplay, durationLabel } from "@/config/public";
import { useGameState } from "@/components/game-state";
import { TrainingActionForm } from "@/components/training-action-form";
import { TrainingTierProgress } from "@/components/training-tier-progress";
import { STATS, STAT_LABELS, TRAINING_COST } from "@/lib/game";
import { trainingTier } from "@/lib/training";
import { formatGold } from "@/lib/bank";

const descriptions = { attack: "Weapon drills and striking power.", defense: "Guard drills and protection.", speed: "Footwork and coordinated movement.", accuracy: "Target practice and steady aim." };

export function CrewTrainingPanel() {
  const state = useGameState(), tier = trainingTier("crew", state.training.progress.crew.tier_id);
  const ready = state.energy >= TRAINING_COST && !state.active_attack && !state.hospital_until;
  return <>
    <TrainingTierProgress group="crew" />
    <div className="o-training-intro">
      <p className="o-training-heading">A sharper crew, one drill at a time.</p>
      <p className="o-copy">Spend <strong>{TRAINING_COST} Energy</strong> for <strong>{formatGold(tier.statGain)} {tier.statGain === 1 ? "point" : "points"}</strong>.</p>
      <p className="o-copy"><strong>{gameplay.training.perfectChanceBps / 100}% Perfect Drill chance</strong>: {gameplay.training.perfectMultiplier}x stat gain.</p>
    </div>
    <TrainingActionForm label="Crew training" fields={{ action: "crew", tier_id: tier.id }}>
      {blocked => <>
        <div className="o-training-head" aria-hidden="true"><span>Stat</span><span>Current</span><span>Improve</span></div>
        <div className="o-training-rows">{STATS.map(stat => <div className="o-training-row" key={stat}>
          <div><h2>{STAT_LABELS[stat]}</h2><p>{descriptions[stat]}</p></div>
          <output aria-label={STAT_LABELS[stat] + " stat"}>{formatGold(state[`crew_${stat}`])}</output>
          <button className="o-training-button" type="submit" name="stat" value={stat}
            aria-label={`Train ${STAT_LABELS[stat]} for ${TRAINING_COST} Energy`} disabled={blocked || !ready}>Train +{formatGold(tier.statGain)}</button>
        </div>)}</div>
        <div className="o-panel-foot o-training-foot"><span>Each drill costs {TRAINING_COST} Energy.</span><span>{state.energy} Energy available</span></div>
      </>}
    </TrainingActionForm>
    {state.active_attack && <p className="o-training-feedback o-copy">Finish your current fight before training.</p>}
    {state.energy < TRAINING_COST && <p className="o-training-feedback o-copy">Not enough Energy. Recover {gameplay.resources.energyRecoveryAmount} every {durationLabel(gameplay.resources.energyRecoverySeconds)}, even while away.</p>}
  </>;
}
