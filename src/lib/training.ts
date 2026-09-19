import { gameplay } from "@/config/public";
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
  | { kind: "crew"; stat: Stat; stat_gain: number; xp_gain: number; energy_cost: number; perfect: boolean; tier_id: string }
  | { kind: "ship"; job_id: string; stat: Stat; stat_gain: number; xp_gain: number; energy_cost: number; finishes_at: string }
  | { kind: "purchase"; group: TrainingGroup; tier_id: string; tier_name: string; gold_cost: number };
export type TrainingResult = { message?: string; error?: boolean; retry?: boolean };
export function trainingTiers(group: TrainingGroup) {
  return group === "crew" ? gameplay.training.crewTiers : gameplay.training.shipTiers;
}
export function trainingTier(group: TrainingGroup, id: string) {
  const tier = trainingTiers(group).find(t => t.id === id);
  if (!tier) throw new Error("Training catalog is out of date. Reload the page.");
  return tier;
}

export function parseShipEnergy(value: unknown): number | null {
  if (typeof value !== "string" || !/^[0-9]{1,10}$/.test(value)) return null;
  const amount = Number(value);
  return Number.isSafeInteger(amount) && amount >= gameplay.training.shipMinEnergy && amount <= gameplay.resources.energyMax ? amount : null;
}

export function shipStatGain(baseGain: number, energy: number): number {
  return Math.round(baseGain * 1_000_000 / gameplay.training.shipEnergyPerUnit) * energy / 1_000_000;
}
