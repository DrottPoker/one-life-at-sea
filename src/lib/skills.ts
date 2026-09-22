import { gameplay } from "@/config/public";

export type SkillProgress = {
  character_level: number;
  skills: { id: string; xp: number; level: number }[];
};
export const MAX_SKILL_LEVEL = gameplay.skills.xpThresholds.length;
export const MAX_CHARACTER_LEVEL = MAX_SKILL_LEVEL * gameplay.skills.catalog.length;

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
