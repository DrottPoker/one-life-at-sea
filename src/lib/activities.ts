import { gameplay } from "@/config/public";

export type ActivityReceipt = {
  activity_id: string; skill_id: string; stamina_cost: number; stamina_after: number;
  xp_awarded: number; xp: number; previous_level: number; level: number; character_level: number;
  config_revision: string;
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

export function activityMessage(receipt: ActivityReceipt) {
  const skill = gameplay.skills.catalog.find(entry => entry.id === receipt.skill_id)?.name ?? "Skill";
  const loot = receipt.loot ? receipt.loot.caught ? "Caught " + receipt.loot.quantity + " × " + receipt.loot.name + ". " : "Nothing caught. " : "";
  return loot + "+" + receipt.xp_awarded + " " + skill + " XP. Spent " + receipt.stamina_cost + " Stamina." +
    (receipt.level > receipt.previous_level ? " " + skill + " reached level " + receipt.level + "!" : "");
}
