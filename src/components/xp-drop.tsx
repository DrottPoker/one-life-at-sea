"use client";

import { useEffect, useState } from "react";
import { frontend } from "@/config/public";
import { nextXpDrop, skillGains, type SkillProgress, type XpDropState } from "@/lib/skills";
import { SkillIcon } from "@/components/skill-icons";

// How long the drop stays after the latest gain, ending with a short fade.
export const XP_DROP_MS = 5000;
const XP_DROP_FADE_MS = 300;
const format = new Intl.NumberFormat(frontend.site.locale);

export function XpDropCard({ drop, closing = false }: { drop: XpDropState; closing?: boolean }) {
  return <section className="o-xp-drop" data-closing={closing || undefined} data-level-up={drop.levelUp || undefined} aria-label={drop.name + " XP gained"}>
    <SkillIcon id={drop.id} className="o-xp-drop-icon" />
    <span className="o-xp-drop-name">{drop.name}</span>
    <strong key={drop.updates} className="o-xp-drop-gain">+{format.format(drop.gained)} XP</strong>
    <div className="o-resource-track o-xp-drop-track" role="progressbar" aria-label={drop.name + " progress to next level"}
      aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.floor(drop.percent)}
      aria-valuetext={drop.nextXp === null ? "Maximum level" : format.format(drop.remaining) + " XP to level " + (drop.level + 1)}>
      <span style={{ width: drop.percent + "%" }} /></div>
    <span className="o-xp-drop-level">{drop.levelUp && "Level up! "}Level {drop.level}</span>
    <span className="o-xp-drop-total">{format.format(drop.xp)} XP</span>
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
