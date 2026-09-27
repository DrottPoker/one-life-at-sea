import { DEFAULT_ITEM_IMAGE } from "@/lib/loot";
import { formatGold } from "@/lib/bank";
import { gameplay } from "@/config/public";

export type ActivityItemReward = { item_id: string; name: string; image_path: string; quantity: number };
export type ActivityRewards = { items: ActivityItemReward[]; gold_coins: number };

export type ActivityReceipt = {
  activity_id: string; skill_id: string; stamina_cost: number; stamina_after: number;
  xp_awarded: number; xp: number; previous_level: number; level: number; character_level: number;
  config_revision: string;
  outcome?: "success" | "failure";
  rewards?: { items?: ActivityItemReward[]; gold_coins?: number };
  loot?: { caught: boolean; table_id: string; table_version: string; skill_level: number; success_chance: number; item_id?: string; name?: string; image_path?: string; quantity?: number } | null;
};
export type ActivityResult = { message?: string; error?: boolean; retry?: boolean; activity_id?: string; receipt?: ActivityReceipt };

export function parseActivityForm(form: FormData) {
  const activity = form.get("activity_id"), stamina = form.get("stamina_cost"), xp = form.get("xp_gain");
  if (typeof activity !== "string" || !/^[a-z][a-z0-9_]{0,47}$/.test(activity)) return null;
  const number = (value: FormDataEntryValue | null) => typeof value === "string" && /^[1-9][0-9]{0,15}$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : null;
  const staminaCost = number(stamina), xpGain = number(xp);
  if (staminaCost === null || staminaCost > 2147483647 || xpGain === null) return null;
  return { activity_id: activity, expected_stamina_cost: staminaCost, expected_xp_gain: xpGain };
}

// Mirrors perform_activity: a missed loot roll grants a share of the XP, rounded down but at least 1.
// Split at 100 so the product stays within safe integers.
export function activityFailureXp(xpGain: number, percent = gameplay.activities.failureXpPercent) {
  return Math.max(1, Math.floor(xpGain / 100) * percent + Math.floor(xpGain % 100 * percent / 100));
}

export function activityOutcome(receipt: ActivityReceipt) {
  return receipt.outcome ?? (receipt.loot?.caught === false ? "failure" : "success");
}

export function activityRewards(receipt: ActivityReceipt): ActivityRewards {
  if (activityOutcome(receipt) === "failure") return { items: [], gold_coins: 0 };
  if (receipt.rewards) return { items: receipt.rewards.items ?? [], gold_coins: receipt.rewards.gold_coins ?? 0 };
  const loot = receipt.loot;
  return { items: loot?.caught && loot.name && loot.quantity ? [{
    item_id: loot.item_id ?? "legacy_item", name: loot.name, image_path: loot.image_path || DEFAULT_ITEM_IMAGE, quantity: loot.quantity,
  }] : [], gold_coins: 0 };
}

// Awarded XP and level-ups show in the shared XP drop; the result keeps the activity's own cost.
export function activityCostMessage(receipt: ActivityReceipt) {
  return "Spent " + receipt.stamina_cost + " Stamina.";
}

export function activityMessage(receipt: ActivityReceipt) {
  const rewards = activityRewards(receipt);
  const items = rewards.items.map(item => item.quantity + " × " + item.name).join(", ");
  const loot = activityOutcome(receipt) === "failure" ? "Nothing caught. " : items ? (receipt.rewards ? "Received " : "Caught ") + items + ". " : "";
  const gold = rewards.gold_coins > 0 ? "+" + formatGold(rewards.gold_coins) + " Gold Coins. " : "";
  return loot + gold + activityCostMessage(receipt);
}
