"use server";

import { revalidatePath } from "next/cache";
import { requireCharacter } from "@/lib/player";
import { createClient } from "@/lib/supabase/server";
import { refusedByDatabase, withDatabaseRetry } from "@/lib/database-retry";
import { isMarketCommand, type MarketActionResult } from "@/lib/marketplace";
import { formatGold } from "@/lib/bank";
import { formatItemCount } from "@/lib/inventory";

const errors: Record<string, string> = {
  INVALID_REQUEST: "Select valid items and whole-number quantities and prices.",
  INVALID_BATCH: "Select at least one item within the listing batch limit.",
  INVALID_QUANTITY: "Enter a positive whole number of items.",
  INVALID_PRICE: "Enter a positive whole-number unit price within the Gold Coins limit.",
  DUPLICATE_ITEM: "Select each inventory entry only once.",
  REQUEST_CONFLICT: "This request has changed. Reload the market before trying again.",
  ITEM_NOT_FOUND: "An item is no longer in your inventory. Review the refreshed list.",
  ITEM_NOT_TRADABLE: "This item is not currently tradable.",
  ITEM_EQUIPPED: "Unequip this item before listing it.",
  NOT_ENOUGH_ITEMS: "You no longer have the selected quantity. Review your inventory.",
  LISTING_UNAVAILABLE: "This listing has sold out or was withdrawn.",
  NOT_ENOUGH_STOCK: "There are fewer items left. Review the available quantity.",
  PRICE_CHANGED: "The price has changed. Review the refreshed listing.",
  OWN_LISTING: "You cannot buy your own listing.",
  NOT_ENOUGH_GOLD: "You do not have enough carried Gold Coins. Withdraw money from the Bank first.",
  SELLER_BALANCE_LIMIT: "This seller cannot receive more Gold Coins. Try another listing.",
  ITEM_QUANTITY_LIMIT: "The recipient cannot hold more of this item.",
  IN_HOSPITAL: "Market actions are locked while in hospital.",
  NOT_IN_HARBOR: "Return to The Harbor to trade.",
  IN_COMBAT: "Market actions are locked during combat.",
  NOT_AUTHORIZED: "Please sign in again.",
};

export async function marketAction(command: unknown, characterId: string): Promise<MarketActionResult> {
  const character = await requireCharacter({ allowHospital: true, allowSea: true });
  if (character.id !== characterId) return { error: true, retry: true, message: "Your signed-in character changed. Sign back in to check this saved action." };
  if (!isMarketCommand(command)) return { error: true, message: errors.INVALID_REQUEST };
  const client = await createClient();
  const { data, error } = await withDatabaseRetry(() => {
    if (command.action === "create") return client.rpc("create_market_listings", { entries: command.entries, request_id: command.request_id });
    if (command.action === "buy") return client.rpc("buy_market_listing", {
      listing_id: command.listing_id, quantity: command.quantity, expected_unit_price: command.expected_unit_price, request_id: command.request_id,
    });
    return client.rpc("cancel_market_listing", { listing_id: command.listing_id, request_id: command.request_id });
  });
  revalidatePath("/", "layout");
  if (error || !data) {
    const message = errors[error?.message ?? ""] ?? refusedByDatabase(error);
    return { error: true, retry: !message, message: message ?? "The trade could not be confirmed. Retry safely to check the same request." };
  }
  const message = data.action === "create" ? data.listings.length + (data.listings.length === 1 ? " listing added." : " listings added.") :
    data.action === "buy" ? "Bought " + formatItemCount(data.quantity) + " for " + formatGold(data.gross) + " Gold Coins." :
    formatItemCount(data.quantity) + " returned to your inventory.";
  return { message, receipt: data };
}
