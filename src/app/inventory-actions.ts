"use server";

import { revalidatePath } from "next/cache";
import { requireCharacter } from "@/lib/player";
import { createClient } from "@/lib/supabase/server";
import { withDatabaseRetry } from "@/lib/database-retry";
import { isUuid } from "@/lib/validation";
import { formatItemCount, isInventoryEntryType, parseItemQuantity, type TrashResult } from "@/lib/inventory";

const errors: Record<string, string> = {
  INVALID_REQUEST: "Please reload your inventory and try again.",
  INVALID_ITEM_TYPE: "That item could not be selected. Please reload your inventory.",
  INVALID_QUANTITY: "Enter a positive whole number of items.",
  INVALID_FILTER: "Please reload your inventory and try again.",
  REQUEST_CONFLICT: "This request has changed. Please close it and select the item again.",
  ITEM_NOT_FOUND: "That item is no longer in your inventory.",
  NOT_ENOUGH_ITEMS: "You no longer have that many items. Check the updated quantity.",
  IN_HOSPITAL: "You cannot destroy items while in hospital.",
  IN_COMBAT: "Finish your current fight before destroying items.",
  NOT_AUTHORIZED: "Please sign in again to use your inventory.",
};

export async function trashInventoryItem(form: FormData): Promise<TrashResult> {
  await requireCharacter({ allowHospital: true });
  const entryId = form.get("entry_id");
  const entryType = form.get("entry_type");
  const quantity = parseItemQuantity(form.get("quantity"));
  const requestId = form.get("request_id");
  if (!isUuid(entryId) || !isUuid(requestId) || !isInventoryEntryType(entryType) ||
      quantity === null || (entryType === "instance" && quantity !== 1)) {
    return { error: true, message: "Select an item and a valid whole number to destroy." };
  }
  const client = await createClient();
  const { data, error } = await withDatabaseRetry(() => client.rpc("trash_inventory_item", {
    entry_id: entryId, entry_type: entryType, quantity, request_id: requestId,
  }));
  revalidatePath("/(game)", "layout");
  if (error || !data) {
    const message = errors[error?.message ?? ""];
    return { error: true, retry: !message, message: message ??
      "The result could not be confirmed. Retry this action to check it safely." };
  }
  return { message: "Destroyed " + formatItemCount(data.quantity) + " × " + data.name + ".", receipt: data };
}
