"use server";

import { revalidatePath } from "next/cache";
import { requireCharacter } from "@/lib/player";
import { createClient } from "@/lib/supabase/server";
import { withDatabaseRetry } from "@/lib/database-retry";
import { isUuid } from "@/lib/validation";
import { isStat, isTrainingGroup, STAT_LABELS } from "@/lib/game";
import { formatGold } from "@/lib/bank";
import { formatStat } from "@/lib/format";
import { parseShipEnergy, type TrainingResult } from "@/lib/training";

const errors: Record<string, string> = {
  INVALID_REQUEST: "Reload the page and try again.",
  REQUEST_CONFLICT: "This request has changed. Reload the page.",
  INVALID_GROUP: "Choose Crew or Ship.",
  INVALID_STAT: "Choose a valid stat.",
  INVALID_ENERGY: "Choose an available whole Energy amount.",
  INVALID_TIER: "Only the next tier can be purchased.",
  STALE_TIER: "Your training tier changed. Please try again with the updated tier.",
  NOT_ENOUGH_XP: "Keep training to unlock this tier.",
  NOT_ENOUGH_GOLD: "You need more Gold Coins on your character. Withdraw stored coins from the bank.",
  NOT_ENOUGH_ENERGY: "You do not have enough Energy for this action.",
  SHIP_WORK_ACTIVE: "Your ship already has work in progress.",
  PROGRESSION_LIMIT: "This action would exceed the progression limit.",
  IN_HOSPITAL: "You cannot do this while in hospital.",
  IN_COMBAT: "Finish your current fight before training or purchasing a tier.",
  NOT_IN_HARBOR: "Return to The Harbor to train.",
  NOT_AUTHORIZED: "Please sign in again.",
};

export async function trainingAction(form: FormData): Promise<TrainingResult> {
  await requireCharacter();
  const action = form.get("action"), stat = form.get("stat"), group = form.get("group");
  const tier = form.get("tier_id"), energy = parseShipEnergy(form.get("energy_amount")), requestId = form.get("request_id");
  if (!isUuid(requestId) || typeof tier !== "string" || !tier) return { error: true, message: errors.INVALID_REQUEST };
  const client = await createClient();
  const call = () => {
    if (action === "crew" && isStat(stat)) return client.rpc("train_crew", { stat, expected_tier_id: tier, request_id: requestId });
    if (action === "ship" && isStat(stat) && energy !== null) return client.rpc("start_ship_upgrade", {
      stat, energy_amount: energy, expected_workshop_id: tier, request_id: requestId,
    });
    if (action === "purchase" && isTrainingGroup(group)) return client.rpc("purchase_training_tier", {
      training_group: group, tier_id: tier, request_id: requestId,
    });
    return null;
  };
  if (!["crew", "ship", "purchase"].includes(String(action)) ||
    (action === "purchase" ? !isTrainingGroup(group) : !isStat(stat)) ||
    (action === "ship" && energy === null)) return { error: true, message: errors.INVALID_REQUEST };
  const response = await withDatabaseRetry(() => call()!);
  revalidatePath("/(game)", "layout");
  const { data, error } = response;
  if (error || !data) {
    const message = errors[error?.message ?? ""];
    return { error: true, retry: !message, message: message ?? "The action could not be confirmed. Retry it safely below." };
  }
  if (data.kind === "purchase") return { message: data.tier_name + " purchased for " + formatGold(data.gold_cost) + " Gold Coins." };
  if (data.kind === "ship") return { message: "Work started. Ship " + STAT_LABELS[data.stat] + " +" + formatStat(data.stat_gain) +
    " when complete." };
  return { message: (data.perfect ? "Perfect Drill! " : "") + "Crew " + STAT_LABELS[data.stat] + " +" + formatGold(data.stat_gain) +
    ". Spent " + data.energy_cost + " Energy." };
}
