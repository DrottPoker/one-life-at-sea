"use server";

import { revalidatePath } from "next/cache";
import { requireCharacter } from "@/lib/player";
import { createClient } from "@/lib/supabase/server";
import { refusedByDatabase, withDatabaseRetry } from "@/lib/database-retry";
import { isUuid } from "@/lib/validation";
import { formatGold, isBankDirection, parseGoldAmount, type BankActionResult } from "@/lib/bank";

const errors: Record<string, string> = {
  INVALID_AMOUNT: "Enter a positive whole number of Gold Coins.",
  INVALID_DIRECTION: "Choose Deposit or Withdraw.",
  INVALID_REQUEST: "Please reload the bank and try again.",
  REQUEST_CONFLICT: "This transfer has changed. Please reload the bank.",
  NOT_ENOUGH_GOLD: "You do not have enough Gold Coins on your character.",
  NOT_ENOUGH_BANK_GOLD: "You do not have enough Gold Coins in the bank.",
  BALANCE_LIMIT: "That transfer would exceed the destination balance limit.",
  IN_HOSPITAL: "You cannot do this while in hospital.",
  IN_COMBAT: "Finish your current fight before using the bank.",
  NOT_IN_HARBOR: "Return to The Harbor to use the bank.",
  NOT_AUTHORIZED: "Please sign in again to use the bank.",
};

export async function transferGold(form: FormData, characterId: string): Promise<BankActionResult> {
  const character = await requireCharacter({ allowHospital: true, allowSea: true });
  if (character.id !== characterId) return { error: true, retry: true, message: "Your signed-in character changed. Sign back in to check this saved action." };
  const direction = form.get("direction");
  const amount = parseGoldAmount(form.get("amount"));
  const requestId = form.get("request_id");
  if (!isBankDirection(direction) || amount === null || !isUuid(requestId)) {
    return { error: true, message: "Enter a positive whole number and choose Deposit or Withdraw." };
  }
  const client = await createClient();
  const { data, error } = await withDatabaseRetry(() => client.rpc("transfer_gold", {
    direction, amount, request_id: requestId,
  }));
  revalidatePath("/(game)", "layout");
  if (error || !data) {
    const message = errors[error?.message ?? ""] ?? refusedByDatabase(error);
    return { error: true, retry: !message, message: message ??
      "The transfer could not be confirmed. Retry the same transfer to check it safely." };
  }
  return { message: (data.direction === "deposit" ? "Deposited " : "Withdrew ") + formatGold(data.amount) + " Gold Coins." };
}
