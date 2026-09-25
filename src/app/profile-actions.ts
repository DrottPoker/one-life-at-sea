"use server";

import { revalidatePath } from "next/cache";
import { requireCharacter } from "@/lib/player";
import { createClient } from "@/lib/supabase/server";
import { withDatabaseRetry } from "@/lib/database-retry";
import { isPortraitId } from "@/lib/portraits";

export type PortraitResult = { message?: string; saved?: string };

// Choosing a portrait is idempotent, so a retried request cannot change anything twice.
export async function choosePortrait(_previous: PortraitResult, form: FormData): Promise<PortraitResult> {
  await requireCharacter({ allowHospital: true, allowSea: true });
  const portrait = form.get("portrait");
  if (!isPortraitId(portrait)) return { message: "Choose one of the portraits." };
  const client = await createClient();
  const { error } = await withDatabaseRetry(() => client.rpc("set_portrait", { portrait_id: portrait }));
  revalidatePath("/", "layout");
  return error ? { message: "Your portrait could not be saved. Please try again." } : { saved: portrait };
}
