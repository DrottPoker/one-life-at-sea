"use client";

import { useActionState, useRef, useState } from "react";
import { Axe, Fish, Leaf, Compass } from "lucide-react";
import { gameplay, frontend } from "@/config/public";
import { useGameState } from "@/components/game-state";
import { useEconomyRequests } from "@/components/economy-requests";
import { skillProgress, type SkillProgress } from "@/lib/skills";
import type { ActivityResult } from "@/lib/activities";

const icons = { fishing: Fish, logging: Axe, foraging: Leaf };
const format = new Intl.NumberFormat(frontend.site.locale);

export function ActivitiesPanel({ progress }: { progress: SkillProgress }) {
  const state = useGameState(), journal = useEconomyRequests();
  const request = useRef<FormData | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [result, action, pending] = useActionState<ActivityResult, FormData>(async (_previous, form) => {
    if (!request.current) { form.set("request_id", crypto.randomUUID()); request.current = form; }
    const activity = String(request.current.get("activity_id"));
    setActive(activity);
    const response = await journal.activity(request.current);
    if (!response.retry) request.current = null;
    return { ...response, activity_id: activity };
  }, {});
  const locked = !!state.active_combat_id || !!state.hospital_until || state.sea.state !== "in_harbor";
  const enoughStamina = state.stamina >= gameplay.stamina.activityCost;
  return <div className="o-activities">
    <p className="o-activities-intro">Explore the shore, practice a skill and earn experience.</p>
    {!enoughStamina && <p className="o-copy o-activities-notice" role="status">You need {gameplay.stamina.activityCost} Stamina to do an activity. Stamina recovers over time.</p>}
    {locked && <p className="o-copy o-activities-notice">Activities are available in The Harbor, outside combat and hospital.</p>}
    <div className="o-activities-list">{gameplay.activities.catalog.filter(activity => activity.active).map(activity => {
      const skill = progress.skills.find(entry => entry.id === activity.skillId);
      if (!skill) return null;
      const current = skillProgress(skill.xp);
      const skillName = gameplay.skills.catalog.find(entry => entry.id === skill.id)!.name;
      const Icon = icons[skill.id as keyof typeof icons] ?? Compass;
      const retry = !!result.retry && result.activity_id === activity.id;
      const xpLimit = skill.xp === Number.MAX_SAFE_INTEGER;
      return <section className="o-activity" key={activity.id} aria-labelledby={"activity-" + activity.id}>
        <div className="o-activity-icon" aria-hidden="true"><Icon /></div>
        <div className="o-activity-details">
          <h2 id={"activity-" + activity.id}>{activity.name}</h2>
          <p>{activity.description}</p>
          <div className="o-activity-skill"><span>{skillName} · Level <output aria-label={activity.name + " level"}>{current.level}</output></span>
            <span><output aria-label={activity.name + " XP"}>{format.format(skill.xp)}</output> XP</span></div>
          <div className="o-resource-track" role="progressbar" aria-label={activity.name + " level progress"}
            aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.floor(current.percent)}
            aria-valuetext={current.nextXp === null ? "Maximum level" : format.format(current.remaining) + " XP to level " + (current.level + 1)}>
            <span style={{ width: current.percent + "%" }} /></div>
        </div>
        <form action={action} className="o-activity-action" aria-label={activity.name} aria-busy={pending && active === activity.id}>
          <input type="hidden" name="activity_id" value={activity.id} />
          <input type="hidden" name="stamina_cost" value={gameplay.stamina.activityCost} />
          <input type="hidden" name="xp_gain" value={activity.xpGain} />
          <span>+{format.format(activity.xpGain)} {skillName} XP</span>
          <button type="submit" className="o-training-button" aria-label={retry ? "Retry " + activity.name : activity.buttonLabel + " for " + gameplay.stamina.activityCost + " Stamina"}
            disabled={pending || (!retry && (locked || journal.unconfirmed || !!result.retry || !enoughStamina || xpLimit))}>
            {pending && active === activity.id ? "Working..." : retry ? "Check activity" : activity.buttonLabel}
          </button>
          <small>{gameplay.stamina.activityCost} Stamina</small>
        </form>
        <div className="o-activity-feedback" role="status" aria-atomic="true">
          {result.activity_id === activity.id && result.message && <span className={result.error ? "o-field-error" : ""}>{result.message}</span>}
        </div>
      </section>;
    })}</div>
  </div>;
}
