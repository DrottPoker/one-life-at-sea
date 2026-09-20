"use server";

import { revalidatePath } from "next/cache";
import { requireCharacter } from "@/lib/player";
import { createClient } from "@/lib/supabase/server";
import { withDatabaseRetry } from "@/lib/database-retry";
import { isUuid } from "@/lib/validation";
import type { TravelResult } from "@/lib/sea-travel";

const errors: Record<string, string> = {
  INVALID_REQUEST: "Reload the page and choose a route.",
  REQUEST_CONFLICT: "This request has changed. Reload the page.",
  STALE_VOYAGE: "Your voyage has moved on. The latest position has been loaded.",
  STALE_ROUTE: "That route is no longer available. Choose from the current routes.",
  TRAVEL_ACTIVE: "You are already traveling. Wait until you arrive.",
  NOT_IN_HARBOR: "You have already left The Harbor.",
  NOT_AT_SEA: "You need to be at a sea location to sail onward.",
  NOT_ENOUGH_ENERGY: "You need more Energy to leave The Harbor.",
  SHIP_WORK_ACTIVE: "Your ship upgrade must finish before you can leave.",
  IN_COMBAT: "Finish your current battle before leaving.",
  IN_HOSPITAL: "You cannot travel while in hospital.",
  TRAVEL_LIMIT: "You cannot sail farther. Return to The Harbor.",
  SEA_CATALOG_UNAVAILABLE: "Routes are temporarily unavailable. Please try again later.",
  NOT_AUTHORIZED: "Please sign in again.",
};

export async function travelAction(form: FormData): Promise<TravelResult> {
  await requireCharacter({ allowHospital: true, allowSea: true });
  const choice = form.get("choice"), version = form.get("expected_version"), requestId = form.get("request_id");
  if (!isUuid(version) || !isUuid(requestId) || (choice !== "depart" && choice !== "return" && !isUuid(choice))) {
    return { error: true, message: errors.INVALID_REQUEST };
  }
  const client = await createClient();
  const args = { expected_version: version, request_id: requestId };
  const { data, error } = await withDatabaseRetry(() => choice === "depart" ? client.rpc("depart_harbor", args) :
    choice === "return" ? client.rpc("return_to_harbor", args) : client.rpc("choose_sea_route", { ...args, option_id: choice }));
  revalidatePath("/", "layout");
  if (error || !data) {
    const message = errors[error?.message ?? ""];
    return { error: true, retry: !message, message: message ?? "Departure could not be confirmed. Retry safely below." };
  }
  return { message: "Your journey has started." };
}
