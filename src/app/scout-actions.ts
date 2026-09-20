"use server";

import { revalidatePath } from "next/cache";
import { gameplay } from "@/config/public";
import { requireCharacter } from "@/lib/player";
import { createClient } from "@/lib/supabase/server";
import { withDatabaseRetry } from "@/lib/database-retry";
import { isUuid } from "@/lib/validation";
import type { ScoutActionResult } from "@/lib/sea-scouting";

const errors: Record<string, string> = {
  INVALID_REQUEST: "Reload the page before scouting.",
  REQUEST_CONFLICT: "This request has changed. Reload the page.",
  STALE_VOYAGE: "Your voyage has moved on. Scout from your current location.",
  NOT_AT_SEA: "Arrive at a sea location before scouting.",
  IN_HOSPITAL: "You cannot scout while in hospital.",
  IN_COMBAT: "Finish your current battle before scouting.",
  NOT_ENOUGH_ENERGY: "You need " + gameplay.seaTravel.scoutEnergyCost + " Energy to scout.",
  NOT_AUTHORIZED: "Please sign in again.",
};

export async function scoutAction(form: FormData): Promise<ScoutActionResult> {
  await requireCharacter({ allowHospital: true, allowSea: true });
  const version = form.get("expected_version"), requestId = form.get("request_id");
  if (!isUuid(version) || !isUuid(requestId)) return { error: true, message: errors.INVALID_REQUEST };
  const client = await createClient();
  const { data, error } = await withDatabaseRetry(() => client.rpc("scout_nearby_ships", { expected_version: version, request_id: requestId }));
  revalidatePath("/", "layout");
  if (error || !data) {
    const message = errors[error?.message ?? ""];
    return { error: true, retry: !message, message: message ?? "Scouting could not be confirmed. Retry safely below." };
  }
  return { message: "Scouting complete. " + data.total + (data.total === 1 ? " ship found." : " ships found.") };
}
