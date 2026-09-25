import { gameplay } from "@/config/public";

export type SkillProgress = {
  character_level: number;
  skills: { id: string; xp: number; level: number }[];
};
export type SkillGain = { id: string; name: string; gained: number; xp: number; level: number; levelUp: boolean;
  nextXp: number | null; remaining: number; percent: number };
export const MAX_SKILL_LEVEL = gameplay.skills.xpThresholds.length;
export const MAX_CHARACTER_LEVEL = MAX_SKILL_LEVEL * gameplay.skills.catalog.length;
export const skillName = (id: string) => gameplay.skills.catalog.find(skill => skill.id === id)?.name ?? id;
// Each battling skill raises the maximum of its own health.
export const BATTLING_HEALTH: Readonly<Record<string, string>> = { crew_battling: "Crew Health", ship_battling: "Ship Health" };

// Each level after the first adds one step; the top level jumps to its own bonus. The server owns the value.
export function battlingHealthBonus(level: number) {
  if (!Number.isInteger(level) || level < 1 || level > MAX_SKILL_LEVEL) throw new RangeError("Invalid skill level.");
  const { perLevel, maxLevelBonus } = gameplay.skills.battlingHealth;
  return level === MAX_SKILL_LEVEL ? maxLevelBonus : perLevel * (level - 1);
}

export function skillProgress(experience: number) {
  if (!Number.isSafeInteger(experience) || experience < 0) throw new RangeError("Invalid skill XP.");
  const thresholds = gameplay.skills.xpThresholds;
  let low = 0, high = thresholds.length;
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);
    if (thresholds[middle] <= experience) low = middle;
    else high = middle;
  }
  const nextXp = thresholds[low + 1] ?? null;
  const earned = experience - thresholds[low];
  return { level: low + 1, nextXp, remaining: nextXp === null ? 0 : nextXp - experience,
    percent: nextXp === null ? 100 : earned / (nextXp - thresholds[low]) * 100 };
}

// XP that grew between two snapshots of the own skills, whatever awarded it. Lower XP, such as a correction, is no gain.
export function skillGains(previous: SkillProgress, next: SkillProgress): SkillGain[] {
  return next.skills.flatMap(skill => {
    const before = previous.skills.find(entry => entry.id === skill.id)?.xp;
    if (before === undefined || skill.xp <= before) return [];
    const now = skillProgress(skill.xp);
    return [{ id: skill.id, name: skillName(skill.id), gained: skill.xp - before, xp: skill.xp, level: now.level,
      levelUp: now.level > skillProgress(before).level, nextXp: now.nextXp, remaining: now.remaining, percent: now.percent }];
  });
}
