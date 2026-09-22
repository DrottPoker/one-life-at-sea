"use server";

import { revalidatePath } from "next/cache";
import { requireCharacter } from "@/lib/player";
import { createClient } from "@/lib/supabase/server";
import { withDatabaseRetry } from "@/lib/database-retry";
import { isUuid } from "@/lib/validation";
import { craftingMessage, parseCraftingForm, type CraftingResult } from "@/lib/crafting";

const errors: Record<string, string> = {
  INVALID_REQUEST: "Reload Crafting and try again.",
  INVALID_RECIPE: "This recipe is no longer available. Reload Crafting.",
  RECIPE_UNAVAILABLE: "The materials for this recipe are temporarily unavailable.",
  REQUEST_CONFLICT: "This saved request has changed. Reload Crafting.",
  STALE_OFFER: "The recipe changed. Review its materials and try again.",
  INSUFFICIENT_MATERIALS: "You do not have enough materials for this recipe.",
  SKILL_XP_LIMIT: "Crafting XP storage is full. No materials were used.",
  INVENTORY_FULL: "There is no room in your item stack. No materials were used.",
  IN_HOSPITAL: "You cannot craft while in hospital.",
  IN_COMBAT: "Finish your current fight before crafting.",
  NOT_IN_HARBOR: "Return to your hideout in The Harbor to craft.",
  NOT_AUTHORIZED: "Please sign in again.",
  UNAUTHORIZED: "Please sign in again.",
};

export async function craftItem(form: FormData, characterId: string): Promise<CraftingResult> {
  const character = await requireCharacter({ allowHospital: true, allowSea: true });
  if (character.id !== characterId) return { error: true, retry: true, message: "Your signed-in character changed. Sign back in to check this saved action." };
  const requestId = form.get("request_id"), values = parseCraftingForm(form);
  if (!isUuid(requestId) || !values) return { error: true, message: errors.INVALID_REQUEST };
  const client = await createClient();
  const { data, error } = await withDatabaseRetry(() => client.rpc("craft_item", { ...values, request_id: requestId }));
  revalidatePath("/(game)", "layout");
  if (error || !data) {
    const message = errors[error?.message ?? ""];
    return { error: true, retry: !message, recipe_id: values.recipe_id, message: message ?? "Crafting could not be confirmed. Check the saved action safely." };
  }
  return { recipe_id: data.recipe_id, receipt: data, message: craftingMessage(data) };
}
