"use client";

import { useEffect, useState } from "react";
import { frontend } from "@/config/public";
import { useCountUp } from "@/hooks/use-count-up";
import { nextXpDrop, skillGains, skillProgress, type SkillProgress, type XpDropState } from "@/lib/skills";
import { SkillIcon } from "@/components/skill-icons";

// How long the drop stays after the latest gain, ending with a short fade.
export const XP_DROP_MS = 5000;
const XP_DROP_FADE_MS = 300;
// The gain, total and bar rise to new XP this quickly.
const XP_COUNT_MS = 450;
const format = new Intl.NumberFormat(frontend.site.locale);

// The numbers and bar rise from their previous values; screen readers get the final values once instead.
function XpDropProgress({ drop }: { drop: XpDropState }) {
  const gained = Math.round(useCountUp(drop.gained, 0, XP_COUNT_MS));
  const xp = Math.round(useCountUp(drop.xp, drop.xp - drop.gained, XP_COUNT_MS));
  const shown = skillProgress(xp), next = drop.nextXp === null ? "Maximum level" : format.format(drop.remaining) + " XP to level " + (drop.level + 1);
  // A level-up shows once the rising bar reaches the new level.
  const levelUp = drop.levelUp && shown.level === drop.level;
  return <>
    <strong key={drop.updates} className="o-xp-drop-gain" aria-hidden="true">+{format.format(gained)} XP</strong>
    <div className="o-resource-track o-xp-drop-track" role="progressbar" aria-label={drop.name + " progress to next level"}
      aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.floor(drop.percent)} aria-valuetext={next}>
      <span style={{ width: shown.percent + "%" }} /></div>
    <span className="o-xp-drop-level" data-level-up={levelUp || undefined} aria-hidden="true">{levelUp && "Level up! "}Level {shown.level}</span>
    <span className="o-xp-drop-total" aria-hidden="true">{format.format(xp)} XP</span>
    <span className="o-xp-drop-summary">+{format.format(drop.gained)} XP. {drop.levelUp && "Level up! "}Level {drop.level}. {format.format(drop.xp)} XP.</span>
  </>;
}

export function XpDropCard({ drop, closing = false }: { drop: XpDropState; closing?: boolean }) {
  return <section className="o-xp-drop" data-closing={closing || undefined} aria-label={drop.name + " XP gained"}>
    <SkillIcon id={drop.id} className="o-xp-drop-icon" />
    <span className="o-xp-drop-name">{drop.name}</span>
    <XpDropProgress key={drop.id} drop={drop} />
  </section>;
}

// Every XP gain shows here, bottom right, whatever awarded it: the own skills are compared with the previous snapshot.
// More XP while the drop is up updates it in place and starts its time over.
export function XpDrop({ skills }: { skills: SkillProgress | null }) {
  const [seen, setSeen] = useState(skills);
  const [drop, setDrop] = useState<XpDropState | null>(null);
  const [closing, setClosing] = useState(false);
  if (skills !== seen) {
    setSeen(skills);
    const next = seen && skills ? nextXpDrop(drop, skillGains(seen, skills)) : drop;
    if (next !== drop) {
      setDrop(next);
      setClosing(false);
    }
  }
  useEffect(() => {
    if (!drop) return;
    const fade = window.setTimeout(() => setClosing(true), XP_DROP_MS - XP_DROP_FADE_MS);
    const hide = window.setTimeout(() => { setDrop(null); setClosing(false); }, XP_DROP_MS);
    return () => { window.clearTimeout(fade); window.clearTimeout(hide); };
  }, [drop]);
  return <div className="o-xp-drop-region" role="status">{drop && <XpDropCard drop={drop} closing={closing} />}</div>;
}
