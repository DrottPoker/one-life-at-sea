"use client";

import { ArrowUp, ChevronsUp, Cog, Star, UsersRound, Zap } from "lucide-react";
import { gameplay, durationLabel } from "@/config/public";
import { useGameState } from "@/components/game-state";
import { TrainingActionForm } from "@/components/training/training-action-form";
import { PageHero } from "@/components/page-hero";
import { TrainingGuide, TrainingOverview, TrainingStatBody, TrainingStatCard } from "@/components/training/training-layout";
import { TrainingTiers } from "@/components/training/training-tiers";
import { STATS, STAT_LABELS, TRAINING_COST } from "@/lib/game";
import { trainingTier, trainingTiers } from "@/lib/training";
import { formatMorale, formatMoraleBonus } from "@/lib/morale";
import { formatStat, formatStatGain } from "@/lib/format";

const descriptions = { attack: "Weapon drills and striking power.", defense: "Guard drills and protection.", speed: "Footwork and coordinated movement.", accuracy: "Target practice and steady aim." };

export function CrewTrainingPanel() {
  const state = useGameState(), tier = trainingTier("crew", state.training.progress.crew.tier_id);
  const tiers = trainingTiers("crew"), tierNumber = tiers.findIndex(item => item.id === tier.id) + 1;
  const ready = state.energy >= TRAINING_COST && !state.active_combat_id && !state.hospital_until;
  const perfectChance = gameplay.training.perfectChanceBps / 100;
  const moraleCost = formatMorale(TRAINING_COST * gameplay.morale.lossPerEnergy).replace("+", "");
  const moraleEffect = formatMoraleBonus(state.crew_morale, "training");
  return <div className="o-training-page">
    <PageHero title="Crew Training" lead="Sharpen your crew for battle and voyage." image="/images/training/header.webp" icon="/images/training/attack.webp" />
    <TrainingOverview label="Training overview" items={[
      { label: "Current exercise", value: tier.name, Icon: UsersRound },
      { label: "Training tier", value: `Tier ${tierNumber} / ${tiers.length}`, Icon: ChevronsUp },
      { label: "Training efficiency", value: formatStat(tier.efficiency) + "x", Icon: Cog },
      { label: "Perfect Drill chance", value: `${perfectChance}% (${gameplay.training.perfectMultiplier}x gain)`, Icon: Star },
      { label: "Crew Morale effect", value: `${formatMorale(state.crew_morale)} (${moraleEffect})`, Icon: UsersRound },
      { label: "Energy available", value: `${state.energy} / ${gameplay.resources.energyMax}`, Icon: Zap },
    ]} />
    <div className="o-training-stat-grid">{STATS.map(stat => <TrainingStatCard key={stat} stat={stat} value={state[`crew_${stat}`]} description={descriptions[stat]}
      image={"/images/training/" + stat + ".webp"} label={STAT_LABELS[stat] + " training"}>
      <TrainingActionForm label={STAT_LABELS[stat] + " drill"} className="o-training-stat-form" fields={{ action: "crew", tier_id: tier.id, stat }} customFeedback>
        {(blocked, { result, pending, retryButton }) => <TrainingStatBody note={TRAINING_COST + " Energy per drill"} resultLabel={STAT_LABELS[stat] + " training result"}
          result={pending ? <p>Training...</p> : result.error ? <p className="o-field-error">{result.message}</p> : result.receipt?.kind === "crew" && <>
            {result.receipt.perfect && <span className="o-training-perfect">Perfect Drill</span>}
            <output aria-label={STAT_LABELS[stat] + " gained"}>+{formatStatGain(result.receipt.stat_gain)} {STAT_LABELS[stat]}</output>
          </>}>
          {retryButton ? <div className="o-training-retry">{retryButton}</div> :
            <button className="o-training-button o-training-action" type="submit" aria-label={`Train ${STAT_LABELS[stat]} for ${TRAINING_COST} Energy`} disabled={blocked || !ready}>Train {STAT_LABELS[stat]}</button>}
        </TrainingStatBody>}
      </TrainingActionForm>
    </TrainingStatCard>)}</div>
    {state.active_combat_id && <p className="o-training-notice" role="status">Finish your current fight before training.</p>}
    {state.energy < TRAINING_COST && <p className="o-training-notice" role="status">Not enough Energy. Recover {gameplay.resources.energyRecoveryAmount} every {durationLabel(gameplay.resources.energyRecoverySeconds)} on the server clock, even while offline.</p>}
    <div className="o-training-bottom-grid"><TrainingTiers group="crew" />
      <TrainingGuide title="How Training Works" items={[
        { title: "Spend Energy", text: `Each drill costs ${TRAINING_COST} Energy and finishes immediately.`, Icon: Zap },
        { title: "Gain Stats", text: "Train one stat per drill. Gains grow with that stat and your training efficiency.", Icon: ArrowUp },
        { title: "Perfect Drill", text: `A ${perfectChance}% chance of ${gameplay.training.perfectMultiplier}x stat gain. Your result appears after each drill.`, Icon: Star },
        { title: "Crew Morale", text: `Current effect: ${moraleEffect} training gains. Each drill costs ${moraleCost} morale. Visit the tavern to raise it.`, Icon: UsersRound },
      ]} />
    </div>
  </div>;
}
