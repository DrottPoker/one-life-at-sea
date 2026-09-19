"use client";

import { gameplay, durationLabel } from "@/config/public";

import { useActionState } from "react";
import { trainStat } from "@/app/training-actions";
import { useGameState } from "@/components/game-state";
import { STATS, STAT_LABELS, TRAINING_COST, TRAINING_GAIN, type TrainingGroup, type TrainingResult } from "@/lib/game";

const descriptions = {
  crew: { attack: "Weapon drills and striking power.", defense: "Guard drills and protection.", speed: "Footwork and coordinated movement.", accuracy: "Target practice and steady aim." },
  ship: { attack: "Improve your cannon firepower.", defense: "Reinforce the hull's protection.", speed: "Improve sails and rigging.", accuracy: "Fine-tune your cannon alignment." },
};

export function TrainingPanel({ group }: { group: TrainingGroup }) {
  const state = useGameState();
  const [result, action, pending] = useActionState<TrainingResult, FormData>(trainStat, {});
  const ready = state.energy >= TRAINING_COST && !state.active_attack;
  const verb = group === "crew" ? "Train" : "Upgrade";
  return <>
    <div className="o-training-intro">
      <p className="o-training-heading">{group === "crew" ? "A sharper crew, one drill at a time." : "Make your ship your own."}</p>
      <p className="o-copy">Spend <strong>{TRAINING_COST} Energy</strong> to increase one stat by <strong>{TRAINING_GAIN} {TRAINING_GAIN === 1 ? "point" : "points"}</strong>.</p>
    </div>
    <form action={action} aria-label={group === "crew" ? "Crew training" : "Ship upgrades"} aria-busy={pending}>
      <input type="hidden" name="group" value={group} />
      <div className="o-training-head" aria-hidden="true"><span>Stat</span><span>Current</span><span>Improve</span></div>
      <div className="o-training-rows">{STATS.map(stat => <div className="o-training-row" key={stat}>
        <div><h2>{STAT_LABELS[stat]}</h2><p>{descriptions[group][stat]}</p></div>
        <output aria-label={`${STAT_LABELS[stat]} stat`}>{state[`${group}_${stat}`]}</output>
        <button className="o-training-button" type="submit" name="stat" value={stat}
          aria-label={`${verb} ${STAT_LABELS[stat]} for ${TRAINING_COST} Energy`}
          aria-describedby="training-cost" disabled={pending || !ready}>
          {verb} +{TRAINING_GAIN}
        </button>
      </div>)}</div>
      <div className="o-panel-foot o-training-foot">
        <span id="training-cost">Each {group === "crew" ? "drill" : "upgrade"} costs {TRAINING_COST} Energy.</span>
        <span>{state.energy} Energy available</span>
      </div>
    </form>
    <div className="o-training-feedback" aria-live="polite" aria-atomic="true">
      {pending ? <p>Saving your progress...</p> : result.message ? <p className={result.error ? "o-field-error" : ""}>{result.message}</p> : null}
      {state.active_attack && <p className="o-copy">Training is paused during your current fight.</p>}
      {state.energy < TRAINING_COST && !pending && <p className="o-copy">Not enough Energy. You recover 1 every {durationLabel(gameplay.resources.energyRecoverySeconds)}, even while away.</p>}
    </div>
  </>;
}
