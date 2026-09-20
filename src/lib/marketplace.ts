import { gameplay } from "@/config/public";
import { isUuid } from "@/lib/validation";
import { inventoryFilters, isInventoryEntryType, type InventoryEntry, type InventoryEntryType, type InventoryFilters } from "@/lib/inventory";
import type { GameState } from "@/lib/game";

export const MARKET_PATH = "/harbor/marketplace";
export type MarketMode = "browse" | "add" | "listings";
export type MarketItem = Pick<InventoryEntry, "item_id" | "name" | "category_id" | "kind" | "description" | "effect_description" | "image_path" | "circulation" | "market_value"> & {
  minimum_price: number | null; available: string; sold: string;
};
export type MarketPage<T> = { items: T[]; total: number; page: number; page_size: number; observed_at: string };
export type MarketListing = Pick<InventoryEntry, "id" | "entry_type" | "item_id" | "quantity" | "name" | "image_path" | "kind" | "category_id" | "stats"> & {
  seller_id: string; seller_name: string; is_own: boolean; unit_price: number; fee_bps: number; created_at: string; tradable: boolean;
};
export type SaleEntry = { entry_id: string; entry_type: InventoryEntryType; quantity: number; unit_price: number };
export type MarketOperation = { action: "create"; entries: SaleEntry[] } |
  { action: "buy"; listing_id: string; quantity: number; expected_unit_price: number } | { action: "cancel"; listing_id: string };
export type MarketCommand = MarketOperation & { request_id: string };
export type MarketReceipt = { action: "create"; listings: { id: string; item_id: string; name: string; quantity: number; unit_price: number }[] } |
  { action: "buy"; listing_id: string; item_id: string; quantity: number; unit_price: number; gross: number; fee: number; remaining: number } |
  { action: "cancel"; listing_id: string; item_id: string; quantity: number };
export type MarketActionResult = { message?: string; error?: boolean; retry?: boolean; receipt?: MarketReceipt };

export function marketHref(mode: MarketMode = "browse", category: string | null = null, query = "", page = 0) {
  const params = new URLSearchParams();
  if (category) params.set("category", category);
  if (query.trim()) params.set("q", query.trim());
  if (page > 0) params.set("page", String(page));
  return MARKET_PATH + (mode === "browse" ? "" : "/" + mode) + (params.size ? "?" + params.toString() : "");
}
export const marketFilters = (params: Record<string, string | string[] | undefined>): InventoryFilters => inventoryFilters(params);

export function marketCost(quantity: number, price: number): number | null {
  if (!Number.isSafeInteger(quantity) || quantity < 1 || !Number.isSafeInteger(price) || price < 1) return null;
  const total = BigInt(quantity) * BigInt(price);
  return total <= BigInt(gameplay.economy.maxGoldCoins) ? Number(total) : null;
}
export function marketFee(gross: number, basisPoints = gameplay.marketplace.feeBps) {
  return Number(BigInt(gross) * BigInt(basisPoints) / 10_000n);
}
export function affordableQuantity(gold: number, price: number, stock: number) {
  return Math.min(stock, Number(BigInt(gold) / BigInt(price)));
}
export function isMarketCommand(input: unknown): input is MarketCommand {
  if (!input || typeof input !== "object") return false;
  const c = input as Record<string, unknown>;
  if (!isUuid(c.request_id)) return false;
  if (c.action === "cancel") return isUuid(c.listing_id);
  if (c.action === "buy") return isUuid(c.listing_id) && typeof c.quantity === "number" && typeof c.expected_unit_price === "number" &&
    marketCost(c.quantity, c.expected_unit_price) !== null;
  if (c.action !== "create" || !Array.isArray(c.entries) || !c.entries.length || c.entries.length > gameplay.marketplace.maxBatchSize) return false;
  const seen = new Set<string>();
  return c.entries.every(value => {
    if (!value || typeof value !== "object") return false;
    const e = value as Record<string, unknown>;
    if (!isUuid(e.entry_id) || !isInventoryEntryType(e.entry_type) || typeof e.quantity !== "number" || typeof e.unit_price !== "number" ||
      marketCost(e.quantity, e.unit_price) === null || (e.entry_type === "instance" && e.quantity !== 1)) return false;
    const key = e.entry_type + "-" + e.entry_id.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
export function marketBlockedReason(state: GameState): string | null {
  return state.active_combat_id ? "Market actions are locked during combat." :
    state.hospital_until ? "Market actions are locked while in hospital." :
    state.sea.state !== "in_harbor" ? "Return to The Harbor to trade." : null;
}
