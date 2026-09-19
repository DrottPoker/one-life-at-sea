import { gameplay } from "@/config/public";
import type { Stat } from "@/lib/game";

export const COMBAT_COST = gameplay.combat.energyCost;
export const MAX_ROUNDS = gameplay.combat.maxRounds;
export const ORDERS = ["fire", "board", "crew_attack", "disengage", "retreat"] as const;
export type CombatOrder = typeof ORDERS[number];
export type DefenceOrder = "cannon" | "boarding";
export type CombatStats = Record<Stat, number>;
export type Combatant = {
  id: string; name: string; ship_health: number; crew_health: number;
  ammo: number | null; ship: CombatStats | null; crew: CombatStats | null;
  cannons: string | null; weapon: string | null;
};
export type AttackLock = { battle_id: string; target_id: string };
export type ParticipantStatus = "active" | "victory" | "assist" | "defeated" | "retreated" | "draw";
export type CombatOutcome = "hull_victory" | "boarding_victory" | "retreated" | "draw" | "defended";
export type CombatEvent = {
  kind: "started" | "joined" | "round" | "hospital" | "admin_end"; sequence: number; actor_id: string; actor_name: string;
  round: number; phase: "sea" | "boarding"; attacker_order: CombatOrder; defender_order: CombatOrder;
  attacker_hit: boolean; defender_hit: boolean; attacker_damage: number; defender_damage: number;
  transition: "boarded" | "boarding_failed" | "disengaged" | null;
  outcome: CombatOutcome | null; at: string; timed_out: boolean; participant_result: ParticipantStatus;
};
export type CombatPerson = {
  id: string; name: string; role: "attacker" | "defender"; status: ParticipantStatus | "survived";
  hits: number; damage: number; ship_damage: number; crew_damage: number; ship_health: number; crew_health: number; phase: "sea" | "boarding" | null;
};
export type Battle = {
  id: string; status: "active" | "completed"; phase: "sea" | "boarding"; round: number;
  outcome: CombatOutcome | null; winner_id: string | null; participant_status: ParticipantStatus;
  attacker: Combatant; defender: Combatant; viewer_id: string;
  started_at: string; deadline: string; finished_at: string | null; observed_at: string;
  events: CombatEvent[]; people: CombatPerson[];
};
export type CombatLog = Pick<Battle, "id" | "outcome" | "winner_id" | "started_at" | "finished_at" | "events" | "people"> & {
  defender_id: string; defender_name: string;
};
export type CombatPreview = {
  attacker: Combatant; defender: Combatant; energy: number; can_start: boolean;
  reason: string | null; active_combat_id: string | null; join_combat_id: string | null;
  target_protected_until: string | null; observed_at: string;
};
export type CombatError = { error: string };
export type CombatResponse = { battle: Battle } | CombatError;
export type CombatActionResult = { message?: string; battleId?: string };
export const ORDER_LABELS: Record<CombatOrder, string> = {
  fire: "Fire cannons", board: "Board", crew_attack: "Crew attack",
  disengage: "Disengage", retreat: "Retreat",
};
const ERROR_MESSAGES: Record<string, string> = {
  IN_HOSPITAL: "You cannot fight while in hospital.",
  TARGET_IN_HOSPITAL: "This captain is in hospital.",
  SELF_ATTACK: "You cannot attack your own character.",
  IN_COMBAT: "Finish your current fight before starting another.",
  DEFENDING: "Your crew is defending against an attack. You can start another encounter once it ends.",
  ALREADY_PARTICIPATED: "You have already left this encounter and cannot rejoin it.",
  TARGET_IN_COMBAT: "This captain is currently attacking another ship.",
  TARGET_PROTECTED: "This captain is protected from incoming attacks.",
  NO_HEALTH: `You need at least ${gameplay.combat.minimumHealth} Ship Health and ${gameplay.combat.minimumHealth} Crew Health to attack.`,
  TARGET_NO_HEALTH: `This captain needs to recover at least ${gameplay.combat.minimumHealth} Ship Health and ${gameplay.combat.minimumHealth} Crew Health.`,
  NOT_ENOUGH_ENERGY: `You need ${COMBAT_COST} Energy to start or join a fight.`,
  CHARACTER_NOT_FOUND: "This captain could not be found.",
  COMBAT_NOT_FOUND: "This fight is not available to you.",
  NO_AMMO: "No salvos left. You can board or retreat.",
  STALE_ROUND: "The fight has moved on. The latest round has been loaded.",
  INVALID_ORDER: "Choose an order available in the current phase.",
  REQUEST_CONFLICT: "This order was already submitted. Reload the fight before continuing.",
  COMBAT_BUSY: "Another action is being saved. Please try again.",
};
export function combatError(code: string) {
  return ERROR_MESSAGES[code] ?? "The action could not be saved. Reload the fight to check its latest state.";
}
export function attackUrl(targetId: string) {
  return "/attack/" + targetId;
}
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
export function isCombatOrder(value: unknown): value is CombatOrder {
  return typeof value === "string" && ORDERS.some(order => order === value);
}
