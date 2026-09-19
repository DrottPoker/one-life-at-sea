"use client";

import { useEffect, useState } from "react";
import { gameplay, durationLabel } from "@/config/public";
import { useGameState } from "@/components/game-state";
import { TrainingActionForm } from "@/components/training-action-form";
import { TrainingTierProgress } from "@/components/training-tier-progress";
import { STATS, STAT_LABELS, type Stat } from "@/lib/game";
import { trainingTier, type ShipJob } from "@/lib/training";
import { formatGold } from "@/lib/bank";

function ShipCountdown({ job, observedAt }: { job: ShipJob; observedAt: string }) {
  const [elapsed, setElapsed] = useState({ anchor: observedAt, seconds: 0 });
  useEffect(() => {
    const start = performance.now();
    const timer = window.setInterval(() => setElapsed({ anchor: observedAt, seconds: (performance.now() - start) / 1000 }), 1000);
    return () => window.clearInterval(timer);
  }, [observedAt]);
  const seconds = Math.max(0, Math.ceil((Date.parse(job.finishes_at) - Date.parse(observedAt)) / 1000 -
    (elapsed.anchor === observedAt ? elapsed.seconds : 0)));
  return <span>{seconds ? Math.floor(seconds / 60) + ":" + String(seconds % 60).padStart(2, "0") + " remaining" : "Completing..."}</span>;
}

export function ShipUpgradePanel() {
  const state = useGameState(), tier = trainingTier("ship", state.training.progress.ship.tier_id);
  const [stat, setStat] = useState<Stat>("attack"), [sizeId, setSizeId] = useState(gameplay.training.shipSizes[0].id);
  const size = gameplay.training.shipSizes.find(s => s.id === sizeId) ?? gameplay.training.shipSizes[0];
  const cost = gameplay.training.energyCost * size.units, gain = tier.statGain * size.units;
  const job = state.training.ship_job, completed = state.training.last_ship_job;
  return <>
    <TrainingTierProgress group="ship" />
    <div className="o-training-intro">
      <p className="o-training-heading">Leave the work to your shipwrights.</p>
      <p className="o-copy">One job at a time. Energy is paid at the start; stats arrive when the work is complete, even while you are away.</p>
    </div>
    <div className="o-ship-stats">{STATS.map(key => <div key={key}><span>{STAT_LABELS[key]}</span><output aria-label={STAT_LABELS[key] + " stat"}>{formatGold(state[`ship_${key}`])}</output></div>)}</div>
    {job ? <section className="o-ship-job" aria-label="Ship work in progress">
      <div className="o-tier-heading"><h2>{STAT_LABELS[job.stat]} upgrade</h2><ShipCountdown job={job} observedAt={state.observed_at} /></div>
      <p className="o-copy">{job.workshop_name} · +{formatGold(job.stat_gain)} {STAT_LABELS[job.stat]}</p>
      <p className="o-form-hint">{job.energy_cost} Energy paid. You can keep playing while the work continues.</p>
    </section> : <TrainingActionForm label="Start ship work" fields={{ action: "ship", tier_id: tier.id }}>
      {blocked => <fieldset className="o-ship-order" disabled={blocked || !!state.active_attack || !!state.hospital_until}>
        <legend>New ship work</legend>
        <div className="o-ship-choices">
          <div className="o-field"><label className="o-field-label" htmlFor="ship-stat">Stat</label>
            <select id="ship-stat" name="stat" value={stat} onChange={e => setStat(e.target.value as Stat)}>{STATS.map(key => <option key={key} value={key}>{STAT_LABELS[key]}</option>)}</select></div>
          <div className="o-field"><label className="o-field-label" htmlFor="ship-size">Work size</label>
            <select id="ship-size" name="size_id" value={size.id} onChange={e => setSizeId(e.target.value)}>{gameplay.training.shipSizes.map(s =>
              <option key={s.id} value={s.id}>{s.name} · {durationLabel(s.durationSeconds)}</option>)}</select></div>
        </div>
        <p className="o-work-preview"><strong>+{formatGold(gain)} {STAT_LABELS[stat]}</strong><span>{cost} Energy · {durationLabel(size.durationSeconds)}</span></p>
        <button className="o-training-button" type="submit" disabled={state.energy < cost}>Start work</button>
        {state.energy < cost && <p className="o-form-hint">Not enough Energy for this job.</p>}
      </fieldset>}
    </TrainingActionForm>}
    {completed && <div className="o-ship-completed" role="status">Last job completed: +{formatGold(completed.stat_gain)} {STAT_LABELS[completed.stat]}.</div>}
    {state.active_attack && <p className="o-training-feedback o-copy">Finish your current fight to start new work. Existing work continues.</p>}
  </>;
}
