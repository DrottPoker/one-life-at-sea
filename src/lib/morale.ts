import { gameplay, frontend } from "@/config/public";

function moraleUnits(morale: number) {
  if (!Number.isFinite(morale) || Math.abs(morale) > gameplay.morale.maximum ||
    Math.abs(morale * 10 - Math.round(morale * 10)) > 0.000001) throw new RangeError("Invalid morale.");
  return Math.round(morale * 10);
}
export function moraleMultiplier(morale: number, kind: "stats" | "training" = "stats") {
  moraleUnits(morale);
  const bonus = kind === "stats" ? gameplay.morale.statBonusBps : gameplay.morale.trainingBonusBps;
  return 1 + morale / gameplay.morale.maximum * bonus / 10000;
}
export function applyTrainingMorale(baseGain: number, morale: number) {
  const units = moraleUnits(morale);
  const denominator = BigInt(gameplay.morale.maximum * 10 * 10000);
  const numerator = denominator + BigInt(units * gameplay.morale.trainingBonusBps);
  const microGain = BigInt(Math.round(baseGain * 1_000_000));
  // Exact positive half-up rounding matches PostgreSQL numeric.
  return Number((microGain * numerator + denominator / BigInt(2)) / denominator) / 1_000_000;
}
export function formatMorale(value: number) {
  return new Intl.NumberFormat(frontend.site.locale, {
    minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: "exceptZero",
  }).format(value);
}
export function formatMoraleBonus(morale: number, kind: "stats" | "training" = "stats") {
  return formatMoraleMultiplier(moraleMultiplier(morale, kind));
}
export function formatMoraleMultiplier(multiplier: number) {
  return new Intl.NumberFormat(frontend.site.locale, {
    style: "percent", maximumFractionDigits: 3, signDisplay: "exceptZero",
  }).format(multiplier - 1);
}
export type TavernReceipt = {
  kind: "crew_meal"; gold_cost: number; morale_before: number; morale_after: number;
  morale_gained: number; gold_coins: number; config_revision: string;
};
export type TavernResult = { message?: string; error?: boolean; retry?: boolean };
