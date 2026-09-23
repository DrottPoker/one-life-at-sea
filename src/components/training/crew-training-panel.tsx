"use client";

import Image from "next/image";
import { ArrowUp, BookOpen, ChevronsUp, Cog, Star, UsersRound, Zap } from "lucide-react";
import { gameplay, durationLabel } from "@/config/public";
import { useGameState } from "@/components/game-state";
import { TrainingActionForm } from "@/components/training/training-action-form";
import { CrewDrillSchools } from "@/components/training/crew-drill-schools";
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
  const overview = [
    { label: "Current exercise", value: tier.name, Icon: UsersRound },
    { label: "Training tier", value: `Tier ${tierNumber} / ${tiers.length}`, Icon: ChevronsUp },
    { label: "Training efficiency", value: formatStat(tier.efficiency) + "x", Icon: Cog },
    { label: "Perfect Drill chance", value: `${perfectChance}% (${gameplay.training.perfectMultiplier}x gain)`, Icon: Star },
    { label: "Crew Morale effect", value: `${formatMorale(state.crew_morale)} (${moraleEffect})`, Icon: UsersRound },
    { label: "Energy available", value: `${state.energy} / ${gameplay.resources.energyMax}`, Icon: Zap },
  ];
  return <div className="o-crew-page">
    <header className="o-crew-hero">
      <Image className="o-crew-header-image" src="/images/training/header.webp" alt="" fill sizes="(max-width: 760px) 100vw, 940px" preload />
      <div className="o-crew-hero-content"><Image src="/images/training/attack.webp" alt="" width={82} height={82} />
        <div><h1>Crew Training</h1><p>Sharpen your crew for battle and voyage.</p></div>
      </div>
    </header>
    <dl className="o-crew-summary" aria-label="Training overview">{overview.map(({ label, value, Icon }) =>
      <div key={label}><dt><Icon aria-hidden="true" /><span>{label}</span></dt><dd>{value}</dd></div>
    )}</dl>
    <div className="o-crew-stat-grid">{STATS.map(stat => <section className="o-crew-stat" data-stat={stat} key={stat} aria-label={STAT_LABELS[stat] + " training"}>
      <Image className="o-crew-stat-art" src={"/images/training/" + stat + ".webp"} alt="" width={110} height={110} />
      <h2>{STAT_LABELS[stat]}</h2>
      <output className="o-crew-stat-value" aria-label={STAT_LABELS[stat] + " stat"}>{formatStat(state[`crew_${stat}`])}</output>
      <p className="o-crew-stat-description">{descriptions[stat]}</p>
      <TrainingActionForm label={STAT_LABELS[stat] + " drill"} className="o-crew-stat-form" fields={{ action: "crew", tier_id: tier.id, stat }} customFeedback>
        {(blocked, { result, pending, retryButton }) => <>
          <small className="o-crew-energy-cost">{TRAINING_COST} Energy per drill</small>
          <div className="o-crew-drill-result" role="status" aria-label={STAT_LABELS[stat] + " training result"} aria-atomic="true">
            {pending ? <p>Training...</p> : result.error ? <p className="o-field-error">{result.message}</p> : result.receipt?.kind === "crew" && <>
              {result.receipt.perfect && <small>Perfect Drill!</small>}
              <output aria-label={STAT_LABELS[stat] + " gained"}>+{formatStatGain(result.receipt.stat_gain)} {STAT_LABELS[stat]}</output>
            </>}
          </div>
          {retryButton && <div className="o-crew-retry">{retryButton}</div>}
          <button className="o-training-button o-crew-train" type="submit" aria-label={`Train ${STAT_LABELS[stat]} for ${TRAINING_COST} Energy`} disabled={blocked || !ready}>Train {STAT_LABELS[stat]}</button>
        </>}
      </TrainingActionForm>
    </section>)}</div>
    {state.active_combat_id && <p className="o-crew-notice" role="status">Finish your current fight before training.</p>}
    {state.energy < TRAINING_COST && <p className="o-crew-notice" role="status">Not enough Energy. Recover {gameplay.resources.energyRecoveryAmount} every {durationLabel(gameplay.resources.energyRecoverySeconds)} on the server clock, even while offline.</p>}
    <div className="o-crew-bottom-grid"><CrewDrillSchools />
      <section className="o-crew-guide" aria-label="How training works">
        <header className="o-crew-section-heading"><BookOpen aria-hidden="true" /><h2>How Training Works</h2></header>
        <ul>
          <li><Zap aria-hidden="true" /><div><h3>Spend Energy</h3><p>Each drill costs {TRAINING_COST} Energy and finishes immediately.</p></div></li>
          <li><ArrowUp aria-hidden="true" /><div><h3>Gain Stats</h3><p>Train one stat per drill. Gains grow with that stat and your training efficiency.</p></div></li>
          <li><Star aria-hidden="true" /><div><h3>Perfect Drill</h3><p>A {perfectChance}% chance of {gameplay.training.perfectMultiplier}x stat gain. Your result appears after each drill.</p></div></li>
          <li><UsersRound aria-hidden="true" /><div><h3>Crew Morale</h3><p>Current effect: {moraleEffect} training gains. Each drill costs {moraleCost} morale. Visit the tavern to raise it.</p></div></li>
        </ul>
      </section>
    </div>
  </div>;
}
