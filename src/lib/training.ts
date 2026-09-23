import { gameplay } from "@/config/public";
import { applyTrainingMorale } from "@/lib/morale";
import type { Stat, TrainingGroup } from "@/lib/game";

type TrainingProgress = { xp: number; tier_id: string };
export type ShipJob = {
  id: string; stat: Stat; size_id: string | null; workshop_id: string; workshop_name: string;
  energy_cost: number; stat_gain: number; xp_gain: number;
  started_at: string; finishes_at: string; applied_at: string | null;
};
export type TrainingState = {
  progress: Record<TrainingGroup, TrainingProgress>;
  ship_job: ShipJob | null;
  last_ship_job: ShipJob | null;
};
export type TrainingReceipt =
  | { kind: "crew"; stat: Stat; stat_gain: number; xp_gain: number; energy_cost: number; perfect: boolean; tier_id: string; morale_before?: number; morale_after?: number; morale_multiplier?: number; base_gain?: number; normal_gain?: number; stat_before?: number }
  | { kind: "ship"; job_id: string; stat: Stat; stat_gain: number; xp_gain: number; energy_cost: number; finishes_at: string }
  | { kind: "purchase"; group: TrainingGroup; tier_id: string; tier_name: string; gold_cost: number };
export type TrainingResult = { message?: string; error?: boolean; retry?: boolean; receipt?: TrainingReceipt };
export function trainingTiers(group: TrainingGroup) {
  return group === "crew" ? gameplay.training.crewTiers : gameplay.training.shipTiers;
}
export function trainingTier(group: TrainingGroup, id: string) {
  const tier = trainingTiers(group).find(t => t.id === id);
  if (!tier) throw new Error("Training catalog is out of date. Reload the page.");
  return tier;
}

export function crewTrainingStatGain(stat: number, efficiency: number, energy: number, morale: number) {
  return applyTrainingMorale(trainingStatGain(stat, efficiency, energy), morale);
}

export function parseShipEnergy(value: unknown): number | null {
  if (typeof value !== "string" || !/^[0-9]{1,10}$/.test(value)) return null;
  const amount = Number(value);
  return Number.isSafeInteger(amount) && amount >= gameplay.training.shipMinEnergy && amount <= gameplay.resources.energyStorageMax ? amount : null;
}

/**
 * UI estimate of the server's six-decimal, per-Energy calculation.
 * PostgreSQL numeric values and the saved receipt are authoritative.
 */
export function trainingStatGain(stat: number, efficiency: number, energy: number): number {
  if (!Number.isFinite(stat) || stat < 1 || stat > Number.MAX_SAFE_INTEGER ||
    !Number.isFinite(efficiency) || efficiency <= 0 || efficiency > 1000 ||
    !Number.isSafeInteger(energy) || energy < 1 || energy > gameplay.resources.energyStorageMax) {
    throw new RangeError("Invalid training input.");
  }
  let gain = 0;
  for (let unit = 0; unit < energy; unit++) {
    const unitGain = Math.round(efficiency / gameplay.training.energyPerUnit *
      (1 + (stat + gain) / gameplay.training.statScale) ** gameplay.training.statExponent * 1_000_000);
    gain = Math.round(gain * 1_000_000 + unitGain) / 1_000_000;
  }
  return gain;
}
