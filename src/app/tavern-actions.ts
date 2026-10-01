"use server";

import { revalidatePath } from "next/cache";
import { requireCharacter } from "@/lib/player";
import { createClient } from "@/lib/supabase/server";
import { refusedByDatabase, withDatabaseRetry } from "@/lib/database-retry";
import { isUuid } from "@/lib/validation";
import { formatGold, parseGoldAmount } from "@/lib/bank";
import { formatMorale, type TavernResult } from "@/lib/morale";

const errors: Record<string, string> = {
  INVALID_REQUEST: "Reload the tavern and try again.",
  REQUEST_CONFLICT: "This saved meal request has changed. Reload the tavern.",
  STALE_OFFER: "The meal offer changed. Reload the tavern before ordering.",
  MORALE_FULL: "Your crew's morale is already at its maximum.",
  NOT_ENOUGH_GOLD: "You need more Gold Coins on your character. Withdraw stored coins from the bank.",
  IN_HOSPITAL: "You cannot visit the tavern while in hospital.",
  IN_COMBAT: "Finish your current fight before visiting the tavern.",
  NOT_IN_HARBOR: "Return to The Harbor to visit the tavern.",
  NOT_AUTHORIZED: "Please sign in again.",
};
export async function buyTavernMeal(form: FormData, characterId: string): Promise<TavernResult> {
  const character = await requireCharacter({ allowHospital: true, allowSea: true });
  if (character.id !== characterId) return { error: true, retry: true, message: "Your signed-in character changed. Sign back in to check this saved action." };
  const requestId = form.get("request_id"), coins = parseGoldAmount(form.get("gold_cost")), gain = form.get("morale_gain");
  if (!isUuid(requestId) || coins === null || typeof gain !== "string" || !/^[0-9]+(?:\.[0-9])?$/.test(gain) ||
    !Number.isFinite(Number(gain)) || Number(gain) <= 0 || Number(gain) > 200) return { error: true, message: errors.INVALID_REQUEST };
  const client = await createClient();
  const { data, error } = await withDatabaseRetry(() => client.rpc("buy_tavern_meal", {
    expected_gold_cost: coins, expected_morale_gain: Number(gain), request_id: requestId,
  }));
  revalidatePath("/(game)", "layout");
  if (error || !data) {
    const message = errors[error?.message ?? ""] ?? refusedByDatabase(error);
    return { error: true, retry: !message, message: message ?? "The meal could not be confirmed. Retry the saved meal safely." };
  }
  return { message: "Crew meal served. Morale " + formatMorale(data.morale_gained) + ". Spent " + formatGold(data.gold_cost) + " Gold Coins." };
}
