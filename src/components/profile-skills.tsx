import { Fish, Axe, CookingPot, Hammer, Swords, Ship, Leaf } from "lucide-react";
import { gameplay, frontend } from "@/config/public";
import { MAX_SKILL_LEVEL, skillProgress, type SkillProgress } from "@/lib/skills";

const icons = { fishing: Fish, logging: Axe, cooking: CookingPot, crafting: Hammer,
  crew_battling: Swords, ship_battling: Ship, foraging: Leaf };
const formatXp = new Intl.NumberFormat(frontend.site.locale);

export function ProfileSkills({ progress }: { progress: SkillProgress }) {
  return <section className="o-profile-skills" aria-labelledby="profile-skills-title">
    <header><h2 id="profile-skills-title">Skills</h2><span>Only visible to you</span></header>
    <div className="o-skills-grid">{progress.skills.map(skill => {
      const definition = gameplay.skills.catalog.find(entry => entry.id === skill.id);
      if (!definition) return null;
      const Icon = icons[skill.id as keyof typeof icons] ?? Hammer;
      const current = skillProgress(skill.xp);
      return <article className="o-skill" key={skill.id} aria-label={definition.name}>
        <div className="o-skill-heading"><h3><Icon aria-hidden="true" />{definition.name}</h3>
          <span>Level <output aria-label={definition.name + " level"}>{current.level}</output> / {MAX_SKILL_LEVEL}</span></div>
        <div className="o-resource-track" role="progressbar" aria-label={definition.name + " level progress"}
          aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.floor(current.percent)}
          aria-valuetext={current.nextXp === null ? "Maximum level" : formatXp.format(current.remaining) + " XP to level " + (current.level + 1)}>
          <span style={{ width: current.percent + "%" }} /></div>
        <div className="o-skill-xp"><span><output aria-label={definition.name + " XP"}>{formatXp.format(skill.xp)}</output> XP</span>
          <span>{current.nextXp === null ? "Maximum level" : formatXp.format(current.remaining) + " XP to level " + (current.level + 1)}</span></div>
      </article>;
    })}</div>
  </section>;
}
