"use client";

import { useState, type ReactNode } from "react";
import { Anchor, ChevronsUp, Clock, Cog, Hammer, Package, Wrench, Zap } from "lucide-react";
import { gameplay, durationLabel } from "@/config/public";
import { useGameState } from "@/components/game-state";
import { TrainingActionForm } from "@/components/training/training-action-form";
import { PageHero } from "@/components/page-hero";
import { TrainingGuide, TrainingOverview, TrainingStatBody, TrainingStatCard } from "@/components/training/training-layout";
import { TrainingTiers } from "@/components/training/training-tiers";
import { useServerCountdown } from "@/hooks/use-server-countdown";
import { formatCountdown } from "@/lib/time";
import { formatStat, formatStatGain } from "@/lib/format";
import { formatItemCount } from "@/lib/inventory";
import { STATS, STAT_LABELS, type Stat } from "@/lib/game";
import { trainingTier, trainingTiers, shipTrainingStatGain, shipMaterialCosts, type ShipJob } from "@/lib/training";

// Placeholder art shared with Crew Training until ship artwork is supplied.
const art = { header: "/images/training/header.webp", icon: "/images/training/defense.webp", stat: (stat: Stat) => "/images/training/" + stat + ".webp" };
const descriptions = { attack: "Cannons, gunports and boarding gear.", defense: "Hull planking and reinforced frames.", speed: "Sails, rigging and a clean hull.", accuracy: "Gun sights and steady carriages." };

function ShipCountdown({ job, observedAt }: { job: ShipJob; observedAt: string }) {
  const seconds = useServerCountdown(job.finishes_at, observedAt);
  return <>{seconds ? formatCountdown(seconds) + " remaining" : "Completing..."}</>;
}

function ShipStatGrid({ control, selectable }: { selectable?: boolean; control: (stat: Stat) => { selected?: boolean; result?: ReactNode; action: ReactNode } }) {
  const state = useGameState(), minimum = gameplay.training.shipMinEnergy;
  return <div className="o-training-stat-grid" role={selectable ? "radiogroup" : undefined} aria-label={selectable ? "Ship stat" : undefined}>{STATS.map(stat => {
    const { selected, result, action } = control(stat);
    return <TrainingStatCard key={stat} stat={stat} value={state[`ship_${stat}`]} description={descriptions[stat]} image={art.stat(stat)} label={STAT_LABELS[stat] + " upgrade"} selected={selected}>
      <TrainingStatBody note={"From " + minimum + " Energy per job"} resultLabel={STAT_LABELS[stat] + " upgrade result"} result={result}>{action}</TrainingStatBody>
    </TrainingStatCard>;
  })}</div>;
}

export function ShipUpgradePanel() {
  const state = useGameState(), tier = trainingTier("ship", state.training.progress.ship.tier_id);
  const tiers = trainingTiers("ship"), tierNumber = tiers.findIndex(item => item.id === tier.id) + 1;
  const minimum = gameplay.training.shipMinEnergy, secondsPerEnergy = gameplay.training.shipSecondsPerEnergy;
  const [stat, setStat] = useState<Stat>("attack"), [selectedEnergy, setSelectedEnergy] = useState(minimum);
  const available = Math.max(0, Math.floor(state.energy)), maximum = Math.max(minimum, available);
  const cost = Math.max(minimum, Math.min(selectedEnergy, maximum));
  if (selectedEnergy !== cost) setSelectedEnergy(cost);
  const gain = shipTrainingStatGain(state[`ship_${stat}`], tier.efficiency, cost), duration = cost * secondsPerEnergy;
  const job = state.training.ship_job, completed = state.training.last_ship_job;
  const materials = shipMaterialCosts(cost, state.training.ship_materials);
  const enoughMaterials = materials.length > 0 && materials.every(item => item.available && item.owned >= item.quantity);
  const locked = !!state.active_combat_id || !!state.hospital_until;
  return <div className="o-training-page">
    <PageHero title="Ship Upgrades" lead="Leave the work to your shipwrights." image={art.header} icon={art.icon} />
    <TrainingOverview label="Ship work overview" items={[
      { label: "Current workshop", value: tier.name, Icon: Hammer },
      { label: "Workshop tier", value: `Tier ${tierNumber} / ${tiers.length}`, Icon: ChevronsUp },
      { label: "Training efficiency", value: formatStat(tier.efficiency) + "x", Icon: Cog },
      { label: "Work time", value: durationLabel(secondsPerEnergy) + " per Energy", Icon: Clock },
      { label: "Shipwrights", value: job ? STAT_LABELS[job.stat] + " upgrade" : "Ready for work", Icon: Wrench },
      { label: "Energy available", value: `${state.energy} / ${gameplay.resources.energyMax}`, Icon: Zap },
    ]} />
    {job ? <>
      <ShipStatGrid control={key => key === job.stat ? {
        result: <output>+{formatStatGain(job.stat_gain)} {STAT_LABELS[key]}</output>,
        action: <span className="o-ship-card-status"><ShipCountdown job={job} observedAt={state.observed_at} /></span>,
      } : { action: <span className="o-ship-card-status" data-idle>Workshop busy</span> }} />
      <section className="o-ship-order" aria-label="Ship work in progress">
        <header className="o-training-section-heading"><Hammer aria-hidden="true" /><div><h2>{STAT_LABELS[job.stat]} upgrade</h2><p><ShipCountdown job={job} observedAt={state.observed_at} /></p></div></header>
        <div className="o-ship-job">
          <p className="o-work-preview"><strong>+{formatStatGain(job.stat_gain)} {STAT_LABELS[job.stat]}</strong><span>{job.workshop_name}</span></p>
          <p className="o-form-hint">{job.energy_cost} Energy paid. Your ship stays in harbor until the work is complete.</p>
          {job.materials.length > 0 && <p className="o-form-hint">Materials used: {job.materials.map(item => `${formatItemCount(item.quantity)} ${item.name}`).join(", ")}.</p>}
        </div>
      </section>
    </> : <TrainingActionForm label="Start ship work" className="o-ship-work" fields={{ action: "ship", tier_id: tier.id }}>
      {blocked => <>
        <ShipStatGrid selectable control={key => ({ selected: key === stat, action:
          <label className="o-training-button o-training-action o-ship-select">
            <input type="radio" name="stat" value={key} aria-label={STAT_LABELS[key]} checked={key === stat} disabled={blocked || locked} onChange={() => setStat(key)} />
            {key === stat ? "Selected" : "Select " + STAT_LABELS[key]}
          </label> })} />
        <section className="o-ship-order" aria-label="New ship work">
          <header className="o-training-section-heading"><Hammer aria-hidden="true" /><div><h2>Work Order</h2><p>One job at a time. Energy and materials are paid when the work starts.</p></div></header>
          <fieldset className="o-ship-order-body" disabled={blocked || locked}>
            <div className="o-ship-order-plan">
              <div className="o-field o-work-size">
                <div className="o-work-size-label"><label className="o-field-label" htmlFor="ship-size">Work size</label>
                  <output htmlFor="ship-size">{cost} Energy</output></div>
                <input id="ship-size" name="energy_amount" type="range" min={minimum} max={maximum} step={1}
                  value={cost} disabled={available < minimum} onChange={e => setSelectedEnergy(Number(e.target.value))}
                  aria-valuetext={cost + " Energy, " + durationLabel(duration)} aria-describedby="ship-size-limits" />
                <div className="o-work-size-limits" id="ship-size-limits"><span>{minimum} Energy minimum</span><span>{available} Energy available</span></div>
              </div>
              <p className="o-work-preview"><strong>+{formatStatGain(gain)} {STAT_LABELS[stat]}</strong><span>{cost} Energy · {durationLabel(duration)}</span></p>
            </div>
            <div className="o-ship-order-cost">
              <div className="o-ship-materials" aria-label="Required materials"><strong>Materials required</strong>
                <ul>{materials.map(item => <li key={item.item_id} data-missing={!item.available || item.owned < item.quantity}>
                  <span>{item.name}</span><span>{formatItemCount(item.quantity)} required · {formatItemCount(item.owned)} owned{!item.available && " · Unavailable"}</span>
                </li>)}</ul>
                <small>Material costs round up per {gameplay.training.shipMaterialEnergy} Energy.</small>
              </div>
              <button className="o-training-button o-ship-start" type="submit" disabled={state.energy < cost || !enoughMaterials}>Start work</button>
              {!enoughMaterials && <p className="o-form-hint">You need the required materials in your inventory.</p>}
              {state.energy < cost && <p className="o-form-hint">Not enough Energy for this job.</p>}
            </div>
          </fieldset>
        </section>
      </>}
    </TrainingActionForm>}
    {completed && <p className="o-training-notice" role="status">Last job completed: +{formatStatGain(completed.stat_gain)} {STAT_LABELS[completed.stat]}.</p>}
    {state.active_combat_id && <p className="o-training-notice" role="status">Finish your current fight to start new work. Existing work continues.</p>}
    <div className="o-training-bottom-grid"><TrainingTiers group="ship" />
      <TrainingGuide title="How Ship Work Works" items={[
        { title: "Choose the Work", text: "Pick one ship stat. Your shipwrights handle one job at a time.", Icon: Hammer },
        { title: "Set the Work Size", text: `Spend at least ${minimum} Energy. Each Energy adds ${durationLabel(secondsPerEnergy)} of work and a larger gain.`, Icon: Clock },
        { title: "Pay Up Front", text: `Energy and materials are paid when the work starts. Materials round up per ${gameplay.training.shipMaterialEnergy} Energy.`, Icon: Package },
        { title: "Offline Progress", text: "Stats arrive when the work is complete, even while you are away. Your ship stays in harbor until then.", Icon: Anchor },
      ]} />
    </div>
  </div>;
}
