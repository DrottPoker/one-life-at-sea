"use server";

import { revalidatePath } from "next/cache";
import { requireCharacter } from "@/lib/player";
import { createClient } from "@/lib/supabase/server";
import { withDatabaseRetry } from "@/lib/database-retry";
import { isUuid } from "@/lib/validation";
import { activityMessage, parseActivityForm, type ActivityResult } from "@/lib/activities";

const errors: Record<string, string> = {
  LOOT_UNAVAILABLE: "The loot for this activity is temporarily unavailable. No Stamina was spent.",
  INVENTORY_FULL: "There is no room in your item stack. No Stamina was spent.",
  INVALID_REQUEST: "Reload Activities and try again.",
  INVALID_ACTIVITY: "This activity is no longer available. Reload Activities.",
  REQUEST_CONFLICT: "This saved request has changed. Reload Activities.",
  STALE_OFFER: "The activity cost or XP reward changed. Reload Activities before trying again.",
  INSUFFICIENT_STAMINA: "You need more Stamina for this activity.",
  SKILL_XP_LIMIT: "This skill has reached the maximum stored XP.",
  IN_HOSPITAL: "You cannot do activities while in hospital.",
  IN_COMBAT: "Finish your current fight before doing activities.",
  NOT_IN_HARBOR: "Return to The Harbor to do these activities.",
  NOT_AUTHORIZED: "Please sign in again.",
  UNAUTHORIZED: "Please sign in again.",
};

export async function performActivity(form: FormData, characterId: string): Promise<ActivityResult> {
  const character = await requireCharacter({ allowHospital: true, allowSea: true });
  if (character.id !== characterId) return { error: true, retry: true, message: "Your signed-in character changed. Sign back in to check this saved action." };
  const requestId = form.get("request_id"), values = parseActivityForm(form);
  if (!isUuid(requestId) || !values) return { error: true, message: errors.INVALID_REQUEST };
  const client = await createClient();
  const { data, error } = await withDatabaseRetry(() => client.rpc("perform_activity", { ...values, request_id: requestId }));
  revalidatePath("/(game)", "layout");
  if (error || !data) {
    const message = errors[error?.message ?? ""];
    return { error: true, retry: !message, activity_id: values.activity_id, message: message ?? "The activity could not be confirmed. Check the saved action safely." };
  }
  return { activity_id: data.activity_id, receipt: data, message: activityMessage(data) };
}
