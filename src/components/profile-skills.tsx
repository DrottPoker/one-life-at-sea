import { HeartPulse, Lock, Pickaxe } from "lucide-react";
import { gameplay, frontend } from "@/config/public";
import { BATTLING_HEALTH, MAX_SKILL_LEVEL, battlingHealthBonus, skillProgress, type SkillProgress } from "@/lib/skills";
import { SkillIcon } from "@/components/skill-icons";

const formatNumber = new Intl.NumberFormat(frontend.site.locale);

export function ProfileSkills({ progress }: { progress: SkillProgress }) {
  return <section className="o-profile-card o-profile-skills" aria-labelledby="profile-skills-title">
    <header className="o-profile-card-head"><h2 id="profile-skills-title"><Pickaxe aria-hidden="true" />Skills</h2><span><Lock aria-hidden="true" />Only visible to you</span></header>
    <div className="o-skills-list">{progress.skills.map(skill => {
      const definition = gameplay.skills.catalog.find(entry => entry.id === skill.id);
      if (!definition) return null;
      const current = skillProgress(skill.xp), health = BATTLING_HEALTH[skill.id];
      return <article className="o-skill" key={skill.id} aria-label={definition.name}>
        <SkillIcon id={skill.id} className="o-skill-icon" />
        <h3>{definition.name}</h3>
        <div className="o-resource-track" role="progressbar" aria-label={definition.name + " level progress"}
          aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.floor(current.percent)}
          aria-valuetext={current.nextXp === null ? "Maximum level" : formatNumber.format(current.remaining) + " XP to level " + (current.level + 1)}>
          <span style={{ width: current.percent + "%" }} /></div>
        <span className="o-skill-level">Level <output aria-label={definition.name + " level"}>{current.level}</output> / {MAX_SKILL_LEVEL}</span>
        <span className="o-skill-xp"><output aria-label={definition.name + " XP"}>{formatNumber.format(skill.xp)}</output> XP</span>
        <span className="o-skill-next">{current.nextXp === null ? "Maximum level" : formatNumber.format(current.remaining) + " XP to level " + (current.level + 1)}</span>
        {health && <div className="o-skill-bonus"><span><HeartPulse aria-hidden="true" />Max {health}{" "}
          <output aria-label={definition.name + " health bonus"}>+{formatNumber.format(battlingHealthBonus(current.level))}</output></span>
          {current.nextXp !== null && <span>+{formatNumber.format(battlingHealthBonus(current.level + 1) - battlingHealthBonus(current.level))} at level {current.level + 1}</span>}</div>}
      </article>;
    })}</div>
  </section>;
}
