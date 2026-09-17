export const MAX_RESOURCE = 100;
export const TRAINING_COST = 5;
export const STATS = ["attack", "defense", "speed", "accuracy"] as const;
export type Stat = typeof STATS[number];
export type TrainingGroup = "crew" | "ship";
export type GameState = Record<`${TrainingGroup}_${Stat}`, number> & {
  energy: number;
  energy_next_at: string | null;
  observed_at: string;
  ship_health: number;
  crew_health: number;
  health_next_at: string | null;
  active_combat_id: string | null;
  active_attack: import("@/lib/combat").AttackLock | null;
  last_combat_id: string | null;
  combat_next_at: string | null;
  defence_order: "cannon" | "boarding";
  protected_until: string | null;
};
export type TrainingResult = { message?: string; error?: boolean };

export const STAT_LABELS: Record<Stat, string> = {
  attack: "Attack", defense: "Defense", speed: "Speed", accuracy: "Accuracy",
};

export function isTrainingGroup(value: unknown): value is TrainingGroup {
  return value === "crew" || value === "ship";
}

export function isStat(value: unknown): value is Stat {
  return typeof value === "string" && STATS.some(stat => stat === value);
}
