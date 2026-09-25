"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { Sparkles } from "lucide-react";
import { frontend } from "@/config/public";
import { skillGains, type SkillGain, type SkillProgress } from "@/lib/skills";
import { skillIcon } from "@/components/skill-icons";

// How long a drop stays. A new gain replaces it and starts the time over; CSS fades within the same length.
export const XP_DROP_MS = 5000;
const format = new Intl.NumberFormat(frontend.site.locale);

export function XpDropCard({ gains }: { gains: SkillGain[] }) {
  return <div className="o-xp-drop" style={{ "--o-xp-drop": XP_DROP_MS + "ms" } as CSSProperties}>
    {gains.map(gain => {
      const Icon = skillIcon(gain.id);
      return <section key={gain.id} className="o-xp-drop-skill" data-level-up={gain.levelUp || undefined} aria-label={gain.name + " XP gained"}>
        <span className="o-xp-drop-icon" aria-hidden="true"><Icon /></span>
        <div className="o-xp-drop-body">
          <div className="o-xp-drop-heading"><span className="o-xp-drop-name">{gain.name}</span><strong className="o-xp-drop-gain">+{format.format(gain.gained)} XP</strong></div>
          <div className="o-xp-drop-meter" role="progressbar" aria-label={gain.name + " progress to next level"} aria-valuemin={0} aria-valuemax={100}
            aria-valuenow={Math.floor(gain.percent)} aria-valuetext={gain.nextXp === null ? "Maximum level" : format.format(gain.remaining) + " XP to level " + (gain.level + 1)}>
            <span style={{ width: gain.percent + "%" }} /></div>
          <div className="o-xp-drop-total"><span>Level {gain.level}</span><span>{format.format(gain.xp)} XP</span></div>
          <div className="o-xp-drop-next">{gain.nextXp === null ? "Maximum level" : format.format(gain.remaining) + " XP to level " + (gain.level + 1)}</div>
          {gain.levelUp && <p className="o-xp-drop-level-up"><Sparkles aria-hidden="true" />Level up! Now level {gain.level}.</p>}
        </div>
      </section>;
    })}
  </div>;
}

// Every XP gain shows here, bottom right, whatever awarded it: the own skills are compared with the previous snapshot.
export function XpDrop({ skills }: { skills: SkillProgress | null }) {
  const [seen, setSeen] = useState(skills);
  const [drop, setDrop] = useState<{ key: number; gains: SkillGain[] } | null>(null);
  if (skills !== seen) {
    setSeen(skills);
    const gains = seen && skills ? skillGains(seen, skills) : [];
    if (gains.length) setDrop({ key: (drop?.key ?? 0) + 1, gains });
  }
  useEffect(() => {
    if (!drop) return;
    const timer = window.setTimeout(() => setDrop(null), XP_DROP_MS);
    return () => window.clearTimeout(timer);
  }, [drop]);
  return <div className="o-xp-drop-region" role="status">{drop && <XpDropCard key={drop.key} gains={drop.gains} />}</div>;
}
