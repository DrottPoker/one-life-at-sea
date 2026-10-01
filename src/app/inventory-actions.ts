"use server";

import { revalidatePath } from "next/cache";
import { requireCharacter } from "@/lib/player";
import { createClient } from "@/lib/supabase/server";
import { refusedByDatabase, withDatabaseRetry } from "@/lib/database-retry";
import { isUuid } from "@/lib/validation";
import { formatItemCount, isInventoryEntryType, parseItemQuantity, type TrashResult } from "@/lib/inventory";
import { isEquipSlot, type EquipReceipt, type EquipResult } from "@/lib/equipment";

const errors: Record<string, string> = {
  INVALID_REQUEST: "Please reload your inventory and try again.",
  INVALID_ITEM_TYPE: "That item could not be selected. Please reload your inventory.",
  INVALID_QUANTITY: "Enter a positive whole number of items.",
  INVALID_FILTER: "Please reload your inventory and try again.",
  REQUEST_CONFLICT: "This request has changed. Please close it and select the item again.",
  ITEM_NOT_FOUND: "That item is no longer in your inventory.",
  NOT_ENOUGH_ITEMS: "You no longer have that many items. Check the updated quantity.",
  IN_HOSPITAL: "You cannot destroy items while in hospital.",
  NOT_IN_HARBOR: "Return to The Harbor to destroy items.",
  IN_COMBAT: "Finish your current fight before destroying items.",
  NOT_AUTHORIZED: "Please sign in again to use your inventory.",
  ITEM_EQUIPPED: "Unequip this item first.",
  NOT_EQUIPPED: "That slot is already empty.",
  INVALID_SLOT: "Choose a valid equipment slot.",
  NOT_EQUIPPABLE: "This item cannot be equipped.",
};
const equipBlocked: Record<string, string> = {
  IN_HOSPITAL: "You cannot change equipment while in hospital.",
  NOT_IN_HARBOR: "Return to The Harbor to change equipment.",
  IN_COMBAT: "Finish your current fight before changing equipment.",
};

export async function trashInventoryItem(form: FormData, characterId: string): Promise<TrashResult> {
  const character = await requireCharacter({ allowHospital: true, allowSea: true });
  if (character.id !== characterId) return { error: true, retry: true, message: "Your signed-in character changed. Sign back in to check this saved action." };
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
    const message = errors[error?.message ?? ""] ?? refusedByDatabase(error);
    return { error: true, retry: !message, message: message ??
      "The result could not be confirmed. Retry this action to check it safely." };
  }
  return { message: "Destroyed " + formatItemCount(data.quantity) + " × " + data.name + ".", receipt: data };
}

function equipmentOutcome({ data, error }: { data: EquipReceipt | null; error: { message: string; code?: string } | null }): EquipResult {
  if (error || !data) {
    const message = equipBlocked[error?.message ?? ""] ?? errors[error?.message ?? ""] ?? refusedByDatabase(error);
    return { error: true, retry: !message, message: message ?? "The result could not be confirmed. Retry this action to check it safely." };
  }
  return { message: (data.action === "equip" ? "Equipped " : "Unequipped ") + data.name + ".", receipt: data };
}
const changedCharacter: EquipResult = { error: true, retry: true, message: "Your signed-in character changed. Sign back in to check this saved action." };

export async function equipItem(entryId: string, requestId: string, characterId: string): Promise<EquipResult> {
  const character = await requireCharacter({ allowHospital: true, allowSea: true });
  if (character.id !== characterId) return changedCharacter;
  if (!isUuid(entryId) || !isUuid(requestId)) return { error: true, message: "Select an item to equip." };
  const client = await createClient();
  const response = await withDatabaseRetry(() => client.rpc("equip_item", { entry_id: entryId, request_id: requestId }));
  revalidatePath("/(game)", "layout");
  return equipmentOutcome(response);
}

export async function unequipItem(slot: string, requestId: string, characterId: string): Promise<EquipResult> {
  const character = await requireCharacter({ allowHospital: true, allowSea: true });
  if (character.id !== characterId) return changedCharacter;
  if (!isEquipSlot(slot) || !isUuid(requestId)) return { error: true, message: "Choose a valid equipment slot." };
  const client = await createClient();
  const response = await withDatabaseRetry(() => client.rpc("unequip_item", { equipment_slot: slot, request_id: requestId }));
  revalidatePath("/(game)", "layout");
  return equipmentOutcome(response);
}
